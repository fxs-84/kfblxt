import { useEffect, useState } from "react";
import type { UserRole } from "./rbac";
import type { UserRecord } from "../features/auth/user.repository";
import { userRepository } from "../features/auth/user.repository";

/**
 * 用户档案(profile) — 由 userRepository 提供,注册后才存在。
 * 替代早期版本的内置 mock 列表;无注册用户时返回空数组。
 */
export type Profile = Pick<UserRecord, "userId" | "fullName" | "role"> & { id: string };

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理员",
  physician: "医师",
  therapist: "治疗师",
};

export function toProfile(u: UserRecord): Profile {
  return { id: u.id, userId: u.id, fullName: u.fullName, role: u.role };
}

/** 异步查询 userId → Profile */
export async function getProfileById(userId: string | undefined | null): Promise<Profile | null> {
  if (!userId) return null;
  const u = await userRepository.findById(userId);
  return u ? toProfile(u) : null;
}

/** 批量查询 userId[] → Profile 字典 */
export async function getProfilesByIds(userIds: (string | undefined | null)[]): Promise<Record<string, Profile | null>> {
  const uniq = Array.from(new Set(userIds.filter((x): x is string => Boolean(x))));
  const entries = await Promise.all(
    uniq.map(async (id) => [id, await getProfileById(id)] as const),
  );
  return Object.fromEntries(entries);
}

/** React hook:响应式加载 Profile */
export function useProfile(userId: string | undefined | null): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!userId) { setProfile(null); return; }
    getProfileById(userId).then((p) => { if (!cancelled) setProfile(p); });
    return () => { cancelled = true; };
  }, [userId]);
  return profile;
}

/** React hook:批量加载 userId 列表 → Profile 字典 */
export function useProfiles(userIds: (string | undefined | null)[]): Record<string, Profile | null> {
  const [map, setMap] = useState<Record<string, Profile | null>>({});
  const key = userIds.filter(Boolean).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    getProfilesByIds(userIds).then((m) => { if (!cancelled) setMap(m); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}