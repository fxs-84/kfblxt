import { useMemo, useState } from "react";
import { toast } from "../../lib/toast";
import { useSession } from "../../components/auth/useSession";
import {
  useAppointments,
  useCreateAppointment,
  useDeleteAppointment,
  useTransitionAppointment,
  useUpdateAppointment,
  useUpcomingAppointments,
} from "./useAppointments";
import type { AppointmentRecord, AppointmentInput } from "./appointment.repository";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "./appointment.types";
import { AppointmentColumn } from "./components/AppointmentColumn";
import { AppointmentFormModal } from "./components/AppointmentFormModal";
import { AppointmentReminders } from "./components/AppointmentReminders";

type DateFilter = "today" | "week" | "all";
type TherapistFilter = "mine" | "all";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isThisWeek(d: Date, now: Date): boolean {
  // 本周一 00:00 到本周日 23:59
  const day = now.getDay(); // 0=周日
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return d.getTime() >= monday.getTime() && d.getTime() < sunday.getTime();
}

/**
 * 客户预约看板。
 *
 * 交互:
 *  - 5 列(待确认 / 已确认 / 已到店 / 已完成 / 已取消),卡片可拖拽换列改状态
 *  - 点卡片 → 编辑弹窗
 *  - 顶部筛选:日期(今天/本周/全部) + 项目(从现有预约动态聚合) + 治疗师(我的/全部)
 *  - 顶部提醒条:今天/未来 24h 内要来的预约
 */
export function AppointmentsPage() {
  const session = useSession();
  const { data: appointments = [], isLoading } = useAppointments();
  const { data: upcoming = [] } = useUpcomingAppointments(24);

  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const transitionAppointment = useTransitionAppointment();
  const deleteAppointment = useDeleteAppointment();

  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [therapistFilter, setTherapistFilter] = useState<TherapistFilter>("all");

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AppointmentRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // 项目下拉的去重选项
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of appointments) set.add(a.projectName);
    return Array.from(set).sort();
  }, [appointments]);

  // 应用三个筛选
  const filtered = useMemo(() => {
    const now = new Date();
    return appointments.filter((a) => {
      if (therapistFilter === "mine" && a.therapistId !== session.userId) return false;
      if (projectFilter && a.projectName !== projectFilter) return false;
      if (dateFilter === "today" && !isSameDay(a.startAt, now)) return false;
      if (dateFilter === "week" && !isThisWeek(a.startAt, now)) return false;
      return true;
    });
  }, [appointments, therapistFilter, projectFilter, dateFilter, session.userId]);

  // 按状态分桶
  const byStatus = useMemo(() => {
    const map: Record<AppointmentStatus, AppointmentRecord[]> = {
      pending: [],
      confirmed: [],
      checked_in: [],
      completed: [],
      cancelled: [],
    };
    for (const a of filtered) map[a.status].push(a);
    return map;
  }, [filtered]);

  const draggingRecord = useMemo(
    () => (draggingId ? appointments.find((a) => a.id === draggingId) ?? null : null),
    [draggingId, appointments],
  );

  const handleDrop = async (id: string, to: AppointmentStatus) => {
    try {
      await transitionAppointment.mutateAsync({ id, to });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "变更状态失败");
    } finally {
      setDraggingId(null);
    }
  };

  const handleSubmitForm = async (input: Omit<AppointmentInput, "orgId">, id?: string) => {
    if (id) {
      await updateAppointment.mutateAsync({ id, patch: input });
      toast.success("预约已更新");
    } else {
      await createAppointment.mutateAsync(input);
      toast.success("预约已创建");
    }
    setEditing(null);
    setShowCreate(false);
  };

  const handleDelete = async (id: string) => {
    await deleteAppointment.mutateAsync(id);
    toast.success("预约已删除");
    setEditing(null);
  };

  const modalSubmitting =
    createAppointment.isPending || updateAppointment.isPending || deleteAppointment.isPending;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">预约看板</h1>
          <p className="page-subtitle">拖拽卡片改状态 · 点卡片编辑 · 顶部显示临近提醒</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShowCreate(true)}
          data-testid="new-appointment-btn"
        >
          + 新建预约
        </button>
      </header>

      {/* 临近预约提醒 */}
      <AppointmentReminders items={upcoming} onJump={setEditing} />

      {/* 筛选条 */}
      <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="filter-date" style={{ fontSize: "var(--text-xs)" }}>日期</label>
            <select
              id="filter-date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              data-testid="filter-date"
            >
              <option value="all">全部</option>
              <option value="today">今天</option>
              <option value="week">本周</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="filter-project" style={{ fontSize: "var(--text-xs)" }}>项目</label>
            <select
              id="filter-project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              data-testid="filter-project"
            >
              <option value="">全部项目</option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="filter-therapist" style={{ fontSize: "var(--text-xs)" }}>治疗师</label>
            <select
              id="filter-therapist"
              value={therapistFilter}
              onChange={(e) => setTherapistFilter(e.target.value as TherapistFilter)}
              data-testid="filter-therapist"
            >
              <option value="all">全部</option>
              <option value="mine">我的({session.fullName})</option>
            </select>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            共 {filtered.length} 条
          </div>
        </div>
      </div>

      {/* 看板 */}
      {isLoading ? (
        <div className="empty">加载中…</div>
      ) : (
        <div className="kanban-board" data-testid="kanban-board">
          {APPOINTMENT_STATUSES.map((status) => (
            <AppointmentColumn
              key={status}
              status={status}
              items={byStatus[status]}
              onDrop={handleDrop}
              onCardClick={setEditing}
              draggingId={draggingId}
              draggingRecord={draggingRecord}
              onDragStartChange={(id) => setDraggingId(id)}
            />
          ))}
        </div>
      )}

      {/* 新建 / 编辑弹窗 */}
      {(showCreate || editing) && (
        <AppointmentFormModal
          record={editing}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSubmit={handleSubmitForm}
          onDelete={editing ? handleDelete : undefined}
          submitting={modalSubmitting}
        />
      )}
    </>
  );
}
