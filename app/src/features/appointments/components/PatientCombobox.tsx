import { useEffect, useMemo, useRef, useState } from "react";
import { useCreatePatient, usePatients } from "../../patients/usePatients";
import type { PatientRecord } from "../../patients/patient.repository";
import { getSession } from "../../../lib/session";
import { SEX_LABELS, birthDateFromAge } from "../../../lib/format";
import type { Sex } from "../../patients/patient.schema";

interface PatientComboboxProps {
  value: string; // patientId,"" 表示未选
  onChange: (patientId: string) => void;
  /** 测试钩子 */
  "data-testid"?: string;
}

/**
 * 客户选择 combobox — 搜索 + 现场新建。
 *
 * 三种状态:
 *   1. 未选中: 搜索输入框 + 下拉候选(按姓名/病历号过滤),末尾固定「+ 新建客户」入口
 *   2. 已选中: chip 展示 + 「更换」按钮回到搜索态
 *   3. 新建中: 内嵌简版表单(姓名/性别/年龄/电话),保存后自动选中新客户
 *
 * 设计说明:
 *   - 新建走 useCreatePatient(与 /patients/new 同一入口,病历号自动生成、RBAC 一致)
 *   - 简版表单只暴露预约场景必需字段;完整档案(利手等)仍去客户页补
 */
export function PatientCombobox({ value, onChange, "data-testid": testId }: PatientComboboxProps) {
  const { data: patients = [] } = usePatients();
  const createPatient = useCreatePatient();

  const selected = useMemo(() => patients.find((p) => p.id === value) ?? null, [patients, value]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 新建表单字段(年龄输入 → 保存时反推出生日期)
  const [newName, setNewName] = useState("");
  const [newSex, setNewSex] = useState<Sex>("male");
  const [newAge, setNewAge] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // 点击组件外 → 收起下拉(新建态不收起,避免误触丢失输入)
  useEffect(() => {
    if (!open || creating) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, creating]);

  // ESC 收起
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (creating) setCreating(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, creating]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.medicalRecordNo ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q),
    );
  }, [patients, query]);

  const handlePick = (p: PatientRecord) => {
    onChange(p.id);
    setOpen(false);
    setQuery("");
  };

  const startCreate = () => {
    setNewName(query.trim());
    setNewSex("male");
    setNewAge("");
    setNewPhone("");
    setCreateError(null);
    setCreating(true);
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!newName.trim()) { setCreateError("请填写姓名"); return; }
    const age = Number(newAge);
    if (!newAge || !Number.isInteger(age) || age < 0 || age > 150) {
      setCreateError("请填写 0-150 的整数年龄");
      return;
    }
    try {
      const created = await createPatient.mutateAsync({
        orgId: getSession().orgId,
        name: newName.trim(),
        sex: newSex,
        birthDate: birthDateFromAge(age),
        phone: newPhone.trim() || "",
        medicalRecordNo: "", // 留空自动生成
        dominantHand: "",
      });
      onChange(created.id);
      setCreating(false);
      setOpen(false);
      setQuery("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "创建客户失败");
    }
  };

  // ── 已选中:chip 展示 ──
  if (selected && !creating) {
    return (
      <div ref={rootRef} data-testid={testId}>
        <div className="patient-combobox__selected">
          <span className="patient-combobox__chip" data-testid={`${testId}-chip`}>
            {selected.name}
            <span className="patient-combobox__chip-meta">
              {selected.medicalRecordNo} · {SEX_LABELS[selected.sex]}
            </span>
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: "var(--text-xs)", padding: "2px 10px" }}
            onClick={() => { onChange(""); setOpen(true); }}
            data-testid={`${testId}-change`}
          >
            更换
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="patient-combobox" data-testid={testId}>
      {/* 搜索输入 */}
      {!creating && (
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="🔍 输入姓名 / 病历号 / 电话搜索,或直接新建"
          aria-label="搜索客户"
          aria-expanded={open}
          role="combobox"
          data-testid={`${testId}-input`}
        />
      )}

      {/* 下拉候选 */}
      {open && !creating && (
        <div className="patient-combobox__dropdown" role="listbox" data-testid={`${testId}-dropdown`}>
          {filtered.length === 0 && (
            <div className="patient-combobox__empty">没有匹配的客户</div>
          )}
          {filtered.slice(0, 20).map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === value}
              className="patient-combobox__option"
              onClick={() => handlePick(p)}
              data-testid={`${testId}-option-${p.id}`}
            >
              <span className="patient-combobox__option-name">{p.name}</span>
              <span className="patient-combobox__option-meta">
                {p.medicalRecordNo}{p.phone ? ` · ${p.phone}` : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="patient-combobox__create"
            onClick={startCreate}
            data-testid={`${testId}-create`}
          >
            ➕ 新建客户{query.trim() ? `「${query.trim()}」` : ""}
          </button>
        </div>
      )}

      {/* 现场新建简版表单 */}
      {creating && (
        <div className="patient-combobox__create-form" data-testid={`${testId}-create-form`}>
          <div className="field">
            <label htmlFor="pc-name">姓名 *</label>
            <input
              id="pc-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid={`${testId}-create-name`}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
            <div className="field">
              <label htmlFor="pc-sex">性别 *</label>
              <select
                id="pc-sex"
                value={newSex}
                onChange={(e) => setNewSex(e.target.value as Sex)}
                data-testid={`${testId}-create-sex`}
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pc-age">年龄(岁) *</label>
              <input
                id="pc-age"
                type="number"
                min={0}
                max={150}
                step={1}
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
                placeholder="如:29"
                data-testid={`${testId}-create-age`}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pc-phone">电话</label>
            <input
              id="pc-phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="可选"
              data-testid={`${testId}-create-phone`}
            />
          </div>
          {createError && (
            <p className="field__error" role="alert" data-testid={`${testId}-create-error`}>⚠ {createError}</p>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: "var(--text-xs)" }}
              onClick={() => setCreating(false)}
              data-testid={`${testId}-create-cancel`}
            >
              返回
            </button>
            <button
              type="button"
              className="btn btn--primary"
              style={{ fontSize: "var(--text-xs)" }}
              disabled={createPatient.isPending}
              onClick={handleCreate}
              data-testid={`${testId}-create-save`}
            >
              {createPatient.isPending ? "创建中…" : "创建并选中"}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
            病历号自动生成;利手等完整档案可在客户页补充。
          </p>
        </div>
      )}
    </div>
  );
}
