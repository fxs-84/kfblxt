/**
 * Agent/AI 面板共享样式常量 — 从 AgentChat 提取,供各面板与主聊天窗统一使用。
 */
import type React from "react";

export const btnGhost: React.CSSProperties = {
  padding: "4px 8px", background: "transparent", border: "1px solid var(--color-border)",
  borderRadius: 4, cursor: "pointer", fontSize: 14,
};

export const btnPrimary: React.CSSProperties = {
  padding: "6px 14px", background: "var(--color-accent)", color: "white",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600,
};

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)",
  borderRadius: 4, fontFamily: "inherit",
};

export const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--color-text-muted)",
};

/** 覆盖式面板容器(聊天窗内的绝对定位全屏层) */
export const overlayPanelStyle: React.CSSProperties = {
  position: "absolute", top: 49, left: 0, right: 0, bottom: 0,
  background: "var(--color-surface)", zIndex: 5, padding: 16, overflowY: "auto",
};
