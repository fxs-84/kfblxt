import { useEffect, useState } from "react";
import { z } from "zod";
import { registerUser, loginByPassword } from "../../features/auth/user.repository";
import type { UserRole } from "../../lib/rbac";
import type { Session } from "../../lib/session";
import { saveSession } from "./useSession";

type Tab = "login" | "register";

const loginSchema = z.object({
  username: z.string().min(2, "用户名至少 2 位"),
  password: z.string().min(6, "密码至少 6 位"),
});

const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(1, "请输入姓名").max(40, "姓名过长"),
  role: z.enum(["admin", "physician", "therapist"]),
  orgId: z.string().min(1),
});

const ORG_ID = "00000000-0000-4000-8000-0000000000f0";

interface LoginDialogProps {
  open: boolean;
  current: Session;
  onClose: () => void;
}

export function LoginDialog({ open, current, onClose }: LoginDialogProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("therapist");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab("login");
      setUsername(current.fullName === "未登录" ? "" : "");
      setPassword("");
      setFullName("");
      setRole("therapist");
      setErrors({});
      setTopError(null);
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

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopError(null);
    setErrors({});

    if (tab === "login") {
      const parsed = loginSchema.safeParse({ username, password });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const k = String(issue.path[0]);
          fieldErrors[k] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }
      try {
        setSubmitting(true);
        const user = await loginByPassword(parsed.data.username, parsed.data.password);
        saveSession({ userId: user.id, orgId: user.orgId, fullName: user.fullName, role: user.role });
        onClose();
      } catch (err) {
        setTopError(err instanceof Error ? err.message : "登录失败");
      } finally {
        setSubmitting(false);
      }
    } else {
      const parsed = registerSchema.safeParse({ username, password, fullName, role, orgId: ORG_ID });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const k = String(issue.path[0]);
          fieldErrors[k] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }
      try {
        setSubmitting(true);
        const user = await registerUser({
          username: parsed.data.username,
          password: parsed.data.password,
          fullName: parsed.data.fullName,
          role: parsed.data.role,
          orgId: parsed.data.orgId,
        });
        saveSession({ userId: user.id, orgId: user.orgId, fullName: user.fullName, role: user.role });
        onClose();
      } catch (err) {
        setTopError(err instanceof Error ? err.message : "注册失败");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const isRegister = tab === "register";

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
          <h2 id="login-dialog-title" className="modal-card__title">
            {isRegister ? "注册治疗师账号" : "治疗师登录"}
          </h2>
          <button type="button" className="modal-card__close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        {/* Tab 切换 */}
        <div className="login-tabs" role="tablist" style={{ display: "flex", borderBottom: "1px solid var(--color-border)" }}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            onClick={() => { setTab("login"); setErrors({}); setTopError(null); }}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              background: tab === "login" ? "var(--color-surface)" : "transparent",
              border: "none",
              borderBottom: tab === "login" ? "2px solid var(--color-accent)" : "2px solid transparent",
              fontWeight: tab === "login" ? 700 : 400,
              cursor: "pointer",
            }}
          >登录</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            onClick={() => { setTab("register"); setErrors({}); setTopError(null); }}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              background: tab === "register" ? "var(--color-surface)" : "transparent",
              border: "none",
              borderBottom: tab === "register" ? "2px solid var(--color-accent)" : "2px solid transparent",
              fontWeight: tab === "register" ? 700 : 400,
              cursor: "pointer",
            }}
          >注册</button>
        </div>

        <div className="modal-card__body">
          {topError && (
            <div className="field" style={{ marginBottom: "var(--space-3)" }}>
              <span className="field__error" style={{ display: "block", padding: "var(--space-2) var(--space-3)", background: "var(--color-abnormal-bg, #fef2f2)", borderRadius: "var(--radius-sm)" }}>
                {topError}
              </span>
            </div>
          )}

          <div className="field">
            <label htmlFor="login-username">用户名</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="如:zhang"
              autoComplete="username"
            />
            {errors.username && <span className="field__error">{errors.username}</span>}
          </div>

          <div className="field">
            <label htmlFor="login-password">密码</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
            {errors.password && <span className="field__error">{errors.password}</span>}
          </div>

          {isRegister && (
            <>
              <div className="field">
                <label htmlFor="login-fullname">姓名</label>
                <input
                  id="login-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="如:张医师"
                />
                {errors.fullName && <span className="field__error">{errors.fullName}</span>}
              </div>

              <div className="field">
                <label htmlFor="login-role">角色</label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }}
                >
                  <option value="therapist">治疗师</option>
                  <option value="physician">医师</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            </>
          )}
        </div>

        <footer className="modal-card__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "处理中…" : isRegister ? "注册并登录" : "登录"}
          </button>
        </footer>
      </form>
    </div>
  );
}