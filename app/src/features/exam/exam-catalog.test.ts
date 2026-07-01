import { describe, it, expect } from "vitest";
import { EXAM_CATALOG } from "./exam-catalog";
import { EXAM_CATEGORIES } from "./exam.types";

describe("EXAM_CATALOG", () => {
  it("所有项目有合法 id 且无重复", () => {
    const ids = EXAM_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("所有项目的 category 在 EXAM_CATEGORIES 内", () => {
    for (const item of EXAM_CATALOG) {
      expect(EXAM_CATEGORIES).toContain(item.category);
    }
  });

  it("每个大类至少 1 个项目", () => {
    for (const cat of EXAM_CATEGORIES) {
      const count = EXAM_CATALOG.filter((d) => d.category === cat).length;
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it("至少 40 个项目(ANRM 特色全覆盖)", () => {
    expect(EXAM_CATALOG.length).toBeGreaterThanOrEqual(40);
  });

  it("待确认项目标记为 pendingConfirmation", () => {
    const pending = EXAM_CATALOG.filter((d) => d.pendingConfirmation).length;
    expect(pending).toBeGreaterThan(20); // 大部分需确认
  });
});
