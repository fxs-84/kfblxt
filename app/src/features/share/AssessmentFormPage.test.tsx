/**
 * AssessmentFormPage — 顾客扫码统一入口
 *
 * 契约:
 *   - token 无效/不存在 → 错误屏
 *   - mode=assessment 且有 scales → 渲染问卷(量表名 + 提交按钮)
 *   - mode=summary/缺失 → 渲染 PatientViewPage(只读摘要)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("mode=assessment + scales:渲染问卷标题 + 提交按钮", () => {
    useShareByTokenMock.mockReturnValue({
      data: makeShare(),
      isLoading: false,
    });
    render(<AssessmentFormPage />);
    expect(screen.getByText(/自评量表/)).toBeInTheDocument();
    expect(screen.getByTestId("submit-assessment-btn")).toBeInTheDocument();
    // 量表名来自 SCALE_LABEL
    expect(screen.getByText(/大脑区域定位表/)).toBeInTheDocument();
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