import { useState, useEffect, useRef } from "react";
import { runAgent, type AgentMessage, type AgentRunResult } from "./agent-loop";
import {
  createConversation,
  appendMessage,
  autoTitle,
  pruneOldConversations,
  conversationRepository,
  type ConversationRecord,
} from "./agent-conversations.repository";
import { useSession } from "../../components/auth/useSession";
import { isLLMConfigured, getLLMConfig, saveLLMConfig, clearLLMConfig } from "../ai/llm-engine";

interface AgentChatProps { onClose: () => void }

export function AgentChat({ onClose }: AgentChatProps) {
  const session = useSession();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<Array<{ type: string; text?: string; name?: string; input?: unknown; output?: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [llmForm, setLlmForm] = useState({ apiUrl: "", apiKey: "", model: "" });
  const [llmSaveMsg, setLlmSaveMsg] = useState<string | null>(null);
  const [keyAlreadySet, setKeyAlreadySet] = useState(false);
  const [configured, setConfigured] = useState(isLLMConfigured());
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初始化
  useEffect(() => {
    void loadConversations();
    void pruneOldConversations();
  }, []);

  const loadConversations = async () => {
    const all = await conversationRepository.findAll();
    setConversations(all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
  };

  // 自动滚动
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, trace]);

  const startNew = async () => {
    const conv = await createConversation("新对话");
    setConversations([conv, ...conversations]);
    setCurrentId(conv.id);
    setMessages([]);
    setTrace([]);
  };

  const loadConversation = (c: ConversationRecord) => {
    setCurrentId(c.id);
    setMessages(c.messages as AgentMessage[]);
    setTrace([]);
    setShowHistory(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;

    let convId = currentId;
    if (!convId) {
      const conv = await createConversation(autoTitle(text));
      convId = conv.id;
      setCurrentId(convId);
      setConversations([conv, ...conversations]);
    }

    const userMsg: AgentMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setBusy(true);
    setTrace([]);

    await appendMessage(convId, userMsg);

    try {
      const result: AgentRunResult = await runAgent(
        text,
        { orgId: session.orgId, userId: session.userId },
        messages,
        (event) => setTrace((t) => [...t, event]),
      );

      const assistantMsg: AgentMessage = { role: "assistant", content: result.answer };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      await appendMessage(convId, assistantMsg);
      void loadConversations();
    } catch (e) {
      const errMsg: AgentMessage = { role: "assistant", content: `❌ 出错了: ${e instanceof Error ? e.message : String(e)}` };
      setMessages([...newMessages, errMsg]);
      await appendMessage(convId, errMsg);
    } finally {
      setBusy(false);
    }
  };

  const openSettings = () => {
    const c = getLLMConfig();
    setLlmForm({
      apiUrl: c?.apiUrl ?? "https://api.anthropic.com/v1/messages",
      apiKey: "",
      model: c?.model ?? "claude-haiku-4-5",
    });
    setKeyAlreadySet(Boolean(c?.apiKey));
    setLlmSaveMsg(null);
    setShowSettings(true);
  };

  return (
    <div className="agent-chat" style={{
      position: "fixed", right: 0, bottom: 0, top: 0, zIndex: 200,
      width: "min(540px, 100vw)", background: "var(--color-surface)",
      boxShadow: "-4px 0 16px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column",
    }}>
      {/* 顶栏 */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong>AI 临床助手</strong>
        <span style={{ marginLeft: "auto", fontSize: 11, color: configured ? "var(--color-normal)" : "var(--color-abnormal)" }}>
          {configured ? "● 已连接 LLM" : "● 未配置"}
        </span>
        <button type="button" onClick={openSettings} title="LLM 配置" style={btnGhost}>🔑</button>
        <button type="button" onClick={() => setShowHistory((v) => !v)} title="历史对话" style={btnGhost}>📚</button>
        <button type="button" onClick={startNew} title="新对话" style={btnGhost}>➕</button>
        <button type="button" onClick={onClose} title="关闭" style={btnGhost}>✕</button>
      </header>

      {/* 历史侧栏 */}
      {showHistory && (
        <div style={{ position: "absolute", top: 49, left: 0, right: 0, bottom: 0, background: "var(--color-surface)", zIndex: 5, padding: 12, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 12px" }}>对话历史</h4>
          {conversations.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>暂无历史对话</p>}
          {conversations.map(c => (
            <button key={c.id} type="button" onClick={() => loadConversation(c)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 12px", marginBottom: 4, border: "1px solid var(--color-border)",
              borderRadius: 6, background: currentId === c.id ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
              cursor: "pointer",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.updatedAt.toISOString().slice(0, 16).replace("T", " ")} · {c.messages.length} 条消息</div>
            </button>
          ))}
        </div>
      )}

      {/* 配置面板 */}
      {showSettings && (
        <div style={{ position: "absolute", top: 49, left: 0, right: 0, bottom: 0, background: "var(--color-surface)", zIndex: 5, padding: 16, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 12px" }}>🔑 LLM API 配置</h4>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
            API key 仅保存在浏览器 localStorage,不会上传或进入 JS bundle。
          </p>
          {/* 预设按钮 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Anthropic", url: "https://api.anthropic.com/v1/messages", model: "claude-haiku-4-5-20251001" },
              { label: "DeepSeek", url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
              { label: "OpenAI", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
              { label: "DeepSeek(R1)", url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-reasoner" },
            ].map(p => (
              <button key={p.label} type="button" onClick={() => setLlmForm({ apiUrl: p.url, apiKey: "", model: p.model })} style={{
                padding: "4px 10px", fontSize: 11, border: "1px solid var(--color-border)", borderRadius: 4,
                background: llmForm.apiUrl === p.url ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
                cursor: "pointer",
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>API URL</label>
            <input value={llmForm.apiUrl} onChange={e => setLlmForm(f => ({ ...f, apiUrl: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>
              API Key
              {keyAlreadySet && <span style={{ color: "var(--color-normal)", fontSize: 11, marginLeft: 8 }}>🔒 已保存(安全不显示)</span>}
            </label>
            <input
              type="password"
              value={llmForm.apiKey}
              onChange={e => { setLlmForm(f => ({ ...f, apiKey: e.target.value })); setLlmSaveMsg(null); }}
              placeholder={keyAlreadySet ? "如需更换请输入新 key" : "sk-ant-..."}
              autoComplete="off"
              style={{ ...inputStyle, background: keyAlreadySet && !llmForm.apiKey ? "var(--color-normal-weak, #ecfdf5)" : undefined }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>模型</label>
            <input value={llmForm.model} onChange={e => setLlmForm(f => ({ ...f, model: e.target.value }))} placeholder="claude-haiku-4-5" style={inputStyle} />
          </div>
          {llmSaveMsg && (
            <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 4, fontSize: 12,
              background: llmSaveMsg.includes("成功") ? "var(--color-normal-weak, #ecfdf5)" : "var(--color-abnormal-bg, #fef2f2)",
              color: llmSaveMsg.includes("成功") ? "var(--color-normal)" : "var(--color-abnormal)" }}>
              {llmSaveMsg}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => {
              const urlOk = llmForm.apiUrl.trim();
              const keyOk = llmForm.apiKey.trim();
              if (!urlOk || !keyOk) {
                if (!keyOk && keyAlreadySet) {
                  // key 已在 localStorage,未修改,允许保存(用旧 key)
                  const existing = getLLMConfig();
                  const key = existing?.apiKey ?? "";
                  if (!key) {
                    setLlmSaveMsg("❌ 请输入 API Key");
                    return;
                  }
                  saveLLMConfig({ apiUrl: urlOk, apiKey: key, model: llmForm.model.trim() || "claude-haiku-4-5" });
                } else {
                  setLlmSaveMsg("❌ API URL 和 Key 必填");
                  return;
                }
              } else {
                saveLLMConfig({ apiUrl: urlOk, apiKey: keyOk, model: llmForm.model.trim() || "claude-haiku-4-5" });
              }
              setConfigured(true);
              setLlmSaveMsg("✅ 保存成功");
              setTimeout(() => setShowSettings(false), 600);
            }} style={btnPrimary}>保存</button>
            {configured && <button type="button" onClick={() => { clearLLMConfig(); setConfigured(false); setKeyAlreadySet(false); setLlmSaveMsg("🗑️ 已清除"); }} style={{ ...btnGhost, color: "var(--color-abnormal)" }}>清除</button>}
            <button type="button" onClick={() => setShowSettings(false)} style={btnGhost}>取消</button>
          </div>
        </div>
      )}

      {/* 消息流 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>开始与临床助手对话</p>
            <p style={{ fontSize: 12, lineHeight: 1.6 }}>
              你可以问:<br />
              • "上周有哪些腰椎间盘突出患者复诊?"<br />
              • "总结 patient-uuid 的完整病史"<br />
              • "我最近诊断 S1 神经根的病例干预效果如何?"
            </p>
            {!configured && (
              <div style={{ marginTop: 16, padding: 12, background: "var(--color-caution-weak, #fef8ed)", borderRadius: 8, fontSize: 12 }}>
                ⚠️ 未配置 LLM key。先点 🔑 填入 API 配置,否则 Agent 不会调用工具。
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: m.role === "user" ? "var(--color-accent)" : "var(--color-surface-sunken, #f5f7fa)",
              color: m.role === "user" ? "white" : "var(--color-text)",
              whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.6,
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {busy && trace.length > 0 && (
          <div style={{ marginTop: 12, padding: 8, background: "var(--color-surface-sunken, #f5f7fa)", borderRadius: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
            {trace.slice(-6).map((t, i) => (
              <div key={i}>
                {t.type === "tool_call" && <>🔧 调用 <code>{t.name}</code>({(t.input as Record<string, unknown>) ? JSON.stringify(t.input).slice(0, 60) : ""}…)</>}
                {t.type === "tool_result" && <>✓ <code>{t.name}</code> → {(t.output ?? "").slice(0, 80)}…</>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div style={{ padding: 12, borderTop: "1px solid var(--color-border)" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="问点什么…(Shift+Enter 换行)"
          disabled={busy}
          rows={2}
          style={{ width: "100%", padding: 8, fontSize: 14, border: "1px solid var(--color-border)", borderRadius: 6, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {busy ? "🤔 Agent 推理中…" : "Enter 发送 · Shift+Enter 换行"}
          </span>
          <button type="button" onClick={() => void handleSend()} disabled={busy || !input.trim()} style={{
            ...btnPrimary, opacity: (busy || !input.trim()) ? 0.5 : 1,
          }}>发送</button>
        </div>
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: "4px 8px", background: "transparent", border: "1px solid var(--color-border)",
  borderRadius: 4, cursor: "pointer", fontSize: 14,
};
const btnPrimary: React.CSSProperties = {
  padding: "6px 14px", background: "var(--color-accent)", color: "white",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)",
  borderRadius: 4, fontFamily: "inherit",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--color-text-muted)",
};