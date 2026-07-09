/**
 * 在 App 顶层挂载会员规则引擎 — 仅启动一次
 */
import { useMembershipEngine } from "./membership.service";
import { startBirthdayScanner } from "./birthday-scanner";

export function MembershipEngineBootstrap(): null {
  useMembershipEngine();
  // 启动生日扫描器(异步,不阻塞渲染)
  if (typeof window !== "undefined") {
    setTimeout(() => startBirthdayScanner(), 0);
  }
  return null;
}