# ANRM 神经康复诊治训练系统 — 5 分钟上手

## 您需要做 2 件事

### Step 1:注册 Supabase(2 分钟)

1. 浏览器打开 https://supabase.com/dashboard
2. 点 **"Start your project"** 或 **"New Project"** 注册
3. 用**任意邮箱**注册(用 GitHub / Google 账号也行)
4. 填组织名(随便,例:"我的康复中心")
5. 设数据库密码(**自己记住**,不用现在记,稍后要)
6. Region 选**离您近的**(亚洲选 Singapore / Tokyo)
7. 点 **"Create new project"** — 等 1-2 分钟

### Step 2:跑 4 个 SQL + 拿 2 个字段(3 分钟)

注册完进入项目,左侧菜单:

#### 2.1 跑 SQL(按顺序 5 个)

左侧 **SQL Editor** → **"New query"** → 把以下文件按顺序整段粘到查询框,**点 Run**:

| 顺序 | 打开文件 → Ctrl+A → Ctrl+C → 粘 → Run |
|---|---|
| ① | `01_baseline.sql` |
| ② | `02_tables.sql` |
| ③ | `03_shares.sql` |
| ④ | `04_snapshot.sql` |
| ⑤ | `05_setup_auth.sql` ← 默认机构 + 注册自动建 profile |

> **每个文件跑完会显示 "Success. No rows returned"。**
>
> 看到 "type already exists" 之类的告警?**正常**,跳过即可。
>
> ⚠️ 不跑第 5 个会出现"SQL 都成功但应用连不上数据库"——因为空 profiles 表让 RLS 默默拒绝所有读写。

#### 2.2 注册第一个管理员账号(1 分钟)

左侧 **Authentication** → **Users** → 右上角 **"Add user"** → **"Create new user"**:
- Email: `admin@yourclinic.local`(随便填,后面就当作登录账号)
- Password: 设个 **密码 ≥ 6 位**(**记牢**,以后每次登录用)
- ☑ Auto Confirm User(必须勾,免邮件验证)
- 点 **Create user**

> 这一步会自动在 `profiles` 表给这个用户建一行,并标记为 `admin` 角色。

#### 2.3 拿 2 个字段

#### 2.2 拿 2 个字段

左侧 **Settings(齿轮)** → **API**,找:

- **Project URL**(长得像 `https://xxxxxx.supabase.co`)
- **Project API keys** 里的 **"Publishable"** key（以 `sb_publishable_` 开头 — 2025+ 新版 dashboard）
  如果你的 dashboard 较老，可能是 **"anon public"** key（`eyJ` 开头 JWT，约 200+ 字符）

> ⚠ **不要复制 "Secret keys" 里的 `sb_secret_...`** — 那个权限过高,泄露会让别人全权控制您数据库。

#### 2.4 填进配置页

打开 `https://fxs-84.github.io/kfblxt/`,会弹出"配置 Supabase":
- 把 URL 粘到第一个框
- 把 key 粘到第二个框
- 点"保存并开始使用" → 跳到登录页

#### 2.5 用注册时的邮箱 + 密码登录

配置页跳到登录页后,用 **2.2 里设的 email + password** 登录即可。第一次会以 **admin** 身份进入,后续 admin 可邀请其他 staff 加入(开发下一版支持)。

**完成。** 所有数据将存到**您自己刚注册的 Supabase** — 您的开发人员看不到、也碰不到。

---

## 之后每天怎么用

每天直接打开:
```
https://fxs-84.github.io/kfblxt/
```

配置已存到浏览器,直接进系统。

---

## 换浏览器 / 清缓存会怎样?

需要重新填一次配置(就是 Step 2.3)。

---

## 数据归谁?

- **您**(注册 Supabase 的人)**拥有**数据库
- 数据**完全**在您自己的 Supabase project 里
- 应用只是工具,不会保存数据
- 您**不**要把这个 Supabase project 的账号密码告诉别人

## 出问题怎么办?

打开配置页(URL 输错会弹),**清浏览器缓存**:
1. 浏览器设置 → 清除 cookie 和缓存
2. 重新打开 `https://fxs-84.github.io/kfblxt/`
3. 配置页重新弹出,重新填

---

## 不想注册 Supabase?只用单机演示?

配置页有"暂时跳过"按钮,点击后:
- 数据存到您浏览器(不联网)
- 换电脑 = 数据不同步
- 仅适合个人试用
