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
