/**
 * 临床诊断(ICD-10)输入组件 — 多个诊断 + 主诊标记
 */
import { useState, useEffect } from "react";
import { searchICD, getICDByCode, ICD_CATEGORIES, type ICDEntry } from "../icd-catalog";

export interface ClinicalDx {
  code: string;
  name: string;
  isPrimary: boolean;
}

interface Props {
  diagnoses: ClinicalDx[];
  onChange: (next: ClinicalDx[]) => void;
}

export function ClinicalDiagnosisSection({ diagnoses, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ICDEntry[]>([]);
  const [category, setCategory] = useState<string>("全部");
  const [showFreeInput, setShowFreeInput] = useState(false);
  const [freeCode, setFreeCode] = useState("");
  const [freeName, setFreeName] = useState("");

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const all = searchICD(search, 30);
    setResults(category === "全部" ? all : all.filter(e => e.category === category));
  }, [search, category]);

  const addDx = (entry: ICDEntry) => {
    if (diagnoses.find(d => d.code === entry.code)) return;
    const next: ClinicalDx[] = [
      ...diagnoses,
      { code: entry.code, name: entry.name, isPrimary: diagnoses.length === 0 },
    ];
    onChange(next);
    setSearch("");
    setResults([]);
  };

  const addFree = () => {
    const code = freeCode.trim();
    const name = freeName.trim() || getICDByCode(code)?.name || code;
    if (!code) return;
    if (diagnoses.find(d => d.code === code)) return;
    onChange([
      ...diagnoses,
      { code, name, isPrimary: diagnoses.length === 0 },
    ]);
    setFreeCode("");
    setFreeName("");
    setShowFreeInput(false);
  };

  const remove = (code: string) => onChange(diagnoses.filter(d => d.code !== code));

  const setPrimary = (code: string) => {
    onChange(diagnoses.map(d => ({ ...d, isPrimary: d.code === code })));
  };

  return (
    <div>
      {/* 已添加 */}
      {diagnoses.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {diagnoses.map(d => (
            <div key={d.code} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 8px 4px 6px",
              border: d.isPrimary ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
              borderRadius: 4,
              background: d.isPrimary ? "var(--color-accent-weak, #e6f0fa)" : "var(--color-surface-sunken, #f9fafb)",
              fontSize: 12,
            }}>
              {d.isPrimary && <span title="主诊">⭐</span>}
              <span style={{ fontWeight: d.isPrimary ? 700 : 500 }}>
                <code style={{ background: "transparent" }}>{d.code}</code> {d.name}
              </span>
              {!d.isPrimary && (
                <button type="button" onClick={() => setPrimary(d.code)} style={{
                  background: "transparent", border: "none", color: "var(--color-text-muted)",
                  fontSize: 10, cursor: "pointer", padding: 2,
                }} title="设为主诊">⭐</button>
              )}
              <button type="button" onClick={() => remove(d.code)} style={{
                background: "transparent", border: "none", color: "var(--color-abnormal)",
                fontSize: 12, cursor: "pointer", padding: 0,
              }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 搜索 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: "4px 6px", fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 4 }}>
          <option value="全部">全部</option>
          {ICD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索 ICD 编码或诊断名 (如: 腰椎间盘、M51.2)"
          style={{ flex: 1, padding: "4px 8px", fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 4, fontFamily: "inherit" }}
        />
        <button type="button" onClick={() => setShowFreeInput(v => !v)} style={{
          padding: "4px 10px", fontSize: 11, background: "transparent",
          border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
        }}>+ 自定义</button>
      </div>

      {/* 自定义输入 */}
      {showFreeInput && (
        <div style={{
          padding: 8, marginBottom: 8, background: "var(--color-surface-sunken, #f9fafb)",
          border: "1px solid var(--color-border)", borderRadius: 4,
        }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={freeCode} onChange={e => setFreeCode(e.target.value)} placeholder="ICD 编码(如 M51.2)" style={{ width: 130, padding: "4px 6px", fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 4 }} />
            <input value={freeName} onChange={e => setFreeName(e.target.value)} placeholder="诊断名(留空自动从编码查询)" style={{ flex: 1, padding: "4px 6px", fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 4 }} />
          </div>
          <button type="button" onClick={addFree} style={{ padding: "4px 12px", fontSize: 12, background: "var(--color-accent)", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>添加</button>
        </div>
      )}

      {/* 搜索结果下拉 */}
      {results.length > 0 && (
        <div style={{
          maxHeight: 220, overflowY: "auto",
          border: "1px solid var(--color-border)", borderRadius: 4,
          background: "var(--color-surface)",
        }}>
          {results.map(e => (
            <button type="button" key={e.code} onClick={() => addDx(e)} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", padding: "6px 10px", border: "none",
              borderBottom: "1px solid var(--color-border)",
              background: "transparent", textAlign: "left", cursor: "pointer",
              fontSize: 12,
            }} onMouseEnter={ev => ev.currentTarget.style.background = "var(--color-accent-weak, #e6f0fa)"}
               onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
              <span><code style={{ marginRight: 6, color: "var(--color-accent)" }}>{e.code}</code>{e.name}</span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{e.category}</span>
            </button>
          ))}
        </div>
      )}

      {diagnoses.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
          尚未添加临床诊断。临床诊断用于病案首页/医保结算,定位诊断仅用于 ANRM 推理。
        </p>
      )}
    </div>
  );
}