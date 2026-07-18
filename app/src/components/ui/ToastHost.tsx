/**
 * 全局 Toast 容器 — 挂在 AppLayout 顶部。
 */
import { useToasts } from "../../lib/toast";

export function ToastHost() {
  const items = useToasts();
  if (items.length === 0) return null;
  return (
    <div className="toast-host" role="region" aria-live="polite" aria-label="通知">
      {items.map((it) => (
        <div key={it.id} className={`toast toast--${it.kind}`} role="status">
          {it.message}
        </div>
      ))}
    </div>
  );
}
