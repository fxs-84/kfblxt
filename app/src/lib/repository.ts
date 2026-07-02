/**
 * 通用仓储抽象(Repository Pattern)。业务逻辑依赖此接口而非具体存储,
 * Phase 1 用内存实现做 mock,后续换 Supabase 只需替换实现,调用方不变。
 * 所有返回值均为副本,保证不可变、杜绝隐藏副作用。
 */
export interface Entity {
  id: string;
  createdAt: Date;
  /** 创建者(治疗师 userId) — 由仓储自动从会话注入,调用方不必传 */
  createdBy?: string;
  /** 最后修改者 — 由仓储自动维护 */
  updatedBy?: string;
  /** 最后修改时间 — 由仓储自动维护 */
  updatedAt?: Date;
  /** 软删除时间 — 设置后默认从 findAll/findById 中过滤 */
  deletedAt?: Date;
  /** 软删除操作者 */
  deletedBy?: string;
}

export interface Repository<T extends Entity, TInput> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(input: TInput): Promise<T>;
  update(id: string, patch: Partial<TInput>): Promise<T>;
  remove(id: string): Promise<void>;
}

interface MemoryRepositoryOptions<T extends Entity, TInput> {
  seed?: readonly T[];
  validate?: (input: TInput) => TInput;
  /** 治疗师归属注入器:由 storage 层提供,从会话读取 userId。 */
  resolveActor?: () => { userId: string } | null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryRepository<T extends Entity, TInput>(
  options: MemoryRepositoryOptions<T, TInput>,
): Repository<T, TInput> {
  const store = new Map<string, T>();
  for (const item of options.seed ?? []) {
    store.set(item.id, clone(item));
  }

  /** 过滤掉已软删的(默认) */
  const isActive = (e: T) => !e.deletedAt;

  return {
    async findAll() {
      return [...store.values()].filter(isActive).map(clone);
    },

    async findById(id) {
      const found = store.get(id);
      if (!found || !isActive(found)) return null;
      return clone(found);
    },

    async create(input) {
      const validated = options.validate ? options.validate(input) : input;
      const actor = options.resolveActor?.();
      const now = new Date();
      const entity = {
        ...(validated as object),
        id: crypto.randomUUID(),
        createdAt: now,
        createdBy: actor?.userId,
        updatedAt: now,
        updatedBy: actor?.userId,
      } as T;
      store.set(entity.id, entity);
      return clone(entity);
    },

    async update(id, patch) {
      const existing = store.get(id);
      if (!existing) {
        throw new Error(`实体不存在: ${id}`);
      }
      const actor = options.resolveActor?.();
      const now = new Date();
      const next = {
        ...existing,
        ...patch,
        updatedAt: now,
        updatedBy: actor?.userId,
      } as T;
      store.set(id, next);
      return clone(next);
    },

    /** 软删除:不真正移除,设 deletedAt + deletedBy。后续 findAll/findById 自动过滤。 */
    async remove(id) {
      const existing = store.get(id);
      if (!existing) return;
      const actor = options.resolveActor?.();
      const now = new Date();
      const next = {
        ...existing,
        deletedAt: now,
        deletedBy: actor?.userId,
        updatedAt: now,
        updatedBy: actor?.userId,
      } as T;
      store.set(id, next);
    },
  };
}
