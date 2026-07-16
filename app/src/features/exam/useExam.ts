import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hasSupabaseConfig } from "../../lib/supabase";
import {
  examSessionRepository,
  findSessionsByEncounter,
  type ExamSessionInput,
} from "./exam.repository";
import {
  findSessionsByEncounterDual,
  createExamSessionDual,
} from "./exam-supabase";
import { getSession } from "../../lib/session";

export function useExamSessions(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["exam-sessions", encounterId],
    queryFn: () => {
      if (hasSupabaseConfig()) {
        return findSessionsByEncounterDual(encounterId as string);
      }
      return findSessionsByEncounter(encounterId as string);
    },
    enabled: Boolean(encounterId),
  });
}

/** 批量查:返回所有就诊的查体会话,按 encounterId 分组 */
export function useAllExamSessions() {
  return useQuery({
    queryKey: ["exam-sessions", "all"],
    queryFn: () => examSessionRepository.findAll(),
  });
}

export function useCreateExamSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ExamSessionInput, "orgId">) =>
      createExamSessionDual({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["exam-sessions", vars.encounterId] });
      qc.invalidateQueries({ queryKey: ["exam-sessions", "all"] });
    },
  });
}
