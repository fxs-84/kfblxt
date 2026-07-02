import { useEffect, useState } from "react";
import { MOCK_SESSION, type Session } from "../../lib/session";

const SESSION_STORAGE_KEY = "anrm_session";

function readSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Session;
      if (parsed && typeof parsed.userId === "string" && typeof parsed.role === "string") {
        return parsed;
      }
    }
  } catch {
    // localStorage 不可用或 JSON 损坏 → 回退到 mock
  }
  return MOCK_SESSION;
}

/**
 * 响应式会话状态。登录/登出/切换角色后组件自动重渲染。
 * 同步访问请用 `getSession()`(不订阅变化)。
 */
export function useSession(): Session {
  const [session, setSession] = useState<Session>(() => readSession());

  useEffect(() => {
    const refresh = () => setSession(readSession());
    window.addEventListener("anrm:session-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("anrm:session-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return session;
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.error("[session] 保存失败:", e);
  }
  window.dispatchEvent(new CustomEvent("anrm:session-change"));
}

export function resetSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("anrm:session-change"));
}
