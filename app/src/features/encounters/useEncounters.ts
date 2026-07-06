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
    mutationFn: async (id: string) => {
      const e = await encounterRepository.update(id, { status: "已结束" });
      // 触发积分引擎:encounter.closed + 自动升级等级(根据就诊金额)
      const { onEncounterClosed } = await import("../membership/integration");
      await onEncounterClosed(e.patientId, e.id, e.amount ?? 0);
      return e;
    },
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
    mutationFn: async (input: EncounterInput) => {
      if (!can(getSession().role, "encounter:write")) {
        throw new Error("当前角色无权新建就诊记录");
      }
      const created = await encounterRepository.create(input);
      // 触发积分引擎:encounter.created(可触发里程碑等)
      const { onEncounterCreated } = await import("../membership/integration");
      await onEncounterCreated(created.patientId, created.id);
      return created;
    },
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: ["encounters", created.patientId] }),
  });
}
