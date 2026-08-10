/**
 * AssessmentFormPage — 顾客扫码统一入口
 *
 * 契约:
 *   - token 无效/不存在 → 错误屏
 *   - mode=assessment 且有 scales → 渲染一次一题向导(量表名 + 进度 + 导航;答完才出现提交按钮)
 *   - mode=summary/缺失 → 渲染 PatientViewPage(只读摘要)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AssessmentFormPage } from "./AssessmentFormPage";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ token: "tok-1" }),
  useSearchParams: () => [new URLSearchParams(), () => {}],
}));

vi.mock("./PatientViewPage", () => ({
  PatientViewPage: () => <div data-testid="patient-view-summary">摘要页</div>,
}));

const { useShareByTokenMock } = vi.hoisted(() => ({
  useShareByTokenMock: vi.fn(),
}));

vi.mock("./useShare", () => ({
  useShareByToken: useShareByTokenMock,
}));

function makeShare(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "share-1",
    token: "tok-1",
    patientId: "p-1",
    encounterId: "e-1",
    orgId: "org-1",
    revoked: false,
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date("2026-08-10"),
    mode: "assessment",
    scales: ["brain_region"],
    ...overrides,
  };
}

describe("AssessmentFormPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("share 未加载完成:显示加载中", () => {
    useShareByTokenMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<AssessmentFormPage />);
    expect(screen.getByText(/加载中/)).toBeInTheDocument();
  });

  it("share 无效(查询返回 null):错误屏", () => {
    useShareByTokenMock.mockReturnValue({ data: undefined, isLoading: false });
    render(<AssessmentFormPage />);
    expect(screen.getByText(/链接无效或已过期/)).toBeInTheDocument();
  });

  it("mode=assessment + scales:向导首屏(标题 + 第 1 题 + 进度 + 导航)", () => {
    useShareByTokenMock.mockReturnValue({
      data: makeShare(),
      isLoading: false,
    });
    render(<AssessmentFormPage />);
    expect(screen.getByText(/自评量表/)).toBeInTheDocument();
    // 量表名来自 SCALE_LABEL
    expect(screen.getByText(/大脑区域定位表/)).toBeInTheDocument();
    // 一次一题向导:第 1 / 100 题,首屏只有导航没有提交按钮
    expect(screen.getByText(/第 1 \/ 100 题/)).toBeInTheDocument();
    expect(screen.getByTestId("next-question-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("submit-assessment-btn")).not.toBeInTheDocument();
  });

  it("答完全部必答题走到最后一题:出现提交按钮且可点", () => {
    useShareByTokenMock.mockReturnValue({
      data: makeShare(),
      isLoading: false,
    });
    render(<AssessmentFormPage />);
    // 脑区 99 道必答题:选第一个选项 → 点"下一题"
    for (let i = 0; i < 99; i++) {
      fireEvent.click(screen.getAllByTestId("wizard-option")[0]);
      fireEvent.click(screen.getByTestId("next-question-btn"));
    }
    // 第 100 题(Q46 电话偏好,选答)
    expect(screen.getByText(/第 100 \/ 100 题/)).toBeInTheDocument();
    const submit = screen.getByTestId("submit-assessment-btn");
    expect(submit).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });

  it("mode=summary(旧分享):渲染 PatientViewPage 摘要", () => {
    useShareByTokenMock.mockReturnValue({
      data: makeShare({ mode: "summary", scales: undefined }),
      isLoading: false,
    });
    render(<AssessmentFormPage />);
    expect(screen.getByTestId("patient-view-summary")).toBeInTheDocument();
  });
});