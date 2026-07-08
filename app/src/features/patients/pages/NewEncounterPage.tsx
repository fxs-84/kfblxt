import { useState, useEffect } from "react";
import { useCreateEncounter } from "../../encounters/useEncounters";
import { useCreateExamSession } from "../../exam/useExam";
import { getSession } from "../../../lib/session";
import type { EncounterData } from "./NewEncounterFields";
import type { ExamResult } from "../../exam/exam.types";
import { EncounterFields } from "./NewEncounterFields";
import { ExamFields } from "./NewExamFields";
import { BrainRegionPanel } from "../../assessments/components/BrainRegionPanel";
import { DiagnosisPanel } from "../../diagnosis/components/DiagnosisPanel";
import { AttachmentPanel } from "../../attachments/components/AttachmentPanel";
import { SharePanel } from "../../share/SharePanel";

interface NewEncounterPageProps {
  patientId: string;
  onDone: () => void;
}

/**
 * 新建就诊综合页面(内联):
 * 阶段1: 症状定位 + 基础信息 + 大脑区域定位表 + ANRM 查体 → 创建就诊
 * 阶段2: 使用新就诊 ID → 神经定位诊断 + 附件 + 分享
 */
export function NewEncounterPage({ patientId, onDone }: NewEncounterPageProps) {
  const createEncounter = useCreateEncounter();
  const createExam = useCreateExamSession();

  const [encounterData, setEncounterData] = useState<EncounterData>({
    encounterDate: new Date().toISOString().slice(0, 10),
    visitType: "初诊",
    chiefComplaint: { regions: [], distributionNote: "", nature: [], vas: 0, durationText: "", onset: "" },
    amount: 0,
  });
  const [examResults, setExamResults] = useState<Record<string, ExamResult>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [phase1Done, setPhase1Done] = useState(false);

  const handleSavePhase1 = async () => {
    setError(null);
    if (!encounterData.chiefComplaint.regions.length) { setError("请至少标记一个症状区域"); return; }
    if (!encounterData.chiefComplaint.nature.length) { setError("请至少选择一项症状性质"); return; }
    if (!encounterData.chiefComplaint.durationText) { setError("请填写病程"); return; }

    setSaving(true);
    try {
      const encounter = await createEncounter.mutateAsync({
        orgId: getSession().orgId,
        patientId,
        encounterDate: new Date(encounterData.encounterDate),
        visitType: encounterData.visitType,
        status: "进行中",
        chiefComplaint: {
          regions: encounterData.chiefComplaint.regions,
          distributionNote: encounterData.chiefComplaint.distributionNote || undefined,
          nature: encounterData.chiefComplaint.nature,
          vas: encounterData.chiefComplaint.vas,
          durationText: encounterData.chiefComplaint.durationText,
          onset: encounterData.chiefComplaint.onset || undefined,
        },
        amount: encounterData.amount,
      });

      const hasExam = Object.keys(examResults).length > 0;
      if (hasExam) {
        await createExam.mutateAsync({
          encounterId: encounter.id,
          results: examResults as Record<string, { left?: unknown; right?: unknown; value?: unknown; note?: string }>,
        });
      }

      setEncounterId(encounter.id);
      setPhase1Done(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  // ESC 关闭(仅阶段2)
  useEffect(() => {
    if (!phase1Done) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase1Done, onDone]);

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title" style={{ fontSize: "var(--text-lg)" }}>📋 新建就诊</h3>
          {phase1Done && (
            <span className="panel__hint">阶段1已完成 · 可继续完成诊断与记录</span>
          )}
        </div>

        {!phase1Done ? (
          /* ══════════ 阶段1:创建就诊 ══════════ */
          <>
            {/* 区块:症状定位 + 基础信息 */}
            <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
              <div className="exam-panel__header">
                <h3 className="panel__title">🩻 症状定位与基本信息</h3>
              </div>
              <div style={{ padding: "var(--space-4) var(--space-6)" }}>
                <EncounterFields value={encounterData} onChange={setEncounterData} />
              </div>
            </div>

            {/* 区块:大脑区域定位表 */}
            <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
              <div className="exam-panel__header">
                <h3 className="panel__title">🧠 大脑区域定位表</h3>
              </div>
              <div style={{ padding: "var(--space-3) var(--space-4)" }}>
                <BrainRegionPanel patientId={patientId} />
              </div>
            </div>

            {/* 区块:ANRM 查体 */}
            <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
              <div className="exam-panel__header">
                <h3 className="panel__title">📋 ANRM 神经科学查体</h3>
              </div>
              <div style={{ padding: "var(--space-4) var(--space-6)" }}>
                <ExamFields results={examResults} onChange={setExamResults} />
              </div>
            </div>

            {error && <div className="field__error" style={{ margin: "var(--space-2) var(--space-6)" }}>{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn--primary" onClick={handleSavePhase1} disabled={saving}
                style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
                {saving ? "保存中…" : "💾 保存就诊 (会诊 + 查体)"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
            </div>
          </>
        ) : (
          /* ══════════ 阶段2:诊断 + 附件 + 分享 ══════════ */
          <>
            {encounterId && (
              <>
                {/* 神经定位诊断 + 临床诊断 */}
                <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
                  <div className="exam-panel__header">
                    <h3 className="panel__title">🧠 神经定位诊断</h3>
                    <span className="panel__hint">ANRM 定位 + ICD-10 临床诊断</span>
                  </div>
                  <DiagnosisPanel encounterId={encounterId} />
                </div>

                {/* 附件(检查报告等) */}
                <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
                  <div className="exam-panel__header">
                    <h3 className="panel__title">📎 检查报告</h3>
                  </div>
                  <AttachmentPanel encounterId={encounterId} />
                </div>

                {/* 分享二维码 */}
                <div className="card" style={{ margin: "0 var(--space-4) var(--space-3)", border: "1px solid var(--color-border)", boxShadow: "none" }}>
                  <div className="exam-panel__header">
                    <h3 className="panel__title">🔗 分享</h3>
                  </div>
                  <SharePanel encounterId={encounterId} patientId={patientId} />
                </div>
              </>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn--primary" onClick={onDone}
                style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
                完成就诊记录
              </button>
              <button type="button" className="btn btn--ghost" onClick={onDone}>关闭</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
