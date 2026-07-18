-- 0011 progress_notes 补疗效复评列
--
-- 背景:
--   TreatmentPanel 的"疗效复评"一直按 outcome / vas_after / adjustment 写入,
--   但 progress_notes 表只有 SOAP 列,Supabase 模式下这些字段被静默丢弃
--   (且 horizon not null 约束导致 insert 直接失败)。
--   本迁移补齐复评三列,与 treatment.types.ts / noteToRow 对齐。
--   幂等,重复执行无害。

alter table public.progress_notes add column if not exists outcome text;
alter table public.progress_notes add column if not exists vas_after smallint check (vas_after between 0 and 10);
alter table public.progress_notes add column if not exists adjustment text;
