/**
 * 兑换服务 — 客户申请兑换,治疗师审核
 */
import { useSession } from "../../components/auth/useSession";
import { awardPoints } from "./points.service";
import {
  findRewardById,
  updateReward,
  createRedemption,
  updateRedemption,
  getOrCreateMembership,
  findAllTiers,
} from "./rule.repository";
import type { Redemption, RewardProduct } from "./models";

interface RedeemParams {
  patientId: string;
  rewardId: string;
  notes?: string;
}

export interface RedeemResult {
  ok: boolean;
  redemption?: Redemption;
  error?: string;
}

/** 客户申请兑换 — 创建订单,扣减积分(挂账,审核通过后真正落地) */
export async function requestRedemption(p: RedeemParams, operatorId = "system"): Promise<RedeemResult> {
  const reward = await findRewardById(p.rewardId);
  if (!reward) return { ok: false, error: "商品不存在" };
  if (!reward.enabled) return { ok: false, error: "商品已下架" };
  if (reward.stock === 0) return { ok: false, error: "库存不足" };

  const membership = await getOrCreateMembership(p.patientId);
  if (reward.tierRequired && membership.tier !== reward.tierRequired) {
    const tiers = await findAllTiers();
    const requiredTier = tiers.find(t => t.tier === reward.tierRequired);
    return { ok: false, error: `需要 ${requiredTier?.name ?? reward.tierRequired} 及以上等级` };
  }

  const tiers = await findAllTiers();
  const tier = tiers.find(t => t.tier === membership.tier);
  const discount = tier?.discountOnRedeem ?? 1;
  const actualCost = Math.round(reward.pointsCost * discount);

  if (membership.points < actualCost) {
    return { ok: false, error: `积分不足,需要 ${actualCost},当前 ${membership.points}` };
  }

  // 扣减积分(写流水)
  await awardPoints({
    patientId: p.patientId,
    delta: -actualCost,
    reason: `兑换: ${reward.name}${tier && discount < 1 ? ` (${tier.name} ${Math.round(discount * 100)}折)` : ""}`,
    triggerType: "manual",
    refType: "manual",
    operatorId,
  });

  // 扣库存
  if (reward.stock > 0) {
    await updateReward(reward.id, { stock: reward.stock - 1 });
  }

  // 创建订单
  const redemption: Redemption = {
    id: `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patientId: p.patientId,
    rewardId: p.rewardId,
    rewardName: reward.name,
    pointsCost: actualCost,
    status: "pending",
    notes: p.notes ?? null,
    operatorId,
    createdAt: new Date().toISOString(),
    fulfilledAt: null,
    cancelledAt: null,
    deletedAt: null,
  };
  await createRedemption(redemption);
  return { ok: true, redemption };
}

/** 治疗师审核通过 */
export async function fulfillRedemption(redemptionId: string, operatorId: string): Promise<RedeemResult> {
  const all = await (await import("./rule.repository")).findAllRedemptions();
  const r = all.find(x => x.id === redemptionId);
  if (!r) return { ok: false, error: "订单不存在" };
  if (r.status !== "pending") return { ok: false, error: `订单已是 ${r.status} 状态` };
  await updateRedemption(redemptionId, { status: "fulfilled", fulfilledAt: new Date().toISOString() });
  return { ok: true };
}

/** 取消订单 — 退还积分 */
export async function cancelRedemption(redemptionId: string, operatorId: string): Promise<RedeemResult> {
  const all = await (await import("./rule.repository")).findAllRedemptions();
  const r = all.find(x => x.id === redemptionId);
  if (!r) return { ok: false, error: "订单不存在" };
  if (r.status !== "pending") return { ok: false, error: `订单已是 ${r.status} 状态` };

  await updateRedemption(redemptionId, { status: "cancelled", cancelledAt: new Date().toISOString() });
  // 退还积分
  await awardPoints({
    patientId: r.patientId,
    delta: r.pointsCost,
    reason: `取消兑换: ${r.rewardName} (退积分)`,
    triggerType: "manual",
    refType: "manual",
    operatorId,
  });
  // 恢复库存
  const reward = await findRewardById(r.rewardId);
  if (reward && reward.stock >= 0) {
    await updateReward(r.rewardId, { stock: reward.stock + 1 });
  }
  return { ok: true };
}

/** React hook for redeem */
export function useRedeem() {
  const session = useSession();
  return (patientId: string, rewardId: string, notes?: string) =>
    requestRedemption({ patientId, rewardId, notes }, session?.userId ?? "system");
}