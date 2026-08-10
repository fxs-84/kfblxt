-- 0012 自评量表二维码分发
--
-- 顶层设计:
--   · shares.mode = 'assessment' 表示这次分发的是问卷(token 进入顾客做题页)
--   · shares.scales 是被勾选的量表 ID 数组 ['brain_region','pain_assessment']
--   · 顾客提交后,数据进 assessment_submissions(匿名可 INSERT)
--   · 触发器把 submission 同步进 assessments 表,治疗师端 BrainRegionPanel 立即可见
--
-- 兼容:旧 share 记录 mode 默认 'summary',scales 默认 null,行为不变

-- 1) shares 表加 mode + scales 字段
alter table public.shares
  add column if not exists mode text not null default 'summary'
    check (mode in ('summary', 'assessment')),
  add column if not exists scales text[] default null;

comment on column public.shares.mode is 'summary = 诊治摘要,assessment = 自评量表';
comment on column public.shares.scales is 'mode=assessment 时勾选的量表 ID 数组';

-- 1.5) assessments 表防御性建表(原 09_assessments.sql 未入库,此处幂等补齐;
--      已存在实例跳过,RLS 策略保持与 0004 一致)
create table if not exists public.assessments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  patient_id  uuid not null,
  encounter_id uuid,
  type        text not null check (type in ('brain_region','pain_assessment')),
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz,
  updated_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid
);

-- 2) 新建 assessment_submissions 表(顾客匿名提交)
create table if not exists public.assessment_submissions (
  id           uuid primary key default gen_random_uuid(),
  share_id     uuid not null references public.shares(id) on delete cascade,
  org_id       uuid not null,
  patient_id   uuid not null,
  encounter_id uuid not null,
  type         text not null check (type in ('brain_region','pain_assessment')),
  payload      jsonb not null,
  submitted_at timestamptz not null default now()
);

create index if not exists assessment_submissions_share_idx
  on public.assessment_submissions (share_id);
create index if not exists assessment_submissions_encounter_idx
  on public.assessment_submissions (encounter_id);

comment on table public.assessment_submissions is
  '顾客扫码提交的自评量表结果(匿名,提交时不需登录)';

-- 3) RLS:顾客匿名可 INSERT,治疗师可读自己机构的
-- 关键:INSERT 必须开给 anon role,否则顾客扫码提交会被 RLS 拒。
-- 安全不靠 INSERT 策略,靠触发器:触发器反查 shares 校验 token/type/payload,
-- 且写入 assessments 时使用 shares 行的权威租户字段,anon 无法伪造。
alter table public.assessment_submissions enable row level security;

-- 删掉同名旧 policy 防止重跑 migration 时冲突
drop policy if exists submissions_insert_anon on public.assessment_submissions;
create policy submissions_insert_anon on public.assessment_submissions
  for insert with check (true);

drop policy if exists submissions_select_same_org on public.assessment_submissions;
create policy submissions_select_same_org on public.assessment_submissions
  for select using (org_id = public.current_org_id());

-- 4) 触发器:submission 落地后自动同步到 assessments(治疗师端立刻可见)
--
-- 安全要点(SECURITY DEFINER 必须自查):
--   · 租户/患者/就诊字段一律从 shares 行反查 —— 绝不透传 anon 提供的 org_id/patient_id/encounter_id
--   · 校验 share 未撤销、未过期
--   · 校验提交 type ∈ share.scales(拿到脑区二维码不能提交疼痛量表)
--   · 校验 payload 结构(顶层键 + 关键子键),拒绝空/畸形 payload 打崩治疗师端 UI
create or replace function public.sync_submission_to_assessment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_share public.shares%rowtype;
begin
  -- 1) 反查 share,拿权威租户字段
  select * into v_share from public.shares where id = new.share_id;
  if v_share.id is null then
    raise exception 'share not found';
  end if;
  if v_share.revoked then
    raise exception 'share revoked';
  end if;
  if v_share.expires_at <= now() then
    raise exception 'share expired';
  end if;

  -- 2) 校验提交类型在分享的量表清单内
  if v_share.scales is null or not (new.type = any(v_share.scales)) then
    raise exception 'type not allowed for this share';
  end if;

  -- 3) 校验 payload 结构(顶层键 + 关键子键,与治疗师端显示组件读取的字段对齐),
  --    拒绝畸形数据打崩治疗师端 UI
  if new.type = 'brain_region' then
    if not (new.payload ? 'responses' and new.payload ? 'score')
       or not (new.payload->'responses' ? 'items')
       or not (new.payload->'score' ? 'byRegion') then
      raise exception 'invalid brain_region payload';
    end if;
  elsif new.type = 'pain_assessment' then
    if not (new.payload ? 'csi' and new.payload ? 'slanss')
       or not (new.payload->'csi' ? 'items')
       or not (new.payload->'csi' ? 'total')
       or not (new.payload->'csi' ? 'severity')
       or not (new.payload->'slanss' ? 'items')
       or not (new.payload->'slanss' ? 'total')
       or not (new.payload->'slanss' ? 'positive') then
      raise exception 'invalid pain_assessment payload';
    end if;
  else
    raise exception 'unsupported type';
  end if;

  -- 4) 写入 assessments —— 租户字段取 v_share,不取 anon 提供的值
  insert into public.assessments
    (id, org_id, patient_id, encounter_id, type, payload, created_at, created_by)
  values
    (v_id, v_share.org_id, v_share.patient_id, v_share.encounter_id, new.type, new.payload,
     new.submitted_at, null);
  return new;
end;
$$;

drop trigger if exists trg_sync_submission on public.assessment_submissions;
create trigger trg_sync_submission
  after insert on public.assessment_submissions
  for each row execute function public.sync_submission_to_assessment();