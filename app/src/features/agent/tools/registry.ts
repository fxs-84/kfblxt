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

export const agentTools: AgentTool[] = [
  searchPatientsTool,
  getPatientTool,
  getPatientTimelineTool,
  getEncounterTool,
  listRecentEncountersTool,
  getLatestExamTool,
  getDiagnosisTool,
  getTreatmentPlansTool,
  searchAcrossRecordsTool,
];

/** name → tool 字典,执行时按名查找 */
const toolMap = new Map(agentTools.map(t => [t.name, t]));
export function getTool(name: string): AgentTool | undefined {
  return toolMap.get(name);
}

/** 转成 Anthropic Messages API 的 tools 字段 */
export function toolsToAnthropicSchema() {
  return agentTools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema),
  }));
}

/** Zod schema → JSON Schema 简化版(覆盖常见类型) */
function zodToJsonSchema(schema: { _def?: { typeName?: string; schema?: unknown; innerType?: unknown; values?: unknown; description?: string } } & { description?: string }): Record<string, unknown> {
  const desc = schema.description;
  const out: Record<string, unknown> = { type: "object" };
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  const def = schema._def;
  if (!def || def.typeName !== "ZodEffects" && def.typeName !== "ZodObject") return out;

  const inner = (def.typeName === "ZodEffects" ? def.schema : def) as { shape?: () => Record<string, unknown> };
  if (typeof inner.shape !== "function") return out;
  const shape = inner.shape();

  for (const [key, value] of Object.entries(shape)) {
    const field = zodFieldToJsonSchema(value as Parameters<typeof zodFieldToJsonSchema>[0]);
    props[key] = field.schema;
    if (field.required) required.push(key);
    if (desc) Object.assign(out, { description: desc });
  }

  if (Object.keys(props).length > 0) out.properties = props;
  if (required.length > 0) out.required = required;
  if (desc) out.description = desc;

  return out;
}

function zodFieldToJsonSchema(field: { _def?: { typeName?: string; innerType?: unknown; values?: unknown; defaultValue?: () => unknown; description?: string }; description?: string }): { schema: Record<string, unknown>; required: boolean } {
  const def = field._def;
  if (!def) return { schema: {}, required: false };
  const desc = def.description;

  let typeName = def.typeName;
  let inner: unknown = field;
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    const r = zodFieldToJsonSchema(def.innerType as Parameters<typeof zodFieldToJsonSchema>[0]);
    if (typeName === "ZodDefault" && def.defaultValue) {
      r.schema.default = def.defaultValue();
    }
    return r;
  }

  if (typeName === "ZodString") {
    const schema: Record<string, unknown> = { type: "string" };
    if (desc) schema.description = desc;
    return { schema, required: true };
  }
  if (typeName === "ZodNumber") {
    const schema: Record<string, unknown> = { type: "number" };
    if (desc) schema.description = desc;
    return { schema, required: true };
  }
  if (typeName === "ZodBoolean") {
    const schema: Record<string, unknown> = { type: "boolean" };
    if (desc) schema.description = desc;
    return { schema, required: true };
  }
  if (typeName === "ZodEnum") {
    const schema: Record<string, unknown> = { type: "string", enum: def.values };
    if (desc) schema.description = desc;
    return { schema, required: true };
  }

  // fallback
  const schema: Record<string, unknown> = {};
  if (desc) schema.description = desc;
  return { schema, required: true };
}