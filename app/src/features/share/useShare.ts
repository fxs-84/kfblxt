import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shareRepository, findSharesByEncounter, findShareByToken, generateToken, defaultExpiry } from "./share.repository";
import { getSession } from "../../lib/session";

export function useSharesByEncounter(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["shares", encounterId],
    queryFn: () => findSharesByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useShareByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["shares", "token", token],
    queryFn: async () => {
      // 先试 Supabase(跨设备可用),再试 localStorage
      const { findShareByTokenSupabase } = await import("./share-supabase");
      const supabaseResult = await findShareByTokenSupabase(token as string);
      if (supabaseResult) return supabaseResult;
      return findShareByToken(token as string);
    },
    enabled: Boolean(token),
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { encounterId: string; patientId: string; homework?: string; nextVisit?: Date; message?: string }) =>
      shareRepository.create({
        encounterId: input.encounterId,
        patientId: input.patientId,
        orgId: getSession().orgId,
        token: generateToken(),
        revoked: false,
        expiresAt: defaultExpiry(),
        homework: input.homework,
        nextVisit: input.nextVisit,
        message: input.message,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["shares", vars.encounterId] });
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const found = await shareRepository.findById(id);
      if (found) {
        await shareRepository.update(id, { revoked: true });
        return found.encounterId;
      }
      return null;
    },
    onSuccess: (encounterId) => {
      if (encounterId) qc.invalidateQueries({ queryKey: ["shares", encounterId] });
    },
  });
}
