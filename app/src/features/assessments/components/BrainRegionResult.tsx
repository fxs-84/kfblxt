import { useState } from "react";
import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_MAX_TOTAL,
  BRAIN_REGION_SCORED_ITEM_COUNT,
  PHONE_EAR_OPTIONS,
  regionMaxScore,
  REGION_SEVERITY_LABELS,
  type BrainRegionId,
  type RegionSeverity,
} from "../scales/brain-region";
import type { AssessmentRecord } from "../assessment.types";
import type { BrainAssessmentRecordRow } from "../assessment.repository";
import { formatDate } from "../../../lib/format";
import { useDeleteAssessment } from "../useAssessments";

interface BrainRegionResultProps {
  record: BrainAssessmentRecordRow;
  onDeleted?: () => void;
}

/**
 * 单次大脑区域定位表结果摘要视图。
 * - 总分 + 百分比
 * - 16 分区进度条(高负担区高亮)
 * - 第 46 题偏好侧单独展示
 */
export function BrainRegionResult({ record, onDeleted }: BrainRegionResultProps) {
  const { score, phoneEar, responses, note } = record;
  const deleteAssessment = useDeleteAssessment();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    await deleteAssessment.mutateAsync({
      id: record.id,
      patientId: record.patientId,
      encounterId: record.encounterId,
    });
    onDeleted?.();
  };

  const phoneEarLabel = PHONE_EAR_OPTIONS.find((o) => o.value === phoneEar)?.label ?? "未填";
  const answered = Object.values(responses.items).filter((v) => v !== undefined).length;

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <h3 className="panel__title">🧠 大脑区域定位表</h3>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <span className="panel__hint">
            {formatDate(record.createdAt)} · {answered}/{BRAIN_REGION_SCORED_ITEM_COUNT} 题
          </span>
          {confirming ? (
            <>
              <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)", color: "var(--color-abnormal)" }} onClick={handleDelete}>确认删除</button>
              <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setConfirming(false)}>取消</button>
            </>
          ) : (
            <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setConfirming(true)}>删除</button>
          )}
        </div>
      </div>
      <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
        {/* 高负担警示条(顶部,一目了然) */}
        {(() => {
          const severe = score.affectedRegions.filter((id) => score.severityByRegion[id] === "severe");
          const moderate = score.affectedRegions.filter((id) => score.severityByRegion[id] === "moderate");
          if (severe.length > 0) {
            const names = severe.map((id) => BRAIN_REGION_DEFS.find((d) => d.id === id)?.label ?? id);
            return (
              <div className="brain-alert brain-alert--severe">
                <span className="brain-alert__icon">🔴</span>
                <span>检测到 <b>{severe.length}</b> 个重度负担分区:{names.join("、")}</span>
              </div>
            );
          }
          if (moderate.length > 0) {
            const names = moderate.map((id) => BRAIN_REGION_DEFS.find((d) => d.id === id)?.label ?? id);
            return (
              <div className="brain-alert brain-alert--moderate">
                <span className="brain-alert__icon">🟧</span>
                <span>检测到 <b>{moderate.length}</b> 个中度负担分区:{names.join("、")}</span>
              </div>
            );
          }
          return null;
        })()}

        {/* 总览 */}
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>总分(参考)</div>
            <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--color-text)" }}>
              {score.total}<span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontWeight: 400 }}> / {BRAIN_REGION_MAX_TOTAL}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>有问题分区</div>
            <span className={`brain-affected-chip ${score.affectedRegions.length > 0 ? "brain-affected-chip--has-issue" : ""}`}>
              {score.affectedRegions.length > 0 && <span className="brain-affected-chip__pulse" />}
              {score.affectedRegions.length} / 16
            </span>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>第46题·电话偏好</div>
            <div style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{phoneEarLabel}</div>
          </div>
        </div>

        {/* 分区小条(按模块判定 + 严重度) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          {BRAIN_REGION_DEFS.map((def) => {
            const sub = score.byRegion[def.id] ?? 0;
            const max = regionMaxScore(def);
            const pct = max > 0 ? Math.round((sub / max) * 100) : 0;
            const severity: RegionSeverity = score.severityByRegion[def.id] ?? "normal";
            const isAffected = severity !== "normal";
            return (
              <div
                key={def.id}
                className={`brain-region-bar brain-region-bar--${severity}`}
                title={`${def.label}: ${sub}/${max} (${pct}%) — ${REGION_SEVERITY_LABELS[severity]}`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)", marginBottom: 4 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isAffected ? 700 : 400, color: severity === "severe" ? "var(--color-abnormal)" : severity === "moderate" ? "#c45a00" : severity === "mild" ? "#d68a1a" : "inherit" }}>
                    {severity === "severe" && <span style={{ marginRight: 2 }}>🔴</span>}
                    {severity === "moderate" && <span style={{ marginRight: 2 }}>🟧</span>}
                    {severity === "mild" && <span style={{ marginRight: 2 }}>🟡</span>}
                    <span className={`brain-region-bar__dot brain-region-bar__dot--${severity}`} />
                    {def.label}
                  </span>
                  <span className={`brain-severity brain-severity--${severity}`}>{REGION_SEVERITY_LABELS[severity]}</span>
                </div>
                <div className="brain-region-bar__track">
                  <div
                    className="brain-region-bar__fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: 3, textAlign: "right" }}>{sub} / {max}</div>
              </div>
            );
          })}
        </div>

        {/* 有问题分区提示(按严重度分组) */}
        {score.affectedRegions.length > 0 && (() => {
          const severe = score.affectedRegions.filter((id) => score.severityByRegion[id] === "severe");
          const moderate = score.affectedRegions.filter((id) => score.severityByRegion[id] === "moderate");
          const mild = score.affectedRegions.filter((id) => score.severityByRegion[id] === "mild");
          const labelOf = (id: BrainRegionId) => BRAIN_REGION_DEFS.find((d) => d.id === id)?.label ?? id;
          return (
            <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--color-abnormal-weak, #fef0ed)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
              <b style={{ color: "var(--color-abnormal)" }}>问题分区</b>(模块小计 ≥ 模块满分 1/4):
              {severe.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span className="brain-severity brain-severity--severe">🔴 重度</span>
                  {severe.map(labelOf).join("、")}
                </div>
              )}
              {moderate.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span className="brain-severity brain-severity--moderate">🟧 中度</span>
                  {moderate.map(labelOf).join("、")}
                </div>
              )}
              {mild.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span className="brain-severity brain-severity--mild">🟡 轻度</span>
                  {mild.map(labelOf).join("、")}
                </div>
              )}
            </div>
          );
        })()}

        {note && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", borderLeft: "2px solid var(--color-border)", paddingLeft: "var(--space-3)", marginTop: "var(--space-2)" }}>
            备注:{note}
          </div>
        )}
      </div>
    </div>
  );
}