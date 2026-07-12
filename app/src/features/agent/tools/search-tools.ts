/**
 * 聚合搜索工具 — 跨客户/就诊/诊断/计划全文检索。
 */
import { z } from "zod";
import type { AgentTool } from "./schemas";
import { patientRepository } from "../../patients/patient.repository";
import { encounterRepository } from "../../encounters/encounter.repository";
import { diagnosisRepository } from "../../diagnosis/diagnosis.repository";
import { treatmentPlanRepository } from "../../treatment/treatment.repository";
import { INTERVENTIONS_CATALOG } from "../../treatment/interventions-catalog";
import { regionLabel } from "../../../components/bodymap/regions";

const searchAllSchema = z.object({
  query: z.string().describe("任意关键词:诊断名/干预名/症状区/机制"),
  scope: z.enum(["all", "diagnosis", "intervention", "region"]).default("all"),
  limit: z.number().int().min(1).max(50).default(15),
});

export const searchAcrossRecordsTool: AgentTool<typeof searchAllSchema> = {
  name: "search_across_records",
  description: "跨所有记录全文检索:诊断节段/机制/干预名/症状区/客户姓名。",
  inputSchema: searchAllSchema,
  execute: async ({ query, scope, limit }) => {
    const q = query.toLowerCase().trim();
    if (!q) return JSON.stringify({ error: "query 不能为空" });
    const hits: Array<Record<string, unknown>> = [];

    if (scope === "all" || scope === "diagnosis") {
      const dxs = await diagnosisRepository.findAll();
      for (const d of dxs) {
        const blob = [d.levels?.join(" "), d.mechanisms?.join(" "), d.side, d.segments?.join(" "), d.nerves?.join(" "), d.cutaneousNerveIds?.join(" "), d.reasoning].filter(Boolean).join(" ").toLowerCase();
        if (blob.includes(q)) {
          hits.push({ type: "diagnosis", encounterId: d.encounterId, levels: d.levels, mechanisms: d.mechanisms, reasoning: d.reasoning });
        }
      }
    }

    if (scope === "all" || scope === "intervention") {
      const matchedIds = INTERVENTIONS_CATALOG
        .filter(d => d.name.toLowerCase().includes(q) || d.id.includes(q) || (d.indications ?? "").toLowerCase().includes(q))
        .map(d => d.id);
      if (matchedIds.length > 0) {
        const plans = await treatmentPlanRepository.findAll();
        for (const p of plans) {
          if (p.interventionIds.some(id => matchedIds.includes(id))) {
            const matched = p.interventionIds.filter(id => matchedIds.includes(id)).map(id => INTERVENTIONS_CATALOG.find(d => d.id === id)?.name ?? id);
            hits.push({ type: "treatment_plan", encounterId: p.encounterId, phase: p.phase, matchedInterventions: matched });
          }
        }
      }
    }

    if (scope === "all" || scope === "region") {
      const encs = await encounterRepository.findAll();
      for (const e of encs) {
        const matched = e.chiefComplaint.regions.filter(r => regionLabel(r).toLowerCase().includes(q));
        if (matched.length > 0) {
          const pt = await patientRepository.findById(e.patientId);
          hits.push({ type: "encounter", encounterId: e.id, patientId: e.patientId, patientName: pt?.name, date: e.encounterDate.toISOString().slice(0, 10), matchedRegions: matched.map(regionLabel) });
        }
      }
    }

    return JSON.stringify(hits.slice(0, limit), null, 2);
  },
};