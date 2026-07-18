import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  treatmentPlanRepository,
  progressNoteRepository,
  findPlansByEncounter,
  findNotesByPlan,
  findNotesByEncounter,
  type TreatmentPlanInput,
  type ProgressNoteInput,
} from "./treatment.repository";
import {
  findPlansByEncounterDual,
  createPlanDual,
  findNotesByPlanDual,
  createNoteDual,
  findNotesByEncounterDual,
} from "./treatment-supabase";
import { hasSupabaseConfig } from "../../lib/supabase";
import { getSession } from "../../lib/session";
import { INTERVENTIONS_CATALOG } from "./interventions-catalog";

export function useTreatmentPlans(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["treatment-plans", encounterId],
    queryFn: () =>
      hasSupabaseConfig()
        ? findPlansByEncounterDual(encounterId as string)
        : findPlansByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useAllTreatmentPlans() {
  return useQuery({
    queryKey: ["treatment-plans", "all"],
    queryFn: () => treatmentPlanRepository.findAll(),
  });
}

export function useCreateTreatmentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TreatmentPlanInput, "orgId">) => {
      const created = await createPlanDual({ ...input, orgId: getSession().orgId });
      // 学习闭环:记录"诊断+干预"模式(历史匹配/疗效排序的数据源)
      try {
        const diag = hasSupabaseConfig()
          ? await (await import("../diagnosis/diagnosis-supabase")).findDiagnosisByEncounterDual(input.encounterId)
          : await (await import("../diagnosis/diagnosis.repository")).findDiagnosisByEncounter(input.encounterId);
        const mem = await import("../learning/agent-memory");
        mem.recordDiagnosis(diag?.levels ?? [], diag?.mechanisms ?? [], "", input.interventionIds);
        for (const id of input.interventionIds) {
          const name = INTERVENTIONS_CATALOG.find((i) => i.id === id)?.name ?? id;
          mem.recordPersonalAction("create_treatment", `干预: ${name}`, {
            interventionId: id,
            diagnosisLevels: diag?.levels,
            patientId: input.patientId,
            therapistId: getSession().userId,
          });
        }
      } catch { /* 学习记录失败不影响主流程 */ }
      return created;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["treatment-plans", vars.encounterId] });
    },
  });
}

export function useProgressNotes(planId: string | undefined) {
  return useQuery({
    queryKey: ["progress-notes", planId],
    queryFn: () =>
      hasSupabaseConfig()
        ? findNotesByPlanDual(planId as string)
        : findNotesByPlan(planId as string),
    enabled: Boolean(planId),
  });
}

export function useProgressNotesByEncounter(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["progress-notes", "encounter", encounterId],
    queryFn: () =>
      hasSupabaseConfig()
        ? findNotesByEncounterDual(encounterId as string)
        : findNotesByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useCreateProgressNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ProgressNoteInput, "orgId">) => {
      const created = await createNoteDual({ ...input, orgId: getSession().orgId });
      // 学习闭环:疗效记录(预测数据源) + VAS 趋势(TrendSummaryCard/随访建议数据源)
      try {
        const mem = await import("../learning/agent-memory");
        const diag = hasSupabaseConfig()
          ? await (await import("../diagnosis/diagnosis-supabase")).findDiagnosisByEncounterDual(input.encounterId)
          : await (await import("../diagnosis/diagnosis.repository")).findDiagnosisByEncounter(input.encounterId);
        const key = diag ? mem.patternKey(diag.levels, diag.mechanisms, "") : "unknown";
        mem.recordOutcome(
          input.treatmentPlanId,
          key,
          input.interventionIds ?? [],
          input.outcome ?? "有效",
          input.horizon,
        );
        if (input.vasAfter !== undefined) {
          mem.recordVasHistory(input.patientId, input.vasAfter);
        }
        mem.recordPersonalAction("record_outcome", `复评: ${input.outcome ?? ""} (${input.horizon})`, {
          patientId: input.patientId,
          therapistId: getSession().userId,
        });
      } catch { /* 学习记录失败不影响主流程 */ }
      return created;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["progress-notes", vars.treatmentPlanId] });
      qc.invalidateQueries({ queryKey: ["progress-notes", "encounter", vars.encounterId] });
    },
  });
}
