import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assessmentRepository,
  findAssessmentsByEncounter,
  findAssessmentsByPatient,
  type AssessmentRecordRow,
} from "./assessment.repository";
import type { AssessmentInput } from "./assessment.types";
import { getSession } from "../../lib/session";

export function usePatientAssessments(patientId: string | undefined) {
  return useQuery({
    queryKey: ["assessments", "patient", patientId],
    queryFn: () => findAssessmentsByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

export function useEncounterAssessments(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["assessments", "encounter", encounterId],
    queryFn: () => findAssessmentsByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useAllAssessments() {
  return useQuery({
    queryKey: ["assessments", "all"],
    queryFn: () => assessmentRepository.findAll(),
  });
}

export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<AssessmentInput, "orgId">) =>
      assessmentRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["assessments", "patient", vars.patientId] });
      if (vars.encounterId) {
        qc.invalidateQueries({ queryKey: ["assessments", "encounter", vars.encounterId] });
      }
      qc.invalidateQueries({ queryKey: ["assessments", "all"] });
    },
  });
}

export function useDeleteAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patientId: string; encounterId?: string }) => {
      await assessmentRepository.remove(vars.id);
      return vars;
    },
    onSuccess: (vars) => {
      qc.invalidateQueries({ queryKey: ["assessments", "patient", vars.patientId] });
      if (vars.encounterId) {
        qc.invalidateQueries({ queryKey: ["assessments", "encounter", vars.encounterId] });
      }
      qc.invalidateQueries({ queryKey: ["assessments", "all"] });
    },
  });
}

export type { AssessmentRecordRow };