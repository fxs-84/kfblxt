/**
 * LLM 临床推理引擎 — 替换 reasoning-engine.ts 时接口不变。
 * 将 ANRM 手册核心知识作为 system prompt,临床上下文作为 user prompt,
 * 送 LLM 做推理,输出结构化 JSON→解析为 LocalizationSuggestion[]/InterventionSuggestion[]/ClinicalNarrative。
 *
 * 安全策略(关键):
 *   **不允许构建时注入 API key**(VITE_* 会暴露在 GitHub Pages bundle 里)。
 *   用户必须在本机 localStorage 中配置 key 才能启用 LLM 推理。
 *   未配置时自动回退到本地规则引擎,功能照常可用。
 *
 * 用法:
 *   1. 用户在设置中填入自己的 LLM API key(仅存浏览器 localStorage,不上传)
 *   2. callLLM 读 localStorage 的 key 发起请求
 *   3. 部署到 GitHub Pages 时,JS bundle 里**永远不会包含任何 key**
 */

import type { ClinicalContext } from "./ai-assistant.types";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";

/* ---- ANRM 核心知识(system prompt 骨架) ---- */
const SYSTEM_PROMPT = `你是 ANRM(Applied Neuroscience for Rehabilitation Medicine)认证的临床神经康复专家助手。
你的任务是:根据临床主诉、查体发现和已完成的定位诊断,给出:

1. **神经定位建议**(每条含 level 水平/rationale 推理依据/confidence 置信度 0-1)
2. **治疗干预建议**(从下方干预库中精确选择 interventionId,按 clinical priority 排序)
3. **SOAP 临床笔记**(日本語风格,S-主观/O-客观/A-评估/P-计划)

## ANRM 核心推理原则(来自课程手册)
- 症状分布决定神经系统水平定位:腰骶→神经根/脊髓;上肢远端→C6-T1;颈枕→C2-C4;头面→三叉神经
- 感觉异常分型:麻木/减退=大纤维 Aβ 损伤→压迫或缺血;灼痛/烧灼=小纤维 C/Aδ 敏化→TRPV/ASIC 上调
- **皮神经敏化是 ANRM 特色**:前臂外侧皮神经/腓肠神经/肋间神经/股外侧皮神经/臀上皮神经等可单独致痛
- 疼痛≠损伤——WDR 神经元中央集成状态(CIS)决定痛觉输出;本体感觉输入可关闭 WDR(闸门效应)
- 眼球运动→脑神经 III/IV/VI/XII→脊髓前角→脊柱稳定(前庭-眼动-脊柱同源性)
- VOR 训练:稳定眼球=稳定脊柱;无法稳定眼球=无法稳定脊柱
- 下行疼痛抑制通路:PAG→中缝核→中缝脊髓束→抑制脊髓后角 WDR
- 原始反射未整合→皮质功能形成障碍;同源性(胚胎同源区域)可用于跨肢体刺激治疗
- 康复界限:卡压>3 月考虑手术;神经轴索断裂恢复速度≈1mm/天
- "树干与树枝"—躯干中线稳定性优先于远端动作

## 干预技术库(只能从中选择)
$INTERVENTIONS

## 输出格式
只返回合法 JSON,不要 markdown 代码块:

{
  "localizationSuggestions": [
    { "level": "神经根", "rationale": "...", "confidence": 0.85 }
  ],
  "interventionSuggestions": [
    { "interventionId": "...", "priority": 10, "rationale": "..." }
  ],
  "narrative": {
    "subjective": "患者主诉…",
    "objective": "查体发现…",
    "assessment": "神经定位:…节段/神经/机制分析…",
    "plan": "治疗计划:…(使用规范ANRM术语)…复评节点…"
  },
  "completeness": "高置信"
}`;

const LLM_CONFIG_KEY = "anrm_llm_config";
/* 加密存储常量 — 使用 Web Crypto AES-GCM */
let _cryptoKey: CryptoKey | null = null;
const CRYPTO_SALT = new Uint8Array([0xa1, 0x4e, 0x72, 0x6d, 0x3f, 0x8b, 0x15, 0xc9, 0x6e, 0x2a, 0x77, 0x4f, 0x0d, 0x1c, 0x9e, 0x53]);

async function getCryptoKey(): Promise<CryptoKey> {
  if (_cryptoKey) return _cryptoKey;
  const subtle = crypto.subtle;
  // 从 userAgent + origin 派生密钥材料(同浏览器同源解得出,其他人不行)
  const material = new TextEncoder().encode(`${navigator.userAgent}|${location.origin}|anrm_kfblxt_salt`);
  const baseKey = await subtle.importKey("raw", material, "PBKDF2", false, ["deriveKey"]);
  _cryptoKey = await subtle.deriveKey(
    { name: "PBKDF2", salt: CRYPTO_SALT, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return _cryptoKey;
}

async function encryptData(plain: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // iv(12 bytes) + ciphertext → base64
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encrypted: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export interface LLMConfig {
  /** API endpoint(Anthropic Messages 或 OpenAI-compatible) */
  apiUrl: string;
  /** 用户自己的 API key,仅存浏览器 localStorage */
  apiKey: string;
  /** 模型名,默认 claude-haiku-4-5 */
  model: string;
  /** CORS 代理 URL,可选。如 https://your-cors-proxy/  */
  corsProxy?: string;
}

/** 实际发请求的 URL。本地开发时自动走 Vite 代理绕过 CORS,生产走 corsProxy 或直连。 */
export function resolveApiUrl(baseUrl: string, corsProxy?: string): string {
  // 先修复常见 URL 错误: 缺协议前缀、缺少 `h` 等
  let cleaned = baseUrl.trim();
  if (/^ttps?:\/\//i.test(cleaned)) cleaned = "h" + cleaned; // ttps:// → https://
  if (!/^https?:\/\//i.test(cleaned)) cleaned = "https://" + cleaned.replace(/^[:\/]+/, "");

  const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]";
  if (isDev) {
    // 不依赖协议前缀的正则 — 直接按域名匹配
    const proxyMap: Array<{ host: string; path: string }> = [
      { host: "api.deepseek.com", path: "/api/deepseek" },
      { host: "api.anthropic.com", path: "/api/anthropic" },
      { host: "api.openai.com", path: "/api/openai" },
    ];
    for (const { host, path } of proxyMap) {
      const idx = cleaned.indexOf(host);
      if (idx !== -1) {
        const rewritten = path + cleaned.slice(idx + host.length);
        console.warn("[llm-engine] DEV proxy:", baseUrl, "→", rewritten);
        return rewritten;
      }
    }
    // 兜底: 任意 OpenAI-compatible API → base64 编码后走通用代理
    // 支持 OpenRouter / Groq / Ollama / 自部署模型等
    const encoded = btoa(cleaned);
    const fallback = `/api/proxy/${encoded}`;
    console.warn("[llm-engine] DEV generic proxy:", baseUrl, "→", fallback);
    return fallback;
  }
  // 生产: corsProxy 或直连
  if (!corsProxy) return cleaned;
  return corsProxy.replace(/\/+$/, "") + "/" + cleaned.replace(/^https?:\/\//, "");
}

/** 读取用户在 localStorage 里配置的 LLM(部署安全:不打包进 bundle)
 *  apiKey 用 Web Crypto AES-GCM 加密存储,防止 XSS 直接读取 */
export async function getLLMConfig(): Promise<LLMConfig | null> {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LLMConfig>;
    if (!parsed.apiUrl || !parsed.apiKey) return null;
    // apiKey 可能加密或明文 — 先尝试解密,失败则视为明文
    let apiKey = parsed.apiKey;
    try { apiKey = await decryptData(apiKey); } catch { /* 明文 key */ }
    return {
      apiUrl: parsed.apiUrl,
      apiKey,
      model: parsed.model || "claude-haiku-4-5",
      corsProxy: parsed.corsProxy,
    };
  } catch {
    return null;
  }
}

/** 同步读取 LLM 配置(仅 URL/model/corsProxy,不含 apiKey)。
 *  供 UI 预填表单用 — key 始终留空显示。 */
export function getLLMConfigSync(): { apiUrl: string; model: string; corsProxy?: string } | null {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LLMConfig>;
    if (!parsed.apiUrl) return null;
    return { apiUrl: parsed.apiUrl, model: parsed.model || "claude-haiku-4-5", corsProxy: parsed.corsProxy };
  } catch {
    return null;
  }
}

export async function saveLLMConfig(cfg: LLMConfig): Promise<void> {
  try {
    // 自动规范化 URL: 修复 typo、补协议
    let url = cfg.apiUrl.trim();
    if (/^ttps?:\/\//i.test(url)) url = "h" + url;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url.replace(/^[:\/]+/, "");
    // 仅加密 apiKey,URL/model/corsProxy 明文(UI 预填需要)
    const encKey = await encryptData(cfg.apiKey);
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify({
      apiUrl: url,
      apiKey: encKey,
      model: cfg.model || "claude-haiku-4-5",
      corsProxy: cfg.corsProxy,
    }));
  } catch (e) {
    console.error("[llm-engine] 保存 LLM 配置失败:", e);
  }
}

export function clearLLMConfig(): void {
  try {
    localStorage.removeItem(LLM_CONFIG_KEY);
  } catch { /* ok */ }
}

/** 是否已配置(给 UI 显示状态用),无需解密 */
export function isLLMConfigured(): boolean {
  try {
    return localStorage.getItem(LLM_CONFIG_KEY) !== null;
  } catch {
    return false;
  }
}

/* ---- 构建完整 system prompt ---- */
function buildSystemPrompt(): string {
  const interventionBlocks = INTERVENTIONS_CATALOG.map(
    (i) => `- id:${i.id} | ${i.name} | 目标:${i.neuroTargets.join("/")} | 适应症:${i.indications} | 参数:${i.parameters}`,
  ).join("\n");
  return SYSTEM_PROMPT.replace("$INTERVENTIONS", interventionBlocks);
}

/* ---- 构建 user prompt ---- */
function buildUserPrompt(ctx: ClinicalContext): string {
  const lines: string[] = [];
  lines.push("## 主诉");
  lines.push(`症状区域: ${ctx.chiefComplaint.regions.join("、")}`);
  lines.push(`症状性质: ${ctx.chiefComplaint.nature.join("、")}`);
  lines.push(`VAS: ${ctx.chiefComplaint.vas}/10`);

  if (ctx.examFindings.length > 0) {
    lines.push("\n## 查体发现");
    for (const f of ctx.examFindings) {
      const part = [f.name];
      if (f.left !== undefined) part.push(`左=${f.left}`);
      if (f.right !== undefined) part.push(`右=${f.right}`);
      if (f.value !== undefined) part.push(`${f.value}`);
      lines.push("- " + part.join(" "));
    }
  }

  if (ctx.diagnosis) {
    lines.push("\n## 已知诊断");
    lines.push(`水平: ${ctx.diagnosis.levels.join("→")}`);
    lines.push(`侧别: ${ctx.diagnosis.side}`);
    if (ctx.diagnosis.segments?.length) lines.push(`节段: ${ctx.diagnosis.segments.join("/")}`);
    if (ctx.diagnosis.mechanisms.length) lines.push(`机制: ${ctx.diagnosis.mechanisms.join("+")}`);
  }

  return lines.join("\n");
}

/* ---- 调用 LLM:从 localStorage 读 key,不用构建期 env(防泄露) ---- */
async function callLLM(ctx: ClinicalContext): Promise<ReturnType<typeof import("./reasoning-engine").analyze> & { narrative: ReturnType<typeof import("./reasoning-engine").generateNarrative> }> {
  const cfg = await getLLMConfig();
  if (!cfg) throw new Error("LLM_NOT_CONFIGURED");

  const { buildApiHeaders, detectApiType, parseAnthropicResponse, parseOpenAIResponse } =
    await import("./api-adapter");

  const apiType = detectApiType(cfg.apiUrl);
  const headers = buildApiHeaders(cfg.apiKey, cfg.apiUrl);
  const systemPrompt = buildSystemPrompt();
  const userContent = buildUserPrompt(ctx);

  const body: Record<string, unknown> = apiType === "anthropic"
    ? {
        model: cfg.model,
        max_tokens: 2000,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }
    : {
        model: cfg.model,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      };

  const requestUrl = resolveApiUrl(cfg.apiUrl, cfg.corsProxy);
  const res = await fetch(requestUrl, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`LLM API ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const parsed = apiType === "anthropic" ? parseAnthropicResponse(data) : parseOpenAIResponse(data);

  // 解析 JSON
  const jsonMatch = parsed.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM 返回格式无效");

  const structured = JSON.parse(jsonMatch[0]);
  return {
    localizationSuggestions: structured.localizationSuggestions ?? [],
    interventionSuggestions: structured.interventionSuggestions ?? [],
    completeness: structured.completeness ?? "已足够",
    narrative: structured.narrative ?? { subjective: "", objective: "", assessment: "", plan: "" },
  };
}

/* ---- 包装:LLM 可用则用,不可用回退规则引擎 ---- */
/** 返回值含 _source 字段,标记真实使用的引擎(llm 或 rules) */
export type AnalyzeResult = Awaited<ReturnType<typeof import("./reasoning-engine").analyze>> & {
  narrative: ReturnType<typeof import("./reasoning-engine").generateNarrative>;
  _source: "llm" | "rules";
};

export async function analyzeAsync(ctx: ClinicalContext): Promise<AnalyzeResult> {
  // 仅在用户配置了 LLM key 时才尝试调用,避免无用 fetch
  if (isLLMConfigured()) {
    try {
      const llm = await callLLM(ctx);
      return { ...llm, _source: "llm" };
    } catch (e) {
      console.warn("[llm-engine] LLM 调用失败,回退规则引擎:", e instanceof Error ? e.message : e);
    }
  }
  // 回退到规则引擎(lazy import,避免循环引用)
  const { analyze, generateNarrative } = await import("./reasoning-engine");
  const rules = analyze(ctx);
  return { ...rules, narrative: generateNarrative(ctx), _source: "rules" };
}
