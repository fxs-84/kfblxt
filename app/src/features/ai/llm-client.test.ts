/**
 * llm-client 纯函数单测 — 覆盖 URL 纠错 + URL 解析(不打网络)
 */
import { describe, it, expect, vi } from "vitest";
import { cleanApiUrl, resolveFetchUrl, pingLLM, LLMCallError } from "./llm-client";

describe("cleanApiUrl", () => {
  it("补全缺失的 https:// 协议", () => {
    expect(cleanApiUrl("api.anthropic.com/v1/messages")).toBe("https://api.anthropic.com/v1/messages");
  });
  it("修 ttps:// → https://", () => {
    expect(cleanApiUrl("ttps://api.anthropic.com/v1/messages")).toBe("https://api.anthropic.com/v1/messages");
  });
  it("修 htps:// → https://", () => {
    expect(cleanApiUrl("htps://api.openai.com/v1/chat")).toBe("https://api.openai.com/v1/chat");
  });
  it("修 ttp:// → http://", () => {
    expect(cleanApiUrl("ttp://localhost:11434/api")).toBe("http://localhost:11434/api");
  });
  it("保留 http:// 协议", () => {
    expect(cleanApiUrl("http://localhost:11434/api")).toBe("http://localhost:11434/api");
  });
  it("去除尾部斜杠", () => {
    expect(cleanApiUrl("https://api.anthropic.com/v1/messages/")).toBe("https://api.anthropic.com/v1/messages");
  });
  it("去除前导冒号/斜杠", () => {
    expect(cleanApiUrl(":api.anthropic.com/v1/messages")).toBe("https://api.anthropic.com/v1/messages");
  });
  it("空字符串抛 LLMCallError config", () => {
    expect(() => cleanApiUrl("")).toThrow(LLMCallError);
    expect(() => cleanApiUrl("   ")).toThrow(LLMCallError);
    try { cleanApiUrl(""); } catch (e) {
      expect((e as LLMCallError).kind).toBe("config");
    }
  });
  it("非法字符串抛 LLMCallError config", () => {
    try { cleanApiUrl("not a url  with spaces"); } catch (e) {
      expect((e as LLMCallError).kind).toBe("config");
      expect((e as LLMCallError).message).toContain("格式不合法");
    }
  });
  it("trim 输入", () => {
    expect(cleanApiUrl("  https://api.deepseek.com  ")).toBe("https://api.deepseek.com");
  });
});

describe("resolveFetchUrl — dev 模式", () => {
  it("deepseek → /api/deepseek", () => {
    const r = resolveFetchUrl("https://api.deepseek.com/v1/chat", undefined);
    expect(r.url).toBe("/api/deepseek/v1/chat");
    expect(r.viaProxy).toBe(true);
  });
  it("国内非 deepseek(智谱/通义/月之暗面/硅基流动)→ /api/proxy/<urlencoded> 兜底", () => {
    // 海外 provider(anthropic/openai)已全链路砍掉,但国内非 deepseek 仍走通用代理
    const r = resolveFetchUrl("https://open.bigmodel.cn/api/paas/v4/chat/completions", undefined);
    expect(r.url).toMatch(/^\/api\/proxy\//);
    expect(r.viaProxy).toBe(true);
    expect(decodeURIComponent(r.url.slice("/api/proxy/".length))).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
  });
  it("未知 provider → /api/proxy/<urlencoded>", () => {
    const r = resolveFetchUrl("https://api.custom.com/v1/chat", undefined);
    expect(r.url).toMatch(/^\/api\/proxy\//);
    expect(r.viaProxy).toBe(true);
    // 解码后是原 URL
    const enc = r.url.slice("/api/proxy/".length);
    expect(decodeURIComponent(enc)).toBe("https://api.custom.com/v1/chat");
  });
  it("未知 provider 含特殊字符 → URL 编码安全", () => {
    // base64 会有 +/= 等 URL 不安全字符,urlencoded 不会有
    const r = resolveFetchUrl("https://api.x.com/v1?key=a+b&c=d", undefined);
    expect(r.url).not.toMatch(/[+=]/); // 不含 base64 padding
    expect(decodeURIComponent(r.url.slice("/api/proxy/".length))).toBe("https://api.x.com/v1?key=a+b&c=d");
  });
});

describe("resolveFetchUrl — 跳过 dev 模式", () => {
  // 注意:resolveFetchUrl 通过 location.hostname 判断 dev,这里只测试非 localhost
  // 实际生产环境的判断依赖于运行环境。我们手工模拟 "非 dev" 场景:
  // 解决方法:把 isDev 检查改为可注入,或者用 vi.stubGlobal
  // 这里只覆盖 corsProxy 路径(可在任何环境工作)

  it("corsProxy 存在时把 URL 包到代理后", () => {
    // 模拟生产环境 - 临时改变 location.hostname
    const originalHostname = globalThis.location?.hostname;
    // @ts-expect-error - 临时修改用于测试
    delete globalThis.location;
    // @ts-expect-error
    globalThis.location = { hostname: "example.github.io" };

    try {
      const r = resolveFetchUrl("https://api.openai.com/v1/chat", "https://proxy.cors.sh/");
      expect(r.url).toBe("https://proxy.cors.sh/api.openai.com/v1/chat");
      expect(r.viaProxy).toBe(true);
    } finally {
      // 还原
      // @ts-expect-error
      delete globalThis.location;
      if (originalHostname !== undefined) {
        // @ts-expect-error
        globalThis.location = { hostname: originalHostname };
      }
    }
  });

  it("corsProxy 末尾斜杠被去除", () => {
    // @ts-expect-error
    delete globalThis.location;
    // @ts-expect-error
    globalThis.location = { hostname: "example.github.io" };

    try {
      const r = resolveFetchUrl("https://api.x.com/v1", "https://proxy.example.com///");
      expect(r.url).toBe("https://proxy.example.com/api.x.com/v1");
    } finally {
      // @ts-expect-error
      delete globalThis.location;
    }
  });
});

describe("LLMCallError", () => {
  it("包含 kind/hint/status 字段", () => {
    const e = new LLMCallError("auth", "API 401", "key 无效", 401);
    expect(e.kind).toBe("auth");
    expect(e.hint).toBe("key 无效");
    expect(e.status).toBe(401);
    expect(e.message).toBe("API 401");
    expect(e).toBeInstanceOf(Error);
  });
  it("hint 和 status 可选", () => {
    const e = new LLMCallError("config", "x");
    expect(e.hint).toBe("");
    expect(e.status).toBeUndefined();
  });
});

describe("pingLLM — PingResult 失败时也带 resolvedUrl 字段", () => {
  /**
   * 用户的痛点:测试按钮失败时,UI 没显示"实际请求发到哪了",
   * 导致用户不知道是 CORS/key/网络哪一层失败。
   * 这里要求 PingResult 即使失败也要保留 resolvedUrl 字段(可能为空)。
   */
  it("网络层失败时 PingResult.ok=false 且 error.kind ∈ {cors,network}", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    try {
      const r = await pingLLM({
        apiUrl: "https://api.example.com/v1/chat",
        apiKey: "sk-x",
        model: "any-model",
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBeDefined();
      expect(["cors", "network"]).toContain(r.error!.kind);
      // 关键: resolvedUrl 字段必须存在,即使为空
      expect("resolvedUrl" in r).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("config 错误(URL 不合法)时 PingResult 不抛异常", async () => {
    const r = await pingLLM({
      apiUrl: "not a url with spaces",
      apiKey: "sk-x",
      model: "any",
    });
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe("config");
  });
});