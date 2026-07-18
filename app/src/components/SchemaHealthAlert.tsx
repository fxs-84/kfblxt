/**
 * SchemaHealthAlert — 当检测到关键列缺失时显示的修复指引页。
 *
 * 与 SetupWizard 不同:SetupWizard 是首次配置 Supabase 连接;
 * SchemaHealthAlert 是连接已成功,但表结构不完整,需要补迁移。
 */
import { useEffect, useState } from "react";
import { checkSchemaHealth, buildFixScript, type MissingColumn } from "../lib/schema-check";

export function SchemaHealthAlert() {
  const [missing, setMissing] = useState<MissingColumn[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void checkSchemaHealth().then((m) => {
      setMissing(m);
      setChecked(true);
    });
  }, []);

  if (!checked || missing.length === 0) return null;

  const script = buildFixScript(missing);

  return (
    <div className="setup-wizard" style={{ maxWidth: 720, margin: "60px auto", padding: "var(--space-6)" }}>
      <h1 style={{ marginTop: 0, color: "var(--color-abnormal)" }}>⚠ 数据库结构需要更新</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        应用检测到 Supabase 数据库中缺少以下列。代码已经发到新版本,
        但旧数据库没跑过最新的迁移脚本,导致保存数据失败。
      </p>

      <div style={{
        background: "var(--color-surface-sunken, #fef3f2)",
        border: "1px solid var(--color-abnormal, #f66)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-4)",
      }}>
        <strong>缺失列清单</strong>
        <ul style={{ marginTop: 8, marginBottom: 0 }}>
          {missing.map((m) => (
            <li key={`${m.table}.${m.column}`} style={{ fontFamily: "monospace", fontSize: 13 }}>
              {m.table}.<strong>{m.column}</strong>
            </li>
          ))}
        </ul>
      </div>

      <details style={{ marginBottom: "var(--space-4)" }} open>
        <summary style={{ cursor: "pointer", color: "var(--color-accent)", fontWeight: 600 }}>
          一键修复 SQL(复制到 Supabase SQL Editor 跑)
        </summary>
        <pre style={{
          background: "var(--color-surface-sunken, #f5f7fa)",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-sm)",
          fontSize: 13,
          overflowX: "auto",
          marginTop: "var(--space-2)",
        }}>
          {script}
        </pre>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => navigator.clipboard?.writeText(script)}
          style={{ marginTop: "var(--space-2)" }}
        >
          📋 复制 SQL
        </button>
      </details>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            const m = await checkSchemaHealth();
            setMissing(m);
            if (m.length === 0) {
              window.location.reload();
            }
          }}
        >
          我跑完迁移了,重新检查
        </button>
      </div>

      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: "var(--space-6)" }}>
        💡 提示:这套 SQL 等价于 <code>supabase/migrations/0007_fix_schema_drift.sql</code>。
        如果之后又加新列,记得在那个迁移文件里登记,并在 Supabase 重新跑。
      </p>
    </div>
  );
}