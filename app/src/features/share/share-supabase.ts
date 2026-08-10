/**
 * Supabase 分享仓储 — 分享链接走云端(客户端需跨设备访问)。
 * 当 Supabase 环境变量未配时,自动回退到 localStorage 仓储。
 *
 * 用法:替换 share.repository.ts 中的 lazyPersistent 为 supabaseShareRepo,
 *       其余调用方(createShare/revokeShare/PatientViewPage)无需改动。
 */
import { getSupabase } from "../../lib/supabase";
import { shareRepository, generateToken, defaultExpiry } from "./share.repository";
import type { ShareRecord } from "./share.repository";
import { buildShareSnapshot } from "./build-snapshot";
import type { ScaleId, ShareSnapshot } from "./share.types";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

export async function createSupabaseShare(input: {
  encounterId: string;
  patientId: string;
  homework?: string;
  nextVisit?: Date;
  message?: string;
  hashData?: string;
}): Promise<ShareRecord> {
  if (!isSupabaseReady()) {
    // 回退到 localStorage
    return shareRepository.create({
      encounterId: input.encounterId,
      patientId: input.patientId,
      orgId: "00000000-0000-4000-8000-0000000000f0",
      token: generateToken(),
      revoked: false,
      expiresAt: defaultExpiry(),
      homework: input.homework,
      nextVisit: input.nextVisit,
      message: input.message,
      hashData: input.hashData,
    });
  }

  // Supabase 路径
  const supabase = getSupabase()!;
  const token = generateToken();

  // 快照当前临床数据,使客户跨设备可查看
  let snapshot: ShareSnapshot | null = null;
  try {
    snapshot = await buildShareSnapshot(input.encounterId, input.patientId);
  } catch {
    // 快照失败不退避,仍可创建分享但客户端可能缺数据
  }

  const row: Record<string, unknown> = {
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    org_id: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expires_at: defaultExpiry().toISOString(),
    homework: input.homework ?? null,
    next_visit: input.nextVisit?.toISOString() ?? null,
    message: input.message ?? null,
  };
  if (snapshot) row.snapshot = snapshot;

  let { error } = await supabase.from("shares").insert(row);

  // snapshot 列尚未创建(迁移未跑)? 回退无快照插入
  if (error && snapshot) {
    delete row.snapshot;
    snapshot = null;
    const retry = await supabase.from("shares").insert(row);
    error = retry.error;
  }

  if (error) throw new Error(`Supabase 创建分享失败: ${error.message}`);

  // 触发积分引擎:share.sent (分享奖励)
  try {
    const { onShareSent } = await import("../membership/integration");
    await onShareSent(input.patientId, token);
  } catch { /* 静默 */ }

  return {
    id: token,
    encounterId: input.encounterId,
    patientId: input.patientId,
    orgId: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expiresAt: defaultExpiry(),
    homework: input.homework,
    nextVisit: input.nextVisit,
    message: input.message,
    snapshot,
    createdAt: new Date(),
  } as ShareRecord;
}

/**
 * 创建自评量表二维码分发。
 * - 不打 snapshot(顾客要做的不是回顾,是要填新数据)
 * - 写入 mode='assessment' + scales 数组
 * - token 进 URL,顾客扫码 → AssessmentFormPage
 */
export async function createSupabaseAssessmentShare(input: {
  encounterId: string;
  patientId: string;
  mode: "assessment";
  scales: ScaleId[];
  message?: string;
}): Promise<ShareRecord> {
  if (!isSupabaseReady()) {
    return shareRepository.create({
      encounterId: input.encounterId,
      patientId: input.patientId,
      orgId: "00000000-0000-4000-8000-0000000000f0",
      token: generateToken(),
      revoked: false,
      expiresAt: defaultExpiry(),
      message: input.message,
      mode: "assessment",
      scales: input.scales,
    });
  }

  const supabase = getSupabase()!;
  const token = generateToken();
  const row: Record<string, unknown> = {
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    org_id: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expires_at: defaultExpiry().toISOString(),
    mode: "assessment",
    scales: input.scales,
    message: input.message ?? null,
  };

  const { error } = await supabase.from("shares").insert(row);
  if (error) throw new Error(`Supabase 创建量表分享失败: ${error.message}`);

  return {
    id: token,
    encounterId: input.encounterId,
    patientId: input.patientId,
    orgId: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expiresAt: defaultExpiry(),
    message: input.message,
    mode: "assessment",
    scales: input.scales,
    createdAt: new Date(),
  } as ShareRecord;
}

/**
 * 列出某 encounter 的自评量表分享(dual)。
 * Supabase 可用时优先查云端(跨设备);否则回退 localStorage。
 */
export async function findAssessmentSharesByEncounterDual(
  encounterId: string,
): Promise<ShareRecord[]> {
  const local = await shareRepository.findAll();
  const localList = local
    .filter((s) => s.encounterId === encounterId && s.mode === "assessment")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (!isSupabaseReady()) return localList;

  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("shares")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("mode", "assessment")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询量表分享失败: ${error.message}`);

  const remoteList = (data ?? []).map((r) => mapShareRow(r));
  const merged = new Map<string, ShareRecord>();
  for (const r of remoteList) merged.set(r.id, r);
  for (const l of localList) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()];
}

/** DB 行 → ShareRecord(统一映射;scales/mode 做白名单收窄) */
function mapShareRow(row: Record<string, unknown>): ShareRecord {
  const rawScales = Array.isArray(row.scales) ? (row.scales as unknown[]) : [];
  const scales = rawScales.filter(
    (s): s is ScaleId => s === "brain_region" || s === "pain_assessment",
  );
  const rawMode = row.mode as string | undefined;
  return {
    id: String(row.id),
    encounterId: String(row.encounter_id),
    patientId: String(row.patient_id),
    orgId: String(row.org_id),
    token: String(row.token),
    revoked: Boolean(row.revoked),
    expiresAt: new Date(String(row.expires_at)),
    homework: (row.homework as string | null) ?? undefined,
    nextVisit: row.next_visit ? new Date(String(row.next_visit)) : undefined,
    message: (row.message as string | null) ?? undefined,
    mode: rawMode === "assessment" ? "assessment" : "summary",
    scales: scales.length > 0 ? scales : undefined,
    snapshot: (row.snapshot as ShareSnapshot | null) ?? null,
    createdAt: new Date(String(row.created_at)),
  } as ShareRecord;
}

/** 客户端按 token 查询分享(匿名,无需登录) */
export async function findShareByTokenSupabase(token: string): Promise<ShareRecord | null> {
  if (!isSupabaseReady()) {
    const { findShareByToken } = await import("./share.repository");
    return findShareByToken(token);
  }

  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("shares")
    .select("*")
    .eq("token", token)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  return mapShareRow(data as Record<string, unknown>);
}

/** 撤销分享 */
export async function revokeShareSupabase(token: string): Promise<void> {
  if (!isSupabaseReady()) {
    const all = await shareRepository.findAll();
    const found = all.find((s) => s.token === token);
    if (found) await shareRepository.update(found.id, { revoked: true });
    return;
  }

  const supabase = getSupabase()!;
  await supabase.from("shares").update({ revoked: true }).eq("token", token);
}
