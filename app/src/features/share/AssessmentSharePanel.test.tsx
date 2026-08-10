/**
 * AssessmentSharePanel — 治疗师端"扫码填表(自评量表)"
 *
 * 契约:
 *   - 默认展示"+ 生成量表二维码"按钮
 *   - 点击后展示量表多选(2 个 checkbox)
 *   - 未勾选时生成按钮禁用
 *   - 勾选后生成按钮可用,点击 → createShare.mutateAsync 收到 mode='assessment' + scales
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AssessmentSharePanel } from "./AssessmentSharePanel";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <div data-testid="qr-svg">QR</div>,
}));

const { useAssessmentSharesByEncounterMock, useCreateAssessmentShareMock, useRevokeShareMock } = vi.hoisted(() => ({
  useAssessmentSharesByEncounterMock: vi.fn(),
  useCreateAssessmentShareMock: vi.fn(),
  useRevokeShareMock: vi.fn(),
}));

vi.mock("./useShare", () => ({
  useAssessmentSharesByEncounter: useAssessmentSharesByEncounterMock,
  useCreateAssessmentShare: useCreateAssessmentShareMock,
  useRevokeShare: useRevokeShareMock,
}));

describe("AssessmentSharePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAssessmentSharesByEncounterMock.mockReturnValue({ data: [] });
    useCreateAssessmentShareMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "share-1" }),
      isPending: false,
    });
    useRevokeShareMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("默认展示'+ 生成量表二维码'按钮", () => {
    render(<AssessmentSharePanel encounterId="e-1" patientId="p-1" />);
    expect(screen.getByRole("button", { name: /生成量表二维码/ })).toBeInTheDocument();
  });

  it("点击后展示 2 个量表选项(大脑区域定位表 + CSI/S-LANSS)", () => {
    render(<AssessmentSharePanel encounterId="e-1" patientId="p-1" />);
    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    expect(screen.getByTestId("scale-option-brain_region")).toBeInTheDocument();
    expect(screen.getByTestId("scale-option-pain_assessment")).toBeInTheDocument();
  });

  it("未勾选时生成按钮禁用", () => {
    render(<AssessmentSharePanel encounterId="e-1" patientId="p-1" />);
    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    expect(screen.getByTestId("generate-assessment-share-btn")).toBeDisabled();
  });

  it("勾选 brain_region 后点击生成 → mutateAsync 收到 mode=assessment + scales", () => {
    const mutateMock = vi.fn().mockResolvedValue({ id: "share-1" });
    useCreateAssessmentShareMock.mockReturnValue({ mutateAsync: mutateMock, isPending: false });

    render(<AssessmentSharePanel encounterId="e-1" patientId="p-1" />);
    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    fireEvent.click(screen.getByTestId("scale-option-brain_region").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("generate-assessment-share-btn"));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0]).toMatchObject({
      encounterId: "e-1",
      patientId: "p-1",
      mode: "assessment",
      scales: ["brain_region"],
    });
  });

  it("勾选两个量表后生成 → scales 含两个 ID", () => {
    const mutateMock = vi.fn().mockResolvedValue({ id: "share-1" });
    useCreateAssessmentShareMock.mockReturnValue({ mutateAsync: mutateMock, isPending: false });

    render(<AssessmentSharePanel encounterId="e-1" patientId="p-1" />);
    fireEvent.click(screen.getByRole("button", { name: /生成量表二维码/ }));
    fireEvent.click(screen.getByTestId("scale-option-brain_region").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("scale-option-pain_assessment").querySelector("input") as HTMLInputElement);
    fireEvent.click(screen.getByTestId("generate-assessment-share-btn"));

    expect(mutateMock.mock.calls[0][0].scales).toEqual(["brain_region", "pain_assessment"]);
  });
});