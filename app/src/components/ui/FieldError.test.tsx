/**
 * FieldError 组件 — 测试
 *
 * 契约:
 *   - message 为空/undefined 时,渲染 null(不显示)
 *   - 有 message 时,渲染带有指定 id 和 role=alert 的 span,className 为 field__error
 *   - id 必须稳定传递 — 用于 aria-describedby 关联
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldError } from "./FieldError";

describe("FieldError", () => {
  it("有 message:渲染 role=alert 的 span,id 匹配", () => {
    render(<FieldError id="username-error" message="用户名至少 2 位" />);
    const el = screen.getByRole("alert");
    expect(el.getAttribute("id")).toBe("username-error");
    expect(el.textContent).toBe("用户名至少 2 位");
  });

  it("无 message:不渲染任何 DOM", () => {
    const { container } = render(<FieldError id="x-error" message={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("message 为空字符串:不渲染", () => {
    const { container } = render(<FieldError id="x-error" message="" />);
    expect(container.firstChild).toBeNull();
  });

  it("className 包含 field__error 以保留原有样式", () => {
    render(<FieldError id="x-error" message="错误" />);
    expect(screen.getByRole("alert").className).toMatch(/field__error/);
  });
});
