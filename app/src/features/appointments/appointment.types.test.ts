/**
 * appointment.types 单元测试 — 状态机 + 紧急度分档
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  getUrgency,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from "./appointment.types";

describe("canTransition", () => {
  it("同状态 → true(幂等,允许原地放下)", () => {
    for (const s of APPOINTMENT_STATUSES) {
      expect(canTransition(s, s)).toBe(true);
    }
  });

  it("正向流转链:pending → confirmed → checked_in → completed", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("checked_in", "completed")).toBe(true);
  });

  it("任意非终态可 → cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("checked_in", "cancelled")).toBe(true);
  });

  it("不允许跳步:pending → checked_in / completed", () => {
    expect(canTransition("pending", "checked_in")).toBe(false);
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("confirmed", "completed")).toBe(false);
  });

  it("终态不可改回", () => {
    const terminals: AppointmentStatus[] = ["completed", "cancelled"];
    for (const from of terminals) {
      for (const to of APPOINTMENT_STATUSES) {
        if (to === from) continue;
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("不允许逆向", () => {
    expect(canTransition("confirmed", "pending")).toBe(false);
    expect(canTransition("checked_in", "confirmed")).toBe(false);
    expect(canTransition("completed", "checked_in")).toBe(false);
  });
});

describe("APPOINTMENT_STATUS_LABELS", () => {
  it("5 个状态都有中文标签", () => {
    for (const s of APPOINTMENT_STATUSES) {
      expect(APPOINTMENT_STATUS_LABELS[s]).toBeTruthy();
    }
  });
});

describe("getUrgency", () => {
  const now = new Date("2026-10-08T10:00:00");

  it("开始时间已过 → overdue", () => {
    const start = new Date("2026-10-08T09:00:00");
    expect(getUrgency(start, now)).toBe("overdue");
  });

  it("今天但未过 → today", () => {
    const start = new Date("2026-10-08T14:00:00");
    expect(getUrgency(start, now)).toBe("today");
  });

  it("跨日但 24h 内 → soon", () => {
    // 次日上午 9:00(距 now 23h)
    const start = new Date("2026-10-09T09:00:00");
    expect(getUrgency(start, now)).toBe("soon");
  });

  it("24h 以外 → future", () => {
    const start = new Date("2026-10-11T10:00:00");
    expect(getUrgency(start, now)).toBe("future");
  });
});
