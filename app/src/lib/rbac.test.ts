import { describe, it, expect } from "vitest";
import { can } from "./rbac";

describe("rbac", () => {
  it("admin 拥有所有权限(含 patient:delete 与 membership:delete)", () => {
    for (const p of ["patient:read", "patient:write", "patient:delete", "encounter:read", "encounter:write", "membership:delete"]) {
      expect(can("admin", p as never)).toBe(true);
    }
  });

  it("physician 不能删客户,但可删会员(patient:delete ✗ / membership:delete ✓)", () => {
    expect(can("physician", "patient:delete")).toBe(false);
    expect(can("physician", "membership:delete")).toBe(true);
  });

  it("therapist 没有删除权限(patient:delete / membership:delete)", () => {
    expect(can("therapist", "patient:delete")).toBe(false);
    expect(can("therapist", "membership:delete")).toBe(false);
  });

  it("membership:delete 权限矩阵 — admin+physician 可删,therapist 不可,锁定视图条件渲染不变量", () => {
    // 这是对齐 MembershipCenterPage 中 canDeleteMembership 的语义
    expect(can("admin", "membership:delete")).toBe(true);
    expect(can("physician", "membership:delete")).toBe(true);
    expect(can("therapist", "membership:delete")).toBe(false);
  });
});
