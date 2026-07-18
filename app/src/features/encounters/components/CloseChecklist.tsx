/**
 * 结束就诊完整性检查 — Agent 守护你的临床习惯。
 * 关闭前自动检测:是否没做查体/没写诊断/没建治疗计划/没存 SOAP。
 * 仅供提醒,不强制阻断(治疗师最终决定)。
 */

import { useExamSessions } from "../../exam/useExam";
import { useDiagnosis } from "../../diagnosis/useDiagnosis";
import { useTreatmentPlans } from "../../treatment/useTreatment";

interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  /** 严重程度:must=建议一定做 | should=最好做 | nice=锦上添花 */
  level: "must" | "should" | "nice";
}

interface CloseChecklistProps {
  encounterId: string;
  hasSoap: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  closing: boolean;
}

export function CloseChecklist({ encounterId, hasSoap, onConfirm, onCancel, closing }: CloseChecklistProps) {
  const { data: sessions = [] } = useExamSessions(encounterId);
  const { data: diagnosis } = useDiagnosis(encounterId);
  const { data: plans = [] } = useTreatmentPlans(encounterId);

  const items: ChecklistItem[] = [
    { key: "exam", label: "完成查体记录", ok: sessions.length > 0, level: "must" },
    { key: "diagnosis", label: "完成神经定位诊断", ok: Boolean(diagnosis), level: "must" },
    { key: "treatment", label: "制定治疗计划", ok: plans.length > 0, level: "must" },
    { key: "soap", label: "存档 SOAP 临床笔记", ok: hasSoap, level: "should" },
  ];

  const allMustOk = items.filter((i) => i.level === "must").every((i) => i.ok);
  const pendingCount = items.filter((i) => !i.ok).length;

  if (allMustOk) {
    // 全部过关,直接关闭
    onConfirm();
    return null;
  }

  return (
    <div className="checklist-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="checklist-card">
        <div className="checklist-card__head">
          <h4 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>
            {pendingCount > 1 ? `还有 ${pendingCount} 项未完成` : "还有 1 项未完成"}
          </h4>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            建议完成后再结束就诊,确保病历完整。
          </p>
        </div>

        <div className="checklist-card__body">
          {items.map((item) => (
            <div key={item.key} className={`checklist-item ${item.ok ? "checklist-item--done" : "checklist-item--pending"}`}>
              <span className="checklist-item__icon">{item.ok ? "✓" : "○"}</span>
              <span className="checklist-item__label">{item.label}</span>
              <span className={`badge badge--${item.level === "must" ? "abnormal" : "caution"}`} style={{ fontSize: "10px", marginLeft: "auto" }}>
                {item.level === "must" ? "重要" : "建议"}
              </span>
            </div>
          ))}
        </div>

        <div className="checklist-card__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={closing}>返回补充</button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={closing}>
            {closing ? "保存中…" : "仍然结束就诊"}
          </button>
        </div>
      </div>
    </div>
  );
}
