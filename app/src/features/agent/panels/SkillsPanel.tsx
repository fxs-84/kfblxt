/**
 * 技能管理面板 — 从 AgentChat 提取。
 * URL 安装 / 推荐技能库 / 新建·编辑·启停·删除,自包含状态。
 */
import { useState } from "react";
import {
  getSkills,
  addSkill as addSkillFn,
  updateSkill as updateSkillFn,
  deleteSkill as deleteSkillFn,
  installSkillFromUrl,
  SKILL_GALLERY,
  type SkillConfig,
} from "../tools/skill-system";
import { btnGhost, btnPrimary, inputStyle, overlayPanelStyle } from "../ui-styles";

interface Props {
  onClose: () => void;
}

interface SkillFormState {
  name: string;
  description: string;
  triggers: string;
  prompt: string;
  alwaysOn: boolean;
  priority: number;
}

const EMPTY_FORM: SkillFormState = { name: "", description: "", triggers: "", prompt: "", alwaysOn: false, priority: 10 };

export function SkillsPanel({ onClose }: Props) {
  const [skills, setSkills] = useState<SkillConfig[]>(getSkills);
  const [skillInstallUrl, setSkillInstallUrl] = useState("");
  const [skillInstalling, setSkillInstalling] = useState(false);
  const [skillInstallMsg, setSkillInstallMsg] = useState<string | null>(null);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillEdit, setSkillEdit] = useState<SkillConfig | null>(null);
  const [skillForm, setSkillForm] = useState<SkillFormState>(EMPTY_FORM);

  const refresh = () => setSkills(getSkills());

  const handleInstallFromUrl = async () => {
    const url = skillInstallUrl.trim();
    if (!url) return;
    setSkillInstalling(true);
    setSkillInstallMsg(null);
    try {
      await installSkillFromUrl(url);
      refresh();
      setSkillInstallUrl("");
      setSkillInstallMsg("✅ 安装成功!");
    } catch (e) {
      setSkillInstallMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSkillInstalling(false);
    }
  };

  const handleSaveForm = () => {
    if (!skillForm.name || !skillForm.prompt) return;
    const payload = {
      name: skillForm.name,
      description: skillForm.description,
      triggers: skillForm.triggers.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      prompt: skillForm.prompt,
      alwaysOn: skillForm.alwaysOn,
      priority: skillForm.priority,
    };
    if (skillEdit) {
      updateSkillFn(skillEdit.id, payload);
    } else {
      addSkillFn({ ...payload, enabled: true });
    }
    refresh();
    setSkillEdit(null);
    setSkillForm(EMPTY_FORM);
    setShowSkillForm(false);
  };

  return (
    <div style={overlayPanelStyle}>
      <h4 style={{ margin: "0 0 12px" }}>🧩 技能管理 (Skills)</h4>
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>
        Skill 是给 Agent 的专业指令集。用户消息匹配触发词时自动注入 system prompt。类似 Claude Code 的 skills 系统。
      </p>

      {/* 从 URL 安装 */}
      <div style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 12, background: "var(--color-surface-sunken, #f5f7fa)" }}>
        <strong style={{ fontSize: 13 }}>📥 从 URL 安装</strong>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            value={skillInstallUrl}
            onChange={(e) => { setSkillInstallUrl(e.target.value); setSkillInstallMsg(null); }}
            placeholder="Skill 文件的 URL(GitHub Raw/Gist/任意 .md)"
            style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }}
          />
          <button
            type="button"
            disabled={skillInstalling || !skillInstallUrl.trim()}
            onClick={() => void handleInstallFromUrl()}
            style={{ ...btnPrimary, fontSize: 11, whiteSpace: "nowrap" }}
          >
            {skillInstalling ? "安装中…" : "安装"}
          </button>
        </div>
        {skillInstallMsg && (
          <div style={{ marginTop: 6, fontSize: 11, color: skillInstallMsg.startsWith("✅") ? "var(--color-normal)" : "var(--color-abnormal)" }}>
            {skillInstallMsg}
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
          Skill 文件格式: YAML frontmatter (name/description/triggers/priority) + Markdown prompt 正文
        </div>
      </div>

      <button type="button" onClick={() => { setSkillEdit(null); setSkillForm(EMPTY_FORM); setShowSkillForm(true); }} style={{ ...btnPrimary, marginBottom: 12, fontSize: 12 }}>
        ➕ 新建技能
      </button>

      {/* 技能库 */}
      <h5 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-muted)" }}>📦 推荐技能库 (点击安装)</h5>
      {SKILL_GALLERY.map((item) => {
        const installed = skills.some((s) => s.name === item.name);
        return (
          <div key={item.name} style={{ padding: 8, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{item.name}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{item.description}</div>
            </div>
            <button
              type="button"
              disabled={installed}
              onClick={() => {
                if (installed) return;
                addSkillFn({
                  name: item.name,
                  description: item.description,
                  triggers: item.triggers,
                  prompt: item.prompt,
                  alwaysOn: false,
                  priority: 10,
                  enabled: true,
                });
                refresh();
              }}
              style={{
                ...btnGhost, fontSize: 10, whiteSpace: "nowrap",
                opacity: installed ? 0.4 : 1,
                cursor: installed ? "default" : "pointer",
              }}
            >
              {installed ? "已安装" : "安装"}
            </button>
          </div>
        );
      })}

      {/* 编辑表单 */}
      {showSkillForm && (
        <div style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 12, background: "var(--color-surface-sunken, #f5f7fa)" }}>
          <strong style={{ fontSize: 13 }}>{skillEdit ? "编辑技能" : "新建技能"}</strong>
          <input value={skillForm.name} onChange={(e) => setSkillForm((f) => ({ ...f, name: e.target.value }))} placeholder="技能名称" style={{ ...inputStyle, marginTop: 8 }} />
          <input value={skillForm.description} onChange={(e) => setSkillForm((f) => ({ ...f, description: e.target.value }))} placeholder="简短描述" style={{ ...inputStyle, marginTop: 6 }} />
          <input value={skillForm.triggers} onChange={(e) => setSkillForm((f) => ({ ...f, triggers: e.target.value }))} placeholder="触发词,逗号分隔 (如: 文献综述,meta分析,循证)" style={{ ...inputStyle, marginTop: 6 }} />
          <textarea value={skillForm.prompt} onChange={(e) => setSkillForm((f) => ({ ...f, prompt: e.target.value }))} placeholder="Skill 指令内容 (Markdown) — 会被注入到 system prompt 中" rows={8} style={{ ...inputStyle, marginTop: 6, fontFamily: "monospace", fontSize: 11 }} />
          <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={skillForm.alwaysOn} onChange={(e) => setSkillForm((f) => ({ ...f, alwaysOn: e.target.checked }))} />
              始终激活
            </label>
            <label style={{ fontSize: 12 }}>优先级: <input type="number" value={skillForm.priority} onChange={(e) => setSkillForm((f) => ({ ...f, priority: Number(e.target.value) }))} style={{ width: 50, padding: "2px 4px", fontSize: 12 }} min={1} max={100} /></label>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" onClick={handleSaveForm} style={{ ...btnPrimary, fontSize: 11 }}>保存</button>
            <button type="button" onClick={() => { setSkillEdit(null); setSkillForm(EMPTY_FORM); setShowSkillForm(false); }} style={{ ...btnGhost, fontSize: 11 }}>取消</button>
          </div>
        </div>
      )}

      {/* 技能列表 */}
      {skills.length === 0 && <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>暂无自定义技能。内置技能会自动加载。</p>}
      {skills.map((s) => (
        <div key={s.id} style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>{s.name}</strong>
              {s.id.startsWith("builtin") && <span style={{ fontSize: 9, color: "var(--color-text-muted)", marginLeft: 6 }}>内置</span>}
              <span style={{ fontSize: 10, marginLeft: 6, color: s.enabled ? "var(--color-normal)" : "var(--color-text-muted)" }}>
                {s.enabled ? "●" : "○"}
              </span>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{s.description}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                触发词: {s.triggers.join(", ")} {s.alwaysOn ? "| 🔄 始终激活" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
              <button type="button" onClick={() => {
                setSkillEdit(s);
                setSkillForm({ name: s.name, description: s.description, triggers: s.triggers.join(","), prompt: s.prompt, alwaysOn: s.alwaysOn, priority: s.priority });
                setShowSkillForm(true);
              }} style={{ ...btnGhost, fontSize: 10 }}>编辑</button>
              <button type="button" onClick={() => { updateSkillFn(s.id, { enabled: !s.enabled }); refresh(); }} style={{ ...btnGhost, fontSize: 10 }}>
                {s.enabled ? "禁用" : "启用"}
              </button>
              {!s.id.startsWith("builtin") && (
                <button type="button" onClick={() => { deleteSkillFn(s.id); refresh(); }} style={{ ...btnGhost, fontSize: 10, color: "var(--color-abnormal)" }}>删除</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={onClose} style={{ ...btnGhost, marginTop: 8 }}>关闭</button>
    </div>
  );
}
