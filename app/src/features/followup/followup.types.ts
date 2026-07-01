/**
 * 复诊/随访提醒。
 * 治疗师可为患者设置下次复诊日期,到期提醒,可标记完成/失约。
 */

export type FollowupStatus = "待复诊" | "已完成" | "失约";

export const FOLLOWUP_STATUSES: readonly FollowupStatus[] = ["待复诊", "已完成", "失约"];

export interface Followup {
  id: string;
  patientId: string;
  orgId: string;
  createdAt: Date;
  dueDate: Date;
  status: FollowupStatus;
  note: string;
  /** 关联的就诊(完成时关联) */
  completedEncounterId?: string;
}
