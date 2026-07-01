/**
 * AI 临床助手 — 基于规则引擎(可替换为 LLM API)的临床推理 & 治疗建议。
 *
 * 架构:输入 → 推理管道 → 输出,管道的每一步都是可插拔的处理器。
 * mock 阶段用 ANRM 手册中的规则匹配;接入 LLM 时替换 ReasoningEngine 即可。
 */

export interface ClinicalContext {
  chiefComplaint: {
    regions: string[];
    nature: string[];
    vas: number;
  };
  examFindings: Array<{
    name: string;
    left?: unknown;
    right?: unknown;
    value?: unknown;
  }>;
  diagnosis?: {
    levels: string[];
    mechanisms: string[];
    side: string;
    segments?: string[];
    nerves?: string[];
    cutaneousNerveIds?: string[];
  };
}

export interface LocalizationSuggestion {
  /** 建议的神经水平 */
  level: string;
  /** 匹配依据 */
  rationale: string;
  /** 置信度 0-1 */
  confidence: number;
}

export interface InterventionSuggestion {
  /** 干预技术 ID(from INTERVENTIONS_CATALOG) */
  interventionId: string;
  /** 干预名称 */
  name: string;
  /** 推荐理由 */
  rationale: string;
  /** 优先级(越高越优先) */
  priority: number;
}

export interface ClinicalNarrative {
  /** AI 生成的 SOAP 风格临床笔记 */
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface AIAssistantResult {
  localizationSuggestions: LocalizationSuggestion[];
  interventionSuggestions: InterventionSuggestion[];
  narrative: ClinicalNarrative;
  /** 诊断置信度(需要更多信息/已足够/高置信) */
  completeness: "需要更多信息" | "已足够" | "高置信";
}
