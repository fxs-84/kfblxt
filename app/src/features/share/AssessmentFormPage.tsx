import { useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useShareByToken } from "./useShare";
import { BRAIN_REGION_ITEMS, PHONE_EAR_OPTIONS, scoreBrainRegion, type BrainRegionResponses, type PhoneEarPreference } from "../assessments/scales/brain-region";
import { CSI_ITEMS, scoreCsi } from "../assessments/scales/csi";
import { SLANSS_ITEMS, scoreSlanss } from "../assessments/scales/slanss";
import { submitAssessmentSubmission, SCALE_LABEL } from "./submit-submission";
import { PatientViewPage } from "./PatientViewPage";
import type { ScaleId } from "./share.types";

/**
 * 顾客扫码后的统一入口。
 *
 * 顶层设计:
 *   - ?share=<token> 自动进入本页(由 router 处理)
 *   - mode='assessment' 且 scales 非空 → 渲染自评量表问卷
 *   - mode='summary' 或缺失 → 渲染只读 PatientViewPage(摘要)
 *   - 顾客在手机上作答,提交 → assessment_submissions(anon INSERT)
 *   - DB 触发器同步到 assessments,治疗师端立刻看到结果
 */
export function AssessmentFormPage() {
  const { token: pathToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = pathToken ?? searchParams.get("share") ?? "";

  const { data: share, isLoading } = useShareByToken(token || undefined);

  // 仅 mode=assessment 且 scales 非空时显示问卷
  const isAssessment = share?.mode === "assessment" && (share.scales?.length ?? 0) > 0;

  if (!token) {
    return <ErrorScreen title="链接无效" hint="请向您的主治治疗师重新获取二维码。" />;
  }

  if (isLoading) return <LoadingScreen />;

  if (!share) {
    return <ErrorScreen title="链接无效或已过期" hint="请联系您的主治治疗师获取新的分享链接。" />;
  }

  // 摘要模式 → 复用 PatientViewPage(只读)
  if (!isAssessment) {
    return <PatientViewPage />;
  }

  return <AssessmentRunner share={share} />;
}

/** ============ 错误 / 加载页 ============ */

function ErrorScreen({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: "var(--space-6)", textAlign: "center", fontFamily: "var(--font-sans)" }}>
      <h2 style={{ color: "var(--color-abnormal)" }}>{title}</h2>
      <p style={{ color: "var(--color-text-muted)" }}>{hint}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: "var(--space-6)", textAlign: "center", fontFamily: "var(--font-sans)" }}>
      <div className="empty">加载中…</div>
    </div>
  );
}

/** ============ 主导表:遍历 scales 渲染各表 ============ */

function AssessmentRunner({ share }: { share: NonNullable<ReturnType<typeof useShareByToken>["data"]> }) {
  const scales = share.scales ?? [];
  const [step, setStep] = useState(0);
  const [brainResponses, setBrainResponses] = useState<BrainRegionResponses>({ items: {}, phoneEar: null });
  const [csiAnswers, setCsiAnswers] = useState<Record<number, number>>({});
  const [slanssAnswers, setSlanssAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Record<ScaleId, boolean>>({ brain_region: false, pain_assessment: false });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const currentScale = scales[step];
  const totalSteps = scales.length;
  const isLastStep = step === totalSteps - 1;

  /** 当前量表已作答数 / 必答数(未答完禁止提交,防止空记录污染临床数据) */
  const completion = useMemo(() => {
    if (currentScale === "brain_region") {
      const scored = BRAIN_REGION_ITEMS.filter((i) => i.index !== 46);
      const answered = scored.filter((it) => brainResponses.items[it.index] !== undefined).length;
      return { answered, total: scored.length };
    }
    const csiAnswered = Object.keys(csiAnswers).length;
    const slanssAnswered = Object.keys(slanssAnswers).length;
    return { answered: csiAnswered + slanssAnswered, total: CSI_ITEMS.length + SLANSS_ITEMS.length };
  }, [currentScale, brainResponses, csiAnswers, slanssAnswers]);

  const isComplete = completion.answered >= completion.total;

  const submitOne = async (scale: ScaleId): Promise<{ ok: boolean; err?: string }> => {
    if (scale === "brain_region") {
      const score = scoreBrainRegion(brainResponses);
      const result = await submitAssessmentSubmission(
        share.token,
        { id: share.id, patientId: share.patientId, encounterId: share.encounterId, orgId: share.orgId },
        {
          type: "brain_region",
          payload: {
            responses: brainResponses,
            score,
            phoneEar: brainResponses.phoneEar,
          },
        },
      );
      return { ok: result.ok, err: result.error };
    }
    // pain_assessment
    const csiValues = CSI_ITEMS.map((it) => csiAnswers[it.index] ?? 0);
    const csiScore = scoreCsi(csiValues);
    const slanssValues = SLANSS_ITEMS.map((it) => slanssAnswers[it.index] ?? 0);
    const slanssScore = scoreSlanss(slanssValues);
    const result = await submitAssessmentSubmission(
      share.token,
      { id: share.id, patientId: share.patientId, encounterId: share.encounterId, orgId: share.orgId },
      {
        type: "pain_assessment",
        payload: {
          csi: { items: csiAnswers, total: csiScore.total, severity: csiScore.severity },
          slanss: { items: slanssAnswers, total: slanssScore.total, positive: slanssScore.result === "positive" },
        },
      },
    );
    return { ok: result.ok, err: result.error };
  };

  const handleSubmitCurrent = async () => {
    if (!isComplete || submittingRef.current) return; // 防重复提交
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitOne(currentScale);
    submittingRef.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.err ?? "提交失败,请重试");
      return;
    }
    setSubmitted((prev) => ({ ...prev, [currentScale]: true }));
    if (isLastStep) {
      // 全部提交完成
      return;
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const allSubmitted = scales.every((s) => submitted[s]);
  if (allSubmitted) {
    return <ThankYouScreen />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-6) var(--space-4)", fontFamily: "var(--font-sans)" }}>
      {/* 头部 */}
      <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, margin: "0 0 var(--space-1)" }}>
          📋 自评量表
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
          由您的主治治疗师分发 · 共 {totalSteps} 份量表 · 第 {step + 1}/{totalSteps} 份
        </p>
        {share.message && (
          <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3) var(--space-4)", background: "var(--color-accent-weak)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)" }}>
            💬 治疗师留言:{share.message}
          </div>
        )}
      </div>

      {/* 进度条 */}
      <div style={{ display: "flex", gap: 6, marginBottom: "var(--space-5)" }}>
        {scales.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--color-accent)" : "var(--color-border)" }} />
        ))}
      </div>

      {/* 当前量表 */}
      <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: "0 0 var(--space-3)" }}>
          {SCALE_LABEL[currentScale]}
        </h2>
        {currentScale === "brain_region" ? (
          <BrainRegionCustomer
            responses={brainResponses}
            onChange={setBrainResponses}
          />
        ) : (
          <PainAssessmentCustomer
            csiAnswers={csiAnswers}
            slanssAnswers={slanssAnswers}
            onCsiChange={setCsiAnswers}
            onSlanssChange={setSlanssAnswers}
          />
        )}
      </div>

      {/* 提交按钮 */}
      <div style={{ textAlign: "center" }}>
        {!isComplete && (
          <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
            还剩 {completion.total - completion.answered} 题未作答,全部答完才能提交
          </p>
        )}
        {submitError && (
          <p style={{ color: "var(--color-abnormal)", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
            ⚠ {submitError}
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary"
          style={{ fontSize: "var(--text-base)", padding: "var(--space-3) var(--space-6)" }}
          disabled={submitting || !isComplete}
          onClick={handleSubmitCurrent}
          data-testid="submit-assessment-btn"
        >
          {submitting ? "提交中…" : isLastStep ? "✅ 提交全部量表" : "提交并继续下一份 →"}
        </button>
      </div>
    </div>
  );
}

/** ============ Brain Region 顾客版 ============ */

const BRAIN_SCORE_LABELS: ReadonlyArray<{ value: number; label: string; desc: string }> = [
  { value: 0, label: "无症状", desc: "0% 的时间" },
  { value: 1, label: "很少", desc: "< 25% 的时间" },
  { value: 2, label: "经常", desc: "50% 的时间" },
  { value: 3, label: "频繁", desc: "75% 的时间" },
  { value: 4, label: "总是", desc: "100% 的时间" },
];

function BrainRegionCustomer({ responses, onChange }: { responses: BrainRegionResponses; onChange: (r: BrainRegionResponses) => void }) {
  const scored = BRAIN_REGION_ITEMS.filter((i) => i.index !== 46);
  const answered = useMemo(() => scored.filter((it) => responses.items[it.index] !== undefined).length, [responses]);

  return (
    <div>
      <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--color-accent-weak)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
        已作答 {answered} / {scored.length} 题 · 第 46 题(电话偏好侧)在最下方
      </div>
      {scored.map((it) => {
        const cur = responses.items[it.index];
        return (
          <div key={it.index} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              <span style={{ color: "var(--color-text-muted)", marginRight: 8 }}>Q{it.index}</span>
              {it.text}
              {it.side === "L" && <span style={{ marginLeft: 8, fontSize: 11, color: "#0284c7", background: "#e0f2fe", padding: "1px 6px", borderRadius: 4 }}>左半球</span>}
              {it.side === "R" && <span style={{ marginLeft: 8, fontSize: 11, color: "#ea580c", background: "#ffedd5", padding: "1px 6px", borderRadius: 4 }}>右半球</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BRAIN_SCORE_LABELS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...responses, items: { ...responses.items, [it.index]: opt.value } })}
                  style={{
                    padding: "6px 12px",
                    border: cur === opt.value ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                    background: cur === opt.value ? "var(--color-accent)" : "transparent",
                    color: cur === opt.value ? "#fff" : "var(--color-text)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {opt.value} · {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* 第 46 题 */}
      <div style={{ padding: "var(--space-3)", background: "#f0fdfa", borderRadius: "var(--radius-md)", marginTop: "var(--space-3)" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          <span style={{ color: "#0d9488", marginRight: 8 }}>Q46</span>
          {BRAIN_REGION_ITEMS.find((i) => i.index === 46)?.text}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>📞 电话偏好侧(不计入总分)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PHONE_EAR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...responses, phoneEar: opt.value as PhoneEarPreference })}
              style={{
                padding: "8px 14px",
                border: responses.phoneEar === opt.value ? "2px solid #0d9488" : "1px solid var(--color-border)",
                background: responses.phoneEar === opt.value ? "#0d9488" : "transparent",
                color: responses.phoneEar === opt.value ? "#fff" : "var(--color-text)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ============ CSI + S-LANSS 顾客版 ============ */

const CSI_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "从不" },
  { value: 1, label: "罕见" },
  { value: 2, label: "有时" },
  { value: 3, label: "经常" },
  { value: 4, label: "总是" },
];

function PainAssessmentCustomer({ csiAnswers, slanssAnswers, onCsiChange, onSlanssChange }: {
  csiAnswers: Record<number, number>;
  slanssAnswers: Record<number, number>;
  onCsiChange: (r: Record<number, number>) => void;
  onSlanssChange: (r: Record<number, number>) => void;
}) {
  const csiAnswered = Object.keys(csiAnswers).length;
  const slanssAnswered = Object.keys(slanssAnswers).length;
  return (
    <div>
      {/* CSI */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--space-2)" }}>
          📋 CSI 中枢敏感性量表({csiAnswered}/25)
        </h3>
        {CSI_ITEMS.map((it) => {
          const cur = csiAnswers[it.index];
          return (
            <div key={it.index} style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: "var(--color-text-muted)", marginRight: 8 }}>Q{it.index}</span>
                {it.text}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {CSI_CHOICES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onCsiChange({ ...csiAnswers, [it.index]: opt.value })}
                    style={{
                      padding: "4px 10px",
                      border: cur === opt.value ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                      background: cur === opt.value ? "var(--color-accent)" : "transparent",
                      color: cur === opt.value ? "#fff" : "var(--color-text)",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {opt.value} · {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* S-LANSS */}
      <div>
        <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--space-2)" }}>
          🩹 S-LANSS 神经病理性疼痛({slanssAnswered}/7)
        </h3>
        {SLANSS_ITEMS.map((it) => {
          const cur = slanssAnswers[it.index];
          const [noLabel, yesLabel] = it.options;
          const [noScore, yesScore] = it.scores;
          return (
            <div key={it.index} style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: "var(--color-text-muted)", marginRight: 8 }}>Q{it.index}</span>
                {it.question}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onSlanssChange({ ...slanssAnswers, [it.index]: noScore })}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    border: cur === noScore ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                    background: cur === noScore ? "var(--color-accent)" : "transparent",
                    color: cur === noScore ? "#fff" : "var(--color-text)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  否:{noLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onSlanssChange({ ...slanssAnswers, [it.index]: yesScore })}
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    border: cur === yesScore ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                    background: cur === yesScore ? "var(--color-accent)" : "transparent",
                    color: cur === yesScore ? "#fff" : "var(--color-text)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  是:{yesLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ============ 提交完成 ============ */

function ThankYouScreen() {
  return (
    <div style={{ maxWidth: 480, margin: "60px auto", padding: "var(--space-6)", textAlign: "center", fontFamily: "var(--font-sans)" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-3)" }}>提交成功</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
        您的自评量表结果已发送给治疗师师,治疗师会在下次复诊前查阅。
        <br />
        请按约定时间复诊。
      </p>
    </div>
  );
}