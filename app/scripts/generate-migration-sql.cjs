#!/usr/bin/env node
/**
 * 根据 localStorage 导出 JSON 生成 Supabase 迁移 SQL。
 *
 * 用法:
 *   node scripts/generate-migration-sql.cjs local_storage_export.json <org_id> <user_id> > migration.sql
 */

const fs = require("fs");
const path = require("path");

const [, , file, orgId, userId] = process.argv;

if (!file || !orgId || !userId) {
  console.error("用法: node scripts/generate-migration-sql.cjs <json文件> <org_id> <user_id>");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(file), "utf-8");
const data = JSON.parse(raw);

function get(key) {
  return Array.isArray(data[key]) ? data[key] : [];
}

function escape(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (Array.isArray(value)) return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeSex(value) {
  const map = { 男: "male", 女: "female", 其他: "other", other: "other", male: "male", female: "female" };
  return map[value] ?? "other";
}

function normalizeHand(value) {
  const map = { 左: "left", 右: "right", 双: "ambidextrous", left: "left", right: "right", ambidextrous: "ambidextrous" };
  return map[value] ?? null;
}

function normalizeVisitType(value) {
  return value === "复诊" ? "复诊" : "初诊";
}

function normalizeEncounterStatus(value) {
  return value === "已结束" ? "已结束" : "进行中";
}

function normalizeBillingType(value) {
  return ["充值", "消费", "退费"].includes(value) ? value : "消费";
}

function normalizeAttachmentCategory(value) {
  return ["检查报告", "疗效对比"].includes(value) ? value : "检查报告";
}

function normalizeAttachmentTimeline(value) {
  return ["治疗前", "治疗中", "治疗后"].includes(value) ? value : null;
}

function normalizeFollowupStatus(value) {
  return ["待复诊", "已完成", "失约"].includes(value) ? value : "待复诊";
}

function normalizeHorizon(value) {
  return ["立即", "短期", "长期"].includes(value) ? value : "立即";
}

function normalizePhase(value) {
  return ["急性期", "恢复期", "巩固期", "维持期"].includes(value) ? value : "急性期";
}

function generateInsert(table, columns, rows) {
  if (rows.length === 0) return "";
  const colList = columns.join(", ");
  const valueLines = rows
    .map((row) => `  (${columns.map((c) => escape(row[c])).join(", ")})`)
    .join(",\n");
  return `insert into public.${table} (${colList})\nvalues\n${valueLines}\non conflict do nothing;\n`;
}

const patientIds = new Set();
const encounterIds = new Set();
const lines = [];

lines.push("-- 手动迁移 SQL");
lines.push(`-- org_id: ${orgId}`);
lines.push(`-- created_by: ${userId}`);
lines.push(`-- 说明:本 SQL 由 scripts/generate-migration-sql.cjs 生成,基于 /tmp/test_export.json。`);
lines.push(`-- 全部 INSERT 使用 on conflict do nothing,可重复执行。\n`);

// 1. patients
{
  const rows = get("anrm_patients")
    .filter((p) => p?.id && p.name)
    .map((p) => {
      patientIds.add(p.id);
      return {
        id: p.id,
        org_id: orgId,
        medical_record_no: p.medicalRecordNo || `MIGRATED-${String(p.id).slice(0, 8)}`,
        name: p.name,
        sex: normalizeSex(p.sex),
        birth_date: toDate(p.birthDate),
        phone: p.phone || null,
        dominant_hand: normalizeHand(p.dominantHand),
        created_at: toTimestamp(p.createdAt),
        created_by: userId,
      };
    });
  lines.push(generateInsert("patients", ["id", "org_id", "medical_record_no", "name", "sex", "birth_date", "phone", "dominant_hand", "created_at", "created_by"], rows));
}

// 2. encounters
{
  const rows = get("anrm_encounters")
    .filter((e) => e?.id && patientIds.has(e.patientId))
    .map((e) => {
      encounterIds.add(e.id);
      return {
        id: e.id,
        org_id: orgId,
        patient_id: e.patientId,
        encounter_date: toTimestamp(e.encounterDate),
        visit_type: normalizeVisitType(e.visitType),
        status: normalizeEncounterStatus(e.status),
        amount: typeof e.amount === "number" ? e.amount : 0,
        chief_complaint: e.chiefComplaint || {},
        created_at: toTimestamp(e.createdAt),
        created_by: userId,
      };
    });
  lines.push(generateInsert("encounters", ["id", "org_id", "patient_id", "encounter_date", "visit_type", "status", "amount", "chief_complaint", "created_at", "created_by"], rows));
}

// 3. assessments
{
  const rows = get("anrm_assessments")
    .filter((a) => a?.id && patientIds.has(a.patientId) && (!a.encounterId || encounterIds.has(a.encounterId)))
    .map((a) => {
      const { id: _, orgId: __, patientId: ___, encounterId: ____, type, createdAt, ...payload } = a;
      return {
        id: a.id,
        org_id: orgId,
        patient_id: a.patientId,
        encounter_id: a.encounterId && a.encounterId !== "new" ? a.encounterId : null,
        type: a.type,
        payload,
        created_at: toTimestamp(a.createdAt),
        created_by: userId,
      };
    });
  lines.push(generateInsert("assessments", ["id", "org_id", "patient_id", "encounter_id", "type", "payload", "created_at", "created_by"], rows));
}

// 4. exam_sessions
{
  const rows = get("anrm_examSessions")
    .filter((s) => s?.id && patientIds.has(s.patientId) && encounterIds.has(s.encounterId))
    .map((s) => ({
      id: s.id,
      org_id: orgId,
      encounter_id: s.encounterId,
      patient_id: s.patientId,
      items: s.results || [],
      created_at: toTimestamp(s.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("exam_sessions", ["id", "org_id", "encounter_id", "patient_id", "items", "created_at", "created_by"], rows));
}

// 5. diagnoses
{
  const rows = get("anrm_diagnoses")
    .filter((d) => d?.id && encounterIds.has(d.encounterId) && (!d.patientId || patientIds.has(d.patientId)))
    .map((d) => ({
      id: d.id,
      org_id: orgId,
      encounter_id: d.encounterId,
      patient_id: d.patientId || null,
      neuro_levels: d.levels || [],
      spinal_segments: d.segments || [],
      nerve_trunks: d.nerves || [],
      cutaneous_nerves: d.cutaneousNerveIds || [],
      clinical_diagnoses: d.clinicalDiagnoses || [],
      mechanisms: d.mechanisms || [],
      rationale: d.reasoning || null,
      confidence: d.confidence ?? null,
      side: d.side || "left",
      created_at: toTimestamp(d.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("diagnoses", ["id", "org_id", "encounter_id", "patient_id", "neuro_levels", "spinal_segments", "nerve_trunks", "cutaneous_nerves", "clinical_diagnoses", "mechanisms", "rationale", "confidence", "side", "created_at", "created_by"], rows));
}

// 6. treatment_plans
{
  const rows = get("anrm_treatmentPlans")
    .filter((p) => p?.id && patientIds.has(p.patientId) && encounterIds.has(p.encounterId))
    .map((p) => ({
      id: p.id,
      org_id: orgId,
      encounter_id: p.encounterId,
      patient_id: p.patientId,
      phase: normalizePhase(p.phase),
      frequency: p.frequency || null,
      duration: p.duration || null,
      intervention_doses: p.interventionDoses || {},
      intervention_ids: p.interventionIds || [],
      goals: p.goals || [],
      boundary: p.boundary || null,
      notes: p.notes || null,
      created_at: toTimestamp(p.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("treatment_plans", ["id", "org_id", "encounter_id", "patient_id", "phase", "frequency", "duration", "intervention_doses", "intervention_ids", "goals", "boundary", "notes", "created_at", "created_by"], rows));
}

// 7. progress_notes
{
  const rows = get("anrm_progressNotes")
    .filter((n) => n?.id && patientIds.has(n.patientId) && encounterIds.has(n.encounterId))
    .map((n) => ({
      id: n.id,
      org_id: orgId,
      encounter_id: n.encounterId,
      patient_id: n.patientId,
      horizon: normalizeHorizon(n.horizon),
      subjective: n.subjective || null,
      objective: n.objective || null,
      assessment: n.assessment || null,
      plan: n.plan || null,
      vas_current: n.vasCurrent ?? null,
      created_at: toTimestamp(n.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("progress_notes", ["id", "org_id", "encounter_id", "patient_id", "horizon", "subjective", "objective", "assessment", "plan", "vas_current", "created_at", "created_by"], rows));
}

// 8. attachments
{
  const rows = get("anrm_attachments")
    .filter((a) => a?.id && patientIds.has(a.patientId) && encounterIds.has(a.encounterId))
    .map((a) => ({
      id: a.id,
      org_id: orgId,
      encounter_id: a.encounterId,
      patient_id: a.patientId,
      category: normalizeAttachmentCategory(a.category),
      file_name: a.fileName || "unknown",
      mime_type: a.mimeType || "application/octet-stream",
      data_url: a.dataUrl || "",
      size_bytes: a.sizeBytes || 0,
      note: a.note || null,
      timeline: normalizeAttachmentTimeline(a.timeline),
      comparison_group: a.comparisonGroup || null,
      created_at: toTimestamp(a.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("attachments", ["id", "org_id", "encounter_id", "patient_id", "category", "file_name", "mime_type", "data_url", "size_bytes", "note", "timeline", "comparison_group", "created_at", "created_by"], rows));
}

// 9. billing_records
{
  const rows = get("anrm_billing")
    .filter((b) => b?.id && patientIds.has(b.patientId) && (!b.encounterId || encounterIds.has(b.encounterId)))
    .map((b) => ({
      id: b.id,
      org_id: orgId,
      patient_id: b.patientId,
      type: normalizeBillingType(b.type),
      amount: typeof b.amount === "number" ? b.amount : 0,
      sessions: b.sessions ?? null,
      note: b.note || "",
      encounter_id: b.encounterId || null,
      created_at: toTimestamp(b.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("billing_records", ["id", "org_id", "patient_id", "type", "amount", "sessions", "note", "encounter_id", "created_at", "created_by"], rows));
}

// 10. followups
{
  const rows = get("anrm_followups")
    .filter((f) => f?.id && patientIds.has(f.patientId) && (!f.completedEncounterId || encounterIds.has(f.completedEncounterId)))
    .map((f) => ({
      id: f.id,
      org_id: orgId,
      patient_id: f.patientId,
      due_date: toTimestamp(f.dueDate),
      status: normalizeFollowupStatus(f.status),
      note: f.note || "",
      completed_encounter_id: f.completedEncounterId || null,
      created_at: toTimestamp(f.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("followups", ["id", "org_id", "patient_id", "due_date", "status", "note", "completed_encounter_id", "created_at", "created_by"], rows));
}

// 11. patient_memberships
{
  const rows = get("anrm_membership-memberships")
    .filter((m) => m?.patientId && patientIds.has(m.patientId))
    .map((m) => ({
      patient_id: m.patientId,
      org_id: orgId,
      tier: m.tier || "regular",
      points: m.points || 0,
      total_earned: m.totalEarned || 0,
      total_spent: m.totalSpent || 0,
      registered_at: toTimestamp(m.registeredAt),
      note: m.note || null,
      created_at: toTimestamp(m.createdAt || m.registeredAt),
      created_by: userId,
    }));
  lines.push(generateInsert("patient_memberships", ["patient_id", "org_id", "tier", "points", "total_earned", "total_spent", "registered_at", "note", "created_at", "created_by"], rows));
}

// 12. points_logs
{
  const rows = get("anrm_membership-logs")
    .filter((l) => l?.id && patientIds.has(l.patientId))
    .map((l) => ({
      id: l.id,
      org_id: orgId,
      patient_id: l.patientId,
      delta: l.delta || 0,
      balance_after: l.balanceAfter || 0,
      reason: l.reason || "",
      rule_id: l.ruleId || null,
      trigger_type: l.triggerType || null,
      ref_type: l.refType || null,
      ref_id: l.refId || null,
      operator_id: userId,
      created_at: toTimestamp(l.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("points_logs", ["id", "org_id", "patient_id", "delta", "balance_after", "reason", "rule_id", "trigger_type", "ref_type", "ref_id", "operator_id", "created_at", "created_by"], rows));
}

// 13. redemptions
{
  const rows = get("anrm_membership-redemptions")
    .filter((r) => r?.id && patientIds.has(r.patientId))
    .map((r) => ({
      id: r.id,
      org_id: orgId,
      patient_id: r.patientId,
      reward_id: r.rewardId,
      reward_name: r.rewardName || "未知商品",
      points_cost: r.pointsCost || 0,
      status: r.status || "pending",
      notes: r.notes || null,
      operator_id: userId,
      created_at: toTimestamp(r.createdAt),
      created_by: userId,
    }));
  lines.push(generateInsert("redemptions", ["id", "org_id", "patient_id", "reward_id", "reward_name", "points_cost", "status", "notes", "operator_id", "created_at", "created_by"], rows));
}

console.log(lines.filter(Boolean).join("\n"));
