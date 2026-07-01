import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { TreatmentPlan, ProgressNote } from "./treatment.types";

export type TreatmentPlanRecord = Omit<TreatmentPlan, "id" | "createdAt"> & Entity;
export type ProgressNoteRecord = Omit<ProgressNote, "id" | "createdAt"> & Entity;

export interface TreatmentPlanInput {
  encounterId: string;
  orgId: string;
  phase: TreatmentPlan["phase"];
  frequency: string;
  duration: string;
  interventionIds: string[];
  goals: TreatmentPlan["goals"];
  boundaries?: string;
}

export interface ProgressNoteInput {
  treatmentPlanId: string;
  encounterId: string;
  orgId: string;
  node: ProgressNote["node"];
  vasAfter?: number;
  scaleDelta?: Record<string, number>;
  outcome: ProgressNote["outcome"];
  adjustment?: string;
  note?: string;
}

export const treatmentPlanRepository: Repository<TreatmentPlanRecord, TreatmentPlanInput> =
  lazyPersistent<TreatmentPlanRecord, TreatmentPlanInput>("treatment-plans", []);

export const progressNoteRepository: Repository<ProgressNoteRecord, ProgressNoteInput> =
  lazyPersistent<ProgressNoteRecord, ProgressNoteInput>("progress-notes", []);

export async function findPlansByEncounter(encounterId: string): Promise<TreatmentPlanRecord[]> {
  const all = await treatmentPlanRepository.findAll();
  return all.filter((p) => p.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function findNotesByPlan(planId: string): Promise<ProgressNoteRecord[]> {
  const all = await progressNoteRepository.findAll();
  return all.filter((n) => n.treatmentPlanId === planId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function findNotesByEncounter(encounterId: string): Promise<ProgressNoteRecord[]> {
  const all = await progressNoteRepository.findAll();
  return all.filter((n) => n.encounterId === encounterId);
}
