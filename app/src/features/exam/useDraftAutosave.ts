import { useEffect, useRef, useState, useCallback } from "react";

/**
 * 通用草稿自动保存 hook:
 *  - state 变化时延迟 600ms 写入 localStorage(key 带 encounterId)
 *  - 切换页面/刷新后回到同 encounter 时,自动 hydrate 草稿
 *  - key 变化时自动重新 hydrate(跨记录切换时数据隔离)
 *  - 支持显式 saveDraft() / clearDraft() 手动覆盖
 *  - 空 key = 不启用
 */
export function useDraftAutosave<T extends object>(
  key: string,
  initial: T,
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  saveDraft: (next?: T) => void;
  clearDraft: () => void;
  hasDraft: boolean;
  lastSavedAt: Date | null;
} {
  const storageKey = key ? `draft:${key}` : "";
  const enabled = Boolean(storageKey);

  // 从 localStorage 读取,无草稿则返回 initial
  const hydrate = useCallback(() => {
    if (!storageKey) return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...initial, ...JSON.parse(raw) } as T;
    } catch { /* 静默 */ }
    return initial;
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevKeyRef = useRef(storageKey);
  const [value, setValueState] = useState<T>(hydrate);
  const [hasDraft, setHasDraft] = useState<boolean>(Boolean(storageKey && localStorage.getItem(storageKey)));
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    if (!storageKey) return null;
    const ts = localStorage.getItem(storageKey + ":ts");
    return ts ? new Date(ts) : null;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // key 变化时重新 hydrate + 清理旧 key 的 timer
  useEffect(() => {
    const prev = prevKeyRef.current;
    if (prev !== storageKey) {
      prevKeyRef.current = storageKey;
      if (timer.current) clearTimeout(timer.current);
    }
    const fresh = hydrate();
    setValueState(fresh);
    setHasDraft(Boolean(storageKey && localStorage.getItem(storageKey)));
    const ts = localStorage.getItem(storageKey + ":ts");
    setLastSavedAt(ts ? new Date(ts) : null);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 卸载时 flush
  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        localStorage.setItem(storageKey, JSON.stringify(valueRef.current));
        localStorage.setItem(storageKey + ":ts", new Date().toISOString());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) {
    return { value: initial, setValue: () => {}, saveDraft: () => {}, clearDraft: () => {}, hasDraft: false, lastSavedAt: null };
  }

  const saveDraft = (next?: T) => {
    const v = next ?? value;
    try {
      localStorage.setItem(storageKey, JSON.stringify(v));
      localStorage.setItem(storageKey + ":ts", new Date().toISOString());
      setHasDraft(true);
      setLastSavedAt(new Date());
    } catch (e) {
      console.warn("[draft] 保存失败", e);
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(storageKey + ":ts");
      setHasDraft(false);
      setLastSavedAt(null);
    } catch { /* 静默 */ }
  };

  const setValue = (next: T | ((prev: T) => T)) => {
    setValueState((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => saveDraft(v), 600);
      return v;
    });
  };

  return { value, setValue, saveDraft, clearDraft, hasDraft, lastSavedAt };
}