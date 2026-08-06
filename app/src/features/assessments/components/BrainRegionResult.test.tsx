/**
 * BrainRegionResult — 点击分区条 → 弹层显示做题详情
 *
 * 契约:
 *   - 16 个分区条全部渲染为 button,可点击
 *   - 点击某分区 → BrainRegionDetailModal 打开,显示该分区的题目与作答
 *   - 关闭弹窗(ESC / 背景 / ×)→ 弹层消失
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrainRegionResult } from "./BrainRegionResult";
import { BRAIN_REGION_DEFS } from "../scales/brain-region";
import type { BrainAssessmentRecordRow, BrainRegionScore } from "../assessment.repository";
import type {
  BrainRegionId,
  BrainRegionResponses,
  RegionSeverity,
} from "../scales/brain-region";

// React Query 的 useDeleteAssessment 需要 QueryClientProvider;这里把它空实现掉
vi.mock("../useAssessments", () => ({
  useDeleteAssessment: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeRow(overrides?: {
  items?: Record<number, number>;
  phoneEar?: BrainRegionResponses["phoneEar"];
  severityByRegion?: Partial<Record<BrainRegionId, RegionSeverity>>;
}): BrainAssessmentRecordRow {
  const items: Record<number, number> = {};
  for (let i = 1; i <= 100; i++) {
    if (i === 46) continue;
    items[i] = overrides?.items?.[i] ?? 0;
  }
  const severityByRegion = (overrides?.severityByRegion ?? {}) as BrainRegionScore["severityByRegion"];
  return {
    id: "rec-1",
    patientId: "p-1",
    orgId: "org-1",
    type: "brain_region",
    createdAt: new Date("2026-08-06T00:00:00Z"),
    responses: {
      items,
      phoneEar: overrides?.phoneEar ?? null,
    },
    score: {
      byRegion: {} as BrainRegionScore["byRegion"],
      total: 0,
      percent: 0,
      affectedRegions: [],
      severityByRegion,
    },
    phoneEar: overrides?.phoneEar ?? null,
  };
}

describe("BrainRegionResult — 分区条点击交互", () => {
  it("16 个分区条全部渲染为可点击的 button", () => {
    render(<BrainRegionResult record={makeRow()} />);
    for (const def of BRAIN_REGION_DEFS) {
      expect(screen.getByTestId(`brain-region-bar-${def.id}`)).toBeInTheDocument();
      expect(
        screen.getByTestId(`brain-region-bar-${def.id}`).tagName.toLowerCase(),
      ).toBe("button");
    }
  });

  it("点击某分区按钮 → 弹层出现,显示该分区的题目", () => {
    const record = makeRow({ items: { 1: 3 } });
    render(<BrainRegionResult record={record} />);
    // 初始:没有弹层
    expect(screen.queryByRole("dialog")).toBeNull();

    // 点击 prefrontal
    fireEvent.click(screen.getByTestId("brain-region-bar-prefrontal"));

    // 弹层出现,显示分区名
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/前额叶/)).toBeInTheDocument();
    // Q1 的分数 chip 显示 3 · 频繁
    expect(screen.getByTestId("brain-region-detail-score-1").textContent).toMatch(/3/);
  });

  it("关闭弹层后:弹层从 DOM 移除", () => {
    const record = makeRow();
    render(<BrainRegionResult record={record} />);
    fireEvent.click(screen.getByTestId("brain-region-bar-prefrontal"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 点击关闭按钮
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("点击另一分区按钮:重新打开该分区弹层", () => {
    const record = makeRow({ items: { 32: 2 } });
    render(<BrainRegionResult record={record} />);
    fireEvent.click(screen.getByTestId("brain-region-bar-prefrontal"));
    expect(within(screen.getByRole("dialog")).getByText(/前额叶/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("brain-region-bar-parietalInferior"));
    expect(within(screen.getByRole("dialog")).getByText(/顶叶下小叶/)).toBeInTheDocument();
    expect(screen.getByTestId("brain-region-detail-score-32").textContent).toMatch(/2/);
  });

  it("第 46 题弹层(听觉皮层):展示电话偏好侧,不读 items[46]", () => {
    const record = makeRow({ phoneEar: "right" });
    render(<BrainRegionResult record={record} />);
    fireEvent.click(screen.getByTestId("brain-region-bar-auditoryCortex"));
    expect(screen.getByTestId("brain-region-detail-item-46").textContent).toMatch(/电话偏好侧/);
    expect(screen.getByTestId("brain-region-detail-score-46").textContent).toBe("右耳");
  });
});