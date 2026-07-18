/**
 * 轻量非阻塞提示 — 替代 alert/confirm 中的"提示型"用例。
 * 对于必须二次确认的危险操作，仍建议使用 ConfirmDialog。
 */
import { useEffect, useState } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let counter = 0;

function emit(kind: ToastKind, message: string): void {
  counter += 1;
  const item: ToastItem = { id: counter, kind, message };
  for (const l of listeners) l(item);
}

export const toast = {
  info: (m: string) => emit("info", m),
  success: (m: string) => emit("success", m),
  warning: (m: string) => emit("warning", m),
  error: (m: string) => emit("error", m),
};

export function useToasts(): ToastItem[] {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onAdd = (it: ToastItem) => {
      setItems((prev) => [...prev, it]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== it.id));
      }, 4000);
    };
    listeners.add(onAdd);
    return () => {
      listeners.delete(onAdd);
    };
  }, []);
  return items;
}
