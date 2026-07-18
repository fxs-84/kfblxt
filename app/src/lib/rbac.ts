/**
 * 基于角色的访问控制(RBAC)。与 DB 迁移中的 user_role 枚举保持一致。
 */
export type UserRole = "admin" | "physician" | "therapist";

const PERMISSIONS = {
  admin: ["patient:read", "patient:write", "patient:delete", "encounter:read", "encounter:write", "membership:delete"],
  physician: ["patient:read", "patient:write", "encounter:read", "encounter:write", "membership:delete"],
  therapist: ["patient:read", "patient:write", "encounter:read", "encounter:write"],
} as const satisfies Record<UserRole, readonly string[]>;

export type Permission = (typeof PERMISSIONS)[UserRole][number];

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[role] as readonly string[]).includes(permission);
}
