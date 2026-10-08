/**
 * AppointmentsPage 冒烟测试
 *
 * 契约:
 *   - 5 列(待确认/已确认/已到店/已完成/已取消)全部渲染
 *   - 卡片显示客户/项目/时间
 *   - 点击卡片 → 打开编辑弹窗
 *   - 「+ 新建预约」→ 打开新建弹窗
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AppointmentsPage } from "./AppointmentsPage";
import type { AppointmentRecord } from "./appointment.repository";
import type { AppointmentStatus } from "./appointment.types";

// 模拟 hooks — 不真的走仓储
const mockRecords: AppointmentRecord[] = [
  {
    id: "a1",
    createdAt: new Date("2026-10-01"),
    patientId: "p1",
    orgId: "o1",
    projectName: "颈椎训练",
    startAt: new Date("2026-10-08T14:00:00"),
    durationMin: 45,
    therapistId: "t1",
    status: "pending",
  },
  {
    id: "a2",
    createdAt: new Date("2026-10-01"),
    patientId: "p2",
    orgId: "o1",
    projectName: "步态评估",
    startAt: new Date("2026-10-09T10:00:00"),
    durationMin: 60,
    therapistId: "t1",
    status: "confirmed",
  },
];

vi.mock("./useAppointments", () => ({
  useAppointments: () => ({ data: mockRecords, isLoading: false }),
  useUpcomingAppointments: () => ({ data: [] }),
  useCreateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTransitionAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAppointment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// 卡片里用了 usePatient / useProfile;mock 掉避免触发真实查询
vi.mock("../patients/usePatients", () => ({
  usePatient: (id: string) => ({ data: { id, name: id === "p1" ? "张伟" : "李娜" } }),
  usePatients: () => ({ data: [] }),
  useCreatePatient: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/profiles", () => ({
  useProfile: () => ({ id: "t1", fullName: "李治疗师", role: "therapist" }),
}));

vi.mock("../../components/auth/useSession", () => ({
  useSession: () => ({
    userId: "t1",
    orgId: "o1",
    fullName: "李治疗师",
    role: "therapist",
  }),
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AppointmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppointmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("5 列看板全部渲染", () => {
    renderPage();
    for (const status of ["pending", "confirmed", "checked_in", "completed", "cancelled"] as AppointmentStatus[]) {
      expect(screen.getByTestId(`kanban-column-${status}`)).toBeInTheDocument();
    }
  });

  it("卡片显示客户名 + 项目 + 时长", () => {
    renderPage();
    expect(screen.getByTestId("appointment-card-a1")).toHaveTextContent("张伟");
    expect(screen.getByTestId("appointment-card-a1")).toHaveTextContent("颈椎训练");
    expect(screen.getByTestId("appointment-card-a1")).toHaveTextContent("45 分钟");
  });

  it("卡片落到对应状态列", () => {
    renderPage();
    const pendingCol = screen.getByTestId("kanban-column-pending");
    const confirmedCol = screen.getByTestId("kanban-column-confirmed");
    expect(pendingCol).toContainElement(screen.getByTestId("appointment-card-a1"));
    expect(confirmedCol).toContainElement(screen.getByTestId("appointment-card-a2"));
  });

  it("点击卡片 → 打开编辑弹窗", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("appointment-card-a1"));
    await waitFor(() => {
      expect(screen.getByTestId("appointment-form-backdrop")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /编辑预约/ })).toBeInTheDocument();
  });

  it("点击 + 新建预约 → 打开新建弹窗", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("new-appointment-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("appointment-form-backdrop")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /新建预约/ })).toBeInTheDocument();
  });
});
