/**
 * Agent 对话历史仓储 — localStorage 持久化,30 天滚动清理。
 */
import { z } from "zod";
import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import type { AgentMessage } from "./agent-loop";

const RETENTION_DAYS = 30;

const conversationSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  messages: z.array(z.any()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export interface ConversationInput {
  title: string;
  messages: AgentMessage[];
}

export type ConversationRecord = ConversationInput & Entity;

export const conversationRepository: Repository<ConversationRecord, ConversationInput> =
  lazyPersistent<ConversationRecord, ConversationInput>("agent-conversations", [], {
    validate: (input) => conversationSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({ messages: true }).parse(input) as ConversationInput,
  });

/** 创建新对话 */
export async function createConversation(title: string): Promise<ConversationRecord> {
  return conversationRepository.create({ title, messages: [] });
}

/** 追加一条消息到对话 */
export async function appendMessage(conversationId: string, message: AgentMessage): Promise<ConversationRecord | null> {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) return null;
  return conversationRepository.update(conversationId, {
    messages: [...conv.messages, message],
    updatedAt: new Date(),
  });
}

/** 清理过期对话(>30 天未更新) */
export async function pruneOldConversations(): Promise<number> {
  const all = await conversationRepository.findAll();
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let removed = 0;
  for (const c of all) {
    if (c.updatedAt.getTime() < cutoff) {
      await conversationRepository.remove(c.id);
      removed++;
    }
  }
  return removed;
}

/** 自动生成对话标题:取首条用户消息前 30 字符 */
export function autoTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  return cleaned.length > 30 ? cleaned.slice(0, 30) + "…" : cleaned;
}