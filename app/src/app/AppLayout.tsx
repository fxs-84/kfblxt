import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LoginDialog } from "../components/auth/LoginDialog";
import { resetSession, useSession } from "../components/auth/useSession";
import { AgentMonitor } from "../features/agent/AgentMonitor";
import { AgentChatFAB } from "../features/agent/AgentChatFAB";

const NAV = [
  { to: "/", label: "工作台", end: true, icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { to: "/patients", label: "患者", end: false, icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1" },
  { to: "/membership/rules", label: "积分规则", end: false, icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" },
];

const ROLE_LABEL: Record<string, string> = {
  physician: "医师",
  admin: "管理员",
  therapist: "治疗师",
};

export function AppLayout() {
  const session = useSession();
  const [loginOpen, setLoginOpen] = useState(false);

  const handleLogout = () => {
    resetSession();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">神经科学康复</div>
        <nav className="nav" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
      </aside>
      <main className="main">
        <Outlet />
      </main>

      <AgentMonitor />
      <AgentChatFAB />
      <LoginDialog
        open={loginOpen}
        current={session}
        onClose={() => setLoginOpen(false)}
      />

      {/* 隐藏的退出触发点:键盘快捷键 Ctrl+Shift+Q 登出(mock 阶段演示用) */}
      <button
        type="button"
        onClick={handleLogout}
        title="退出登录 (mock 演示用)"
        style={{
          position: "fixed",
          bottom: 4,
          left: 4,
          width: 1,
          height: 1,
          opacity: 0,
          border: 0,
          padding: 0,
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
