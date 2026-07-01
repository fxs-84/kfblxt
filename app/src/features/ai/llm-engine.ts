/**
 * LLM 临床推理引擎 — 替换 reasoning-engine.ts 时接口不变。
 * 将 ANRM 手册核心知识作为 system prompt,临床上下文作为 user prompt,
 * 送 LLM 做推理,输出结构化 JSON→解析为 LocalizationSuggestion[]/InterventionSuggestion[]/ClinicalNarrative。
 *
 * 用法:设置环境变量 VITE_LLM_API_URL + VITE_LLM_API_KEY 即启启用 LLM;
 * 不设置则自动回退到规则引擎。
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

/* ---- 调用 LLM ---- */
async function callLLM(ctx: ClinicalContext): Promise<ReturnType<typeof import("./reasoning-engine").analyze> & { narrative: ReturnType<typeof import("./reasoning-engine").generateNarrative> }> {
  const url = import.meta.env.VITE_LLM_API_URL as string | undefined;
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined;
  if (!url || !apiKey) throw new Error("LLM_NOT_CONFIGURED");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: import.meta.env.VITE_LLM_MODEL || "claude-haiku-4-5",
      max_tokens: 2000,
      temperature: 0.2,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(ctx) }],
    }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}`);

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? data.choices?.[0]?.message?.content ?? "";

  // 解析 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM 返回格式无效");

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    localizationSuggestions: parsed.localizationSuggestions ?? [],
    interventionSuggestions: parsed.interventionSuggestions ?? [],
    completeness: parsed.completeness ?? "已足够",
    narrative: parsed.narrative ?? { subjective: "", objective: "", assessment: "", plan: "" },
  };
}

/* ---- 包装:LLM 可用则用,不可用回退规则引擎 ---- */
export async function analyzeAsync(ctx: ClinicalContext) {
  try {
    return await callLLM(ctx);
  } catch {
    // 回退到规则引擎(lazy import,避免循环引用)
    const { analyze, generateNarrative } = await import("./reasoning-engine");
    const rules = analyze(ctx);
    return { ...rules, narrative: generateNarrative(ctx) };
  }
}
