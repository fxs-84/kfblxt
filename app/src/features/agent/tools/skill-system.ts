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
    name: "患者教育材料",
    description: "生成患者易懂的健康教育材料",
    triggers: ["患者教育", "科普", "健康教育", "家庭作业说明", "患者须知", "康复指导"],
    alwaysOn: false,
    prompt: `## 患者教育材料技能

当用户请求生成患者教育材料时:
1. 使用通俗易懂的语言,避免医学术语(或附解释)
2. 结构化: 背景→注意事项→每日练习→危险信号
3. 适合打印或发送给患者
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

/** 从 URL 安装 Skill(支持 GitHub Raw / Gist / 任意 .md 文件) */
export async function installSkillFromUrl(rawUrl: string): Promise<SkillConfig> {
  // URL 安全验证
  const urlErr = validateExternalUrl(rawUrl);
  if (urlErr) throw new Error(`URL 验证失败: ${urlErr}`);

  // 决定 fetch URL:
  //   - 本地 dev: 走 Vite 代理(自动处理 CORS);urlencoded 编码
  //   - 生产 + 配了 corsProxy: 包到代理后面
  //   - 生产直连: 浏览器会拦截 CORS,提示用户填 corsProxy
  const { resolveFetchUrl } = await import("../../ai/llm-client");
  const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]";
  let fetchUrl: string;
  if (isDev) {
    fetchUrl = `/api/proxy/${encodeURIComponent(rawUrl)}`;
  } else {
    // 读 corsProxy 配置
    let corsProxy: string | undefined;
    try {
      const raw = localStorage.getItem("anrm_llm_config");
      if (raw) {
        const parsed = JSON.parse(raw) as { corsProxy?: string };
        corsProxy = parsed.corsProxy || undefined;
      }
    } catch { /* ignore */ }
    const resolved = resolveFetchUrl(rawUrl, corsProxy);
    fetchUrl = resolved.url;
  }

  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}: 无法获取 ${rawUrl}`);
  const md = await res.text();

  const parsed = parseFrontmatter(md);
  if (!parsed) throw new Error("Skill 文件格式无效: 缺少 YAML frontmatter (---...---)");

  const { meta, body } = parsed;

  return addSkill({
    name: meta.name || meta.title || "未命名 Skill",
    description: meta.description || "",
    triggers: (meta.triggers || meta.keywords || "").split(/[,，]/).map(s => s.trim()).filter(Boolean),
    alwaysOn: meta.always_on === "true" || meta.alwaysOn === "true",
    prompt: body,
    priority: parseInt(meta.priority || "10", 10) || 10,
    enabled: true,
    sourceUrl: rawUrl,
  });
}

/** 检查是否重复安装 */
export function isSkillDuplicated(url: string): boolean {
  return getSkills().some(s => (s as SkillConfig & { sourceUrl?: string }).sourceUrl === url);
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
1. Subjective: 患者主诉、疼痛程度(VAS)、功能受限描述
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
    description: "生成患者易懂的病情解释、治疗方案沟通、预后告知话术",
    icon: "💬",
    triggers: ["沟通", "告知", "解释", "患者问", "家属问", "健康教育", "出院指导"],
    prompt: `## 医患沟通话术技能

当用户需要与患者/家属沟通时:
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
3. 与临床症状关联: 该影像发现是否解释患者症状(如"中央型突出"对应"双侧症状")
4. 如需鉴别诊断: 列出可能的鉴别,建议补充检查
5. 重要提醒: "影像发现≠症状原因,无症状人群中椎间盘突出率高达30-50%"
6. 建议: 如保守治疗/手术指征/进一步检查
7. 始终提醒: 本解读仅供参考,正式报告由放射科医师出具`,
  },
];
