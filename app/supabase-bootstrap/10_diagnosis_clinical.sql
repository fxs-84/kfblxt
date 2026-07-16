-- 0010 diagnoses 加 clinical_diagnoses 列(ICD-10 临床诊断)
--
-- UI 必填项但 DB 没列,导致所有 ICD-10 诊断丢失
-- 修复:加一个 jsonb 列存数组 [{code, name, isPrimary}]

alter table public.diagnoses
  add column if not exists clinical_diagnoses jsonb not null default '[]'::jsonb;
