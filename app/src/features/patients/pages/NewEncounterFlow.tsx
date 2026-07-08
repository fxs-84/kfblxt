import { useState } from "react";
import { useCreateEncounter } from "../../encounters/useEncounters";
import { useCreateExamSession } from "../../exam/useExam";
import { useCreateDiagnosis } from "../../diagnosis/useDiagnosis";
import { getSession } from "../../../lib/session";
import type { EncounterData } from "./NewEncounterFields";
import type { ExamResult } from "../../exam/exam.types";
import { EncounterFields } from "./NewEncounterFields";
import { ExamFields } from "./NewExamFields";

interface NewEncounterFlowProps {
  patientId: string;
  onDone: () => void;
}

/**
 * 新建就诊综合流程(弹窗):
 * 1. 症状定位 + 基本就诊信息 (EncounterFields)
 * 2. ANRM 神经科学查体         (ExamFields)
 * 3. 一次性提交:先建就诊 → 再建查体会话
 */
export function NewEncounterFlow({ patientId, onDone }: NewEncounterFlowProps) {
  const createEncounter = useCreateEncounter();
  const createExam = useCreateExamSession();
  const createDiagnosis = useCreateDiagnosis();

  // 状态:表单数据
  const [encounterData, setEncounterData] = useState<EncounterData>({
    encounterDate: new Date().toISOString().slice(0, 10),
    visitType: "初诊" as const,
    chiefComplaint: {
      regions: [] as string[],
      distributionNote: "",
      nature: [] as string[],
      vas: 0,
      durationText: "",
      onset: "",
    },
    amount: 0,
  });
  const [examResults, setExamResults] = useState<Record<string, ExamResult>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"symptom" | "exam">("symptom");
  const [savedEncounterId, setSavedEncounterId] = useState<string | null>(null);

  const handleSaveAll = async () => {
    setError(null);
    if (!encounterData.chiefComplaint.regions.length) {
      setError("请在人体图上至少标记一个症状区域");
      return;
    }
    if (!encounterData.chiefComplaint.nature.length) {
      setError("请至少选择一项症状性质");
      return;
    }
    if (!encounterData.chiefComplaint.durationText) {
      setError("请填写病程");
      return;
    }

    setSaving(true);
    try {
      // 1. 创建就诊
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

      // 2. 创建查体会话
      const hasExam = Object.keys(examResults).length > 0;
      if (hasExam) {
        await createExam.mutateAsync({
          encounterId: encounter.id,
          results: examResults as Record<string, { left?: unknown; right?: unknown; value?: unknown; note?: string }>,
        });
      }

      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onDone} role="presentation">
      <div
        className="modal-card modal-card--wide modal-card--scroll"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: "95vw", width: "1400px" }}
      >
        <div className="modal-card__head">
          <h2 className="modal-card__title">📋 新建就诊</h2>
          <button type="button" className="modal-card__close" onClick={onDone}>×</button>
        </div>
        <div className="modal-card__body" style={{ padding: 0 }}>
          <div style={{ display: "flex", gap: 0, minHeight: "60vh" }}>
            {/* 左侧:症状定位 + 就诊信息 */}
            <div style={{ flex: "0 0 45%", borderRight: "1px solid var(--color-border)", padding: "var(--space-4) var(--space-5)", overflowY: "auto", maxHeight: "70vh" }}>
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--space-3)" }}>🩻 症状定位与基本信息</h3>
              <EncounterFields value={encounterData} onChange={(v) => setEncounterData(v)} />
            </div>

            {/* 右侧:ANRM 查体 */}
            <div style={{ flex: 1, padding: "var(--space-4) var(--space-5)", overflowY: "auto", maxHeight: "70vh" }}>
              <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "0 0 var(--space-3)" }}>📋 ANRM 神经科学查体</h3>
              <ExamFields results={examResults} onChange={setExamResults} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: "0 var(--space-6) var(--space-2)" }}>
            <div className="field__error">{error}</div>
          </div>
        )}

        <div className="form-actions" style={{ padding: "var(--space-4) var(--space-6)", borderTop: "1px solid var(--color-border)", background: "#fafbfc" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSaveAll}
            disabled={saving}
            style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}
          >
            {saving ? "保存中…" : "💾 保存就诊 (会诊 + 查体)"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
        </div>
      </div>
    </div>
  );
}
