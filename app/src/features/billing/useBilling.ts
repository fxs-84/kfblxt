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

export function useCreateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<BillingInput, "orgId">) =>
      billingRepository.create({ ...input, orgId: getSession().orgId }),
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
