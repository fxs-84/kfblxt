/**
 * 通用仓储抽象(Repository Pattern)。业务逻辑依赖此接口而非具体存储,
 * Phase 1 用内存实现做 mock,后续换 Supabase 只需替换实现,调用方不变。
 * 所有返回值均为副本,保证不可变、杜绝隐藏副作用。
 */
export interface Entity {
  id: string;
  createdAt: Date;
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

  return {
    async findAll() {
      return [...store.values()].map(clone);
    },

    async findById(id) {
      const found = store.get(id);
      return found ? clone(found) : null;
    },

    async create(input) {
      const validated = options.validate ? options.validate(input) : input;
      const entity = {
        ...(validated as object),
        id: crypto.randomUUID(),
        createdAt: new Date(),
      } as T;
      store.set(entity.id, entity);
      return clone(entity);
    },

    async update(id, patch) {
      const existing = store.get(id);
      if (!existing) {
        throw new Error(`实体不存在: ${id}`);
      }
      const next = { ...existing, ...patch } as T;
      store.set(id, next);
      return clone(next);
    },

    async remove(id) {
      store.delete(id);
    },
  };
}
