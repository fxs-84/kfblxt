/**
 * 规则引擎 — 接收事件 → 遍历规则 → 评估条件 → 执行动作
 */
import {
  findAllRules,
  findAllTiers,
  updateMembership,
  getOrCreateMembership,
} from "./rule.repository";
import { awardPoints, isInCooldown, exceedsMaxPerPatient } from "./points.service";
import type { PointsRule, RuleCondition, TriggerEvent, MemberTier, PointsLog } from "./models";

interface EvalContext {
  patientTier: MemberTier;
  encounterAmount?: number;
  patientAge?: number;
  patientIsFirstVisit?: boolean;
  nth?: number;
}

function evalCondition(c: RuleCondition, ctx: EvalContext): boolean {
  let actual: unknown;
  switch (c.field) {
    case "patient.tier": actual = ctx.patientTier; break;
    case "encounter.amount": actual = ctx.encounterAmount; break;
    case "patient.age": actual = ctx.patientAge; break;
    case "patient.isFirstVisit": actual = ctx.patientIsFirstVisit; break;
  }
  if (actual === undefined) return false;
  const val = c.value;
  switch (c.op) {
    case "eq": return actual === val;
    case "neq": return actual !== val;
    case "gt": return Number(actual) > Number(val);
    case "gte": return Number(actual) >= Number(val);
    case "lt": return Number(actual) < Number(val);
    case "lte": return Number(actual) <= Number(val);
    case "in": return Array.isArray(val) && (val as unknown[]).includes(actual);
    default: return false;
  }
}

export async function processEvent(event: TriggerEvent, operatorId = "system"): Promise<void> {
  console.log("[processEvent] entered, type=", event.type, "amount=", (event as any).amount);
  const rules = await findAllRules();
  const active = rules.filter(r => r.enabled).sort((a, b) => b.priority - a.priority);

  for (const rule of active) {
    if (!matchesTrigger(rule, event)) continue;
    console.log("[processEvent] matched rule:", rule.name);
    if (!isInDateRange(rule)) continue;
    if (await isInCooldown(rule.id, event.patientId, rule.cooldownDays)) continue;
    if (await exceedsMaxPerPatient(rule.id, event.patientId, rule.maxPerPatient)) continue;

    const ctx = await buildContext(event);
    if (!evalConditions(rule.conditions, ctx)) continue;
    await executeAction(rule, event, ctx, operatorId);
  }
}

function matchesTrigger(rule: PointsRule, event: TriggerEvent): boolean {
  if (rule.trigger === "encounter.nth") return event.type === "encounter.nth";
  if (rule.trigger === "patient.birthday") return event.type === "patient.birthday";
  return rule.trigger === event.type;
}

function isInDateRange(rule: PointsRule): boolean {
  const now = Date.now();
  if (rule.validFrom && new Date(rule.validFrom).getTime() > now) return false;
  if (rule.validUntil && new Date(rule.validUntil).getTime() < now) return false;
  return true;
}

function evalConditions(conditions: RuleCondition[], ctx: EvalContext): boolean {
  return conditions.every(c => evalCondition(c, ctx));
}

async function buildContext(event: TriggerEvent): Promise<EvalContext> {
  const m = await getOrCreateMembership(event.patientId);
  const ctx: EvalContext = { patientTier: m.tier };
  if (event.type === "encounter.closed" || event.type === "billing.consumed") {
    ctx.encounterAmount = event.amount;
  }
  return ctx;
}

async function executeAction(
  rule: PointsRule,
  event: TriggerEvent,
  ctx: EvalContext,
  operatorId: string,
): Promise<void> {
  if (rule.action.kind === "award_fixed") {
    const tiers = await findAllTiers();
    const tier = tiers.find(t => t.tier === ctx.patientTier);
    const multiplier = tier?.pointMultiplier ?? 1;
    const finalPoints = Math.round(rule.action.points * multiplier);
    await awardPoints({
      patientId: event.patientId,
      delta: finalPoints,
      reason: rule.action.reason,
      ruleId: rule.id,
      triggerType: event.type,
      refType: refTypeOf(event.type),
      refId: getRefId(event),
      operatorId,
    });
  } else if (rule.action.kind === "award_ratio") {
    const isConsumption = event.type === "encounter.closed" || event.type === "billing.consumed";
    if (!isConsumption || !event.amount) return;
    const tiers = await findAllTiers();
    const tier = tiers.find(t => t.tier === ctx.patientTier);
    const multiplier = tier?.pointMultiplier ?? 1;
    const finalPoints = Math.round(event.amount * rule.action.pointsPerYuan * multiplier);
    await awardPoints({
      patientId: event.patientId,
      delta: finalPoints,
      reason: rule.action.reason,
      ruleId: rule.id,
      triggerType: event.type,
      refType: event.type === "billing.consumed" ? "manual" : "encounter",
      refId: "encounterId" in event ? event.encounterId : ("billingId" in event ? event.billingId : null),
      operatorId,
    });
  } else if (rule.action.kind === "set_tier") {
    await updateMembership(event.patientId, { tier: rule.action.tier });
  }
}

function refTypeOf(eventType: TriggerEvent["type"]): PointsLog["refType"] {
  if (eventType.startsWith("encounter")) return "encounter";
  if (eventType.startsWith("patient")) return "patient";
  if (eventType.startsWith("share")) return "share";
  return "manual";
}

function getRefId(event: TriggerEvent): string | null {
  if ("encounterId" in event) return event.encounterId ?? null;
  if ("shareToken" in event) return event.shareToken ?? null;
  if ("refPatientId" in event) return event.refPatientId ?? null;
  if ("billingId" in event) return event.billingId ?? null;
  return null;
}

export async function checkTierUpgrade(patientId: string, additionalSpent = 0): Promise<void> {
  const m = await getOrCreateMembership(patientId);
  if (additionalSpent > 0) {
    await updateMembership(patientId, { totalSpent: m.totalSpent + additionalSpent });
  }
  const updated = await getOrCreateMembership(patientId);
  const tiers = await findAllTiers();
  const eligible = tiers
    .filter(t => updated.totalSpent >= t.minTotalSpent)
    .sort((a, b) => b.minTotalSpent - a.minTotalSpent);
  const target = eligible[0]?.tier ?? "regular";
  if (target !== updated.tier) {
    await updateMembership(patientId, { tier: target });
  }
}