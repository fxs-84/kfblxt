import { useState } from "react";
import Model from "react-body-highlighter";
import { ANTERIOR_POLYS, POSTERIOR_POLYS } from "./overlay-polys";
import {
  regionLabel,
  OVERLAY_ANTERIOR,
  OVERLAY_POSTERIOR,
  type BodyRegion,
} from "./regions";

type View = "anterior" | "posterior";

interface BodyMapProps {
  value: readonly BodyRegion[];
  onChange?: (next: BodyRegion[]) => void;
  intensity?: Partial<Record<BodyRegion, number>>;
}

const BODY_COLOR = "var(--bodymap-base)";
const SELECT_COLOR = "var(--bodymap-selected)";
const INTENSITY_COLORS = [
  "var(--bodymap-intensity-low)",
  "var(--bodymap-intensity-mid)",
  "var(--bodymap-intensity-high)",
];

function vasBucket(vas: number): number {
  if (vas <= 3) return 1;
  if (vas <= 6) return 2;
  return 3;
}

export function BodyMap({ value, onChange, intensity }: BodyMapProps) {
  const [view, setView] = useState<View>("anterior");
  const interactive = Boolean(onChange);
  const selected = new Set(value);
  const polys = view === "anterior" ? ANTERIOR_POLYS : POSTERIOR_POLYS;
  const overlayShapes = view === "anterior" ? OVERLAY_ANTERIOR : OVERLAY_POSTERIOR;

  const fillForRegion = (region: BodyRegion): string => {
    if (interactive && selected.has(region)) return SELECT_COLOR;
    if (!interactive) {
      const v = intensity?.[region] ?? 0;
      return v > 0 ? INTENSITY_COLORS[vasBucket(v) - 1] : BODY_COLOR;
    }
    return BODY_COLOR;
  };

  const toggleRegion = (region: BodyRegion) => {
    if (!onChange) return;
    onChange(selected.has(region) ? value.filter((r) => r !== region) : [...value, region]);
  };

  return (
    <div className="bodymap">
      <div className="bodymap__toggle" role="tablist" aria-label="视图切换">
        <button type="button" role="tab" aria-selected={view === "anterior"}
          aria-controls="bodymap-figure"
          id="bodymap-tab-anterior"
          tabIndex={view === "anterior" ? 0 : -1}
          className={view === "anterior" ? "active" : ""} onClick={() => setView("anterior")}>
          正面
        </button>
        <button type="button" role="tab" aria-selected={view === "posterior"}
          aria-controls="bodymap-figure"
          id="bodymap-tab-posterior"
          tabIndex={view === "posterior" ? 0 : -1}
          className={view === "posterior" ? "active" : ""} onClick={() => setView("posterior")}>
          背面
        </button>
      </div>

      <div
        className="bodymap__figure"
        id="bodymap-figure"
        role="tabpanel"
        aria-labelledby={view === "anterior" ? "bodymap-tab-anterior" : "bodymap-tab-posterior"}
      >
        <Model type={view} bodyColor={BODY_COLOR} style={{ width: "100%" }} />

        {/* 每条多边形独立可点,独立着色 */}
        <svg className="bodymap__overlay" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">
          {[...polys.entries()].map(([region, points]) => {
            const active = selected.has(region);
            return (
              <polygon
                key={region}
                points={points}
                fill={fillForRegion(region)}
                opacity={active || intensity?.[region] ? 1 : undefined}
                style={
                  interactive
                    ? { cursor: "pointer", pointerEvents: "auto" }
                    : active
                      ? undefined
                      : { pointerEvents: "none" }
                }
                role={interactive ? "checkbox" : undefined}
                aria-checked={interactive ? active : undefined}
                aria-label={interactive ? regionLabel(region) : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => toggleRegion(region) : undefined}
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRegion(region);
                        }
                      }
                    : undefined
                }
              />
            );
          })}

          {/* 手/足(库不含,独立叠加) */}
          {overlayShapes.map((s) => {
            const region = s.region as BodyRegion;
            return (
              <polygon
                key={region}
                points={s.points}
                fill={fillForRegion(region)}
                style={interactive ? { cursor: "pointer", pointerEvents: "auto" } : undefined}
                role={interactive ? "checkbox" : undefined}
                aria-checked={interactive ? selected.has(region) : undefined}
                aria-label={interactive ? regionLabel(region) : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => toggleRegion(region) : undefined}
                onKeyDown={
                  interactive
                    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRegion(region); } }
                    : undefined
                }
              />
            );
          })}

          {/* 五官(仅正面) */}
          {view === "anterior" && (
            <g className="bodymap__face" aria-hidden="true">
              <ellipse cx={45.5} cy={12} rx={1.7} ry={2.2} fill="var(--bodymap-face-fill)" />
              <ellipse cx={54.5} cy={12} rx={1.7} ry={2.2} fill="var(--bodymap-face-fill)" />
              <path d="M50 13.5 L48.2 17.5 L51.8 17.5 Z" fill="none" stroke="var(--bodymap-face-stroke)" strokeWidth={0.7} strokeLinejoin="round" />
              <path d="M46.5 20.5 Q50 23 53.5 20.5" fill="none" stroke="var(--bodymap-face-stroke)" strokeWidth={0.7} strokeLinecap="round" />
            </g>
          )}
        </svg>
      </div>

      {interactive && (
        <div className="bodymap__selected">
          {value.length === 0 ? (
            <span className="bodymap__empty">点击人体标记症状区域</span>
          ) : (
            value.map((r) => (
              <button type="button" key={r} className="bodymap__tag"
                onClick={() => toggleRegion(r)}
                aria-label={`移除 ${regionLabel(r)}`}>
                {regionLabel(r)} ✕
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
