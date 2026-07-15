/**
 * 首次访问配置向导(浏览器侧)
 *
 * 当 VITE_SUPABASE_URL 也没在 build 时注入时,首次访问的用户会看到这个
 * 页面,自己填 Supabase URL + anon key,存在浏览器 localStorage。
 *
 * 之后所有 Supabase 客户端请求走用户自己配的 Supabase,**数据归用户自己**。
 *
 * 设计:
 *  - 纯前端表单(无后端协调)
 *  - 输入即时校验 URL 格式
 *  - anon key 一般是 sb_publishable_... 开头(新版)或 eyJ... 开头(旧版)
 *  - "跳过"按钮 — 暂时不配,走单机版(纯 localStorage)
 *  - "重置"按钮 — 任何时候点"重置配置"清掉 localStorage
 */

import { useState } from "react";

const STORAGE_KEY = "kfblxt:supabase:config";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readStoredConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.url === "string" &&
      typeof parsed.anonKey === "string" &&
      parsed.url.length > 0 &&
      parsed.anonKey.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearStoredConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function persistConfig(cfg: SupabaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    // *.supabase.co 是 Supabase 项目的标准 host
    if (!host.endsWith(".supabase.co") && host !== "supabase.co") return false;
    return true;
  } catch {
    return false;
  }
}

function isValidAnonKey(k: string): boolean {
  if (!k) return false;
  // 新版: sb_publishable_...  旧版 JWT: eyJ...
  return k.startsWith("sb_publishable_") || k.startsWith("eyJ");
}

interface SetupWizardProps {
  onConfigured: (cfg: SupabaseConfig) => void;
  onSkip: () => void;
}

export function SetupWizard({ onConfigured, onSkip }: SetupWizardProps) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const urlOk = isValidSupabaseUrl(url.trim());
  const keyOk = isValidAnonKey(anonKey.trim());
  const allOk = urlOk && keyOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allOk) {
      setError("URL 或 anon key 格式不对,请检查");
      return;
    }
    setSubmitting(true);
    try {
      // 轻量连通性测试:用 fetch 打 Supabase REST 根端点
      const testUrl = `${url.trim().replace(/\/$/, "")}/rest/v1/?apikey=${encodeURIComponent(anonKey.trim())}`;
      const res = await fetch(testUrl, { method: "GET" });
      if (res.status === 401) {
        setError("anon key 被拒,请检查复制是否完整(应该 sb_publishable_ 或 eyJ 开头)");
        return;
      }
      if (!res.ok) {
        setError(`连接失败: HTTP ${res.status}`);
        return;
      }
      const cfg = { url: url.trim(), anonKey: anonKey.trim() };
      persistConfig(cfg);
      onConfigured(cfg);
    } catch (e: unknown) {
      setError(`网络错误: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="setup-wizard" style={{ maxWidth: 560, margin: "60px auto", padding: "var(--space-6)" }}>
      <h1 style={{ marginTop: 0 }}>🩺 ANRM 神经康复诊治训练系统</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        首次使用,请填入您自己的 <strong>Supabase 项目</strong> 的连接信息。
        数据将存到您填的 Supabase,<strong>不会</strong>传到任何第三方服务器。
      </p>

      <details style={{ marginBottom: "var(--space-4)" }}>
        <summary style={{ cursor: "pointer", color: "var(--color-accent)" }}>
          还没创建 Supabase 项目?点我查看 5 步教程
        </summary>
        <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
          <li>
            下载 <strong>快速启动包</strong>:
            <a href="https://github.com/fxs-84/kfblxt/raw/main/supabase-bootstrap.zip"
               target="_blank" rel="noopener"
               style={{ marginLeft: 6 }}>
              📦 supabase-bootstrap.zip
            </a>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              (9 KB,内含 SQL + 指南)
            </span>
          </li>
          <li>
            浏览器打开 <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com/dashboard</a> 注册
          </li>
          <li>点 <strong>New Project</strong>,选个 region,设数据库密码</li>
          <li>
            进项目 → 左侧 <strong>SQL Editor</strong> → 把下载的 4 个 <code>.sql</code> 文件
            依次全粘到查询框 → 每个点 <strong>Run</strong>
          </li>
          <li>
            左侧 <strong>Settings(齿轮)→ API</strong> → 复制
            <strong>Project URL</strong> + <strong>Publishable / anon key</strong>
            → 粘到下面两个输入框
          </li>
        </ol>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
          ⚡ 总共约 5 分钟。数据存你自已的 Supabase,开发者碰不到。
        </p>
      </details>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="cfg-url">Supabase Project URL</label>
          <input
            id="cfg-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-project-ref.supabase.co"
            autoComplete="off"
            spellCheck={false}
          />
          {url && !urlOk && (
            <span style={{ color: "var(--color-warning, #c66)", fontSize: 12 }}>
              看起来不像 Supabase URL(应 *.supabase.co 结尾)
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="cfg-key">anon / publishable key</label>
          <input
            id="cfg-key"
            type="password"
            value={anonKey}
            onChange={(e) => setAnonKey(e.target.value)}
            placeholder="sb_publishable_...  或  eyJ..."
            autoComplete="off"
            spellCheck={false}
          />
          {anonKey && !keyOk && (
            <span style={{ color: "var(--color-warning, #c66)", fontSize: 12 }}>
              应以 sb_publishable_ 或 eyJ 开头
            </span>
          )}
        </div>

        {error && (
          <div className="field__error" style={{ color: "#c33", marginBottom: "var(--space-3)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!allOk || submitting}
          >
            {submitting ? "测试连接中…" : "保存并开始使用"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onSkip}
          >
            暂时跳过(单机演示)
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: "var(--space-4)" }}>
          💾 数据存在您浏览器的 localStorage(键 <code>{STORAGE_KEY}</code>)。
          换浏览器或清缓存会丢配置,需重新填。
        </p>
      </form>
    </div>
  );
}
