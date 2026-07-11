import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientRepository } from "./patient.repository";
import type { PatientInput } from "./patient.schema";
import { getSession } from "../../lib/session";
import { can } from "../../lib/rbac";

const KEY = ["patients"] as const;

export function usePatients() {
  return useQuery({ queryKey: KEY, queryFn: () => patientRepository.findAll() });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => patientRepository.findById(id as string),
    enabled: Boolean(id),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatientInput) => {
      if (!can(getSession().role, "patient:write")) {
        throw new Error("当前角色无权新建患者");
      }
      const created = await patientRepository.create(input);
      // 触发积分引擎:patient.created (赠送注册积分)
      const { onPatientCreated } = await import("../membership/integration");
      await onPatientCreated(created.id);
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PatientInput> }) => {
      if (!can(getSession().role, "patient:write")) {
        throw new Error("当前角色无权修改患者信息");
      }
      return patientRepository.update(id, patch);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, vars.id] });
    },
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // RBAC:只有 admin 可软删除患者
      if (!can(getSession().role, "patient:delete")) {
        throw new Error("仅管理员可删除患者档案");
      }
      await patientRepository.remove(id);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, id] });
    },
  });
}
