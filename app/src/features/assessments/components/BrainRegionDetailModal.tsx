import { useEffect, useRef } from "react";
import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_ITEMS,
  PHONE_EAR_OPTIONS,
  REGION_SEVERITY_LABELS,
  SCORE_DESCRIPTORS,
  regionMaxScore,
  type BrainRegionId,
  type BrainRegionItem,
  type RegionSeverity,
} from "../scales/brain-region";
import type { BrainAssessmentRecordRow } from "../assessment.repository";

/**
 * 大脑区域定位表 — 单分区做题详情弹层。
 *
 * 顶层设计:
 *   · 治疗师/客户维度报告页可点击分区条 → 弹层显示该分区下的题目原文 + 患者作答分数
 *   · 第 46 题(电话偏好侧)为单选,不在 0-4 答卷中,改查 record.responses.phoneEar
 *   · 半球倾向标签(L/R)只展示用,不影响总分
 *
 * 契约:
 *   - regionId=null 时不渲染任何 DOM
 *   - regionId 无效(不在 BRAIN_REGION_DEFS)时不渲染
 *   - ESC 键、点击背景、点击关闭按钮均触发 onClose
 */
interface BrainRegionDetailModalProps {
  record: BrainAssessmentRecordRow;
  /** 当前查看的分区;null 时不渲染弹层 */
  regionId: BrainRegionId | null;
  onClose: () => void;
}

// 严重度配色(只读常量,不依赖主题色变量以保证弹层一致)
const SEV_COLOR: Record<RegionSeverity, string> = {
  normal: "#16a34a",
  mild: "#ca8a04",
  moderate: "#ea580c",
  severe: "#dc2626",
};

export function BrainRegionDetailModal({ record, regionId, onClose }: BrainRegionDetailModalProps) {
  // 把 onClose 装进 ref,避免父组件 onClose 引用变化导致 ESC 监听频繁重绑
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ESC 键关闭(仅在弹层打开时绑定,regionId 变化才重绑)
  useEffect(() => {
    if (!regionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [regionId]);

  if (!regionId) return null;

  const def = BRAIN_REGION_DEFS.find((d) => d.id === regionId);
  if (!def) return null;

  const itemsInRegion: BrainRegionItem[] = BRAIN_REGION_ITEMS.filter(
    (it) => it.index >= def.range[0] && it.index <= def.range[1],
  );

  const subScore = record.score.byRegion[def.id] ?? 0;
  const severity: RegionSeverity = record.score.severityByRegion[def.id] ?? "normal";
  const max = regionMaxScore(def);
  const phoneEarLabel = PHONE_EAR_OPTIONS.find((o) => o.value === record.responses.phoneEar)?.label;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="brain-region-detail-backdrop"
    >
      <div
        className="modal-card modal-card--wide modal-card--scroll"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-region-detail-title"
      >
        <header className="modal-card__head">
          <h2 id="brain-region-detail-title" className="modal-card__title">
            🧠 {def.label}
          </h2>
          <button
            type="button"
            className="modal-card__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <div className="modal-card__body" data-testid="brain-region-detail-body">
          {/* 元信息条:严重度 + 描述 + 区间 + 当前分数 */}
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
            <span className={`brain-severity brain-severity--${severity}`}>
              {REGION_SEVERITY_LABELS[severity]}
            </span>
            {def.detail && <span>{def.detail}</span>}
            <span>
              区域 {def.range[0]} - {def.range[1]} 题
            </span>
            <span style={{ color: SEV_COLOR[severity], fontWeight: 600 }}>
              {subScore} / {max} 分
            </span>
          </div>

          {/* 题目列表 */}
          {itemsInRegion.length === 0 ? (
            <div className="empty">该分区暂无题目</div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {itemsInRegion.map((it) => (
                <li
                  key={it.index}
                  data-testid={`brain-region-detail-item-${it.index}`}
                  style={{
                    padding: "12px 0",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      flex: "0 0 40px",
                      fontWeight: 700,
                      color: it.index === 46 ? "#0d9488" : "var(--color-text-muted)",
                    }}
                  >
                    Q{it.index}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{it.text}</div>
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {it.index === 46 ? (
                        // 第 46 题:电话偏好侧,独立展示
                        <>
                          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                            📞 电话偏好侧(不计入总分)
                          </span>
                          {phoneEarLabel ? (
                            <span
                              data-testid={`brain-region-detail-score-46`}
                              style={{
                                background: "#0d9488",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                padding: "3px 12px",
                                borderRadius: 999,
                              }}
                            >
                              {phoneEarLabel}
                            </span>
                          ) : (
                            <span
                              data-testid={`brain-region-detail-score-46`}
                              style={{ color: "var(--color-text-muted)", fontSize: 12 }}
                            >
                              未作答
                            </span>
                          )}
                        </>
                      ) : (
                        // 普通 0-4 题:作答分数 chip
                        <>
                          {it.side === "L" && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#0284c7",
                                background: "#e0f2fe",
                                padding: "2px 8px",
                                borderRadius: 6,
                              }}
                            >
                              左半球相关
                            </span>
                          )}
                          {it.side === "R" && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#ea580c",
                                background: "#ffedd5",
                                padding: "2px 8px",
                                borderRadius: 6,
                              }}
                            >
                              右半球相关
                            </span>
                          )}
                          {(() => {
                            const score = record.responses.items[it.index];
                            const hasAnswer =
                              score !== undefined && score !== null && Number.isFinite(score);
                            if (!hasAnswer) {
                              return (
                                <span
                                  data-testid={`brain-region-detail-score-${it.index}`}
                                  style={{
                                    background: "#cbd5e1",
                                    color: "#fff",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: "3px 12px",
                                    borderRadius: 999,
                                    minWidth: 60,
                                    textAlign: "center",
                                  }}
                                >
                                  未作答
                                </span>
                              );
                            }
                            const descriptor = SCORE_DESCRIPTORS[score];
                            return (
                              <span
                                data-testid={`brain-region-detail-score-${it.index}`}
                                style={{
                                  background:
                                    score === 0
                                      ? "#94a3b8"
                                      : score === 1
                                      ? "#22c55e"
                                      : score === 2
                                      ? "#f59e0b"
                                      : score === 3
                                      ? "#f97316"
                                      : "#dc2626",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  padding: "3px 12px",
                                  borderRadius: 999,
                                  minWidth: 60,
                                  textAlign: "center",
                                }}
                              >
                                {score} · {descriptor?.label ?? "?"}
                              </span>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}