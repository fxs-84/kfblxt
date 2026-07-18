import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateAllToCloud, hasLocalData, type MigrationProgress, toISO, formatDate } from "./migrate";
import * as supabaseModule from "./supabase";

const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "11111111-0000-4000-8000-000000000001";

const PID = "bbbbbbbb-0000-4000-8000-000000000001";
const EID = "cccccccc-0000-4000-8000-000000000001";

let store = new Map<string, Record<string, unknown>[]>();

class FakeQuery {
  private table = "";
  private rows: Record<string, unknown>[] = [];
  private lastError: { message: string } | null = null;

  from(table: string): this {
    this.table = table;
    this.rows = store.get(table) ?? [];
    return this;
  }

  select(): this {
    if (fakeClient.selectError?.table === this.table) {
      this.lastError = { message: fakeClient.selectError.message };
    }
    return this;
  }

  eq(): this { return this; }
  is(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }

  insert(data: unknown): this {
    if (fakeClient.insertError) {
      this.lastError = { message: fakeClient.insertError };
      return this;
    }
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [data as Record<string, unknown>];
    const existing = store.get(this.table) ?? [];
    store.set(this.table, [...existing, ...arr]);
    return this;
  }

  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve({ data: this.rows[0] ?? null, error: this.lastError });
  }

  single(): Promise<{ data: unknown; error: unknown }> {
    if (this.rows.length !== 1) {
      return Promise.resolve({ data: null, error: { message: "Expected exactly one row" } });
    }
    return Promise.resolve({ data: this.rows[0], error: this.lastError });
  }

  then<TResult1 = { data: unknown; error: unknown }>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
  ): Promise<TResult1> {
    return Promise.resolve({ data: this.rows, error: this.lastError }).then(onFulfilled as never);
  }
}

const fakeClient = {
  insertError: null as string | null,
  selectError: null as { table: string; message: string } | null,
  from: (table: string) => new FakeQuery().from(table),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: USER } } }, error: null })),
  },
};

vi.mock("./supabase", () => ({
  getSupabase: () => fakeClient,
  hasSupabaseConfig: () => true,
  resetSupabaseClient: vi.fn(),
}));

vi.mock("./session", () => ({
  getSession: () => {
    try {
      const raw = localStorage.getItem("anrm_session");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.userId === "string" && parsed.role) return parsed;
      }
    } catch {
      // ignore
    }
    return { userId: USER, orgId: ORG, role: "admin", fullName: "Test" };
  },
  ANONYMOUS_SESSION: { userId: "anonymous", orgId: "00000000-0000-4000-8000-0000000000f0", role: "therapist", fullName: "未登录" },
  MOCK_SESSION: { userId: "anonymous", orgId: "00000000-0000-4000-8000-0000000000f0", role: "therapist", fullName: "未登录" },
}));

function seedLocalStorage(key: string, data: unknown[]): void {
  localStorage.setItem(`anrm_${key}`, JSON.stringify(data));
}

function setSession(role: string, userId = USER): void {
  localStorage.setItem("anrm_session", JSON.stringify({ userId, orgId: ORG, role, fullName: "Test" }));
}

describe("migrate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    store.clear();
    store.set("profiles", [{ id: USER, org_id: ORG, role: "admin", full_name: "Test" }]);
    localStorage.clear();
    fakeClient.insertError = null;
    fakeClient.selectError = null;
    fakeClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null });
  });

  it("hasLocalData returns false when no anrm_ keys", () => {
    expect(hasLocalData()).toBe(false);
  });

  it("hasLocalData returns true when anrm_ keys contain data", () => {
    seedLocalStorage("patients", [{ id: "not-a-uuid", name: "Test" }]);
    expect(hasLocalData()).toBe(true);
  });

  it("toISO handles Date, string and fallback", () => {
    const date = new Date("2024-01-15T08:00:00.000Z");
    expect(toISO(date)).toBe(date.toISOString());
    expect(toISO("2024-01-15T08:00:00.000Z")).toBe("2024-01-15T08:00:00.000Z");
    expect(toISO(undefined)).toMatch(/^\d{4}-/);
  });

  it("formatDate handles Date, string and empty", () => {
    const date = new Date("2024-01-15T08:00:00.000Z");
    expect(formatDate(date)).toBe("2024-01-15");
    expect(formatDate("2024-01-15T08:00:00.000Z")).toBe("2024-01-15");
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("")).toBeNull();
  });

  it("migrateAllToCloud imports patients and encounters", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        orgId: "mock-org",
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        phone: "13800000001",
        dominantHand: "right",
        createdAt: new Date().toISOString(),
      },
    ]);
    seedLocalStorage("encounters", [
      {
        id: EID,
        orgId: "mock-org",
        patientId: PID,
        encounterDate: new Date().toISOString(),
        visitType: "初诊",
        status: "进行中",
        amount: 200,
        chiefComplaint: { regions: ["head"], nature: ["痛"], vas: 5, durationText: "1天" },
        createdAt: new Date().toISOString(),
      },
    ]);

    const report = await migrateAllToCloud();

    expect(report.ok).toBe(true);
    const patientMod = report.modules.find((m) => m.module === "patients");
    expect(patientMod?.inserted).toBe(1);
    const encounterMod = report.modules.find((m) => m.module === "encounters");
    expect(encounterMod?.inserted).toBe(1);

    const patients = store.get("patients") ?? [];
    expect(patients[0].org_id).toBe(ORG);
    expect(patients[0].created_by).toBe(USER);

    const encounters = store.get("encounters") ?? [];
    expect(encounters[0].org_id).toBe(ORG);
    expect(encounters[0].amount).toBe(200);
  });

  it("migrateAllToCloud imports membership data", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "会员用户",
        sex: "female",
        birthDate: "1980-01-01",
        createdAt: new Date().toISOString(),
      },
    ]);
    seedLocalStorage("membership-memberships", [
      {
        patientId: PID,
        tier: "regular",
        points: 120,
        totalEarned: 200,
        totalSpent: 80,
        registeredAt: new Date().toISOString(),
      },
    ]);
    seedLocalStorage("membership-logs", [
      {
        id: "log-1",
        patientId: PID,
        delta: 100,
        balanceAfter: 100,
        reason: "注册奖励",
        createdAt: new Date().toISOString(),
      },
    ]);
    seedLocalStorage("membership-redemptions", [
      {
        id: "red-1",
        patientId: PID,
        rewardId: "reward-notebook",
        rewardName: "康复笔记本",
        pointsCost: 50,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ]);
    // 云端已有对应 reward product,保证 redemptions FK 不失败
    store.set("reward_products", [
      { id: "reward-notebook", org_id: ORG, name: "康复笔记本", category: "gift", points_cost: 50 },
    ]);

    const report = await migrateAllToCloud();

    const membershipMod = report.modules.find((m) => m.module === "membership");
    expect(membershipMod).toBeDefined();
    expect(membershipMod!.inserted).toBe(3);
    expect(membershipMod!.filtered).toBe(0);

    const memberships = store.get("patient_memberships") ?? [];
    expect(memberships[0].patient_id).toBe(PID);
    expect(memberships[0].org_id).toBe(ORG);

    const logs = store.get("points_logs") ?? [];
    expect(logs[0].patient_id).toBe(PID);

    const redemptions = store.get("redemptions") ?? [];
    expect(redemptions[0].reward_id).toBe("reward-notebook");
  });

  it("migrateAllToCloud filters redemptions when reward does not exist in cloud", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "会员用户",
        sex: "female",
        birthDate: "1980-01-01",
        createdAt: new Date().toISOString(),
      },
    ]);
    seedLocalStorage("membership-redemptions", [
      {
        id: "red-1",
        patientId: PID,
        rewardId: "missing-reward",
        rewardName: "已删商品",
        pointsCost: 50,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ]);

    const report = await migrateAllToCloud();

    const membershipMod = report.modules.find((m) => m.module === "membership");
    expect(membershipMod!.inserted).toBe(0);
    expect(membershipMod!.filtered).toBe(1);
    expect(membershipMod!.errors.some((e) => e.includes("missing-reward"))).toBe(true);
  });

  it("migrateAllToCloud rejects unauthorized role", async () => {
    setSession("admin");
    store.set("profiles", [{ id: USER, org_id: ORG, role: "therapist", full_name: "Test" }]);
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules[0].errors[0]).toContain("无权执行数据迁移");
  });

  it("migrateAllToCloud rejects session mismatch", async () => {
    fakeClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "other-user" } } },
      error: null,
    });
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules[0].errors[0]).toContain("会话不一致");
  });

  it("migrateAllToCloud uses Supabase userId as created_by, not local record createdBy", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        createdAt: new Date().toISOString(),
        createdBy: "anonymous",
      },
    ]);
    seedLocalStorage("encounters", [
      {
        id: EID,
        patientId: PID,
        encounterDate: new Date().toISOString(),
        visitType: "初诊",
        status: "进行中",
        createdAt: new Date().toISOString(),
        createdBy: "anonymous",
      },
    ]);

    const report = await migrateAllToCloud();
    expect(report.ok).toBe(true);

    const patients = store.get("patients") ?? [];
    const migratedPatient = patients.find((p) => p.id === PID);
    expect(migratedPatient?.created_by).toBe(USER);

    const encounters = store.get("encounters") ?? [];
    expect(encounters[0].created_by).toBe(USER);
  });

  it("migrateAllToCloud is idempotent on second run", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        createdAt: new Date().toISOString(),
      },
    ]);

    const first = await migrateAllToCloud();
    const patientMod1 = first.modules.find((m) => m.module === "patients");
    expect(patientMod1?.inserted).toBe(1);
    expect(patientMod1?.skipped).toBe(0);

    const second = await migrateAllToCloud();
    const patientMod2 = second.modules.find((m) => m.module === "patients");
    expect(patientMod2?.inserted).toBe(0);
    expect(patientMod2?.skipped).toBe(1);

    const patients = store.get("patients") ?? [];
    expect(patients.length).toBeGreaterThanOrEqual(1);
  });

  it("migrateAllToCloud rejects org mismatch", async () => {
    setSession("admin");
    store.set("profiles", [{ id: USER, org_id: "00000000-0000-0000-0000-000000000002", role: "admin", full_name: "Test" }]);
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules[0].errors[0]).toContain("机构不一致");
  });

  it("migrateAllToCloud reports error when Supabase is not configured", async () => {
    setSession("admin");
    vi.spyOn(supabaseModule, "hasSupabaseConfig").mockReturnValue(false);
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules[0].errors[0]).toContain("Supabase 未配置");
  });

  it("migrateAllToCloud reports error when Supabase client is null", async () => {
    setSession("admin");
    vi.spyOn(supabaseModule, "getSupabase").mockReturnValue(null);
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules[0].errors[0]).toContain("Supabase 客户端未初始化");
  });

  it("migrateAllToCloud isolates insert batch errors in module report", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        createdAt: new Date().toISOString(),
      },
    ]);
    fakeClient.insertError = "duplicate key value violates unique constraint";
    const report = await migrateAllToCloud();
    const patientMod = report.modules.find((m) => m.module === "patients");
    expect(patientMod).toBeDefined();
    expect(patientMod!.errors.length).toBeGreaterThan(0);
    expect(patientMod!.errors[0]).toContain("duplicate key");
  });

  it("migrateAllToCloud isolates encounter map fetch failure without stopping", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        createdAt: new Date().toISOString(),
      },
    ]);
    fakeClient.selectError = { table: "encounters", message: "timeout" };
    const report = await migrateAllToCloud();
    expect(report.ok).toBe(false);
    expect(report.modules.some((m) => m.module === "encounter_children" && m.errors.length > 0)).toBe(true);
    expect(report.modules.some((m) => m.module === "patients" && m.inserted >= 1)).toBe(true);
  });

  it("migrateAllToCloud emits progress events", async () => {
    setSession("admin");
    seedLocalStorage("patients", [
      {
        id: PID,
        name: "张伟",
        sex: "male",
        birthDate: "1978-04-12",
        createdAt: new Date().toISOString(),
      },
    ]);
    const events: MigrationProgress[] = [];
    await migrateAllToCloud((p) => events.push(p));
    const phases = events.map((e) => `${e.phase}:${e.module}`);
    expect(phases).toContain("start:patients");
    expect(phases).toContain("done:patients");
    expect(phases).toContain("start:membership");
  });
});
