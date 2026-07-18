import { useState, useEffect } from "react";
import { analyzeAsync, isLLMConfigured } from "./llm-engine";
import { LLMSettingsPanel } from "./components/LLMSettingsPanel";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { analyze, generateNarrative } from "./reasoning-engine";
import type { ClinicalContext } from "./ai-assistant.types";
import type { AnalyzeResult } from "./llm-engine";
import { EXAM_CATALOG } from "../exam/exam-catalog";
import type { ExamSession } from "../exam/exam.types";
import type { EncounterRecord } from "../encounters/encounter.repository";
import type { DiagnosisRecord } from "../diagnosis/diagnosis.repository";
import type { NeuroLevel, Mechanism, SpinalSegment, NerveTrunk } from "../diagnosis/localization.types";
import { getInterventionEffectiveness, rankDiagnosisByHistory } from "../learning/agent-memory";

/* ---- 场景类型 ---- */
type Scene = "诊前" | "诊中" | "诊后";

/* ---- AI 建议回填回调 ---- */
export interface AIBackfillHandlers {
  /** 采纳定位诊断:传入 levels/mechanisms/side/segments/nerves/cutaneous */
  onAdoptDiagnosis?: (fields: { levels?: NeuroLevel[]; mechanisms?: Mechanism[]; segments?: SpinalSegment[]; nerves?: NerveTrunk[]; cutaneousNerveIds?: string[]; side?: string; reasoning?: string }) => void;
  /** 采纳干预:传入干预 ID */
  onAdoptIntervention?: (interventionId: string) => void;
  /** 保存 SOAP 笔记 */
  onSaveSoap?: (soap: string) => void;
}

interface Props {
  scene: Scene;
  encounter?: EncounterRecord;
  examSessions: ExamSession[];
  diagnosis?: DiagnosisRecord | null;
  backfill?: AIBackfillHandlers;
}

/* ---- 语音识字:识别查体关键词 ---- */
const EXAM_KEYWORDS: Record<string, string> = {};
for (const def of EXAM_CATALOG) {
  const short = def.name.replace(/\(.*\)/, "").slice(0, 6);
  EXAM_KEYWORDS[short] = def.id;
  EXAM_KEYWORDS[def.name.replace(/\(.*\)/, "")] = def.id;
}

export function AIAssistantPanel({ scene, encounter, examSessions, diagnosis, backfill }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"analysis" | "narrative" | "dictate">(scene === "诊后" ? "narrative" : "analysis");
  const [adopting, setAdopting] = useState<string | null>(null);
  const [savingSoap, setSavingSoap] = useState(false);
  /* 语音状态(共享 hook;onResult 里做查体关键词结构化匹配) */
  const [vText, setVText] = useState("");
  const [vMatches, setVMatches] = useState<Array<{ examId: string; value: string }>>([]);
  const { listening: vListening, supported: voiceSupport, toggle: toggleVoice } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onResult: (t) => {
      setVText(t);
      const matches: Array<{ examId: string; value: string }> = [];
      for (const [keyword, id] of Object.entries(EXAM_KEYWORDS)) {
        const idx = t.indexOf(keyword);
        if (idx >= 0) {
          const after = t.slice(idx + keyword.length, idx + keyword.length + 15);
          const val = after.match(/(阴性|阳性|正常|减退|消失|过敏|\d+级|\d+\s*s|VAS\s*\d+)/i)?.[0] ?? after.trim().slice(0, 10);
          const existing = matches.find((m) => m.examId === id);
          if (!existing) matches.push({ examId: id, value: val });
        }
      }
      setVMatches(matches);
    },
  });

  const [aiResult, setAiResult] = useState<AnalyzeResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<"rules" | "llm">("rules");
  const [llmConfigured, setLlmConfigured] = useState(isLLMConfigured());
  const [showLlmSettings, setShowLlmSettings] = useState(false);

  /* ---- 数据准备 ---- */
  const findings = examSessions.flatMap((s) =>
    Object.entries(s.results).map(([id, r]) => {
      const def = EXAM_CATALOG.find((d) => d.id === id);
      return { name: def?.name ?? id, left: r.left, right: r.right, value: r.value };
    }),
  );

  const hasData = Boolean(encounter);
  const ctx: ClinicalContext | null = encounter ? {
    chiefComplaint: { regions: encounter.chiefComplaint.regions, nature: encounter.chiefComplaint.nature, vas: encounter.chiefComplaint.vas },
    examFindings: findings,
    diagnosis: diagnosis ? { levels: diagnosis.levels, mechanisms: diagnosis.mechanisms, side: diagnosis.side, segments: diagnosis.segments, nerves: diagnosis.nerves, cutaneousNerveIds: diagnosis.cutaneousNerveIds } : undefined,
  } : null;

  /* 按历史模式重排定位建议(LLM/规则两分支共用,此前为两份重复逻辑) */
  const applyHistoryRanking = (result: AnalyzeResult): AnalyzeResult => {
    const regionSummary = encounter!.chiefComplaint.regions.join(" ");
    const mechanismHints = result.localizationSuggestions
      .filter((s) => s.level === "特定体征")
      .map((s) => s.rationale.slice(0, 20));
    const allLevels = result.localizationSuggestions.map((s) => s.level);
    const rankedLevels = rankDiagnosisByHistory(allLevels, regionSummary, mechanismHints);
    if (rankedLevels.length === 0) return result;
    const scored = result.localizationSuggestions.map((s) => {
      const idx = rankedLevels.indexOf(s.level);
      const histConf = idx >= 0 ? Math.max(0.5, 0.95 - idx * 0.1) : 0;
      return { ...s, confidence: Math.max(s.confidence, histConf), matchedHistory: idx >= 0 };
    });
    scored.sort((a, b) => {
      if (a.matchedHistory !== b.matchedHistory) return a.matchedHistory ? -1 : 1;
      return b.confidence - a.confidence;
    });
    return { ...result, localizationSuggestions: scored };
  };

  /* 异步推理:先试 LLM,不可用自动回退规则引擎 */
  useEffect(() => {
    if (!ctx) { setAiResult(null); return; }
    let cancelled = false;
    setAiLoading(true);
    analyzeAsync(ctx).then((result) => {
      if (cancelled) return;
      setAiResult(applyHistoryRanking(result));
      // 真实来源(llm-engine 已统一返回 _source)
      setAiMode(result._source);
      setAiLoading(false);
    }).catch(() => {
      if (cancelled) return;
      const rules = { ...analyze(ctx), narrative: generateNarrative(ctx), _source: "rules" as const };
      setAiResult(applyHistoryRanking(rules));
      setAiMode("rules");
      setAiLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx is derived from encounter/examSessions/diagnosis
  }, [encounter?.id, examSessions, diagnosis]);

  const result = aiResult;
  const narrative = result?.narrative ?? null;

  const soapFull = narrative
    ? `【SOAP 临床笔记】\n\nS: ${narrative.subjective}\n\nO: ${narrative.objective}\n\nA: ${narrative.assessment}\n\nP: ${narrative.plan}`
    : "";

  const sceneLabel = { 诊前: "📋 今日回顾", 诊中: "🧠 实时推理", 诊后: "📝 报告生成" }[scene];
  const sceneHint = { 诊前: "查看上次就诊要点", 诊中: "查体→定位→干预建议,可一键回填", 诊后: "生成 SOAP 笔记并存档" }[scene];

  /* ---- FAB ---- */
  if (!open) {
    return (
      <div className="ai-fab" onClick={() => setOpen(true)} title="AI 临床助手">
        <span className="ai-fab__icon">🤖</span>
        <span className="ai-fab__label">AI 助手</span>
      </div>
    );
  }

  /* ---- 面板 ---- */
  return (
    <div className="ai-panel">
      <div className="ai-panel__header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "1.2rem" }}>🤖</span>
          <div>
            <h3 className="panel__title" style={{ margin: 0, fontSize: "var(--text-base)" }}>{sceneLabel}</h3>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {aiLoading
                ? "⏳ 推理中…"
                : aiMode === "llm"
                  ? "🤖 LLM 已连接"
                  : llmConfigured
                    ? "⚠️ LLM 配置存在但调用失败,已用规则引擎"
                    : "📋 规则引擎(未配置 LLM)"}
            </span>
            <button type="button"
              className="btn btn--ghost"
              style={{ fontSize: "10px", padding: "1px 6px", marginLeft: "auto" }}
              onClick={() => setShowLlmSettings((v) => !v)}
              title="配置 LLM API key(仅本地)"
            >
              {llmConfigured ? "🔑" : "⚠️ 未配置 LLM"}
            </button>
          </div>
        </div>
        <button type="button" className="btn btn--ghost" style={{ padding: "2px 8px" }} onClick={() => setOpen(false)}>✕</button>
      </div>

      <nav className="ai-panel__tabs">
        {(["analysis", "narrative", "dictate"] as const).map((k) => (
          <button type="button" key={k} className={`ai-tab ${tab === k ? "ai-tab--active" : ""}`} onClick={() => setTab(k)}>
            {k === "analysis" ? "🧠 分析" : k === "narrative" ? "📝 笔记" : "🎤 语音"}
          </button>
        ))}
      </nav>

      <div className="ai-panel__body">
        {showLlmSettings && (
          <div className="ai-section" style={{ background: "var(--color-surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-3)" }}>
            <LLMSettingsPanel variant="inline" onClose={() => setShowLlmSettings(false)} onConfiguredChange={setLlmConfigured} />
          </div>
        )}

        {/* ========== 🧠 分析 Tab ========== */}
        {tab === "analysis" && (
          <div>
            {!hasData ? (
              <p className="ai-empty">请先在就诊记录中完成查体。</p>
            ) : aiLoading ? (
              <p className="ai-empty">⏳ AI 正在分析临床数据…</p>
            ) : (
              <>
                <div className="ai-section">
                  <h4 className="ai-section__title">📍 神经定位建议</h4>
                  {!result || result.localizationSuggestions.length === 0 ? (
                    <p className="ai-empty">完成查体后 AI 将给出定位建议。</p>
                  ) : (
                    result.localizationSuggestions.slice(0, 8).map((s, i) => (
                      <div key={i} className="ai-suggestion" style={{ marginBottom: "var(--space-1)" }}>
                        <div className="ai-suggestion__head">
                          <span className={`badge badge--${s.confidence >= 0.8 ? "abnormal" : s.confidence >= 0.6 ? "caution" : "normal"}`}
                            style={{ fontSize: "10px" }}>{Math.round(s.confidence * 100)}%</span>
                          <strong style={{ fontSize: "var(--text-sm)" }}>{s.level}</strong>
                          {(s as { matchedHistory?: boolean }).matchedHistory && (
                            <span className="badge badge--normal" style={{ fontSize: "10px", marginLeft: "var(--space-1)" }}>🧠 历史匹配</span>
                          )}
                        </div>
                        <p className="ai-suggestion__text">{s.rationale}</p>
                      </div>
                    ))
                  )}
                  {backfill?.onAdoptDiagnosis && result && result.localizationSuggestions.length > 0 && (
                    <button type="button"
                      className="btn btn--primary" style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)", width: "100%" }}
                      disabled={adopting === "diagnosis"}
                      onClick={() => {
                        setAdopting("diagnosis");
                        const loc = result.localizationSuggestions;
                        backfill.onAdoptDiagnosis?.({
                          levels: [...new Set(loc.map((s) => s.level))] as NeuroLevel[],
                          reasoning: result?.localizationSuggestions.map((s) => `${s.level}:${s.rationale}`).join("\n"),
                        });
                        setTimeout(() => setAdopting(null), 600);
                      }}>
                      {adopting === "diagnosis" ? "✓ 已采纳" : "📥 采纳定位建议到诊断表单"}
                    </button>
                  )}
                </div>

                <div className="ai-section">
                  <h4 className="ai-section__title">💡 治疗建议</h4>
                  {!result || result.interventionSuggestions.length === 0 ? (
                    <p className="ai-empty">暂无匹配的治疗建议。</p>
                  ) : (
                    <>
                      {result.interventionSuggestions
                        .sort((a, b) => b.priority - a.priority)
                        .slice(0, 6)
                        .map((s, i) => (
                          <div key={i} className="ai-suggestion" style={{ marginBottom: "var(--space-1)" }}>
                            <div className="ai-suggestion__head">
                              <span className="badge badge--normal" style={{ fontSize: "10px" }}>★{s.priority}</span>
                              <strong style={{ fontSize: "var(--text-sm)" }}>{s.name}</strong>
                              {(() => {
                                const eff = getInterventionEffectiveness(s.interventionId);
                                if (eff.total === 0) return null;
                                const color = eff.rate >= 0.7 ? "var(--color-normal)" : eff.rate >= 0.4 ? "var(--color-caution)" : "var(--color-abnormal)";
                                return (
                                  <span className="badge" style={{ fontSize: "10px", marginLeft: "var(--space-1)", background: eff.rate >= 0.7 ? "var(--color-normal-weak)" : "var(--color-caution-weak)", color }}>
                                    用过{eff.total}次 有效{Math.round(eff.rate * 100)}%
                                  </span>
                                );
                              })()}
                              {backfill?.onAdoptIntervention && (
                                <button type="button"
                                  className="btn btn--primary" style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 8px" }}
                                  disabled={adopting === s.interventionId}
                                  onClick={() => {
                                    setAdopting(s.interventionId);
                                    backfill.onAdoptIntervention?.(s.interventionId);
                                    setTimeout(() => setAdopting(null), 400);
                                  }}>
                                  {adopting === s.interventionId ? "✓" : "+"}
                                </button>
                              )}
                            </div>
                            <p className="ai-suggestion__text">{s.rationale}</p>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== 📝 笔记 Tab ========== */}
        {tab === "narrative" && (
          <div>
            {narrative ? (
              <>
                {(["subjective", "objective", "assessment", "plan"] as const).map((key) => (
                  <div key={key} className="ai-narrative__section">
                    <h4 className="ai-section__title">
                      {key === "subjective" ? "S — 主观" : key === "objective" ? "O — 客观" : key === "assessment" ? "A — 评估" : "P — 计划"}
                    </h4>
                    <p className="ai-narrative__text">{narrative[key]}</p>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }}
                    onClick={() => navigator.clipboard?.writeText(soapFull).catch(() => {})}>
                    📋 复制
                  </button>
                  {backfill?.onSaveSoap && (
                    <button type="button" className="btn btn--primary" style={{ fontSize: "var(--text-xs)" }}
                      disabled={savingSoap}
                      onClick={async () => {
                        setSavingSoap(true);
                        backfill.onSaveSoap?.(soapFull);
                        setTimeout(() => setSavingSoap(false), 500);
                      }}>
                      {savingSoap ? "✓ 已存档" : "💾 存档 SOAP 笔记"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="ai-empty">请先完成查体,AI 将自动生成 SOAP 风格临床笔记。</p>
            )}
          </div>
        )}

        {/* ========== 🎤 语音 Tab ========== */}
        {tab === "dictate" && (
          <div>
            {!voiceSupport ? (
              <p className="ai-empty">浏览器不支持语音识别,请使用 Chrome 或 Edge。</p>
            ) : (
              <>
                <div className="ai-dictate__controls" style={{ marginBottom: "var(--space-2)" }}>
                  <button type="button" className={`btn ${vListening ? "btn--primary" : "btn--ghost"}`}
                    style={{ fontSize: "var(--text-xs)" }}
                    onClick={() => {
                      if (!vListening) { setVText(""); setVMatches([]); }
                      toggleVoice();
                    }}>
                    {vListening ? "⏹ 停止" : "🎤 开始录音"}
                  </button>
                  {vListening && <span className="ai-dictate__pulse" />}
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginLeft: "auto" }}>
                    说: "跟腱反射 左0 右2"
                  </span>
                </div>

                <textarea rows={5} value={vText} onChange={(e) => setVText(e.target.value)}
                  placeholder="语音识别结果…可直接编辑"
                  style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", font: "inherit", fontSize: "var(--text-sm)", resize: "vertical" }} />

                {vMatches.length > 0 && (
                  <div className="ai-section" style={{ marginTop: "var(--space-3)" }}>
                    <h4 className="ai-section__title">🔍 识别到的查体项</h4>
                    <div className="ai-suggestion-list">
                      {vMatches.map((m, i) => {
                        const def = EXAM_CATALOG.find((d) => d.id === m.examId);
                        return (
                          <div key={i} className="ai-suggestion">
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{def?.name ?? m.examId}</span>
                            <span className="badge badge--caution" style={{ marginLeft: 8, fontSize: "10px" }}>{m.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  <button type="button" className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }}
                    onClick={() => navigator.clipboard?.writeText(vText).catch(() => {})}>📋 复制</button>
                  <button type="button" className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }}
                    onClick={() => { setVText(""); setVMatches([]); }}>清空</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
