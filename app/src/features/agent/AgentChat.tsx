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
import { isLLMConfigured, getLLMConfig, saveLLMConfig, clearLLMConfig, pingLLM } from "../ai/llm-engine";
import { LLMCallError, type PingResult } from "../ai/llm-client";
import {
  getMCPServers,
  addMCPServer,
  updateMCPServer,
  deleteMCPServer,
  testMCPConnection,
  type MCPServerConfig,
} from "./tools/mcp-manager";
import {
  getSkills,
  addSkill as addSkillFn,
  updateSkill as updateSkillFn,
  deleteSkill as deleteSkillFn,
  installSkillFromUrl,
  isSkillDuplicated,
  SKILL_GALLERY,
  type SkillConfig,
} from "./tools/skill-system";
import { getExtConfig, saveExtConfig, type ExtConfig } from "./tools/ext-config";

interface AgentChatProps { onClose: () => void }

export function AgentChat({ onClose }: AgentChatProps) {
  const session = useSession();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // 语音
  const [listening, setListening] = useState(false);
  const [voiceSupported] = useState(() =>
    typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // 文件上传
  const [files, setFiles] = useState<File[]>([]);
  const [fileTexts, setFileTexts] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [trace, setTrace] = useState<Array<{ type: string; text?: string; name?: string; input?: unknown; output?: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMCP, setShowMCP] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [llmForm, setLlmForm] = useState({ apiUrl: "", apiKey: "", model: "", corsProxy: "" });
  const [llmSaveMsg, setLlmSaveMsg] = useState<string | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<PingResult | null>(null);
  const [keyAlreadySet, setKeyAlreadySet] = useState(false);
  const [configured, setConfigured] = useState(isLLMConfigured());
  // 搜索配置
  const [extCfg, setExtCfg] = useState<ExtConfig>(getExtConfig);
  // MCP
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>(getMCPServers);
  const [mcpAddForm, setMcpAddForm] = useState({ name: "", type: "http" as "http" | "stdio", url: "", command: "", args: "" });
  const [mcpTesting, setMcpTesting] = useState<string | null>(null);
  const [mcpTestResult, setMcpTestResult] = useState<{ id: string; ok: boolean; serverName?: string; toolCount?: number; error?: string } | null>(null);
  // Skills
  const [skills, setSkills] = useState<SkillConfig[]>(getSkills);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillEdit, setSkillEdit] = useState<SkillConfig | null>(null);
  const [skillForm, setSkillForm] = useState({ name: "", description: "", triggers: "", prompt: "", alwaysOn: false, priority: 10 });
  // 外部安装
  const [skillInstallUrl, setSkillInstallUrl] = useState("");
  const [skillInstallMsg, setSkillInstallMsg] = useState<string | null>(null);
  const [skillInstalling, setSkillInstalling] = useState(false);
  // 文件上传安全警告
  const [showFileWarning, setShowFileWarning] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初始化
  useEffect(() => {
    void loadConversations();
    void pruneOldConversations();
  }, []);

  const loadConversations = async () => {
    const all = await conversationRepository.findAll();
    setConversations(all.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)));
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

  // 语音输入
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    rec.onerror = (e: any) => {
      console.warn("[voice] Speech error:", e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  // 文件读取 — 非文本文件先弹警告(数据会发给第三方 LLM)
  const handleFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const fileArr = Array.from(selected);
    const hasNonText = fileArr.some(f => {
      const n = f.name.toLowerCase();
      return !(n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".csv") || n.endsWith(".json"));
    });
    if (hasNonText) {
      setPendingFiles(selected);
      setShowFileWarning(true);
      return;
    }
    await processFiles(selected);
  };

  const processFiles = async (selected: FileList) => {
    setUploading(true);
    const fileArr = Array.from(selected);
    const texts: string[] = [];
    for (const file of fileArr) {
      try {
        const text = await readFileContent(file);
        texts.push(text);
      } catch {
        texts.push(`[无法读取: ${file.name}]`);
      }
    }
    setFiles(prev => [...prev, ...fileArr]);
    setFileTexts(prev => [...prev, ...texts]);
    setUploading(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFileTexts(prev => prev.filter((_, i) => i !== index));
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
    setFiles([]);
    setFileTexts([]);
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

  const openSettings = async () => {
    const c = await getLLMConfig();
    setLlmForm({
      apiUrl: c?.apiUrl ?? "https://api.anthropic.com/v1/messages",
      apiKey: "",
      model: c?.model ?? "claude-haiku-4-5",
      corsProxy: c?.corsProxy ?? "",
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
      overflow: "hidden",
    }}>
      {/* 顶栏 */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong>AI 临床助手</strong>
        <span style={{ marginLeft: "auto", fontSize: 11, color: configured ? "var(--color-normal)" : "var(--color-abnormal)" }}>
          {configured ? "● 已连接 LLM" : "● 未配置"}
        </span>
        <button type="button" onClick={openSettings} title="LLM 配置" style={btnGhost}>🔑</button>
        <button type="button" onClick={() => { setShowMCP(true); setShowHistory(false); setShowSkills(false); }} title="MCP 插件" style={btnGhost}>🔌</button>
        <button type="button" onClick={() => { setShowSkills(true); setShowMCP(false); setShowHistory(false); }} title="技能管理" style={btnGhost}>🧩</button>
        <button type="button" onClick={() => { setShowHistory((v) => !v); setShowMCP(false); setShowSkills(false); }} title="历史对话" style={btnGhost}>📚</button>
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
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{c.updatedAt?.toISOString().slice(0, 16).replace("T", " ") ?? ""} · {c.messages.length} 条消息</div>
            </button>
          ))}
        </div>
      )}

      {/* 文件上传安全确认 */}
      {showFileWarning && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 12, padding: 24, maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h4 style={{ margin: "0 0 8px" }}>⚠️ 数据安全提示</h4>
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              上传的文件(PDF/图片/音频/文档)将以 <strong>base64 编码</strong>发送给你配置的 LLM 服务商
              (如 DeepSeek / Anthropic / OpenAI 等)。
            </p>
            <ul style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0", paddingLeft: 18 }}>
              <li>文件内容会离开你的浏览器</li>
              <li>请勿上传含患者隐私信息(PHI)的文件</li>
              <li>纯文本文件(.txt/.md/.csv/.json)同样会发送</li>
            </ul>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => {
                setShowFileWarning(false);
                if (pendingFiles) { void processFiles(pendingFiles); setPendingFiles(null); }
              }} style={{ ...btnPrimary, flex: 1 }}>我已知晓,继续上传</button>
              <button type="button" onClick={() => { setShowFileWarning(false); setPendingFiles(null); }} style={{ ...btnGhost, flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 配置面板 */}
      {showSettings && (
        <div style={{ position: "absolute", top: 49, left: 0, right: 0, bottom: 0, background: "var(--color-surface)", zIndex: 5, padding: 16, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 12px" }}>🔑 LLM API 配置</h4>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
            API key 仅保存在浏览器 localStorage,不会上传或进入 JS bundle。
          </p>
          {/* 部署环境提示 — 如果是 GitHub Pages 等静态部署,提醒需要 CORS 代理 */}
          {typeof location !== "undefined" &&
            !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) && (
            <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 4, fontSize: 11,
              background: "var(--color-caution-weak, #fef8ed)",
              color: "var(--color-caution)", lineHeight: 1.6 }}>
              🌐 检测到非本地环境(部署站点) — 浏览器 CORS 会拦截直连 LLM API。
              <br />
              解决办法:1) 点下方"🌐 CORS 代理"预设按钮 / 2) 自己部署一个反代 / 3) 切到本地 <code>localhost</code> 开发。
            </div>
          )}
          {/* 预设按钮 — 国内常用优先(国内网络可达) */}
          <div style={{ marginBottom: 8, fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>⚡ 快速预设</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "🟢 DeepSeek", url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", region: "国内" },
              { label: "🟢 DeepSeek-R1", url: "https://api.deepseek.com/chat/completions", model: "deepseek-reasoner", region: "国内" },
              { label: "🟢 智谱 GLM-4", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-plus", region: "国内" },
              { label: "🟢 通义千问", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-plus", region: "国内" },
              { label: "🟢 月之暗面", url: "https://api.moonshot.cn/v1/chat/completions", model: "moonshot-v1-32k", region: "国内" },
              { label: "🟢 硅基流动", url: "https://api.siliconflow.cn/v1/chat/completions", model: "Qwen/Qwen2.5-72B-Instruct", region: "国内" },
              { label: "🟠 Anthropic", url: "https://api.anthropic.com/v1/messages", model: "claude-haiku-4-5-20251001", region: "海外" },
              { label: "🟠 OpenAI", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", region: "海外" },
              { label: "🟠 Groq", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile", region: "海外" },
              { label: "🟠 OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", model: "anthropic/claude-3.5-sonnet", region: "海外" },
            ].map(p => (
              <button key={p.label} type="button" onClick={() => setLlmForm({ apiUrl: p.url, apiKey: "", model: p.model, corsProxy: llmForm.corsProxy })} title={`${p.region} · ${p.model}`} style={{
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
              placeholder={keyAlreadySet ? "如需更换请输入新 key" : "sk-..."}
              autoComplete="off"
              style={{ ...inputStyle, background: keyAlreadySet && !llmForm.apiKey ? "var(--color-normal-weak, #ecfdf5)" : undefined }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>模型</label>
            <input value={llmForm.model} onChange={e => setLlmForm(f => ({ ...f, model: e.target.value }))} placeholder="claude-haiku-4-5 / deepseek-chat / ..." style={inputStyle} />
          </div>
          {/* CORS 代理 — 国内访问海外 API 时必填,GitHub Pages 部署时也必填 */}
          <div style={{ marginBottom: 8, fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>
            🌐 CORS 代理
            <span style={{ fontSize: 10, marginLeft: 6, color: "var(--color-text-muted)" }}>
              国内访问海外 API / GitHub Pages 部署时必填
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {[
              { label: "🚫 留空(直连)", url: "" },
              { label: "🌐 corsproxy.io", url: "https://corsproxy.io/?" },
              { label: "🌐 allorigins", url: "https://api.allorigins.win/raw?url=" },
              { label: "🌐 cors.sh", url: "https://proxy.cors.sh/" },
            ].map(p => (
              <button key={p.label} type="button" onClick={() => setLlmForm(f => ({ ...f, corsProxy: p.url }))} title={p.url || "直连"} style={{
                padding: "4px 10px", fontSize: 11, border: "1px solid var(--color-border)", borderRadius: 4,
                background: llmForm.corsProxy === p.url ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
                cursor: "pointer",
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              value={llmForm.corsProxy}
              onChange={e => setLlmForm(f => ({ ...f, corsProxy: e.target.value }))}
              placeholder="或自定义: https://corsproxy.io/?  /  https://api.allorigins.win/raw?url="
              style={inputStyle}
            />
          </div>

          {/* 高级设置 — 默认收起,搜索后端配置藏在这里,普通用户不需要碰 */}
          <details style={{ marginBottom: 12, padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
            <summary style={{ fontSize: 12, color: "var(--color-text-muted)", cursor: "pointer", fontWeight: 600 }}>
              🔧 高级设置(可选,默认不用配)
            </summary>
            <div style={{ marginTop: 8, padding: 8, background: "var(--color-surface-sunken, #f5f7fa)", borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.6 }}>
                💡 搜索后端说明:LLM 本身已能回答大部分临床问题(知识截止 2025 年)。
                <br />• <code>web_fetch</code> 抓任意 URL(无需配置)
                <br />• <code>search_pubmed</code> 查 PubMed 文献(无需配置,免费)
                <br />• <code>web_search</code> 通用搜索(需下拉选 Bing + 填 key,或自配 SearXNG)
                <br />• 内部病历查询(无需配置,默认就有)
              </div>
              <label style={{ ...labelStyle, fontSize: 12 }}>🔍 搜索后端</label>
              <select
                value={extCfg.searchBackend}
                onChange={e => { const v = e.target.value as ExtConfig["searchBackend"]; setExtCfg(c => ({ ...c, searchBackend: v })); }}
                style={{ width: "100%", padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)", marginTop: 4 }}
              >
                <option value="none">禁用(推荐 — LLM 自带知识已够用)</option>
                <option value="bing">Bing (需 API Key)</option>
                <option value="custom">自定义 SearXNG</option>
              </select>
              {extCfg.searchBackend === "bing" && (
                <div style={{ marginTop: 4 }}>
                  <input
                    type="password"
                    value={extCfg.bingApiKey}
                    onChange={e => setExtCfg(c => ({ ...c, bingApiKey: e.target.value }))}
                    placeholder="Bing API Key (免费1000次/月)"
                    autoComplete="off"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                    注册: portal.azure.com → 创建 Bing Search 资源 → Keys and Endpoint
                  </div>
                </div>
              )}
              {extCfg.searchBackend === "custom" && (
                <div style={{ marginTop: 4 }}>
                  <input
                    value={extCfg.customSearchUrl}
                    onChange={e => setExtCfg(c => ({ ...c, customSearchUrl: e.target.value }))}
                    placeholder="搜索 URL,{q}=查询词 (如 SearXNG)"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                    要求返回 JSON,格式: {"{ results: [{ title, snippet, url }] }"}
                  </div>
                </div>
              )}
            </div>
          </details>
          {llmSaveMsg && (
            <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 4, fontSize: 12,
              background: llmSaveMsg.includes("成功") ? "var(--color-normal-weak, #ecfdf5)" : "var(--color-abnormal-bg, #fef2f2)",
              color: llmSaveMsg.includes("成功") ? "var(--color-normal)" : "var(--color-abnormal)" }}>
              {llmSaveMsg}
            </div>
          )}
          {/* 测试连接结果 */}
          {llmTestResult && (
            <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 4, fontSize: 12,
              background: llmTestResult.ok ? "var(--color-normal-weak, #ecfdf5)" : "var(--color-abnormal-bg, #fef2f2)",
              color: llmTestResult.ok ? "var(--color-normal)" : "var(--color-abnormal)",
              whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {llmTestResult.ok ? (
                <>
                  ✅ 连接成功 — {llmTestResult.latencyMs}ms
                  {"\n"}API 类型: {llmTestResult.apiType} | 模型: {llmTestResult.model}
                  {llmTestResult.viaProxy ? "\n🔀 走代理: " + llmTestResult.resolvedUrl : ""}
                </>
              ) : (
                <>
                  ❌ {llmTestResult.error?.message ?? "连接失败"}
                  {llmTestResult.error?.hint ? "\n💡 " + llmTestResult.error.hint : ""}
                </>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={async () => {
              const urlOk = llmForm.apiUrl.trim();
              const keyOk = llmForm.apiKey.trim();
              const proxyOk = llmForm.corsProxy.trim() || undefined;
              const existingCfg = keyAlreadySet ? await getLLMConfig() : null;
              const finalKey = keyOk || (existingCfg?.apiKey ?? "");
              if (!urlOk) { setLlmSaveMsg("❌ API URL 必填"); return; }
              if (!finalKey) { setLlmSaveMsg("❌ 请输入 API Key"); return; }
              try {
                await saveLLMConfig({ apiUrl: urlOk, apiKey: finalKey, model: llmForm.model.trim() || "claude-haiku-4-5", corsProxy: proxyOk });
                saveExtConfig(extCfg);
                setConfigured(true);
                setLlmSaveMsg("✅ 保存成功");
                setTimeout(() => setShowSettings(false), 600);
              } catch (e) {
                setLlmSaveMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
              }
            }} style={btnPrimary}>保存</button>
            <button type="button" disabled={llmTesting} onClick={async () => {
              const urlOk = llmForm.apiUrl.trim();
              const keyOk = llmForm.apiKey.trim();
              const proxyOk = llmForm.corsProxy.trim() || undefined;
              const existingCfg = keyAlreadySet ? await getLLMConfig() : null;
              const finalKey = keyOk || (existingCfg?.apiKey ?? "");
              if (!urlOk) { setLlmTestResult({ ok: false, latencyMs: 0, error: new LLMCallError("config", "API URL 必填") }); return; }
              if (!finalKey) { setLlmTestResult({ ok: false, latencyMs: 0, error: new LLMCallError("config", "请先填入 API Key") }); return; }
              setLlmTesting(true);
              setLlmTestResult(null);
              const r = await pingLLM({ apiUrl: urlOk, apiKey: finalKey, model: llmForm.model.trim() || "claude-haiku-4-5", corsProxy: proxyOk });
              setLlmTestResult(r);
              setLlmTesting(false);
            }} style={{ ...btnGhost, opacity: llmTesting ? 0.6 : 1 }}>{llmTesting ? "🔗 测试中…" : "🔗 测试连接"}</button>
            {configured && <button type="button" onClick={() => { clearLLMConfig(); setConfigured(false); setKeyAlreadySet(false); setLlmSaveMsg("🗑️ 已清除"); }} style={{ ...btnGhost, color: "var(--color-abnormal)" }}>清除</button>}
            <button type="button" onClick={() => setShowSettings(false)} style={btnGhost}>取消</button>
          </div>
        </div>
      )}

      {/* MCP 管理面板 */}
      {showMCP && (
        <div style={{ position: "absolute", top: 49, left: 0, right: 0, bottom: 0, background: "var(--color-surface)", zIndex: 5, padding: 16, overflowY: "auto" }}>
          <h4 style={{ margin: "0 0 12px" }}>🔌 MCP 服务器管理</h4>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>
            MCP (Model Context Protocol) 让 Agent 连接外部工具。添加 HTTP 服务器或本地命令,Agent 自动发现并调用其工具。
          </p>

          {/* 添加服务器表单 */}
          <div style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 12, background: "var(--color-surface-sunken, #f5f7fa)" }}>
            <strong style={{ fontSize: 13 }}>添加服务器</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <select value={mcpAddForm.type} onChange={e => setMcpAddForm(f => ({ ...f, type: e.target.value as "http" | "stdio" }))} style={{ padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }}>
                <option value="http">HTTP</option>
                <option value="stdio">stdio (本地)</option>
              </select>
              <input value={mcpAddForm.name} onChange={e => setMcpAddForm(f => ({ ...f, name: e.target.value }))} placeholder="名称" style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }} />
            </div>
            {mcpAddForm.type === "http" ? (
              <input value={mcpAddForm.url} onChange={e => setMcpAddForm(f => ({ ...f, url: e.target.value }))} placeholder="MCP 端点 URL,如 https://mcp.example.com/mcp" style={{ width: "100%", marginTop: 6, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }} />
            ) : (
              <>
                <input value={mcpAddForm.command} onChange={e => setMcpAddForm(f => ({ ...f, command: e.target.value }))} placeholder="命令,如 npx -y @modelcontextprotocol/server-filesystem" style={{ width: "100%", marginTop: 6, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }} />
                <input value={mcpAddForm.args} onChange={e => setMcpAddForm(f => ({ ...f, args: e.target.value }))} placeholder="参数(空格分隔)" style={{ width: "100%", marginTop: 6, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }} />
              </>
            )}
            <button type="button" onClick={() => {
              if (!mcpAddForm.name) return;
              const srv = addMCPServer({
                name: mcpAddForm.name,
                type: mcpAddForm.type,
                url: mcpAddForm.type === "http" ? mcpAddForm.url : undefined,
                command: mcpAddForm.type === "stdio" ? mcpAddForm.command : undefined,
                args: mcpAddForm.type === "stdio" ? mcpAddForm.args : undefined,
                enabled: true,
              });
              setMcpServers([...getMCPServers()]);
              setMcpAddForm({ name: "", type: "http", url: "", command: "", args: "" });
            }} style={{ ...btnPrimary, marginTop: 8, fontSize: 11 }}>添加</button>
          </div>

          {/* 服务器列表 */}
          {mcpServers.length === 0 && <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>暂无 MCP 服务器。添加 HTTP 或本地 stdio 服务器来扩展 Agent 能力。</p>}
          {mcpServers.map(srv => {
            const testResult = mcpTestResult?.id === srv.id ? mcpTestResult : null;
            return (
              <div key={srv.id} style={{ padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{srv.name}</strong>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)", marginLeft: 8 }}>{srv.type === "http" ? "HTTP" : "stdio"}</span>
                    <span style={{ fontSize: 10, marginLeft: 6, color: srv.enabled ? "var(--color-normal)" : "var(--color-text-muted)" }}>
                      {srv.enabled ? "●" : "○"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={async () => {
                      setMcpTesting(srv.id);
                      const r = await testMCPConnection(srv);
                      setMcpTestResult({ id: srv.id, ...r });
                      setMcpTesting(null);
                    }} style={{ ...btnGhost, fontSize: 10 }}>
                      {mcpTesting === srv.id ? "测试中…" : "测试"}
                    </button>
                    <button type="button" onClick={() => {
                      updateMCPServer(srv.id, { enabled: !srv.enabled });
                      setMcpServers([...getMCPServers()]);
                    }} style={{ ...btnGhost, fontSize: 10 }}>{srv.enabled ? "禁用" : "启用"}</button>
                    <button type="button" onClick={() => {
                      deleteMCPServer(srv.id);
                      setMcpServers([...getMCPServers()]);
                    }} style={{ ...btnGhost, fontSize: 10, color: "var(--color-abnormal)" }}>删除</button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {srv.url || srv.command}
                </div>
                {testResult && (
                  <div style={{ fontSize: 11, marginTop: 4, color: testResult.ok ? "var(--color-normal)" : "var(--color-abnormal)" }}>
                    {testResult.ok ? `✅ ${testResult.serverName} — ${testResult.toolCount} 个工具` : `❌ ${testResult.error}`}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setShowMCP(false)} style={{ ...btnGhost, marginTop: 8 }}>关闭</button>
        </div>
      )}

      {/* 技能管理面板 */}
      {showSkills && (
        <div style={{ position: "absolute", top: 49, left: 0, right: 0, bottom: 0, background: "var(--color-surface)", zIndex: 5, padding: 16, overflowY: "auto" }}>
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
                onChange={e => { setSkillInstallUrl(e.target.value); setSkillInstallMsg(null); }}
                placeholder="Skill 文件的 URL(GitHub Raw/Gist/任意 .md)"
                style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--color-border)" }}
              />
              <button
                type="button"
                disabled={skillInstalling || !skillInstallUrl.trim()}
                onClick={async () => {
                  const url = skillInstallUrl.trim();
                  if (!url) return;
                  setSkillInstalling(true);
                  setSkillInstallMsg(null);
                  try {
                    await installSkillFromUrl(url);
                    setSkills(getSkills());
                    setSkillInstallUrl("");
                    setSkillInstallMsg("✅ 安装成功!");
                  } catch (e) {
                    setSkillInstallMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setSkillInstalling(false);
                  }
                }}
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

          <button type="button" onClick={() => {
            setSkillEdit(null);
            setSkillForm({ name: "", description: "", triggers: "", prompt: "", alwaysOn: false, priority: 10 });
            setShowSkillForm(true);
          }} style={{ ...btnPrimary, marginBottom: 12, fontSize: 12 }}>➕ 新建技能</button>

          {/* 技能库 */}
          <h5 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-muted)" }}>📦 推荐技能库 (点击安装)</h5>
          {SKILL_GALLERY.map(item => {
            const installed = skills.some(s => s.name === item.name);
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
                    setSkills(getSkills());
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
              <input value={skillForm.name} onChange={e => setSkillForm(f => ({ ...f, name: e.target.value }))} placeholder="技能名称" style={{ ...inputStyle, marginTop: 8 }} />
              <input value={skillForm.description} onChange={e => setSkillForm(f => ({ ...f, description: e.target.value }))} placeholder="简短描述" style={{ ...inputStyle, marginTop: 6 }} />
              <input value={skillForm.triggers} onChange={e => setSkillForm(f => ({ ...f, triggers: e.target.value }))} placeholder="触发词,逗号分隔 (如: 文献综述,meta分析,循证)" style={{ ...inputStyle, marginTop: 6 }} />
              <textarea value={skillForm.prompt} onChange={e => setSkillForm(f => ({ ...f, prompt: e.target.value }))} placeholder="Skill 指令内容 (Markdown) — 会被注入到 system prompt 中" rows={8} style={{ ...inputStyle, marginTop: 6, fontFamily: "monospace", fontSize: 11 }} />
              <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={skillForm.alwaysOn} onChange={e => setSkillForm(f => ({ ...f, alwaysOn: e.target.checked }))} />
                  始终激活
                </label>
                <label style={{ fontSize: 12 }}>优先级: <input type="number" value={skillForm.priority} onChange={e => setSkillForm(f => ({ ...f, priority: Number(e.target.value) }))} style={{ width: 50, padding: "2px 4px", fontSize: 12 }} min={1} max={100} /></label>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="button" onClick={() => {
                  if (!skillForm.name || !skillForm.prompt) return;
                  if (skillEdit) {
                    updateSkillFn(skillEdit.id, {
                      name: skillForm.name,
                      description: skillForm.description,
                      triggers: skillForm.triggers.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                      prompt: skillForm.prompt,
                      alwaysOn: skillForm.alwaysOn,
                      priority: skillForm.priority,
                    });
                  } else {
                    addSkillFn({
                      name: skillForm.name,
                      description: skillForm.description,
                      triggers: skillForm.triggers.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                      prompt: skillForm.prompt,
                      alwaysOn: skillForm.alwaysOn,
                      priority: skillForm.priority,
                      enabled: true,
                    });
                  }
                  setSkills(getSkills());
                  setSkillEdit(null);
                  setSkillForm({ name: "", description: "", triggers: "", prompt: "", alwaysOn: false, priority: 10 });
                  setShowSkillForm(false);
                }} style={{ ...btnPrimary, fontSize: 11 }}>保存</button>
                <button type="button" onClick={() => { setSkillEdit(null); setSkillForm({ name: "", description: "", triggers: "", prompt: "", alwaysOn: false, priority: 10 }); setShowSkillForm(false); }} style={{ ...btnGhost, fontSize: 11 }}>取消</button>
              </div>
            </div>
          )}

          {/* 技能列表 */}
          {skills.length === 0 && <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>暂无自定义技能。内置技能会自动加载。</p>}
          {skills.map(s => (
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
                  <button type="button" onClick={() => {
                    updateSkillFn(s.id, { enabled: !s.enabled });
                    setSkills(getSkills());
                  }} style={{ ...btnGhost, fontSize: 10 }}>{s.enabled ? "禁用" : "启用"}</button>
                  {!s.id.startsWith("builtin") && (
                    <button type="button" onClick={() => { deleteSkillFn(s.id); setSkills(getSkills()); }} style={{ ...btnGhost, fontSize: 10, color: "var(--color-abnormal)" }}>删除</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setShowSkills(false)} style={{ ...btnGhost, marginTop: 8 }}>关闭</button>
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
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
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
              accept=".txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.mp3,.wav,.m4a,.ogg,.webm,.flac,.aac,.wma,.mp4,.mov,.avi,.mkv,.wmv,.flv,.mts,.ts"
              onChange={e => void handleFiles(e.target.files)}
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

/** 读取上传文件的文本内容 */
async function readFileContent(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  // 纯文本类型直接读
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv") || name.endsWith(".json")) {
    return await file.text();
  }
  // PDF / 图片 / Word / 音频 / 视频 → base64 data URL
  if (name.endsWith(".pdf") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") ||
      name.endsWith(".gif") || name.endsWith(".webp") || name.endsWith(".doc") || name.endsWith(".docx") ||
      name.endsWith(".xls") || name.endsWith(".xlsx") ||
      name.endsWith(".mp3") || name.endsWith(".wav") || name.endsWith(".m4a") || name.endsWith(".ogg") ||
      name.endsWith(".webm") || name.endsWith(".flac") || name.endsWith(".aac") || name.endsWith(".wma") ||
      name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".avi") || name.endsWith(".mkv") ||
      name.endsWith(".wmv") || name.endsWith(".flv") || name.endsWith(".mts") || name.endsWith(".ts")) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
      reader.onerror = () => reject(new Error("读取失败"));
      reader.readAsDataURL(file);
    });
    const mime = file.type || "application/octet-stream";
    const isAudio = name.match(/\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i);
    const isVideo = name.match(/\.(mp4|mov|avi|mkv|wmv|flv|mts|ts|webm)$/i);
    const label = isVideo ? "base64视频" : isAudio ? "base64音频" : "base64图片/文档";
    const hint = isAudio
      ? `\n提示: 音频文件。支持的模型可转录。`
      : isVideo
      ? `\n提示: 视频文件(前120KB)。支持的模型可提取关键帧。大文件建议先用外部工具转写。`
      : "";
    return `[${label}: data:${mime};base64,${b64.slice(0, 120000)}] (原始: ${b64.length} 字符, ${(file.size/1024/1024).toFixed(1)}MB, 文件名: ${file.name})${hint}`;
  }
  // 未知类型尝试当文本读
  try {
    return await file.text();
  } catch {
    return `[无法读取的文件: ${file.name} (${(file.size / 1024).toFixed(1)}KB)]`;
  }
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