/**
 * LoginDialog — 可访问性测试
 *
 * 契约:
 *   - <form> 不再带 role="dialog" — dialog 角色在外层容器上
 *   - 提交无效数据时,字段级错误通过 aria-describedby 关联
 *   - topError 区域带 role=alert(或 aria-live)
 *   - aria-labelledby 指向标题 id
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoginDialog } from "./LoginDialog";

// 避免组件访问真实 Supabase
vi.mock("../../lib/supabase", () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => null,
  resetSupabaseClient: () => {},
}));

vi.mock("../../features/auth/user-supabase", () => ({
  loginByPasswordDual: vi.fn(),
  registerUserDual: vi.fn(),
}));

import { loginByPasswordDual } from "../../features/auth/user-supabase";

const DUMMY_SESSION = {
  userId: "",
  orgId: "",
  fullName: "未登录",
  role: "therapist",
};

describe("LoginDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("外层 dialog 容器带 role=dialog 和 aria-labelledby", () => {
    const { container } = render(
      <LoginDialog open current={DUMMY_SESSION} onClose={vi.fn()} />,
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-labelledby")).toBe("login-dialog-title");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
  });

  it("提交空数据:字段出现 error,且通过 aria-describedby 关联", () => {
    render(<LoginDialog open current={DUMMY_SESSION} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    const username = screen.getByLabelText("用户名") as HTMLInputElement;
    const password = screen.getByLabelText("密码") as HTMLInputElement;

    expect(username.getAttribute("aria-invalid")).toBe("true");
    const userErr = username.getAttribute("aria-describedby");
    expect(userErr).toBeTruthy();
    expect(document.getElementById(userErr!)?.textContent).toContain("用户名至少");

    expect(password.getAttribute("aria-invalid")).toBe("true");
    const passErr = password.getAttribute("aria-describedby");
    expect(passErr).toBeTruthy();
    expect(document.getElementById(passErr!)?.textContent).toContain("密码至少");
  });

  it("form 标签本身不带 role=dialog", () => {
    const { container } = render(
      <LoginDialog open current={DUMMY_SESSION} onClose={vi.fn()} />,
    );
    const form = container.querySelector("form");
    expect(form?.getAttribute("role")).not.toBe("dialog");
  });

  it("提交失败时,顶部错误区域带 role=alert", async () => {
    (loginByPasswordDual as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("用户名或密码错误"),
    );
    render(<LoginDialog open current={DUMMY_SESSION} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "validname" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    const alert = await screen.findByText("用户名或密码错误");
    expect(alert.closest('[role="alert"]')).toBeTruthy();
  });

  it("按 Escape 触发 onClose", () => {
    const onClose = vi.fn();
    render(<LoginDialog open current={DUMMY_SESSION} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("打开时焦点移到用户名输入框", async () => {
    render(<LoginDialog open current={DUMMY_SESSION} onClose={vi.fn()} />);
    // requestAnimationFrame 在 jsdom 中需要手动触发
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const username = screen.getByLabelText("用户名");
    expect(document.activeElement).toBe(username);
  });
});
