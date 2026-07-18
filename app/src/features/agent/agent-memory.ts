/**
 * Agent Memory — 系统的"记忆层"。
 * 不是规则,不是 AI 调用,而是从每一次临床操作中积累的模式知识。
 * 越用越丰富,越用越准确。存储在 localStorage 中,跨会话持久化。
 *
 * 三层记忆:
 *   1. Patterns — "腰椎+神经根+机械压迫 → 最常选神经脱敏+拉伸"
 *   2. Outcomes — "神经脱敏+VOR+呼吸 → 75% 显效/有效"
 *   3. Personal — "治疗师 A 最常用这 5 个干预,诊断习惯写 C5-C6"
 *   4. Timeline — 每个操作的审计时间线
 */

export interface ClinicalPattern {
  /** 模式 key: diagnosisLevels:mechanisms:regions 的 hash */
  key: string;
  /** 可读描述 */
  label: string;
  /** 出现次数 */
  occurrences: number;
  /** 该模式下最常用的诊断 levels */
  topLevels: Array<{ level: string; count: number }>;
  /** 该模式下最常用的干预 */
  topInterventions: Array<{ interventionId: string; count: number }>;
  /** 最近一次匹配时间 */
  lastSeen: Date;
}

export interface OutcomeRecord {
  /** treatmentPlanId */
  planId: string;
  /** 诊断模式 key */
  patternKey: string;
  /** 使用的干预 */
  interventionIds: string[];
  /** 疗效判定 */
  outcome: "显效" | "有效" | "进步" | "无效" | "恶化";
  /** 复评节点 */
  node: "立即" | "短期" | "长期";
  /** 记录时间 */
  recordedAt: Date;
}

export interface PersonalProfile {
  /** 最常用的 10 个干预(干预ID→次数) */
  topInterventions: Array<{ interventionId: string; count: number }>;
  /** 诊断写习惯(level→次数) */
  preferredDiagnosisLevels: Array<{ level: string; count: number }>;
  /** 最近 5 个 SOAP 模板 */
  recentSoapNotes: string[];
  /** 常用 SMART 目标模板 */
  topGoalTemplates: Array<{ templateId: string; count: number }>;
  /** 总操作次数 */
  totalActions: number;
}

export interface TimelineEntry {
  id: string;
  timestamp: Date;
  action: string;          // "create_patient" | "create_encounter" | "complete_exam" | "create_diagnosis" | "create_treatment" | "close_encounter" | "save_soap"
  detail: string;          // 可读描述
  entityId?: string;       // 关联实体 ID
  patientId?: string;
  therapistId?: string;
}

const MEMORY_KEY = "anrm_agent_memory";

interface AgentMemoryData {
  patterns: ClinicalPattern[];
  outcomes: OutcomeRecord[];
  profile: PersonalProfile;
  timeline: TimelineEntry[];
  version: number;
}

function emptyMemory(): AgentMemoryData {
  return {
    patterns: [],
    outcomes: [],
    profile: {
      topInterventions: [],
      preferredDiagnosisLevels: [],
      recentSoapNotes: [],
      topGoalTemplates: [],
      totalActions: 0,
    },
    timeline: [],
    version: 1,
  };
}

export function loadMemory(): AgentMemoryData {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as AgentMemoryData;
    // 还原日期
    for (const p of parsed.patterns) p.lastSeen = new Date(p.lastSeen);
    for (const o of parsed.outcomes) o.recordedAt = new Date(o.recordedAt);
    for (const t of parsed.timeline) t.timestamp = new Date(t.timestamp);
    return parsed;
  } catch {
    return emptyMemory();
  }
}

let memory = loadMemory();

function persist() {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch { /* storage full — silent fail */ }
}

/** 生成模式 key */
export function patternKey(levels: string[], mechanisms: string[], regionSummary: string): string {
  return `${levels.slice(0,2).join("/")}+${mechanisms.slice(0,2).join("/")}+${regionSummary.slice(0,30)}`;
}

/** 智能诊断排序:按模式匹配度排序,最匹配的排前面 */
export function rankDiagnosisByHistory(
  candidateLevels: string[],
  currentRegions: string,
  currentMechanismHints: string[],
): string[] {
  const scored = candidateLevels.map((level) => {
    let score = 0;
    for (const p of memory.patterns) {
      if (p.label.includes(level) && p.label.includes(currentRegions.slice(0, 10))) score += p.occurrences * 2;
      for (const m of currentMechanismHints) {
        if (p.label.includes(m)) score += p.occurrences;
      }
      for (const tl of p.topLevels) {
        if (tl.level === level) score += tl.count;
      }
    }
    return { level, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).map((s) => s.level);
}

/** 记录诊断模式 */
export function recordDiagnosis(
  levels: string[],
  mechanisms: string[],
  regionSummary: string,
  interventions: string[],
): void {
  if (levels.length === 0 || interventions.length === 0) return;
  const key = patternKey(levels, mechanisms, regionSummary);
  const existing = memory.patterns.find((p) => p.key === key);

  if (existing) {
    existing.occurrences++;
    existing.lastSeen = new Date();
    // 更新 topLevels
    for (const l of levels) {
      const found = existing.topLevels.find((t) => t.level === l);
      if (found) found.count++;
      else existing.topLevels.push({ level: l, count: 1 });
    }
    // 更新 topInterventions
    for (const id of interventions) {
      const found = existing.topInterventions.find((t) => t.interventionId === id);
      if (found) found.count++;
      else existing.topInterventions.push({ interventionId: id, count: 1 });
    }
    existing.topLevels.sort((a, b) => b.count - a.count);
    existing.topInterventions.sort((a, b) => b.count - a.count);
  } else {
    memory.patterns.push({
      key,
      label: [regionSummary, ...levels, ...mechanisms].filter(Boolean).join(" · "),
      occurrences: 1,
      topLevels: levels.map((l) => ({ level: l, count: 1 })),
      topInterventions: interventions.map((id) => ({ interventionId: id, count: 1 })),
      lastSeen: new Date(),
    });
  }
  persist();
}

/** 记录疗效复评 */
export function recordOutcome(
  planId: string,
  patternKey: string,
  interventionIds: string[],
  outcome: OutcomeRecord["outcome"],
  node: OutcomeRecord["node"],
): void {
  memory.outcomes.push({
    planId, patternKey, interventionIds, outcome, node,
    recordedAt: new Date(),
  });
  // 只保留最近 200 条
  if (memory.outcomes.length > 200) {
    memory.outcomes = memory.outcomes.slice(-200);
  }
  persist();
}

/** 查询某干预的有效率 */
export function getInterventionEffectiveness(interventionId: string): {
  total: number;
  effective: number;
  rate: number;
} {
  const relevant = memory.outcomes.filter((o) => o.interventionIds.includes(interventionId));
  const total = relevant.length;
  const effective = relevant.filter((o) => o.outcome === "显效" || o.outcome === "有效").length;
  return { total, effective, rate: total > 0 ? effective / total : 0 };
}

/** 更新个人偏好 */
export function recordPersonalAction(
  action: string,
  detail: string,
  opts?: {
    interventionId?: string;
    diagnosisLevels?: string[];
    entityId?: string;
    patientId?: string;
    soapNote?: string;
    goalTemplateId?: string;
    therapistId?: string;
  },
): void {
  memory.profile.totalActions++;
  if (opts?.interventionId) {
    const found = memory.profile.topInterventions.find((t) => t.interventionId === opts.interventionId);
    if (found) found.count++;
    else memory.profile.topInterventions.push({ interventionId: opts.interventionId!, count: 1 });
    memory.profile.topInterventions.sort((a, b) => b.count - a.count);
    memory.profile.topInterventions = memory.profile.topInterventions.slice(0, 15);
  }
  if (opts?.diagnosisLevels) {
    for (const l of opts.diagnosisLevels) {
      const found = memory.profile.preferredDiagnosisLevels.find((t) => t.level === l);
      if (found) found.count++;
      else memory.profile.preferredDiagnosisLevels.push({ level: l, count: 1 });
    }
    memory.profile.preferredDiagnosisLevels.sort((a, b) => b.count - a.count);
  }
  if (opts?.soapNote) {
    memory.profile.recentSoapNotes = [opts.soapNote, ...memory.profile.recentSoapNotes].slice(0, 5);
  }
  if (opts?.goalTemplateId) {
    const found = memory.profile.topGoalTemplates.find((t) => t.templateId === opts.goalTemplateId);
    if (found) found.count++;
    else memory.profile.topGoalTemplates.push({ templateId: opts.goalTemplateId!, count: 1 });
    memory.profile.topGoalTemplates.sort((a, b) => b.count - a.count);
  }

  memory.timeline.push({
    id: crypto.randomUUID(),
    timestamp: new Date(),
    action,
    detail,
    entityId: opts?.entityId,
    patientId: opts?.patientId,
    therapistId: opts?.therapistId,
  });
  // Timeline 只保留最近 500 条
  if (memory.timeline.length > 500) {
    memory.timeline = memory.timeline.slice(-500);
  }

  persist();
}

/** 获取统计学摘要 */
export function getAgentStats() {
  return {
    totalPatterns: memory.patterns.length,
    totalOutcomes: memory.outcomes.length,
    totalActions: memory.profile.totalActions,
    topInterventions: memory.profile.topInterventions.slice(0, 5),
    recentPatterns: [...memory.patterns]
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, 5),
    effectiveRate: memory.outcomes.length > 0
      ? (
          memory.outcomes.filter((o) => o.outcome === "显效" || o.outcome === "有效").length /
          memory.outcomes.length
        ).toFixed(1)
      : "—",
    timeline: memory.timeline.slice(-20).reverse(),
  };
}

/* P2: 查体频率追踪 */
export function recordExamUsage(examItemIds: string[]) {
  try {
    const key = "anrm_exam_freq";
    const raw = localStorage.getItem(key);
    const freq: Record<string, number> = raw ? JSON.parse(raw) : {};
    for (const id of examItemIds) {
      freq[id] = (freq[id] ?? 0) + 1;
    }
    localStorage.setItem(key, JSON.stringify(freq));
  } catch { /* silent */ }
}

export function getExamFrequency(): Record<string, number> {
  try {
    const raw = localStorage.getItem("anrm_exam_freq");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** P3: 记录客户体重/VAS 趋势 */
export function recordVasHistory(patientId: string, vas: number) {
  try {
    const key = "anrm_vas_history";
    const raw = localStorage.getItem(key);
    const data: Record<string, Array<{ date: string; vas: number }>> = raw ? JSON.parse(raw) : {};
    if (!data[patientId]) data[patientId] = [];
    data[patientId].push({ date: new Date().toISOString(), vas });
    // 只保留最近 50 条/每人
    for (const pid of Object.keys(data)) {
      if (data[pid].length > 50) data[pid] = data[pid].slice(-50);
    }
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* silent */ }
}

export function getVasHistory(patientId: string): Array<{ date: string; vas: number }> {
  try {
    const raw = localStorage.getItem("anrm_vas_history");
    const data: Record<string, Array<{ date: string; vas: number }>> = raw ? JSON.parse(raw) : {};
    return data[patientId] ?? [];
  } catch { return []; }
}

/** 记录上次就诊中做了哪些查体,供"待补"检测 */
export function recordLastExam(encounterId: string, examItemIds: string[]) {
  try {
    const key = "anrm_last_exam";
    const raw = localStorage.getItem(key);
    const data: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    data[encounterId] = examItemIds.slice(0, 30);
    // 只保留最近 50 条就诊
    const keys = Object.keys(data).slice(-50);
    const trimmed: Record<string, string[]> = {};
    for (const k of keys) trimmed[k] = data[k];
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* silent */ }
}
