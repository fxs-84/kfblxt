-- 0008 客户会员档案主键改为机构级复合主键
--
-- patient_memberships 之前是单列 patient_id PK,与多租户设计不一致,
-- 也与 membership-supabase.ts 的 upsert onConflict 不匹配。

alter table public.patient_memberships
  drop constraint if exists patient_memberships_pkey,
  add primary key (org_id, patient_id);
