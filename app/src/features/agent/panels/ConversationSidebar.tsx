/**
 * 对话历史侧栏 — 从 AgentChat 提取。
 */
import type { ConversationRecord } from "../agent-conversations.repository";
import { overlayPanelStyle } from "../ui-styles";

interface Props {
  conversations: ConversationRecord[];
  currentId: string | null;
  /** 选中某条对话(侧栏关闭由调用方处理) */
  onSelect: (c: ConversationRecord) => void;
}

export function ConversationSidebar({ conversations, currentId, onSelect }: Props) {
  return (
    <div style={{ ...overlayPanelStyle, padding: 12 }}>
      <h4 style={{ margin: "0 0 12px" }}>对话历史</h4>
      {conversations.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>暂无历史对话</p>}
      {conversations.map((c) => (
        <button type="button" key={c.id} onClick={() => onSelect(c)} style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "10px 12px", marginBottom: 4, border: "1px solid var(--color-border)",
          borderRadius: 6, background: currentId === c.id ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
          cursor: "pointer",
        }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {c.updatedAt?.toISOString().slice(0, 16).replace("T", " ") ?? ""} · {c.messages.length} 条消息
          </div>
        </button>
      ))}
    </div>
  );
}
