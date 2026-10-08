import { useEffect, useState } from "react";
import { useSession } from "../../../components/auth/useSession";
import { getSession } from "../../../lib/session";
import { userRepository, type UserRecord } from "../../auth/user.repository";
import { formatDate } from "../../../lib/format";
import type { AppointmentRecord, AppointmentInput } from "../appointment.repository";
import { PatientCombobox } from "./PatientCombobox";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from "../appointment.types";

/**
 * 列出当前机构可作为「负责治疗师」的用户。
 * 简化版:直接读 userRepository.findAll(),按 orgId 过滤。
 * (将来 Supabase 模式应该读 profiles 表;当前保持 single-source-of-truth 是 userRepository。)
 */
function useTherapists(): UserRecord[] {
  const [list, setList] = useState<UserRecord[]>([]);
  const session = getSession();
  useEffect(() => {
    let cancelled = false;
    userRepository.findAll().then((all) => {
      if (cancelled) return;
      setList(all.filter((u) => u.orgId === session.orgId));
    });
    return () => { cancelled = true; };
  }, [session.orgId]);
  return list;
}

interface AppointmentFormModalProps {
  /** 传入已有记录 = 编辑;不传 = 新建 */
  record?: AppointmentRecord | null;
  onClose: () => void;
  onSubmit: (input: Omit<AppointmentInput, "orgId">, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  submitting: boolean;
}

function toLocalInput(d: Date): string {
  // 转 <input type="datetime-local"> 的格式
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 新建/编辑预约弹窗。
 * 四个必填: 客户 / 项目名 / 时间+时长 / 负责治疗师。
 * 编辑时允许任意改字段(不走状态机) — 状态机只约束拖拽。
 */
export function AppointmentFormModal({ record, onClose, onSubmit, onDelete, submitting }: AppointmentFormModalProps) {
  const session = useSession();
  const therapists = useTherapists();

  const isEdit = Boolean(record);
  const [patientId, setPatientId] = useState(record?.patientId ?? "");
  const [projectName, setProjectName] = useState(record?.projectName ?? "");
  const [startAtLocal, setStartAtLocal] = useState(() =>
    record ? toLocalInput(record.startAt) : toLocalInput(new Date(Date.now() + 3600 * 1000)),
  );
  const [durationMin, setDurationMin] = useState(record?.durationMin ?? 45);
  const [therapistId, setTherapistId] = useState(record?.therapistId ?? session.userId);
  const [status, setStatus] = useState<AppointmentStatus>(record?.status ?? "pending");
  const [note, setNote] = useState(record?.note ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    const startAt = fromLocalInput(startAtLocal);
    if (!patientId) { setError("请选择客户"); return; }
    if (!projectName.trim()) { setError("请填写项目名"); return; }
    if (!startAt) { setError("请选择起始时间"); return; }
    if (!Number.isFinite(durationMin) || durationMin <= 0) { setError("时长必须为正整数分钟"); return; }
    if (!therapistId) { setError("请选择负责治疗师"); return; }

    try {
      await onSubmit(
        {
          patientId,
          projectName: projectName.trim(),
          startAt,
          durationMin,
          therapistId,
          status,
          note: note.trim() || undefined,
        },
        record?.id,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDelete = async () => {
    if (!record || !onDelete) return;
    try {
      await onDelete(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation" data-testid="appointment-form-backdrop">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-form-title"
      >
        <header className="modal-card__head">
          <h2 id="appointment-form-title" className="modal-card__title">
            {isEdit ? "✏️ 编辑预约" : "+ 新建预约"}
          </h2>
          <button type="button" className="modal-card__close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="modal-card__body">
          {isEdit && record && (
            <p className="modal-card__hint">
              当前状态:<b>{APPOINTMENT_STATUS_LABELS[record.status]}</b>
              {" · "}创建:{formatDate(record.createdAt)}
            </p>
          )}

          <div className="field">
            <label>客户 *</label>
            <PatientCombobox
              value={patientId}
              onChange={setPatientId}
              data-testid="appt-patient"
            />
          </div>

          <div className="field">
            <label htmlFor="appt-project">项目名 *</label>
            <input
              id="appt-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="如:颈椎训练 / 步态评估 / 脑区定位表复评"
              data-testid="appt-project"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="field">
              <label htmlFor="appt-start">起始时间 *</label>
              <input
                id="appt-start"
                type="datetime-local"
                value={startAtLocal}
                onChange={(e) => setStartAtLocal(e.target.value)}
                data-testid="appt-start"
              />
            </div>
            <div className="field">
              <label htmlFor="appt-duration">时长(分钟) *</label>
              <input
                id="appt-duration"
                type="number"
                min={5}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                data-testid="appt-duration"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="appt-therapist">负责治疗师 *</label>
            <select
              id="appt-therapist"
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              data-testid="appt-therapist"
            >
              {therapists.length === 0 && (
                <option value={session.userId}>{session.fullName}(当前)</option>
              )}
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="field">
              <label htmlFor="appt-status">状态(仅编辑时可改,绕过状态机)</label>
              <select
                id="appt-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                data-testid="appt-status"
              >
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{APPOINTMENT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="appt-note">备注</label>
            <textarea
              id="appt-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="客户特殊需求 / 注意事项"
              data-testid="appt-note"
            />
          </div>

          {error && (
            <p className="field__error" role="alert" data-testid="appt-error">⚠ {error}</p>
          )}
        </div>
        <footer className="modal-card__foot">
          {isEdit && onDelete && (
            confirmDelete ? (
              <>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={handleDelete}
                  disabled={submitting}
                  data-testid="appt-confirm-delete"
                >
                  确认删除
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ color: "var(--color-abnormal)", marginRight: "auto" }}
                onClick={() => setConfirmDelete(true)}
                data-testid="appt-delete"
              >
                删除
              </button>
            )
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>关闭</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="appt-save"
          >
            {submitting ? "保存中…" : isEdit ? "保存修改" : "创建预约"}
          </button>
        </footer>
      </div>
    </div>
  );
}
