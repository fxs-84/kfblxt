import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { followupRepository, findFollowupsByPatient, findAllPending, type FollowupInput } from "./followup.repository";
import { getSession } from "../../lib/session";

export function usePatientFollowups(patientId: string | undefined) {
  return useQuery({
    queryKey: ["followups", patientId],
    queryFn: () => findFollowupsByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

export function usePendingFollowups() {
  return useQuery({
    queryKey: ["followups", "pending"],
    queryFn: () => findAllPending(),
  });
}

export function useAllFollowups() {
  return useQuery({
    queryKey: ["followups", "all"],
    queryFn: () => followupRepository.findAll(),
  });
}

export function useCreateFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<FollowupInput, "orgId">) =>
      followupRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["followups", vars.patientId] });
      qc.invalidateQueries({ queryKey: ["followups", "pending"] });
    },
  });
}

export function useCompleteFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, encounterId }: { id: string; encounterId: string }) =>
      followupRepository.update(id, { status: "已完成" as const, completedEncounterId: encounterId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });
}

export function useNoShowFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => followupRepository.update(id, { status: "失约" as const }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });
}
