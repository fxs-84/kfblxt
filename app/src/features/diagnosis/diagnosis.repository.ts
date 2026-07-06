import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { LocalizationDiagnosis } from "./localization.types";

/** ICD-10 临床诊断条目(轻量,只需编码+名称) */
export interface ClinicalDx {
  code: string;    // ICD-10 编码
  name: string;    // 中文诊断名
  isPrimary: boolean; // 是否主诊
}

export type DiagnosisRecord = Omit<LocalizationDiagnosis, "id" | "createdAt"> & Entity & {
  /** ICD-10 临床诊断列表(可多个,如:腰椎间盘突出 + 高血压) */
  clinicalDiagnoses?: ClinicalDx[];
};

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
  /** ICD-10 临床诊断列表 */
  clinicalDiagnoses?: ClinicalDx[];
}

export const diagnosisRepository: Repository<DiagnosisRecord, DiagnosisInput> =
  lazyPersistent<DiagnosisRecord, DiagnosisInput>("diagnoses", []);

export async function findDiagnosisByEncounter(encounterId: string): Promise<DiagnosisRecord | null> {
  const all = await diagnosisRepository.findAll();
  const found = all.filter((d) => d.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return found[0] ?? null;
}
