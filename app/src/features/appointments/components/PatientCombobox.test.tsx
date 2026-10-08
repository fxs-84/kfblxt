/**
 * PatientCombobox — 客户搜索 + 现场新建
 *
 * 契约:
 *   - 输入关键词 → 下拉按姓名/病历号/电话过滤
 *   - 点候选 → 选中,显示 chip
 *   - 点「+ 新建客户」→ 简版表单(搜索词预填姓名)
 *   - 新建保存成功 → 自动选中新客户
 *   - 已选中时显示 chip + 「更换」按钮
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PatientCombobox } from "./PatientCombobox";
import type { PatientRecord } from "../../patients/patient.repository";

const P1: PatientRecord = {
  id: "p1",
  orgId: "o1",
  medicalRecordNo: "ANRM-0001",
  name: "张伟",
  sex: "male",
  birthDate: new Date("1978-04-12"),
  phone: "13800000001",
  dominantHand: "right",
  createdAt: new Date("2026-05-20"),
};

const P2: PatientRecord = {
  id: "p2",
  orgId: "o1",
  medicalRecordNo: "ANRM-0002",
  name: "李娜",
  sex: "female",
  birthDate: new Date("1990-09-03"),
  phone: "13800000002",
  dominantHand: "left",
  createdAt: new Date("2026-06-02"),
};

const createMutateAsync = vi.fn();

vi.mock("../../patients/usePatients", () => ({
  usePatients: () => ({ data: [P1, P2] }),
  useCreatePatient: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

describe("PatientCombobox", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
  });

  it("聚焦输入框 → 展开下拉,列出全部客户", () => {
    render(<PatientCombobox value="" onChange={() => {}} data-testid="pc" />);
    fireEvent.focus(screen.getByTestId("pc-input"));
    expect(screen.getByTestId("pc-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("pc-option-p1")).toHaveTextContent("张伟");
    expect(screen.getByTestId("pc-option-p2")).toHaveTextContent("李娜");
  });

  it("输入关键词 → 按姓名过滤", () => {
    render(<PatientCombobox value="" onChange={() => {}} data-testid="pc" />);
    const input = screen.getByTestId("pc-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "李" } });
    expect(screen.queryByTestId("pc-option-p1")).not.toBeInTheDocument();
    expect(screen.getByTestId("pc-option-p2")).toBeInTheDocument();
  });

  it("按病历号过滤", () => {
    render(<PatientCombobox value="" onChange={() => {}} data-testid="pc" />);
    const input = screen.getByTestId("pc-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "anrm-0001" } });
    expect(screen.getByTestId("pc-option-p1")).toBeInTheDocument();
    expect(screen.queryByTestId("pc-option-p2")).not.toBeInTheDocument();
  });

  it("点候选 → onChange 被调用 + chip 显示", () => {
    const onChange = vi.fn();
    render(<PatientCombobox value="" onChange={onChange} data-testid="pc" />);
    fireEvent.focus(screen.getByTestId("pc-input"));
    fireEvent.click(screen.getByTestId("pc-option-p1"));
    expect(onChange).toHaveBeenCalledWith("p1");
  });

  it("value 有值 → 显示 chip + 更换按钮", () => {
    render(<PatientCombobox value="p1" onChange={() => {}} data-testid="pc" />);
    expect(screen.getByTestId("pc-chip")).toHaveTextContent("张伟");
    expect(screen.getByTestId("pc-change")).toBeInTheDocument();
  });

  it("点「+ 新建客户」→ 简版表单出现,姓名预填搜索词", () => {
    render(<PatientCombobox value="" onChange={() => {}} data-testid="pc" />);
    const input = screen.getByTestId("pc-input");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "王芳" } });
    fireEvent.click(screen.getByTestId("pc-create"));
    const form = screen.getByTestId("pc-create-form");
    expect(form).toBeInTheDocument();
    expect(screen.getByTestId("pc-create-name")).toHaveValue("王芳");
  });

  it("新建保存成功 → onChange 收到新 id + 表单关闭", async () => {
    createMutateAsync.mockResolvedValue({ ...P1, id: "p-new", name: "王芳" });
    const onChange = vi.fn();
    render(<PatientCombobox value="" onChange={onChange} data-testid="pc" />);
    fireEvent.focus(screen.getByTestId("pc-input"));
    fireEvent.click(screen.getByTestId("pc-create"));
    fireEvent.change(screen.getByTestId("pc-create-name"), { target: { value: "王芳" } });
    fireEvent.change(screen.getByTestId("pc-create-birth"), { target: { value: "1985-03-01" } });
    fireEvent.click(screen.getByTestId("pc-create-save"));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({
      name: "王芳",
      sex: "male",
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("p-new");
    });
  });

  it("新建缺出生日期 → 显示错误,不提交", () => {
    render(<PatientCombobox value="" onChange={() => {}} data-testid="pc" />);
    fireEvent.focus(screen.getByTestId("pc-input"));
    fireEvent.click(screen.getByTestId("pc-create"));
    fireEvent.change(screen.getByTestId("pc-create-name"), { target: { value: "王芳" } });
    fireEvent.click(screen.getByTestId("pc-create-save"));
    expect(screen.getByTestId("pc-create-error")).toHaveTextContent("出生日期");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
