/**
 * LLM 临床推理引擎 — 把 ANRM 手册知识作为 system prompt,送 LLM 推理,输出结构化 JSON。
 *
 * 所有 HTTP/URL/重试/超时逻辑都在 llm-client.ts,这里只管:
 *   - 配置存取(本地 localStorage + AES-GCM 加密 apiKey)
 *   - system prompt 构建
 *   - LLM 结果解析 + 失败回退到规则引擎
 *
 * 部署安全: 不打包 API key(VITE_* 会暴露在 GitHub Pages bundle 里)。
 *           apiKey 仅存浏览器 localStorage,用户必须自己配置才能启用 LLM 推理。
 */

import type { ClinicalContext } from "./ai-assistant.types";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";
import { callLLM, LLMCallError, cleanApiUrl } from "./llm-client";

/* ---- ANRM 核心知识 system prompt 骨架 ---- */
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

/* ============================================================
 *  配置存取
 * ============================================================ */

const LLM_CONFIG_KEY = "anrm_llm_config";

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  corsProxy?: string;
}

/* 加密存储常量 */
let _cryptoKey: CryptoKey | null = null;
const CRYPTO_SALT = new Uint8Array([0xa1, 0x4e, 0x72, 0x6d, 0x3f, 0x8b, 0x15, 0xc9, 0x6e, 0x2a, 0x77, 0x4f, 0x0d, 0x1c, 0x9e, 0x53]);

async function getCryptoKey(): Promise<CryptoKey> {
  if (_cryptoKey) return _cryptoKey;
  const subtle = crypto.subtle;
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
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encrypted: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

export async function getLLMConfig(): Promise<LLMConfig | null> {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LLMConfig>;
    if (!parsed.apiUrl || !parsed.apiKey) return null;
    let apiKey = parsed.apiKey;
    try { apiKey = await decryptData(apiKey); } catch { /* 明文 */ }
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
  // url 纠错委托给 llm-client
  let url: string;
  try {
    url = cleanApiUrl(cfg.apiUrl);
  } catch (e) {
    console.error("[llm-engine] 保存失败:", e);
    throw e;
  }
  try {
    const encKey = await encryptData(cfg.apiKey);
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify({
      apiUrl: url,
      apiKey: encKey,
      model: cfg.model || "claude-haiku-4-5",
      corsProxy: cfg.corsProxy,
    }));
  } catch (e) {
    console.error("[llm-engine] 保存 LLM 配置失败:", e);
    throw e;
  }
}

export function clearLLMConfig(): void {
  try { localStorage.removeItem(LLM_CONFIG_KEY); } catch { /* ok */ }
}

export function isLLMConfigured(): boolean {
  try { return localStorage.getItem(LLM_CONFIG_KEY) !== null; } catch { return false; }
}

/* ============================================================
 *  Prompt 构建
 * ============================================================ */

function buildSystemPrompt(): string {
  const blocks = INTERVENTIONS_CATALOG.map(
    (i) => `- id:${i.id} | ${i.name} | 目标:${i.neuroTargets.join("/")} | 适应症:${i.indications} | 参数:${i.parameters}`,
  ).join("\n");
  return SYSTEM_PROMPT.replace("$INTERVENTIONS", blocks);
}

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

/* ============================================================
 *  调 LLM
 * ============================================================ */

export type AnalyzeResult = Awaited<ReturnType<typeof import("./reasoning-engine").analyze>> & {
  narrative: ReturnType<typeof import("./reasoning-engine").generateNarrative>;
  _source: "llm" | "rules";
};

export async function analyzeAsync(ctx: ClinicalContext): Promise<AnalyzeResult> {
  if (isLLMConfigured()) {
    try {
      const cfg = await getLLMConfig();
      if (cfg) {
        const result = await callLLM(
          [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(ctx) },
          ],
          cfg,
          { maxTokens: 2000, temperature: 0.2 },
        );

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new LLMCallError("format", "LLM 返回格式无效", "未找到 JSON");
        const structured = JSON.parse(jsonMatch[0]);
        return {
          localizationSuggestions: structured.localizationSuggestions ?? [],
          interventionSuggestions: structured.interventionSuggestions ?? [],
          completeness: structured.completeness ?? "已足够",
          narrative: structured.narrative ?? { subjective: "", objective: "", assessment: "", plan: "" },
          _source: "llm",
        };
      }
    } catch (e) {
      console.warn("[llm-engine] LLM 调用失败,回退规则引擎:", e instanceof Error ? e.message : e);
    }
  }
  const { analyze, generateNarrative } = await import("./reasoning-engine");
  const rules = analyze(ctx);
  return { ...rules, narrative: generateNarrative(ctx), _source: "rules" };
}

/* 重新导出方便 UI 接入 */
export { pingLLM, LLMCallError } from "./llm-client";
export type { PingResult } from "./llm-client";
