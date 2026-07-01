import { NavLink, Outlet } from "react-router-dom";
import { getSession } from "../lib/session";

const NAV = [
  { to: "/", label: "工作台", end: true, icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { to: "/patients", label: "患者", end: false, icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1" },
];

export function AppLayout() {
  const session = getSession();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar__brand">ANRM 病历</div>
          <div className="sidebar__org">神经科学康复</div>
        </div>
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
        <div className="sidebar__user">
          <div className="sidebar__avatar">{session.fullName.slice(0, 1)}</div>
          <div>
            <div className="sidebar__user-name">{session.fullName}</div>
            <div className="sidebar__user-role">
              {session.role === "physician" ? "医师" : session.role === "admin" ? "管理员" : "治疗师"}
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
