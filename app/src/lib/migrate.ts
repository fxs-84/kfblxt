/**
 * 本地→云端一次性全量迁移。
 *
 * 供 SetupWizard 或 /migrate 页面调用。按依赖顺序把 localStorage 里的
 * 患者、就诊、量表、查体、诊断、治疗计划、疗效复评、附件、账单、复诊、
 * 会员数据写入当前机构的 Supabase。
 *
 * 设计原则:
 * - 幂等:按 id 去重,已存在则跳过,可反复执行。
 * - 失败隔离:单条/单模块失败记 error,不中断后续模块。
 * - org/created_by 统一用当前 session,覆盖旧 MOCK_SESSION 数据。
 */
import { getSupabase, hasSupabaseConfig } from "./supabase";
import { getSession, type Session } from "./session";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { patientSchema } from "../features/patients/patient.schema";

const BATCH_SIZE = 100;
const MIGRATABLE_ROLES = new Set(["admin", "physician"]);

const patientMigrationSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().optional(),
  medicalRecordNo: z.string().max(64).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(80),
  sex: z.string().optional(),
  birthDate: z.coerce.date().optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  dominantHand: z.string().optional().or(z.literal("")),
  createdAt: z.coerce.date(),
});

function canMigrate(role: string): boolean {
  return MIGRATABLE_ROLES.has(role);
}

function getRoleMismatchMessage(role: string): string {
  return `当前角色 ${role} 无权执行数据迁移,需 admin 或 physician(与数据库写入策略一致)`;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

import { patientRepository } from "../features/patients/patient.repository";
import { encounterRepository } from "../features/encounters/encounter.repository";
import { assessmentRepository } from "../features/assessments/assessment.repository";
import { examSessionRepository } from "../features/exam/exam.repository";
import { diagnosisRepository } from "../features/diagnosis/diagnosis.repository";
import { treatmentPlanRepository, progressNoteRepository } from "../features/treatment/treatment.repository";
import { attachmentRepository } from "../features/attachments/attachment.repository";
import { billingRepository } from "../features/billing/billing.repository";
import { followupRepository } from "../features/followup/followup.repository";
import {
  localFindAllMemberships,
  localFindAllLogs,
  localFindAllRedemptions,
} from "../features/membership/rule.repository";

import { toRow as encounterToRow } from "../features/encounters/encounter-supabase";
import { toRow as assessmentToRow } from "../features/assessments/assessment-supabase";
import { toRow as examToRow } from "../features/exam/exam-supabase";
import { toRow as diagnosisToRow } from "../features/diagnosis/diagnosis-supabase";
import { planToRow, noteToRow } from "../features/treatment/treatment-supabase";
import { toRow as attachmentToRow } from "../features/attachments/attachment-supabase";
import { toRow as billingToRow } from "../features/billing/billing-supabase";
import { toRow as followupToRow } from "../features/followup/followup-supabase";
import { membershipToRow, logToRow, redemptionToRow } from "../features/membership/membership-supabase";

export interface ModuleReport {
  module: string;
  total: number;
  inserted: number;
  skipped: number;
  filtered: number;
  errors: string[];
}

export interface MigrationReport {
  ok: boolean;
  modules: ModuleReport[];
  startedAt: string;
  finishedAt?: string;
}

export interface MigrationProgress {
  phase: string;
  module?: string;
  total?: number;
  completed?: number;
}

type ProgressHandler = (p: MigrationProgress) => void;

type RowBuilder<T> = (record: T) => Record<string, unknown>;

function currentOrg(): string {
  return getSession().orgId;
}

async function fetchCloudIds(table: string, keyColumn: string): Promise<Set<string>> {
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from(table).select(keyColumn).eq("org_id", currentOrg());
  if (error) throw new Error(`读取 ${table} 失败: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r[keyColumn])));
}

async function insertBatch(
  table: string,
  rows: Record<string, unknown>[],
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  const supabase = getSupabase()!;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      errors.push(`${table} 第 ${i + 1}-${i + chunk.length} 批: ${error.message}`);
    } else {
      inserted += chunk.length;
    }
  }
  return { inserted, errors };
}

type FilterResult = boolean | { ok: boolean; reason?: string };

function evaluateFilter<T>(
  filter: (r: T) => FilterResult,
  raw: T,
): { passed: boolean; reason?: string } {
  const result = filter(raw);
  if (typeof result === "boolean") return { passed: result };
  return { passed: result.ok, reason: result.reason };
}

function buildRowsForInsert<T>(
  name: string,
  records: T[],
  cloudIds: Set<string>,
  buildRow: RowBuilder<T>,
  opts?: {
    keyColumn?: string;
    filter?: (r: T) => FilterResult;
    transform?: (r: T) => T;
  },
): { rows: Record<string, unknown>[]; report: ModuleReport } {
  const report: ModuleReport = { module: name, total: 0, inserted: 0, skipped: 0, filtered: 0, errors: [] };
  const keyColumn = opts?.keyColumn ?? "id";
  const rows: Record<string, unknown>[] = [];

  for (const raw of records) {
    if (opts?.filter) {
      const { passed, reason } = evaluateFilter(opts.filter, raw);
      if (!passed) {
        report.filtered++;
        if (reason) report.errors.push(`[filtered] ${name}: ${reason}`);
        continue;
      }
    }
    const rec = opts?.transform ? opts.transform(raw) : raw;
    const recWithOrg = { ...(rec as unknown as Record<string, unknown>), orgId: currentOrg() };
    const id = String(recWithOrg[keyColumn]);
    report.total++;
    if (cloudIds.has(id)) {
      report.skipped++;
      continue;
    }
    try {
      rows.push(buildRow(recWithOrg as unknown as T));
    } catch (e) {
      report.errors.push(`${name} ${id}: ${getErrorMessage(e)}`);
    }
  }
  return { rows, report };
}

async function runModule<T>(
  name: string,
  table: string,
  records: T[],
  buildRow: RowBuilder<T>,
  opts?: {
    keyColumn?: string;
    filter?: (r: T) => FilterResult;
    transform?: (r: T) => T;
  },
): Promise<ModuleReport> {
  const emptyReport: ModuleReport = { module: name, total: 0, inserted: 0, skipped: 0, filtered: 0, errors: [] };
  if (records.length === 0) return emptyReport;

  let cloudIds: Set<string>;
  try {
    cloudIds = await fetchCloudIds(table, opts?.keyColumn ?? "id");
  } catch (e) {
    return { ...emptyReport, errors: [getErrorMessage(e)] };
  }

  const { rows, report } = buildRowsForInsert(name, records, cloudIds, buildRow, opts);
  if (rows.length === 0) return report;

  const result = await insertBatch(table, rows);
  return {
    ...report,
    inserted: report.inserted + result.inserted,
    errors: [...report.errors, ...result.errors],
  };
}

async function migratePatients(actorId: string): Promise<ModuleReport> {
  const local = await patientRepository.findAll();
  const valid: typeof local = [];
  const validationErrors: string[] = [];
  for (const p of local) {
    const result = patientMigrationSchema.safeParse(p);
    if (result.success) {
      valid.push(p);
    } else {
      validationErrors.push(`患者 ${(p as { id?: string }).id ?? "unknown"}: ${result.error.message}`);
    }
  }

  const migrated = await runModule("patients", "patients", valid, (p) => ({
    id: p.id,
    org_id: currentOrg(),
    medical_record_no: (p as unknown as { medicalRecordNo?: string }).medicalRecordNo || "ANRM-MIGRATED",
    name: (p as unknown as { name: string }).name,
    sex: (p as unknown as { sex?: string }).sex || "other",
    birth_date: formatDate((p as unknown as { birthDate?: Date | string }).birthDate),
    phone: (p as unknown as { phone?: string }).phone || null,
    dominant_hand: (p as unknown as { dominantHand?: string }).dominantHand || null,
    created_at: toISO((p as unknown as { createdAt: Date }).createdAt),
    created_by: actorId,
  }));

  if (validationErrors.length === 0) return migrated;
  return {
    ...migrated,
    total: migrated.total + validationErrors.length,
    errors: [...validationErrors, ...migrated.errors],
  };
}

async function migrateEncounters(cloudPatientIds: Set<string>, actorId: string): Promise<ModuleReport> {
  const local = await encounterRepository.findAll();
  return runModule("encounters", "encounters", local, (e) =>
    encounterToRow(e as unknown as Parameters<typeof encounterToRow>[0], actorId),
    {
      filter: (e) => cloudPatientIds.has((e as unknown as { patientId: string }).patientId),
    },
  );
}

async function migrateAssessments(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await assessmentRepository.findAll();
  return runModule("assessments", "assessments", local, (a) =>
    assessmentToRow(a as unknown as Parameters<typeof assessmentToRow>[0], actorId),
    {
      filter: (a) => {
        const rec = a as unknown as { patientId: string; encounterId?: string };
        if (!cloudPatientIds.has(rec.patientId)) return false;
        if (rec.encounterId && !cloudEncounterIds.has(rec.encounterId)) return false;
        return true;
      },
    },
  );
}

async function migrateExamSessions(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await examSessionRepository.findAll();
  return runModule("exam_sessions", "exam_sessions", local, (s) =>
    examToRow(s as unknown as Parameters<typeof examToRow>[0], actorId),
    {
      filter: (s) => {
        const rec = s as unknown as { patientId: string; encounterId: string };
        return cloudPatientIds.has(rec.patientId) && cloudEncounterIds.has(rec.encounterId);
      },
    },
  );
}

async function migrateDiagnoses(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  encounterPatientMap: Map<string, string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await diagnosisRepository.findAll();
  return runModule("diagnoses", "diagnoses", local, (d) =>
    diagnosisToRow(d as unknown as Parameters<typeof diagnosisToRow>[0], actorId),
    {
      filter: (d) => {
        const rec = d as unknown as { encounterId: string; patientId?: string };
        if (!cloudEncounterIds.has(rec.encounterId)) return false;
        if (rec.patientId && !cloudPatientIds.has(rec.patientId)) return false;
        return true;
      },
      transform: (d) => {
        const rec = d as unknown as { encounterId: string; patientId?: string };
        if (rec.patientId) return d;
        const pid = encounterPatientMap.get(rec.encounterId);
        if (!pid) return d;
        return { ...d, patientId: pid } as unknown as typeof d;
      },
    },
  );
}

async function migrateTreatmentPlans(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await treatmentPlanRepository.findAll();
  return runModule("treatment_plans", "treatment_plans", local, (p) =>
    planToRow(p as unknown as Parameters<typeof planToRow>[0], actorId),
    {
      filter: (p) => {
        const rec = p as unknown as { patientId: string; encounterId: string };
        return cloudPatientIds.has(rec.patientId) && cloudEncounterIds.has(rec.encounterId);
      },
    },
  );
}

async function migrateProgressNotes(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await progressNoteRepository.findAll();
  return runModule("progress_notes", "progress_notes", local, (n) =>
    noteToRow(n as unknown as Parameters<typeof noteToRow>[0], actorId),
    {
      filter: (n) => {
        const rec = n as unknown as { patientId: string; encounterId: string };
        return cloudPatientIds.has(rec.patientId) && cloudEncounterIds.has(rec.encounterId);
      },
    },
  );
}

async function migrateAttachments(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await attachmentRepository.findAll();
  return runModule("attachments", "attachments", local, (a) =>
    attachmentToRow(a as unknown as Parameters<typeof attachmentToRow>[0], actorId),
    {
      filter: (a) => {
        const rec = a as unknown as { patientId: string; encounterId: string };
        return cloudPatientIds.has(rec.patientId) && cloudEncounterIds.has(rec.encounterId);
      },
    },
  );
}

async function migrateBilling(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await billingRepository.findAll();
  return runModule("billing_records", "billing_records", local, (b) =>
    billingToRow(b as unknown as Parameters<typeof billingToRow>[0], actorId),
    {
      filter: (b) => {
        const rec = b as unknown as { patientId: string; encounterId?: string };
        if (!cloudPatientIds.has(rec.patientId)) return false;
        if (rec.encounterId && !cloudEncounterIds.has(rec.encounterId)) return false;
        return true;
      },
    },
  );
}

async function migrateFollowups(
  cloudPatientIds: Set<string>,
  cloudEncounterIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await followupRepository.findAll();
  return runModule("followups", "followups", local, (f) =>
    followupToRow(f as unknown as Parameters<typeof followupToRow>[0], actorId),
    {
      filter: (f) => {
        const rec = f as unknown as { patientId: string; completedEncounterId?: string };
        if (!cloudPatientIds.has(rec.patientId)) return false;
        if (rec.completedEncounterId && !cloudEncounterIds.has(rec.completedEncounterId)) return false;
        return true;
      },
    },
  );
}

async function migrateMemberships(cloudPatientIds: Set<string>, actorId: string): Promise<ModuleReport> {
  const local = await localFindAllMemberships();
  return runModule("patient_memberships", "patient_memberships", local, (m) => membershipToRow(m, actorId), {
    keyColumn: "patient_id",
    filter: (m) => cloudPatientIds.has(m.patientId),
  });
}

async function migratePointsLogs(cloudPatientIds: Set<string>, actorId: string): Promise<ModuleReport> {
  const local = await localFindAllLogs();
  return runModule("points_logs", "points_logs", local, (l) => logToRow(l, actorId), {
    filter: (l) => cloudPatientIds.has(l.patientId),
  });
}

async function migrateRedemptions(
  cloudPatientIds: Set<string>,
  cloudRewardIds: Set<string>,
  actorId: string,
): Promise<ModuleReport> {
  const local = await localFindAllRedemptions();
  return runModule("redemptions", "redemptions", local, (r) => redemptionToRow(r, actorId), {
    filter: (r) => {
      if (!cloudPatientIds.has(r.patientId)) return { ok: false, reason: `patient ${r.patientId} 未迁移` };
      if (!cloudRewardIds.has(r.rewardId)) return { ok: false, reason: `reward ${r.rewardId} 不存在` };
      return true;
    },
  });
}

export function hasLocalData(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("anrm_")) {
        const raw = localStorage.getItem(key);
        if (raw && raw !== "[]") return true;
      }
    }
  } catch {
    /* noop */
  }
  return false;
}

async function fetchCloudProfile(supabase: SupabaseClient): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    const userId = data.session.user.id;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id, role, full_name")
      .eq("id", userId)
      .single();
    if (profileError || !profile) return null;
    return {
      userId,
      orgId: String(profile.org_id),
      role: String(profile.role) as Session["role"],
      fullName: String(profile.full_name ?? ""),
    };
  } catch {
    return null;
  }
}

function checkRole(session: { role: string }): string | null {
  if (!canMigrate(session.role)) {
    return getRoleMismatchMessage(session.role);
  }
  return null;
}

async function fetchCloudRewardIds(): Promise<Set<string>> {
  return fetchCloudIds("reward_products", "id");
}

function errorModule(name: string, e: unknown): ModuleReport {
  return { module: name, total: 0, inserted: 0, skipped: 0, filtered: 0, errors: [getErrorMessage(e)] };
}

async function runStep(
  name: string,
  onProgress: ProgressHandler | undefined,
  run: () => Promise<ModuleReport>,
): Promise<ModuleReport> {
  onProgress?.({ phase: "start", module: name });
  try {
    const report = await run();
    onProgress?.({ phase: "done", module: name, total: report.total, completed: report.inserted });
    return report;
  } catch (e) {
    const report = errorModule(name, e);
    onProgress?.({ phase: "done", module: name, total: 0, completed: 0 });
    return report;
  }
}

async function runMigrationSteps(actorId: string, onProgress?: ProgressHandler): Promise<ModuleReport[]> {
  const modules: ModuleReport[] = [];

  modules.push(await runStep("patients", onProgress, () => migratePatients(actorId)));

  modules.push(
    await runStep("encounters", onProgress, async () => {
      const patientIds = await fetchCloudIds("patients", "id");
      return migrateEncounters(patientIds, actorId);
    }),
  );

  modules.push(
    await runStep("encounter_children", onProgress, async () => {
      const [patientIds, encounterIds] = await Promise.all([
        fetchCloudIds("patients", "id"),
        fetchCloudIds("encounters", "id"),
      ]);
      const encounterPatientMap = await buildEncounterPatientMap();
      const childReports = await Promise.all([
        migrateAssessments(patientIds, encounterIds, actorId),
        migrateExamSessions(patientIds, encounterIds, actorId),
        migrateDiagnoses(patientIds, encounterIds, encounterPatientMap, actorId),
        migrateTreatmentPlans(patientIds, encounterIds, actorId),
        migrateProgressNotes(patientIds, encounterIds, actorId),
        migrateAttachments(patientIds, encounterIds, actorId),
        migrateBilling(patientIds, encounterIds, actorId),
        migrateFollowups(patientIds, encounterIds, actorId),
      ]);
      return mergeReports("encounter_children", childReports);
    }),
  );

  modules.push(
    await runStep("membership", onProgress, async () => {
      const patientIds = await fetchCloudIds("patients", "id");
      const cloudRewardIds = await fetchCloudRewardIds();
      const membershipReports = await Promise.all([
        migrateMemberships(patientIds, actorId),
        migratePointsLogs(patientIds, actorId),
        migrateRedemptions(patientIds, cloudRewardIds, actorId),
      ]);
      return mergeReports("membership", membershipReports);
    }),
  );

  return modules;
}

async function verifyMigrationContext(
  supabase: SupabaseClient,
): Promise<{ ok: false; report: ModuleReport } | { ok: true; profile: Session }> {
  const cloudProfile = await fetchCloudProfile(supabase);
  if (!cloudProfile) {
    return { ok: false, report: errorModule("system", "无法从 Supabase 获取当前登录用户资料") };
  }

  const localSession = getSession();
  if (cloudProfile.userId !== localSession.userId) {
    return { ok: false, report: errorModule("system", "当前登录账号与 Supabase 会话不一致") };
  }
  if (cloudProfile.orgId !== localSession.orgId) {
    return { ok: false, report: errorModule("system", "当前机构与 Supabase 资料中的机构不一致") };
  }

  const roleError = checkRole(cloudProfile);
  if (roleError) {
    return { ok: false, report: errorModule("system", roleError) };
  }

  return { ok: true, profile: cloudProfile };
}

export async function migrateAllToCloud(onProgress?: ProgressHandler): Promise<MigrationReport> {
  const report: MigrationReport = { ok: true, modules: [], startedAt: new Date().toISOString() };

  if (!hasSupabaseConfig()) {
    report.ok = false;
    report.modules.push(errorModule("system", "Supabase 未配置"));
    return report;
  }

  const supabase = getSupabase();
  if (!supabase) {
    report.ok = false;
    report.modules.push(errorModule("system", "Supabase 客户端未初始化"));
    return report;
  }

  const context = await verifyMigrationContext(supabase);
  if (!context.ok) {
    report.ok = false;
    report.modules.push(context.report);
    return report;
  }

  try {
    report.modules = await runMigrationSteps(context.profile.userId, onProgress);
    report.ok = report.modules.every((m) => m.errors.length === 0);
  } catch (e) {
    report.ok = false;
    report.modules.push(errorModule("unknown", e));
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

async function buildEncounterPatientMap(): Promise<Map<string, string>> {
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("encounters")
    .select("id, patient_id")
    .eq("org_id", currentOrg());
  if (error) throw new Error(`构建 encounter→patient 映射失败: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.id), String(row.patient_id));
  }
  return map;
}

function mergeReports(name: string, reports: ModuleReport[]): ModuleReport {
  return reports.reduce(
    (acc, r) => ({
      module: name,
      total: acc.total + r.total,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
      filtered: acc.filtered + r.filtered,
      errors: [...acc.errors, ...r.errors.map((e) => `[${r.module}] ${e}`)],
    }),
    { module: name, total: 0, inserted: 0, skipped: 0, filtered: 0, errors: [] },
  );
}

export function toISO(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function formatDate(value: Date | string | undefined): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value) return value.slice(0, 10);
  return null;
}
