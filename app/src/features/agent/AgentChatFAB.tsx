import { useState, useEffect } from "react";
import { AgentChat } from "./AgentChat";
import { isLLMConfigured, LLM_CONFIG_CHANGED_EVENT } from "../ai/llm-engine";

/**
 * 浮动入口按钮 — 放在 AppLayout 里全局生效。
 * 未配置 LLM 时按钮也可见,但点开会先看到配置提示。
 */
export function AgentChatFAB() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(isLLMConfigured());

  useEffect(() => {
    // 监听 LLM 配置变化:storage(跨标签页) + 自定义事件(同窗口)
    const refresh = () => setConfigured(isLLMConfigured());
    window.addEventListener("storage", refresh);
    window.addEventListener(LLM_CONFIG_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(LLM_CONFIG_CHANGED_EVENT, refresh);
    };
  }, []);

  if (open) return <AgentChat onClose={() => setOpen(false)} />;

  return (
    <button
      type="button"
      className="agent-fab"
      onClick={() => setOpen(true)}
      title="AI 临床助手 — 智能对话 + 病历查询"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 100,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: configured ? "var(--color-accent)" : "var(--color-text-muted)",
        color: "white",
        border: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
      }}
    >
      {configured ? "🗨️" : "🤖"}
    </button>
  );
}