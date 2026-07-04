/**
 * 外部工具统一配置存储 — localStorage。
 * 管理搜索引擎、Bing API Key 等外部工具的配置项。
 */
const CONFIG_KEY = "anrm_ext_config";

export interface ExtConfig {
  /** 搜索后端: bing | custom | none */
  searchBackend: "bing" | "custom" | "none";
  /** Bing Web Search API key (免费层 1000 req/month) */
  bingApiKey: string;
  /** 自配置搜索 URL 模板,{q} 替换为搜索词,如 https://searxng.example.com/search?q={q} */
  customSearchUrl: string;
}

const DEFAULTS: ExtConfig = {
  searchBackend: "bing",
  bingApiKey: "",
  customSearchUrl: "https://searxng.example.com/search?q={q}",
};

export function getExtConfig(): ExtConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ExtConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveExtConfig(partial: Partial<ExtConfig>): void {
  const current = getExtConfig();
  const merged = { ...current, ...partial };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error("[ext-config] 保存失败:", e);
  }
}

/** 检查搜索是否可用 */
export function isSearchConfigured(): boolean {
  const cfg = getExtConfig();
  if (cfg.searchBackend === "none") return false;
  if (cfg.searchBackend === "bing" && !cfg.bingApiKey) return false;
  return true;
}
