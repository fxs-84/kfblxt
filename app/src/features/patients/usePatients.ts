import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasSupabaseConfig } from "../../lib/supabase";
import { getSession } from "../../lib/session";
import { can } from "../../lib/rbac";
import { patientRepository } from "./patient.repository";
import {
  findAllPatientsDual,
  createPatientDual,
  updatePatientDual,
  deletePatientDual,
} from "./patient-supabase";
import type { PatientInput } from "./patient.schema";

const KEY = ["patients"] as const;

/** 当 Supabase 就绪时,按照 orgId 隔离读取;否则读全部 localStorage */
async function readAll(): ReturnType<typeof patientRepository.findAll> {
  const session = getSession();
  if (hasSupabaseConfig()) {
    return findAllPatientsDual(session.orgId);
  }
  const all = await patientRepository.findAll();
  return all.filter((p) => p.orgId === session.orgId);
}

async function readOne(id: string) {
  if (hasSupabaseConfig()) {
    // findAllPatientsDual 返回全量,客户端过滤不高效但够用
    const all = await readAll();
    return all.find((p) => p.id === id) ?? null;
  }
  return patientRepository.findById(id as string);
}

export function usePatients() {
  return useQuery({ queryKey: KEY, queryFn: readAll });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => readOne(id!),
    enabled: Boolean(id),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatientInput) => {
      if (!can(getSession().role, "patient:write")) {
        throw new Error("当前角色无权新建客户");
      }
      const created = await createPatientDual(input);
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
        throw new Error("当前角色无权修改客户信息");
      }
      return updatePatientDual(id, patch);
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
      if (!can(getSession().role, "patient:delete")) {
        throw new Error("仅管理员可删除客户档案");
      }
      await deletePatientDual(id);
      const { markMembershipsOrphanedByPatient, markLogsOrphanedByPatient, markRedemptionsOrphanedByPatient } =
        await import("../membership/rule.repository");
      const [mCount, lCount, rCount] = await Promise.all([
        markMembershipsOrphanedByPatient(id),
        markLogsOrphanedByPatient(id),
        markRedemptionsOrphanedByPatient(id),
      ]);
      // eslint-disable-next-line no-console
      console.log(`[deletePatient] ${id} cascade: memberships=${mCount}, logs=${lCount}, redemptions=${rCount}`);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, id] });
      qc.invalidateQueries({ queryKey: ["memberships"] });
      qc.invalidateQueries({ queryKey: ["redemptions"] });
    },
  });
}
