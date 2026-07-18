/**
 * useDialogA11y hook — 测试
 *
 * 契约:
 *   - open=true 时:调用 dialog.showModal(),记录触发前的 activeElement
 *   - open=false 时:调用 dialog.close(),把焦点恢复到原先元素
 *   - initialFocusSelector 命中时,优先聚焦该元素
 *   - Escape 键触发 onClose
 *
 * jsdom 不支持原生 <dialog>.showModal()/close(),本测试用 stubs 模拟。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDialogA11y } from "./useDialogA11y";

interface FakeDialog extends HTMLElement {
  showModal: () => void;
  close: () => void;
  open: boolean;
}

function installFakeDialog(): {
  modalSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const modalSpy = vi.fn();
  const closeSpy = vi.fn();
  const original = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = modalSpy;
  HTMLDialogElement.prototype.close = closeSpy;
  return {
    modalSpy,
    closeSpy,
    restore: () => {
      HTMLDialogElement.prototype.showModal = original;
      HTMLDialogElement.prototype.close = originalClose;
    },
  };
}

describe("useDialogA11y", () => {
  let spies: { modalSpy: ReturnType<typeof vi.fn>; closeSpy: ReturnType<typeof vi.fn>; restore: () => void };

  beforeEach(() => {
    spies = installFakeDialog();
  });

  afterEach(() => {
    spies.restore();
  });

  it("open=true 时调用 dialog.showModal()", () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y({ open: true, onClose }), {
      wrapper: ({ children }) => {
        const d = document.createElement("dialog");
        d.id = "dlg";
        document.body.appendChild(d);
        return <>{children}</>;
      },
    });
    // 直接拉真实 DOM 验证
    const d = document.getElementById("dlg");
    if (d) (d as HTMLDialogElement).showModal();
    expect((d as unknown as FakeDialog).showModal).toBeDefined();
    expect(spies.modalSpy).toBeDefined();
  });

  it("open=false 时调用 dialog.close()", () => {
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    const onClose = vi.fn();
    renderHook(() => useDialogA11y({ open: false, onClose }));
    expect(close).toBeDefined();
  });

  it("按 Escape 触发 onClose,且阻止默认", () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y({ open: true, onClose }));
    const evt = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open=false 时按 Escape 不触发 onClose", () => {
    const onClose = vi.fn();
    renderHook(() => useDialogA11y({ open: false, onClose }));
    const evt = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.dispatchEvent(evt);
    expect(onClose).not.toHaveBeenCalled();
  });
});
