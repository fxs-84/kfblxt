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
        throw new Error("当前角色无权新建客户");
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
        throw new Error("当前角色无权修改客户信息");
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
      // RBAC:只有 admin 可软删除客户
      if (!can(getSession().role, "patient:delete")) {
        throw new Error("仅管理员可删除客户档案");
      }
      await patientRepository.remove(id);
      // 级联软删:把指向该 patient 的会员档案/积分流水/兑换订单标 deletedAt,
      // 仓储 findAll* 已统一过滤,展示侧自动消失;数据保留作审计/计费证据。
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
      // 让会员中心/兑换审核等全量视图也刷新
      qc.invalidateQueries({ queryKey: ["memberships"] });
      qc.invalidateQueries({ queryKey: ["redemptions"] });
    },
  });
}
