import { useState } from "react";
import { useCreateEncounter } from "../../encounters/useEncounters";
import { useCreateExamSession } from "../../exam/useExam";
import { getSession } from "../../../lib/session";
import type { EncounterData } from "./NewEncounterFields";
import type { ExamResult } from "../../exam/exam.types";
import type { ExamSessionInput } from "../../exam/exam.repository";
import { EncounterFields } from "./NewEncounterFields";
import { ExamFields } from "./NewExamFields";
import { BrainRegionForm } from "../../assessments/components/BrainRegionForm";
import { DiagnosisPanel } from "../../diagnosis/components/DiagnosisPanel";
import { AttachmentPanel } from "../../attachments/components/AttachmentPanel";
import { SharePanel } from "../../share/SharePanel";

interface NewEncounterPageProps {
  patientId: string;
  onDone: () => void;
}

/**
 * 新建就诊:
 * 1. 先填基本信息 + 保存 → 创建 encounter
 * 2. 然后展开完整的大表单(脑区+查体+诊断+附件+分享),和就诊记录展开效果一样
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

  /** 保存基本会诊 → 创建 encounter */
  const handleSaveEncounter = async () => {
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
      setEncounterId(encounter.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  /* ── 未保存 → 显示基础信息表单 ── */
  if (!encounterId) {
    return (
      <div style={{ marginTop: "var(--space-4)" }}>
        <div className="card">
          <div className="exam-panel__header">
            <h3 className="panel__title">📋 新建就诊 — 基本信息</h3>
          </div>
          <div style={{ padding: "var(--space-4) var(--space-6)" }}>
            <EncounterFields value={encounterData} onChange={setEncounterData} />
            {error && <div className="field__error" style={{ marginTop: "var(--space-3)" }}>{error}</div>}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn--primary" onClick={handleSaveEncounter} disabled={saving}
              style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
              {saving ? "保存中…" : "💾 保存基本信息"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── 已保存 → 展开完整大表单 ── */
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      {/* 大脑区域定位表 */}
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title">🧠 大脑区域定位表</h3>
        </div>
        <BrainRegionForm patientId={patientId} encounterId={encounterId} onDone={() => {}} />
      </div>

      {/* ANRM 查体 */}
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title">📋 ANRM 神经科学查体</h3>
        </div>
        <div style={{ padding: "var(--space-4) var(--space-6)" }}>
          <ExamFields results={examResults} onChange={setExamResults} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={async () => {
            const hasResults = Object.keys(examResults).length > 0;
            if (!hasResults) return;
            await createExam.mutateAsync({
              encounterId,
              results: examResults,
            } as ExamSessionInput);
          }} style={{ fontSize: "var(--text-base)" }}>保存查体</button>
        </div>
      </div>

      {/* 神经定位诊断 */}
      <div className="card" style={{ marginBottom: "var(--space-4)", border: "2px solid var(--color-accent)", borderRadius: 8 }}>
        <div className="exam-panel__header" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h3 className="panel__title">🧠 神经定位诊断</h3>
        </div>
        <DiagnosisPanel encounterId={encounterId} />
      </div>

      {/* 附件 */}
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title">📎 检查报告</h3>
        </div>
        <AttachmentPanel encounterId={encounterId} />
      </div>

      {/* 分享 */}
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title">🔗 分享</h3>
        </div>
        <SharePanel encounterId={encounterId} patientId={patientId} />
      </div>

      <div className="form-actions" style={{ justifyContent: "center", gap: "var(--space-3)" }}>
        <button type="button" className="btn btn--primary" onClick={onDone}
          style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-6)" }}>
          ✅ 完成就诊
        </button>
      </div>
    </div>
  );
}
