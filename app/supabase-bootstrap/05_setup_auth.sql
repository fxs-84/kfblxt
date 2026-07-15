-- 0005 自助开通(auth trigger + 默认 org + 默认 admin 种子)
-- 不变量:
--   - 新用户注册(auth.users)时自动获得 profiles 行
--   - profiles 默认归属到一个系统级 "default-org",由当前仅有的用户持有
--   - 该用户被授予 admin 角色(整个应用第一个账号就是 admin,后续都由 admin 邀请)
--   - service_role 可绕过 RLS 直接管理 org(后续组织切换/新建由它处理)
-- 这一段解决了"4 个 SQL 全跑成功但应用连不上数据库"的根因 —— 因为空 profiles 表使所有 RLS 策略都拿不到 current_org_id(),SELECT 默默返回空。

-- ============================================================
-- 1. 默认机构(全应用共用,所有用户挂在它下面)
-- ============================================================
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001'::uuid, '默认康复中心')
on conflict (id) do nothing;

-- ============================================================
-- 2. handle_new_user trigger:用户注册自动建 profile
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org_id constant uuid := '00000000-0000-0000-0000-000000000001';
  role_to_set public.user_role;
begin
  -- 把首次注册的用户设为 admin,后续注册的复用 admin 邀请改角色
  -- 这样第一个应用用户能进组织 / 看数据,后续用户由他/她邀请
  select case
    when count(*) = 0 then 'admin'::public.user_role
    else 'therapist'::public.user_role
  end into role_to_set
  from public.profiles;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    default_org_id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    role_to_set
  );
  return new;
end;
$$;

-- 清理已有 trigger(以防重跑)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. profiles INSERT 策略
-- ============================================================
-- handle_new_user 是 SECURITY DEFINER,所以它本身不受 RLS 限制,
-- trigger 内部能正常 INSERT profiles。
-- 但应用前端的 signUp 之后如果直接 supabase.from('profiles').insert() 会撞 RLS,
-- 所以这里放行(凡是用 auth 登录过的用户都能 INSERT 自己的 profile)
-- 这是少见情况:首次自服务注册由 trigger 完成,后续用户保留这个扩展能力。
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

-- ============================================================
-- 4. organizations 写策略
-- ============================================================
-- 默认机构已经由这段 SQL 直接 INSERT(create target 是 postgres 角色,绕 RLS)
-- 后续应用侧切换机构 / 新建机构需要 service-role 调用;客户端 anon 不开放组织创建。
-- 不在这里开 INSERT 策略,确保只有数据库侧能 bootstrap 组织。

-- ============================================================
-- 完成
-- ============================================================
-- 看到 "Success. No rows returned" 即成功。
-- 之后请去:Authentication → Users → Add user → 任意邮箱/密码
-- 然后用这个邮箱/密码登录应用即可。
