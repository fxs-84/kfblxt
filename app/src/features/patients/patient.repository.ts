import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import { patientSchema, type PatientInput } from "./patient.schema";
import { MOCK_SESSION } from "../../lib/session";

export type PatientRecord = PatientInput & Entity;

const patientInputSchema = patientSchema.omit({ id: true, createdAt: true });

/** 自动生成病历号:ANRM-YYYYMMDD-NNN */
function generateMRN(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 900) + 100); // 100-999
  return `ANRM-${today}-${seq}`;
}

const seed: PatientRecord[] = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    orgId: MOCK_SESSION.orgId,
    medicalRecordNo: "ANRM-0001",
    name: "张伟",
    sex: "male",
    birthDate: new Date("1978-04-12"),
    phone: "13800000001",
    dominantHand: "right",
    createdAt: new Date("2026-05-20"),
  },
  {
    id: "aaaaaaaa-0000-4000-8000-000000000002",
    orgId: MOCK_SESSION.orgId,
    medicalRecordNo: "ANRM-0002",
    name: "李娜",
    sex: "female",
    birthDate: new Date("1990-09-03"),
    phone: "13800000002",
    dominantHand: "left",
    createdAt: new Date("2026-06-02"),
  },
];

export const patientRepository: Repository<PatientRecord, PatientInput> =
  lazyPersistent<PatientRecord, PatientInput>("patients", seed, {
    validate: (input) => {
      const parsed = patientInputSchema.parse(input) as PatientInput;
      if (!parsed.medicalRecordNo || !parsed.medicalRecordNo.trim()) {
        parsed.medicalRecordNo = generateMRN();
      }
      return parsed;
    },
  });
