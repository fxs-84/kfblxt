import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosisRepository, findDiagnosisByEncounter, type DiagnosisInput } from "./diagnosis.repository";
import { getSession } from "../../lib/session";
import { hasSupabaseConfig } from "../../lib/supabase";
import { findDiagnosisByEncounterDual, createDiagnosisDual, updateDiagnosisDual } from "./diagnosis-supabase";
import { findEncounterByIdDual } from "../encounters/encounter-supabase";

export function useDiagnosis(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["diagnosis", encounterId],
    queryFn: () => hasSupabaseConfig()
      ? findDiagnosisByEncounterDual(encounterId as string)
      : findDiagnosisByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useAllDiagnoses() {
  return useQuery({
    queryKey: ["diagnosis", "all"],
    queryFn: () => diagnosisRepository.findAll(),
  });
}

/** 按 encounterId 索引诊断,一次查询拿到所有 encounter 的诊断状态 */
export function useDiagnosisByEncounterMap(): Map<string, {
  id: string;
  levels: string[];
  mechanisms: string[];
  side: string;
  reasoning: string;
  clinicalDiagnoses: { code: string; name: string; isPrimary: boolean }[];
}> {
  const { data: all = [] } = useAllDiagnoses();
  const map = new Map<string, {
    id: string;
    levels: string[];
    mechanisms: string[];
    side: string;
    reasoning: string;
    clinicalDiagnoses: { code: string; name: string; isPrimary: boolean }[];
  }>();
  const sorted = [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const d of sorted) {
    if (!map.has(d.encounterId)) {
      map.set(d.encounterId, {
        id: d.id,
        levels: d.levels,
        mechanisms: d.mechanisms,
        side: d.side,
        reasoning: d.reasoning ?? "",
        clinicalDiagnoses: d.clinicalDiagnoses ?? [],
      });
    }
  }
  return map;
}

export function useCreateDiagnosis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<DiagnosisInput, "orgId">) => {
      const fullInput = { ...input, orgId: getSession().orgId };
      const created = hasSupabaseConfig()
        ? await createDiagnosisDual(fullInput)
        : await diagnosisRepository.create(fullInput);
      // 触发积分引擎:diagnosis.created (诊断完成奖励)
      try {
        const enc = hasSupabaseConfig()
          ? await findEncounterByIdDual(created.encounterId)
          // local 分支 findById 返回 Promise,必须 await——否则 enc 是 Promise 对象,
          // if(enc) 恒真且 enc.patientId 为 undefined(积分与学习记录都会拿错)
          : await (await import("../encounters/encounter.repository")).encounterRepository.findById(created.encounterId);
        if (enc) {
          const { onDiagnosisCreated } = await import("../membership/integration");
          await onDiagnosisCreated(enc.patientId, created.encounterId);
          // 学习闭环:记录诊断行为(模式记录在创建治疗计划时,那时才有干预组合)
          const { recordPersonalAction } = await import("../agent/agent-memory");
          recordPersonalAction(
            "create_diagnosis",
            `诊断: ${created.levels.join("/")} · ${created.mechanisms.join("+")}`,
            {
              diagnosisLevels: created.levels,
              patientId: enc.patientId,
              therapistId: getSession().userId,
            },
          );
        }
      } catch { /* 静默 */ }
      return created;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["diagnosis"] });
      qc.invalidateQueries({ queryKey: ["encounters"] }); // EncounterTable 诊断列也刷新
    },
  });
}

export function useUpdateDiagnosis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<DiagnosisInput> }) => {
      const fullPatch = { ...patch, orgId: getSession().orgId };
      return hasSupabaseConfig()
        ? updateDiagnosisDual(id, fullPatch)
        : diagnosisRepository.update(id, fullPatch as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["diagnosis"] });
      qc.invalidateQueries({ queryKey: ["encounters"] });
    },
  });
}
