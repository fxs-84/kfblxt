import { useState } from "react";
import { useEncounterAssessments, usePatientAssessments } from "../useAssessments";
import { BrainRegionForm } from "./BrainRegionForm";
import { BrainRegionResult } from "./BrainRegionResult";

interface BrainRegionPanelProps {
  patientId: string;
  /** 优先显示该就诊关联的问卷;若无则展示该患者全部问卷 */
  encounterId?: string;
}

/**
 * 大脑区域定位表入口面板。
 * - 在 active encounter 上下文:默认展示该 encounter 的历史 + 新增按钮
 * - 单独传入 patientId 时:展示该患者的全部历史
 */
export function BrainRegionPanel({ patientId, encounterId }: BrainRegionPanelProps) {
  const { data: encounterList } = useEncounterAssessments(encounterId);
  const { data: patientList } = usePatientAssessments(encounterId ? undefined : patientId);
  const [showForm, setShowForm] = useState(false);

  const list = encounterId ? encounterList : patientList;
  const latest = list && list.length > 0 ? list[0] : null;

  if (!encounterId) {
    // 仅患者维度:展示该患者全部问卷
    return (
      <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
        <div className="panel__head">
          <h3 className="panel__title">🧠 大脑区域定位表</h3>
          <span className="panel__hint">{list?.length ?? 0} 次记录</span>
        </div>
        <div style={{ padding: "var(--space-3) var(--space-5)" }}>
          {!list || list.length === 0 ? (
            <div className="empty">尚未填写。请在就诊记录中展开某次就诊以填写。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {list.map((r) => (
                <BrainRegionResult key={r.id} record={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 正在填写
  if (showForm) {
    return (
      <BrainRegionForm
        patientId={patientId}
        encounterId={encounterId}
        onDone={() => setShowForm(false)}
      />
    );
  }

  // 默认:已有记录展示结果 + 「新建/再次填写」按钮
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <div className="card panel" style={{ marginBottom: "var(--space-3)" }}>
        <div className="panel__head">
          <h3 className="panel__title">🧠 大脑区域定位表</h3>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <span className="panel__hint">{list?.length ?? 0} 次记录</span>
            <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setShowForm(true)}>
              {latest ? "✏️ 重新填写" : "+ 新增填写"}
            </button>
          </div>
        </div>
      </div>
      {latest && <BrainRegionResult record={latest} />}
    </div>
  );
}