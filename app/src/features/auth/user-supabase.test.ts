import { describe, it, expect, beforeEach } from "vitest";
import { userRepository } from "./user.repository";
import {
  registerUserDual,
  loginByPasswordDual,
  isMultiUserMode,
} from "./user-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";

async function clearLocal() {
  const all = await userRepository.findAll();
  for (const u of all) await userRepository.remove(u.id);
}

describe("user auth dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("无 Supabase env 时 isMultiUserMode() = false", () => {
    expect(isMultiUserMode()).toBe(false);
  });

  it("registerUserDual 落回 localStorage 仓储", async () => {
    const user = await registerUserDual({
      username: "test-therapist",
      password: "password123",
      fullName: "测试治疗师",
      role: "therapist",
      orgId: ORG,
    });
    expect(user.username).toBe("test-therapist");
    expect(user.fullName).toBe("测试治疗师");
    expect(user.role).toBe("therapist");

    const all = await userRepository.findAll();
    expect(all.find((u) => u.username === "test-therapist")).toBeTruthy();
  });

  it("loginByPasswordDual 用正确密码登入", async () => {
    await registerUserDual({
      username: "loginer",
      password: "secret123",
      fullName: "登录人",
      role: "physician",
      orgId: ORG,
    });
    const u = await loginByPasswordDual("loginer", "secret123");
    expect(u.username).toBe("loginer");
    expect(u.role).toBe("physician");
  });

  it("loginByPasswordDual 错密码抛错", async () => {
    await registerUserDual({
      username: "wrong-pw-user",
      password: "right123",
      fullName: "X",
      role: "therapist",
      orgId: ORG,
    });
    await expect(
      loginByPasswordDual("wrong-pw-user", "wrong-pw"),
    ).rejects.toThrow(/用户名或密码错误/);
  });

  it("loginByPasswordDual 未知用户名抛错", async () => {
    await expect(
      loginByPasswordDual("nobody", "anything"),
    ).rejects.toThrow(/用户名或密码错误/);
  });
});
