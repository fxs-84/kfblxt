-- 0001 多租户基线:organizations / profiles / patients + RLS 隔离
-- 核心安全不变量:任何用户只能访问自己所属机构(org_id)的数据。
-- 隔离下沉到数据库层 —— 即使前端或 API 出错,跨机构越权仍被 Postgres 拒绝。

create extension if not exists "pgcrypto";

-- 机构(租户)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

-- 用户档案:关联 auth.users,承载机构归属与角色(RBAC)
create type if not exists public.user_role as enum ('admin', 'physician', 'therapist');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.user_role not null default 'therapist',
  created_at timestamptz not null default now()
);

create index if not exists profiles_org_id_idx on public.profiles (org_id);

-- 患者档案
create type if not exists public.patient_sex as enum ('male', 'female', 'other');
create type if not exists public.dominant_hand as enum ('left', 'right', 'ambidextrous');

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  medical_record_no text not null,
  name text not null check (length(trim(name)) > 0),
  sex public.patient_sex not null,
  birth_date date not null check (birth_date <= current_date),
  phone text,
  dominant_hand public.dominant_hand,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  unique (org_id, medical_record_no)
);

create index if not exists patients_org_id_idx on public.patients (org_id);

-- 取当前登录用户所属机构(RLS 策略据此判定)
-- SECURITY DEFINER:有意以定义者权限跨 RLS 读取 profiles,仅返回调用者本人机构,
-- 不会泄露他人数据。切勿改动此不变量。
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- 判断当前用户是否具备指定角色(RBAC 下沉到 DB 层)
create or replace function public.has_role(target public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = target);
$$;

-- 开启 RLS —— 默认拒绝,必须显式放行
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;

-- organizations:仅可见自己所属机构
create policy org_select_own on public.organizations
  for select using (id = public.current_org_id());

-- profiles:仅可见同机构成员。
-- 注意:未定义 INSERT/UPDATE 策略 —— RLS 默认拒绝,故用户无法自行插入/篡改
-- profiles(尤其无法自造 org_id 越权入组)。用户开通由服务端(service_role)或
-- 管理员函数完成,后续 Auth 集成时补充受控的开通流程。
create policy profiles_select_same_org on public.profiles
  for select using (org_id = public.current_org_id());

-- patients:同机构可读;写入/修改需 patient:write 角色(admin/physician),
-- therapist 仅有 encounter:write,不能改动患者档案。写入强制 org_id 等于本人机构。
create policy patients_select_same_org on public.patients
  for select using (org_id = public.current_org_id());

create policy patients_insert_writer on public.patients
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
  );

create policy patients_update_writer on public.patients
  for update using (org_id = public.current_org_id())
  with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
  );

create policy patients_delete_admin_only on public.patients
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));
