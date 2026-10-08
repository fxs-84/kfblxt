import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "../../lib/session";
import { hasSupabaseConfig } from "../../lib/supabase";
import {
  findAllAppointmentsDual,
  findAppointmentsByPatientDual,
  findUpcomingAppointmentsDual,
  createAppointmentDual,
  updateAppointmentDual,
  transitionAppointmentDual,
  deleteAppointmentDual,
} from "./appointment-supabase";
import type { AppointmentInput } from "./appointment.repository";
import type { AppointmentStatus } from "./appointment.types";

const KEY = ["appointments"] as const;

/** 全量预约(看板主数据源) */
export function useAppointments() {
  return useQuery({
    queryKey: [...KEY, "all"],
    queryFn: () => findAllAppointmentsDual(),
  });
}

/** 某客户的所有预约 */
export function usePatientAppointments(patientId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "patient", patientId],
    queryFn: () => findAppointmentsByPatientDual(patientId as string),
    enabled: Boolean(patientId),
  });
}

/** 临近预约(默认 24h 内,排除已完成/已取消) */
export function useUpcomingAppointments(hoursAhead = 24) {
  return useQuery({
    queryKey: [...KEY, "upcoming", hoursAhead],
    queryFn: () => findUpcomingAppointmentsDual(hoursAhead),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: Omit<AppointmentInput, "orgId">) => {
      const full: AppointmentInput = { ...input, orgId: getSession().orgId };
      return createAppointmentDual(full);
    },
    onSuccess: () => { invalidate(); },
  });
}

export function useUpdateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AppointmentInput> }) =>
      updateAppointmentDual(id, patch),
    onSuccess: () => { invalidate(); },
  });
}

/** 拖拽 / 状态机入口:在 supabase 层做 canTransition 校验 */
export function useTransitionAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: AppointmentStatus }) =>
      transitionAppointmentDual(id, to),
    onSuccess: () => { invalidate(); },
  });
}

export function useDeleteAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteAppointmentDual(id),
    onSuccess: () => { invalidate(); },
  });
}

/** 探针:让上层知道当前是云端还是单机(用于决定要不要提示跑迁移) */
export function useIsCloudMode(): boolean {
  return hasSupabaseConfig();
}
