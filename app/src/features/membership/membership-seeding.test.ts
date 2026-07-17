import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUILTIN_RULES, DEFAULT_TIERS } from "./builtin-rules";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const USER = "11111111-0000-4000-8000-000000000001";

type FilterOp = "eq" | "is";
interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

class MockQuery {
  private table = "";
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private orderBy?: { column: string; ascending: boolean };
  private limitN?: number;
  private insertRows: Record<string, unknown>[] = [];
  private updateRow: Record<string, unknown> = {};
  private headOnly = false;

  constructor(private readonly store: Map<string, Record<string, unknown>[]>) {}

  from(table: string): this {
    this.table = table;
    return this;
  }

  select(_columns = "*", opts?: { count?: string; head?: boolean }): this {
    this.operation = "select";
    this.headOnly = opts?.head ?? false;
    return this;
  }

  insert(rows: unknown): this {
    this.operation = "insert";
    this.insertRows = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [rows as Record<string, unknown>];
    return this;
  }

  update(row: Record<string, unknown>): this {
    this.operation = "update";
    this.updateRow = row;
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: "is", value });
    return this;
  }

  order(column: string, { ascending = true } = {}): this {
    this.orderBy = { column, ascending };
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    return Promise.resolve(this.execute()).then(({ data }) => ({
      data: data && data.length > 0 ? data[0] : null,
      error: null,
    }));
  }

  single(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    return this.maybeSingle();
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onFulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onFulfilled as never, onRejected as never);
  }

  private execute(): { data: unknown; error: null; count?: number } {
    if (this.operation === "select") {
      let rows = [...(this.store.get(this.table) ?? [])];
      rows = rows.filter((row) => this.filters.every((f) => this.matches(row, f)));
      if (this.orderBy) {
        rows.sort((a, b) => {
          const av = a[this.orderBy!.column];
          const bv = b[this.orderBy!.column];
          if (av == null || bv == null) return 0;
          const direction = this.orderBy!.ascending ? 1 : -1;
          return av < bv ? -direction : av > bv ? direction : 0;
        });
      }
      if (this.limitN !== undefined) rows = rows.slice(0, this.limitN);
      if (this.headOnly) {
        return { data: null, error: null, count: rows.length };
      }
      return { data: rows, error: null };
    }

    if (this.operation === "insert") {
      const seeded = this.insertRows.map((row) => ({
        ...row,
        org_id: row.org_id ?? ORG,
        created_by: row.created_by ?? USER,
        created_at: new Date().toISOString(),
      }));
      const existing = this.store.get(this.table) ?? [];
      this.store.set(this.table, [...existing, ...seeded]);
      return { data: seeded, error: null };
    }

    if (this.operation === "update") {
      const existing = this.store.get(this.table) ?? [];
      const updated = existing.map((row) => ({ ...row, ...this.updateRow }));
      this.store.set(this.table, updated);
      return { data: updated, error: null };
    }

    if (this.operation === "delete") {
      this.store.set(this.table, []);
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  private matches(row: Record<string, unknown>, filter: Filter): boolean {
    const value = row[filter.column];
    if (filter.op === "eq") return value === filter.value;
    if (filter.op === "is") {
      if (filter.value === null) return value === null || value === undefined;
      return value === filter.value;
    }
    return true;
  }
}

class MockSupabaseClient {
  private store = new Map<string, Record<string, unknown>[]>();

  from(table: string): MockQuery {
    return new MockQuery(this.store).from(table);
  }

  clear(): void {
    this.store.clear();
  }

  getTable(table: string): Record<string, unknown>[] {
    return [...(this.store.get(table) ?? [])];
  }
}

function createMockClient(): SupabaseClient {
  return new MockSupabaseClient() as unknown as SupabaseClient;
}

let mockClient = createMockClient();

const ANONYMOUS_SESSION = {
  userId: "anonymous",
  orgId: ORG,
  role: "therapist",
  fullName: "未登录",
};

let mockSession = {
  userId: USER,
  orgId: ORG,
  role: "admin",
  fullName: "Test",
};

function resetMockSession(): void {
  mockSession = {
    userId: USER,
    orgId: ORG,
    role: "admin",
    fullName: "Test",
  };
}

vi.mock("../../lib/supabase", () => ({
  getSupabase: () => mockClient,
  resetSupabaseClient: vi.fn(),
  hasSupabaseConfig: () => true,
}));

vi.mock("../../lib/session", () => ({
  getSession: () => mockSession,
  ANONYMOUS_SESSION,
  MOCK_SESSION: ANONYMOUS_SESSION,
}));

let testOrgCounter = 0;
function uniqueOrg(): string {
  return `00000000-0000-4000-8000-${String(testOrgCounter++).padStart(12, "0")}`;
}

beforeEach(() => {
  mockClient.clear();
  resetMockSession();
  mockSession.orgId = uniqueOrg();
});

const REWARD_IDS = [
  "reward_elastics",
  "reward_balance_disc",
  "reward_phone_followup",
  "reward_online_qa",
  "reward_discount_90",
  "reward_free_visit",
  "reward_expert",
  "reward_plan",
];

describe("membership Supabase seeding", () => {
  it("exports a seed/init function", async () => {
    const mod = await import("./membership-supabase");
    expect(mod.ensureSeededDual).toBeDefined();
    expect(typeof mod.ensureSeededDual).toBe("function");
  });

  it("seeds built-in points rules when points_rules is empty", async () => {
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();

    const rules = mockClient.getTable("points_rules");
    expect(rules).toHaveLength(BUILTIN_RULES.length);
    expect(rules.map((r) => r.id).sort()).toEqual(BUILTIN_RULES.map((r) => r.id).sort());
    expect(rules.every((r) => r.org_id === mockSession.orgId && r.created_by === USER)).toBe(true);
  });

  it("seeds default tier configs when tier_configs is empty", async () => {
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();

    const tiers = mockClient.getTable("tier_configs");
    expect(tiers).toHaveLength(DEFAULT_TIERS.length);
    expect(tiers.map((t) => t.tier).sort()).toEqual(DEFAULT_TIERS.map((t) => t.tier).sort());
    expect(tiers.every((t) => t.org_id === mockSession.orgId && t.created_by === USER)).toBe(true);
  });

  it("seeds default reward products when reward_products is empty", async () => {
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();

    const rewards = mockClient.getTable("reward_products");
    expect(rewards).toHaveLength(REWARD_IDS.length);
    for (const id of REWARD_IDS) {
      expect(rewards.some((r) => r.id === id)).toBe(true);
    }
    expect(rewards.every((r) => r.org_id === mockSession.orgId && r.created_by === USER)).toBe(true);
  });

  it("is idempotent — calling twice does not duplicate rows", async () => {
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();
    await ensureSeededDual();

    expect(mockClient.getTable("points_rules")).toHaveLength(BUILTIN_RULES.length);
    expect(mockClient.getTable("tier_configs")).toHaveLength(DEFAULT_TIERS.length);
    expect(mockClient.getTable("reward_products")).toHaveLength(REWARD_IDS.length);
  });

  it("非 admin/physician 角色不会写入种子", async () => {
    mockSession.role = "therapist";
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();

    expect(mockClient.getTable("points_rules")).toHaveLength(0);
    expect(mockClient.getTable("tier_configs")).toHaveLength(0);
    expect(mockClient.getTable("reward_products")).toHaveLength(0);
  });

  it("部分规则已存在时只补充缺失", async () => {
    const seedRule = BUILTIN_RULES[0];
    await mockClient.from("points_rules").insert([{
      ...seedRule,
      conditions: JSON.stringify(seedRule.conditions),
      action: JSON.stringify(seedRule.action),
      org_id: mockSession.orgId,
      created_by: USER,
      created_at: new Date().toISOString(),
    }]);

    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();

    const rules = mockClient.getTable("points_rules");
    expect(rules).toHaveLength(BUILTIN_RULES.length);
    expect(rules.some((r) => r.id === seedRule.id)).toBe(true);
  });

  it("切换 org 后为新机构重新 seed", async () => {
    const { ensureSeededDual } = await import("./membership-supabase");
    await ensureSeededDual();
    expect(mockClient.getTable("points_rules")).toHaveLength(BUILTIN_RULES.length);

    const otherOrg = "22222222-0000-4000-8000-000000000002";
    mockSession.orgId = otherOrg;
    await ensureSeededDual();

    const allRules = mockClient.getTable("points_rules");
    expect(allRules).toHaveLength(BUILTIN_RULES.length * 2);
    expect(allRules.filter((r) => r.org_id === otherOrg)).toHaveLength(BUILTIN_RULES.length);
  });

  it("findAllRulesDual 查询空表时会自动触发 seed 并返回内置规则", async () => {
    const { findAllRulesDual } = await import("./membership-supabase");
    const rules = await findAllRulesDual();
    expect(rules.length).toBeGreaterThanOrEqual(BUILTIN_RULES.length);
    for (const builtin of BUILTIN_RULES) {
      expect(rules.some((r) => r.id === builtin.id)).toBe(true);
    }
  });
});
