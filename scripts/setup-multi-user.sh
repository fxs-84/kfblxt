#!/usr/bin/env bash
# ANRM kfblxt — 把全部 SQL 迁移推到目标 Supabase 实例(自托管 OR 云)
#
# 用法 1(自托管,有 psql):
#   setup-multi-user.sh <SUPABASE_DB_URL> psql
#   e.g. setup-multi-user.sh "postgresql://postgres:postgres@192.168.1.20:5432/postgres" psql
#
# 用法 2(Supabase Cloud,需要 db password):
#   setup-multi-user.sh <SUPABASE_DB_URL> direct
#   e.g. setup-multi-user.sh "postgresql://postgres.your-ref:YOUR_PASS@aws-0-region.pooler.supabase.com:6543/postgres" direct
#
# SUPABASE_DB_URL 格式: postgresql://USER:PASS@HOST:PORT/DBNAME
# 注意:Supabase Cloud 必须用 pooler 端口 6543(transaction mode)+ transaction 池化,
#       或者用直连 5432(session mode)。前者更稳。
#
# 退出码:0=成功,1=失败

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <SUPABASE_DB_URL> [psql|direct]"
  echo ""
  echo "示例:"
  echo "  $0 'postgresql://postgres:pass@192.168.1.20:5432/postgres' psql"
  echo "  $0 'postgresql://postgres.xxxx:pass@aws-0-region.pooler.supabase.com:6543/postgres' direct"
  exit 1
fi

DB_URL="$1"
MODE="${2:-psql}"

# Supabase 不要在生产用 IF NOT EXISTS 反复 CREATE TABLE — 但我们的迁移都用了,所以可以幂等。

# 定位到本脚本所在 repo 根的 app/supabase/migrations/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/app/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "❌ 找不到迁移目录: $MIGRATIONS_DIR"
  echo "   请从 kfblxt 项目根目录运行此脚本。"
  exit 1
fi

# 自动枚举目录下全部迁移(0001..0010,按文件名排序),新增迁移无需改本脚本
MIGRATIONS=()
while IFS= read -r f; do
  MIGRATIONS+=("$f")
done < <(ls "$MIGRATIONS_DIR"/*.sql | xargs -n1 basename | sort)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ANRM kfblxt — Supabase 多用户模式初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "目标: $DB_URL"
echo "迁移文件数: ${#MIGRATIONS[@]}"
echo "模式: $MODE"
echo ""

if [[ "$MODE" == "psql" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "❌ mode=psql 但系统未安装 psql"
    echo "   macOS:  brew install libpq && brew link --force libpq"
    echo "   Ubuntu: sudo apt install postgresql-client"
    echo "   Windows: 装 Postgres.app 或安装 psql.exe"
    exit 1
  fi
  for f in "${MIGRATIONS[@]}"; do
    echo "▶ 应用 $f ..."
    if psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$MIGRATIONS_DIR/$f" >/dev/null 2>&1; then
      echo "  ✓ $f 已应用"
    else
      # 兼容已有部分表:有些 CREATE 失败不致命
      echo "  ⚠ $f 出现告警(可能表已存在) — 重试带输出:"
      psql "$DB_URL" -v ON_ERROR_STOP=0 -f "$MIGRATIONS_DIR/$f" 2>&1 | tail -8 || true
    fi
  done
elif [[ "$MODE" == "direct" ]]; then
  echo "direct 模式 — 通过 Supabase REST SQL 端点推送。"
  echo "⚠ 此模式需要 service_role key,且当前 REST 端点不支持任意 SQL。"
  echo "  推荐用模式 psql(需要任意能连 Postgres 的 psql 客户端)。"
  echo ""
  echo "改为推荐模式:"
  echo "  $0 \"$DB_URL\" psql"
  exit 0
else
  echo "❌ 未知模式: $MODE (仅支持 psql|direct)"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ ${#MIGRATIONS[@]} 个 SQL 迁移已应用"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "下一步:"
echo "  1. 在 app/.env.local 填:"
echo "     VITE_SUPABASE_URL=<Supabase 项目的 REST URL,比如 https://xxxx.supabase.co>"
echo "     VITE_SUPABASE_ANON_KEY=<anon public key>"
echo "  2. 启动应用 (npm run dev 或部署 dist/)"
echo "  3. 首次访问会自动跳到「机构初始化」注册流程"
echo ""
echo "⚠ 提醒:Supabase Cloud 必须先关掉 'email confirmation',否则"
echo "  注册流会卡在等待验证邮件。这是一行 SQL:"
echo "    update auth.users set email_confirmed_at = now() where email_confirmed_at is null;"
echo ""
