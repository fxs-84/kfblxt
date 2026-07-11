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
      console.log("[billing] created, type=", input.type, "amount=", input.amount);
      // 直接调 processEvent,绕过事件总线
      if (input.amount > 0) {
        try {
          const { processEvent } = await import("../membership/rule-engine");
          const event: { type: string; patientId: string; amount: number; createdAt: Date; billingId: string; encounterId?: string } = {
            type: input.type === "消费" ? "billing.consumed" : "billing.recharged",
            patientId: input.patientId,
            billingId: created.id,
            amount: input.sessions && input.sessions > 0 ? input.amount * input.sessions : input.amount,
            createdAt: new Date(),
          };
          if (input.encounterId) event.encounterId = input.encounterId;
          await processEvent(event as any);
          console.log("[billing] processEvent done");
        } catch (e: unknown) { console.warn("[billing] processEvent failed:", e); }
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
