/**
 * localStorage 持久化仓储包装器。
 * 每个仓储的 seed 数据只在首次运行时使用;后续从 localStorage 加载,
 * 每次 create/update/remove 后自动同步写盘。
 *
 * 用法:原 `createMemoryRepository(seed)` 改为 `createPersistentRepository(name, seed, validate)`。
 * 后续接 Supabase 时只需替换实现,调用方不变。
 */
import { createMemoryRepository, type Entity, type Repository } from "./repository";
import { getSession } from "./session";

const STORAGE_PREFIX = "anrm_";

function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

function loadFromStorage<T>(name: string): T[] { // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt as string),
      updatedAt: item.updatedAt ? new Date(item.updatedAt as string) : undefined,
      deletedAt: item.deletedAt ? new Date(item.deletedAt as string) : undefined,
      encounterDate: item.encounterDate ? new Date(item.encounterDate as string) : undefined,
      birthDate: item.birthDate ? new Date(item.birthDate as string) : undefined,
      dueDate: item.dueDate ? new Date(item.dueDate as string) : undefined,
      expiresAt: item.expiresAt ? new Date(item.expiresAt as string) : undefined,
      nextVisit: item.nextVisit ? new Date(item.nextVisit as string) : undefined,
      confirmedAt: item.confirmedAt ? new Date(item.confirmedAt as string) : undefined,
    })) as unknown as T[];
  } catch {
    return [];
  }
}

function saveToStorage<T>(name: string, data: T[]): void {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(data));
  } catch (e) {
    console.error(`[ANRM] 存储 ${name} 失败: localStorage 可能已满`, e);
  }
}

export interface PersistentOptions<TInput> {
  validate?: (input: TInput) => TInput;
}

/**
 * 创建带 localStorage 持久化的仓储。
 * @param name 唯一存储 key(如 "patients")
 * @param seed 首次运行的种子数据
 */
export async function createPersistentRepository<T extends Entity, TInput>(
  name: string,
  seed: readonly T[],
  options?: PersistentOptions<TInput>,
): Promise<Repository<T, TInput>> {
  const raw = loadFromStorage<T>(name);
  const withDates = raw.map((item) => {
    // Ensure Date objects are properly restored
    const record = item as Record<string, unknown>;
    return {
      ...record,
      createdAt: typeof record.createdAt === "string" ? new Date(record.createdAt) : record.createdAt,
      encounterDate: typeof record.encounterDate === "string" ? new Date(record.encounterDate) : record.encounterDate,
      birthDate: typeof record.birthDate === "string" ? new Date(record.birthDate) : record.birthDate,
      dueDate: typeof record.dueDate === "string" ? new Date(record.dueDate) : record.dueDate,
      expiresAt: typeof record.expiresAt === "string" ? new Date(record.expiresAt) : record.expiresAt,
    } as unknown as T;
  });

  // 首次使用 seed,后续用已存数据
  const initial: T[] = withDates.length > 0 ? withDates : [...seed];
  if (withDates.length === 0) {
    saveToStorage(name, initial);
  }

  const inner = createMemoryRepository<T, TInput>({
    seed: initial,
    validate: options?.validate,
    // 治疗师归属注入器:每次 create/update 自动从会话读取当前 userId
    resolveActor: () => {
      try {
        const s = getSession();
        return s ? { userId: s.userId } : null;
      } catch {
        return null;
      }
    },
  });

  /** 从内层仓储拉最新全量并写本地 */
  const persist = async () => {
    const all = await inner.findAll();
    saveToStorage(name, all);
  };

  return {
    findAll: inner.findAll,
    findById: inner.findById,

    create: async (input) => {
      const created = await inner.create(input);
      await persist();
      return created;
    },

    update: async (id, patch) => {
      const updated = await inner.update(id, patch);
      await persist();
      return updated;
    },

    remove: async (id) => {
      await inner.remove(id);
      await persist();
    },
  };
}


/**
 * 懒初始化持久化仓储(避免顶层 await)。
 * 用法: const repo = lazyPersistent("name", seed, opts);
 *       然后用 repo.findAll() 等(自动 await 初始化)
 */
export function lazyPersistent<T extends Entity, TInput>(
  name: string,
  seed: readonly T[],
  options?: PersistentOptions<TInput>,
): Repository<T, TInput> {
  let ready: Repository<T, TInput> | null = null;
  let promise: Promise<Repository<T, TInput>> | null = null;
  const get = async () => {
    if (ready) return ready;
    if (!promise) promise = createPersistentRepository(name, seed, options);
    ready = await promise;
    return ready;
  };
  return {
    findAll: () => get().then((r) => r.findAll()),
    findById: (id) => get().then((r) => r.findById(id)),
    create: (input) => get().then((r) => r.create(input)),
    update: (id, patch) => get().then((r) => r.update(id, patch)),
    remove: (id) => get().then((r) => r.remove(id)),
  };
}
