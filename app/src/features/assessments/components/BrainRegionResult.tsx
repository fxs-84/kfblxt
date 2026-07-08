import { useState } from "react";
import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_MAX_TOTAL,
  PHONE_EAR_OPTIONS,
  regionMaxScore,
  type BrainRegionId,
} from "../scales/brain-region";
import type { AssessmentRecord } from "../assessment.types";
import type { AssessmentRecordRow } from "../assessment.repository";
import { formatDate } from "../../../lib/format";
import { useDeleteAssessment } from "../useAssessments";

interface BrainRegionResultProps {
  record: AssessmentRecordRow;
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
            {formatDate(record.createdAt)} · {answered}/98 题
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
        {/* 总览 */}
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "baseline", marginBottom: "var(--space-3)" }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>总分</div>
            <div style={{ fontSize: "var(--text-3xl)", fontWeight: 700, color: score.percent >= 50 ? "var(--color-abnormal)" : score.percent >= 25 ? "var(--color-caution)" : "var(--color-normal)" }}>
              {score.total}<span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontWeight: 400 }}> / {BRAIN_REGION_MAX_TOTAL}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>负担占比</div>
            <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{score.percent}%</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>高负担分区</div>
            <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{score.highBurdenRegions.length}<span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontWeight: 400 }}> / 16</span></div>
          </div>
          <div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>第46题·电话偏好</div>
            <div style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{phoneEarLabel}</div>
          </div>
        </div>

        {/* 分区小条 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          {BRAIN_REGION_DEFS.map((def) => {
            const sub = score.byRegion[def.id] ?? 0;
            const max = regionMaxScore(def);
            const pct = max > 0 ? Math.round((sub / max) * 100) : 0;
            const isHigh = score.highBurdenRegions.includes(def.id as BrainRegionId);
            return (
              <div
                key={def.id}
                className={`brain-region-bar ${isHigh ? "brain-region-bar--high" : ""}`}
                title={`${def.label}: ${sub}/${max} (${pct}%)`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBottom: 2 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def.label}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{sub}/{max}</span>
                </div>
                <div className="brain-region-bar__track">
                  <div
                    className="brain-region-bar__fill"
                    style={{ width: `${pct}%`, background: isHigh ? "var(--color-abnormal)" : pct >= 25 ? "var(--color-caution)" : "var(--color-accent)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 高负担分区提示 */}
        {score.highBurdenRegions.length > 0 && (
          <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--color-abnormal-weak, #fef0ed)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
            <b style={{ color: "var(--color-abnormal)" }}>高负担分区</b>(小计 ≥ 50% 满分):
            {" "}
            {score.highBurdenRegions
              .map((id: BrainRegionId) => BRAIN_REGION_DEFS.find((d) => d.id === id)?.label ?? id)
              .join("、")}
          </div>
        )}

        {note && (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", borderLeft: "2px solid var(--color-border)", paddingLeft: "var(--space-3)", marginTop: "var(--space-2)" }}>
            备注:{note}
          </div>
        )}
      </div>
    </div>
  );
}