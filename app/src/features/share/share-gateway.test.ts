/**
 * share-gateway 浏览器客户端单测。
 *
 * 关键点:
 *  - getShareRefFromUrl 只接受合法项目 ref(防任意域名拼接)
 *  - buildShareUrl 有配置时自动带 ref,无配置时退化为纯 ?share= 链接
 *  - gatewayLookupRaw / gatewaySubmit 的 URL 拼装与错误路径
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getShareRefFromUrl,
  buildShareUrl,
  gatewayLookupRaw,
  gatewaySubmit,
} from "./share-gateway";

const CONFIG_KEY = "kfblxt:supabase:config";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setUrl("");
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setUrl("");
});

describe("getShareRefFromUrl", () => {
  it("读取合法 ref 参数", () => {
    setUrl("?share=anrm-x&ref=abcdef123456");
    expect(getShareRefFromUrl()).toBe("abcdef123456");
  });

  it("无 ref 参数返回 null", () => {
    setUrl("?share=anrm-x");
    expect(getShareRefFromUrl()).toBeNull();
  });

  it("拒绝带域名/点号的非法 ref(防拼出任意域名)", () => {
    setUrl("?share=anrm-x&ref=evil.com");
    expect(getShareRefFromUrl()).toBeNull();
  });
});

describe("buildShareUrl", () => {
  it("无 Supabase 配置:纯 ?share= 链接,不带 ref", () => {
    const url = buildShareUrl("anrm-t1");
    expect(url).toContain("?share=anrm-t1");
    expect(url).not.toContain("&ref=");
  });

  it("有配置:自动附加项目 ref", () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ url: "https://myproj.supabase.co", anonKey: "k" }),
    );
    const url = buildShareUrl("anrm-t2");
    expect(url).toContain("?share=anrm-t2");
    expect(url).toContain("&ref=myproj");
  });

  it("hash 快照拼在 query 之后", () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ url: "https://myproj.supabase.co", anonKey: "k" }),
    );
    const url = buildShareUrl("anrm-t3", "abc123");
    expect(url).toMatch(/\?share=anrm-t3&ref=myproj#abc123$/);
  });

  it("自托管(非 *.supabase.co)不带 ref", () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ url: "http://192.168.1.10:8000", anonKey: "k" }),
    );
    expect(buildShareUrl("anrm-t4")).not.toContain("&ref=");
  });
});

describe("gatewayLookupRaw", () => {
  it("200 返回 share 行,URL 指向对应项目的函数", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ share: { token: "anrm-x", mode: "assessment" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const row = await gatewayLookupRaw("myproj", "anrm-x");
    expect(row?.token).toBe("anrm-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://myproj.supabase.co/functions/v1/share-gateway?token=anrm-x",
    );
  });

  it("404 / 网络异常都返回 null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await gatewayLookupRaw("myproj", "anrm-x")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await gatewayLookupRaw("myproj", "anrm-x")).toBeNull();
  });
});

describe("gatewaySubmit", () => {
  const payload = {
    type: "brain_region" as const,
    payload: { responses: { items: {} }, score: { byRegion: {} } },
  };

  it("成功:POST 到函数并回传 submissionId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, submissionId: "sub-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await gatewaySubmit("myproj", "anrm-x", payload);
    expect(result).toEqual({ ok: true, submissionId: "sub-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://myproj.supabase.co/functions/v1/share-gateway");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      token: "anrm-x",
      type: "brain_region",
      payload: payload.payload,
    });
  });

  it("函数报错:透传 error 文案", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "type not allowed for this share" }),
    }));
    const result = await gatewaySubmit("myproj", "anrm-x", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("type not allowed");
  });

  it("网络异常:返回网络错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await gatewaySubmit("myproj", "anrm-x", payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("网络错误");
  });
});
