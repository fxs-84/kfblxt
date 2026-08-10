import { useEffect, useMemo, useRef, useState } from "react";
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

/** ============ 主导表:一次一题向导,答完自动跳下一题 ============ */

interface WizardOption { value: number | string; label: string; sub?: string }
interface WizardQuestion {
  key: string;
  text: string;
  badge?: { text: string; color: string; bg: string };
  hint?: string;
  options: WizardOption[];
  required: boolean;
  selected: number | string | undefined;
  onSelect: (v: number | string) => void;
}

/** 选项选中后到自动跳题的延迟——让客户看到选中高亮,又不至于等太久 */
const AUTO_ADVANCE_MS = 280;

/** jsdom 没有 scrollTo 实现,包一层防测试报错 */
function scrollTop() {
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    /* noop */
  }
}

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

  /** 当前量表的扁平题目列表:脑区 = 99 计分题 + Q46 电话偏好(选答);疼痛 = CSI 25 + S-LANSS 7 */
  const questions = useMemo<WizardQuestion[]>(() => {
    if (currentScale === "brain_region") {
      const scored = BRAIN_REGION_ITEMS.filter((i) => i.index !== 46);
      const q46 = BRAIN_REGION_ITEMS.find((i) => i.index === 46);
      const list: WizardQuestion[] = scored.map((it) => ({
        key: `br-${it.index}`,
        text: `Q${it.index} ${it.text}`,
        badge:
          it.side === "L"
            ? { text: "左半球", color: "#0284c7", bg: "#e0f2fe" }
            : it.side === "R"
              ? { text: "右半球", color: "#ea580c", bg: "#ffedd5" }
              : undefined,
        options: BRAIN_SCORE_LABELS.map((o) => ({ value: o.value, label: `${o.value} · ${o.label}`, sub: o.desc })),
        required: true,
        selected: brainResponses.items[it.index],
        onSelect: (v) =>
          setBrainResponses((r) => ({ ...r, items: { ...r.items, [it.index]: v as number } })),
      }));
      if (q46) {
        list.push({
          key: "br-46",
          text: `Q46 ${q46.text}`,
          hint: "📞 电话偏好侧(选答,不计入总分)",
          options: PHONE_EAR_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          required: false,
          selected: brainResponses.phoneEar ?? undefined,
          onSelect: (v) => setBrainResponses((r) => ({ ...r, phoneEar: v as PhoneEarPreference })),
        });
      }
      return list;
    }
    // pain_assessment
    return [
      ...CSI_ITEMS.map((it): WizardQuestion => ({
        key: `csi-${it.index}`,
        text: `Q${it.index} ${it.text}`,
        options: CSI_CHOICES.map((o) => ({ value: o.value, label: `${o.value} · ${o.label}` })),
        required: true,
        selected: csiAnswers[it.index],
        onSelect: (v) => setCsiAnswers((a) => ({ ...a, [it.index]: v as number })),
      })),
      ...SLANSS_ITEMS.map((it): WizardQuestion => {
        const [noLabel, yesLabel] = it.options;
        const [noScore, yesScore] = it.scores;
        return {
          key: `sl-${it.index}`,
          text: `Q${it.index} ${it.question}`,
          options: [
            { value: noScore, label: `否:${noLabel}` },
            { value: yesScore, label: `是:${yesLabel}` },
          ],
          required: true,
          selected: slanssAnswers[it.index],
          onSelect: (v) => setSlanssAnswers((a) => ({ ...a, [it.index]: v as number })),
        };
      }),
    ];
  }, [currentScale, brainResponses, csiAnswers, slanssAnswers]);

  /** 必答题完成度(未答完禁止提交,防止空记录污染临床数据) */
  const requiredQuestions = questions.filter((q) => q.required);
  const requiredAnswered = requiredQuestions.filter((q) => q.selected !== undefined).length;
  const isComplete = requiredAnswered >= requiredQuestions.length;

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
    scrollTop();
  };

  const allSubmitted = scales.every((s) => submitted[s]);
  if (allSubmitted) {
    return <ThankYouScreen />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-6) var(--space-4)", fontFamily: "var(--font-sans)" }}>
      {/* 头部 */}
      <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
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

      {/* 份量表进度 */}
      {totalSteps > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: "var(--space-4)" }}>
          {scales.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--color-accent)" : "var(--color-border)" }} />
          ))}
        </div>
      )}

      {/* 一次一题向导(key=scale:份量表切换时重置题号) */}
      <ScaleWizard
        key={currentScale}
        scaleLabel={SCALE_LABEL[currentScale]}
        questions={questions}
        onSubmit={handleSubmitCurrent}
        submitting={submitting}
        submitError={submitError}
        submitLabel={isLastStep ? "✅ 提交全部量表" : "提交并继续下一份 →"}
        requiredAnswered={requiredAnswered}
        requiredTotal={requiredQuestions.length}
      />
    </div>
  );
}

/** 一次一题向导:选中自动跳下一题,可回退修改,最后一题才出现提交 */
function ScaleWizard({ scaleLabel, questions, onSubmit, submitting, submitError, submitLabel, requiredAnswered, requiredTotal }: {
  scaleLabel: string;
  questions: WizardQuestion[];
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  submitLabel: string;
  requiredAnswered: number;
  requiredTotal: number;
}) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const canNext = q.selected !== undefined || !q.required;

  const go = (i: number) => {
    clearTimer();
    setIndex(i);
    scrollTop();
  };

  const handleSelect = (v: number | string) => {
    q.onSelect(v);
    clearTimer();
    if (!isLast) {
      timerRef.current = setTimeout(() => {
        setIndex((i) => Math.min(i + 1, questions.length - 1));
        scrollTop();
      }, AUTO_ADVANCE_MS);
    }
  };

  return (
    <div className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
      {/* 题号 + 题目进度条 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--space-2)" }}>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>{scaleLabel}</h2>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
          第 {index + 1} / {questions.length} 题
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--color-border)", marginBottom: "var(--space-4)", overflow: "hidden" }}>
        <div style={{ width: `${((index + 1) / questions.length) * 100}%`, height: "100%", background: "var(--color-accent)", transition: "width 0.2s" }} />
      </div>

      {/* 当前题 */}
      <div style={{ fontSize: "var(--text-base)", fontWeight: 600, lineHeight: 1.6, marginBottom: "var(--space-4)" }}>
        {q.badge && (
          <span style={{ marginRight: 8, fontSize: 11, color: q.badge.color, background: q.badge.bg, padding: "1px 6px", borderRadius: 4 }}>
            {q.badge.text}
          </span>
        )}
        {q.text}
        {q.hint && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", fontWeight: 400, marginTop: 4 }}>{q.hint}</div>
        )}
      </div>

      {/* 选项(大按钮,移动端好点) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
        {q.options.map((opt) => {
          const cur = q.selected === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              data-testid="wizard-option"
              onClick={() => handleSelect(opt.value)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "14px 16px",
                border: cur ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                background: cur ? "var(--color-accent)" : "transparent",
                color: cur ? "#fff" : "var(--color-text)",
                borderRadius: 10,
                cursor: "pointer",
                fontSize: 15,
                textAlign: "left",
              }}
            >
              <span>{opt.label}</span>
              {opt.sub && (
                <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>{opt.sub}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 底部导航 / 提交 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
        <button
          type="button"
          className="btn btn--ghost"
          data-testid="prev-question-btn"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          ← 上一题
        </button>
        {!isLast && (
          <button
            type="button"
            className="btn btn--primary"
            data-testid="next-question-btn"
            disabled={!canNext}
            onClick={() => go(index + 1)}
          >
            下一题 →
          </button>
        )}
      </div>

      {isLast && (
        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          {requiredAnswered < requiredTotal && (
            <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              还剩 {requiredTotal - requiredAnswered} 题未作答,全部答完才能提交(可点"上一题"回去补答)
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
            disabled={submitting || requiredAnswered < requiredTotal}
            onClick={onSubmit}
            data-testid="submit-assessment-btn"
          >
            {submitting ? "提交中…" : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/** ============ 选项常量(向导题面用) ============ */

const BRAIN_SCORE_LABELS: ReadonlyArray<{ value: number; label: string; desc: string }> = [
  { value: 0, label: "无症状", desc: "0% 的时间" },
  { value: 1, label: "很少", desc: "< 25% 的时间" },
  { value: 2, label: "经常", desc: "50% 的时间" },
  { value: 3, label: "频繁", desc: "75% 的时间" },
  { value: 4, label: "总是", desc: "100% 的时间" },
];

const CSI_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "从不" },
  { value: 1, label: "罕见" },
  { value: 2, label: "有时" },
  { value: 3, label: "经常" },
  { value: 4, label: "总是" },
];

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