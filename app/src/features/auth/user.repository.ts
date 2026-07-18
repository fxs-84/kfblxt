import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import type { UserRole } from "../../lib/rbac";
import { z } from "zod";

/**
 * 用户账号仓储 — 注册 + 登录均存 localStorage(单机演示用)。
 * 接 Supabase Auth 后改为 supabase.auth.signUp / signInWithPassword,
 * public.profiles 表存 userId/fullName/role/orgId。
 */

export const passwordSchema = z
  .string()
  .min(6, "密码至少 6 位")
  .max(64, "密码过长");

export interface UserAccount {
  id: string;            // userId,UUID v4
  username: string;      // 唯一,登录用户名
  fullName: string;
  role: UserRole;
  orgId: string;
  /** SHA-256 hex digest(纯前端演示用,真实场景必走服务端 hash + salt) */
  passwordHash: string;
  createdAt: Date;
}

export interface UserInput {
  username: string;
  fullName: string;
  role: UserRole;
  orgId: string;
  passwordHash: string;
}

export type UserRecord = Omit<UserAccount, "passwordHash"> & Entity & { passwordHash: string };

/** 不含密码哈希的用户信息 — 登录/注册接口对外返回类型 */
export type SafeUserRecord = Omit<UserRecord, "passwordHash">;

const validateUserInput = (input: { username?: string; fullName?: string; passwordHash?: string }): UserInput => {
  if (!input.username || input.username.length < 2) throw new Error("用户名至少 2 个字符");
  if (!input.fullName || !input.fullName.trim()) throw new Error("请输入姓名");
  if (!input.passwordHash) throw new Error("密码哈希缺失");
  return input as UserInput;
};

export const userRepository: Repository<UserRecord, UserInput> =
  lazyPersistent<UserRecord, UserInput>("users", [], { validate: validateUserInput });

/** SHA-256 hex 哈希(Web Crypto API,纯前端) */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 用户名是否已存在 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const all = await userRepository.findAll();
  return all.some((u) => u.username.toLowerCase() === username.toLowerCase());
}

/** 注册新用户,失败抛错 */
export async function registerUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  orgId: string;
}): Promise<UserRecord> {
  passwordSchema.parse(input.password);
  if (await isUsernameTaken(input.username)) {
    throw new Error(`用户名 "${input.username}" 已被占用`);
  }
  const passwordHash = await hashPassword(input.password);
  return userRepository.create({
    username: input.username,
    fullName: input.fullName.trim(),
    role: input.role,
    orgId: input.orgId,
    passwordHash,
  });
}

/** 用户名 + 密码登录 */
export async function loginByPassword(username: string, password: string): Promise<UserRecord> {
  const all = await userRepository.findAll();
  const user = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) throw new Error("用户名或密码错误");
  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) throw new Error("用户名或密码错误");
  return user;
}