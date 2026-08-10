# share-gateway 部署指南 — 客户扫码免填 URL/key(key 不上公网)

## 这是什么

`share-gateway` 是一个跑在您 Supabase 项目里的小函数(Edge Function),
充当客户扫码后的**唯一公开入口**:

- 客户手机打开二维码链接 → 读分享信息、提交量表,全部经过这个函数
- anon key / service key 只存在于函数运行环境,**客户浏览器永远接触不到**
- 您自己(治疗师)设备上的配置不变,照常使用
- 公开网页的代码里**不含任何 key**,别人拿到项目代码也连不上您的库

安全逻辑:token(二维码里的随机串)是唯一凭证,函数校验
"token 精确匹配 + 未撤销 + 未过期 + 量表类型匹配"四重后才放行,无法枚举他人数据。

## 部署步骤(全网页操作,约 3 分钟,不用命令行)

1. 浏览器打开 [supabase.com/dashboard](https://supabase.com/dashboard),进您的项目
2. 左侧菜单 **Edge Functions**(闪电图标)→ **Create a new function** / **Deploy a new function**
3. 函数名填:`share-gateway`(必须完全一致,链接是按这个名字拼的)
4. 把 `app/supabase/functions/share-gateway/index.ts` 的**全部内容**粘进代码编辑器,点 **Deploy**
5. 进函数的 **Settings / Details**,确认 **Enforce JWT Verification** 是**关闭**状态
   (这是公开函数,token 即凭证;开着会导致客户调用返回 401)

## 验证函数活着

浏览器访问(把 `xxxx` 换成您的项目 ref,即 Project URL 里 `https://xxxx.supabase.co` 的那段):

```
https://xxxx.supabase.co/functions/v1/share-gateway?token=anrm-00000000-0000-0000-0000-000000000000
```

- 返回 `{"error":"not found"}` → ✅ 正常(函数在线,且假 token 被正确拒绝)
- 返回 401 / "missing authorization" → JWT 校验没关,回第 5 步关掉
- 返回 404 页面 / 域名不存在 → 函数名或 ref 拼错了

## 生成新二维码

函数部署好后,在治疗师端**重新生成**量表二维码(旧二维码链接里没有 ref 参数,
客户设备不知道该找哪个项目)。新链接长这样:

```
https://<您的站点>/?share=anrm-<token>&ref=xxxx
```

客户扫码 → 直接做题 → 提交 → 结果照常出现在治疗师端(脑区结果面板)。

> 摘要分享(家庭作业那种带 #hash 的链接)本来就不需要 key,不受影响,
> 但同样建议重新生成,这样撤销/过期校验也能走网关。

## 费用

Supabase 免费额度含每月 50 万次函数调用,诊所扫码量远远用不完。

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 客户看到"链接无效或已过期" | 函数没部署 / 函数名不对 / ref 拼错 / share 被撤销或过期 | 按上面"验证函数活着"先测函数;治疗师端重新生成二维码 |
| 提交报 401 | 函数的 JWT 校验开着 | 函数 Settings 关掉 Enforce JWT Verification |
| 提交报 "type not allowed" | 该二维码没勾选这份量表 | 正常防护,重新生成时勾上 |
| 治疗师端看不到结果 | 0012 迁移没跑过 | 去 SQL Editor 跑 `scripts/all-migrations.sql` |

## CLI 部署(可选,给会用命令行的人)

```bash
cd app
supabase functions deploy share-gateway --no-verify-jwt
```
