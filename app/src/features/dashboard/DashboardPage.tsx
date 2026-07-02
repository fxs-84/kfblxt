import { Link, useNavigate } from "react-router-dom";
import { usePatients } from "../patients/usePatients";
import { useAllEncounters } from "../encounters/useEncounters";
import { usePendingFollowups } from "../followup/useFollowup";
import { aggregateRegions } from "../encounters/encounter.select";
import { BodyMap } from "../../components/bodymap/BodyMap";
import { formatDate } from "../../lib/format";
import { regionLabel } from "../../components/bodymap/regions";
import { MyWorkStats } from "../../components/auth/MyWorkStats";
import { AgentInsights } from "../agent/AgentInsights";

function isThisMonth(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function relativeDays(d: Date): string {
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return `过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days <= 3) return `${days} 天后`;
  return `${days} 天后`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: patients = [] } = usePatients();
  const { data: encounters = [] } = useAllEncounters();
  const { data: pendingFollowups = [] } = usePendingFollowups();

  const monthEncounters = encounters.filter((e) => isThisMonth(e.encounterDate));
  const todayEncounters = encounters.filter((e) => isToday(e.encounterDate));
  const highRisk = encounters.filter((e) => e.chiefComplaint.vas >= 7).length;

  const { regions, intensity } = aggregateRegions(encounters);

  // 最近就诊(全部,前 8 条)
  const recentEncounters = [...encounters]
    .sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime())
    .slice(0, 8);

  // 为每条就诊找患者名
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const tiles = [
    { label: "在册患者", value: patients.length, accent: "accent" },
    { label: "今日就诊", value: todayEncounters.length, accent: "normal" },
    { label: "当月就诊", value: monthEncounters.length, accent: "caution" },
    { label: "高痛就诊(VAS≥7)", value: highRisk, accent: "abnormal" },
  ] as const;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">工作台</h1>
          <p className="page-subtitle">ANRM 神经科学康复 · 临床概览</p>
        </div>
        <Link to="/patients/new" className="btn btn--primary">+ 新建患者</Link>
      </header>

      <section className="tile-row">
        {tiles.map((t) => (
          <div key={t.label} className={`tile tile--${t.accent}`}>
            <span className="tile__value">{t.value}</span>
            <span className="tile__label">{t.label}</span>
          </div>
        ))}
      </section>

      <div style={{ marginBottom: "var(--space-6)" }}>
        <MyWorkStats />
      </div>

      <div className="overview-grid">
        {/* 待复诊提醒 */}
        <div className="card panel">
          <div className="panel__head">
            <h3 className="panel__title">待复诊提醒</h3>
            <span className="panel__hint">{pendingFollowups.length} 条</span>
          </div>
          {pendingFollowups.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-4)" }}>无待复诊,太好了!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {pendingFollowups.slice(0, 8).map((f) => {
                const pt = patientMap.get(f.patientId);
                const days = relativeDays(f.dueDate);
                const urgent = f.dueDate.getTime() - Date.now() < 3 * 86400000;
                return (
                  <div key={f.id} className="followup-row"
                    style={{ cursor: "pointer" }}
                    onClick={() => pt && navigate(`/patients/${pt.id}`)}>
                    <span className={`badge badge--${urgent ? "abnormal" : "caution"}`} style={{ marginRight: "var(--space-2)", fontSize: "10px" }}>
                      {days}
                    </span>
                    <strong>{pt?.name ?? f.patientId}</strong>
                    <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                      {f.note}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 最近活动 */}
        <div className="card panel">
          <div className="panel__head">
            <h3 className="panel__title">最近活动</h3>
            <Link to="/patients" className="panel__link">全部 →</Link>
          </div>
          {recentEncounters.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-4)" }}>暂无记录</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {recentEncounters.map((e) => {
                const pt = patientMap.get(e.patientId);
                return (
                  <div key={e.id} className="followup-row"
                    style={{ cursor: "pointer" }}
                    onClick={() => pt && navigate(`/patients/${pt.id}`)}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", minWidth: 48 }}>
                      {formatDate(e.encounterDate)}
                    </span>
                    <strong style={{ fontSize: "var(--text-sm)" }}>{pt?.name ?? e.patientId}</strong>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: "var(--space-2)" }}>
                      {e.chiefComplaint.regions.map((r) => regionLabel(r)).join("、")}
                    </span>
                    <span className={`badge badge--${e.chiefComplaint.vas >= 7 ? "abnormal" : e.chiefComplaint.vas >= 4 ? "caution" : "normal"}`}
                      style={{ fontSize: "10px", marginLeft: "var(--space-2)" }}>
                      VAS {e.chiefComplaint.vas}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 症状热区 */}
      <div className="card panel" style={{ marginTop: "var(--space-6)" }}>
        <div className="panel__head">
          <h3 className="panel__title">机构症状热区</h3>
          <span className="panel__hint">全部就诊症状分布聚合</span>
        </div>
        {regions.length === 0 ? (
          <div className="empty">暂无就诊数据</div>
        ) : (
          <BodyMap value={regions} intensity={intensity} />
        )}
      </div>
    </>
  );
}
