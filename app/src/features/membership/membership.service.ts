/**
 * 会员系统启动 — 订阅事件总线,挂载到 encounter 等服务
 */
import { useEffect } from "react";
import { membershipBus } from "./trigger-events";
import { processEvent } from "./rule-engine";
import { getSession } from "../../lib/session";
import { migrateConditionFieldsToSplit } from "./migrations";

/** 在 App 启动时调用 — 订阅事件总线 */
export function startMembershipEngine(): () => void {
  const unsub = membershipBus.on(async (event) => {
    try {
      const session = getSession();
      const operatorId = session?.userId ?? "system";
      await processEvent(event, operatorId);
    } catch (e) {
      console.error("[membership] processEvent failed:", e);
    }
  });
  return unsub;
}

/** React hook — 在 App 顶层调用一次 */
export function useMembershipEngine(): void {
  useEffect(() => {
    const unsub = startMembershipEngine();
    // 启动一次老规则迁移 — 把历史 encounter.amount + billing.recharged 改到 recharge.amount
    // 幂等:已迁过自动跳过
    void migrateConditionFieldsToSplit().catch(e => {
      console.error("[membership] migration failed:", e);
    });
    return unsub;
  }, []);
}