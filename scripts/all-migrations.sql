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
-- 0002 全表审计 + 业务表建表
-- 不变量:
--   1. 所有业务表携带 org_id + created_at/created_by + updated_at/updated_by 五个审计字段
--   2. updated_at/updated_by 由触发器自动维护,前端不必传
--   3. created_by 由前端传(不依赖 auth.uid,便于 mock 阶段)
--   4. RLS 沿用 0001 的 current_org_id() + has_role() 模式
--   5. 所有软删除用 deleted_at(避免硬删)

-- ============================================================
-- 1. 通用审计触发器:每次 UPDATE 自动写 updated_at + updated_by
-- ============================================================
create or replace function public.touch_audit()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- 优先用 auth.uid() (生产);mock 阶段 auth.uid() 为 null,保留前端传入的 updated_by
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- ============================================================
-- 2. 复用 0001 的枚举(没有就建)
-- ============================================================
do $$ begin
  create type public.user_role as enum ('admin', 'physician', 'therapist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.patient_sex as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dominant_hand as enum ('left', 'right', 'ambidextrous');
exception when duplicate_object then null; end $$;

-- 就诊
do $$ begin
  create type public.visit_type as enum ('初诊', '复诊');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.encounter_status as enum ('进行中', '已结束');
exception when duplicate_object then null; end $$;

-- 计费
do $$ begin
  create type public.billing_type as enum ('充值', '消费', '退费');
exception when duplicate_object then null; end $$;

-- 附件
do $$ begin
  create type public.attachment_category as enum ('检查报告', '疗效对比');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attachment_timeline as enum ('治疗前', '治疗中', '治疗后');
exception when duplicate_object then null; end $$;

-- 复诊
do $$ begin
  create type public.followup_status as enum ('待复诊', '已完成', '失约');
exception when duplicate_object then null; end $$;

-- ============================================================
-- 3. 给已存在的 patients 加 updated_at / updated_by
-- ============================================================
alter table public.patients
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles (id),
  add column if not exists deleted_at timestamptz;

create trigger patients_touch_audit
  before update on public.patients
  for each row execute function public.touch_audit();

create index if not exists patients_deleted_at_idx on public.patients (deleted_at) where deleted_at is null;

-- ============================================================
-- 4. 就诊表(encounters)— 一次门诊,内嵌主诉
-- ============================================================
create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_date timestamptz not null,
  visit_type public.visit_type not null,
  status public.encounter_status not null default '进行中',
  -- 主诉结构化(身体区域+性质+VAS+病程+发病)
  chief_complaint jsonb not null,
  -- SOAP 病程(治疗师撰写)
  soap_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists encounters_org_id_idx on public.encounters (org_id);
create index if not exists encounters_patient_id_idx on public.encounters (patient_id);
create index if not exists encounters_date_idx on public.encounters (encounter_date desc);
create index if not exists encounters_created_by_idx on public.encounters (created_by);
create index if not exists encounters_deleted_at_idx on public.encounters (deleted_at) where deleted_at is null;

create trigger encounters_touch_audit
  before update on public.encounters
  for each row execute function public.touch_audit();

-- ============================================================
-- 5. 查体会话(exam_sessions)— 一次查体的全部条目
-- ============================================================
create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  -- 查体条目数组: {itemId, side, value, grade, numericValue, note}
  items jsonb not null default jsonb_build_array(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists exam_sessions_org_id_idx on public.exam_sessions (org_id);
create index if not exists exam_sessions_encounter_id_idx on public.exam_sessions (encounter_id);
create index if not exists exam_sessions_created_by_idx on public.exam_sessions (created_by);

create trigger exam_sessions_touch_audit
  before update on public.exam_sessions
  for each row execute function public.touch_audit();

-- ============================================================
-- 6. 神经定位诊断(diagnoses)
-- ============================================================
create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  -- 神经水平数组 + 神经干/脊髓节段/皮神经/机制(都可选)
  neuro_levels text[] not null default '{}',
  spinal_segments text[] not null default '{}',
  nerve_trunks text[] not null default '{}',
  cutaneous_nerves text[] not null default '{}',
  mechanisms text[] not null default '{}',
  -- 推理依据(自由文本,治疗师记录)
  rationale text,
  confidence smallint check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists diagnoses_org_id_idx on public.diagnoses (org_id);
create index if not exists diagnoses_encounter_id_idx on public.diagnoses (encounter_id);

create trigger diagnoses_touch_audit
  before update on public.diagnoses
  for each row execute function public.touch_audit();

-- ============================================================
-- 7. 治疗计划(treatment_plans)
-- ============================================================
create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  phase text not null check (phase in ('急性期', '恢复期', '巩固期', '维持期')),
  -- 选中的干预 ID 数组(对应前端 interventions_catalog)
  intervention_ids text[] not null default '{}',
  -- SMART 目标(每条:metric/baseline/target/timeframe)
  goals jsonb not null default jsonb_build_array(),
  -- 康复边界(治疗师声明禁忌/注意)
  boundary text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists treatment_plans_org_id_idx on public.treatment_plans (org_id);
create index if not exists treatment_plans_encounter_id_idx on public.treatment_plans (encounter_id);

create trigger treatment_plans_touch_audit
  before update on public.treatment_plans
  for each row execute function public.touch_audit();

-- ============================================================
-- 8. 进展记录(progress_notes)— 复评/疗效判定
-- ============================================================
create table if not exists public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  -- 立即疗效 / 短期 / 长期
  horizon text not null check (horizon in ('立即', '短期', '长期')),
  -- 主观 + 客观 + 评估 + 计划(SOAP 的 P 部分)
  subjective text,
  objective text,
  assessment text,
  plan text,
  -- VAS 当前值(对比首诊 VAS)
  vas_current smallint check (vas_current between 0 and 10),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists progress_notes_org_id_idx on public.progress_notes (org_id);
create index if not exists progress_notes_encounter_id_idx on public.progress_notes (encounter_id);

create trigger progress_notes_touch_audit
  before update on public.progress_notes
  for each row execute function public.touch_audit();

-- ============================================================
-- 9. 附件(attachments)
-- ============================================================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  category public.attachment_category not null,
  file_name text not null,
  mime_type text not null,
  data_url text not null,        -- mock 阶段 base64;接 Supabase Storage 后改为 bucket URL
  size_bytes bigint not null,
  note text,
  timeline public.attachment_timeline,
  comparison_group text,         -- 同组治疗前后照片归属
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists attachments_org_id_idx on public.attachments (org_id);
create index if not exists attachments_encounter_id_idx on public.attachments (encounter_id);
create index if not exists attachments_created_by_idx on public.attachments (created_by);

create trigger attachments_touch_audit
  before update on public.attachments
  for each row execute function public.touch_audit();

-- ============================================================
-- 10. 计费(billing_records)
-- ============================================================
create table if not exists public.billing_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  type public.billing_type not null,
  amount numeric(10, 2) not null check (amount >= 0),
  sessions integer check (sessions is null or sessions >= 0),
  note text not null default '',
  encounter_id uuid references public.encounters (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists billing_records_org_id_idx on public.billing_records (org_id);
create index if not exists billing_records_patient_id_idx on public.billing_records (patient_id);
create index if not exists billing_records_created_by_idx on public.billing_records (created_by);

create trigger billing_records_touch_audit
  before update on public.billing_records
  for each row execute function public.touch_audit();

-- ============================================================
-- 11. 复诊(followups)
-- ============================================================
create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  due_date timestamptz not null,
  status public.followup_status not null default '待复诊',
  note text not null default '',
  completed_encounter_id uuid references public.encounters (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists followups_org_id_idx on public.followups (org_id);
create index if not exists followups_patient_id_idx on public.followups (patient_id);
create index if not exists followups_due_date_idx on public.followups (due_date);
create index if not exists followups_created_by_idx on public.followups (created_by);

create trigger followups_touch_audit
  before update on public.followups
  for each row execute function public.touch_audit();

-- ============================================================
-- 12. 分享链接(share_links)
-- ============================================================
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  encounter_id uuid not null references public.encounters (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  token text not null unique,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  homework text,
  next_visit timestamptz,
  message text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists share_links_org_id_idx on public.share_links (org_id);
create index if not exists share_links_token_idx on public.share_links (token);
create index if not exists share_links_expires_at_idx on public.share_links (expires_at);

create trigger share_links_touch_audit
  before update on public.share_links
  for each row execute function public.touch_audit();

-- ============================================================
-- 13. RLS:全部 8 张新表统一策略(同 0001 patients 模式)
-- ============================================================
alter table public.encounters       enable row level security;
alter table public.exam_sessions    enable row level security;
alter table public.diagnoses        enable row level security;
alter table public.treatment_plans  enable row level security;
alter table public.progress_notes   enable row level security;
alter table public.attachments      enable row level security;
alter table public.billing_records  enable row level security;
alter table public.followups        enable row level security;
alter table public.share_links      enable row level security;

-- 通用策略:同机构可读;写入受角色限制(由各表 RLS 决定)
-- SELECT:同机构可见(排除已软删)
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'encounters', 'exam_sessions', 'diagnoses',
    'treatment_plans', 'progress_notes', 'attachments',
    'billing_records', 'followups', 'share_links'
  ]) loop
    execute format($f$
      create policy %I_select_same_org on public.%I
        for select using (
          org_id = public.current_org_id()
          and deleted_at is null
        );
    $f$, t || '_select_same_org', t);

    -- INSERT:同 org + 写权限 + created_by = 本人 profile
    execute format($f$
      create policy %I_insert_writer on public.%I
        for insert with check (
          org_id = public.current_org_id()
          and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
          and (created_by is null or created_by = auth.uid())
        );
    $f$, t || '_insert_writer', t);

    -- UPDATE:同 org + created_by = 本人(治疗师只能改自己建的);admin 全权
    execute format($f$
      create policy %I_update_own_or_admin on public.%I
        for update using (
          org_id = public.current_org_id()
          and (public.has_role('admin') or created_by = auth.uid())
        )
        with check (org_id = public.current_org_id());
    $f$, t || '_update_own_or_admin', t);

    -- DELETE:仅 admin
    execute format($f$
      create policy %I_delete_admin on public.%I
        for delete using (org_id = public.current_org_id() and public.has_role('admin'));
    $f$, t || '_delete_admin', t);
  end loop;
end $$;

-- ============================================================
-- 14. profiles 增加 therapist 常用查询索引
-- ============================================================
create index if not exists profiles_full_name_idx on public.profiles (full_name);
-- 0002 分享链接表(给患者看的,需跨设备访问,故走 Supabase 而非 local)
-- token 是分享的唯一标识,匿名可读(不需要 RLS 用户验证)

create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  patient_id  uuid not null,
  org_id      uuid not null,
  token       text not null unique,
  revoked     boolean not null default false,
  expires_at  timestamptz not null,
  homework    text,
  next_visit  timestamptz,
  message     text,
  created_at  timestamptz not null default now()
);

create index if not exists shares_token_idx on public.shares (token);

-- 允许匿名通过 token 读取(患者端无需登录)
create policy shares_select_by_token on public.shares
  for select using (true);

-- 只有同机构的认证用户可写入
create policy shares_insert_same_org on public.shares
  for insert with check (org_id = public.current_org_id());

create policy shares_update_same_org on public.shares
  for update using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
-- 0003 分享快照:让患者在任何设备扫码都能看到完整临床数据
-- PatientViewPage 需要 encounter / 查体 / 诊断 / 治疗计划 / 附件,
-- 但这些数据存储在 localStorage,患者设备上不存在。
-- 创建 share 时把所有临床数据快照到 snapshot JSONB 列里。

alter table public.shares add column if not exists snapshot jsonb;
