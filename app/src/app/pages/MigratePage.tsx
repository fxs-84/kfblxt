import { useState } from "react";
import { Link } from "react-router-dom";
import { migrateAllToCloud } from "../../lib/migrate";
import type { MigrationReport } from "../../lib/migrate";

export function MigratePage() {
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [running, setRunning] = useState(false);

  const handleStart = async () => {
    if (running) return;
    setRunning(true);
    setReport(null);
    try {
      const result = await migrateAllToCloud();
      setReport(result);
    } catch (e) {
      setReport({
        ok: false,
        modules: [
          {
            module: "system",
            total: 0,
            inserted: 0,
            skipped: 0,
            filtered: 0,
            errors: [e instanceof Error ? e.message : String(e)],
          },
        ],
        startedAt: new Date().toISOString(),
      });
    } finally {
      setRunning(false);
    }
  };

  const totalInserted = report?.modules.reduce((sum, m) => sum + m.inserted, 0) ?? 0;
  const totalErrors = report?.modules.reduce((sum, m) => sum + m.errors.length, 0) ?? 0;

  return (
    <div className="page-content" style={{ maxWidth: 800 }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">导入本地数据到 Supabase</h1>
          <p className="page-subtitle">
            把本浏览器 localStorage 中的单机数据一次性写入当前机构数据库。
          </p>
        </div>
        <Link to="/" className="btn btn--ghost">返回首页</Link>
      </header>

      <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <p style={{ marginTop: 0 }}>
          迁移按 id 去重,已经导入过的记录不会重复写入。如果之前部分失败,可以安全地再次执行。
          因关联缺失被过滤的记录会单独列在"已过滤"列中。
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleStart}
          disabled={running}
        >
          {running ? "导入中,请稍候…" : "开始导入"}
        </button>
      </div>

      {report && (
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <h3 style={{ marginTop: 0 }}>
            {report.ok ? "导入完成" : "导入完成但有错误"}
            {" "}
            <span style={{ fontSize: 14, color: "var(--color-text-muted)", fontWeight: "normal" }}>
              共写入 {totalInserted} 条{totalErrors > 0 && `, ${totalErrors} 个错误`}
            </span>
          </h3>

          <table className="table" style={{ width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                <th>模块</th>
                <th>总数</th>
                <th>已写入</th>
                <th>已存在跳过</th>
                <th>已过滤</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {report.modules.map((m) => (
                <tr key={m.module}>
                  <td>{labelForModule(m.module)}</td>
                  <td>{m.total}</td>
                  <td>{m.inserted}</td>
                  <td>{m.skipped}</td>
                  <td>{m.filtered}</td>
                  <td>{m.errors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.modules.some((m) => m.errors.length > 0) && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <h4>错误明细</h4>
              <ul style={{ color: "#c33", fontSize: 13, maxHeight: 240, overflow: "auto" }}>
                {report.modules.flatMap((m) =>
                  m.errors.map((err, idx) => (
                    <li key={`${m.module}-${idx}`}>[{labelForModule(m.module)}] {sanitizeError(err)}</li>
                  )),
                )}
              </ul>
            </div>
          )}

          {report.ok && totalInserted > 0 && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
              style={{ marginTop: "var(--space-3)" }}
            >
              刷新页面查看数据
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function labelForModule(module: string): string {
  const map: Record<string, string> = {
    patients: "客户档案",
    encounters: "就诊记录",
    encounter_children: "量表/查体/诊断/治疗/附件/账单/复诊",
    membership: "会员数据",
    system: "系统",
    unknown: "未知",
  };
  return map[module] ?? module;
}

function sanitizeError(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique")) return "记录已存在或冲突";
  if (lower.includes("foreign key") || lower.includes("violates") || lower.includes("constraint")) {
    return "数据校验失败,请检查关联数据是否存在";
  }
  if (lower.includes("timeout")) return "请求超时,请稍后重试";
  if (lower.includes("rls") || lower.includes("row-level security") || lower.includes("permission")) {
    return "当前账号无权限执行此操作";
  }
  if (lower.includes("filtered")) return error.replace(/^\[filtered\]\s*/, "");
  return "操作失败,请重试或联系管理员";
}
