/**
 * 会员系统 React hooks
 */
import { useEffect, useState } from "react";
import {
  ruleRepository,
  tierRepository,
  findAllRules,
  findAllTiers,
  getOrCreateMembership,
  getRecentLogs,
} from "../rule.repository";
import { awardPoints } from "../points.service";
import type { PointsRule, TierConfig, PatientMembership, PointsLog } from "../models";
import { useSession } from "../../../components/auth/useSession";

export function useRules(): [PointsRule[], () => Promise<void>] {
  const [rules, setRules] = useState<PointsRule[]>([]);
  const reload = async () => setRules(await findAllRules());
  useEffect(() => { void reload(); }, []);
  return [rules, reload];
}

export function useTiers(): [TierConfig[], () => Promise<void>] {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const reload = async () => setTiers(await findAllTiers());
  useEffect(() => { void reload(); }, []);
  return [tiers, reload];
}

export function usePatientMembership(patientId: string | undefined | null): [PatientMembership | null, () => Promise<void>] {
  const [m, setM] = useState<PatientMembership | null>(null);
  const reload = async () => {
    if (!patientId) { setM(null); return; }
    setM(await getOrCreateMembership(patientId));
  };
  useEffect(() => { void reload(); }, [patientId]);
  return [m, reload];
}

export function usePointsLogs(patientId: string | undefined | null, limit = 20): [PointsLog[], () => Promise<void>] {
  const [logs, setLogs] = useState<PointsLog[]>([]);
  const reload = async () => {
    if (!patientId) { setLogs([]); return; }
    setLogs(await getRecentLogs(patientId, limit));
  };
  useEffect(() => { void reload(); }, [patientId, limit]);
  return [logs, reload];
}

export function useAdjustPoints() {
  const session = useSession();
  return async (patientId: string, delta: number, reason: string) => {
    let finalDelta = delta;
    let suffix = "";
    if (delta > 0) {
      const membership = await getOrCreateMembership(patientId);
      const tiers = await findAllTiers();
      const tier = tiers.find(t => t.tier === membership.tier);
      const multiplier = tier?.pointMultiplier ?? 1;
      if (multiplier !== 1) {
        finalDelta = Math.round(delta * multiplier);
        suffix = ` (${tier?.name ?? membership.tier} ×${multiplier})`;
      }
    }
    return awardPoints({
      patientId,
      delta: finalDelta,
      reason: reason + suffix,
      triggerType: "manual",
      refType: "manual",
      operatorId: session?.userId ?? "system",
    });
  };
}

// suppress unused
export { ruleRepository, tierRepository };