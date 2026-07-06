import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosisRepository, findDiagnosisByEncounter, type DiagnosisInput } from "./diagnosis.repository";
import { getSession } from "../../lib/session";

export function useDiagnosis(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["diagnosis", encounterId],
    queryFn: () => findDiagnosisByEncounter(encounterId as string),
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
      const created = await diagnosisRepository.create({ ...input, orgId: getSession().orgId });
      // 触发积分引擎:diagnosis.created (诊断完成奖励)
      try {
        const { encounterRepository } = await import("../encounters/encounter.repository");
        const enc = await encounterRepository.findById(created.encounterId);
        if (enc) {
          const { onDiagnosisCreated } = await import("../membership/integration");
          await onDiagnosisCreated(enc.patientId, created.encounterId);
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
