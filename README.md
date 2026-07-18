# ANRM 神经康复诊治训练系统 (kfblxt)

> 神经康复机构的病历 / 评估 / 治疗 / 会员管理一体化系统。**同一份代码,三种部署模式**。

| 模式 | 谁用 | 数据存哪 |
|---|---|---|
| 🟢 **单机** | 个人试用、个人治疗师单机 | 浏览器 localStorage |
| ☁️ **多人云端** | 诊所多人协作,公网访问 | Supabase Cloud(免费版) |
| 🏥 **局域网自托管** | 数据需留诊所,5+ 人协作 | 诊所本机 PostgreSQL |

📖 完整部署文档 → [`docs/SELF_HOST_GUIDE.md`](docs/SELF_HOST_GUIDE.md)

---

## 5 秒理解架构

`getSupabase()` 懒初始化:有 env → 走 Supabase,没 env → 落回 localStorage。**前端代码无 if 分支**,所有调用经过 `*-supabase.ts` 双模式分发器。所以同一份代码:

- 单机:开箱即用,演示数据自动种入
- 多人云端:诊所用户自己注册 Supabase 免费层,跑 1 个 SQL(`scripts/all-migrations.sql`),填 URL+anon key
- 局域网自托管:诊所用户在自托管 Supabase 跑官方 docker,同样跑这 1 个 SQL

**开发者不运营任何服务器。** 用户文档见 [`docs/SELF_HOST_GUIDE.md`](docs/SELF_HOST_GUIDE.md)。

---

## 快速开始(单机模式)

```bash
cd app
npm install
cp .env.example .env.local          # 留空即可 → 走 localStorage
npm run dev                         # http://localhost:5173
```

打开后 → 右上角"未登录" → "注册治疗师账号" → 任意填一个用户名密码 → 看到种子客户 `张伟`(腰椎间盘)和 `李娜`(颈椎)。

---

## 多用户模式 — 浏览器侧自助配置(零部署,零复制代码)

如果您用 GitHub Pages 部署给多个诊所 / 同事,**不需要他们各自 clone 代码、自己建 Supabase、自己部署**。

**最终用户首次打开 `https://fxs-84.github.io/kfblxt/` 看到的**:
- 应用启动 → 自动检查浏览器 localStorage 里的 Supabase 配置
- 没有 → **弹一个"配置向导"页面**,让用户填:
  - Supabase Project URL
  - anon / publishable key
- 用户点保存 → 实时连通性测试通过 → 存到浏览器 localStorage → reload
- **之后该用户所有数据都进他们填的 Supabase**

> **数据隔离**:每个用户的 localStorage 存自己填的 Supabase URL,数据进自己 Supabase,**开发者(您)不碰任何用户数据**。

**完整配置流程**:
1. **用户**自己到 supabase.com 注册免费 project(5 分钟,见配置页面里的 5 步折叠教程)
2. **用户**跑 `scripts/all-migrations.sql`(配置页面里有 raw 链接,一键复制;11 个迁移合一,幂等)
3. **用户**在配置页填 URL + anon key → 完成

**开发者(您)做什么**:**什么都不用做**。一份代码托管在 GitHub Pages,任何用户访问都会自己填自己的 Supabase。

**完整技术说明**见 [`docs/SELF_HOST_GUIDE.md`](docs/SELF_HOST_GUIDE.md)。

后端已就绪:
- ✅ 13 张临床业务表 + 6 张会员积分表的 Supabase 迁移(`app/supabase/migrations/`) + RLS + 审计
- ✅ 多租户(机构)隔离,RLS 下沉到数据库
- ✅ RBAC 角色:`admin` / `physician` / `therapist`
- ✅ `share` 模块已 dual-mode(做其它业务的样板)
- ⏳ 其它业务模块(患者/就诊/评估/治疗 等)的 dual-mode 改造中

---

## 项目结构

```
kfblxt/
├── app/                              # 前端 Vite + React 19
│   ├── Dockerfile                    # 多阶段构建 → 给 docker-compose 打包
│   ├── src/
│   │   ├── features/                 # 按业务域组织
│   │   │   ├── share/                # ✅ 已 dual-mode(其它仓的参考样板)
│   │   │   ├── patients/encounters/diagnosis/exam/treatment/
│   │   │   │   membership/attachments/billing/followup/
│   │   │   │   assessments/auth/    # ⏳ 改造中
│   │   │   └── agent/                # AI 助手(规则引擎 + 可选 LLM)
│   │   └── lib/                      # 仓储基础设施、Supabase client、RBAC
│   ├── supabase/migrations/0001..0010.sql
│   └── .env.example
├── scripts/
│   └── setup-multi-user.sh           # 一键应用全部 SQL 迁移 → 目标 Supabase 实例
├── docs/
│   └── SELF_HOST_GUIDE.md            # 9 步部署指南(三种模式)
└── docker-compose.yml                # 诊所自托管 docker 编排(前端)
```

---

## 开发命令(在 `app/` 目录)

| 命令 | 用途 |
|---|---|
| `npm run dev` | Vite + HMR |
| `npm run build` | 生产构建 → `dist/` |
| `npm run test` | Vitest 单 + 集成测试 |
| `npm run coverage` | 覆盖率报告 |
| `npm run lint` | oxlint 静态检查 |
| `npm run preview` | 本地预览生产构建 |

---

## 核心约定

- **不可变更新**: 仓库数据模型用 spread + 新引用,不在原对象就地修改
- **测试覆盖**: ≥ 80%,TDD 优先
- **质量门**: 函数 < 50 行,文件 < 800 行,TypeScript strict

---

## 部署到 GitHub Pages(单机演示)

本仓库含 `.github/workflows/deploy.yml`,推到 main 自动部署。**注意**:Supabase env 部署到公网仓库时,Key 暴露在 JS bundle 是预期行为(Supabase anon key 本就被设计为前端可读),但仍可能不希望诊所数据通过 GitHub Pages 转发。LAN 自托管请绕开 GitHub Pages,改走内网 nginx / Cloudflare Tunnel。

---

## 许可

MIT — 允许:个人使用、诊所内部使用、教学、研究、商业诊所使用。禁止:将客户数据向第三方销售。

---

## 致谢

- ANRM 肌骨神经康复系列手册(治疗方法学)
- TanStack Query / Zustand / Zod / Vite / React / Supabase OSS
