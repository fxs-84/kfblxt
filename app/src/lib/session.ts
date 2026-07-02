import type { UserRole } from "./rbac";
import { DEFAULT_PROFILE } from "./profiles";

/**
 * Phase 1 mock 会话。真实认证在接入 Supabase Auth 后替换,
 * 届时 orgId/role 从 JWT 与 profiles 表读取。当前用固定演示机构。
 */
export interface Session {
  userId: string;
  orgId: string;
  fullName: string;
  role: UserRole;
}

export const MOCK_SESSION: Session = {
  userId: DEFAULT_PROFILE.userId,
  orgId: "00000000-0000-4000-8000-0000000000f0",
  fullName: DEFAULT_PROFILE.fullName,
  role: DEFAULT_PROFILE.role,
};

export function getSession(): Session {
  return MOCK_SESSION;
}
