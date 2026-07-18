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

-- ============================================================
-- 以下为会员积分系统迁移(0005-0009),与单独迁移文件内容一致
-- ============================================================

-- 0005 创建会员积分系统表(用于已部署数据库升级)
--
-- 对应 bootstrap/11_membership.sql,覆盖:客户会员档案、积分流水、兑换商品、兑换订单、积分规则、会员等级。

-- ============================================================
-- 1. 客户会员档案
-- ============================================================
create table if not exists public.patient_memberships (
  patient_id uuid not null references public.patients (id) on delete restrict,
  org_id uuid not null references public.organizations (id) on delete restrict,
  tier text not null default 'regular',
  points integer not null default 0,
  total_earned integer not null default 0,
  total_spent numeric(12,2) not null default 0,
  registered_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  primary key (org_id, patient_id)
);

create index if not exists patient_memberships_org_id_idx on public.patient_memberships (org_id);
create index if not exists patient_memberships_deleted_at_idx on public.patient_memberships (deleted_at) where deleted_at is null;

drop trigger if exists patient_memberships_touch_audit on public.patient_memberships;
create trigger patient_memberships_touch_audit
  before update on public.patient_memberships
  for each row execute function public.touch_audit();

-- ============================================================
-- 2. 积分流水
-- ============================================================
create table if not exists public.points_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  rule_id text,
  trigger_type text,
  ref_type text,
  ref_id text,
  operator_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);

-- 兼容已部分执行过的环境:若表已存在但缺 created_by,补列
alter table public.points_logs add column if not exists created_by uuid references public.profiles (id);

create index if not exists points_logs_org_id_idx on public.points_logs (org_id);
create index if not exists points_logs_patient_id_idx on public.points_logs (patient_id);
create index if not exists points_logs_created_at_idx on public.points_logs (created_at desc);

-- ============================================================
-- 3. 兑换商品
-- ============================================================
create table if not exists public.reward_products (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  description text not null default '',
  category text not null,
  points_cost integer not null default 0,
  image_emoji text not null default '🎁',
  stock integer not null default -1,
  tier_required text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  primary key (org_id, id)
);

create index if not exists reward_products_org_id_idx on public.reward_products (org_id);
create index if not exists reward_products_enabled_idx on public.reward_products (enabled);

drop trigger if exists reward_products_touch_audit on public.reward_products;
create trigger reward_products_touch_audit
  before update on public.reward_products
  for each row execute function public.touch_audit();

-- ============================================================
-- 4. 兑换订单
-- ============================================================
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  reward_id text not null,
  reward_name text not null,
  points_cost integer not null,
  status text not null default 'pending',
  notes text,
  operator_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  foreign key (org_id, reward_id) references public.reward_products (org_id, id) on delete restrict
);

-- 兼容已部分执行过的环境:若表已存在但缺 created_by,补列
alter table public.redemptions add column if not exists created_by uuid references public.profiles (id);

create index if not exists redemptions_org_id_idx on public.redemptions (org_id);
create index if not exists redemptions_patient_id_idx on public.redemptions (patient_id);
create index if not exists redemptions_status_idx on public.redemptions (status);

drop trigger if exists redemptions_touch_audit on public.redemptions;
create trigger redemptions_touch_audit
  before update on public.redemptions
  for each row execute function public.touch_audit();

-- ============================================================
-- 5. 积分规则
-- ============================================================
create table if not exists public.points_rules (
  id text not null,
  org_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  enabled boolean not null default true,
  builtin boolean not null default false,
  trigger text not null,
  conditions jsonb not null default '[]'::jsonb,
  action jsonb not null default '{}'::jsonb,
  cooldown_days integer not null default 0,
  max_per_patient integer not null default 0,
  priority integer not null default 0,
  order_index integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  primary key (org_id, id)
);

create index if not exists points_rules_org_id_idx on public.points_rules (org_id);
create index if not exists points_rules_enabled_idx on public.points_rules (enabled);

drop trigger if exists points_rules_touch_audit on public.points_rules;
create trigger points_rules_touch_audit
  before update on public.points_rules
  for each row execute function public.touch_audit();

-- ============================================================
-- 6. 会员等级配置
-- ============================================================
create table if not exists public.tier_configs (
  tier text not null,
  org_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  color text not null default '#888888',
  icon text not null default '⭐',
  min_total_spent numeric(12,2) not null default 0,
  point_multiplier numeric(5,2) not null default 1,
  discount_on_redeem numeric(3,2) not null default 0 check (discount_on_redeem between 0 and 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  primary key (org_id, tier)
);

create index if not exists tier_configs_org_id_idx on public.tier_configs (org_id);

drop trigger if exists tier_configs_touch_audit on public.tier_configs;
create trigger tier_configs_touch_audit
  before update on public.tier_configs
  for each row execute function public.touch_audit();

-- ============================================================
-- 7. RLS
-- ============================================================
alter table public.patient_memberships enable row level security;
alter table public.points_logs enable row level security;
alter table public.reward_products enable row level security;
alter table public.redemptions enable row level security;
alter table public.points_rules enable row level security;
alter table public.tier_configs enable row level security;

-- 先删除旧策略(避免重复创建报错)
drop policy if exists patient_memberships_select_same_org on public.patient_memberships;
drop policy if exists points_logs_select_same_org on public.points_logs;
drop policy if exists reward_products_select_same_org on public.reward_products;
drop policy if exists redemptions_select_same_org on public.redemptions;
drop policy if exists points_rules_select_same_org on public.points_rules;
drop policy if exists tier_configs_select_same_org on public.tier_configs;

drop policy if exists patient_memberships_insert_writer on public.patient_memberships;
drop policy if exists points_logs_insert_writer on public.points_logs;
drop policy if exists reward_products_insert_writer on public.reward_products;
drop policy if exists redemptions_insert_writer on public.redemptions;
drop policy if exists points_rules_insert_writer on public.points_rules;
drop policy if exists tier_configs_insert_writer on public.tier_configs;

drop policy if exists patient_memberships_update_own_or_admin on public.patient_memberships;
drop policy if exists points_logs_update_own_or_admin on public.points_logs;
drop policy if exists reward_products_update_own_or_admin on public.reward_products;
drop policy if exists redemptions_update_own_or_admin on public.redemptions;
drop policy if exists points_rules_update_own_or_admin on public.points_rules;
drop policy if exists tier_configs_update_own_or_admin on public.tier_configs;

drop policy if exists patient_memberships_delete_admin on public.patient_memberships;
drop policy if exists points_logs_delete_admin on public.points_logs;
drop policy if exists reward_products_delete_admin on public.reward_products;
drop policy if exists redemptions_delete_admin on public.redemptions;
drop policy if exists points_rules_delete_admin on public.points_rules;
drop policy if exists tier_configs_delete_admin on public.tier_configs;

-- SELECT
create policy patient_memberships_select_same_org on public.patient_memberships
  for select using (org_id = public.current_org_id() and deleted_at is null);

create policy points_logs_select_same_org on public.points_logs
  for select using (org_id = public.current_org_id() and deleted_at is null);

create policy reward_products_select_same_org on public.reward_products
  for select using (org_id = public.current_org_id());

create policy redemptions_select_same_org on public.redemptions
  for select using (org_id = public.current_org_id() and deleted_at is null);

create policy points_rules_select_same_org on public.points_rules
  for select using (org_id = public.current_org_id());

create policy tier_configs_select_same_org on public.tier_configs
  for select using (org_id = public.current_org_id());

-- INSERT
create policy patient_memberships_insert_writer on public.patient_memberships
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

create policy points_logs_insert_writer on public.points_logs
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

create policy reward_products_insert_writer on public.reward_products
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

create policy redemptions_insert_writer on public.redemptions
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

create policy points_rules_insert_writer on public.points_rules
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

create policy tier_configs_insert_writer on public.tier_configs
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

-- UPDATE
create policy patient_memberships_update_writer on public.patient_memberships
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
  )
  with check (org_id = public.current_org_id());

create policy points_logs_update_own_or_admin on public.points_logs
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

create policy reward_products_update_own_or_admin on public.reward_products
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

create policy redemptions_update_writer on public.redemptions
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
  )
  with check (org_id = public.current_org_id());

create policy points_rules_update_own_or_admin on public.points_rules
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

create policy tier_configs_update_own_or_admin on public.tier_configs
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

-- DELETE
create policy patient_memberships_delete_admin on public.patient_memberships
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

create policy points_logs_delete_admin on public.points_logs
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

create policy reward_products_delete_admin on public.reward_products
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

create policy redemptions_delete_admin on public.redemptions
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

create policy points_rules_delete_admin on public.points_rules
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

create policy tier_configs_delete_admin on public.tier_configs
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

-- ============================================================
-- 完成
-- ============================================================

-- 0006 将会员中心配置表的主键改为机构级复合主键
--
-- 修复:points_rules / tier_configs / reward_products 原来使用全局 text PK,
-- 多租户环境下会导致不同机构无法 seed 相同 builtin ID 的数据。
-- 本迁移仅影响已按 0005 创建表的数据库;新库已在 0005 中直接创建复合 PK。

-- ============================================================
-- 1. 积分规则
-- ============================================================
alter table public.points_rules
  drop constraint if exists points_rules_pkey,
  add primary key (org_id, id);

-- ============================================================
-- 2. 会员等级
-- ============================================================
alter table public.tier_configs
  drop constraint if exists tier_configs_pkey,
  add primary key (org_id, tier);

-- ============================================================
-- 3. 兑换商品 + 兑换订单外键
-- ============================================================
-- 先删除旧的外键约束(Postgres 自动命名)
alter table public.redemptions
  drop constraint if exists redemptions_reward_id_fkey;

-- 修改 reward_products 主键
alter table public.reward_products
  drop constraint if exists reward_products_pkey,
  add primary key (org_id, id);

-- 重建复合外键
alter table public.redemptions
  add constraint redemptions_reward_id_fkey
  foreign key (org_id, reward_id)
  references public.reward_products (org_id, id)
  on delete restrict;

-- 0007 修复本地→云端迁移时的 schema drift
--
-- 这些列在 localStorage 业务模型中存在,但 Supabase 表之前没有,
-- 不加会导致迁移时数据丢失或写入失败。

-- encounters 消费金额
alter table public.encounters add column if not exists amount numeric(10,2) default 0;

-- treatment_plans 频次/时长/剂量
alter table public.treatment_plans add column if not exists frequency text;
alter table public.treatment_plans add column if not exists duration text;
alter table public.treatment_plans add column if not exists intervention_doses jsonb default '{}'::jsonb;

-- 0008 客户会员档案主键改为机构级复合主键
--
-- patient_memberships 之前是单列 patient_id PK,与多租户设计不一致,
-- 也与 membership-supabase.ts 的 upsert onConflict 不匹配。

alter table public.patient_memberships
  drop constraint if exists patient_memberships_pkey,
  add primary key (org_id, patient_id);

-- 0009 会员积分系统 schema drift 补偿
--
-- 背景:
--   老实例的会员表(0005 之前手工或旧 bootstrap 建的)结构与当前代码期望不一致:
--   - points_logs 缺 trigger_type / ref_type / ref_id / deleted_at 等列
--     → 消费后 appendLog insert 被 PostgREST 拒绝(列不存在),积分流水写不进、查不出;
--   - patient_memberships 主键不是 (org_id, patient_id) 复合键
--     → 积分余额 upsert 失败,积分永远不到账。
--
--   0005 的 `create table if not exists` 对已有老表不会修正结构,故需要本补偿迁移。
--   全部语句幂等(if not exists / drop policy if exists),新部署的库跑了也无害。

-- ============================================================
-- 1. 补列(只补代码实际读写的列)
-- ============================================================

-- 积分流水
alter table public.points_logs add column if not exists rule_id text;
alter table public.points_logs add column if not exists trigger_type text;
alter table public.points_logs add column if not exists ref_type text;
alter table public.points_logs add column if not exists ref_id text;
alter table public.points_logs add column if not exists operator_id uuid references public.profiles (id);
alter table public.points_logs add column if not exists created_by uuid references public.profiles (id);
alter table public.points_logs add column if not exists deleted_at timestamptz;
alter table public.points_logs add column if not exists deleted_by uuid references public.profiles (id);

-- 客户会员档案
alter table public.patient_memberships add column if not exists tier text not null default 'regular';
alter table public.patient_memberships add column if not exists points integer not null default 0;
alter table public.patient_memberships add column if not exists total_earned integer not null default 0;
alter table public.patient_memberships add column if not exists total_spent numeric(12,2) not null default 0;
alter table public.patient_memberships add column if not exists registered_at timestamptz not null default now();
alter table public.patient_memberships add column if not exists note text;
alter table public.patient_memberships add column if not exists created_by uuid references public.profiles (id);
alter table public.patient_memberships add column if not exists updated_at timestamptz not null default now();
alter table public.patient_memberships add column if not exists updated_by uuid references public.profiles (id);
alter table public.patient_memberships add column if not exists deleted_at timestamptz;
alter table public.patient_memberships add column if not exists deleted_by uuid references public.profiles (id);

-- 兑换订单
alter table public.redemptions add column if not exists notes text;
alter table public.redemptions add column if not exists operator_id uuid references public.profiles (id);
alter table public.redemptions add column if not exists created_by uuid references public.profiles (id);
alter table public.redemptions add column if not exists fulfilled_at timestamptz;
alter table public.redemptions add column if not exists cancelled_at timestamptz;
alter table public.redemptions add column if not exists deleted_at timestamptz;
alter table public.redemptions add column if not exists deleted_by uuid references public.profiles (id);

-- 积分规则
alter table public.points_rules add column if not exists builtin boolean not null default false;
alter table public.points_rules add column if not exists conditions jsonb not null default '[]'::jsonb;
alter table public.points_rules add column if not exists action jsonb not null default '{}'::jsonb;
alter table public.points_rules add column if not exists cooldown_days integer not null default 0;
alter table public.points_rules add column if not exists max_per_patient integer not null default 0;
alter table public.points_rules add column if not exists priority integer not null default 0;
alter table public.points_rules add column if not exists order_index integer not null default 0;
alter table public.points_rules add column if not exists valid_from timestamptz;
alter table public.points_rules add column if not exists valid_until timestamptz;
alter table public.points_rules add column if not exists created_by uuid references public.profiles (id);

-- 会员等级
alter table public.tier_configs add column if not exists color text not null default '#888888';
alter table public.tier_configs add column if not exists icon text not null default '⭐';
alter table public.tier_configs add column if not exists min_total_spent numeric(12,2) not null default 0;
alter table public.tier_configs add column if not exists point_multiplier numeric(5,2) not null default 1;
alter table public.tier_configs add column if not exists discount_on_redeem numeric(3,2) not null default 0;
alter table public.tier_configs add column if not exists created_by uuid references public.profiles (id);

-- 兑换商品
alter table public.reward_products add column if not exists description text not null default '';
alter table public.reward_products add column if not exists image_emoji text not null default '🎁';
alter table public.reward_products add column if not exists stock integer not null default -1;
alter table public.reward_products add column if not exists tier_required text;
alter table public.reward_products add column if not exists enabled boolean not null default true;
alter table public.reward_products add column if not exists created_by uuid references public.profiles (id);

-- ============================================================
-- 2. patient_memberships 复合主键(与代码 upsert 语义一致)
-- ============================================================
alter table public.patient_memberships
  drop constraint if exists patient_memberships_pkey,
  add primary key (org_id, patient_id);

-- ============================================================
-- 3. RLS:启用 + 重建策略(老库可能从未建过策略)
--    与 0005 第 7 节保持一致
-- ============================================================
alter table public.patient_memberships enable row level security;
alter table public.points_logs enable row level security;
alter table public.reward_products enable row level security;
alter table public.redemptions enable row level security;
alter table public.points_rules enable row level security;
alter table public.tier_configs enable row level security;

-- SELECT
drop policy if exists patient_memberships_select_same_org on public.patient_memberships;
create policy patient_memberships_select_same_org on public.patient_memberships
  for select using (org_id = public.current_org_id() and deleted_at is null);

drop policy if exists points_logs_select_same_org on public.points_logs;
create policy points_logs_select_same_org on public.points_logs
  for select using (org_id = public.current_org_id() and deleted_at is null);

drop policy if exists reward_products_select_same_org on public.reward_products;
create policy reward_products_select_same_org on public.reward_products
  for select using (org_id = public.current_org_id());

drop policy if exists redemptions_select_same_org on public.redemptions;
create policy redemptions_select_same_org on public.redemptions
  for select using (org_id = public.current_org_id() and deleted_at is null);

drop policy if exists points_rules_select_same_org on public.points_rules;
create policy points_rules_select_same_org on public.points_rules
  for select using (org_id = public.current_org_id());

drop policy if exists tier_configs_select_same_org on public.tier_configs;
create policy tier_configs_select_same_org on public.tier_configs
  for select using (org_id = public.current_org_id());

-- INSERT
drop policy if exists patient_memberships_insert_writer on public.patient_memberships;
create policy patient_memberships_insert_writer on public.patient_memberships
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

drop policy if exists points_logs_insert_writer on public.points_logs;
create policy points_logs_insert_writer on public.points_logs
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

drop policy if exists reward_products_insert_writer on public.reward_products;
create policy reward_products_insert_writer on public.reward_products
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

drop policy if exists redemptions_insert_writer on public.redemptions;
create policy redemptions_insert_writer on public.redemptions
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

drop policy if exists points_rules_insert_writer on public.points_rules;
create policy points_rules_insert_writer on public.points_rules
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

drop policy if exists tier_configs_insert_writer on public.tier_configs;
create policy tier_configs_insert_writer on public.tier_configs
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician'))
    and created_by = auth.uid()
  );

-- UPDATE
drop policy if exists patient_memberships_update_writer on public.patient_memberships;
create policy patient_memberships_update_writer on public.patient_memberships
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
  )
  with check (org_id = public.current_org_id());

drop policy if exists points_logs_update_own_or_admin on public.points_logs;
create policy points_logs_update_own_or_admin on public.points_logs
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

drop policy if exists reward_products_update_own_or_admin on public.reward_products;
create policy reward_products_update_own_or_admin on public.reward_products
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

drop policy if exists redemptions_update_writer on public.redemptions;
create policy redemptions_update_writer on public.redemptions
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
  )
  with check (org_id = public.current_org_id());

drop policy if exists points_rules_update_own_or_admin on public.points_rules;
create policy points_rules_update_own_or_admin on public.points_rules
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

drop policy if exists tier_configs_update_own_or_admin on public.tier_configs;
create policy tier_configs_update_own_or_admin on public.tier_configs
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

-- DELETE
drop policy if exists patient_memberships_delete_admin on public.patient_memberships;
create policy patient_memberships_delete_admin on public.patient_memberships
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

drop policy if exists points_logs_delete_admin on public.points_logs;
create policy points_logs_delete_admin on public.points_logs
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

drop policy if exists reward_products_delete_admin on public.reward_products;
create policy reward_products_delete_admin on public.reward_products
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

drop policy if exists redemptions_delete_admin on public.redemptions;
create policy redemptions_delete_admin on public.redemptions
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

drop policy if exists points_rules_delete_admin on public.points_rules;
create policy points_rules_delete_admin on public.points_rules
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

drop policy if exists tier_configs_delete_admin on public.tier_configs;
create policy tier_configs_delete_admin on public.tier_configs
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

-- 0010 历史消费积分回填
--
-- 背景:
--   老库缺列 + upsert bug 修复之前,客户的消费记录(billing_records type='消费')
--   没有产生积分流水,会员积分/累计消费/等级也未累计。
--   本迁移对这些历史消费补发积分,并重算会员档案,使其与流水一致。
--
-- 规则与代码一致(rule-engine.ts award_ratio):
--   积分 = round(金额 × 次数 × 等级倍率),规则 builtin_billing_consumed_ratio(1元=1积分)。
--
-- 设计:
--   - 幂等:按 ref_id 判重,重复执行不会重复补发;
--   - 只补"消费",不补充值(充值奖励是固定分+冷却,语义不同);
--   - 余额/累计/等级用"全量重算"而非增量,可自我纠正历史脏数据。
--   - 在 Supabase SQL Editor 以 postgres 角色执行,不受 RLS 限制。

-- ============================================================
-- 1. 为只有消费记录但还没有会员档案的客户建档
-- ============================================================
insert into public.patient_memberships (org_id, patient_id)
select distinct b.org_id, b.patient_id
from public.billing_records b
where b.type = '消费'
  and b.deleted_at is null
on conflict (org_id, patient_id) do nothing;

-- ============================================================
-- 2. 补缺失的消费积分流水(balance_after 先占位,第 3 步重算)
--    判重键:ref_id = 账单 id 或 关联就诊 id(与代码 getRefId 行为一致)
-- ============================================================
insert into public.points_logs (
  org_id, patient_id, delta, balance_after, reason,
  rule_id, trigger_type, ref_type, ref_id,
  operator_id, created_at, created_by
)
select
  b.org_id,
  b.patient_id,
  round(
    b.amount * case when b.sessions is not null and b.sessions > 0 then b.sessions else 1 end
    * coalesce(tc.point_multiplier, 1)
  )::int as delta,
  0 as balance_after,
  '消费积分(扣款,1元=1积分)' as reason,
  'builtin_billing_consumed_ratio' as rule_id,
  'billing.consumed' as trigger_type,
  'manual' as ref_type,
  b.id::text as ref_id,
  b.created_by as operator_id,
  b.created_at,
  b.created_by
from public.billing_records b
left join public.patient_memberships pm
  on pm.org_id = b.org_id and pm.patient_id = b.patient_id and pm.deleted_at is null
left join public.tier_configs tc
  on tc.org_id = b.org_id and tc.tier = coalesce(pm.tier, 'regular')
where b.type = '消费'
  and b.deleted_at is null
  and b.amount > 0
  and not exists (
    select 1 from public.points_logs l
    where l.rule_id = 'builtin_billing_consumed_ratio'
      and l.deleted_at is null
      and (
        l.ref_id = b.id::text
        or (b.encounter_id is not null and l.ref_id = b.encounter_id::text)
      )
  );

-- ============================================================
-- 3. 重算所有流水的操作后余额(按客户按时间累积)
--    注:用最终累积值的 max(0,·) 近似代码的逐条 clamp,
--    余额未扣成负数的场景两者完全一致。
-- ============================================================
with ordered as (
  select
    id,
    greatest(0, sum(delta) over (
      partition by org_id, patient_id
      order by created_at, id
      rows between unbounded preceding and current row
    ))::int as bal
  from public.points_logs
  where deleted_at is null
)
update public.points_logs l
set balance_after = o.bal
from ordered o
where l.id = o.id;

-- ============================================================
-- 4. 重算会员档案:当前积分 / 累计获得 / 累计消费
-- ============================================================
-- 4a. 用流水重算 points / total_earned
update public.patient_memberships pm
set
  points = agg.points,
  total_earned = agg.earned
from (
  select
    org_id, patient_id,
    greatest(0, sum(delta))::int as points,
    sum(case when delta > 0 then delta else 0 end)::int as earned
  from public.points_logs
  where deleted_at is null
  group by org_id, patient_id
) agg
where agg.org_id = pm.org_id and agg.patient_id = pm.patient_id;

-- 4b. 用消费记录重算 total_spent(与代码 ev.amount = 金额 × 次数 一致)
update public.patient_memberships pm
set total_spent = spent.total
from (
  select
    org_id, patient_id,
    sum(amount * case when sessions is not null and sessions > 0 then sessions else 1 end) as total
  from public.billing_records
  where type = '消费' and deleted_at is null
  group by org_id, patient_id
) spent
where spent.org_id = pm.org_id and spent.patient_id = pm.patient_id;

-- ============================================================
-- 5. 按累计消费重算会员等级(与 checkTierUpgrade 逻辑一致)
-- ============================================================
update public.patient_memberships pm
set tier = coalesce((
  select tc.tier
  from public.tier_configs tc
  where tc.org_id = pm.org_id
    and tc.min_total_spent <= pm.total_spent
  order by tc.min_total_spent desc
  limit 1
), 'regular')
where pm.deleted_at is null;
