/**
 * llm-engine 配置存取单测 — 覆盖"默认 model 一定可用"。
 *
 * 背景: Anthropic 官方 model 名带日期后缀(claude-haiku-4-5-20251001),
 * 用户没改 model 字段时,默认值必须直接可调通,否则点保存→点测试→失败,
 * 用户不知道是 model 名错还是 key 错。这就是"key 总是配不通"的核心症状之一。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLLMConfig, saveLLMConfig } from "./llm-engine";

const CONFIG_KEY = "anrm_llm_config";

describe("getLLMConfig — 默认 model 必须是 Anthropic 官方能接受的版本", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("localStorage 只存 apiUrl+apiKey(没 model)时,默认带日期后缀", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-test-xxx",
    }));
    const cfg = await getLLMConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("完全没 localStorage → getLLMConfig 返回 null,不抛错", async () => {
    const cfg = await getLLMConfig();
    expect(cfg).toBeNull();
  });

  it("localStorage 损坏(JSON.parse 失败)→ 返回 null", async () => {
    localStorage.setItem(CONFIG_KEY, "{not valid json");
    const cfg = await getLLMConfig();
    expect(cfg).toBeNull();
  });
});

describe("saveLLMConfig — 默认 model 落盘也是带日期后缀的官方名", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("用户没填 model 时,落盘的 model 是 claude-haiku-4-5-20251001", async () => {
    await saveLLMConfig({
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-test",
      model: "",
    });
    const raw = localStorage.getItem(CONFIG_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.model).toBe("claude-haiku-4-5-20251001");
  });

  it("用户显式传 deepseek-chat → 不会被默认值覆盖", async () => {
    await saveLLMConfig({
      apiUrl: "https://api.deepseek.com/chat/completions",
      apiKey: "sk-test",
      model: "deepseek-chat",
    });
    const cfg = await getLLMConfig();
    expect(cfg?.model).toBe("deepseek-chat");
  });
});