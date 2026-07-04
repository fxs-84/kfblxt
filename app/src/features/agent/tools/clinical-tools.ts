/**
 * 临床数据查询工具集 — 单个 encounters/exams/diagnoses/plans 的精确查询。
 */
import { z } from "zod";
import type { AgentTool } from "./schemas";
import { encounterRepository } from "../../encounters/encounter.repository";
import { examSessionRepository, findLatestSession } from "../../exam/exam.repository";
import { diagnosisRepository } from "../../diagnosis/diagnosis.repository";
import { treatmentPlanRepository } from "../../treatment/treatment.repository";
import { EXAM_CATALOG } from "../../exam/exam-catalog";
import { INTERVENTIONS_CATALOG } from "../../treatment/interventions-catalog";
import { regionLabel } from "../../../components/bodymap/regions";

/* ---------- get_encounter ---------- */
const getEncounterSchema = z.object({
  encounterId: z.string(),
});

export const getEncounterTool: AgentTool<typeof getEncounterSchema> = {
  name: "get_encounter",
  description: "读取单次就诊的完整数据(主诉/查体/诊断/计划/附件元数据)。",
  inputSchema: getEncounterSchema,
  execute: async ({ encounterId }) => {
    const e = await encounterRepository.findById(encounterId);
    if (!e) return JSON.stringify({ error: "就诊不存在" });
    const exams = (await examSessionRepository.findAll()).filter(s => s.encounterId === encounterId);
    const diagnoses = (await diagnosisRepository.findAll()).filter(d => d.encounterId === encounterId);
    const plans = (await treatmentPlanRepository.findAll()).filter(p => p.encounterId === encounterId);

    return JSON.stringify({
      encounter: {
        id: e.id,
        date: e.encounterDate.toISOString().slice(0, 10),
        visitType: e.visitType,
        status: e.status,
        chiefComplaint: {
          regions: e.chiefComplaint.regions.map(regionLabel),
          nature: e.chiefComplaint.nature,
          vas: e.chiefComplaint.vas,
          durationText: e.chiefComplaint.durationText,
          distributionNote: e.chiefComplaint.distributionNote,
        },
      },
      exams: exams.map(s => {
        const items: Array<{ name: string; left?: unknown; right?: unknown; value?: unknown }> = [];
        for (const [examId, r] of Object.entries(s.results)) {
          const def = EXAM_CATALOG.find(d => d.id === examId);
          items.push({
            name: def?.name ?? examId,
            left: (r as { left?: unknown }).left,
            right: (r as { right?: unknown }).right,
            value: (r as { value?: unknown }).value,
          });
        }
        return { id: s.id, itemCount: items.length, items };
      }),
      diagnoses: diagnoses.map(d => ({
        levels: d.levels,
        mechanisms: d.mechanisms,
        side: d.side,
        segments: d.segments,
        nerves: d.nerves,
        cutaneousNerveIds: d.cutaneousNerveIds,
        reasoning: d.reasoning,
      })),
      plans: plans.map(p => ({
        phase: p.phase,
        frequency: p.frequency,
        duration: p.duration,
        interventions: p.interventionIds.map(id => {
          const def = INTERVENTIONS_CATALOG.find(d => d.id === id);
          return { id, name: def?.name ?? id };
        }),
        goals: p.goals,
      })),
    }, null, 2);
  },
};

/* ---------- list_recent_encounters ---------- */
const listRecentSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listRecentEncountersTool: AgentTool<typeof listRecentSchema> = {
  name: "list_recent_encounters",
  description: "拉取最近 N 天的就诊列表(摘要级别,不含完整查体)。",
  inputSchema: listRecentSchema,
  execute: async ({ days, limit }) => {
    const since = Date.now() - days * 86_400_000;
    const encounters = (await encounterRepository.findAll())
      .filter(e => e.encounterDate.getTime() >= since)
      .sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime())
      .slice(0, limit);

    return JSON.stringify(encounters.map(e => ({
      id: e.id,
      patientId: e.patientId,
      date: e.encounterDate.toISOString().slice(0, 10),
      visitType: e.visitType,
      status: e.status,
      chiefComplaint: e.chiefComplaint.regions.map(regionLabel).join("/") + " " + e.chiefComplaint.nature.join("/") + ` VAS${e.chiefComplaint.vas}`,
    })), null, 2);
  },
};

/* ---------- get_latest_exam ---------- */
const latestExamSchema = z.object({
  encounterId: z.string(),
});

export const getLatestExamTool: AgentTool<typeof latestExamSchema> = {
  name: "get_latest_exam",
  description: "读取某次就诊的最新一次查体记录。",
  inputSchema: latestExamSchema,
  execute: async ({ encounterId }) => {
    const session = await findLatestSession(encounterId);
    if (!session) return JSON.stringify({ error: "该就诊无查体记录" });
    const items = Object.entries(session.results).map(([id, r]) => {
      const def = EXAM_CATALOG.find(d => d.id === id);
      return { examId: id, name: def?.name ?? id, left: (r as { left?: unknown }).left, right: (r as { right?: unknown }).right, value: (r as { value?: unknown }).value };
    });
    return JSON.stringify({ id: session.id, createdAt: session.createdAt.toISOString(), items }, null, 2);
  },
};

/* ---------- get_diagnosis ---------- */
const getDiagnosisSchema = z.object({ encounterId: z.string() });

export const getDiagnosisTool: AgentTool<typeof getDiagnosisSchema> = {
  name: "get_diagnosis",
  description: "读取某次就诊的定位诊断结论。",
  inputSchema: getDiagnosisSchema,
  execute: async ({ encounterId }) => {
    const d = await diagnosisRepository.findAll().then(all => all.filter(x => x.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]);
    if (!d) return JSON.stringify({ error: "无诊断" });
    return JSON.stringify({
      levels: d.levels,
      mechanisms: d.mechanisms,
      side: d.side,
      segments: d.segments,
      nerves: d.nerves,
      cutaneousNerveIds: d.cutaneousNerveIds,
      reasoning: d.reasoning,
    }, null, 2);
  },
};

/* ---------- get_treatment_plans ---------- */
const getPlansSchema = z.object({ encounterId: z.string() });

export const getTreatmentPlansTool: AgentTool<typeof getPlansSchema> = {
  name: "get_treatment_plans",
  description: "读取某次就诊的所有治疗计划。",
  inputSchema: getPlansSchema,
  execute: async ({ encounterId }) => {
    const plans = (await treatmentPlanRepository.findAll()).filter(p => p.encounterId === encounterId);
    if (plans.length === 0) return JSON.stringify({ error: "无治疗计划" });
    return JSON.stringify(plans.map(p => ({
      phase: p.phase,
      frequency: p.frequency,
      duration: p.duration,
      interventions: p.interventionIds.map(id => {
        const def = INTERVENTIONS_CATALOG.find(d => d.id === id);
        return { id, name: def?.name ?? id };
      }),
      goals: p.goals,
      boundaries: p.boundaries,
    })), null, 2);
  },
};