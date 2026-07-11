import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingRepository, findBillingByPatient, calcBalance, type BillingInput } from "./billing.repository";
import { getSession } from "../../lib/session";
import { onBillingConsumed, onBillingRecharged } from "../membership/integration";

export function useBilling(patientId: string | undefined) {
  const { data: records = [], ...rest } = useQuery({
    queryKey: ["billing", patientId],
    queryFn: () => findBillingByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
  return { records, balance: calcBalance(records), ...rest };
}

export function useAllBilling() {
  const { data: records = [], ...rest } = useQuery({
    queryKey: ["billing", "all"],
    queryFn: () => billingRepository.findAll(),
  });
  return { records, ...rest };
}

export function useCreateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<BillingInput, "orgId">) => {
      const created = await billingRepository.create({ ...input, orgId: getSession().orgId });
      console.log("[billing] created, type=", input.type, "amount=", input.amount);
      // 触发积分引擎:billing.consumed (独立触发器,避免与 encounter.closed 双计)
      try {
        if (input.type === "消费" && input.amount > 0) {
          const realAmt = input.sessions && input.sessions > 0 ? input.amount * input.sessions : input.amount;
          await onBillingConsumed(input.patientId, created.id, realAmt, input.encounterId);
        } else if (input.type === "充值" && input.amount > 0) {
          await onBillingRecharged(input.patientId, created.id, input.amount);
        }
      } catch (e) { console.warn("[billing] 积分触发失败:", e); }
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
      if (found) {
        await billingRepository.remove(id);
        return found.patientId;
      }
      return null;
    },
    onSuccess: (patientId) => {
      if (patientId) qc.invalidateQueries({ queryKey: ["billing", patientId] });
    },
  });
}
