import { useState, useEffect } from "react";
import { useDraftAutosave } from "../../exam/useDraftAutosave";
import { useCreateEncounter } from "../../encounters/useEncounters";
import { useCreateExamSession } from "../../exam/useExam";
import { getSession } from "../../../lib/session";
import type { EncounterData } from "./NewEncounterFields";
import type { ExamResult } from "../../exam/exam.types";
import type { ExamSessionInput } from "../../exam/exam.repository";
import { EncounterFields } from "./NewEncounterFields";
import { ExamFields } from "./NewExamFields";
import { BrainRegionForm } from "../../assessments/components/BrainRegionForm";
import { PainAssessmentForm } from "../../assessments/components/PainAssessmentForm";
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
 * 2. 然后展开可折叠的各区块:脑区/查体/诊断/附件/分享
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

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
            <button className="btn btn--primary" onClick={handleSaveEncounter} disabled={saving}
              style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
              {saving ? "保存中…" : "💾 保存基本信息"}
            </button>
            <button className="btn btn--ghost" onClick={onDone}>取消</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── 已保存 → 可折叠的各区块 ── */
  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      {/* 大脑区域定位表 */}
      <FoldSection title="🧠 大脑区域定位表" open={!!expanded.brain} onToggle={() => toggle("brain")}>
        <div className="card" style={{ marginBottom: "var(--space-4)", borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "1px solid var(--color-border)" }}>
          <BrainRegionForm patientId={patientId} encounterId={encounterId} onDone={() => {}} />
        </div>
      </FoldSection>

      {/* 疼痛评估量表(客户自评) */}
      <FoldSection title="📋 疼痛评估量表(客户自评)" open={!!expanded.pain} onToggle={() => toggle("pain")}>
        <div className="card" style={{ marginBottom: "var(--space-4)", borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "1px solid var(--color-border)" }}>
          <PainAssessmentForm patientId={patientId} encounterId="new" draftKey={`new-${patientId}`} />
        </div>
      </FoldSection>

      {/* ANRM 查体 */}
      <FoldSection title="📋 ANRM 神经科学查体" open={!!expanded.exam} onToggle={() => toggle("exam")}>
        <div className="card" style={{ marginBottom: "var(--space-4)", borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "1px solid var(--color-border)" }}>
          <div style={{ padding: "var(--space-4) var(--space-6)" }}>
            <ExamFields results={examResults} onChange={setExamResults} />
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={async () => {
              if (Object.keys(examResults).length === 0) {
                // eslint-disable-next-line no-alert
                alert("请至少填写一项查体结果");
                return;
              }
              try {
                await createExam.mutateAsync({ encounterId, patientId, results: examResults });
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : "保存查体失败,请重试";
                // eslint-disable-next-line no-alert
                alert(message);
              }
            }} style={{ fontSize: "var(--text-base)" }}>保存查体</button>
          </div>
        </div>
      </FoldSection>

      {/* 神经定位诊断 — 自身带 card/header,不再额外包装 */}
      <FoldSection title="🧠 神经定位诊断 (ANRM) + 临床诊断" open={!!expanded.diagnosis} onToggle={() => toggle("diagnosis")}>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DiagnosisPanel encounterId={encounterId} />
        </div>
      </FoldSection>

      {/* 检查报告 */}
      <FoldSection title="📎 检查报告" open={!!expanded.attachment} onToggle={() => toggle("attachment")}>
        <div className="card" style={{ marginBottom: "var(--space-4)", borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "1px solid var(--color-border)" }}>
          <AttachmentPanel encounterId={encounterId} />
        </div>
      </FoldSection>

      {/* 分享 */}
      <FoldSection title="🔗 分享" open={!!expanded.share} onToggle={() => toggle("share")}>
        <div className="card" style={{ marginBottom: "var(--space-4)", borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "1px solid var(--color-border)" }}>
          <SharePanel encounterId={encounterId} patientId={patientId} />
        </div>
      </FoldSection>

      <div className="form-actions" style={{ justifyContent: "center", gap: "var(--space-3)" }}>
        <button className="btn btn--primary" onClick={onDone}
          style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-6)" }}>
          ✅ 完成就诊
        </button>
      </div>
    </div>
  );
}

/** 可折叠区块 */
function FoldSection({ title, open, children, onToggle }: { title: string; open: boolean; children: React.ReactNode; onToggle: () => void }) {
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%",
          background: "var(--color-surface-sunken)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
          padding: "var(--space-3) var(--space-5)", font: "inherit",
          fontSize: "var(--text-base)", fontWeight: 600, cursor: "pointer", textAlign: "left",
          borderBottomLeftRadius: open ? 0 : undefined,
          borderBottomRightRadius: open ? 0 : undefined,
          borderBottom: open ? "none" : undefined,
        }}>
        <span style={{ fontSize: "var(--text-xs)", width: 16, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{open ? "收起" : "展开"}</span>
      </button>
      {open && children}
    </div>
  );
}
