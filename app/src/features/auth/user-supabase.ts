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
import { hashPassword, userRepository, isUsernameTaken, type SafeUserRecord } from "./user.repository";
import type { UserRole } from "../../lib/rbac";

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

/**
 * 用户名 → 合成 Supabase Auth 邮箱。
 *
 * 约束:
 *  - Supabase Auth 要求合法 email 格式(不能空,必须有 @,TLD 必须是公认的)。
 *    实测 `.local` 被服务端拒(报 "invalid format"),`.app` 被接受。
 *  - 应用 UI 只显示用户名 + 密码,不显示邮箱,所以必须服务端合成且对用户透明。
 *  - 所有用户在同一默认 org 下(MVP 阶段),所以邮箱域名固定一个常量,
 *    后续多 org 时改为 derived from org.slug。
 *  - 用户名规范化:仅保留 [a-z 0-9 . _ -],大写 → 小写。
 *    如果清洗后为空,用 'user' 占位。
 */
const EMAIL_DOMAIN = "nrm-default.app";

export function usernameToEmail(username: string): string {
  const clean = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    || "user";
  return `${clean}@${EMAIL_DOMAIN}`;
}

/**
 * 从 profiles 表读取当前登录用户的资料。
 *
 * 如果 profile 不存在(触发器未执行完毕等竞争条件),则自己创建一条。
 * 这样不依赖 trigger 的 metadata 解析,由应用层明确写 role + full_name。
 */
async function fetchOwnProfile(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  opts?: { fullName?: string; role?: UserRole; orgId?: string },
): Promise<{ id: string; org_id: string; full_name: string; role: string }> {
  const { data: user, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.user) throw new Error(`未登录: ${userErr?.message ?? ""}`);
  const uid = user.user.id;

  // 一次读,不存在则自动创建
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, org_id, full_name, role")
      .eq("id", uid)
      .maybeSingle();
    if (error) throw new Error(`读 profile 失败: ${error.message}`);
    if (data) return data;

    // profile 不存在 — 常见于 signUp 之后 trigger 还没触发完。立即自己建一条。
    if (opts) {
      const { error: insertErr } = await supabase.from("profiles").insert({
        id: uid,
        org_id: opts.orgId ?? "00000000-0000-0000-0000-000000000001",
        full_name: opts.fullName ?? "用户",
        role: opts.role ?? "therapist",
      });
      if (insertErr) throw new Error(`创建 profile 失败: ${insertErr.message}`);
    } else {
      throw new Error("profile 缺失且无 fallback 数据,无法完成注册");
    }
  }
  throw new Error("profile 读取超时");
}

/**
 * 注册新用户 — 双模式分发。
 *
 * Supabase 模式下的行为:
 *  1. supabase.auth.signUp 提交 email + password + raw_user_meta_data={full_name, role}
 *  2. handle_new_user 触发器自动 INSERT profiles 行(role 从 metadata 取,full_name 同理)
 *  3. 立即读回 profile,返回 AuthUid / orgId / fullName / role
 */
export async function registerUserDual(input: {
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  /** 保留以兼容现有 caller;Supabase 模式下被忽略(从 profile 读) */
  orgId?: string;
}): Promise<SafeUserRecord> {
  if (!isSupabaseReady()) {
    return userRepository.create({
      username: input.username,
      fullName: input.fullName.trim(),
      role: input.role,
      orgId: input.orgId ?? "00000000-0000-4000-8000-0000000000f0",
      passwordHash: await hashPassword(input.password),
    }) as Promise<SafeUserRecord>;
  }
  const supabase = getSupabase()!;

  const email = usernameToEmail(input.username);

  // 注册:由于 auth.email_confirm 通常需要邮件确认才能拿到 session,
  // 我们注册后主动做一次 signInWithPassword 拉起 session。
  // 这样不依赖 Dashboard "Confirm email" 开关。
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: input.role,
        username: input.username.trim(),
      },
    },
  });
  if (signUpErr) {
    throw new Error(`Auth 注册失败: ${signUpErr.message}`);
  }
  if (!signUp.user) {
    throw new Error("Auth 注册失败: 未返回 user 对象");
  }

  // 没有 session(因为 email 未确认),主动签入拉起 session
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: input.password });
  if (signInErr) {
    const msg = signInErr.message.toLowerCase();
    if (msg.includes("email not confirmed")) {
      throw new Error(
        `注册成功,但 Supabase 要求 email 确认后才允许登录(默认安全策略)。\n` +
        `解决方法(任选其一,推荐 ①):\n` +
        `  ① Supabase Dashboard → Authentication → Providers → Email → 关掉 "Confirm email" 开关\n` +
        `  ② Supabase SQL Editor 跑: update auth.users set email_confirmed_at = now() where email = '${email}';\n` +
        `  ③ 我给你留个"我已经确认邮箱了,重试登录"的按钮(改前端即可)`
      );
    }
    throw new Error(`注册成功,但立即签入失败: ${signInErr.message}`);
  }

  const profile = await fetchOwnProfile(supabase, {
    fullName: input.fullName.trim(),
    role: input.role,
    orgId: "00000000-0000-0000-0000-000000000001",
  });
  return {
    id: profile.id,
    username: input.username.trim(),
    fullName: profile.full_name,
    role: profile.role as UserRole,
    orgId: profile.org_id,
    createdAt: new Date(),
  };
}

/**
 * 登录 — 双模式分发。
 *
 * Supabase 模式:
 *  1. signInWithPassword
 *  2. 读 profile → 返回 profile 驱动的 userId/orgId/role/fullName
 *  3. 不再写 localStorage(单一数据源就是 Supabase)
 */
export async function loginByPasswordDual(
  username: string,
  password: string,
): Promise<SafeUserRecord> {
  if (!isSupabaseReady()) {
    const all = await userRepository.findAll();
    const user = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error("用户名或密码错误");
    const passwordHash = await hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error("用户名或密码错误");
    return user;
  }
  const supabase = getSupabase()!;

  const email = usernameToEmail(username);
  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.user) {
    throw new Error(`登录失败: ${signInErr?.message ?? "用户名或密码错误"}`);
  }

  const profile = await fetchOwnProfile(supabase);
  return {
    id: profile.id,
    username: username.trim(),
    fullName: profile.full_name,
    role: profile.role as UserRole,
    orgId: profile.org_id,
    createdAt: new Date(),
  };
}

/** 探针:当前是否走 Supabase?给 UI 用来显示"多机构模式"提示 */
export function isMultiUserMode(): boolean {
  return isSupabaseReady();
}
