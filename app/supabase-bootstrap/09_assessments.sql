-- 0009 创建量表评估表(大脑区域 / CSI / S-LANSS / ANRM 神经科学查体)
--
-- 设计:一个表覆盖多种量表,通过 type 列区分
--   brain_region: 大脑区域定位
--   pain_assessment: 疼痛评估(CSI + S-LANSS)
--
-- 全部数据存 payload jsonb(结构灵活),不再为每个量表建一张表

-- ============================================================
-- 1. 创建表
-- ============================================================
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  encounter_id uuid references public.encounters (id) on delete set null,
  type text not null check (type in ('brain_region', 'pain_assessment')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  deleted_at timestamptz
);

create index if not exists assessments_org_id_idx on public.assessments (org_id);
create index if not exists assessments_patient_id_idx on public.assessments (patient_id);
create index if not exists assessments_encounter_id_idx on public.assessments (encounter_id);
create index if not exists assessments_type_idx on public.assessments (type);

create trigger assessments_touch_audit
  before update on public.assessments
  for each row execute function public.touch_audit();

-- ============================================================
-- 2. RLS
-- ============================================================
alter table public.assessments enable row level security;

-- SELECT: 同 org + 未软删
create policy assessments_select_same_org on public.assessments
  for select using (
    org_id = public.current_org_id()
    and deleted_at is null
  );

-- INSERT: 同 org + 任意治疗师角色 + created_by = 自己
create policy assessments_insert_writer on public.assessments
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

-- UPDATE: 同 org + created_by = 自己(or admin)
create policy assessments_update_own_or_admin on public.assessments
  for update using (
    org_id = public.current_org_id()
    and (public.has_role('admin') or created_by = auth.uid())
  )
  with check (org_id = public.current_org_id());

-- DELETE: 仅 admin
create policy assessments_delete_admin on public.assessments
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));

-- ============================================================
-- 完成
-- ============================================================
-- 看到 "Success. No rows returned" 即成功。
