import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePatients } from "../usePatients";
import { calcAge, formatDate, SEX_LABELS } from "../../../lib/format";
import { useSession } from "../../../components/auth/useSession";
import { MyFilterToggle, applyMyFilter } from "../../../components/auth/MyFilterToggle";

export function PatientListPage() {
  const navigate = useNavigate();
  const { data: patients, isLoading } = usePatients();
  const session = useSession();
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const filtered = useMemo(() => {
    if (!patients) return [];
    let list = applyMyFilter(patients, onlyMine, session.userId);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q) ||
        (p.medicalRecordNo ?? "").toLowerCase().includes(q),
    );
  }, [patients, query, onlyMine, session.userId]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">患者</h1>
          <p className="page-subtitle">神经科学特色病历 · 患者档案</p>
        </div>
        <Link to="/patients/new" className="btn btn--primary">
          + 新建患者
        </Link>
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
            {query ? "没有匹配的患者。" : "暂无患者,点击「新建患者」开始建档。"}
          </div>
        ) : (
          <>
            <div className="search-bar__count">
              {query ? `找到 ${filtered.length} 条匹配` : `共 ${filtered.length} 名患者`}
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
                    aria-label={`查看患者 ${p.name}`}
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
