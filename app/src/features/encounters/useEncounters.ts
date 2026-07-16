import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { encounterRepository, findEncountersByPatient } from "./encounter.repository";
import type { EncounterInput } from "./encounter.schema";
import { getSession } from "../../lib/session";
import { can } from "../../lib/rbac";
import { hasSupabaseConfig } from "../../lib/supabase";
import {
  findEncountersByPatientDual,
  findEncounterByIdDual,
  createEncounterDual,
  updateEncounterDual,
} from "./encounter-supabase";

export function usePatientEncounters(patientId: string | undefined) {
  return useQuery({
    queryKey: ["encounters", patientId],
    queryFn: () =>
      hasSupabaseConfig()
        ? findEncountersByPatientDual(patientId as string)
        : findEncountersByPatient(patientId as string),
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
      const existing = hasSupabaseConfig()
        ? await findEncounterByIdDual(id)
        : await encounterRepository.findById(id);
      if (!existing || existing.status === "已结束") return existing!;
      const e = hasSupabaseConfig()
        ? await updateEncounterDual(id, { status: "已结束" })
        : await encounterRepository.update(id, { status: "已结束" });
      // 计算实际就诊金额:取 billing 中该就诊的 sum(消费金额),否则 fallback encounter.amount
      let realAmount = e.amount ?? 0;
      try {
        const { findBillingByEncounterDual } = await import("../billing/billing-supabase");
        const bills = await findBillingByEncounterDual(id);
        const consumed = bills.filter((b) => b.type === "消费");
        if (consumed.length > 0) {
          realAmount = consumed.reduce((s, b) => s + b.amount, 0);
        }
      } catch { /* 静默,fallback 到 encounter.amount */ }
      // 触发积分引擎
      const { onEncounterClosed } = await import("../membership/integration");
      await onEncounterClosed(e.patientId, e.id, realAmount);
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
      hasSupabaseConfig()
        ? updateEncounterDual(id, patch)
        : encounterRepository.update(id, patch),
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
      const created = hasSupabaseConfig()
        ? await createEncounterDual(input)
        : await encounterRepository.create(input);
      // 触发积分引擎:encounter.created(可触发里程碑等)
      const { onEncounterCreated } = await import("../membership/integration");
      await onEncounterCreated(created.patientId, created.id);
      return created;
    },
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: ["encounters", created.patientId] }),
  });
}
