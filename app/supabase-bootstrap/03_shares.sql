-- 0002 分享链接表(给患者看的,需跨设备访问,故走 Supabase 而非 local)
-- token 是分享的唯一标识,匿名可读(不需要 RLS 用户验证)

create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  patient_id  uuid not null,
  org_id      uuid not null,
  token       text not null unique,
  revoked     boolean not null default false,
  expires_at  timestamptz not null,
  homework    text,
  next_visit  timestamptz,
  message     text,
  created_at  timestamptz not null default now()
);

create index if not exists shares_token_idx on public.shares (token);

-- 允许匿名通过 token 读取(患者端无需登录)
create policy shares_select_by_token on public.shares
  for select using (true);

-- 只有同机构的认证用户可写入
create policy shares_insert_same_org on public.shares
  for insert with check (org_id = public.current_org_id());

create policy shares_update_same_org on public.shares
  for update using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
