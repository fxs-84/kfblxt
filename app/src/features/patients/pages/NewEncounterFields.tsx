import { useState } from "react";
import { SYMPTOM_GROUPS, SYMPTOM_GROUP_KEYS, type SymptomGroup } from "../../encounters/encounter.schema";
import { BodyMap } from "../../../components/bodymap/BodyMap";

export interface EncounterData {
  encounterDate: string;
  visitType: "初诊" | "复诊";
  chiefComplaint: {
    regions: string[];
    distributionNote: string;
    nature: string[];
    vas: number;
    durationText: string;
    onset: string;
  };
  amount: number;
}

interface Props {
  value: EncounterData;
  onChange: (v: EncounterData) => void;
}

function set<T extends EncounterData>(prev: T, patch: Partial<T>): T {
  return { ...prev, ...patch };
}

function setCC(prev: EncounterData, cc: Partial<EncounterData["chiefComplaint"]>): EncounterData {
  return { ...prev, chiefComplaint: { ...prev.chiefComplaint, ...cc } };
}

export function EncounterFields({ value, onChange }: Props) {
  const [symptomOpen, setSymptomOpen] = useState<Set<SymptomGroup>>(new Set(["疼痛", "感觉异常"]));

  const toggleGroup = (g: SymptomGroup) => {
    const next = new Set(symptomOpen);
    if (next.has(g)) next.delete(g); else next.add(g);
    setSymptomOpen(next);
  };

  const isNatureSelected = (nature: string) => value.chiefComplaint.nature.includes(nature);
  const toggleNature = (nature: string) => {
    const next = isNatureSelected(nature)
      ? value.chiefComplaint.nature.filter((n) => n !== nature)
      : [...value.chiefComplaint.nature, nature];
    onChange(setCC(value, { nature: next }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* 基本字段 */}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="enc-encounter-date" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>就诊日期</label>
          <input id="enc-encounter-date" type="date" value={value.encounterDate}
            onChange={(e) => onChange(set(value, { encounterDate: e.target.value }))} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="enc-visit-type" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>就诊类型</label>
          <select id="enc-visit-type" value={value.visitType}
            onChange={(e) => onChange(set(value, { visitType: e.target.value as "初诊" | "复诊" }))}>
            <option value="初诊">初诊</option>
            <option value="复诊">复诊</option>
          </select>
        </div>
      </div>

      {/* 症状定位 */}
      <div className="field">
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, display: "block" }}>症状定位 (点击标记)</span>
        <BodyMap value={value.chiefComplaint.regions}
          onChange={(regions) => onChange(setCC(value, { regions }))} />
      </div>

      <div className="field">
        <label htmlFor="enc-dist-note" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>皮区 / 部位备注</label>
        <input id="enc-dist-note" value={value.chiefComplaint.distributionNote}
          onChange={(e) => onChange(setCC(value, { distributionNote: e.target.value }))}
          placeholder="如:S1 皮区、坐骨神经走行" />
      </div>

      {/* 症状性质 */}
      <div className="field">
        <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>症状性质 (可多选)</label>
        <div className="symptom-groups">
          {SYMPTOM_GROUP_KEYS.map((group) => {
            const open = symptomOpen.has(group);
            return (
              <div key={group} className="symptom-group">
                <button type="button" className="symptom-group__toggle"
                  onClick={() => toggleGroup(group)}>
                  <span className="symptom-group__chevron">{open ? "▾" : "▸"}</span>
                  {group}
                  <span className="symptom-group__hint">{SYMPTOM_GROUPS[group].length}</span>
                </button>
                {open && (
                  <div className="chip-group symptom-group__chips">
                    {SYMPTOM_GROUPS[group].map((n) => (
                      <label key={n} className="chip" style={isNatureSelected(n) ? { borderColor: "var(--color-accent)", background: "var(--color-accent-weak)" } : {}}>
                        <input type="checkbox" checked={isNatureSelected(n)}
                          onChange={() => toggleNature(n)} />
                        {n}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* VAS + 病程 */}
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="enc-vas" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>疼痛 VAS (0-10)</label>
          <input id="enc-vas" type="number" min={0} max={10} value={value.chiefComplaint.vas}
            onChange={(e) => onChange(setCC(value, { vas: Number(e.target.value) }))} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="enc-duration" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>病程</label>
          <input id="enc-duration" value={value.chiefComplaint.durationText}
            onChange={(e) => onChange(setCC(value, { durationText: e.target.value }))}
            placeholder="如:3个月" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="enc-trigger" style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>发病诱因 (选填)</label>
        <input id="enc-trigger" value={value.chiefComplaint.onset}
          onChange={(e) => onChange(setCC(value, { onset: e.target.value }))}
          placeholder="如:无明显诱因、运动后、外伤后" />
      </div>
    </div>
  );
}
