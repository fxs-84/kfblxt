import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { patientRepository } from "./patient.repository";
import type { PatientInput } from "./patient.schema";
import { getSession } from "../../lib/session";
import { can } from "../../lib/rbac";

const KEY = ["patients"] as const;

export function usePatients() {
  return useQuery({ queryKey: KEY, queryFn: () => patientRepository.findAll() });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => patientRepository.findById(id as string),
    enabled: Boolean(id),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) => {
      if (!can(getSession().role, "patient:write")) {
        throw new Error("当前角色无权新建患者");
      }
      return patientRepository.create(input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
