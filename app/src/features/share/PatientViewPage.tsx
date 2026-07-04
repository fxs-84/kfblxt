/**
 * 患者端视图 — 通过分享链接打开,展示本次就诊摘要、家庭作业、复查/对比照片和复诊时间。
 * 只读,无需登录,纯展示。
 *
 * 数据来源优先级:
 * 1. share.snapshot (创建分享时打入 Supabase,跨设备可用)
 * 2. localStorage 仓储 (旧分享无 snapshot 时回退,仅医生设备可用)
 */
import { useParams, useSearchParams } from "react-router-dom";
import { useShareByToken } from "./useShare";
import { useDiagnosis } from "../diagnosis/useDiagnosis";
import { useExamSessions } from "../exam/useExam";
import { useTreatmentPlans } from "../treatment/useTreatment";
import { useAttachments } from "../attachments/useAttachments";
import { usePatientEncounters } from "../encounters/useEncounters";
import { ExamResultSummary } from "../exam/components/ExamResultSummary";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";
import { regionLabel } from "../../components/bodymap/regions";
import { formatDate } from "../../lib/format";
import type { ShareSnapshot } from "./share.types";

export function PatientViewPage() {
  const { token: pathToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = pathToken ?? searchParams.get("share") ?? "";
  const { data: share, isLoading: shareLoading } = useShareByToken(token);
  const snapshot = share?.snapshot as ShareSnapshot | null | undefined;

  const encounterId = share?.encounterId;

  // snapshot 不存在时回退 localStorage 查询(兼容旧分享,仅医生设备有效)
  const useFallback = !snapshot;
  const { data: encounters } = usePatientEncounters(useFallback ? share?.patientId : undefined);
  const encounter = useFallback
    ? encounters?.find((e) => e.id === encounterId)
    : null;
  const { data: sessions = [] } = useExamSessions(useFallback ? encounterId : undefined);
  const { data: diagnosis } = useDiagnosis(useFallback ? encounterId : undefined);
  const { data: plans = [] } = useTreatmentPlans(useFallback ? encounterId : undefined);
  const { data: attachments = [] } = useAttachments(useFallback ? encounterId : undefined);

  if (shareLoading) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: "var(--space-6)", fontFamily: "var(--font-sans)" }}>
        <div className="empty">加载中…</div>
      </div>
    );
  }

  if (!share) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: "var(--space-6)", textAlign: "center", fontFamily: "var(--font-sans)" }}>
        <h2 style={{ color: "var(--color-abnormal)" }}>链接无效或已过期</h2>
        <p style={{ color: "var(--color-text-muted)" }}>请联系您的主治治疗师获取新的分享链接。</p>
      </div>
    );
  }

  // snapshot 路径:直接从快照渲染
  // fallback 路径:验证 encounter 存在
  if (!snapshot && !encounter) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: "var(--space-6)", textAlign: "center", fontFamily: "var(--font-sans)" }}>
        <h2 style={{ color: "var(--color-abnormal)" }}>链接无效或已过期</h2>
        <p style={{ color: "var(--color-text-muted)" }}>请联系您的主治治疗师获取新的分享链接。</p>
      </div>
    );
  }

  const beforeAfter = snapshot
    ? snapshot.attachments.filter((a) => a.category === "疗效对比")
    : attachments.filter((a) => a.category === "疗效对比");

  // snapshot 路径的数据
  const encDate = snapshot?.encounter?.encounterDate
    ? new Date(snapshot.encounter.encounterDate)
    : encounter?.encounterDate;
  const visitType = snapshot?.encounter?.visitType ?? encounter?.visitType;
  const regions = snapshot?.encounter?.chiefComplaint.regions ?? encounter?.chiefComplaint.regions ?? [];
  const nature = snapshot?.encounter?.chiefComplaint.nature ?? encounter?.chiefComplaint.nature ?? [];
  const displayDiagnosis = snapshot?.diagnosis ?? diagnosis;
  const displaySessions = snapshot ? snapshot.sessions : sessions;
  const displayPlans = snapshot ? snapshot.plans : plans;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-8) var(--space-6)", fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
      {/* 头部 */}
      <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, margin: "0 0 var(--space-1)" }}>康复诊治摘要</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
          {encDate ? formatDate(encDate) : ""}{visitType ? ` · ${visitType}` : ""}
        </p>
      </div>

      {/* 主诉 */}
      {(regions.length > 0 || nature.length > 0) && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-3)", color: "var(--color-accent)" }}>本次就诊</h2>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
            {regions.map((r) => (
              <span key={r} className="chip-static">{regionLabel(r)}</span>
            ))}
          </div>
          <p style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0" }}>
            症状: {nature.join("、")}
          </p>
        </div>
      )}

      {/* 查体摘要 */}
      {displaySessions.length > 0 && (
        <div className="card" style={{ padding: "var(--space-4) var(--space-5)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-2)", color: "var(--color-accent)" }}>查体结果</h2>
          {displaySessions.map((s) => (
            <ExamResultSummary key={s.id} session={s as Parameters<typeof ExamResultSummary>[0]["session"]} />
          ))}
        </div>
      )}

      {/* 诊断 */}
      {displayDiagnosis && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-2)", color: "var(--color-accent)" }}>评估结论</h2>
          <p style={{ fontSize: "var(--text-sm)" }}>
            {displayDiagnosis.levels.join("、")}{" · "}{displayDiagnosis.mechanisms.join("、")}
          </p>
          {displayDiagnosis.reasoning && (
            <p style={{ fontSize: "var(--text-sm)", fontStyle: "italic", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
              {displayDiagnosis.reasoning}
            </p>
          )}
        </div>
      )}

      {/* 治疗计划 */}
      {displayPlans.length > 0 && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-3)", color: "var(--color-accent)" }}>治疗计划</h2>
          {displayPlans.map((plan) => (
            <div key={plan.id} style={{ marginBottom: "var(--space-3)" }}>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{plan.phase} · {plan.frequency} · {plan.duration}</p>
              <p style={{ fontSize: "var(--text-sm)" }}>
                干预: {plan.interventionIds.map((id) => INTERVENTIONS_CATALOG.find((d) => d.id === id)?.name ?? id).join("、")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 治疗师留言 */}
      {share.message && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)", background: "linear-gradient(135deg, #f0f7fa, #ffffff)", borderLeft: "4px solid var(--color-accent)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap" }}>{share.message}</p>
        </div>
      )}

      {/* 家庭作业(核心患者价值) */}
      {share.homework && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)", border: "2px solid var(--color-accent-light)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-3)", color: "var(--color-accent)" }}>🏠 居家训练作业</h2>
          <div style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            {share.homework}
          </div>
        </div>
      )}

      {/* 疗效对比照片 */}
      {beforeAfter.length > 0 && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-3)", color: "var(--color-accent)" }}>📸 康复进展对比</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "var(--space-3)" }}>
            {beforeAfter.map((a) => (
              <div key={a.id} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <img src={a.dataUrl} alt={a.fileName} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "var(--space-2)", fontSize: "var(--text-xs)", textAlign: "center" }}>
                  {a.timeline && <span className={`badge badge--${a.timeline === "治疗前" ? "abnormal" : a.timeline === "治疗中" ? "caution" : "normal"}`}>{a.timeline}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 下次复诊 */}
      {share.nextVisit && (
        <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)", background: "linear-gradient(135deg, #fef8ed, #ffffff)", borderLeft: "4px solid var(--color-caution)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-2)", color: "var(--color-caution)" }}>📅 下次复诊</h2>
          <p style={{ fontSize: "var(--text-xl)", fontWeight: 800, margin: 0 }}>{formatDate(share.nextVisit)}</p>
        </div>
      )}

      {/* 尾部 */}
      <div style={{ textAlign: "center", marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--color-border)" }}>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", margin: 0 }}>
          本摘要由治疗师通过病历系统生成,仅供患者本人查看。
        </p>
      </div>
    </div>
  );
}
