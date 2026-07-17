# 本地数据手动迁移到 Supabase 指南

> 自动迁移功能存在数据可见性问题,已停止维护。从单机版切换到云端时,请按本指南手动把浏览器 localStorage 数据导入 Supabase。

## 0. 前置条件

1. 已在 Supabase 注册/登录,且 `profiles` 表中有你的用户记录。
2. 知道自己所属机构的 `org_id`(UUID)。
3. 知道自己的 `user_id`(即 `auth.users.id`,可在 Supabase Dashboard → Authentication → Users 查看)。
4. 已执行所有 SQL migration(`supabase/migrations/`),数据库表结构最新。

## 1. 从浏览器导出 localStorage

1. 打开应用页面。
2. F12 打开 DevTools → Application → Local Storage → `http://localhost:5173`(或你的域名)。
3. 找到以 `anrm_` 开头的 key:
   - `anrm_patients`
   - `anrm_encounters`
   - `anrm_assessments`
   - `anrm_examSessions`
   - `anrm_diagnoses`
   - `anrm_treatmentPlans`
   - `anrm_progressNotes`
   - `anrm_attachments`
   - `anrm_billing`
   - `anrm_followups`
   - `anrm_membership-memberships`
   - `anrm_membership-logs`
   - `anrm_membership-redemptions`
4. 在 Console 执行以下代码,复制返回的 JSON:

```js
const data = {};
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith("anrm_")) {
    data[key] = JSON.parse(localStorage.getItem(key) || "[]");
  }
}
JSON.stringify(data, null, 2);
```

5. 把 JSON 保存为项目根目录下的 `local_storage_export.json`。

## 2. 生成 SQL

运行脚本:

```bash
node scripts/generate-migration-sql.cjs local_storage_export.json <org_id> <user_id> > migration.sql
```

示例:

```bash
node scripts/generate-migration-sql.cjs local_storage_export.json \
  00000000-0000-0000-0000-000000000001 \
  11111111-1111-1111-1111-111111111111 > migration.sql
```

脚本会自动:
- 跳过已存在的数据(按 `id` 去重,使用 `on conflict do nothing`)。
- 把本地字段映射到数据库列(枚举值会自动归一)。
- 过滤掉关联缺失的记录(如就诊记录的客户未导入)。
- 为所有 `created_by` 写入你指定的 `user_id`。

## 3. 执行 SQL

把生成的 `migration.sql` 复制到 Supabase Dashboard → SQL Editor 执行。

或者使用 `psql`:

```bash
psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" -f migration.sql
```

> 注意:执行前建议先备份数据库(或在测试环境先跑一遍)。

## 4. 验证

执行后检查各表行数:

```sql
select 'patients' as table_name, count(*) from public.patients where org_id = '<org_id>'
union all
select 'encounters', count(*) from public.encounters where org_id = '<org_id>'
union all
select 'assessments', count(*) from public.assessments where org_id = '<org_id>'
union all
select 'exam_sessions', count(*) from public.exam_sessions where org_id = '<org_id>'
union all
select 'diagnoses', count(*) from public.diagnoses where org_id = '<org_id>'
union all
select 'treatment_plans', count(*) from public.treatment_plans where org_id = '<org_id>'
union all
select 'progress_notes', count(*) from public.progress_notes where org_id = '<org_id>'
union all
select 'attachments', count(*) from public.attachments where org_id = '<org_id>'
union all
select 'billing_records', count(*) from public.billing_records where org_id = '<org_id>'
union all
select 'followups', count(*) from public.followups where org_id = '<org_id>';
```

## 5. 常见问题

### Q1: 导入后工作台业绩仍为 0
A: `created_by` 必须是当前登录用户的 `auth.users.id`。生成 SQL 时请确保 `<user_id>` 正确。可在 Supabase Dashboard → Authentication → Users 复制 User UID。

### Q2: 就诊记录导入后看不到
A: 检查 `encounters.patient_id` 是否指向已导入的 `patients.id`;检查 `encounters.org_id` 是否等于你的机构 ID。

### Q3: 量表/查体/诊断等子记录缺失
A: 这些记录依赖 `encounter_id`。请先确保就诊记录导入成功。

### Q4: 会员数据缺失
A: 会员数据依赖患者。请先导入 `patients`,再导入 `patient_memberships`、`points_logs`、`redemptions`。

### Q5: 报错 `new row violates row-level security policy`
A: 当前 auth 用户不在 `profiles` 表里、或没有 admin/physician/therapist 任一角色。脚本生成的 INSERT 都是机构级数据,RLS 要求 `created_by = auth.uid()`,所以你的当前登录用户必须是 admin/physician/therapist。

## 6. 数据表与 localStorage key 对照

| Supabase 表 | localStorage key | 依赖 |
|-------------|------------------|------|
| patients | `anrm_patients` | - |
| encounters | `anrm_encounters` | patients |
| assessments | `anrm_assessments` | patients, encounters |
| exam_sessions | `anrm_examSessions` | patients, encounters |
| diagnoses | `anrm_diagnoses` | patients, encounters |
| treatment_plans | `anrm_treatmentPlans` | patients, encounters |
| progress_notes | `anrm_progressNotes` | patients, encounters |
| attachments | `anrm_attachments` | patients, encounters |
| billing_records | `anrm_billing` | patients, encounters(可选) |
| followups | `anrm_followups` | patients, encounters(可选) |
| patient_memberships | `anrm_membership-memberships` | patients |
| points_logs | `anrm_membership-logs` | patients |
| redemptions | `anrm_membership-redemptions` | patients, reward_products(可选) |

## 7. 执行顺序

脚本按依赖顺序输出 INSERT。已分组,顺序是:

1. `patients`
2. `encounters`
3. `assessments`、`exam_sessions`、`diagnoses`、`treatment_plans`、`progress_notes`、`attachments`、`billing_records`、`followups`(依赖 1、2)
4. `patient_memberships`、`points_logs`、`redemptions`(依赖 1)
