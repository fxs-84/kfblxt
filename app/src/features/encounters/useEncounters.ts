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
      // 触发积分引擎
      try {
        const { membershipBus } = await import("../membership/trigger-events");
        const { checkTierUpgrade } = await import("../membership/rule-engine");
        await membershipBus.emit({
          type: "encounter.closed",
          patientId: e.patientId,
          encounterId: e.id,
          amount: 0,
          createdAt: new Date(),
        });
        await checkTierUpgrade(e.patientId, 0);
      } catch { /* 引擎未启用时静默 */ }
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
