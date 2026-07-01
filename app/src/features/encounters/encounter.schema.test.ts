import { describe, it, expect } from "vitest";
import { encounterInputSchema, chiefComplaintSchema } from "./encounter.schema";

const validComplaint = {
  regions: ["left-calves-内侧", "left-hamstring-内侧"] as const,
  distributionNote: "左小腿后外侧 S1 皮区",
  nature: ["麻木", "感觉减退", "无力"] as const,
  vas: 6,
  durationText: "3个月",
};

describe("chiefComplaintSchema", () => {
  it("接受合法主诉", () => {
    expect(chiefComplaintSchema.parse(validComplaint).vas).toBe(6);
  });

  it("VAS 超出 0-10 被拒绝", () => {
    expect(() => chiefComplaintSchema.parse({ ...validComplaint, vas: 11 })).toThrow();
  });

  it("性质为空数组被拒绝", () => {
    expect(() => chiefComplaintSchema.parse({ ...validComplaint, nature: [] })).toThrow();
  });

  it("未标记任何人体区域被拒绝", () => {
    expect(() => chiefComplaintSchema.parse({ ...validComplaint, regions: [] })).toThrow();
  });
});

describe("encounterInputSchema", () => {
  const base = {
    orgId: "11111111-1111-4111-8111-111111111111",
    patientId: "22222222-2222-4222-8222-222222222222",
    encounterDate: "2026-06-01",
    visitType: "初诊" as const,
    chiefComplaint: validComplaint,
  };

  it("接受合法就诊记录并把日期强制为 Date", () => {
    const parsed = encounterInputSchema.parse(base);
    expect(parsed.encounterDate).toBeInstanceOf(Date);
    expect(parsed.visitType).toBe("初诊");
  });

  it("未来就诊日期被拒绝", () => {
    expect(() => encounterInputSchema.parse({ ...base, encounterDate: "2099-01-01" })).toThrow();
  });

  it("非法 visitType 被拒绝", () => {
    expect(() => encounterInputSchema.parse({ ...base, visitType: "急诊" })).toThrow();
  });
});
