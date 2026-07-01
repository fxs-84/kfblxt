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

export function useCreateDiagnosis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<DiagnosisInput, "orgId">) =>
      diagnosisRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["diagnosis", vars.encounterId] });
    },
  });
}
