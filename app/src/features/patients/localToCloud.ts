/**
 * 本地→云 一次性迁移工具。
 *
 * 应用首次连上 Supabase 后,localStorage 里已有客户数据需要同步到云端,
 * 才能真正实现多设备共享。这个工具做成按钮触发(非自动),避免误操作。
 */
import { getSupabase, hasSupabaseConfig } from "../../lib/supabase";
import { getSession } from "../../lib/session";
import { patientRepository, type PatientRecord } from "./patient.repository";
import { findAllPatientsSupabase } from "./patient-supabase";

interface MigrationReport {
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

/** 把 localStorage 的全部客户插入 Supabase(按 id 去重) */
export async function migrateLocalPatientsToCloud(): Promise<MigrationReport> {
  const report: MigrationReport = { total: 0, inserted: 0, skipped: 0, errors: [] };

  if (!hasSupabaseConfig()) {
    report.errors.push("Supabase 未配置");
    return report;
  }
  const supabase = getSupabase()!;

  // 本地客户可能存了旧的 orgId(MOCK_SESSION 的 ...f0),
  // 但 Supabase 的 org 是 ...001,所以要拿当前 session 的 orgId 覆盖
  const session = getSession();
  const cloudOrgId = session.orgId;

  // 1. 读本地全部客户
  const local = await patientRepository.findAll();
  report.total = local.length;
  if (local.length === 0) return report;

  // 2. 读云端全部(用 session 的 orgId 过滤)
  const cloud = await findAllPatientsSupabase(cloudOrgId);
  const cloudIds = new Set(cloud.map((p: PatientRecord) => p.id));

  // 3. 逐条 INSERT 不存在的(org_id 覆盖为当前 session 的 org)
  for (const p of local) {
    if (cloudIds.has(p.id)) {
      report.skipped++;
      continue;
    }
    const row = {
      id: p.id,
      org_id: cloudOrgId,
      medical_record_no: p.medicalRecordNo || "ANRM-MIGRATED",
      name: p.name,
      sex: p.sex || "other",
      birth_date: p.birthDate instanceof Date ? p.birthDate.toISOString().slice(0, 10) : String(p.birthDate),
      phone: p.phone && p.phone !== "" ? p.phone : null,
      dominant_hand: p.dominantHand && p.dominantHand !== "" ? p.dominantHand : null,
      created_at: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      created_by: getSession().userId,
    };
    const { error } = await supabase.from("patients").insert(row);
    if (error) {
      report.errors.push(`${p.name}: ${error.message}`);
    } else {
      report.inserted++;
    }
  }

  return report;
}
