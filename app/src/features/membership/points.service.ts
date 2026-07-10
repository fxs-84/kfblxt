/**
 * 积分服务 — award / adjust
 */
import {
  getOrCreateMembership,
  updateMembership,
  appendLog,
  getLogsForRule,
} from "./rule.repository";
import type { PointsLog } from "./models";

interface AwardParams {
  patientId: string;
  delta: number;
  reason: string;
  ruleId?: string | null;
  triggerType?: PointsLog["triggerType"];
  refType?: PointsLog["refType"];
  refId?: string | null;
  operatorId: string;
}

export async function awardPoints(p: AwardParams): Promise<{ ok: boolean; balance: number; log: PointsLog }> {
  const membership = await getOrCreateMembership(p.patientId);
  const balanceAfter = Math.max(0, membership.points + p.delta);

  const log: PointsLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patientId: p.patientId,
    delta: p.delta,
    balanceAfter,
    reason: p.reason,
    ruleId: p.ruleId ?? null,
    triggerType: p.triggerType ?? null,
    refType: p.refType ?? null,
    refId: p.refId ?? null,
    operatorId: p.operatorId,
    createdAt: new Date().toISOString(),
  };

  await appendLog(log);
  await updateMembership(p.patientId, {
    points: balanceAfter,
    totalEarned: membership.totalEarned + Math.max(0, p.delta),
  });

  return { ok: true, balance: balanceAfter, log };
}

export async function adjustPoints(p: AwardParams): Promise<ReturnType<typeof awardPoints>> {
  return awardPoints(p);
}

export async function hasAwardedForRef(
  ruleId: string,
  event: { type: string; patientId: string; refId?: string | null; encounterId?: string; billingId?: string },
): Promise<boolean> {
  const refId = event.refId ?? (event as any).encounterId ?? (event as any).billingId ?? null;
  if (!refId) return false;
  const { getLogsForRule } = await import("./rule.repository");
  const logs = await getLogsForRule(ruleId, event.patientId);
  return logs.some(l => l.refId === refId);
}

export async function isInCooldown(
  ruleId: string,
  patientId: string,
  cooldownDays: number,
): Promise<boolean> {
  if (cooldownDays <= 0) return false;
  const logs = await getLogsForRule(ruleId, patientId);
  if (logs.length === 0) return false;
  const cutoff = Date.now() - cooldownDays * 86_400_000;
  return logs.some(l => new Date(l.createdAt).getTime() > cutoff);
}

export async function exceedsMaxPerPatient(
  ruleId: string,
  patientId: string,
  maxPerPatient: number,
): Promise<boolean> {
  if (maxPerPatient <= 0) return false;
  const logs = await getLogsForRule(ruleId, patientId);
  return logs.length >= maxPerPatient;
}