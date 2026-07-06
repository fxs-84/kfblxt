/**
 * LLM HTTP 客户端 — 把所有"连接 API"相关的脏活封到一个模块:
 *   1. URL 纠错 + 解析(单一职责)
 *   2. dev / prod 路由选择(单一决策点)
 *   3. fetch 调用 + 超时 + 取消 + 退避重试
 *   4. 错误归类 + 可读中文诊断
 *
 * 设计原则:
 *   - 一个函数干一件事。`cleanApiUrl` 只纠错,`resolveFetchUrl` 只决定最终 URL
 *   - 所有 fetch 走统一的 `doFetch()`,带 AbortController + 重试
 *   - 错误统一抛 `LLMCallError`,带 `kind` 分类(用户可读的中文提示)
 *   - 浏览器端默认 60s 超时,可被外部 signal 取消
 *
 * 为什么单建这个文件:
 *   原 llm-engine.ts 把 URL 解析混在加密/配置/调用之间,职责不清。
 *   agent-loop.ts 又自己重写了一遍 URL 解析。两处实现不一致 → bug 难定位。
 */

import {
  buildApiHeaders,
  detectApiType,
  parseAnthropicResponse,
  parseOpenAIResponse,
  type ApiType,
} from "./api-adapter";

/* ============================================================
 *  1. URL 纠错 — 纯函数,只处理字符串
 * ============================================================ */

/**
 * 把用户输入的 URL 字符串归一化:
 *   - 修常见 typo: ttps://  ttp://  htps://  http:/  https:/
 *   - 缺协议时补 https://
 *   - 去尾部斜杠
 *   - 仍非合法 URL 时抛错(由调用方决定如何提示)
 */
export function cleanApiUrl(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) throw new LLMCallError("config", "API URL 不能为空");

  // 修协议前缀 typo
  if (/^ttps:\/\//i.test(s)) s = "h" + s; // ttps:// → https://
  if (/^htps:\/\//i.test(s)) s = s.replace(/^htps/i, "https"); // htps → https
  if (/^ttp:\/\//i.test(s)) s = "h" + s; // ttp:// → http://
  if (/^ttps?:\/[^/]/i.test(s)) s = s.replace(/^https?:\/([^/])/i, "$&/"); // https:/api → https://api
  if (/^https?:\/+/i.test(s)) s = s.replace(/^https?:\/+/i, (m) => m.replace(/\/+/g, "//")); // 多个 /

  // 缺协议则补
  if (!/^https?:\/\//i.test(s)) {
    s = "https://" + s.replace(/^[:\/]+/, "");
  }

  // 去尾部斜杠
  s = s.replace(/\/+$/, "");

  // 验证
  try {
    // eslint-disable-next-line no-new
    new URL(s);
  } catch {
    throw new LLMCallError("config", `API URL 格式不合法: ${raw}`);
  }
  return s;
}

/* ============================================================
 *  2. 解析最终 fetch URL — 单一决策点
 * ============================================================ */

/**
 * 决定 fetch 应该发到哪个 URL。
 * 三种情况:
 *   a. 本地开发 → 走 Vite 代理(避免浏览器 CORS)
 *      - 已知 provider: 精确重写到 /api/<provider>/<path>
 *      - 其他: 走通用 /api/proxy/<urlencoded> 兜底
 *   b. 生产 + 配了 corsProxy → URL 包到代理后面
 *   c. 生产 + 没配 corsProxy → 原 URL 直连(用户自己处理 CORS)
 */
export function resolveFetchUrl(cleanedUrl: string, corsProxy?: string): { url: string; viaProxy: boolean } {
  const isDev =
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]");

  if (isDev) {
    // 已知 provider 精确代理
    const knownProviders: Array<{ host: string; prefix: string }> = [
      { host: "api.deepseek.com", prefix: "/api/deepseek" },
      { host: "api.anthropic.com", prefix: "/api/anthropic" },
      { host: "api.openai.com", prefix: "/api/openai" },
    ];
    for (const { host, prefix } of knownProviders) {
      const idx = cleanedUrl.indexOf(host);
      if (idx !== -1) {
        return { url: prefix + cleanedUrl.slice(idx + host.length), viaProxy: true };
      }
    }
    // 兜底:任意 OpenAI/Anthropic 兼容 API → 通用 URL 编码代理
    // 用 encodeURIComponent 而不是 base64,避免 btoa 产生的 + / = 等 URL 不安全字符
    return {
      url: `/api/proxy/${encodeURIComponent(cleanedUrl)}`,
      viaProxy: true,
    };
  }

  if (corsProxy) {
    const base = corsProxy.replace(/\/+$/, "");
    const path = cleanedUrl.replace(/^https?:\/\//, "");
    return { url: `${base}/${path}`, viaProxy: true };
  }
  return { url: cleanedUrl, viaProxy: false };
}

/* ============================================================
 *  3. 错误类型 — 归类清晰,带可读中文提示
 * ============================================================ */

export type LLMErrorKind =
  | "config"        // 配置问题(URL 不合法/未配置 key)
  | "network"       // 网络不通
  | "cors"          // CORS 阻止
  | "timeout"       // 超时
  | "auth"          // 401/403
  | "rate_limit"    // 429
  | "server"        // 5xx
  | "format"        // 响应格式错
  | "aborted";      // 用户主动取消

export class LLMCallError extends Error {
  readonly kind: LLMErrorKind;
  readonly hint: string;
  readonly status?: number;

  constructor(kind: LLMErrorKind, message: string, hint = "", status?: number) {
    super(message);
    this.kind = kind;
    this.hint = hint;
    this.status = status;
  }
}

/* ============================================================
 *  4. 统一 fetch — 超时 + 取消 + 重试
 * ============================================================ */

export interface FetchOptions {
  /** 外部 AbortSignal(用户取消) */
  signal?: AbortSignal;
  /** 单次超时,默认 60s */
  timeoutMs?: number;
  /** 最大重试次数(只对网络错误/超时重试),默认 2 */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * 内部: 包装 fetch,加超时和取消。返回 Response(调用方负责读 body)。
 */
async function doFetchOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  // 外部 signal 触发时也中止
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof DOMException && reason.name === "TimeoutError") {
        throw new LLMCallError("timeout", `请求超时(>${Math.round(timeoutMs / 1000)}s)`, "可能是网络慢或上游 API 不稳定,可重试");
      }
      if (externalSignal?.aborted) {
        throw new LLMCallError("aborted", "已取消", "", undefined);
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    // Failed to fetch / NetworkError / Load failed 都归为 CORS 或网络
    if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
      const isDev =
        typeof location !== "undefined" &&
        (location.hostname === "localhost" || location.hostname === "127.0.0.1");
      throw new LLMCallError(
        "cors",
        "浏览器拦截了请求(很可能是 CORS)",
        isDev
          ? "请确认 npm run dev 已启动且未重启;或检查 Vite 代理是否拦截到该 host"
          : "GitHub Pages 等静态部署无法绕开 CORS,请在配置里填入 CORS 代理(https://proxy.cors.sh/ 等)",
      );
    }
    throw new LLMCallError("network", `网络错误: ${msg}`, "检查网络连接或 API URL 是否可访问");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * 通用 fetch 封装: 重试 + 超时 + 取消 + 错误归类
 */
export async function doFetch(
  url: string,
  init: RequestInit,
  opts: FetchOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastErr: LLMCallError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await doFetchOnce(url, init, timeoutMs, opts.signal);
      // 4xx 不重试(配置/权限问题不会自愈)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const text = await res.text().catch(() => "");
        const kind: LLMErrorKind = res.status === 401 || res.status === 403 ? "auth" : "format";
        const hint =
          res.status === 401
            ? "API Key 无效或已过期,请在 🔑 配置面板重新填入"
            : res.status === 403
              ? "API Key 权限不足,或被风控拦截"
              : "请求参数有误或 API 不支持该功能";
        throw new LLMCallError(kind, `API ${res.status}`, `${hint}\n返回: ${text.slice(0, 200)}`, res.status);
      }
      // 429 短暂退避后重试
      if (res.status === 429) {
        const wait = Math.min(2000 * 2 ** attempt, 8000);
        await new Promise((r) => setTimeout(r, wait));
        lastErr = new LLMCallError("rate_limit", "API 429 限流", "稍候重试", 429);
        continue;
      }
      // 5xx 重试
      if (res.status >= 500) {
        const text = await res.text().catch(() => "");
        lastErr = new LLMCallError("server", `API ${res.status}`, `上游服务异常\n${text.slice(0, 200)}`, res.status);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      return res;
    } catch (e: unknown) {
      if (e instanceof LLMCallError) {
        // 配置/认证/取消/超时/格式 — 不重试
        if (e.kind === "config" || e.kind === "auth" || e.kind === "aborted" || e.kind === "format") throw e;
        // timeout/cors/network/server — 可重试
        lastErr = e;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw e;
      }
      throw new LLMCallError("network", e instanceof Error ? e.message : String(e), "");
    }
  }
  throw lastErr ?? new LLMCallError("network", "重试耗尽", "请稍后再试");
}

/* ============================================================
 *  5. 探活 — 最小成本确认 LLM 可达
 * ============================================================ */

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  apiType?: ApiType;
  viaProxy?: boolean;
  resolvedUrl?: string;
  error?: LLMCallError;
}

/**
 * 用最小请求确认 LLM 可达:
 *   - Anthropic: 不发 messages(空 messages 会报错),改用 GET /v1/models 不存在,改为发 1 token 提示
 *   - OpenAI-compatible: GET <base>/models(很多支持,有些不支持;失败不致命)
 *
 * 策略: 发一个最小 chat 请求(max_tokens=1),只验证连通性。
 */
export async function pingLLM(
  cfg: { apiUrl: string; apiKey: string; model: string; corsProxy?: string },
  opts: FetchOptions = {},
): Promise<PingResult> {
  const startedAt = performance.now();
  try {
    const url = cleanApiUrl(cfg.apiUrl);
    const { url: fetchUrl, viaProxy } = resolveFetchUrl(url, cfg.corsProxy);
    const apiType = detectApiType(url);
    const headers = buildApiHeaders(cfg.apiKey, url);

    const body: Record<string, unknown> =
      apiType === "anthropic"
        ? {
            model: cfg.model,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }
        : {
            model: cfg.model,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          };

    const res = await doFetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }, { ...opts, timeoutMs: opts.timeoutMs ?? 15_000, maxRetries: 0 });
    // 读 body 防止连接泄漏
    await res.text().catch(() => "");

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      model: cfg.model,
      apiType,
      viaProxy,
      resolvedUrl: fetchUrl,
    };
  } catch (e) {
    const err = e instanceof LLMCallError ? e : new LLMCallError("network", e instanceof Error ? e.message : String(e));
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: err,
    };
  }
}

/* ============================================================
 *  6. 主调用 — 给 LLM 发一段对话,返回文本 + tool calls
 * ============================================================ */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMCallResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage?: { input_tokens: number; output_tokens: number };
  resolvedUrl: string;
  viaProxy: boolean;
  apiType: ApiType;
}

export interface CallOptions {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDescriptor[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** 单轮 LLM 调用(无 tool loop) */
export async function callLLM(
  messages: ChatMessage[],
  cfg: { apiUrl: string; apiKey: string; model: string; corsProxy?: string },
  options: CallOptions = {},
): Promise<LLMCallResult> {
  const url = cleanApiUrl(cfg.apiUrl);
  const { url: fetchUrl, viaProxy } = resolveFetchUrl(url, cfg.corsProxy);
  const apiType = detectApiType(url);
  const headers = buildApiHeaders(cfg.apiKey, url);

  const body = buildRequestBody(apiType, messages, cfg.model, options, options.tools);

  const res = await doFetch(fetchUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, { signal: options.signal, timeoutMs: options.timeoutMs });

  const data = (await res.json()) as Record<string, unknown>;
  const parsed = apiType === "anthropic" ? parseAnthropicResponse(data) : parseOpenAIResponse(data);

  return { ...parsed, resolvedUrl: fetchUrl, viaProxy, apiType };
}

function buildRequestBody(
  apiType: ApiType,
  messages: ChatMessage[],
  model: string,
  options: CallOptions,
  tools: ToolDescriptor[] | undefined,
): Record<string, unknown> {
  const maxTokens = options.maxTokens ?? 4000;
  const temperature = options.temperature ?? 0.2;
  if (apiType === "anthropic") {
    const systemMsg = messages.find((m) => m.role === "system");
    const conv = messages.filter((m) => m.role !== "system");
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: conv.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemMsg) body.system = systemMsg.content;
    if (tools && tools.length > 0) body.tools = tools;
    return body;
  }
  // OpenAI-compatible
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
  return body;
}
