import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LoginDialog } from "../components/auth/LoginDialog";
import { resetSession, useSession } from "../components/auth/useSession";
import { getSupabase, resetSupabaseClient } from "../lib/supabase";
import { AgentMonitor } from "../features/learning/AgentMonitor";
import { AgentChatFAB } from "../features/agent/AgentChatFAB";
import { ToastHost } from "../components/ui/ToastHost";

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  icon: string;
}

const NAV: NavItem[] = [
  {
    to: "/",
    label: "工作台",
    end: true,
    icon: "M3 12l9-9 9 9M5 10v10h14V10",
  },
  {
    to: "/patients",
    label: "客户",
    end: false,
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1",
  },
  {
    to: "/cashier",
    label: "充值/消费",
    end: false,
    icon: "M17 9V7a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0a2 2 0 100 4m0-4V7m0 4h6m0-4v4m0 0a2 2 0 100 4m0-4v4",
  },
  {
    to: "/membership/dashboard",
    label: "会员中心",
    end: false,
    // 礼物/会员图标
    icon: "M20 7h-1V6a3 3 0 00-3-3H8a3 3 0 00-3 3v1H4a2 2 0 00-2 2v2a4 4 0 004 4v3a2 2 0 002 2h8a2 2 0 002-2v-3a4 4 0 004-4V9a2 2 0 00-2-2zM7 6a1 1 0 011-1h8a1 1 0 011 1v1H7V6zm3 11v4H8v-4h2zm4 0h2v4h-2v-4z",
  },
];

const ROLE_LABEL: Record<string, string> = {
  physician: "医师",
  admin: "管理员",
  therapist: "治疗师",
};

export function AppLayout() {
  const session = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    // Supabase 登出(清除服务器 session)
    try { await getSupabase()?.auth.signOut(); } catch { /* noop */ }
    resetSupabaseClient();
    resetSession();
  }, []);

  return (
    <div className="app-shell">
      {/* 移动端汉堡按钮 — 仅 < 768px 显示 */}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setDrawerOpen((v) => !v)}
        aria-label={drawerOpen ? "关闭菜单" : "打开菜单"}
        aria-expanded={drawerOpen}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {drawerOpen && (
        <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar${drawerOpen ? " is-open" : ""}`}>
        <div className="sidebar__brand">神经科学康复</div>
        <nav className="nav" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setDrawerOpen(false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="sidebar__user"
          onClick={() => setLoginOpen(true)}
          aria-label="切换治疗师"
        >
          <span className="sidebar__avatar" aria-hidden="true">
            {session.fullName.slice(0, 1)}
          </span>
          <span className="sidebar__user-meta">
            <span className="sidebar__user-name">{session.fullName}</span>
            <span className="sidebar__user-role">
              {ROLE_LABEL[session.role] ?? session.role}
            </span>
          </span>
          <span className="sidebar__user-action" aria-hidden="true">↗</span>
        </button>
        <button
          type="button"
          className="sidebar__logout"
          onClick={handleLogout}
          aria-label="退出登录"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            width: "100%",
            padding: "var(--space-2) var(--space-4)",
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted, #999)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          退出登录
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>

      <AgentMonitor />
      <AgentChatFAB />
      <ToastHost />
      <LoginDialog
        open={loginOpen}
        current={session}
        onClose={() => setLoginOpen(false)}
      />
    </div>
  );
}