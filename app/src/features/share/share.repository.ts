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

/** 生成短 token */
export function generateToken(): string {
  return `anrm-${crypto.randomUUID().slice(0, 8)}`;
}

/** 30 天后过期 */
export function defaultExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
