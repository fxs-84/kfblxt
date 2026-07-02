import { useEffect, useState } from "react";
import { z } from "zod";
import { listMockProfiles, type Profile } from "../../lib/profiles";
import type { Session } from "../../lib/session";
import { saveSession } from "./useSession";

const formSchema = z.object({
  userId: z.string().min(1, "请选择治疗师"),
  fullName: z.string().trim().min(1, "请输入姓名").max(40, "姓名过长"),
  role: z.enum(["admin", "physician", "therapist"]),
  orgId: z.string().min(1),
});

interface LoginDialogProps {
  open: boolean;
  current: Session;
  onClose: () => void;
}

export function LoginDialog({ open, current, onClose }: LoginDialogProps) {
  const profiles = listMockProfiles();
  const [selectedId, setSelectedId] = useState<string>(current.userId);
  const [fullName, setFullName] = useState(current.fullName);
  const [errors, setErrors] = useState<{ fullName?: string; userId?: string }>({});

  useEffect(() => {
    if (open) {
      setSelectedId(current.userId);
      setFullName(current.fullName);
      setErrors({});
    }
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 选择 mock profile → 自动填姓名 + 角色
  const handleSelectProfile = (profile: Profile) => {
    setSelectedId(profile.userId);
    setFullName(profile.fullName);
  };

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = formSchema.safeParse({
      userId: selectedId,
      fullName,
      role: profiles.find((p) => p.userId === selectedId)?.role ?? "therapist",
      orgId: current.orgId,
    });
    if (!parsed.success) {
      const fieldErrors: { fullName?: string; userId?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "fullName") fieldErrors.fullName = issue.message;
        if (key === "userId") fieldErrors.userId = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    saveSession(parsed.data);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
      >
        <header className="modal-card__head">
          <h2 id="login-dialog-title" className="modal-card__title">切换治疗师</h2>
          <button
            type="button"
            className="modal-card__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="modal-card__body">
          <p className="modal-card__hint">
            Phase 1 mock 登录 — 选择一个 mock 治疗师,后续操作会标记为该治疗师。
            真实接入 Supabase Auth 后由 JWT 注入会话。
          </p>

          <div className="field">
            <label>选择治疗师(mock)</label>
            <div className="profile-grid">
              {profiles.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  className={`profile-card ${selectedId === p.userId ? "profile-card--selected" : ""}`}
                  onClick={() => handleSelectProfile(p)}
                >
                  <span className="profile-card__avatar">{p.fullName.slice(0, 1)}</span>
                  <span className="profile-card__name">{p.fullName}</span>
                  <span className="profile-card__role">
                    {p.role === "admin" ? "管理员" : p.role === "physician" ? "医师" : "治疗师"}
                  </span>
                </button>
              ))}
            </div>
            {errors.userId && <span className="field__error">{errors.userId}</span>}
          </div>

          <div className="field">
            <label htmlFor="login-name">姓名</label>
            <input
              id="login-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="如:张医师"
            />
            {errors.fullName && <span className="field__error">{errors.fullName}</span>}
          </div>
        </div>

        <footer className="modal-card__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn--primary">
            登录
          </button>
        </footer>
      </form>
    </div>
  );
}
