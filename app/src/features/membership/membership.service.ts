/**
 * 会员系统启动 — 订阅事件总线,挂载到 encounter 等服务
 */
import { useEffect } from "react";
import { membershipBus } from "./trigger-events";
import { processEvent } from "./rule-engine";
import { getSession } from "../../lib/session";

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
    return unsub;
  }, []);
}