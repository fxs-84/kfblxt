import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { Attachment, AttachmentCategory } from "./attachment.types";

export type AttachmentRecord = Omit<Attachment, "id" | "createdAt"> & Entity;

export interface AttachmentInput {
  encounterId: string;
  orgId: string;
  patientId: string;
  category: AttachmentCategory;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  note?: string;
  timeline?: Attachment["timeline"];
  comparisonGroup?: string;
}

export const attachmentRepository: Repository<AttachmentRecord, AttachmentInput> =
  lazyPersistent<AttachmentRecord, AttachmentInput>("attachments", []);

export async function findAttachmentsByEncounter(encounterId: string): Promise<AttachmentRecord[]> {
  const all = await attachmentRepository.findAll();
  return all
    .filter((a) => a.encounterId === encounterId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function findComparisonPairs(encounterId: string): Promise<AttachmentRecord[]> {
  const all = await findAttachmentsByEncounter(encounterId);
  return all.filter((a) => a.category === "疗效对比");
}
