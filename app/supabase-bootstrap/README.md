# ANRM Supabase Bootstrap

这是给**非技术人员**用的快速启动包。

## 给"使用方"用户的版本

把整个 `supabase-bootstrap/` 文件夹打包成 zip 发给用户:

```bash
# 在仓库根目录
zip -r supabase-bootstrap.zip app/supabase-bootstrap/
```

或者 PowerShell:
```powershell
Compress-Archive -Path "app\supabase-bootstrap\*" -DestinationPath "supabase-bootstrap.zip"
```

用户收到 zip 后,解压缩,看 `QUICKSTART.md` 跟着做。

## 文件清单

| 文件 | 作用 |
|---|---|
| `QUICKSTART.md` | 用户的 2 步指南(纯用户视角) |
| `01_baseline.sql` | Supabase 多租户基线(organizations / profiles / patients + RLS) |
| `02_tables.sql` | 业务表(encounters / exam_sessions / diagnoses / treatment_plans / progress_notes / attachments / billing_records / followups) |
| `03_shares.sql` | 分享链接表 |
| `04_snapshot.sql` | 分享快照列 |

## 这是**单租户**启动包

每个用户(诊所)独立注册自己的 Supabase project,数据隔离在各自的 Supabase 里。
