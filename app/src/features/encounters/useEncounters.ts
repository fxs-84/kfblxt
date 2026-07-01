import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { encounterRepository, findEncountersByPatient } from "./encounter.repository";
import type { EncounterInput } from "./encounter.schema";
import { getSession } from "../../lib/session";
import { can } from "../../lib/rbac";

export function usePatientEncounters(patientId: string | undefined) {
  return useQuery({
    queryKey: ["encounters", patientId],
    queryFn: () => findEncountersByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

export function useAllEncounters() {
  return useQuery({
    queryKey: ["encounters", "all"],
    queryFn: () => encounterRepository.findAll(),
  });
}

export function useCloseEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => encounterRepository.update(id, { status: "已结束" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounters"] });
    },
  });
}

export function useUpdateEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EncounterInput> }) =>
      encounterRepository.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounters"] });
    },
  });
}

export function useCreateEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EncounterInput) => {
      if (!can(getSession().role, "encounter:write")) {
        throw new Error("当前角色无权新建就诊记录");
      }
      return encounterRepository.create(input);
    },
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: ["encounters", created.patientId] }),
  });
}
