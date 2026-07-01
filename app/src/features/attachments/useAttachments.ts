import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { attachmentRepository, findAttachmentsByEncounter, type AttachmentInput } from "./attachment.repository";
import { getSession } from "../../lib/session";

export function useAttachments(encounterId: string | undefined) {
  return useQuery({
    queryKey: ["attachments", encounterId],
    queryFn: () => findAttachmentsByEncounter(encounterId as string),
    enabled: Boolean(encounterId),
  });
}

export function useCreateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<AttachmentInput, "orgId">) =>
      attachmentRepository.create({ ...input, orgId: getSession().orgId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["attachments", vars.encounterId] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const found = await attachmentRepository.findById(id);
      if (found) {
        await attachmentRepository.remove(id);
        return found.encounterId;
      }
      return null;
    },
    onSuccess: (encounterId) => {
      if (encounterId) qc.invalidateQueries({ queryKey: ["attachments", encounterId] });
    },
  });
}
