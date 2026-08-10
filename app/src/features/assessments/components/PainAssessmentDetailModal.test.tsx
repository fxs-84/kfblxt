/**
 * PainAssessmentDetailModal — 疼痛评估(CSI + S-LANSS)做题详情弹层
 *
 * 契约:
 *   - record=null:不渲染任何 DOM
 *   - 渲染 dialog:元信息(日期 + CSI 总分/严重度 + S-LANSS 总分/阴阳性)
 *   - CSI 逐题展示题干 + 作答 chip(分数 + 描述标签;未作答显示"未作答")
 *   - S-LANSS 逐题展示题干 + 作答 chip(是:选项文案(+N分)/ 否:选项文案 / 未作答)
 *   - ESC 键 / 背景点击 / 关闭按钮 均触发 onClose
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PainAssessmentDetailModal } from "./PainAssessmentDetailModal";
import { SLANSS_ITEMS } from "../scales/slanss";
import type { PainAssessmentRecordRow } from "../assessment.repository";

function makeRecord(opts?: {
  csiItems?: Record<number, number>;
  slanssItems?: Record<number, number>;
}): PainAssessmentRecordRow {
  const csiItems: Record<number, number> = {};
  for (let i = 1; i <= 25; i++) csiItems[i] = opts?.csiItems?.[i] ?? 0;
  const slanssItems = opts?.slanssItems ?? {};
  const csiTotal = Object.values(csiItems).reduce((a, b) => a + b, 0);
  const slanssTotal = Object.values(slanssItems).reduce((a, b) => a + b, 0);
  return {
    id: "rec-pain-1",
    patientId: "p-1",
    encounterId: "e-1",
    orgId: "org-1",
    type: "pain_assessment",
    createdAt: new Date("2026-08-10T00:00:00Z"),
    csi: { items: csiItems, total: csiTotal, severity: "moderate" },
    slanss: { items: slanssItems, total: slanssTotal, positive: slanssTotal >= 12 },
  } as PainAssessmentRecordRow;
}

describe("PainAssessmentDetailModal", () => {
  it("record=null:不渲染任何 DOM", () => {
    const { container } = render(<PainAssessmentDetailModal record={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("渲染元信息 + CSI 逐题作答 chip", () => {
    render(<PainAssessmentDetailModal record={makeRecord({ csiItems: { 1: 3, 2: 0 } })} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // CSI Q1 答了 3 分 → "3 · 经常";Q2 答 0 → "0 · 从不";Q4 未在 csiItems 给值但工厂默认 0 → 也有 chip
    expect(screen.getByTestId("pain-detail-csi-score-1")).toHaveTextContent("3 · 经常");
    expect(screen.getByTestId("pain-detail-csi-score-2")).toHaveTextContent("0 · 从不");
    // 元信息
    expect(screen.getByText(/疼痛评估做题详情/)).toBeInTheDocument();
  });

  it("CSI 未作答的题显示未作答", () => {
    const record = makeRecord({ csiItems: { 1: 3 } });
    // 手动删掉一题,模拟历史记录的缺答
    delete record.csi.items[5];
    render(<PainAssessmentDetailModal record={record} onClose={() => {}} />);
    expect(screen.getByTestId("pain-detail-csi-score-5")).toHaveTextContent("未作答");
  });

  it("S-LANSS:是 → 选项文案(+N分);否 → 否文案;未答 → 未作答", () => {
    const yesScore = SLANSS_ITEMS[0].scores[1]; // 5
    const record = makeRecord({ slanssItems: { 1: yesScore, 2: 0 } });
    render(<PainAssessmentDetailModal record={record} onClose={() => {}} />);
    expect(screen.getByTestId("pain-detail-slanss-score-1")).toHaveTextContent(`是:${SLANSS_ITEMS[0].options[1]} (+${yesScore}分)`);
    expect(screen.getByTestId("pain-detail-slanss-score-2")).toHaveTextContent(`否:${SLANSS_ITEMS[1].options[0]}`);
    expect(screen.getByTestId("pain-detail-slanss-score-3")).toHaveTextContent("未作答");
  });

  it("S-LANSS 总分 ≥ 12 时元信息显示阳性", () => {
    const record = makeRecord({ slanssItems: { 1: 5, 2: 5, 3: 3 } }); // 13 分
    render(<PainAssessmentDetailModal record={record} onClose={() => {}} />);
    expect(screen.getByText(/⚠ 阳性/)).toBeInTheDocument();
  });

  it("ESC / 背景点击 / 关闭按钮均触发 onClose", () => {
    const onClose = vi.fn();
    render(<PainAssessmentDetailModal record={makeRecord()} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("pain-detail-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
