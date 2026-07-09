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
import { useProfile } from "../../lib/profiles";

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
  const profile = useProfile(me);

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

  // ─── 业绩核心指标 ───
  const performance = useMemo(() => {
    const myEncounters = encounters.filter((e) => e.createdBy === me);
    const myBilling = billing.filter((b) => b.createdBy === me);

    // 接诊人数(独立 patientId)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const isOnOrAfter = (d: Date, ref: Date) => d.getTime() >= ref.getTime();

    const sumAmount = (list: typeof myBilling) => list.reduce((s, b) => s + (b.amount ?? 0), 0);

    return {
      // 接诊人次(就诊疗程数)
      visitCount: {
        today: myEncounters.filter((e) => isOnOrAfter(new Date(e.encounterDate), startOfDay)).length,
        month: myEncounters.filter((e) => isOnOrAfter(new Date(e.encounterDate), startOfMonth)).length,
        total: myEncounters.length,
      },
      // 接诊人数(独立患者)
      patientsSeen: {
        today: new Set(myEncounters.filter((e) => isOnOrAfter(new Date(e.encounterDate), startOfDay)).map((e) => e.patientId)).size,
        month: new Set(myEncounters.filter((e) => isOnOrAfter(new Date(e.encounterDate), startOfMonth)).map((e) => e.patientId)).size,
        total: new Set(myEncounters.map((e) => e.patientId)).size,
      },
      // 业绩收入(元)
      revenue: {
        today: sumAmount(myBilling.filter((b) => isOnOrAfter(new Date(b.createdAt), startOfDay))),
        month: sumAmount(myBilling.filter((b) => isOnOrAfter(new Date(b.createdAt), startOfMonth))),
        total: sumAmount(myBilling),
      },
      // 复诊完成率(已结束 / 全部)
      completion: (() => {
        const total = myEncounters.length;
        if (total === 0) return { rate: 0, closed: 0, total: 0 };
        const closed = myEncounters.filter((e) => e.status === "已结束").length;
        return { rate: Math.round((closed / total) * 100), closed, total };
      })(),
    };
  }, [encounters, billing, me]);

  const fmtMoney = (n: number) => `¥${n.toLocaleString("zh-CN")}`;
  const todayTotal = stats.reduce((sum, s) => sum + s.today, 0);
  const monthTotal = stats.reduce((sum, s) => sum + s.month, 0);

  return (
    <div className="card panel my-work-stats">
      <div className="panel__head">
        <div>
          <h3 className="panel__title">📊 治疗师工作业绩</h3>
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

      {/* 业绩核心指标(独立板块) */}
      <div className="my-work-stats__perf">
        <div className="my-work-perf-item my-work-perf-item--accent">
          <span className="my-work-perf-item__label">今日接诊</span>
          <span className="my-work-perf-item__value">{performance.visitCount.today}</span>
          <span className="my-work-perf-item__hint">人次 · 本月 {performance.visitCount.month} · 累计 {performance.visitCount.total}</span>
        </div>
        <div className="my-work-perf-item">
          <span className="my-work-perf-item__label">接诊人数</span>
          <span className="my-work-perf-item__value">{performance.patientsSeen.today}</span>
          <span className="my-work-perf-item__hint">独立患者 · 本月 {performance.patientsSeen.month} · 累计 {performance.patientsSeen.total}</span>
        </div>
        <div className="my-work-perf-item my-work-perf-item--money">
          <span className="my-work-perf-item__label">业绩收入</span>
          <span className="my-work-perf-item__value">{fmtMoney(performance.revenue.today)}</span>
          <span className="my-work-perf-item__hint">本月 {fmtMoney(performance.revenue.month)} · 累计 {fmtMoney(performance.revenue.total)}</span>
        </div>
        <div className="my-work-perf-item">
          <span className="my-work-perf-item__label">接诊完成率</span>
          <span className="my-work-perf-item__value">{performance.completion.rate}%</span>
          <span className="my-work-perf-item__hint">已结束 {performance.completion.closed} / 累计 {performance.completion.total}</span>
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
