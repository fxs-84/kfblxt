import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasSupabaseConfig } from "../../lib/supabase";
import { billingRepository, findBillingByPatient, calcBalance, type BillingInput } from "./billing.repository";
import { getSession } from "../../lib/session";
import { processEvent } from "../membership/rule-engine";
import type { TriggerEvent } from "../membership/models";
import {
  findAllBillingDual,
  findBillingByPatientDual,
  createBillingDual,
  deleteBillingDual,
} from "./billing-supabase";

/**
 * 由 billing 记录构造规则引擎事件。
 * 退费不生成事件,避免误触发"充值积分"规则。
 * 业务后续如需"退费扣积分",请新建 billing.refunded 事件并在 models.ts TRIGGER_TYPES 注册。
 */
export function buildBillingEvent(
  input: Pick<BillingInput, "type" | "patientId" | "amount" | "sessions" | "encounterId">,
  billingId: string,
): TriggerEvent | null {
  if (input.amount <= 0 || input.type === "退费") return null;
  const amount = input.sessions && input.sessions > 0 ? input.amount * input.sessions : input.amount;
  if (input.type === "消费") {
    const ev: Extract<TriggerEvent, { type: "billing.consumed" }> = {
      type: "billing.consumed",
      patientId: input.patientId,
      billingId,
      amount,
      createdAt: new Date(),
    };
    if (input.encounterId) ev.encounterId = input.encounterId;
    return ev;
  }
  return {
    type: "billing.recharged",
    patientId: input.patientId,
    billingId,
    amount,
    createdAt: new Date(),
  };
}

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
        // Supabase 模式查 billing_records 全表(RLS 按机构过滤);
        // 之前误用 billingRepository.findAll()(localStorage),
        // 导致业绩面板看不到云端消费记录
        return findAllBillingDual();
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
      const ev = buildBillingEvent(input, created.id);
      if (ev) {
        processEvent(ev).catch((e) => {
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
