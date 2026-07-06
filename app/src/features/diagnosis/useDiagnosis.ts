import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosisRepository, findDiagnosisByEncounter, type DiagnosisInput } from "./diagnosis.repository";
import { getSession } from "../../lib/session";

export function useDiagnosis(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["diagnosis", encounterId],
    queryFn: () => findDiagnosisByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useAllDiagnoses() {
  return useQuery({
    queryKey: ["diagnosis", "all"],
    queryFn: () => diagnosisRepository.findAll(),
  });
}

export function useCreateDiagnosis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<DiagnosisInput, "orgId">) => {
      const created = await diagnosisRepository.create({ ...input, orgId: getSession().orgId });
      // 触发积分引擎:diagnosis.created (诊断完成奖励)
      try {
        const { encounterRepository } = await import("../encounters/encounter.repository");
        const enc = await encounterRepository.findById(created.encounterId);
        if (enc) {
          const { onDiagnosisCreated } = await import("../membership/integration");
          await onDiagnosisCreated(enc.patientId, created.encounterId);
        }
      } catch { /* 静默 */ }
      return created;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["diagnosis", vars.encounterId] });
    },
  });
}
