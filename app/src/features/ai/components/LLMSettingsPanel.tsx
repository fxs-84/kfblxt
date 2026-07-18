/**
 * LLM 配置面板 — AgentChat(全局聊天)与 AIAssistantPanel(患者页)共享。
 * 自包含:挂载时加载当前配置,保存/清除后通过 onConfiguredChange 通知父组件。
 *
 * 统一走 getLLMConfig()/saveLLMConfig() — 历史上 AIAssistantPanel 直接读
 * localStorage 加密态 key 再保存,造成双重加密,共享后该类错误只可能有一份。
 */
import { useEffect, useState } from "react";
import { getLLMConfig, saveLLMConfig, clearLLMConfig, pingLLM } from "../llm-engine";
import { LLMCallError, type PingResult } from "../llm-client";
import { getExtConfig, saveExtConfig, type ExtConfig } from "../../agent/tools/ext-config";
import { btnGhost, btnPrimary, inputStyle, labelStyle, overlayPanelStyle } from "../../agent/ui-styles";

const MODEL_PRESETS = [
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
];

const PROXY_PRESETS = [
  { label: "🚫 留空(直连)", url: "" },
  { label: "🌐 corsproxy.io", url: "https://corsproxy.io/?" },
  { label: "🌐 allorigins", url: "https://api.allorigins.win/raw?url=" },
  { label: "🌐 cors.sh", url: "https://proxy.cors.sh/" },
];

interface Props {
  onClose: () => void;
  /** 保存(true)/清除(false)后通知父组件刷新"已配置"状态 */
  onConfiguredChange: (configured: boolean) => void;
  /** 覆盖式(聊天窗内绝对定位)或内嵌式(患者页 tab 内) */
  variant?: "overlay" | "inline";
}

export function LLMSettingsPanel({ onClose, onConfiguredChange, variant = "overlay" }: Props) {
  const [llmForm, setLlmForm] = useState({ apiUrl: "", apiKey: "", model: "", corsProxy: "" });
  const [keyAlreadySet, setKeyAlreadySet] = useState(false);
  const [llmSaveMsg, setLlmSaveMsg] = useState<string | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<PingResult | null>(null);
  const [extCfg, setExtCfg] = useState<ExtConfig>(getExtConfig);
  const [configured, setConfigured] = useState(false);

  // 挂载时加载当前配置(条件渲染场景下 mount 即"打开")
  useEffect(() => {
    void (async () => {
      const c = await getLLMConfig();
      setLlmForm({
        apiUrl: c?.apiUrl ?? "https://api.anthropic.com/v1/messages",
        apiKey: "",
        model: c?.model ?? "claude-haiku-4-5",
        corsProxy: c?.corsProxy ?? "",
      });
      setKeyAlreadySet(Boolean(c?.apiKey));
      setConfigured(Boolean(c?.apiKey));
    })();
  }, []);

  /** key 留空且已有保存的 key 时,取回明文 key 复用(绝不读 localStorage 加密态) */
  const resolveKey = async (): Promise<string> => {
    const keyOk = llmForm.apiKey.trim();
    if (keyOk) return keyOk;
    if (!keyAlreadySet) return "";
    const existing = await getLLMConfig();
    return existing?.apiKey ?? "";
  };

  const handleSave = async () => {
    const urlOk = llmForm.apiUrl.trim();
    const finalKey = await resolveKey();
    if (!urlOk) { setLlmSaveMsg("❌ API URL 必填"); return; }
    if (!finalKey) { setLlmSaveMsg("❌ 请输入 API Key"); return; }
    try {
      await saveLLMConfig({
        apiUrl: urlOk,
        apiKey: finalKey,
        model: llmForm.model.trim() || "claude-haiku-4-5",
        corsProxy: llmForm.corsProxy.trim() || undefined,
      });
      saveExtConfig(extCfg);
      setConfigured(true);
      onConfiguredChange(true);
      setLlmSaveMsg("✅ 保存成功");
      setTimeout(onClose, 600);
    } catch (e) {
      setLlmSaveMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTest = async () => {
    const urlOk = llmForm.apiUrl.trim();
    const finalKey = await resolveKey();
    if (!urlOk) { setLlmTestResult({ ok: false, latencyMs: 0, error: new LLMCallError("config", "API URL 必填") }); return; }
    if (!finalKey) { setLlmTestResult({ ok: false, latencyMs: 0, error: new LLMCallError("config", "请先填入 API Key") }); return; }
    setLlmTesting(true);
    setLlmTestResult(null);
    const r = await pingLLM({
      apiUrl: urlOk,
      apiKey: finalKey,
      model: llmForm.model.trim() || "claude-haiku-4-5",
      corsProxy: llmForm.corsProxy.trim() || undefined,
    });
    setLlmTestResult(r);
    setLlmTesting(false);
  };

  const handleClear = () => {
    clearLLMConfig();
    setConfigured(false);
    setKeyAlreadySet(false);
    setLlmForm((f) => ({ ...f, apiKey: "" }));
    onConfiguredChange(false);
    setLlmSaveMsg("🗑️ 已清除");
  };

  return (
    <div style={variant === "overlay" ? overlayPanelStyle : undefined}>
      <h4 style={{ margin: "0 0 12px" }}>🔑 LLM API 配置</h4>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
        API key 仅保存在浏览器 localStorage,不会上传或进入 JS bundle。
      </p>
      {/* 部署环境提示 — GitHub Pages 等静态部署需要 CORS 代理 */}
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
      <div style={{ marginBottom: 8, fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>⚡ 快速预设</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {MODEL_PRESETS.map((p) => (
          <button type="button" key={p.label} onClick={() => setLlmForm((f) => ({ ...f, apiUrl: p.url, model: p.model }))} title={`${p.region} · ${p.model}`} style={{
            padding: "4px 10px", fontSize: 11, border: "1px solid var(--color-border)", borderRadius: 4,
            background: llmForm.apiUrl === p.url ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
            cursor: "pointer",
          }}>{p.label}</button>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>API URL</label>
        <input value={llmForm.apiUrl} onChange={(e) => setLlmForm((f) => ({ ...f, apiUrl: e.target.value }))} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>
          API Key
          {keyAlreadySet && <span style={{ color: "var(--color-normal)", fontSize: 11, marginLeft: 8 }}>🔒 已保存(安全不显示)</span>}
        </label>
        <input
          type="password"
          value={llmForm.apiKey}
          onChange={(e) => { setLlmForm((f) => ({ ...f, apiKey: e.target.value })); setLlmSaveMsg(null); }}
          placeholder={keyAlreadySet ? "如需更换请输入新 key" : "sk-..."}
          autoComplete="off"
          style={{ ...inputStyle, background: keyAlreadySet && !llmForm.apiKey ? "var(--color-normal-weak, #ecfdf5)" : undefined }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>模型</label>
        <input value={llmForm.model} onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))} placeholder="claude-haiku-4-5 / deepseek-chat / ..." style={inputStyle} />
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600 }}>
        🌐 CORS 代理
        <span style={{ fontSize: 10, marginLeft: 6, color: "var(--color-text-muted)" }}>
          国内访问海外 API / GitHub Pages 部署时必填
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        {PROXY_PRESETS.map((p) => (
          <button type="button" key={p.label} onClick={() => setLlmForm((f) => ({ ...f, corsProxy: p.url }))} title={p.url || "直连"} style={{
            padding: "4px 10px", fontSize: 11, border: "1px solid var(--color-border)", borderRadius: 4,
            background: llmForm.corsProxy === p.url ? "var(--color-accent-weak, #e6f0fa)" : "transparent",
            cursor: "pointer",
          }}>{p.label}</button>
        ))}
      </div>
      <div style={{ marginBottom: 12 }}>
        <input
          value={llmForm.corsProxy}
          onChange={(e) => setLlmForm((f) => ({ ...f, corsProxy: e.target.value }))}
          placeholder="或自定义: https://corsproxy.io/?  /  https://api.allorigins.win/raw?url="
          style={inputStyle}
        />
      </div>

      {/* 高级设置 — 搜索后端配置,普通用户不需要碰 */}
      <details style={{ marginBottom: 12, padding: "8px 0", borderTop: "1px solid var(--color-border)" }}>
        <summary style={{ fontSize: 12, color: "var(--color-text-muted)", cursor: "pointer", fontWeight: 600 }}>
          🔧 高级设置(可选,默认不用配)
        </summary>
        <div style={{ marginTop: 8, padding: 8, background: "var(--color-surface-sunken, #f5f7fa)", borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.6 }}>
            💡 工具能力清单(按"零摩擦可用度"排序):
            <br /><strong style={{ color: "#10b981" }}>✅ 无需任何配置,开箱即用:</strong>
            <br />• <code>search_pubmed</code> — PubMed 2500 万+ 文献检索(医学证据首选)
            <br />• <code>calculate</code> — 药物剂量、量表分数计算
            <br />• <code>get_current_time</code> — 日期时间
            <br />• <code>install_skill</code> — 从 GitHub URL 装 Skill(自动探仓库文件树)
            <br />• 内部病历查询 — 16+ 个临床工具
            <br /><strong style={{ color: "#f59e0b" }}>⚠️ 部分可用(已知限制):</strong>
            <br />• <code>web_fetch</code> — 大部分网站能抓,但微信公众号(腾讯人机验证)、SPA 页面不行
            <br /><strong style={{ color: "#ef4444" }}>❌ 需要 API Key(可选,大部分问题用不到):</strong>
            <br />• <code>web_search</code> — 通用搜索,配 Bing 后解锁(高级设置里填)
          </div>
          <label style={{ ...labelStyle, fontSize: 12 }}>🔍 搜索后端</label>
          <select
            value={extCfg.searchBackend}
            onChange={(e) => setExtCfg((c) => ({ ...c, searchBackend: e.target.value as ExtConfig["searchBackend"] }))}
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
                onChange={(e) => setExtCfg((c) => ({ ...c, bingApiKey: e.target.value }))}
                placeholder="Bing API Key (免费1000次/月)"
                autoComplete="off"
                style={inputStyle}
              />
              <details style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
                <summary style={{ cursor: "pointer", color: "var(--color-accent)" }}>📖 怎么获取 Bing API Key?</summary>
                <div style={{ marginTop: 6, lineHeight: 1.6, padding: 8, background: "var(--color-surface-sunken, #f5f7fa)", borderRadius: 4 }}>
                  <strong>5 分钟搞定,免费 1000 次/月:</strong>
                  <ol style={{ margin: "6px 0", paddingLeft: 20 }}>
                    <li>打开 <a href="https://portal.azure.com/" target="_blank" rel="noreferrer">portal.azure.com</a>,用微软账号登录</li>
                    <li>顶部搜索 <code>Bing Search v7</code> → 点 <strong>"创建"</strong></li>
                    <li>Subscription:学生选 <em>Azure for Students</em>;否则 Pay-As-You-Go(信用卡验证送 200 美元额度)</li>
                    <li>Pricing tier:<strong style={{ color: "#10b981" }}>F1 Free</strong>(每月 1000 次)</li>
                    <li>Region:选 <em>East Asia</em>(国内快)</li>
                    <li>等 1-2 分钟部署完 → 点 <strong>"Go to resource"</strong></li>
                    <li>左侧菜单 <strong>"Keys and Endpoint"</strong> → 复制 <strong>KEY 1</strong>(32 位字符串)</li>
                    <li>粘到上面输入框 → 保存</li>
                  </ol>
                  <div style={{ marginTop: 4, fontSize: 10 }}>
                    ⚠️ 国内访问 Azure 可能需要稳定的网络环境。如卡住,试试 <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer">Brave Search API</a>(每月 2000 次免费)
                  </div>
                </div>
              </details>
            </div>
          )}
          {extCfg.searchBackend === "custom" && (
            <div style={{ marginTop: 4 }}>
              <input
                value={extCfg.customSearchUrl}
                onChange={(e) => setExtCfg((c) => ({ ...c, customSearchUrl: e.target.value }))}
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
        <button type="button" onClick={() => void handleSave()} style={btnPrimary}>保存</button>
        <button type="button" disabled={llmTesting} onClick={() => void handleTest()} style={{ ...btnGhost, opacity: llmTesting ? 0.6 : 1 }}>
          {llmTesting ? "🔗 测试中…" : "🔗 测试连接"}
        </button>
        {configured && (
          <button type="button" onClick={handleClear} style={{ ...btnGhost, color: "var(--color-abnormal)" }}>清除</button>
        )}
        <button type="button" onClick={onClose} style={btnGhost}>取消</button>
      </div>
    </div>
  );
}
