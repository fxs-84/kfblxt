import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { LocalizationDiagnosis } from "./localization.types";

export type DiagnosisRecord = Omit<LocalizationDiagnosis, "id" | "createdAt"> & Entity;

export interface DiagnosisInput {
  encounterId: string;
  orgId: string;
  levels: LocalizationDiagnosis["levels"];
  segments?: LocalizationDiagnosis["segments"];
  nerves?: LocalizationDiagnosis["nerves"];
  cutaneousNerveIds?: string[];
  side: LocalizationDiagnosis["side"];
  mechanisms: LocalizationDiagnosis["mechanisms"];
  reasoning: string;
}

export const diagnosisRepository: Repository<DiagnosisRecord, DiagnosisInput> =
  lazyPersistent<DiagnosisRecord, DiagnosisInput>("diagnoses", []);

export async function findDiagnosisByEncounter(encounterId: string): Promise<DiagnosisRecord | null> {
  const all = await diagnosisRepository.findAll();
  const found = all.filter((d) => d.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return found[0] ?? null;
}
