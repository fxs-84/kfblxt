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
import { getSession } from "../../lib/session";

export function useTreatmentPlans(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["treatment-plans", encounterId],
    queryFn: () => findPlansByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useCreateTreatmentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<TreatmentPlanInput, "orgId">) =>
      treatmentPlanRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["treatment-plans", vars.encounterId] });
    },
  });
}

export function useProgressNotes(planId: string | undefined) {
  return useQuery({
    queryKey: ["progress-notes", planId],
    queryFn: () => findNotesByPlan(planId as string),
    enabled: Boolean(planId),
  });
}

export function useProgressNotesByEncounter(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["progress-notes", "encounter", encounterId],
    queryFn: () => findNotesByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useCreateProgressNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ProgressNoteInput, "orgId">) =>
      progressNoteRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["progress-notes", vars.treatmentPlanId] });
      qc.invalidateQueries({ queryKey: ["progress-notes", "encounter", vars.encounterId] });
    },
  });
}
