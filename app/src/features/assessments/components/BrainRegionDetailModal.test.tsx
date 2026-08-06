/**
 * BrainRegionDetailModal — 大脑区域定位表 · 单分区做题详情弹层
 *
 * 契约:
 *   - regionId=null:不渲染任何 DOM
 *   - regionId 有效:渲染 dialog,显示分区名 + 严重度徽章 + 元信息 + 题目列表
 *   - 题目展示题干 + 作答分数 chip(0-4 + 标签;未作答显示"未作答")
 *   - 半球侧别标签 L=左半球相关 / R=右半球相关
 *   - 第 46 题:不查 items,改查 record.responses.phoneEar;label 显示 PHONE_EAR_OPTIONS
 *   - ESC 键 / 背景点击 / 关闭按钮 均触发 onClose
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrainRegionDetailModal } from "./BrainRegionDetailModal";
import type {
  BrainRegionId,
  BrainRegionResponses,
  RegionSeverity,
} from "../scales/brain-region";
import type { BrainAssessmentRecordRow, BrainRegionScore } from "../assessment.repository";

type BrainRegionScoreInit = {
  byRegion?: Partial<Record<BrainRegionId, number>>;
  severityByRegion?: Partial<Record<BrainRegionId, RegionSeverity>>;
  affectedRegions?: BrainRegionId[];
};

function makeRecord(opts?: {
  items?: Record<number, number>;
  phoneEar?: BrainRegionResponses["phoneEar"];
  score?: BrainRegionScoreInit;
}): BrainAssessmentRecordRow {
  const items: Record<number, number> = {};
  for (let i = 1; i <= 100; i++) {
    if (i === 46) continue;
    items[i] = opts?.items?.[i] ?? 0;
  }
  const byRegion = (opts?.score?.byRegion ?? {}) as BrainRegionScore["byRegion"];
  const severityByRegion = (opts?.score?.severityByRegion ?? {}) as BrainRegionScore["severityByRegion"];
  return {
    id: "rec-1",
    patientId: "p-1",
    orgId: "org-1",
    type: "brain_region",
    createdAt: new Date("2026-08-06T00:00:00Z"),
    responses: {
      items,
      phoneEar: opts?.phoneEar ?? null,
    },
    score: {
      byRegion,
      total: 0,
      percent: 0,
      affectedRegions: opts?.score?.affectedRegions ?? [],
      severityByRegion,
    },
    phoneEar: opts?.phoneEar ?? null,
  };
}

describe("BrainRegionDetailModal", () => {
  it("regionId=null:不渲染任何 DOM", () => {
    const { container } = render(
      <BrainRegionDetailModal record={makeRecord()} regionId={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("无效 regionId(不在 BRAIN_REGION_DEFS):不渲染", () => {
    const { container } = render(
      <BrainRegionDetailModal
        record={makeRecord()}
        regionId={"not-a-region" as BrainRegionId}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("regionId 有效:渲染 dialog,头部含分区名 + 严重度徽章 + 元信息", () => {
    const record = makeRecord({
      score: { severityByRegion: { prefrontal: "severe" }, byRegion: { prefrontal: 51 } },
    });
    render(<BrainRegionDetailModal record={record} regionId="prefrontal" onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/前额叶/)).toBeInTheDocument();
    expect(screen.getByText("重度")).toBeInTheDocument();
    expect(screen.getByText(/区域 1 - 17 题/)).toBeInTheDocument();
    expect(screen.getByText(/51 \/ 68 分/)).toBeInTheDocument();
  });

  it("普通题:Q1 显示题干 + 作答分数 chip(分数 + 标签)", () => {
    const record = makeRecord({ items: { 1: 3 } });
    render(<BrainRegionDetailModal record={record} regionId="prefrontal" onClose={() => {}} />);
    const item = screen.getByTestId("brain-region-detail-item-1");
    expect(item.textContent).toMatch(/难以约束和控制冲动或欲望/);
    const chip = screen.getByTestId("brain-region-detail-score-1");
    expect(chip.textContent).toMatch(/3/);
    expect(chip.textContent).toMatch(/频繁/);
  });

  it("未作答的题:chip 显示'未作答'", () => {
    // 题 1 答 2,题 2 不作答
    const record = makeRecord({ items: { 1: 2 } });
    delete (record.responses.items as Record<number, number | undefined>)[2];
    render(<BrainRegionDetailModal record={record} regionId="prefrontal" onClose={() => {}} />);
    expect(screen.getByTestId("brain-region-detail-score-1").textContent).toMatch(/2/);
    expect(screen.getByTestId("brain-region-detail-score-2").textContent).toBe("未作答");
  });

  it("side=L 题(顶叶下小叶 Q32):显示'左半球相关'标签", () => {
    // 题 32 在 parietalInferlor(32-38),side=L
    const record = makeRecord({ items: { 32: 1 } });
    render(<BrainRegionDetailModal record={record} regionId="parietalInferior" onClose={() => {}} />);
    expect(screen.getByTestId("brain-region-detail-item-32").textContent).toMatch(/左半球相关/);
  });

  it("side=R 题(顶叶下小叶 Q36):显示'右半球相关'标签", () => {
    const record = makeRecord({ items: { 36: 2 } });
    render(<BrainRegionDetailModal record={record} regionId="parietalInferior" onClose={() => {}} />);
    expect(screen.getByTestId("brain-region-detail-item-36").textContent).toMatch(/右半球相关/);
  });

  it("第 46 题:不查 items,改查 phoneEar(右耳),label 显示'右耳'", () => {
    // 第 46 题在 auditoryCortex(39-46)
    const record = makeRecord({ phoneEar: "right" });
    render(<BrainRegionDetailModal record={record} regionId="auditoryCortex" onClose={() => {}} />);
    const item = screen.getByTestId("brain-region-detail-item-46");
    expect(item.textContent).toMatch(/电话偏好侧/);
    expect(item.textContent).not.toMatch(/左耳/);
    expect(screen.getByTestId("brain-region-detail-score-46").textContent).toBe("右耳");
  });

  it("第 46 题 phoneEar=null:显示'未作答'", () => {
    const record = makeRecord({ phoneEar: null });
    render(<BrainRegionDetailModal record={record} regionId="auditoryCortex" onClose={() => {}} />);
    expect(screen.getByTestId("brain-region-detail-score-46").textContent).toBe("未作答");
  });

  it("点击关闭按钮:触发 onClose", () => {
    const onClose = vi.fn();
    render(<BrainRegionDetailModal record={makeRecord()} regionId="prefrontal" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击背景:触发 onClose", () => {
    const onClose = vi.fn();
    render(<BrainRegionDetailModal record={makeRecord()} regionId="prefrontal" onClose={onClose} />);
    const backdrop = screen.getByTestId("brain-region-detail-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击弹层内部:不触发 onClose(stopPropagation)", () => {
    const onClose = vi.fn();
    render(<BrainRegionDetailModal record={makeRecord()} regionId="prefrontal" onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("按 ESC 键:触发 onClose", () => {
    const onClose = vi.fn();
    render(<BrainRegionDetailModal record={makeRecord()} regionId="prefrontal" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("regionId=null 时按 ESC 不触发 onClose(未绑定监听)", () => {
    const onClose = vi.fn();
    render(<BrainRegionDetailModal record={makeRecord()} regionId={null} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});