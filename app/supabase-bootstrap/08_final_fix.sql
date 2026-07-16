-- 0008 最终修复:病人 RLS 治疗师写权限 + trigger 从 metadata 读 role
--
-- 1. 改病人表 INSERT 策略:admin / physician / therapist 都能写
-- 2. 完全重建 trigger:函数名 handle_new_user_v3(新名字),避免 create or replace 旧函数不生效
--    彻底删除旧 trigger + 旧函数,重建

-- ============================================================
-- 1. DROP 旧的病人 INSERT 策略,重建允许 therapist
-- ============================================================
drop policy if exists patients_insert_writer on public.patients;
create policy patients_insert_writer on public.patients
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and (created_by is null or created_by = auth.uid())
  );

-- ============================================================
-- 2. 彻底重建 trigger(旧函数全删)
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user_v2();
drop function if exists public.handle_new_user();

-- 2b. 新函数(全新名字 v3,create or replace 一定生效)
create or replace function public.handle_new_user_v3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare role_set public.user_role; name_set text;
begin
  role_set := case lower(coalesce(new.raw_user_meta_data->>'role',''))
    when 'admin' then 'admin'::public.user_role
    when 'physician' then 'physician'::public.user_role
    when 'therapist' then 'therapist'::public.user_role
    else 'therapist'::public.user_role end;
  if (select count(*) from public.profiles) = 0 then role_set := 'admin'::public.user_role; end if;
  name_set := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1));
  insert into public.profiles(id, org_id, full_name, role) values (new.id, '00000000-0000-0000-0000-000000000001', name_set, role_set);
  return new;
end $$;

-- 2c. 重建 trigger 指向 v3
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_v3();

-- ============================================================
-- 3. 验证旧函数已不存在
-- ============================================================
select proname, prosrc from pg_proc where proname like 'handle_new_user%';
