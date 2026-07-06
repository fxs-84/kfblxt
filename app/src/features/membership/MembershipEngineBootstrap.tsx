/**
 * 在 App 顶层挂载会员规则引擎 — 仅启动一次
 */
import { useMembershipEngine } from "./membership.service";

export function MembershipEngineBootstrap(): null {
  useMembershipEngine();
  return null;
}