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
    mutationFn: (input: Omit<TreatmentPlanInput, "orgId">) =>
      createPlanDual({ ...input, orgId: getSession().orgId }),
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
    mutationFn: (input: Omit<ProgressNoteInput, "orgId">) =>
      createNoteDual({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["progress-notes", vars.treatmentPlanId] });
      qc.invalidateQueries({ queryKey: ["progress-notes", "encounter", vars.encounterId] });
    },
  });
}
