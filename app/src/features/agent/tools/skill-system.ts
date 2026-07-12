/**
 * Skill 系统 — 类似 Claude Code 的 skills。
 * Skill 是 Markdown 文件,YAML frontmatter 定义元数据,正文是注入 system prompt 的指令。
 *
 * 触发机制:
 * 1. 关键词匹配: 用户消息包含 trigger 关键词时自动激活
 * 2. 前缀命令: 用户输入 `/skill-name` 时强制激活
 * 3. 始终激活: always_on=true 的 skill 在每个对话中注入
 *
 * 存储: localStorage, key="anrm_skills"
 */
const SKILLS_KEY = "anrm_skills";

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  /** 触发关键词列表,用户消息包含任一关键词时激活 */
  triggers: string[];
  /** 始终激活(每次对话都注入) */
  alwaysOn: boolean;
  /** 注入 system prompt 的内容(Markdown) */
  prompt: string;
  /** 优先级,高优先级的 skill 排在前面 */
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** 安装来源 URL,外部安装的 skill 有此字段 */
  sourceUrl?: string;
}

/* ================================================================
 * 内置默认 Skills
 * ================================================================ */
const BUILTIN_SKILLS: Omit<SkillConfig, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "文献综述助手",
    description: "搜索并综述医学文献,生成带引用的综述报告",
    triggers: ["文献综述", "系统综述", "meta分析", "循证医学", "review", "systematic review"],
    alwaysOn: false,
    prompt: `## 文献综述技能

当用户要求查找或综述文献时:
1. 先用 search_pubmed 检索相关研究
2. 再用 web_search 查找最新指南和综述
3. 按 IMRaD 结构组织综述: 背景/方法/结果/讨论
4. 每条引用注明 PMID 或来源 URL
5. 在结论中注明证据等级(如 GRADE A/B/C/D)
6. 用中文撰写,专业术语保留英文`,
    priority: 10,
    enabled: true,
  },
  {
    name: "用药查询助手",
    description: "查询药物信息、剂量、相互作用",
    triggers: ["用药", "药物", "剂量", "禁忌", "副作用", "相互作用", " pharmacology"],
    alwaysOn: false,
    prompt: `## 用药查询技能

当用户询问药物相关信息时:
1. 用 web_search 搜索药物说明书和指南
2. 重点关注: 适应症、用法用量、禁忌症、不良反应、药物相互作用
3. 如涉及神经康复药物(如巴氯芬、替扎尼定、加巴喷丁),结合 ANRM 神经机制分析
4. 始终提醒"本信息仅供参考,临床决策由治疗师根据实际情况把握"
5. 引用来源(药典、FDA、NMPA 等)`,
    priority: 10,
    enabled: true,
  },
  {
    name: "客户教育材料",
    description: "生成客户易懂的健康教育材料",
    triggers: ["客户教育", "科普", "健康教育", "家庭作业说明", "客户须知", "康复指导"],
    alwaysOn: false,
    prompt: `## 客户教育材料技能

当用户请求生成客户教育材料时:
1. 使用通俗易懂的语言,避免医学术语(或附解释)
2. 结构化: 背景→注意事项→每日练习→危险信号
3. 适合打印或发送给客户
4. 包含图文说明建议(如"此处可配图: 腰椎稳定训练姿势")
5. 末尾添加免责声明`,
    priority: 10,
    enabled: true,
  },
];

function genId(): string {
  return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

/* ================================================================
 * CRUD
 * ================================================================ */
export function getSkills(): SkillConfig[] {
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (!raw) {
      // 首次加载,初始化内置技能
      const builtins = BUILTIN_SKILLS.map(s => ({
        ...s,
        id: `builtin_${s.name}`,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }));
      saveSkills(builtins);
      return builtins;
    }
    return JSON.parse(raw) as SkillConfig[];
  } catch {
    return [];
  }
}

export function saveSkills(skills: SkillConfig[]): void {
  try {
    localStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
  } catch (e) {
    console.error("[skill-system] 保存失败:", e);
  }
}

export function addSkill(skill: Omit<SkillConfig, "id" | "createdAt" | "updatedAt">): SkillConfig {
  const skills = getSkills();
  const now = nowISO();
  const created: SkillConfig = { ...skill, id: genId(), createdAt: now, updatedAt: now };
  skills.push(created);
  saveSkills(skills);
  return created;
}

export function updateSkill(id: string, partial: Partial<Omit<SkillConfig, "id" | "createdAt">>): void {
  const skills = getSkills();
  const idx = skills.findIndex(s => s.id === id);
  if (idx === -1) return;
  skills[idx] = { ...skills[idx], ...partial, updatedAt: nowISO() };
  saveSkills(skills);
}

export function deleteSkill(id: string): void {
  saveSkills(getSkills().filter(s => s.id !== id));
}

/* ================================================================
 * 触发匹配
 * ================================================================ */
export interface ActiveSkill {
  skill: SkillConfig;
  /** 哪个 trigger 被匹配 */
  matchedTrigger: string;
}

/** 解析用户消息,返回激活的 skill 列表 */
export function getActiveSkills(userMessage: string): ActiveSkill[] {
  const skills = getSkills().filter(s => s.enabled);
  const msg = userMessage.trim();
  const active: ActiveSkill[] = [];

  // 1. 始终激活的
  for (const s of skills) {
    if (s.alwaysOn) {
      active.push({ skill: s, matchedTrigger: "always_on" });
    }
  }

  // 2. 前缀命令 /skill-name
  const cmdMatch = msg.match(/^\/(\S+)/);
  if (cmdMatch) {
    const cmd = cmdMatch[1].toLowerCase();
    for (const s of skills) {
      if (s.name.toLowerCase() === cmd || s.id === cmd) {
        if (!active.find(a => a.skill.id === s.id)) {
          active.push({ skill: s, matchedTrigger: `command: /${cmd}` });
        }
      }
    }
    // 命令形式下不继续做关键词匹配,返回找到的
    if (active.length > 0) return active;
  }

  // 3. 关键词匹配
  const lowered = msg.toLowerCase();
  for (const s of skills) {
    if (active.find(a => a.skill.id === s.id)) continue; // 已激活
    for (const trigger of s.triggers) {
      if (lowered.includes(trigger.toLowerCase())) {
        active.push({ skill: s, matchedTrigger: trigger });
        break;
      }
    }
  }

  // 按 priority 降序
  active.sort((a, b) => b.skill.priority - a.skill.priority);
  return active;
}

/** 生成要注入的 prompt 文本 */
export function buildSkillPrompt(userMessage: string): string {
  const active = getActiveSkills(userMessage);
  if (active.length === 0) return "";

  const blocks = active.map(a =>
    `<!-- SKILL: ${a.skill.name} (triggered by: ${a.matchedTrigger}) -->\n${a.skill.prompt}`
  );
  return `\n\n## 激活的技能 (Skills)\n${blocks.join("\n\n---\n\n")}\n`;
}

/* ================================================================
 * 从外部 URL 安装 Skill
 * ================================================================ */

/** YAML frontmatter 最小解析 */
function parseFrontmatter(md: string): { meta: Record<string, string>; body: string } | null {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;
  const metaRaw = match[1];
  const body = match[2].trim();
  const meta: Record<string, string> = {};
  for (const line of metaRaw.split("\n")) {
    const kv = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
    if (kv) meta[kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  return { meta, body };
}

/** 验证 External URL — 阻止 SSRF (私有 IP / 内网 / metadata 端点) */
export function validateExternalUrl(rawUrl: string): string | null {
  // 允许相对路径 (本地开发 Vite 代理用)
  if (rawUrl.startsWith("/api/")) return null;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return "无法解析 URL"; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "仅支持 http/https 协议";
  const host = url.hostname.toLowerCase();
  const blocked = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "169.254.169.254", "metadata.google.internal", "100.100.100.200"];
  if (blocked.includes(host)) return `禁止访问内部地址: ${host}`;
  if (host.endsWith(".local") || host.endsWith(".internal")) return `禁止访问内网域名: ${host}`;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) return `禁止访问私有 IP: ${host}`;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `禁止访问原始 IP: ${host}`;
  return null;
}

/** 从 URL 安装 Skill(支持 GitHub Raw / Gist / 任意 .md / SPA → raw 链接自动转换) */
export async function installSkillFromUrl(rawUrl: string): Promise<SkillConfig> {
  // 关键词模式:不是合法 URL 时给出明确指引,不再尝试自动搜索
  if (!isLikelyUrl(rawUrl)) {
    throw new Error(
      `"${rawUrl}" 看起来不是 URL。install_skill 需要直接的文件 URL。\n\n` +
      `解决方法:\n` +
      `1. 直接粘贴 .md 文件 URL(支持 GitHub blob / gist / raw.githubusercontent.com)\n` +
      `2. 从 Skill 库一键装: ${SKILL_GALLERY.map(s => s.name).slice(0, 4).join("、")} 等\n` +
      `3. 手动创建: 粘贴带 YAML frontmatter 的 Markdown 内容`,
    );
  }
  // URL 安全验证
  const urlErr = validateExternalUrl(rawUrl);
  if (urlErr) throw new Error(`URL 验证失败: ${urlErr}`);

  const tried: string[] = [];
  // 仓库根 URL:先走 GitHub API 探文件树,挑所有 SKILL.md / skill.md / README.md
  const githubApiUrls = await listSkillFilesFromGithubRepo(rawUrl);
  const candidates = [
    ...githubApiUrls,
    ...buildSkillUrlCandidates(rawUrl),
  ];

  let lastError = "";
  for (const candidate of candidates) {
    tried.push(candidate);
    try {
      const md = await fetchAsText(candidate);
      const parsed = parseFrontmatter(md);
      if (parsed) {
        const { meta, body } = parsed;
        return addSkill({
          name: meta.name || meta.title || "未命名 Skill",
          description: meta.description || "",
          triggers: (meta.triggers || meta.keywords || "").split(/[,，]/).map(s => s.trim()).filter(Boolean),
          alwaysOn: meta.always_on === "true" || meta.alwaysOn === "true",
          prompt: body,
          priority: parseInt(meta.priority || "10", 10) || 10,
          enabled: true,
          // 记录真正能下载的源 URL,便于后续更新
          sourceUrl: candidate,
        });
      }
      // 抓到了但不是 markdown(可能仍是 HTML 骨架)
      lastError = `URL 返回的不是 markdown(可能是 SPA 骨架): ${candidate}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // 全部失败:给清晰指引,而不是干巴巴一句"格式无效"
  throw new Error(
    `无法从 ${rawUrl} 获取 Skill markdown。\n` +
    `已尝试 ${tried.length} 个候选 URL:\n${tried.map(u => "  • " + u).join("\n")}\n` +
    `最后一错: ${lastError}\n\n` +
    `可能原因:\n` +
    `1. 该 URL 是 SPA 页面(JS 渲染),需要打开浏览器开发者工具 → Network 找到 .md 真实请求 URL\n` +
    `2. URL 指向的是 GitHub blob 页面,改成 raw.githubusercontent.com 形式\n` +
    `3. URL 需要登录/token 访问\n\n` +
    `解决方法:打开 ${rawUrl} → 浏览器右键"另存为"或"查看源代码" → 把 .md 文件内容粘到下面输入框`,
  );
}

/**
 * 给定一个 URL,生成可能命中 markdown 的候选 URL 列表。
 * 处理常见模式:
 *   - GitHub blob → raw.githubusercontent.com
 *   - GitHub gist → gist.githubusercontent.com
 *   - GitHub API → raw
 *   - GitLab / Bitbucket 类似
 *   - 直接追加 /raw /install/*.md 等
 */
export function buildSkillUrlCandidates(rawUrl: string): string[] {
  const candidates: string[] = [rawUrl];
  try {
    const u = new URL(rawUrl);

    // GitHub: github.com/{owner}/{repo}/blob/{branch}/{path}
    //   → raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
    const ghBlob = u.hostname === "github.com" && u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (ghBlob) {
      const [, owner, repo, rest] = ghBlob;
      candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${rest}`);
    }

    // GitHub 仓库根 URL(没 blob 也没子路径):探 README.md / SKILL.md / skill.md 在 main 和 master 分支
    const ghRepo = u.hostname === "github.com" && u.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
    if (ghRepo) {
      const [, owner, repo] = ghRepo;
      for (const branch of ["main", "master"]) {
        for (const name of ["README.md", "SKILL.md", "skill.md", "index.md"]) {
          candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`);
        }
      }
    }

    // GitHub gist: gist.github.com/{user}/{id}
    //   → gist.githubusercontent.com/{user}/{id}/raw
    const gist = u.hostname === "gist.github.com" && u.pathname.match(/^\/([^/]+)\/([^/]+)/);
    if (gist) {
      const [, user, id] = gist;
      candidates.push(`https://gist.githubusercontent.com/${user}/${id}/raw`);
    }

    // GitLab: gitlab.com/{owner}/{repo}/-/blob/{branch}/{path}
    //   → gitlab.com/{owner}/{repo}/-/raw/{branch}/{path}
    if (u.hostname === "gitlab.com" && u.pathname.includes("/-/blob/")) {
      candidates.push(rawUrl.replace("/-/blob/", "/-/raw/"));
    }

    // 任何域名:在 path 后面追加常见 .md 文件名
    // 注意:new URL("/x", u) 只会用 u 的 origin,丢掉 path — 必须手动拼接
    const baseWithPath = u.origin + u.pathname.replace(/\/?$/, "");
    candidates.push(`${baseWithPath}/skill.md`);
    candidates.push(`${baseWithPath}/SKILL.md`);
    candidates.push(`${baseWithPath}/README.md`);

    // Gitea/Forgejo: /owner/repo/src/branch/{path} → /owner/repo/raw/branch/{path}
    const gitea = u.pathname.match(/^\/([^/]+)\/([^/]+)\/src\/branch\/(.+)$/);
    if (gitea && (u.hostname.includes("gitea") || u.hostname.includes("codeberg") || u.hostname.includes("forgejo"))) {
      const [, owner, repo, rest] = gitea;
      candidates.push(`https://${u.hostname}/${owner}/${repo}/raw/branch/${rest}`);
    }
  } catch {
    // 原始 URL 解析失败,只返回原 URL
  }
  return Array.from(new Set(candidates));
}

/** 走与 installSkillFromUrl 一致的 dev/prod 路径,返回响应文本
 * 生产环境自动兜底 CORS 代理(无需用户配置):
 *   1. 用户配的 corsProxy
 *   2. 内置公共代理(allorigins / corsproxy.io / cors.sh)
 *   3. 直连(终极兜底,某些 CDN 不需要代理)
 */
async function fetchAsText(rawUrl: string): Promise<string> {
  const { resolveFetchUrl } = await import("../../ai/llm-client");
  const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]";
  let fetchUrl: string;
  if (isDev) {
    fetchUrl = `/api/proxy/${encodeURIComponent(rawUrl)}`;
  } else {
    let corsProxy: string | undefined;
    try {
      const raw = localStorage.getItem("anrm_llm_config");
      if (raw) {
        const parsed = JSON.parse(raw) as { corsProxy?: string };
        corsProxy = parsed.corsProxy || undefined;
      }
    } catch { /* ignore */ }
    fetchUrl = resolveFetchUrl(rawUrl, corsProxy).url;
  }

  // 先试直连
  try {
    const res = await fetch(fetchUrl);
    if (res.ok) return await res.text();
  } catch { /* CORS 或网络错误,继续尝试代理 */ }

  // 生产环境自动兜底公共 CORS 代理(无需用户配置)
  if (!isDev) {
    const fallbacks = [
      `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`,
      `https://cors.sh/${rawUrl}`,
    ];
    for (const fb of fallbacks) {
      try {
        const res = await fetch(fb);
        if (res.ok) return await res.text();
      } catch { /* 这个代理也挂了,试下一个 */ }
    }
    throw new Error(`所有代理都失败: ${rawUrl}`);
  }
  throw new Error(`fetch 失败: ${fetchUrl}`);
}

/**
 * GitHub 仓库根 URL → 递归探文件树,返回所有 SKILL.md / skill.md / README.md 的 raw URL。
 * 失败(API 限流 / 非 GitHub / 网络错)返回空数组,主流程会继续走 buildSkillUrlCandidates 兜底。
 * dev 走 Vite 代理(/api/proxy/...),prod 直连(github api 支持 CORS)。
 */
async function listSkillFilesFromGithubRepo(rawUrl: string): Promise<string[]> {
  const m = rawUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return [];
  const [, owner, repo] = m;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  try {
    const isDev = typeof location !== "undefined" &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1");
    const fetchUrl = isDev ? `/api/proxy/${encodeURIComponent(apiUrl)}` : apiUrl;
    const res = await fetch(fetchUrl, {
      headers: { "Accept": "application/vnd.github.v3+json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as { tree?: Array<{ path: string; type: string }> };
    const tree = data.tree ?? [];
    const names = ["SKILL.md", "skill.md", "README.md"];
    const found = tree.filter(n =>
      n.type === "blob" && names.some(name => n.path.endsWith(`/${name}`) || n.path === name)
    );
    found.sort((a, b) => {
      const pa = names.findIndex(name => a.path.endsWith(name));
      const pb = names.findIndex(name => b.path.endsWith(name));
      if (pa !== pb) return pa - pb;
      return a.path.length - b.path.length;
    });
    return found.slice(0, 10).map(n =>
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${n.path}`
    );
  } catch {
    return [];
  }
}
export function isSkillDuplicated(url: string): boolean {
  return getSkills().some(s => (s as SkillConfig & { sourceUrl?: string }).sourceUrl === url);
}

/* ================================================================
 * 关键词模式: 不是 URL 就先搜后装
 * ================================================================ */

/** 判定输入是否"看起来是个 URL" — 含协议头或以 www./github.com/ 等开头 */
export function isLikelyUrl(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  // 显式协议
  if (/^https?:\/\//i.test(s)) return true;
  // 常见代码托管域名
  if (/^(www\.)?(github|gitlab|bitbucket|gitea|codeberg)\.(com|io|org)/i.test(s)) return true;
  // 尝试 URL 解析
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * 从搜索结果文本里抽出候选 URL。
 * 优先保留代码托管平台链接(GitHub/GitLab/Codeberg/raw),过滤:
 *   - 锚点 (#section)
 *   - 相对路径 (/foo/bar)
 *   - 内部 / API 调用
 */
export function extractSearchResultUrls(text: string): string[] {
  if (!text) return [];
  const urlRe = /https?:\/\/[^\s)\]\"'<>]+/g;
  const raw = text.match(urlRe) ?? [];
  const filtered = raw
    .map(u => u.replace(/[.,;:!?)]+$/, "")) // 去尾标点
    .filter(u => !u.includes("#"))           // 去锚点
    .filter(u => !u.startsWith("/"))         // 去相对路径(防御)
    .filter(u => {
      try {
        const h = new URL(u).hostname.toLowerCase();
        return h.includes("github.com") || h.includes("gitlab.com")
          || h.includes("codeberg.org") || h.includes("gist.github.com")
          || h.includes("raw.githubusercontent.com")
          || /\.md(\?|$)/i.test(u);
      } catch { return false; }
    });

  // 优先 GitHub/GitLab/Codeberg 链接,然后 .md 直链,然后 raw
  const priority = (u: string): number => {
    const h = (() => { try { return new URL(u).hostname; } catch { return ""; } })();
    if (h.includes("github.com") || h.includes("gitlab.com") || h.includes("codeberg.org")) return 0;
    if (h.includes("raw.githubusercontent.com")) return 1;
    if (/\.md(\?|$)/i.test(u)) return 2;
    return 3;
  };

  const dedup = Array.from(new Set(filtered));
  dedup.sort((a, b) => priority(a) - priority(b));
  return dedup;
}

/** 已知 skill 仓库的关键词 → 路径映射(保留以备未来拓展) */
const SKILL_KEYWORD_HINTS: Record<string, string[]> = {
  "翻译": ["anthropics/skills/skills/translation", "obra/superpowers/skills/translation"],
  "translate": ["anthropics/skills/skills/translation"],
  "代码审查": ["anthropics/skills/skills/code-review", "obra/superpowers/skills/code-review"],
  "code review": ["anthropics/skills/skills/code-review"],
  "调试": ["obra/superpowers/skills/debugging"],
  "debug": ["obra/superpowers/skills/debugging"],
  "测试": ["obra/superpowers/skills/test-driven-development"],
  "test": ["obra/superpowers/skills/test-driven-development"],
  "git": ["obra/superpowers/skills/git"],
  "重构": ["obra/superpowers/skills/refactoring"],
  "refactor": ["obra/superpowers/skills/refactoring"],
  "写作": ["anthropics/skills/skills/writing"],
  "writing": ["anthropics/skills/skills/writing"],
  "summarize": ["anthropics/skills/skills/summarization"],
  "摘要": ["anthropics/skills/skills/summarization"],
};

/** 从内置关键词库拿候选 GitHub URL */
export function guessUrlsFromKeywordHints(keyword: string): string[] {
  const lower = keyword.toLowerCase().trim();
  const urls: string[] = [];
  for (const [key, paths] of Object.entries(SKILL_KEYWORD_HINTS)) {
    if (lower.includes(key) || key.includes(lower)) {
      for (const p of paths) {
        urls.push(`https://github.com/${p}`);
      }
    }
  }
  return Array.from(new Set(urls));
}

/* ================================================================
 * 可安装的 Skill 库
 * ================================================================ */
export interface SkillGalleryItem {
  name: string;
  description: string;
  icon: string;
  triggers: string[];
  prompt: string;
}

/** 推荐的公开 Skill 列表(内容内置,一键安装) */
export const SKILL_GALLERY: SkillGalleryItem[] = [
  {
    name: "临床指南查证",
    description: "搜索最新临床指南(UpToDate/NICE/中华医学会),评估证据质量并摘要",
    icon: "📋",
    triggers: ["指南", "guideline", "临床路径", "专家共识", "推荐意见"],
    prompt: `## 临床指南查证技能

当用户询问临床指南时:
1. 先用 web_search 搜索最新指南(指定年份+指南名称)
2. 搜索范围: UpToDate、NICE、中华医学会、AAN/CNS 等权威来源
3. 提取关键推荐意见,标注推荐等级(1A/1B/2A/2B 或推荐/弱推荐)
4. 如涉及 ANRM 神经康复领域,结合神经机制分析指南合理性
5. 注明指南版本和发布时间,提醒指南可能有更新`,
  },
  {
    name: "SOAP笔记专家",
    description: "按SOAP结构生成专业病历记录,含ICF框架和功能预后评估",
    icon: "📝",
    triggers: ["SOAP", "病历", "记录", "病程", "progress note", "诊疗记录"],
    prompt: `## SOAP笔记专家技能

当用户要求书写病历或 SOAP 笔记时:
1. Subjective: 客户主诉、疼痛程度(VAS)、功能受限描述
2. Objective: 查体发现(ROM/MMT/感觉/反射/特殊试验)、量表评分
3. Assessment: 神经定位诊断(水平/节段/机制)、功能诊断(ICF框架)、预后判断
4. Plan: 治疗目标(SMART)、干预措施(引用干预库ID)、复评节点
5. 使用规范 ANRM 术语,医学术语保留英文原名
6. 包含康复界限提示(如卡压>3月考虑手术)`,
  },
  {
    name: "康复评定助手",
    description: "辅助填写Fugl-Meyer/Berg/Barthel等量表,自动计算分数和分级",
    icon: "📊",
    triggers: ["评定", "评估", "量表", "评分", "Fugl-Meyer", "Berg", "Barthel", "MMT", "ROM"],
    prompt: `## 康复评定助手技能

当用户需要进行康复评定时:
1. 列出该量表的所有评定项目
2. 逐项指导评分标准
3. 计算总分并给出分级(如 Berg <45 高风险跌倒)
4. 与上次评定对比(如系统中有历史数据)
5. 根据评定结果建议治疗重点
6. 常用量表: Fugl-Meyer(运动功能)、Berg(平衡)、Barthel(ADL)、MMSE(认知)、VAS(疼痛)
7. 生成评定报告,含日期、评定者、分数、趋势图描述`,
  },
  {
    name: "医患沟通话术",
    description: "生成客户易懂的病情解释、治疗方案沟通、预后告知话术",
    icon: "💬",
    triggers: ["沟通", "告知", "解释", "客户问", "家属问", "健康教育", "出院指导"],
    prompt: `## 医患沟通话术技能

当用户需要与客户/家属沟通时:
1. 使用通俗比喻解释医学概念(如"椎间盘像轮胎的减震垫")
2. 必含内容: 诊断是什么→怎么得的→怎么治→多久能好→注意事项
3. 康复预后: 给出乐观但现实的预期,强调主动参与的重要性
4. 危险信号: 明确指出何时需要立即就医
5. 末尾加免责声明: "本沟通指导仅供参考,具体请遵从主治治疗师建议"
6. 避免引起不必要的恐惧或过度乐观
7. 语言亲切但不失专业`,
  },
  {
    name: "影像报告解读",
    description: "辅助解读CT/MRI/X线报告,提取关键发现并翻译为临床语言",
    icon: "🩻",
    triggers: ["影像", "CT", "MRI", "X线", "磁共振", "报告解读", "放射"],
    prompt: `## 影像报告解读技能

当用户提供影像报告需要解读时:
1. 提取关键发现: 部位/病变类型/程度/累及结构
2. 翻译放射学术语为临床语言(如"L4-L5椎间盘T2信号减低"→"L4-L5椎间盘退变脱水")
3. 与临床症状关联: 该影像发现是否解释客户症状(如"中央型突出"对应"双侧症状")
4. 如需鉴别诊断: 列出可能的鉴别,建议补充检查
5. 重要提醒: "影像发现≠症状原因,无症状人群中椎间盘突出率高达30-50%"
6. 建议: 如保守治疗/手术指征/进一步检查
7. 始终提醒: 本解读仅供参考,正式报告由放射科医师出具`,
  },
];
