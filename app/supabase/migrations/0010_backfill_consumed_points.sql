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
