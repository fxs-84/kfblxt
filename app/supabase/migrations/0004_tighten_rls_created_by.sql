-- 0004 收紧 RLS:INSERT 强制 created_by = auth.uid()
--
-- 修复安全审查 HIGH #3:此前策略允许 created_by is null,
-- 导致未认证或任意 JWT 都可能在边界写入。
-- 本迁移删除旧 INSERT 策略并重建,要求 created_by 必须等于当前 auth 用户。
-- 同时前端已同步把 created_by 从 null 改为 getSession().userId。

-- ============================================================
-- 1. assessments 表
-- ============================================================
drop policy if exists assessments_insert_writer on public.assessments;

create policy assessments_insert_writer on public.assessments
  for insert with check (
    org_id = public.current_org_id()
    and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
    and created_by = auth.uid()
  );

-- ============================================================
-- 2. 02_tables 中统一循环创建的表
-- ============================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'encounters', 'exam_sessions', 'diagnoses',
    'treatment_plans', 'progress_notes', 'attachments',
    'billing_records', 'followups'
  ]) loop
    execute format($f$
      drop policy if exists %I_insert_writer on public.%I
    $f$, t, t);

    execute format($f$
      create policy %I_insert_writer on public.%I
        for insert with check (
          org_id = public.current_org_id()
          and (public.has_role('admin') or public.has_role('physician') or public.has_role('therapist'))
          and created_by = auth.uid()
        );
    $f$, t, t);
  end loop;
end $$;

-- ============================================================
-- 完成
-- ============================================================
