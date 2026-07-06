import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingRepository, findBillingByPatient, calcBalance, type BillingInput } from "./billing.repository";
import { getSession } from "../../lib/session";

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
      // 触发积分引擎:billing.consumed (独立触发器,避免与 encounter.closed 双计)
      try {
        const { onBillingConsumed, onBillingRecharged } = await import("../membership/integration");
        if (input.type === "消费" && input.amount > 0) {
          await onBillingConsumed(input.patientId, created.id, input.amount, input.encounterId);
        } else if (input.type === "充值" && input.amount > 0) {
          await onBillingRecharged(input.patientId, created.id, input.amount);
        }
      } catch { /* 静默 */ }
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
