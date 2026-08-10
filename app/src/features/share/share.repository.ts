import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { ShareLink } from "./share.types";

export type ShareRecord = Omit<ShareLink, "id" | "createdAt"> & Entity;

export interface ShareInput {
  encounterId: string;
  patientId: string;
  orgId: string;
  token: string;
  revoked: boolean;
  expiresAt: Date;
  homework?: string;
  nextVisit?: Date;
  message?: string;
  hashData?: string;
  mode?: "summary" | "assessment";
  scales?: ("brain_region" | "pain_assessment")[];
}

export const shareRepository: Repository<ShareRecord, ShareInput> =
  lazyPersistent<ShareRecord, ShareInput>("shares", []);

export async function findShareByToken(token: string): Promise<ShareRecord | null> {
  const all = await shareRepository.findAll();
  return all.find((s) => s.token === token && !s.revoked && s.expiresAt > new Date()) ?? null;
}

export async function findSharesByEncounter(encounterId: string): Promise<ShareRecord[]> {
  const all = await shareRepository.findAll();
  return all.filter((s) => s.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 生成 token — 完整 UUID(122 位熵);网关公开后 token 是唯一凭证,长 token 防枚举 */
export function generateToken(): string {
  return `anrm-${crypto.randomUUID()}`;
}

/** 30 天后过期 */
export function defaultExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
