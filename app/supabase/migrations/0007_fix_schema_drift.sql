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
