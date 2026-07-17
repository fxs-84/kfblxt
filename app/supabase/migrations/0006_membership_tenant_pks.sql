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
