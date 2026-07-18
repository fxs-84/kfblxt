/**
 * useDialogA11y — 给 <dialog> 元素加焦点管理和 Escape 关闭的 hook。
 *
 * 用法:
 *   const { dialogRef } = useDialogA11y({ open, onClose });
 *   return <dialog ref={dialogRef}>{...}</dialog>;
 *
 * 行为:
 *   - open=true  → dialog.showModal() + 把焦点移到 initialFocusSelector 或第一个输入/按钮
 *   - open=false → dialog.close() + 恢复打开前的 activeElement
 *   - Escape 键 → onClose()(原生 dialog 的 onCancel 也会触发,这里再保险一次)
 */

import { useEffect, useRef, type RefObject } from "react";

export interface UseDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  /** 可选,打开时优先聚焦这个选择器命中的元素 */
  initialFocusSelector?: string;
}

export interface UseDialogA11yResult {
  dialogRef: RefObject<HTMLDialogElement | null>;
}

export function useDialogA11y(options: UseDialogA11yOptions): UseDialogA11yResult {
  const { open, onClose, initialFocusSelector } = options;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  // 焦点管理 + dialog 开关
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previouslyFocusedRef.current = document.activeElement;
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          /* jsdom 不支持 showModal,吞掉 */
        }
      }
      // 初始焦点
      const initial = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const fallback =
        initial ||
        dialog.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        );
      if (fallback) fallback.focus();
      else dialog.focus();
    } else {
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          /* noop */
        }
      }
      const previous = previouslyFocusedRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    }
  }, [open, initialFocusSelector]);

  // Escape 兜底关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return { dialogRef };
}
