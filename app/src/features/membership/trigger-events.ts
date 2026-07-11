/**
 * 事件总线 — 触发器发送给规则引擎
 * 简易 EventEmitter,避免引入 mitt
 */
import type { TriggerEvent } from "./models";

type Handler = (event: TriggerEvent) => void | Promise<void>;

class EventBus {
  private handlers = new Set<Handler>();

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: TriggerEvent): Promise<void> {
    for (const h of this.handlers) {
      try {
        await h(event);
      } catch (e) {
        console.error("[membership/event-bus] handler failed:", e);
      }
    }
  }
}

/** 挂 window 上防止生产 build 多 chunk 复制出多个实例 */
const KEY = "__anrm_membership_bus";
const g = globalThis as Record<string, unknown>;
const membershipBus: EventBus = (g[KEY] as EventBus) ?? new EventBus();
if (!g[KEY]) g[KEY] = membershipBus;

export { membershipBus };