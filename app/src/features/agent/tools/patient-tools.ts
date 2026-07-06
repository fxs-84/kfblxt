/**
 * 患者查询工具集 — Agent 调用入口,封装 patient/encounter/diagnosis 仓储。
 */
import { z } from "zod";
import type { AgentTool } from "./schemas";
import { patientRepository } from "../../patients/patient.repository";
import { encounterRepository } from "../../encounters/encounter.repository";
import { diagnosisRepository } from "../../diagnosis/diagnosis.repository";
import { examSessionRepository } from "../../exam/exam.repository";
import { treatmentPlanRepository } from "../../treatment/treatment.repository";
import { attachmentRepository } from "../../attachments/attachment.repository";
import { INTERVENTIONS_CATALOG } from "../../treatment/interventions-catalog";
import { regionLabel } from "../../../components/bodymap/regions";

/* ---------- search_patients ---------- */
const searchPatientsSchema = z.object({
  query: z.string().describe("姓名、症状区域关键词、主诉片段、诊断名等"),
  limit: z.number().int().min(1).max(50).default(10),
});

export const searchPatientsTool: AgentTool<typeof searchPatientsSchema> = {
  name: "search_patients",
  description: "按关键词搜索患者(姓名/主诉/诊断),返回简要卡片列表。",
  inputSchema: searchPatientsSchema,
  execute: async ({ query, limit }) => {
    const patients = await patientRepository.findAll();
    const encounters = await encounterRepository.findAll();
    const diagnoses = await diagnosisRepository.findAll();

    const q = query.toLowerCase().trim();
    const age = (b: Date) => new Date().getFullYear() - new Date(b).getFullYear();
    if (!q) return JSON.stringify(patients.slice(0, limit).map(p => ({ id: p.id, name: p.name, sex: p.sex, age: p.birthDate ? age(p.birthDate) : null })), null, 2);

    const scored: Array<{ p: typeof patients[0]; score: number }> = [];
    for (const p of patients) {
      let score = 0;
      if (p.name.toLowerCase().includes(q)) score += 10;
      const encs = encounters.filter(e => e.patientId === p.id);
      for (const e of encs) {
        if (e.chiefComplaint?.regions?.some(r => regionLabel(r).toLowerCase().includes(q))) score += 3;
        if (e.chiefComplaint?.nature?.some(n => n.toLowerCase().includes(q))) score += 3;
        const dxs = diagnoses.filter(d => d.encounterId === e.id);
        for (const d of dxs) {
          if ((d.levels ?? []).some(l => l.toLowerCase().includes(q))) score += 4;
          if ((d.mechanisms ?? []).some(m => m.toLowerCase().includes(q))) score += 2;
        }
      }
      if (score > 0) scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit).map(({ p, score }) => {
      const encs = encounters.filter(e => e.patientId === p.id);
      const lastEnc = encs.sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime())[0];
      return {
        id: p.id,
        name: p.name,
        sex: p.sex,
        age: p.birthDate ? age(p.birthDate) : null,
        lastVisit: lastEnc ? lastEnc.encounterDate.toISOString().slice(0, 10) : null,
        chiefComplaint: lastEnc?.chiefComplaint?.nature?.join("、") ?? null,
        score,
      };
    });

    return JSON.stringify(top, null, 2);
  },
};

/* ---------- get_patient ---------- */
const getPatientSchema = z.object({
  patientId: z.string().describe("患者 UUID"),
});

export const getPatientTool: AgentTool<typeof getPatientSchema> = {
  name: "get_patient",
  description: "读取患者完整档案(基本信息 + 主诉 + 备注)。",
  inputSchema: getPatientSchema,
  execute: async ({ patientId }) => {
    const p = await patientRepository.findById(patientId);
    if (!p) return JSON.stringify({ error: "患者不存在" });
    const age = (b: Date) => new Date().getFullYear() - new Date(b).getFullYear();
    return JSON.stringify({
      id: p.id,
      name: p.name,
      sex: p.sex,
      age: p.birthDate ? age(p.birthDate) : null,
      birthDate: p.birthDate?.toISOString().slice(0, 10),
      phone: p.phone,
      dominantHand: p.dominantHand,
      medicalRecordNo: p.medicalRecordNo,
      createdAt: p.createdAt?.toISOString().slice(0, 10),
    }, null, 2);
  },
};

/* ---------- get_patient_timeline ---------- */
const getPatientTimelineSchema = z.object({
  patientId: z.string(),
  includeAttachments: z.boolean().default(false).describe("是否包含附件列表(默认 false,加速)"),
});

export const getPatientTimelineTool: AgentTool<typeof getPatientTimelineSchema> = {
  name: "get_patient_timeline",
  description: "拉取某患者的完整就诊时间线:就诊 → 查体 → 诊断 → 治疗计划 → 备注。",
  inputSchema: getPatientTimelineSchema,
  execute: async ({ patientId, includeAttachments }) => {
    const encounters = (await encounterRepository.findAll())
      .filter(e => e.patientId === patientId)
      .sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime());

    const timeline: unknown[] = [];
    for (const e of encounters) {
      const exams = (await examSessionRepository.findAll()).filter(s => s.encounterId === e.id);
      const diagnoses = (await diagnosisRepository.findAll()).filter(d => d.encounterId === e.id);
      const plans = (await treatmentPlanRepository.findAll()).filter(p => p.encounterId === e.id);

      const diagnosisSummary = diagnoses.map(d => ({
        levels: d.levels,
        mechanisms: d.mechanisms,
        side: d.side,
        reasoning: d.reasoning,
      }));

      const planSummary = plans.map(p => ({
        phase: p.phase,
        frequency: p.frequency,
        duration: p.duration,
        interventions: p.interventionIds.map(id => {
          const def = INTERVENTIONS_CATALOG.find(d => d.id === id);
          return def?.name ?? id;
        }),
        goals: p.goals,
      }));

      const examSummary = exams.map(s => {
        const items = Object.entries(s.results).map(([id, r]) => {
          const def = s.results[id];
          return { examId: id, left: (r as { left?: unknown }).left, right: (r as { right?: unknown }).right, value: (r as { value?: unknown }).value };
        });
        return { id: s.id, itemCount: items.length, items };
      });

      timeline.push({
        encounterId: e.id,
        date: e.encounterDate.toISOString().slice(0, 10),
        visitType: e.visitType,
        status: e.status,
        chiefComplaint: e.chiefComplaint,
        exams: examSummary,
        diagnoses: diagnosisSummary,
        plans: planSummary,
      });
    }

    const result: { patientId: string; encounters: unknown[]; attachments?: unknown[] } = {
      patientId,
      encounters: timeline,
    };

    if (includeAttachments) {
      const allEncs = new Set(encounters.map(e => e.id));
      const attachments = (await attachmentRepository.findAll()).filter(a => allEncs.has(a.encounterId));
      result.attachments = attachments.map(a => ({
        id: a.id,
        encounterId: a.encounterId,
        category: a.category,
        fileName: a.fileName,
        timeline: a.timeline,
      }));
    }

    return JSON.stringify(result, null, 2);
  },
};