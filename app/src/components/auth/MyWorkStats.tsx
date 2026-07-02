import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSession } from "./useSession";
import { usePatients } from "../../features/patients/usePatients";
import { useAllEncounters } from "../../features/encounters/useEncounters";
import { useAllExamSessions } from "../../features/exam/useExam";
import { useAllDiagnoses } from "../../features/diagnosis/useDiagnosis";
import { useAllTreatmentPlans } from "../../features/treatment/useTreatment";
import { useAllFollowups } from "../../features/followup/useFollowup";
import { useAllBilling } from "../../features/billing/useBilling";
import { getProfileById } from "../../lib/profiles";

function isToday(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isThisMonth(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

interface CountStat {
  label: string;
  today: number;
  month: number;
  total: number;
  to: string;
  icon: string;
}

export function MyWorkStats() {
  const session = useSession();
  const { data: patients = [] } = usePatients();
  const { data: encounters = [] } = useAllEncounters();
  const { data: examSessions = [] } = useAllExamSessions();
  const { data: diagnoses = [] } = useAllDiagnoses();
  const { data: plans = [] } = useAllTreatmentPlans();
  const { data: followups = [] } = useAllFollowups();
  const { records: billing = [] } = useAllBilling();

  const me = session.userId;
  const profile = getProfileById(me);

  const stats: CountStat[] = useMemo(() => {
    const countMine = (items: { createdBy?: string; createdAt: Date | string }[]) => {
      const mine = items.filter((it) => it.createdBy === me);
      return {
        total: mine.length,
        today: mine.filter((it) => isToday(it.createdAt)).length,
        month: mine.filter((it) => isThisMonth(it.createdAt)).length,
      };
    };

    return [
      { label: "患者建档",  today: countMine(patients).today,   month: countMine(patients).month,   total: countMine(patients).total,   to: "/patients", icon: "👤" },
      { label: "就诊记录",  today: countMine(encounters).today,  month: countMine(encounters).month,  total: countMine(encounters).total,  to: "/",         icon: "📋" },
      { label: "查体会话",  today: countMine(examSessions).today, month: countMine(examSessions).month, total: countMine(examSessions).total, to: "/", icon: "🔍" },
      { label: "诊断",      today: countMine(diagnoses).today,   month: countMine(diagnoses).month,   total: countMine(diagnoses).total,   to: "/",         icon: "🧠" },
      { label: "治疗计划",  today: countMine(plans).today,       month: countMine(plans).month,       total: countMine(plans).total,       to: "/",         icon: "💊" },
      { label: "复诊安排",  today: countMine(followups).today,   month: countMine(followups).month,   total: countMine(followups).total,   to: "/",         icon: "📅" },
      { label: "计费笔数",  today: countMine(billing).today,     month: countMine(billing).month,     total: countMine(billing).total,     to: "/",         icon: "💰" },
    ];
  }, [patients, encounters, examSessions, diagnoses, plans, followups, billing, me]);

  const todayTotal = stats.reduce((sum, s) => sum + s.today, 0);
  const monthTotal = stats.reduce((sum, s) => sum + s.month, 0);

  return (
    <div className="card panel my-work-stats">
      <div className="panel__head">
        <div>
          <h3 className="panel__title">我的工作台</h3>
          <p className="page-subtitle" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            {profile?.fullName ?? "当前治疗师"} · {session.role === "admin" ? "管理员" : session.role === "physician" ? "医师" : "治疗师"}
          </p>
        </div>
        <div className="my-work-stats__summary">
          <div className="my-work-stats__big">
            <span className="my-work-stats__big-num">{todayTotal}</span>
            <span className="my-work-stats__big-label">今日操作</span>
          </div>
          <div className="my-work-stats__big my-work-stats__big--muted">
            <span className="my-work-stats__big-num">{monthTotal}</span>
            <span className="my-work-stats__big-label">本月</span>
          </div>
        </div>
      </div>

      <div className="my-work-stats__grid">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="my-work-stat" title={`累计 ${s.total} 条`}>
            <span className="my-work-stat__icon" aria-hidden>{s.icon}</span>
            <span className="my-work-stat__label">{s.label}</span>
            <span className="my-work-stat__today">{s.today}</span>
            <span className="my-work-stat__total">/ {s.total}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
