-- 0011 会员积分系统表
--
-- 覆盖:客户会员档案、积分流水、兑换商品、兑换订单、积分规则、会员等级。
-- 所有表继承标准审计字段,启用 RLS,同机构隔离。

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

create index if not exists redemptions_org_id_idx on public.redemptions (org_id);
create index if not exists redemptions_patient_id_idx on public.redemptions (patient_id);
create index if not exists redemptions_status_idx on public.redemptions (status);

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

-- SELECT:同机构可见(排除已软删,memberships/points_logs/redemptions 还需过滤 deleted_at)
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

-- INSERT:同 org + 写权限 + created_by = 本人
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

-- UPDATE:同 org + 写权限(积分/审核需要多人更新)
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

-- UPDATE:同 org + 写权限(审核状态需要多人更新)
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

-- DELETE:仅 admin(软删由应用层 update deleted_at 处理;硬删仅管理员)
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
-- 看到 "Success. No rows returned" 即成功。
