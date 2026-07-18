import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasSupabaseConfig } from "../../lib/supabase";
import { followupRepository, findFollowupsByPatient, findAllPending, type FollowupInput } from "./followup.repository";
import { getSession } from "../../lib/session";
import {
  findFollowupsByPatientDual,
  findAllPendingDual,
  createFollowupDual,
  updateFollowupDual,
} from "./followup-supabase";

export function usePatientFollowups(patientId: string | undefined) {
  return useQuery({
    queryKey: ["followups", patientId],
    queryFn: async () => {
      if (hasSupabaseConfig()) {
        return findFollowupsByPatientDual(patientId as string);
      }
      return findFollowupsByPatient(patientId as string);
    },
    enabled: Boolean(patientId),
  });
}

export function usePendingFollowups() {
  return useQuery({
    queryKey: ["followups", "pending"],
    queryFn: async () => {
      if (hasSupabaseConfig()) {
        return findAllPendingDual();
      }
      return findAllPending();
    },
  });
}

export function useAllFollowups() {
  return useQuery({
    queryKey: ["followups", "all"],
    queryFn: async () => {
      // 没有对应的 findAll Dual API,退化为 localStorage 查询
      return followupRepository.findAll();
    },
  });
}

export function useCreateFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<FollowupInput, "orgId">) => {
      // 两个分支都必须带 orgId — 此前 Supabase 分支漏注,云端写入会丢机构字段
      const fullInput: FollowupInput = { ...input, orgId: getSession().orgId };
      return createFollowupDual(fullInput);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["followups", vars.patientId] });
      qc.invalidateQueries({ queryKey: ["followups", "pending"] });
    },
  });
}

export function useCompleteFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, encounterId }: { id: string; encounterId: string }) =>
      updateFollowupDual(id, { status: "已完成" as const, completedEncounterId: encounterId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });
}

export function useNoShowFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => updateFollowupDual(id, { status: "失约" as const }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });
}
