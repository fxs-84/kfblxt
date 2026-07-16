/**
 * 附件模块类型。
 * 支持检查报告(PDF/图片)和疗效对比(图片/视频)两类文件上传,
 * 可标记 before/after 用于治疗前后对比展示。
 * mock 阶段用 base64 data URL 存储;接 Supabase 时改为 Storage bucket URL。
 */

export type AttachmentCategory = "检查报告" | "疗效对比";

export const ATTACHMENT_CATEGORIES: readonly AttachmentCategory[] = ["检查报告", "疗效对比"];

export interface Attachment {
  id: string;
  patientId: string;
  encounterId: string;
  orgId: string;
  createdAt: Date;
  category: AttachmentCategory;
  /** 原始文件名 */
  fileName: string;
  /** MIME 类型 */
  mimeType: string;
  /** base64 data URL(mock)或 Supabase Storage URL */
  dataUrl: string;
  /** 文件大小(字节) */
  sizeBytes: number;
  /** 描述/备注 */
  note?: string;
  /** 疗效对比才有:标记治疗前/治疗中/治疗后 */
  timeline?: "治疗前" | "治疗中" | "治疗后";
  /** 剂型对比组(同组治疗前后照片归属同一 groupId) */
  comparisonGroup?: string;
}
