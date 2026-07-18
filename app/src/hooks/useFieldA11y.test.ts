/**
 * useFieldA11y hook — 测试
 *
 * 行为契约:
 *   - 输入 name 字符串,返回 id/errorId + 一组可展开到 <input> 的 aria 属性
 *   - 无错误时:aria-invalid=false,不设 aria-describedby
 *   - 有错误时:aria-invalid=true,aria-describedby=errorId
 *   - id 在同 name 下稳定,跨多次调用也一致(用 React state)
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFieldA11y } from "./useFieldA11y";

describe("useFieldA11y", () => {
  it("无错误:aria-invalid=false,不设 aria-describedby", () => {
    const { result } = renderHook(() => useFieldA11y({ name: "username" }));
    expect(result.current.inputProps.id).toBe("username");
    expect(result.current.inputProps["aria-invalid"]).toBe(false);
    expect(result.current.inputProps["aria-describedby"]).toBeUndefined();
  });

  it("有错误:aria-invalid=true,aria-describedby 指向 errorId", () => {
    const { result } = renderHook(() =>
      useFieldA11y({ name: "username", error: "用户名至少 2 位" }),
    );
    expect(result.current.inputProps.id).toBe("username");
    expect(result.current.inputProps["aria-invalid"]).toBe(true);
    expect(result.current.inputProps["aria-describedby"]).toBe(result.current.errorId);
    expect(result.current.errorId).toBe("username-error");
  });

  it("error 为 empty string 时视为无错误", () => {
    const { result } = renderHook(() => useFieldA11y({ name: "username", error: "" }));
    expect(result.current.inputProps["aria-invalid"]).toBe(false);
    expect(result.current.inputProps["aria-describedby"]).toBeUndefined();
  });

  it("error 为 null/undefined 时不设 aria-describedby", () => {
    const { result: r1 } = renderHook(() => useFieldA11y({ name: "pwd", error: null }));
    expect(r1.current.inputProps["aria-invalid"]).toBe(false);

    const { result: r2 } = renderHook(() => useFieldA11y({ name: "pwd2" }));
    expect(r2.current.inputProps["aria-invalid"]).toBe(false);
  });

  it("errorProps 提供稳定 id 和 role=alert", () => {
    const { result } = renderHook(() =>
      useFieldA11y({ name: "email", error: "邮箱格式不对" }),
    );
    expect(result.current.errorProps.id).toBe(result.current.errorId);
    expect(result.current.errorProps.role).toBe("alert");
  });

  it("同一 name 在多次重渲中 id 稳定", () => {
    const { result, rerender } = renderHook(
      ({ hasError }: { hasError: boolean }) =>
        useFieldA11y({ name: "field-x", error: hasError ? "e" : null }),
      { initialProps: { hasError: false } },
    );
    const id1 = result.current.inputProps.id;
    const errId1 = result.current.errorId;
    rerender({ hasError: true });
    expect(result.current.inputProps.id).toBe(id1);
    expect(result.current.errorId).toBe(errId1);
  });
});
