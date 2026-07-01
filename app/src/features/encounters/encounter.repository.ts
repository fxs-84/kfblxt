import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import { encounterInputSchema, type EncounterInput } from "./encounter.schema";
import { MOCK_SESSION } from "../../lib/session";

export type EncounterRecord = EncounterInput & Entity;

const P1 = "aaaaaaaa-0000-4000-8000-000000000001"; // 张伟:腰椎间盘 S1
const P2 = "aaaaaaaa-0000-4000-8000-000000000002"; // 李娜:颈椎-上肢

// 演示数据:VAS 随治疗递减,体现 ANRM 疗效复评的临床叙事
const seed: EncounterRecord[] = [
  {
    id: "e0000001-0000-4000-8000-000000000001",
    createdAt: new Date("2026-05-20"),
    orgId: MOCK_SESSION.orgId,
    patientId: P1,
    encounterDate: new Date("2026-05-20"),
    visitType: "初诊",
    status: "已结束",
    chiefComplaint: {
      regions: ["left-lower-back", "left-gluteal", "left-hamstring-内侧", "left-calves-内侧"],
      distributionNote: "左小腿后外侧 S1 皮区",
      nature: ["麻木", "放射痛", "无力"],
      vas: 7,
      durationText: "3个月",
    },
  },
  {
    id: "e0000001-0000-4000-8000-000000000002",
    createdAt: new Date("2026-06-03"),
    orgId: MOCK_SESSION.orgId,
    patientId: P1,
    encounterDate: new Date("2026-06-03"),
    visitType: "复诊",
    status: "已结束",
    chiefComplaint: {
      regions: ["left-lower-back", "left-hamstring-内侧"],
      nature: ["麻木", "不稳感"],
      vas: 5,
      durationText: "3.5个月",
    },
  },
  {
    id: "e0000001-0000-4000-8000-000000000003",
    createdAt: new Date("2026-06-20"),
    orgId: MOCK_SESSION.orgId,
    patientId: P1,
    encounterDate: new Date("2026-06-20"),
    visitType: "复诊",
    status: "已结束",
    chiefComplaint: {
      regions: ["left-calves-内侧"],
      nature: ["酸痛", "活动受限"],
      vas: 3,
      durationText: "4个月",
    },
  },
  {
    id: "e0000002-0000-4000-8000-000000000001",
    createdAt: new Date("2026-06-02"),
    orgId: MOCK_SESSION.orgId,
    patientId: P2,
    encounterDate: new Date("2026-06-02"),
    visitType: "初诊",
    status: "已结束",
    chiefComplaint: {
      regions: ["left-neck", "left-chest", "left-trapezius", "left-front-deltoids", "left-forearm-内侧"],
      distributionNote: "C6 皮区,胸小肌卡压可疑",
      nature: ["麻木", "刺痛", "颈痛", "举手困难"],
      vas: 6,
      durationText: "2个月",
    },
  },
  {
    id: "e0000002-0000-4000-8000-000000000002",
    createdAt: new Date("2026-06-18"),
    orgId: MOCK_SESSION.orgId,
    patientId: P2,
    encounterDate: new Date("2026-06-18"),
    visitType: "复诊",
    status: "已结束",
    chiefComplaint: {
      regions: ["left-neck", "left-forearm-内侧"],
      nature: ["麻木", "不稳感"],
      vas: 4,
      durationText: "2.5个月",
    },
  },
];

export const encounterRepository: Repository<EncounterRecord, EncounterInput> =
  lazyPersistent<EncounterRecord, EncounterInput>("encounters", seed, {
    validate: (input) => encounterInputSchema.parse(input) as EncounterInput,
  });

export async function findEncountersByPatient(patientId: string): Promise<EncounterRecord[]> {
  const all = await encounterRepository.findAll();
  return all
    .filter((e) => e.patientId === patientId)
    .sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime());
}
