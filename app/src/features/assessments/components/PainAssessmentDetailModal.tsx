import { useEffect, useRef } from "react";
import { CSI_ITEMS, CSI_SCORE_DESCRIPTORS, CSI_SEVERITY_LABELS } from "../scales/csi";
import { SLANSS_ITEMS, SLANSS_THRESHOLD } from "../scales/slanss";
import type { PainAssessmentRecordRow } from "../assessment.repository";
import { formatDate } from "../../../lib/format";

/**
 * 疼痛评估(CSI + S-LANSS)做题详情弹层 — 与大脑区域定位表详情一致:
 *   · 点击历史记录卡片触发,逐题展示题干 + 患者作答
 *   · CSI 0-4 分按严重度配色;S-LANSS 显示 是/否 + 分值
 *   · record=null 时不渲染;ESC / 背景点击 / 关闭按钮均触发 onClose
 */
interface PainAssessmentDetailModalProps {
  record: PainAssessmentRecordRow | null;
  onClose: () => void;
}

/** CSI 0-4 分配色(与脑区详情弹层一致) */
const CSI_CHIP_COLOR = ["#94a3b8", "#22c55e", "#f59e0b", "#f97316", "#dc2626"];

export function PainAssessmentDetailModal({ record, onClose }: PainAssessmentDetailModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record]);

  if (!record) return null;

  const slanssPositive = record.slanss.positive;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="pain-detail-backdrop"
    >
      <div
        className="modal-card modal-card--wide modal-card--scroll"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pain-detail-title"
      >
        <header className="modal-card__head">
          <h2 id="pain-detail-title" className="modal-card__title">
            📋 疼痛评估做题详情
          </h2>
          <button type="button" className="modal-card__close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-card__body">
          {/* 元信息条:日期 + 两个总分 + 严重度 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
              padding: "var(--space-3)",
              background: "var(--color-surface-sunken)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <span>{formatDate(record.createdAt)}</span>
            <span>
              CSI <b style={{ color: "var(--color-text)" }}>{record.csi.total}</b>/100
            </span>
            <span className={`brain-severity brain-severity--${record.csi.severity === "extreme" ? "severe" : record.csi.severity}`}>
              {CSI_SEVERITY_LABELS[record.csi.severity]}
            </span>
            <span>
              S-LANSS <b style={{ color: "var(--color-text)" }}>{record.slanss.total}</b>/24
            </span>
            {slanssPositive ? (
              <span className="brain-severity brain-severity--severe">⚠ 阳性(≥{SLANSS_THRESHOLD})</span>
            ) : (
              <span className="brain-severity brain-severity--normal">阴性</span>
            )}
          </div>

          {/* CSI 题目列表 */}
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "var(--space-4) 0 var(--space-2)" }}>
            🧠 CSI 中枢敏感性量表(25 题)
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {CSI_ITEMS.map((it) => {
              const v = record.csi.items[it.index];
              const answered = v !== undefined && Number.isFinite(v);
              const descriptor = answered ? CSI_SCORE_DESCRIPTORS[v] : null;
              return (
                <li
                  key={it.index}
                  data-testid={`pain-detail-csi-item-${it.index}`}
                  style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <div style={{ flex: "0 0 40px", fontWeight: 700, color: "var(--color-text-muted)" }}>Q{it.index}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{it.text}</div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        data-testid={`pain-detail-csi-score-${it.index}`}
                        style={{
                          background: answered ? CSI_CHIP_COLOR[v] : "#cbd5e1",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 12px",
                          borderRadius: 999,
                          minWidth: 60,
                          display: "inline-block",
                          textAlign: "center",
                        }}
                      >
                        {answered ? `${v} · ${descriptor?.label ?? "?"}` : "未作答"}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* S-LANSS 题目列表 */}
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, margin: "var(--space-4) 0 var(--space-2)" }}>
            🩹 S-LANSS 神经病理性疼痛(7 题)
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {SLANSS_ITEMS.map((it) => {
              const v = record.slanss.items[it.index];
              const answered = v !== undefined && Number.isFinite(v);
              const isYes = answered && v === it.scores[1];
              return (
                <li
                  key={it.index}
                  data-testid={`pain-detail-slanss-item-${it.index}`}
                  style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <div style={{ flex: "0 0 40px", fontWeight: 700, color: "var(--color-text-muted)" }}>Q{it.index}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{it.question}</div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        data-testid={`pain-detail-slanss-score-${it.index}`}
                        style={{
                          background: !answered ? "#cbd5e1" : isYes ? "#dc2626" : "#94a3b8",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 12px",
                          borderRadius: 999,
                          minWidth: 60,
                          display: "inline-block",
                          textAlign: "center",
                        }}
                      >
                        {!answered ? "未作答" : isYes ? `是:${it.options[1]} (+${v}分)` : `否:${it.options[0]}`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
