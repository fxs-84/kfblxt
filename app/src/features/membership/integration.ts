/**
 * 诊疗事件 → 积分系统 集成层
 * 所有诊疗相关的事件通过这里 emit,保证触发器单一入口
 */
import { membershipBus } from "./trigger-events";
import { checkTierUpgrade } from "./rule-engine";
import type { TriggerEvent } from "./models";
import { findBillingByPatient } from "../billing/billing.repository";

/** 新建客户档案 */
export async function onPatientCreated(patientId: string): Promise<void> {
  await emit({ type: "patient.created", patientId, createdAt: new Date() });
}

/** 新建就诊 */
export async function onEncounterCreated(
  patientId: string,
  encounterId: string,
): Promise<void> {
  await emit({ type: "encounter.created", patientId, encounterId, createdAt: new Date() });
}

/** 就诊关闭 — 自动触发奖励积分 + 消费积分 + 等级升级 */
export async function onEncounterClosed(
  patientId: string,
  encounterId: string,
  amount: number,
): Promise<void> {
  await emit({ type: "encounter.closed", patientId, encounterId, amount, createdAt: new Date() });
  await checkEncounterNthVisit(patientId, encounterId);
  if (amount > 0) await checkTierUpgrade(patientId, amount);
}

/** 完成诊断 */
export async function onDiagnosisCreated(
  patientId: string,
  encounterId: string,
): Promise<void> {
  await emit({ type: "diagnosis.created", patientId, encounterId, createdAt: new Date() });
}

/** 分享随访方案 */
export async function onShareSent(patientId: string, shareToken: string): Promise<void> {
  await emit({ type: "share.sent", patientId, shareToken, createdAt: new Date() });
}

/** 推荐新客户 */
export async function onPatientRecommend(
  patientId: string,
  refPatientId: string,
): Promise<void> {
  await emit({ type: "patient.recommend", patientId, refPatientId, createdAt: new Date() });
}

/** 治疗师手动调整积分 */
export async function onManualPoints(
  patientId: string,
  delta: number,
  reason: string,
  operatorId: string,
): Promise<void> {
  await emit({ type: "manual", patientId, delta, reason, operatorId, createdAt: new Date() });
}

/** 消费扣款 — 触发消费积分 + 等级升级 */
export async function onBillingConsumed(
  patientId: string,
  billingId: string,
  amount: number,
  encounterId?: string,
): Promise<void> {
  const { processEvent } = await import("./rule-engine");
  await processEvent({ type: "billing.consumed", patientId, billingId, amount, encounterId, createdAt: new Date() });
  if (amount > 0) await checkTierUpgrade(patientId, amount);
}

/** 充值入账 */
export async function onBillingRecharged(
  patientId: string,
  billingId: string,
  amount: number,
): Promise<void> {
  const { processEvent } = await import("./rule-engine");
  await processEvent({ type: "billing.recharged", patientId, billingId, amount, createdAt: new Date() });
}

/** 检查是否达到第 N 次就诊里程碑 */
async function checkEncounterNthVisit(patientId: string, encounterId: string): Promise<void> {
  try {
    const { encounterRepository } = await import("../encounters/encounter.repository");
    const all = await encounterRepository.findAll();
    const count = all.filter(e => e.patientId === patientId && e.status === "已结束").length;
    console.log("[membership] checkEncounterNthVisit: patient=", patientId, "count=", count);
    if (count >= 5 && count % 5 === 0) {
      await emit({ type: "encounter.nth", patientId, encounterId, nth: count, createdAt: new Date() });
    }
  } catch { /* 静默 */ }
}

/** 内部统一触发 */
async function emit(event: TriggerEvent): Promise<void> {
  try {
    await membershipBus.emit(event);
  } catch (e) {
    console.error("[membership/integration] emit failed:", e);
  }
}

// silence unused
void findBillingByPatient;