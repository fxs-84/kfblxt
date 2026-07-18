import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasSupabaseConfig } from "../../lib/supabase";
import { billingRepository, findBillingByPatient, calcBalance, type BillingInput } from "./billing.repository";
import { getSession } from "../../lib/session";
import { processEvent } from "../membership/rule-engine";
import {
  findBillingByPatientDual,
  createBillingDual,
  deleteBillingDual,
} from "./billing-supabase";

export function useBilling(patientId: string | undefined) {
  const { data: records = [], ...rest } = useQuery({
    queryKey: ["billing", patientId],
    queryFn: async () => {
      if (hasSupabaseConfig()) {
        return findBillingByPatientDual(patientId as string);
      }
      return findBillingByPatient(patientId as string);
    },
    enabled: Boolean(patientId),
  });
  return { records, balance: calcBalance(records), ...rest };
}

export function useAllBilling() {
  const { data: records = [], ...rest } = useQuery({
    queryKey: ["billing", "all"],
    queryFn: async () => {
      if (hasSupabaseConfig()) {
        // 没有对应的 findAllDual API,退化为按空 patientId 查询获取全量
        const all = await billingRepository.findAll();
        return [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return billingRepository.findAll();
    },
  });
  return { records, ...rest };
}

export function useCreateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<BillingInput, "orgId">) => {
      // createBillingDual 内部已处理 Supabase/local 分发, orgId 始终需要
      const fullInput: BillingInput = { ...input, orgId: getSession().orgId };
      const created = await createBillingDual(fullInput);
      // 调 processEvent(与生日扫描器相同,静态 import,不走事件总线)
      if (input.amount > 0) {
        const ev: { type: string; patientId: string; amount: number; createdAt: Date; billingId: string; encounterId?: string } = {
          type: input.type === "消费" ? "billing.consumed" : "billing.recharged",
          patientId: input.patientId,
          billingId: created.id,
          amount: input.sessions && input.sessions > 0 ? input.amount * input.sessions : input.amount,
          createdAt: new Date(),
        };
        if (input.encounterId) ev.encounterId = input.encounterId;
        // 不再静默吞错:记录失败原因到 console 便于排查
        processEvent(ev as any).catch((e) => {
          // eslint-disable-next-line no-console
          console.error("[useCreateBilling] processEvent 失败,积分流水未写入:", e);
        });
      }
      return created;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["billing", vars.patientId] });
    },
  });
}

export function useDeleteBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const found = await billingRepository.findById(id);
      if (!found) return null;
      await deleteBillingDual(id);
      return found.patientId;
    },
    onSuccess: (patientId) => {
      if (patientId) qc.invalidateQueries({ queryKey: ["billing", patientId] });
    },
  });
}
