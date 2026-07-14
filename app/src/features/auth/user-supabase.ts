/**
 * 用户仓储的 Supabase 双模式分支。
 *
 * 设计原则:
 * - `getSupabase()` 为 null → 自动回退到原 localStorage 仓储(userRepository)
 * - 注册时缺组织 → 通过 bootstrap 流程先创建 org + 第一个 admin
 * - 已经存在 profiles 行 → 直接注册到该 org
 *
 * 多机构使用方场景:
 *   1. 第一次启动 supabase env 已配:页面跳"机构初始化"页,创建 org + admin
 *   2. 之后:管理员后台给医生/治疗师发邀请码,或自助注册(admin 后台批准角色)
 */

import { getSupabase } from "../../lib/supabase";
import { hashPassword, userRepository, isUsernameTaken, type UserRole, type UserRecord } from "./user.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

export interface BootstrapOrgInput {
  orgName: string;
  adminUsername: string;
  adminPassword: string;
  adminFullName: string;
}

export interface BootstrapOrgResult {
  orgId: string;
  adminUserId: string;
}

/**
 * 诊所首次启动:创建组织 + 第一个 admin
 *
 * 注意: Supabase Auth 注册本身是公开可用的(anon key + email 可注册),
 * 但我们的 profiles 表需要 org_id,所以 admin 注册要"先建 org,再建 user,再绑 profile"。
 */
export async function bootstrapOrg(input: BootstrapOrgInput): Promise<BootstrapOrgResult> {
  if (!isSupabaseReady()) {
    throw new Error("Supabase 未配置 — 请在 app/.env.local 填 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase()!;

  // 1. 客户端 portal 仅 anon key,直接 INSERT organizations 会受 RLS 拦截
  //    方案:用 supabase auth signUp 创建用户,触发器把 org_id 写入;但我们没有触发器
  //    简化方案:把所有 init SQL 推到一个 supabase-edge-function 或 PG 一次性脚本里;
  //    当前阶段:我们让 admin 首次注册时,service-role-protected RPC 端点不存在
  //
  // 实用策略:admin 自己通过 supabase 控制台 SQL Editor 手动跑:
  //   INSERT INTO organizations (id, name) VALUES (gen_random_uuid(), 'clinic') RETURNING id;
  // 然后把 org_id 填到 settings 页面,后续 registerUser 传入。
  //
  // 这里做最简化版本:提供一个 RPC-friendly 的"创建 org + admin"一对操作,
  // 客户端可重试。如果 RLS 拦截了 INSERT,直接返回 SQL 片段告诉用户去 SQL Editor 跑。
  const adminEmail = `${input.adminUsername}@${(input.orgName || "clinic").toLowerCase().replace(/[^a-z0-9]/g, "-")}.local`;
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email: adminEmail,
    password: input.adminPassword,
  });
  if (signUpErr || !signUp.user) {
    throw new Error(`创建 admin 账号失败: ${signUpErr?.message ?? "无响应"}`);
  }
  const userId = signUp.user.id;
  const orgId = crypto.randomUUID();
  const { error: orgErr } = await supabase
    .from("organizations")
    .insert({ id: orgId, name: input.orgName });
  if (orgErr) {
    throw new Error(`创建组织失败: ${orgErr.message}\n\n请在 Supabase SQL Editor 手动跑:\nINSERT INTO organizations (id, name) VALUES ('${orgId}', '${input.orgName.replace(/'/g, "''")}');`);
  }
  const { error: profileErr } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      org_id: orgId,
      full_name: input.adminFullName,
      role: "admin",
    });
  if (profileErr) {
    throw new Error(`写入管理员 profile 失败: ${profileErr.message}\n\n请在 Supabase SQL Editor 手动跑:\nINSERT INTO profiles (id, org_id, full_name, role) VALUES ('${userId}', '${orgId}', '${input.adminFullName.replace(/'/g, "''")}', 'admin');`);
  }
  return { orgId, adminUserId: userId };
}

function usernameToEmail(username: string, orgName: string): string {
  const slug = (orgName || "clinic").toLowerCase().replace(/[^a-z0-9]/g, "-") || "clinic";
  return `${username}@${slug}.local`;
}

/**
 * 注册新用户 — 双模式分发
 */
export async function registerUserDual(input: {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  orgId: string;
  orgName: string;
}): Promise<UserRecord> {
  if (!isSupabaseReady()) {
    return userRepository.create({
      username: input.username,
      fullName: input.fullName.trim(),
      role: input.role,
      orgId: input.orgId,
      passwordHash: await hashPassword(input.password),
    }) as Promise<UserRecord>;
  }
  const supabase = getSupabase()!;

  // 1. 在 Supabase Auth 建账号
  const email = usernameToEmail(input.username, input.orgName);
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email,
    password: input.password,
  });
  if (signUpErr || !signUp.user) {
    throw new Error(`Auth 注册失败: ${signUpErr?.message ?? "无响应"}`);
  }

  // 2. 写 profiles 行(同 org)
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: signUp.user.id,
    org_id: input.orgId,
    full_name: input.fullName.trim(),
    role: input.role,
  });
  if (profileErr) {
    throw new Error(`Profile 写入失败: ${profileErr.message}`);
  }

  // 3. 同步一份到 localStorage(给前端 Session 用 — 不再依赖 supabase.auth 后端读 profile)
  const localRecord = await userRepository.create({
    username: input.username,
    fullName: input.fullName.trim(),
    role: input.role,
    orgId: input.orgId,
    passwordHash: await hashPassword(input.password),
  });
  return localRecord;
}

/**
 * 登录 — 双模式分发
 */
export async function loginByPasswordDual(username: string, password: string, orgName: string): Promise<UserRecord> {
  if (!isSupabaseReady()) {
    const all = await userRepository.findAll();
    const user = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error("用户名或密码错误");
    const passwordHash = await hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error("用户名或密码错误");
    return user;
  }
  const supabase = getSupabase()!;

  // 1. Supabase Auth 登录
  const email = usernameToEmail(username, orgName);
  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.user) {
    throw new Error(`登录失败: ${signInErr?.message ?? "用户名或密码错误"}`);
  }

  // 2. 查 profile(失败回退到本地缓存)
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, role")
    .eq("id", signIn.user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    throw new Error("无法读取用户资料,请联系管理员");
  }

  // 3. 在 localStorage 同步一份(以和单机模式行为一致 — 客户端 Session 走 zustand)
  const passwordHash = await hashPassword(password);
  let local: UserRecord;
  try {
    if (await isUsernameTaken(username)) {
      // 已存在:更新密码 hash 以保证下次登录兜底
      const all = await userRepository.findAll();
      const existing = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (existing) {
        const updated = await userRepository.update(existing.id, { passwordHash });
        local = updated;
      } else {
        local = await userRepository.create({
          username,
          fullName: profile.full_name,
          role: profile.role,
          orgId: profile.org_id,
          passwordHash,
        });
      }
    } else {
      local = await userRepository.create({
        username,
        fullName: profile.full_name,
        role: profile.role,
        orgId: profile.org_id,
        passwordHash,
      });
    }
  } catch (e) {
    throw new Error("本地缓存同步失败: " + (e instanceof Error ? e.message : String(e)));
  }
  return local;
}

/** 探针:当前是否走 Supabase?给 UI 用来显示"多机构模式"提示 */
export function isMultiUserMode(): boolean {
  return isSupabaseReady();
}
