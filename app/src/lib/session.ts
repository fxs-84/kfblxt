import type { UserRole } from "./rbac";

/**
 * 会话结构。接 Supabase Auth 后 userId/role/orgId 从 JWT 与 profiles 表读取。
 */
export interface Session {
  userId: string;
  orgId: string;
  fullName: string;
  role: UserRole;
}

/**
 * 匿名会话 — 未登录状态,所有权限检查 deny。
 * 接 Supabase 前用占位 userId,登录后由 saveSession 覆盖。
 */
export const ANONYMOUS_SESSION: Session = {
  userId: "anonymous",
  orgId: "00000000-0000-4000-8000-0000000000f0",
  fullName: "未登录",
  role: "therapist",
};

/** 向后兼容:seed 数据仍在引用 MOCK_SESSION,等同演示机构常量 */
export const MOCK_SESSION = ANONYMOUS_SESSION;

/** 从 localStorage 读取已登录会话,无则返回匿名会话 */
export function getSession(): Session {
  try {
    const raw = localStorage.getItem("anrm_session");
    if (raw) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed && typeof parsed.userId === "string" && parsed.userId !== "anonymous" && typeof parsed.role === "string") {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return ANONYMOUS_SESSION;
}