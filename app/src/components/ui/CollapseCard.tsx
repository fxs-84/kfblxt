import { useState } from "react";

interface CollapseCardProps {
  /** 卡片标题 */
  title: string;
  /** 默认是否展开 */
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** 标题旁额外信息 */
  extra?: React.ReactNode;
}

/**
 * 可折叠区域,默认折叠。
 * 不包裹额外 card,直接由子组件自身携带 card 样式。
 */
export function CollapseCard({ title, defaultOpen = false, children, extra }: CollapseCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
          padding: "var(--space-2) var(--space-5)",
          background: "var(--color-surface-sunken, #e9eef3)",
          borderRadius: "var(--radius-md) var(--radius-md) 0 0",
          borderBottom: open ? "1px solid var(--color-border)" : "none",
        }}
        onClick={() => setOpen(!open)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{title}</span>
          {extra}
        </div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          {open ? "⏶ 收起" : "⏷ 展开"}
        </span>
      </div>
      {open && <>{children}</>}
    </div>
  );
}
