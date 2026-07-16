import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePatients } from "../usePatients";
import { sortPatientsByCreatedDesc } from "../patient-sort";
import { calcAge, formatDate, SEX_LABELS } from "../../../lib/format";
import { useSession } from "../../../components/auth/useSession";
import { MyFilterToggle, applyMyFilter } from "../../../components/auth/MyFilterToggle";
import { hasSupabaseConfig } from "../../../lib/supabase";
import { migrateLocalPatientsToCloud } from "../localToCloud";

type MigrateState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; inserted: number; skipped: number; errors: number }
  | { status: "error"; message: string };

export function PatientListPage() {
  const navigate = useNavigate();
  const { data: patients, isLoading } = usePatients();
  const session = useSession();
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [migrate, setMigrate] = useState<MigrateState>({ status: "idle" });

  const filtered = useMemo(() => {
    if (!patients) return [];
    let list = applyMyFilter(patients, onlyMine, session.userId);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").includes(q) ||
          (p.medicalRecordNo ?? "").toLowerCase().includes(q),
      );
    }
    // 按建档日期由近到远(desc)— 最近建档的档案优先展示
    return sortPatientsByCreatedDesc(list);
  }, [patients, query, onlyMine, session.userId]);

  const handleMigrate = async () => {
    setMigrate({ status: "running" });
    try {
      const report = await migrateLocalPatientsToCloud();
      setMigrate({ status: "done", inserted: report.inserted, skipped: report.skipped, errors: report.errors.length });
    } catch (e) {
      setMigrate({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">客户</h1>
          <p className="page-subtitle">神经科学特色病历 · 客户档案</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {hasSupabaseConfig() && migrate.status === "idle" && (
            <button className="btn btn--ghost" onClick={handleMigrate} style={{ fontSize: 13 }}>
              📤 导入本地客户
            </button>
          )}
          {migrate.status === "running" && <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>迁移中…</span>}
          {migrate.status === "done" && (
            <span style={{ fontSize: 13, color: "var(--color-success, #15803d)" }}>
              ✅ {migrate.inserted} 名导入成功{migrate.errors > 0 ? `, ${migrate.errors} 失败` : ""}
              {migrate.inserted > 0 && (
                <button className="btn btn--primary" onClick={() => window.location.reload()} style={{ marginLeft: 8, fontSize: 13 }}>
                  刷新
                </button>
              )}
            </span>
          )}
          {migrate.status === "error" && <span style={{ fontSize: 13, color: "#c33" }}>导入失败: {migrate.message}</span>}
          <Link to="/patients/new" className="btn btn--primary">
            + 新建客户
          </Link>
        </div>
      </header>

      {/* 搜索栏 */}
      <div className="search-bar">
        <svg className="search-bar__icon" viewBox="0 0 24 24" width="18" height="18"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          className="search-bar__input"
          placeholder="按姓名、手机号或病历号搜索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <MyFilterToggle
          active={onlyMine}
          onChange={setOnlyMine}
          therapistName={session.fullName}
          totalCount={patients?.length ?? 0}
          filteredCount={filtered.length}
        />
        {query && (
          <button className="search-bar__clear" onClick={() => setQuery("")} aria-label="清除搜索">
            ✕
          </button>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="empty">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {query ? "没有匹配的客户。" : "暂无客户,点击「新建客户」开始建档。"}
          </div>
        ) : (
          <>
            <div className="search-bar__count">
              {query ? `找到 ${filtered.length} 条匹配` : `共 ${filtered.length} 名客户`}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>病历号</th>
                  <th>姓名</th>
                  <th>性别</th>
                  <th>年龄</th>
                  <th>手机号</th>
                  <th>建档日期</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`查看客户 ${p.name}`}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
                      }
                    }}
                  >
                    <td>{p.medicalRecordNo}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{SEX_LABELS[p.sex]}</td>
                    <td>{calcAge(p.birthDate)} 岁</td>
                    <td>{p.phone || "—"}</td>
                    <td>{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <p className="disclaimer">
        本系统为临床辅助记录工具,查体正常值与量表阈值待医师签字确认,不作为独立诊断依据。
      </p>
    </>
  );
}
