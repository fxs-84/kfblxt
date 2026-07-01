/**
 * ANRM 临床推理引擎 — 基于规则的知识驱动。
 * 可替换为 LLM API 调用,接口不变。
 */
import { EXAM_CATALOG } from "../exam/exam-catalog";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";
import type {
  ClinicalContext,
  LocalizationSuggestion,
  InterventionSuggestion,
  ClinicalNarrative,
} from "./ai-assistant.types";

/* ================================================================
   模式匹配表:症状→神经水平
   ================================================================ */

interface RegionPattern {
  regionPattern: RegExp;
  levels: string[];
  segments?: string[];
  nerves?: string[];
  rationale: string;
}

const REGION_PATTERNS: RegionPattern[] = [
  { regionPattern: /腰|lower-back|lumbar/i, levels: ["神经根", "脊髓"], segments: ["L4", "L5", "S1"], nerves: ["坐骨神经"], rationale: "腰骶区域→L4-S1 神经根支配" },
  { regionPattern: /臀|gluteal|hip/i, levels: ["神经根", "周围神经"], segments: ["L5", "S1", "S2"], nerves: ["坐骨神经", "臀上神经", "臀下神经"], rationale: "臀部→L5-S2 神经根+坐骨神经" },
  { regionPattern: /颈|neck|cervical/i, levels: ["神经根", "脊髓", "周围神经"], segments: ["C3", "C4", "C5", "C6", "C7"], nerves: ["锁骨上神经(C3-C4)"], rationale: "颈部→C3-C7 颈丛+臂丛支配" },
  { regionPattern: /肩|shoulder|deltoid/i, levels: ["神经根", "周围神经"], segments: ["C5", "C6"], nerves: ["腋神经", "肩胛上神经(C5-C6)"], rationale: "肩部→C5-C6 支配" },
  { regionPattern: /手|hand|forearm|arm|elbow|wrist/i, levels: ["周围神经", "神经根"], segments: ["C6", "C7", "C8", "T1"], nerves: ["正中神经", "尺神经", "桡神经"], rationale: "上肢远端→C6-T1 臂丛分支支配" },
  { regionPattern: /小腿|calf|leg|足|foot|踝|ankle/i, levels: ["神经根", "周围神经"], segments: ["L4", "L5", "S1", "S2"], nerves: ["坐骨神经", "腓总神经", "胫神经", "腓肠神经"], rationale: "下肢→L4-S2 腰骶丛支配" },
  { regionPattern: /膝|knee/i, levels: ["神经根"], segments: ["L3", "L4"], rationale: "膝关节→L3-L4 股神经支配" },
  { regionPattern: /头|head|枕|occipital|颞|temporal/i, levels: ["周围神经", "脑干/中脑"], segments: ["C2", "C3"], nerves: ["枕大神经", "枕小神经", "耳大神经"], rationale: "头部→C2-C3 颈丛+三叉神经支配" },
  { regionPattern: /胸|chest|肋|rib/i, levels: ["神经根"], segments: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"], nerves: ["肋间神经前皮支", "肋间神经外侧皮支"], rationale: "胸腹部→T1-T12 肋间神经支配" },
];

/* 症状性质→机制推测 */
interface SymptomPattern {
  naturePattern: RegExp;
  mechanisms: string[];
  rationale: string;
}

const SYMPTOM_PATTERNS: SymptomPattern[] = [
  { naturePattern: /麻木|减退|蚁走|冰冷|触电感/i, mechanisms: ["机械压迫", "神经敏化"], rationale: "大纤维(Aβ)功能障碍→压迫/缺血;感觉减退提示轴索损害" },
  { naturePattern: /刺痛|灼痛|烧灼/i, mechanisms: ["神经敏化", "中枢敏化"], rationale: "小纤维(Aδ/C)敏化→TRPV/ASIC 通道上调;灼痛=中枢敏化标志" },
  { naturePattern: /无力|萎缩|疲劳|精细/i, mechanisms: ["机械压迫", "失用/去条件化"], rationale: "α运动神经元/神经肌肉接头→肌力下降;长期→失用萎缩" },
  { naturePattern: /眩晕|不稳|晃动|漂浮|晕/i, mechanisms: ["失用/去条件化"], rationale: "前庭/小脑/脑干→VOR 通路→脊柱稳定→PMRF 激活" },
  { naturePattern: /僵硬|痉挛/i, mechanisms: ["机械压迫", "中枢敏化"], rationale: "γ运动神经元兴奋↑→肌梭敏感↑→网状脊髓束下行抑制↓" },
  { naturePattern: /协调|共济|震颤|balance|平衡/i, mechanisms: ["失用/去条件化", "发育未整合"], rationale: "小脑/基底节→运动计划/执行→本体感觉反馈环路" },
  { naturePattern: /注意力|记忆|阅读|学习|发育|焦虑|抑郁|脑雾/i, mechanisms: ["发育未整合"], rationale: "皮质/边缘系统→原始反射残留→右脑/左脑不平衡" },
  { naturePattern: /睡眠|心悸|出汗|血压|排尿|排便/i, mechanisms: ["代谢/炎症"], rationale: "自主神经→交感/副交感失衡→压力感受反射→脑肠轴" },
];

/* ================================================================
   干预匹配表:机制→神经目标→干预
   ================================================================ */

interface InterventionMapping {
  mechanism: RegExp;
  topInterventionIds: string[];
}

const INTERVENTION_MAP: InterventionMapping[] = [
  { mechanism: /神经敏化|敏化|中枢敏化/i, topInterventionIds: ["neural-desensitization", "gate-control", "ober-point-release"] },
  { mechanism: /机械压迫|压迫/i, topInterventionIds: ["nerve-glide", "pec-minor-release", "joint-mobilization", "quick-stretch"] },
  { mechanism: /失用|去条件化/i, topInterventionIds: ["vor-training", "mirror-therapy", "strength-eccentric", "stability-core", "balance-dynamic"] },
  { mechanism: /代谢|炎症/i, topInterventionIds: ["dietary-intervention", "blood-sugar-control", "breathing-training", "aerobic-training"] },
  { mechanism: /发育未整合/i, topInterventionIds: ["moro-integration", "atnr-integration", "tlr-integration", "stnr-integration", "galant-integration"] },
  { mechanism: /神经退行/i, topInterventionIds: ["mirror-therapy", "coordination-training", "metronome-training", "apa-training"] },
];

/* ================================================================
   推理引擎
   ================================================================ */

export function analyze(context: ClinicalContext): {
  localizationSuggestions: LocalizationSuggestion[];
  interventionSuggestions: InterventionSuggestion[];
  completeness: "需要更多信息" | "已足够" | "高置信";
} {
  const loc: LocalizationSuggestion[] = [];
  const int: InterventionSuggestion[] = [];

  /* 1. 区域→神经水平映射 */
  const regionStr = context.chiefComplaint.regions.join(" ");
  for (const p of REGION_PATTERNS) {
    if (p.regionPattern.test(regionStr)) {
      const hiConf = /lower-back|lumbar|neck|cervical|calves|foot/i;
      const confidence = hiConf.test(regionStr) ? 0.85 : 0.7;
      loc.push({
        level: p.levels[p.levels.length - 1] ?? p.levels[0],
        rationale: p.rationale,
        confidence,
      });
      if (p.levels.length > 1) {
        for (const l of p.levels.slice(0, -1)) {
          loc.push({ level: l, rationale: `次级定位:${p.rationale}`, confidence: confidence * 0.7 });
        }
      }
    }
  }

  /* 2. 症状性质→机制 */
  const natureStr = context.chiefComplaint.nature.join(" ");
  const matchedMechanisms = new Set<string>();
  for (const p of SYMPTOM_PATTERNS) {
    if (p.naturePattern.test(natureStr)) {
      for (const m of p.mechanisms) {
        matchedMechanisms.add(m);
        loc.push({ level: m === "中枢敏化" ? "脊髓" : m === "机械压迫" ? "周围神经" : m === "神经敏化" ? "周围神经" : m === "代谢/炎症" ? "自主神经" : m === "发育未整合" ? "脑干/中脑" : "皮质", rationale: p.rationale, confidence: 0.75 });
      }
    }
  }

  /* 3. 查体阳性发现→定位 */
  for (const finding of context.examFindings) {
    const def = EXAM_CATALOG.find((d) => d.name === finding.name);
    if (!def) continue;
    const val = finding.value ?? finding.left ?? finding.right;
    const isAbnormal = val === true || val === "阳性" || val === "强阳性" || val === "弱阳性" ||
      (typeof val === "number" && def.dataType === "grade-0-4" && val < 2) ||
      (typeof val === "string" && (val === "减退" || val === "消失" || val === "异常"));
    if (isAbnormal && def.abnormalMeaning) {
      loc.push({ level: "特定体征", rationale: `${finding.name}异常→${def.abnormalMeaning}`, confidence: 0.9 });
    }
  }

  /* 4. 有效诊断→干预映射 */
  if (context.diagnosis) {
    for (const mechanism of context.diagnosis.mechanisms) {
      const mapping = INTERVENTION_MAP.find((m) => m.mechanism.test(mechanism));
      if (mapping) {
        for (const id of mapping.topInterventionIds) {
          const intervention = INTERVENTIONS_CATALOG.find((i) => i.id === id);
          if (intervention) {
            int.push({ interventionId: id, name: intervention.name, rationale: `机制匹配:${mechanism}→${intervention.neuroTargets.join("/")}→${intervention.name}`, priority: 10 });
          }
        }
      }
    }
  } else {
    /* 无诊断时按症状机制匹配 */
    const mechs = [...matchedMechanisms];
    const seen = new Set<string>();
    for (const mechanism of mechs) {
      const mapping = INTERVENTION_MAP.find((m) => m.mechanism.test(mechanism));
      if (mapping) {
        for (const id of mapping.topInterventionIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          const intervention = INTERVENTIONS_CATALOG.find((i) => i.id === id);
          if (intervention) {
            int.push({ interventionId: id, name: intervention.name, rationale: `症状推测机制:${mechanism}→建议评估${intervention.name}`, priority: 8 });
          }
        }
      }
    }
  }

  /* 5. 始终推荐的基础干预(前庭-眼动+呼吸) */
  const baseIds = ["vor-training", "breathing-training"];
  for (const id of baseIds) {
    if (!int.some((s) => s.interventionId === id)) {
      const intervention = INTERVENTIONS_CATALOG.find((i) => i.id === id);
      if (intervention) {
        int.push({ interventionId: id, name: intervention.name, rationale: "ANRM 基础:稳定眼球=稳定脊柱;呼吸=迷走激活", priority: 3 });
      }
    }
  }

  const completeness: "需要更多信息" | "已足够" | "高置信" =
    context.diagnosis ? "高置信" :
    context.examFindings.length >= 3 ? "已足够" :
    "需要更多信息";

  return { localizationSuggestions: loc, interventionSuggestions: int, completeness };
}

export function generateNarrative(context: ClinicalContext): ClinicalNarrative {
  const regions = context.chiefComplaint.regions.join("、");
  const natures = context.chiefComplaint.nature.join("、");
  const vas = context.chiefComplaint.vas;

  let subjective = `患者主诉 ${regions} ${natures},VAS ${vas}/10。`;
  if (vas >= 7) subjective += "疼痛剧烈,显著影响日常生活。";
  else if (vas >= 4) subjective += "中度不适,部分影响睡眠及活动。";
  else subjective += "症状较轻,ADL 基本不受限。";

  let objective = "";
  for (const f of context.examFindings) {
    const val = f.value ?? f.left ?? f.right;
    if (val !== undefined && val !== null && val !== "") {
      const sideStr = f.left !== undefined && f.right !== undefined ? `左${f.left}/右${f.right}` : f.value !== undefined ? String(f.value) : "";
      objective += `${f.name}:${sideStr}; `;
    }
  }
  if (!objective) objective = "尚未完成系统查体。";

  let assessment = "";
  if (context.diagnosis) {
    assessment = `神经定位:${context.diagnosis.levels.join("→")},${context.diagnosis.side}侧。`;
    if (context.diagnosis.segments?.length) assessment += `节段:${context.diagnosis.segments.join("/")}。`;
    if (context.diagnosis.nerves?.length) assessment += `神经:${context.diagnosis.nerves.join("、")}。`;
    assessment += `机制:${context.diagnosis.mechanisms.join("+")}。`;
    if (context.diagnosis.cutaneousNerveIds?.length) {
      assessment += `皮神经敏化:${context.diagnosis.cutaneousNerveIds.length} 条。`;
    }
  } else {
    assessment = "待完成神经定位诊断。";
  }

  let plan = "建议:";
  const { interventionSuggestions } = analyze(context);
  for (const s of interventionSuggestions.slice(0, 5)) {
    plan += ` ${s.name};`;
  }
  plan += " 复评节点:立即(当场见效)/短期(1-2周)/长期(4周+)。";

  return { subjective, objective, assessment, plan };
}
