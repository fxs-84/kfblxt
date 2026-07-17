import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assessmentRepository,
  type BrainAssessmentRecordRow,
  type PainAssessmentRecordRow,
} from "./assessment.repository";
import type { BrainAssessmentInput, PainAssessmentInput } from "./assessment.types";
import { getSession } from "../../lib/session";
import {
  findAssessmentsByPatientDual,
  findAssessmentsByEncounterDual,
  createAssessmentDual,
  updateAssessmentDual,
  deleteAssessmentDual,
} from "./assessment-supabase";

export type AssessmentRecordRow = BrainAssessmentRecordRow | PainAssessmentRecordRow;

export function usePatientAssessments(patientId: string | undefined) {
  return useQuery({
    queryKey: ["assessments", "patient", patientId],
    queryFn: () => findAssessmentsByPatientDual(patientId as string),
    enabled: Boolean(patientId),
  });
}

export function useEncounterAssessments(encounterId: string | undefined, patientId?: string) {
  return useQuery({
    queryKey: ["assessments", "encounter", encounterId, patientId],
    queryFn: () => findAssessmentsByEncounterDual(encounterId as string, patientId),
    enabled: Boolean(encounterId),
  });
}

export function useAllAssessments() {
  return useQuery({
    queryKey: ["assessments", "all"],
    queryFn: async () => {
      // 全量当前未提供 Dual 版本,统一用本地仓储(单机模式足够;Supabase 模式按需扩展)
      const all = await assessmentRepository.findAll();
      return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  });
}

/** 通用创建 — 自动判定 brain_region / pain_assessment 路由 */
export function useCreateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<BrainAssessmentInput, "orgId"> | Omit<PainAssessmentInput, "orgId">) =>
      createAssessmentDual({ ...input, orgId: getSession().orgId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["assessments", "patient", vars.patientId] });
      if (vars.encounterId) {
        qc.invalidateQueries({ queryKey: ["assessments", "encounter", vars.encounterId] });
      }
      qc.invalidateQueries({ queryKey: ["assessments", "all"] });
    },
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      patch: Partial<BrainAssessmentInput | PainAssessmentInput>;
      patientId: string;
      encounterId?: string;
    }) => {
      return updateAssessmentDual(vars.id, vars.patch);
    },
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
      await deleteAssessmentDual(vars.id);
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

export type { BrainAssessmentRecordRow, PainAssessmentRecordRow };