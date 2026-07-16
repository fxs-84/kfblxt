-- 0007 auto_confirm:DB 层强制 signUp 即确认邮箱,无需 Dashboard 切 Confirm email 开关
--
-- 不变量:
--   - 任何 auth.users 新行:email_confirmed_at := now()
--   - 这样 signUp 完成后立即可 signInWithPassword,无需等"Confirm email"开关配置
--
-- 用途:
--   - 这次应用(神经康复诊治训练系统)不需要真邮件确认流程
--   - 避免用户反复去 Supabase Dashboard 调开关
--   - 后续切换到生产真邮件验证,只需 drop trigger 即可,代码不动

-- ============================================================
-- 1. 触发器函数
-- ============================================================
create or replace function public.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if new.email_confirmed_at is null and new.email is not null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. 触发器挂到 auth.users(多次运行不会重复挂,因为 OR REPLACE)
-- ============================================================
drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_email();

-- ============================================================
-- 完成
-- ============================================================
-- 看到 "Success. No rows returned" 即成功。
-- 之后任何 signUp 都自动 confirmed,可直接 signInWithPassword。
