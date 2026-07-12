import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import type {
  AssessmentInput,
  AssessmentRecord,
  BrainAssessmentInput,
  BrainAssessmentRecordRow,
  PainAssessmentInput,
  PainAssessmentRecordRow,
} from "./assessment.types";
import type { BrainRegionResponses, BrainRegionScore, PhoneEarPreference } from "./scales/brain-region";

/** 仓储内部持久化结构(覆盖所有字段) */
type StoredAssessmentRow = (BrainAssessmentRecordRow | PainAssessmentRecordRow) & Entity;

function validate(input: AssessmentInput): AssessmentInput {
  if (!input.patientId) throw new Error("客户 ID 不能为空");
  if (!["brain_region", "pain_assessment"].includes(input.type)) {
    throw new Error(`暂不支持量表类型: ${input.type}`);
  }
  return input;
}

/** 大脑区域定位表 — 独立仓储 */
const brainAssessmentRepository: Repository<
  BrainAssessmentRecordRow & Entity,
  BrainAssessmentInput
> = lazyPersistent<
  BrainAssessmentRecordRow & Entity,
  BrainAssessmentInput
>("brain-assessments", [], {
  validate: (input) => {
    validate(input);
    return input;
  },
});

/** 疼痛评估量表 — 独立仓储 */
const painAssessmentRepository: Repository<
  PainAssessmentRecordRow & Entity,
  PainAssessmentInput
> = lazyPersistent<
  PainAssessmentRecordRow & Entity,
  PainAssessmentInput
>("pain-assessments", [], {
  validate: (input) => {
    validate(input);
    return input;
  },
});

/** 跨两个仓储的查询 */
async function findAllAcross(): Promise<StoredAssessmentRow[]> {
  const [a, b] = await Promise.all([
    brainAssessmentRepository.findAll(),
    painAssessmentRepository.findAll(),
  ]);
  return [...a, ...b].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
}

/** 创建 — 按 type 路由到对应仓储 */
async function createAcross(input: AssessmentInput): Promise<StoredAssessmentRow> {
  if (input.type === "brain_region") {
    const r = await brainAssessmentRepository.create(input);
    return r;
  }
  return painAssessmentRepository.create(input);
}

/** 通用 findById — 跨两个仓储 */
async function findByIdAcross(id: string): Promise<StoredAssessmentRow | null> {
  const a = await brainAssessmentRepository.findById(id);
  if (a) return a;
  return painAssessmentRepository.findById(id);
}

/** 删除 — 跨两个仓储 */
async function removeAcross(id: string): Promise<void> {
  const found = await findByIdAcross(id);
  if (!found) return;
  if (found.type === "brain_region") return brainAssessmentRepository.remove(id);
  return painAssessmentRepository.remove(id);
}

/**
 * 统一对外 API — 兼容旧 assessmentRepository 调用。
 */
export const assessmentRepository = {
  findAll: findAllAcross,
  findById: findByIdAcross,
  create: createAcross,
  remove: removeAcross,
};

/** 查找某客户的所有量表记录(按创建时间倒序) */
export async function findAssessmentsByPatient(patientId: string): Promise<StoredAssessmentRow[]> {
  const all = await assessmentRepository.findAll();
  return all.filter((a) => a.patientId === patientId);
}

/** 查找某次就诊关联的量表记录 */
export async function findAssessmentsByEncounter(encounterId: string): Promise<StoredAssessmentRow[]> {
  const all = await assessmentRepository.findAll();
  return all.filter((a) => a.encounterId === encounterId);
}

/** 类型辅助 — Brain 持久化行(对外暴露) */
export type { BrainAssessmentRecordRow, PainAssessmentRecordRow, AssessmentRecord, AssessmentInput, BrainRegionResponses, BrainRegionScore, PhoneEarPreference };