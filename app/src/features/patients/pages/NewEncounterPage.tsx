import { useState } from "react";
import { useCreateEncounter } from "../../encounters/useEncounters";
import { useCreateExamSession } from "../../exam/useExam";
import { getSession } from "../../../lib/session";
import type { EncounterData } from "./NewEncounterFields";
import type { ExamResult } from "../../exam/exam.types";
import { EncounterFields } from "./NewEncounterFields";
import { ExamFields } from "./NewExamFields";
import { BrainRegionForm } from "../../assessments/components/BrainRegionForm";

interface NewEncounterPageProps {
  patientId: string;
  onDone: () => void;
}

/**
 * 新建就诊综合页面(内联,非弹窗):
 * - 症状定位 + 基础信息 (EncounterFields)
 * - 大脑区域定位表   (BrainRegionForm)
 * - ANRM 神经科学查体 (ExamFields)
 * - 一次性保存:encounter → assessment → exam
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
  const [done, setDone] = useState(false);

  /** 新建就诊各表单区块的默认展开配置 */
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    symptom: true,
    brain: false,
    exam: false,
  });
  const toggleSection = (key: string) => setSectionsOpen((p) => ({ ...p, [key]: !p[key] }));

  const handleSaveAll = async () => {
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

      setDone(true);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  if (done) return null;

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div className="exam-panel__header">
          <h3 className="panel__title" style={{ fontSize: "var(--text-lg)" }}>📋 新建就诊 — 综合表单</h3>
          <span className="panel__hint">所有数据一次性保存</span>
        </div>

        {/* === 区块1:症状定位 + 基础信息 === */}
        <div>
          <SectionToggle title="🩻 症状定位与基本信息" open={sectionsOpen.symptom} onToggle={() => toggleSection("symptom")} />
          {sectionsOpen.symptom && (
            <div style={{ padding: "var(--space-4) var(--space-6)" }}>
              <EncounterFields value={encounterData} onChange={setEncounterData} />
            </div>
          )}
        </div>

        {/* === 区块2:大脑区域定位表 === */}
        <div>
          <SectionToggle title="🧠 大脑区域定位表" open={sectionsOpen.brain} onToggle={() => toggleSection("brain")} />
          {sectionsOpen.brain && (
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <BrainRegionForm patientId={patientId} encounterId="new" onDone={() => toggleSection("exam")} />
            </div>
          )}
        </div>

        {/* === 区块3:ANRM 查体 === */}
        <div>
          <SectionToggle title="📋 ANRM 神经科学查体" open={sectionsOpen.exam} onToggle={() => toggleSection("exam")} />
          {sectionsOpen.exam && (
            <div style={{ padding: "var(--space-4) var(--space-6)" }}>
              <ExamFields results={examResults} onChange={setExamResults} />
            </div>
          )}
        </div>

        {error && <div className="field__error" style={{ margin: "var(--space-3) var(--space-6)" }}>{error}</div>}

        <div className="form-actions" style={{ borderTop: "1px solid var(--color-border)", background: "#fafbfc" }}>
          <button type="button" className="btn btn--primary" onClick={handleSaveAll} disabled={saving}
            style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
            {saving ? "保存中…" : "💾 一键保存就诊 (会诊 + 查体)"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 可折叠区块头 */
function SectionToggle({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)",
        width: "100%", background: "var(--color-surface-sunken)", border: "none",
        borderBottom: "1px solid var(--color-border)",
        padding: "var(--space-3) var(--space-6)", font: "inherit",
        fontSize: "var(--text-base)", fontWeight: 600, cursor: "pointer", textAlign: "left",
      }}>
      <span style={{ fontSize: "var(--text-xs)", width: 16 }}>{open ? "▾" : "▸"}</span>
      {title}
    </button>
  );
}
