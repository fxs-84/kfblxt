-- 0013 客户预约看板(appointments)
--
-- 顶层设计:
--   · 5 状态看板: pending → confirmed → checked_in → completed / cancelled
--   · RLS 与 followups 同模式: 同机构可读;写入要求同机构(治疗师/医师/管理员均可)
--   · 索引: (org_id, start_at) 用于看板按时间扫; (org_id, status) 用于列分桶; (patient_id) 用于客户详情页
--
-- 兼容: 与 0001 基线多租户隔离一致,使用 current_org_id() 判定

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete restrict,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  project_name  text not null check (length(trim(project_name)) > 0),
  start_at      timestamptz not null,
  duration_min  integer not null check (duration_min > 0),
  therapist_id  uuid not null references public.profiles (id) on delete restrict,
  status        text not null default 'pending'
                check (status in ('pending','confirmed','checked_in','completed','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id),
  updated_at    timestamptz,
  updated_by    uuid references public.profiles (id),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id)
);

comment on table public.appointments is '客户预约 — 看板视图按 status 分列';
comment on column public.appointments.project_name is '服务/项目名,如「颈椎训练」「步态评估」';
comment on column public.appointments.status is 'pending=待确认 / confirmed=已确认 / checked_in=已到店 / completed=已完成 / cancelled=已取消';

-- 索引
create index if not exists appointments_org_start_idx on public.appointments (org_id, start_at);
create index if not exists appointments_org_status_idx on public.appointments (org_id, status);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

-- 启用 RLS
alter table public.appointments enable row level security;

-- 同机构可读
drop policy if exists appointments_select_same_org on public.appointments;
create policy appointments_select_same_org on public.appointments
  for select using (org_id = public.current_org_id());

-- 同机构可写(治疗师/医师/管理员均可创建预约)
drop policy if exists appointments_insert_same_org on public.appointments;
create policy appointments_insert_same_org on public.appointments
  for insert with check (org_id = public.current_org_id());

-- 同机构可改
drop policy if exists appointments_update_same_org on public.appointments;
create policy appointments_update_same_org on public.appointments
  for update using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- 软删只允许 admin(对齐 patients 的删除权限;治疗师的"取消"通过 status='cancelled' 表达)
drop policy if exists appointments_delete_admin_only on public.appointments;
create policy appointments_delete_admin_only on public.appointments
  for delete using (org_id = public.current_org_id() and public.has_role('admin'));
