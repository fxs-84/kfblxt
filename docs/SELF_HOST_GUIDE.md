# ANRM kfblxt 部署指南

本应用支持 **三种部署模式**。同一份代码,按是否填入 Supabase 环境变量自动切换。

| 模式 | 触发条件 | 数据存哪 | 适用 |
|---|---|---|---|
| **A. 单机演示** | 不配置 `.env.local` 或留空 | 浏览器 localStorage | 个人单机、个人试用 |
| **B. 多人云端** | 配置 Supabase 云免费版 URL+key | Supabase PostgreSQL | 诊所多人、不愿运维服务器 |
| **C. 多人局域网自托管** | 配置自托管 Supabase URL+key | 诊所本机 PostgreSQL | 数据不出诊所、有内部服务器 |

**核心承诺:开发者不运营任何服务器。** 选 B 的人去 supabase.com 自己注册、跑 4 个 SQL 即可。选 C 的人在自己的诊所 PC 上跑。本文档是给采用者看的,不是给您(开发者)看的运维说明。

---

## 模式 A — 单机演示(零操作)

应用自带演示数据(2 个种子客户:`张伟`、`李娜`)。下载 → 安装 → 用。

```bash
# 浏览器直接访问静态页(比如您已经在 github.io 部署了 demo)
# 默认账号:无,首次打开点"登录",再点"注册治疗师账号"任意填一个即可。
```

数据只存在这台电脑的这个浏览器里。换电脑 = 看不到这家诊所的资料。

---

## 模式 B — 多人云端(Supabase 免费版,5 分钟上手)

适合:诊所 3-10 个治疗师,有公网 internet,不想维护任何服务器。

### 步骤 1:注册 Supabase
去 [supabase.com](https://supabase.com) 注册,新建一个 project。记下:
- **Project URL**(类似 `https://xxxx.supabase.co`)
- **anon public key**(项目 Settings > API)

### 步骤 2:跑 SQL 迁移

**方式一(推荐):** 安装 Supabase CLI:
```bash
npm install -g supabase
# 或:brew install supabase/tap/supabase
```

```bash
supabase login
supabase link --project-ref xxxx       # 您的 project ref,URL 里 xxxx 部分
supabase db push                       # 自动跑 app/supabase/migrations/0001..0004
```

**方式二(不会用 CLI):** 进 Supabase 控制台 > SQL Editor,把下面 4 个文件内容依次粘进去运行:
- `app/supabase/migrations/0001_multitenant_baseline.sql`
- `app/supabase/migrations/0002_audit_trail_and_tables.sql`
- `app/supabase/migrations/0002_shares.sql`
- `app/supabase/migrations/0003_share_snapshot.sql`

### 步骤 3:配置环境变量
复制 `app/.env.example` 为 `app/.env.local`,填入:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

### 步骤 4:创建机构管理员
应用启动后,首次访问会跳到"机构初始化"页面:
- 填机构名称(例:"协和康复中心")
- 创建第一个 admin 账号(姓名、用户名、密码)
- 完成

### 步骤 5:部署前端
任选一种静态站点托管:
```bash
cd app
npm install
npm run build
# 把 dist/ 子目录上传到任何静态 host:
# - GitHub Pages(免费、自动部署)
# - Cloudflare Pages(免费、自动部署)
# - Vercel / Netlify(免费)
# - 您诊所本机的 nginx
```

### 步骤 6:医生/治疗师注册
- 管理员进入"成员管理"页面,创建医生/治疗师账号
- 或者:让员工自己注册,管理员后台批准角色

---

## 模式 C — 局域网自托管(Supabase OSS,Docker)

适合:5 人以上诊所,数据必须留在自己机器,有愿意当 server 的内网 PC。

### 步骤 1:在内网某台 PC 上装 Docker

推荐 Linux(更省心),或 Windows + Docker Desktop。

### 步骤 2:启 Supabase 自托管服务

**官方推荐:** 按 Supabase 官方文档跑 `supabase/docker` 仓库:
```bash
git clone https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# 修改 .env 里所有 POSTGRES_PASSWORD、JWT_SECRET 等
docker compose up -d
```
默认监听 `http://<内网IP>:8000`(REST + Realtime + Auth + Storage)。

### 步骤 3:执行 SQL 迁移
在 Supabase Studio(浏览器)或 psql 客户端,跑:

```bash
# 从 kfblxt 项目根目录
bash scripts/setup-multi-user.sh http://<内网IP>:8000 postgres your-password
```

(或手动跑 4 个 SQL,见模式 B 步骤 2)

### 步骤 4:配置前端 .env.local

```env
VITE_SUPABASE_URL=http://192.168.x.x:8000   # 您步骤 1 的内网 IP
VITE_SUPABASE_ANON_KEY=<自托管生成的 anon key>
```

### 步骤 5:build & 部署前端

任选:
- **A. 静态文件 + nginx**(简单):`npm run build`, 把 `dist/` 拷到任何 nginx 服务目录
- **B. Docker**:跑 `app/Dockerfile`(项目根的 docker-compose.yml 已经编排好)
- **C. GitHub Pages 后端单独内网**:前端仍部署在 GitHub Pages,`.env` 填内网 IP 即可(注意要开放 CORS)

### 步骤 6:路由器/防火墙
- 诊所内部访问:`http://192.168.x.x:<port>` 即可
- 不要把这个端口暴露到公网(数据安全 + 法规风险)

---

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 登录页一直显示"未登录" | `.env.local` 没读到 | 重启 dev server,确认 `VITE_*` 名字正确 |
| 注册提示"permission denied for table profiles" | RLS 阻止了 anon 写 | 跑完 4 个迁移 + 第一步是 supabase admin 用 service_role 创建第一个 admin |
| 多浏览器登录但看不到对方数据 | 没配 Supabase,降级到 localStorage | 走模式 B 或 C |
| docker-compose up 后 8000 端口被占 | 端口冲突 | 改 .env 的 `API_PORT` |
| 自托管的 anon key 怎么查 | Supabase Studio Settings > API | 复制 anon public 即可 |

---

## 我需要什么样的 Supabase 配置?

| Supabase 字段 | 是否必需 | 说明 |
|---|---|---|
| VITE_SUPABASE_URL | ✅ | REST + Realtime + Auth 的入口 |
| VITE_SUPABASE_ANON_KEY | ✅ | JWT 公钥,可暴露前端 |
| VITE_SUPABASE_SERVICE_KEY | ❌ | 仅服务端脚本用,**严禁**进前端 Vite 静态替换 |
| 数据库公开访问 | ❌ 关 | 必须启用 RLS(迁移已配) |

LLM API key(AI 助手用)不进 `.env`,用的时候治疗师在 AI 助手面板里自己输入,**只存浏览器**。
