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

#### 2.1 跑 SQL(按顺序 4 个)

左侧 **SQL Editor** → **"New query"** → 把以下文件按顺序整段粘到查询框,**点 Run**:

| 顺序 | 打开文件 → Ctrl+A → Ctrl+C → 粘 → Run |
|---|---|
| ① | `01_baseline.sql` |
| ② | `02_tables.sql` |
| ③ | `03_shares.sql` |
| ④ | `04_snapshot.sql` |

> **每个文件跑完会显示 "Success. No rows returned"。**
> 
> 看到 "type already exists" 之类的告警?**正常**,跳过即可。

#### 2.2 拿 2 个字段

左侧 **Settings(齿轮)** → **API**,找:

- **Project URL**(长得像 `https://xxxxxx.supabase.co`)
- **Project API keys** 里的 **"anon public"** key（以 `eyJ` 开头的 JWT，约 300 多字符）

> ⚠ **不要复制 "service_role" key** — 那个权限过高,泄露会让别人全权控制您数据库。
> ⚠ 不要复制 `sb_publishable_` 开头的值——那不是真正的 anon key。

#### 2.3 填进配置页

浏览器打开(您的开发/运营人员会给您发这个链接):
```
https://fxs-84.github.io/kfblxt/
```

第一次会弹一个"配置 Supabase"页面:
- 把刚才的 URL 粘到第一个框
- 把 key 粘到第二个框
- 点"保存并开始使用"

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
