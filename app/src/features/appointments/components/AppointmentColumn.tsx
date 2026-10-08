import { useState } from "react";
import type { AppointmentRecord } from "../appointment.repository";
import { APPOINTMENT_STATUS_LABELS, canTransition, type AppointmentStatus } from "../appointment.types";
import { AppointmentCard } from "./AppointmentCard";

interface AppointmentColumnProps {
  status: AppointmentStatus;
  items: AppointmentRecord[];
  /** 拖拽放下(只有 canTransition 通过才会触发) */
  onDrop: (id: string, to: AppointmentStatus) => void;
  /** 点击卡片(打开编辑弹窗) */
  onCardClick: (record: AppointmentRecord) => void;
  /** 全局当前拖拽中的 appointment(用于校验这一列能否落) */
  draggingId: string | null;
  draggingRecord: AppointmentRecord | null;
  onDragStartChange: (id: string | null, record: AppointmentRecord | null) => void;
}

/**
 * 看板列容器 — 接受 drop,显示计数与空态。
 * 拖入校验:列头先调 canTransition 判断该列能否接受当前拖拽的卡片。
 */
export function AppointmentColumn({
  status,
  items,
  onDrop,
  onCardClick,
  draggingId,
  draggingRecord,
  onDragStartChange,
}: AppointmentColumnProps) {
  const [isOver, setIsOver] = useState(false);

  const canAccept =
    draggingRecord !== null &&
    draggingRecord.status !== status &&
    canTransition(draggingRecord.status, status);

  const label = APPOINTMENT_STATUS_LABELS[status];

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canAccept) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || !canAccept) return;
    onDrop(id, status);
  };

  return (
    <section
      className={`kanban-column kanban-column--${status} ${isOver && canAccept ? "kanban-column--drop-target" : ""} ${draggingId && !canAccept && draggingRecord?.status !== status ? "kanban-column--disabled" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`kanban-column-${status}`}
      aria-label={`${label} 列,共 ${items.length} 条`}
    >
      <header className="kanban-column__head">
        <h3 className="kanban-column__title">{label}</h3>
        <span className="kanban-column__count">{items.length}</span>
      </header>
      <div className="kanban-column__body">
        {items.length === 0 ? (
          <div className="kanban-column__empty">
            {draggingId && canAccept ? "拖到此处" : "暂无预约"}
          </div>
        ) : (
          items.map((r) => (
            <AppointmentCard
              key={r.id}
              record={r}
              dragging={draggingId === r.id}
              onDragStart={(e, id) => {
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.effectAllowed = "move";
                onDragStartChange(id, r);
              }}
              onDragEnd={() => onDragStartChange(null, null)}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </section>
  );
}
