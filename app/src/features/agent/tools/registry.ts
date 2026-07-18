/**
 * 工具注册中心 — 把所有工具装成一张表,LLM 用 name 调。
 */
import type { AgentTool } from "./schemas";
import { searchPatientsTool, getPatientTool, getPatientTimelineTool } from "./patient-tools";
import {
  getEncounterTool,
  listRecentEncountersTool,
  getLatestExamTool,
  getDiagnosisTool,
  getTreatmentPlansTool,
} from "./clinical-tools";
import { searchAcrossRecordsTool } from "./search-tools";
import {
  webSearchTool,
  webFetchTool,
  calculateTool,
  getCurrentTimeTool,
  searchPubmedTool,
  installSkillTool,
  transcribeAudioTool,
} from "./external-tools";

export const agentTools: AgentTool[] = [
  // 内部病历工具
  searchPatientsTool,
  getPatientTool,
  getPatientTimelineTool,
  getEncounterTool,
  listRecentEncountersTool,
  getLatestExamTool,
  getDiagnosisTool,
  getTreatmentPlansTool,
  searchAcrossRecordsTool,
  // 外部联通工具
  webSearchTool,
  webFetchTool,
  calculateTool,
  getCurrentTimeTool,
  searchPubmedTool,
  // 能力扩展工具
  installSkillTool,
  transcribeAudioTool,
];

/** name → tool 字典,执行时按名查找 */
const toolMap = new Map(agentTools.map(t => [t.name, t]));
export function getTool(name: string): AgentTool | undefined {
  return toolMap.get(name);
}
