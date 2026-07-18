import { useState, useEffect, useRef } from "react";
import { runAgent, type AgentMessage, type AgentRunResult, type AgentTraceEvent } from "./agent-loop";
import {
  createConversation,
  appendMessage,
  autoTitle,
  pruneOldConversations,
  conversationRepository,
  type ConversationRecord,
} from "./agent-conversations.repository";
import { useSession } from "../../components/auth/useSession";
import { isLLMConfigured } from "../ai/llm-engine";
import { LLMSettingsPanel } from "../ai/components/LLMSettingsPanel";
import { useSpeechRecognition } from "../ai/hooks/useSpeechRecognition";
import { SkillsPanel } from "./panels/SkillsPanel";
import { ConversationSidebar } from "./panels/ConversationSidebar";
import { useFileUploads, FILE_ACCEPT } from "./hooks/useFileUploads";
import { btnGhost, btnPrimary } from "./ui-styles";

interface AgentChatProps { onClose: () => void }

/**
 * 全局浮动 AI 聊天窗 — 对话本体。
 * 设置/技能/历史分别由 LLMSettingsPanel / SkillsPanel / ConversationSidebar 承担,
 * 语音与文件上传由共享 hook 承担,这里只管会话与消息流。
 */
export function AgentChat({ onClose }: AgentChatProps) {
  const session = useSession();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<AgentTraceEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [configured, setConfigured] = useState(isLLMConfigured());
  const scrollRef = useRef<HTMLDivElement>(null);

  // 语音输入(共享 hook;识别文本追加到输入框)
  const { listening, supported: voiceSupported, toggle: toggleVoice } = useSpeechRecognition({
    onResult: (transcript) => setInput((prev) => prev + (prev ? " " : "") + transcript),
  });

  // 文件上传(共享 hook;含 PHI 警告弹窗)
  const {
    files, fileTexts, uploading, fileInputRef,
    handleFiles, removeFile, clearFiles, fileWarningDialog,
  } = useFileUploads();

  useEffect(() => {
    void loadConversations();
    void pruneOldConversations();
  }, []);

  const loadConversations = async () => {
    const all = await conversationRepository.findAll();
    setConversations([...all].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)));
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
    const hasFiles = files.length > 0;
    if ((!text && !hasFiles) || busy) return;

    // 构建消息内容: 文本 + 文件内容
    let content = text;
    if (hasFiles && fileTexts.length > 0) {
      const fileBlocks = files.map((f, i) =>
        `\n\n--- 附件: ${f.name} ---\n${fileTexts[i] || `[空文件]`}\n--- 附件结束 ---`
      ).join("");
      content = text
        ? `${text}${fileBlocks}`
        : `请分析以下上传的文件:\n${fileBlocks}`;
    }

    let convId = currentId;
    if (!convId) {
      const conv = await createConversation(autoTitle(content.slice(0, 30)));
      convId = conv.id;
      setCurrentId(convId);
      setConversations([conv, ...conversations]);
    }

    const userMsg: AgentMessage = { role: "user", content };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    clearFiles();
    setBusy(true);
    setTrace([]);

    await appendMessage(convId, userMsg);

    try {
      const result: AgentRunResult = await runAgent(
        content,
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

  return (
    <div className="agent-chat" style={{
      position: "fixed", right: 0, bottom: 0, top: 0, zIndex: 200,
      width: "min(540px, 100vw)", background: "var(--color-surface)",
      boxShadow: "-4px 0 16px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* 顶栏 — 标题独立行,工具按钮在下 */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <strong>AI 临床助手 — 实时推理</strong>
          <span style={{ marginLeft: "auto", fontSize: 11, color: configured ? "var(--color-normal)" : "var(--color-abnormal)" }}>
            {configured ? "● 已连接 LLM" : "● 未配置"}
          </span>
          <button type="button" onClick={onClose} title="关闭" aria-label="关闭对话" style={btnGhost}>✕</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setShowSettings(true)} title="LLM 配置" style={btnGhost}>🔑 配置</button>
          <button type="button" onClick={() => { setShowSkills(true); setShowHistory(false); }} title="技能管理" style={btnGhost}>🧩 技能</button>
          <button type="button" onClick={() => { setShowHistory((v) => !v); setShowSkills(false); }} title="历史对话" style={btnGhost}>📚 历史</button>
          <button type="button" onClick={startNew} title="新对话" style={btnGhost}>➕ 新对话</button>
        </div>
      </header>

      {/* 历史侧栏 */}
      {showHistory && (
        <ConversationSidebar conversations={conversations} currentId={currentId} onSelect={loadConversation} />
      )}

      {/* 文件上传 PHI 安全确认 */}
      {fileWarningDialog}

      {/* LLM 配置面板 */}
      {showSettings && (
        <LLMSettingsPanel onClose={() => setShowSettings(false)} onConfiguredChange={setConfigured} />
      )}

      {/* 技能管理面板 */}
      {showSkills && <SkillsPanel onClose={() => setShowSkills(false)} />}

      {/* 消息流 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>开始与临床助手对话</p>
            <p style={{ fontSize: 12, lineHeight: 1.6 }}>
              你可以问:<br />
              • "上周有哪些腰椎间盘突出客户复诊?"<br />
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
                {t.type === "text" && t.text && <>💭 {t.text.slice(0, 100)}{(t.text.length ?? 0) > 100 ? "…" : ""}</>}
                {t.type === "tool_call" && <>🔧 调用 <code>{t.name}</code>({(t.input as Record<string, unknown>) ? JSON.stringify(t.input).slice(0, 60) : ""}…)</>}
                {t.type === "tool_result" && <>✓ <code>{t.name}</code> → {(t.output ?? "").slice(0, 80)}…</>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div style={{ padding: 12, borderTop: "1px solid var(--color-border)" }}>
        {/* 已选文件预览 */}
        {files.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {files.map((f, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", fontSize: 11, borderRadius: 4,
                background: "var(--color-accent-weak, #e6f0fa)",
                border: "1px solid var(--color-border)",
              }}>
                📎 {f.name.length > 20 ? f.name.slice(0, 20) + "…" : f.name}
                <button type="button" onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--color-abnormal)" }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder={listening ? "🎤 正在聆听…" : "问点什么…(Shift+Enter 换行)"}
          disabled={busy}
          rows={2}
          style={{ width: "100%", padding: 8, fontSize: 14, border: "1px solid var(--color-border)", borderRadius: 6, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {/* 语音按钮 */}
            {voiceSupported && (
              <button type="button" onClick={toggleVoice} disabled={busy} title={listening ? "停止录音" : "语音输入"} style={{
                ...btnGhost, fontSize: 18, padding: "4px 8px",
                background: listening ? "var(--color-abnormal)" : "transparent",
                color: listening ? "white" : undefined,
                opacity: busy ? 0.5 : 1,
              }}>
                {listening ? "⏹" : "🎤"}
              </button>
            )}
            {/* 文件上传 */}
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} title="上传文件" style={{
              ...btnGhost, fontSize: 18, padding: "4px 8px", opacity: busy ? 0.5 : 1,
            }}>
              {uploading ? "⏳" : "📎"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              onChange={(e) => void handleFiles(e.target.files)}
              style={{ display: "none" }}
            />
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {busy ? "🤔 Agent 推理中…" : listening ? "🎤 说话中,再点⏹结束" : "Enter 发送 · Shift+Enter 换行"}
            </span>
          </div>
          <button type="button" onClick={() => void handleSend()} disabled={busy || (!input.trim() && files.length === 0)} style={{
            ...btnPrimary, opacity: (busy || (!input.trim() && files.length === 0)) ? 0.5 : 1,
          }}>发送</button>
        </div>
      </div>
    </div>
  );
}
