/**
 * 附件仓储的 Supabase 双模式分发。
 * - 个人单机模式:dataUrl 直接进本地
 * - Supabase 模式:dataUrl 进 Supabase Storage,URL 入表
 *
 * 当前实现做了"保留 dataUrl 入表"的兼容性以方便无 Storage 权限时也能 work。
 * 真正生产部署建议:用 supabase.storage.from(bucket).upload(...)→publicUrl。
 */

import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import { attachmentRepository, type AttachmentRecord, type AttachmentInput } from "./attachment.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: AttachmentInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    patient_id: input.patientId,
    encounter_id: input.encounterId,
    category: input.category,
    file_name: input.fileName,
    mime_type: input.mimeType,
    data_url: input.dataUrl,
    size_bytes: input.sizeBytes,
    note: input.note ?? null,
    timeline: input.timeline || null,
    comparison_group: input.comparisonGroup ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: getSession().userId,
  };
}

function fromRow(row: Record<string, unknown>): AttachmentRecord {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    patientId: String(row.patient_id),
    encounterId: String(row.encounter_id),
    category: row.category as AttachmentRecord["category"],
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    dataUrl: String(row.data_url ?? ""),
    sizeBytes: Number(row.size_bytes ?? 0),
    note: (row.note as string) ?? undefined,
    timeline: (row.timeline as AttachmentRecord["timeline"]) ?? undefined,
    comparisonGroup: (row.comparison_group as string) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findAttachmentsByEncounterDual(encounterId: string): Promise<AttachmentRecord[]> {
  if (!isSupabaseReady()) {
    const all = await attachmentRepository.findAll();
    return all
      .filter((a) => a.encounterId === encounterId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询附件失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findComparisonPairsDual(encounterId: string): Promise<AttachmentRecord[]> {
  const list = await findAttachmentsByEncounterDual(encounterId);
  return list.filter((a) => a.category === "疗效对比");
}

export async function createAttachmentDual(input: AttachmentInput): Promise<AttachmentRecord> {
  if (!isSupabaseReady()) return attachmentRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("attachments").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存附件失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteAttachmentDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return attachmentRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除附件失败: ${error.message}`);
}
