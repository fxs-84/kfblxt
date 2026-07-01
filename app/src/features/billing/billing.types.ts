/**
 * 客户消费/卡次记录。
 * 充值(+)、消费(-)、退款(-)三类,实时余额 = 全部记录的代数和。
 */

export type BillingType = "充值" | "消费" | "退费";

export const BILLING_TYPES: readonly BillingType[] = ["充值", "消费", "退费"];

export interface BillingRecord {
  id: string;
  patientId: string;
  orgId: string;
  createdAt: Date;
  /** 充值+ / 消费- / 退费- */
  type: BillingType;
  /** 金额(元),正数;充值=+amount,消费/退费=-amount */
  amount: number;
  /** 卡次(可选,计次卡用) */
  sessions?: number;
  /** 备注:充值渠道/消费项目/退款原因 */
  note: string;
  /** 关联就诊(消费时) */
  encounterId?: string;
}
