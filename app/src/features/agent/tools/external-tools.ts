/**
 * 外部联通工具 — 让 Agent 可以搜索互联网、抓取网页、计算、查时间。
 *
 * 所有网络请求在本地开发时走 Vite 代理(自动 CORS)，
 * 生产环境需要用户配置 corsProxy。
 */
import { z } from "zod";
import type { AgentTool } from "./schemas";
import { getExtConfig, isSearchConfigured } from "./ext-config";

/* ================================================================
 * 1. web_search — 多后端搜索 (Bing / 自配置 / 国内可用)
 * ================================================================ */
const webSearchSchema = z.object({
  query: z.string().describe("搜索关键词"),
  max_results: z.number().int().min(1).max(20).default(8).describe("最多返回条数"),
});

export const webSearchTool: AgentTool<typeof webSearchSchema> = {
  name: "web_search",
  description:
    "搜索互联网，获取最新信息、医学文献、临床指南、药物信息等。返回标题、摘要和链接。国内可用(Bing 或自配置搜索引擎)。",
  inputSchema: webSearchSchema,
  execute: async (input, _ctx) => {
    const { query, max_results } = input;
    const cfg = getExtConfig();

    if (!isSearchConfigured()) {
      return JSON.stringify({
        ok: false,
        error: "未配置搜索引擎。请在 AI 助手 → 🔑 LLM配置 → 搜索后端 中配置 Bing API Key 或自配置搜索 URL。",
        hint: "Bing API 免费层每月 1000 次请求，注册地址: https://portal.azure.com → 创建 Bing Search 资源",
      });
    }

    try {
      let results: Array<{ title: string; snippet: string; url: string }> = [];

      if (cfg.searchBackend === "bing") {
        // Bing Web Search API — key 通过请求头发送,由 Vite 代理转发
        const searchUrl = `/api/bing?q=${encodeURIComponent(query)}&count=${max_results}`;
        const res = await fetch(searchUrl, {
          headers: { "x-bing-apikey": cfg.bingApiKey },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return JSON.stringify({
            ok: false,
            error: `Bing 搜索返回 ${res.status}: ${text.slice(0, 200)}`,
            hint: "请检查 Bing API Key 是否正确,或切换搜索后端",
          });
        }
        const data = (await res.json()) as {
          webPages?: { value?: Array<{ name: string; snippet: string; url: string }> };
        };
        results = (data.webPages?.value || []).map(r => ({
          title: r.name,
          snippet: r.snippet,
          url: r.url,
        }));
      } else if (cfg.searchBackend === "custom") {
        // 自配置搜索 URL
        const customUrl = cfg.customSearchUrl.replace(/\{q\}/g, encodeURIComponent(query));
        const proxyPath = `/api/proxy/${btoa(customUrl)}`;
        const res = await fetch(proxyPath);
        if (!res.ok) {
          return JSON.stringify({
            ok: false,
            error: `自配置搜索返回 ${res.status}`,
            hint: "请检查自配置搜索 URL 是否正确,或切换到 Bing",
          });
        }
        const raw = await res.text();
        // 尝试解析 JSON
        try {
          const parsed = JSON.parse(raw);
          // SearXNG 格式
          if (parsed.results) {
            results = parsed.results.slice(0, max_results).map(
              (r: { title?: string; content?: string; snippet?: string; url?: string }) => ({
                title: r.title || "N/A",
                snippet: r.content || r.snippet || "",
                url: r.url || "",
              }),
            );
          }
        } catch {
          return JSON.stringify({
            ok: false,
            error: "自配置搜索引擎返回非 JSON 格式,请配置返回 JSON 的搜索 API(如 SearXNG)",
          });
        }
      }

      const trimmed = results.slice(0, max_results);
      if (trimmed.length === 0) {
        return JSON.stringify({
          ok: true,
          query,
          results: [],
          message: `未找到与"${query}"相关的结果`,
        });
      }
      return JSON.stringify({
        ok: true,
        backend: cfg.searchBackend,
        query,
        count: trimmed.length,
        results: trimmed,
      }, null, 2);
    } catch (e) {
      return `ERROR: 搜索失败 — ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

/* ================================================================
 * 2. web_fetch — 抓取网页内容
 * ================================================================ */
const webFetchSchema = z.object({
  url: z.string().describe("要抓取的网页 URL(含 https://)"),
  extract_text: z.boolean().default(true).describe("是否提取纯文本(true)还是返回原始 HTML(false)"),
});

export const webFetchTool: AgentTool<typeof webFetchSchema> = {
  name: "web_fetch",
  description:
    "抓取指定网页的内容，提取纯文本。适合阅读文章、获取页面详情、查阅在线文档。注意:不是搜索引擎，需要提供具体 URL。",
  inputSchema: webFetchSchema,
  execute: async (input, _ctx) => {
    const { url, extract_text } = input;
    try {
      // 走通用 Vite 代理 /api/proxy/<base64url>
      const proxyPath = `/api/proxy/${btoa(url)}`;
      const res = await fetch(proxyPath);
      if (!res.ok) {
        return JSON.stringify({
          ok: false,
          error: `抓取失败: HTTP ${res.status}`,
          url,
        });
      }
      const raw = await res.text();

      if (!extract_text) {
        return JSON.stringify({
          ok: true,
          url,
          content_length: raw.length,
          content: raw.slice(0, 6000),
          truncated: raw.length > 6000,
        });
      }

      // 简单 HTML→文本提取
      const text = raw
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      return JSON.stringify({
        ok: true,
        url,
        text_length: text.length,
        text,
        truncated: raw.length > 8000,
      });
    } catch (e) {
      return `ERROR: 抓取失败 — ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

/* ================================================================
 * 3. calculate — 数学计算
 * ================================================================ */
const calculateSchema = z.object({
  expression: z.string().describe("数学表达式，如 '2+3*4' 或 'sqrt(144)' 或 'mean([1,2,3,4,5])'"),
});

export const calculateTool: AgentTool<typeof calculateSchema> = {
  name: "calculate",
  description:
    "执行数学计算。支持加减乘除、幂运算、三角函数、统计函数(mean/median/std/sum)。用于药物剂量换算、VAS 评分统计、康复量表计算等。",
  inputSchema: calculateSchema,
  execute: async (input, _ctx) => {
    const { expression } = input;
    try {
      const { result, error } = safeEval(expression);
      if (error) return `ERROR: ${error}`;
      const formatted = typeof result === "number"
        ? Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
        : JSON.stringify(result);
      return JSON.stringify({ ok: true, expression: expression.trim(), result: formatted });
    } catch (e) {
      return `ERROR: 计算失败 — ${e instanceof Error ? e.message : String(e)}\n表达式: ${expression}`;
    }
  },
};

/** ================================================================
 * 安全数学表达式求值器 — 零代码执行,纯递归下降解析
 * 替代不安全的 new Function(),从根本上杜绝注入
 * ================================================================ */
function safeEval(expr: string): { result?: number; error?: string } {
  const s = expr.trim();
  if (s.length > 500) return { error: "表达式过长(最大500字符)" };
  if (/[^0-9+\-*/().%^,\s\w.]/.test(s)) {
    return { error: "含非法字符,仅支持数字、运算符和数学函数" };
  }

  // 预处理: 数组字面量 → 计算好的值
  const arrays = new Map<string, number[]>();
  const preprocessed = s.replace(/\[([^\]]+)\]/g, (m, inner) => {
    const nums = inner.split(",").map(Number);
    if (nums.some(isNaN)) return m;
    const key = `__arr${arrays.size}__`;
    arrays.set(key, nums);
    return key;
  });

  try {
    const tokens = tokenize(preprocessed);
    const result = parseExpression(tokens, arrays);
    if (tokens.length > 0) return { error: `多余的字符: "${tokens.map(t => t.value).join("")}"` };
    if (!isFinite(result)) return { error: `计算结果溢出: ${result}` };
    if (isNaN(result)) return { error: "计算结果为 NaN" };
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

type Token = { type: "num" | "op" | "func" | "arr" | "lparen" | "rparen" | "comma"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: "," }); i++; continue; }
    if ("+-*/%^".includes(ch)) {
      tokens.push({ type: "op", value: ch }); i++;
      // 处理 ** (幂)
      if (ch === "*" && input[i] === "*") { tokens[tokens.length - 1].value = "^"; i++; }
      continue;
    }
    if (/\d/.test(ch) || (ch === "." && i + 1 < input.length && /\d/.test(input[i + 1]))) {
      let num = "";
      while (i < input.length && (/\d/.test(input[i]) || input[i] === ".")) { num += input[i]; i++; }
      tokens.push({ type: "num", value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = "";
      while (i < input.length && /\w/.test(input[i])) { name += input[i]; i++; }
      const lower = name.toLowerCase();
      if (["mean", "median", "std", "sum"].includes(lower)) {
        tokens.push({ type: "func", value: lower });
      } else if (lower === "pi") {
        tokens.push({ type: "num", value: String(Math.PI) });
      } else if (lower === "e") {
        tokens.push({ type: "num", value: String(Math.E) });
      } else if (lower.startsWith("__arr") && lower.endsWith("__")) {
        tokens.push({ type: "arr", value: lower });
      } else if (["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "log", "ln", "log2", "log10", "exp", "floor", "ceil", "round", "cbrt", "sign"].includes(lower)) {
        tokens.push({ type: "func", value: lower });
      } else {
        // 未识别的标识符 — 拒绝
        throw new Error(`未知标识符: "${name}"`);
      }
      continue;
    }
    throw new Error(`非法字符: "${ch}"`);
  }
  return tokens;
}

function parseExpression(tokens: Token[], arrays: Map<string, number[]>): number {
  let left = parseTerm(tokens, arrays);
  while (tokens.length > 0 && (tokens[0].value === "+" || tokens[0].value === "-")) {
    const op = tokens.shift()!.value;
    const right = parseTerm(tokens, arrays);
    left = op === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: Token[], arrays: Map<string, number[]>): number {
  let left = parseUnary(tokens, arrays);
  while (tokens.length > 0 && (tokens[0].value === "*" || tokens[0].value === "/" || tokens[0].value === "%")) {
    const op = tokens.shift()!.value;
    const right = parseUnary(tokens, arrays);
    if (op === "*") left = left * right;
    else if (op === "/") left = left / right;
    else left = left % right;
  }
  return left;
}

function parseUnary(tokens: Token[], arrays: Map<string, number[]>): number {
  if (tokens.length > 0 && tokens[0].value === "-") {
    tokens.shift();
    return -parsePower(tokens, arrays);
  }
  return parsePower(tokens, arrays);
}

function parsePower(tokens: Token[], arrays: Map<string, number[]>): number {
  let left = parseFactor(tokens, arrays);
  while (tokens.length > 0 && tokens[0].value === "^") {
    tokens.shift();
    left = Math.pow(left, parseFactor(tokens, arrays));
  }
  return left;
}

function parseFactor(tokens: Token[], arrays: Map<string, number[]>): number {
  if (tokens.length === 0) throw new Error("意外的表达式结尾");
  const tok = tokens.shift()!;
  if (tok.type === "num") return parseFloat(tok.value);
  if (tok.type === "arr") {
    const arr = arrays.get(tok.value);
    if (!arr) throw new Error(`内部错误: 数组 ${tok.value} 未定义`);
    return arr[0]; // fallback: 返回第一个元素
  }
  if (tok.type === "func") {
    const funcName = tok.value;
    if (tokens.length === 0 || tokens[0].type !== "lparen") throw new Error(`${funcName} 后需要 "("`);
    tokens.shift(); // (
    const args: number[] = [];
    if (tokens.length > 0 && tokens[0].type !== "rparen") {
      args.push(parseExpression(tokens, arrays));
      while (tokens.length > 0 && tokens[0].type === "comma") {
        tokens.shift(); // ,
        args.push(parseExpression(tokens, arrays));
      }
    }
    if (tokens.length === 0 || tokens[0].type !== "rparen") throw new Error(`${funcName} 需要 ")"`);
    tokens.shift(); // )
    return applyFunction(funcName, args, arrays);
  }
  if (tok.type === "lparen") {
    const val = parseExpression(tokens, arrays);
    if (tokens.length === 0 || tokens[0].type !== "rparen") throw new Error('缺少闭合 ")"');
    tokens.shift();
    return val;
  }
  throw new Error(`意外的 token: "${tok.value}"`);
}

function applyFunction(name: string, args: number[], arrays: Map<string, number[]>): number {
  const mathFns: Record<string, (x: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, log: Math.log10, ln: Math.log,
    log2: Math.log2, log10: Math.log10, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    cbrt: Math.cbrt, sign: Math.sign,
  };

  if (name in mathFns) {
    if (args.length !== 1) throw new Error(`${name} 需要 1 个参数,收到 ${args.length}`);
    return mathFns[name](args[0]);
  }

  // 统计函数
  if (["mean", "median", "std", "sum"].includes(name)) {
    let data: number[];
    if (args.length >= 1) {
      data = args;
    } else {
      throw new Error(`${name} 需要数组参数,如 ${name}([1,2,3]) 或 ${name}(1,2,3)`);
    }
    if (data.length === 0) throw new Error(`${name}: 数组不能为空`);
    if (name === "mean") return data.reduce((a, b) => a + b, 0) / data.length;
    if (name === "sum") return data.reduce((a, b) => a + b, 0);
    const s = [...data].sort((a, b) => a - b);
    if (name === "median") {
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    if (name === "std") {
      const m = data.reduce((a, b) => a + b, 0) / data.length;
      return Math.sqrt(data.reduce((a, v) => a + (v - m) ** 2, 0) / data.length);
    }
  }

  throw new Error(`未知函数: ${name}`);
}

/* ================================================================
 * 4. get_current_time — 当前日期时间
 * ================================================================ */
const currentTimeSchema = z.object({
  timezone: z.string().default("Asia/Shanghai").describe("时区名称，如 Asia/Shanghai, America/New_York, Europe/London"),
  format: z.enum(["full", "date", "time", "iso", "weekday"]).default("full").describe("输出格式"),
});

export const getCurrentTimeTool: AgentTool<typeof currentTimeSchema> = {
  name: "get_current_time",
  description:
    "获取当前日期和时间。用于计算年龄、判断季节(如流感季)、确定随访间隔、标注病历时间戳等。",
  inputSchema: currentTimeSchema,
  execute: async (input, _ctx) => {
    const { timezone, format } = input;
    try {
      const now = new Date();
      const locale = "zh-CN";

      let result: Record<string, string>;
      try {
        const formatter = new Intl.DateTimeFormat(locale, {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          weekday: "long",
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
        result = {
          timezone,
          iso: now.toISOString(),
          year: get("year"),
          month: get("month"),
          day: get("day"),
          hour: get("hour"),
          minute: get("minute"),
          second: get("second"),
          weekday: get("weekday"),
          timestamp: String(Math.floor(now.getTime() / 1000)),
        };
      } catch {
        // fallback if timezone is invalid
        result = {
          timezone,
          iso: now.toISOString(),
          year: String(now.getFullYear()),
          month: String(now.getMonth() + 1).padStart(2, "0"),
          day: String(now.getDate()).padStart(2, "0"),
          hour: String(now.getHours()).padStart(2, "0"),
          minute: String(now.getMinutes()).padStart(2, "0"),
          second: String(now.getSeconds()).padStart(2, "0"),
          weekday: ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
          timestamp: String(Math.floor(now.getTime() / 1000)),
        };
      }

      if (format === "date") {
        return `${result.year}年${result.month}月${result.day}日 ${result.weekday ? "星期" + result.weekday : ""}`;
      }
      if (format === "time") {
        return `${result.hour}:${result.minute}:${result.second} (${result.timezone})`;
      }
      if (format === "iso") return result.iso;
      if (format === "weekday") return `星期${result.weekday}`;
      return JSON.stringify(result, null, 2);
    } catch (e) {
      return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

/* ================================================================
 * 5. search_pubmed — PubMed 文献检索
 * ================================================================ */
const pubmedSchema = z.object({
  query: z.string().describe("PubMed 搜索词，支持 MeSH 术语，如 'low back pain physical therapy RCT'"),
  max_results: z.number().int().min(1).max(10).default(5).describe("最多返回条数(PubMed 免费 API 限速)"),
});

export const searchPubmedTool: AgentTool<typeof pubmedSchema> = {
  name: "search_pubmed",
  description:
    "检索 PubMed 生物医学文献数据库。返回标题、作者、期刊、年份和 PMID。适合查询循证医学证据、临床研究、系统综述。免费 API，无需密钥。",
  inputSchema: pubmedSchema,
  execute: async (input, _ctx) => {
    const { query, max_results } = input;
    try {
      // Step 1: ESearch — 获取 PMID 列表
      const esearchUrl = `/api/proxy/${btoa(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=${max_results}&retmode=json&sort=relevance&term=${encodeURIComponent(query)}`)}`;
      const sRes = await fetch(esearchUrl);
      if (!sRes.ok) throw new Error(`PubMed ESearch HTTP ${sRes.status}`);
      const sData = (await sRes.json()) as { esearchresult?: { idlist?: string[] } };
      const ids = sData.esearchresult?.idlist || [];
      if (ids.length === 0) {
        return JSON.stringify({ ok: true, query, count: 0, results: [], message: "未找到相关文献" });
      }

      // Step 2: ESummary — 获取文献详情
      const esumUrl = `/api/proxy/${btoa(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`)}`;
      const eRes = await fetch(esumUrl);
      if (!eRes.ok) throw new Error(`PubMed ESummary HTTP ${eRes.status}`);
      const eData = (await eRes.json()) as { result?: Record<string, unknown> };

      const results = ids.map(id => {
        const r = (eData.result?.[id] || {}) as Record<string, unknown>;
        const authors = (r.authors as Array<{ name: string }> || []).slice(0, 3).map(a => a.name).join(", ");
        return {
          pmid: id,
          title: (r.title as string) || "N/A",
          authors: authors || "N/A",
          journal: (r.source as string) || "N/A",
          year: (r.pubdate as string)?.slice(0, 4) || "N/A",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        };
      });

      return JSON.stringify({ ok: true, query, count: results.length, results }, null, 2);
    } catch (e) {
      return `ERROR: PubMed 检索失败 — ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

/* ================================================================
 * 6. install_skill — 从 URL 安装外部 Skill
 * ================================================================ */
import { installSkillFromUrl, isSkillDuplicated, SKILL_GALLERY } from "./skill-system";

const installSkillSchema = z.object({
  url: z.string().describe("Skill 文件的 URL(GitHub Raw URL / Gist raw URL 等),必须是 .md 文件带 YAML frontmatter"),
});

export const installSkillTool: AgentTool<typeof installSkillSchema> = {
  name: "install_skill",
  description:
    "从外部 URL 安装一个 Skill。Skill 是给 Agent 的专业指令集(Markdown + YAML frontmatter),安装后用户消息匹配触发词时自动激活。" +
    "也可以推荐 Skill 库中的技能: " + SKILL_GALLERY.map(s => s.name).join("、") +
    "。或帮助用户从 GitHub/Gist 等 URL 安装自定义 Skill。",
  inputSchema: installSkillSchema,
  execute: async (input, _ctx) => {
    const { url } = input;
    try {
      if (isSkillDuplicated(url)) {
        return JSON.stringify({ ok: false, error: "该 Skill 已安装,无需重复安装", url });
      }
      const installed = await installSkillFromUrl(url);
      return JSON.stringify({
        ok: true,
        message: `✅ 成功安装 Skill: "${installed.name}"`,
        skill: {
          name: installed.name,
          description: installed.description,
          triggers: installed.triggers,
          priority: installed.priority,
        },
      }, null, 2);
    } catch (e) {
      return `ERROR: 安装失败 — ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

/* ================================================================
 * 7. transcribe_audio — 音频转文字
 * ================================================================ */
const transcribeAudioSchema = z.object({
  file_name: z.string().describe("音频文件名(需与用户上传的一致)"),
  language: z.string().default("zh").describe("音频语言,zh=中文 en=英文 ja=日文"),
});

export const transcribeAudioTool: AgentTool<typeof transcribeAudioSchema> = {
  name: "transcribe_audio",
  description:
    "处理用户上传的音频文件(.mp3/.wav/.m4a等)。音频数据已在前序消息中以 base64 格式提供。如果当前模型支持音频多模态,请直接转写;如不支持,请告知用户使用外部服务(Whisper API/讯飞等)。",
  inputSchema: transcribeAudioSchema,
  execute: async (input, _ctx) => {
    return JSON.stringify({
      ok: true,
      file_name: input.file_name,
      language: input.language,
      message: "音频已作为 base64 data URL 包含在上一条用户消息中。支持音频的模型(如 GPT-4o-audio)请直接转写。不支持音频的模型请告知用户。",
    }, null, 2);
  },
};

