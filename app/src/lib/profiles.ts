import type { UserRole } from "./rbac";

/**
 * Mock profiles 注册表。
 * Phase 1:用于解析 createdBy/updatedBy userId → 治疗师显示名。
 * 接 Supabase 后改为查询 public.profiles 表。
 */
export interface Profile {
  userId: string;
  fullName: string;
  role: UserRole;
}

const MOCK_PROFILES: Profile[] = [
  { userId: "00000000-0000-4000-8000-0000000000aa", fullName: "张医师", role: "physician" },
  { userId: "00000000-0000-4000-8000-0000000000bb", fullName: "李治疗师", role: "therapist" },
  { userId: "00000000-0000-4000-8000-0000000000cc", fullName: "王管理员", role: "admin" },
  { userId: "00000000-0000-4000-8000-0000000000dd", fullName: "陈治疗师", role: "therapist" },
];

export const DEFAULT_PROFILE = MOCK_PROFILES[0]!;

export function getProfileById(userId: string | undefined | null): Profile | null {
  if (!userId) return null;
  return MOCK_PROFILES.find((p) => p.userId === userId) ?? null;
}

export function listMockProfiles(): readonly Profile[] {
  return MOCK_PROFILES;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理员",
  physician: "医师",
  therapist: "治疗师",
};
