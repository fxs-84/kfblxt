/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages base = 仓库名
const isGitHubPages = process.env.DEPLOY_TARGET === 'github-pages';

/** 代理目标 URL 安全验证 — 阻止 SSRF */
const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
  '169.254.169.254', // AWS/cloud metadata
  'metadata.google.internal', // GCP metadata
  '100.100.100.200', // Alibaba Cloud metadata
];
const BLOCKED_SUFFIXES = ['.local', '.internal', '.lan', '.corp'];
const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', 'fd'];

function validateProxyUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return '无法解析 URL'; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '仅允许 http/https 协议';

  const host = url.hostname.toLowerCase();
  for (const b of BLOCKED_HOSTS) { if (host === b) return `禁止访问内部地址: ${b}`; }
  for (const s of BLOCKED_SUFFIXES) { if (host.endsWith(s)) return `禁止访问内网域名: ${host}`; }
  for (const p of BLOCKED_PREFIXES) { if (host.startsWith(p)) return `禁止访问私有IP: ${host}`; }

  // 在 Vite 代理中模拟纯 IP 地址
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `禁止访问原始 IP: ${host}`;

  return null; // valid
}

/** MCP stdio 命令白名单 */
const MCP_COMMAND_WHITELIST = [
  'npx', 'node', 'python', 'python3', 'uvx',
];

function validateMCPCommand(cmd: string): string | null {
  const base = cmd.split(' ')[0].split('/').pop() || ''; // 取命令名
  const stripped = base.replace(/\.exe$/i, '');
  if (!MCP_COMMAND_WHITELIST.includes(stripped)) {
    return `MCP 命令 "${stripped}" 不在白名单中。允许: ${MCP_COMMAND_WHITELIST.join(', ')}`;
  }
  // 阻止危险的参数
  if (cmd.includes(';') || cmd.includes('&&') || cmd.includes('||') || cmd.includes('|')) {
    return '不允许命令链操作符 (; && || |)';
  }
  return null;
}

/** 本地开发代理: API 代理 + 搜索 + MCP stdio 网关 */
function devApiProxy(): Plugin {
  return {
    name: 'dev-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // ---- Bing Web Search 代理: /api/bing?q=...&count=... ----
        if (url.startsWith('/api/bing')) {
          const params = new URL(url, 'http://localhost').searchParams;
          const q = params.get('q') || '';
          const count = params.get('count') || '8';
          if (!q) { res.statusCode = 400; res.end('missing q'); return; }

          // 从请求头获取 Bing API key(由 external-tools.ts 的 fetch 带上)
          const bingKey = req.headers['x-bing-apikey'] as string || '';
          if (!bingKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'missing x-bing-apikey header' }));
            return;
          }

          const start = Date.now();
          console.log(`[api-proxy] ▶ Bing search: "${q.slice(0, 60)}"`);
          try {
            const bing = await fetch(
              `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=${count}&mkt=zh-CN`,
              { headers: { 'Ocp-Apim-Subscription-Key': bingKey } },
            );
            const body = await bing.text();
            console.log(`[api-proxy] ◀ Bing ${bing.status} (${Date.now() - start}ms)`);
            res.statusCode = bing.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(body);
          } catch (e) {
            console.error(`[api-proxy] ✕ Bing FAIL:`, (e as Error).message);
            res.statusCode = 502;
            res.end(JSON.stringify({ error: 'bing_error', detail: (e as Error).message }));
          }
          return;
        }

        // ---- MCP stdio 网关: /api/mcp/<server-id> → spawn 子进程 ----
        if (url.startsWith('/api/mcp/')) {
          const mcpId = url.slice('/api/mcp/'.length).split('/')[0];
          if (!mcpId) { res.statusCode = 400; res.end('missing server id'); return; }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks);
          const bodyStr = body.toString('utf-8');

          // 从请求头获取服务器配置
          const cmd = req.headers['x-mcp-command'] as string || '';
          const args = (req.headers['x-mcp-args'] as string || '').split(' ').filter(Boolean);

          if (!cmd) {
            res.statusCode = 400;
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: 'missing x-mcp-command header' } }));
            return;
          }

          // 命令白名单验证
          const cmdErr = validateMCPCommand(cmd);
          if (cmdErr) {
            console.warn(`[api-proxy] BLOCKED MCP: ${cmdErr} — ${cmd}`);
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: cmdErr } }));
            return;
          }
          // 验证参数中无命令注入
          for (const a of args) {
            if (a.includes(';') || a.includes('&&') || a.includes('||') || a.includes('|')) {
              res.statusCode = 403;
              res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -1, message: `禁止参数: ${a}` } }));
              return;
            }
          }

          console.log(`[api-proxy] ▶ MCP/${mcpId}: ${cmd} ${args.join(' ')}`);

          try {
            const { spawn } = await import('node:child_process');
            const proc = spawn(cmd, args, {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { ...process.env },
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
            proc.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

            proc.stdin.write(bodyStr);
            proc.stdin.end();

            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                proc.kill();
                reject(new Error('MCP 子进程超时(30s)'));
              }, 30000);
              proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0 || code === null) resolve();
                else reject(new Error(`MCP 进程退出码 ${code}: ${stderr.slice(0, 500)}`));
              });
              proc.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
              });
            });

            console.log(`[api-proxy] ◀ MCP/${mcpId} stdout: ${stdout.slice(0, 200)}`);
            if (stderr) console.warn(`[api-proxy] MCP/${mcpId} stderr:`, stderr.slice(0, 200));

            res.setHeader('Content-Type', 'application/json');
            res.end(stdout || '{}');
          } catch (e) {
            console.error(`[api-proxy] ✕ MCP/${mcpId} FAIL:`, (e as Error).message);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -1, message: (e as Error).message },
            }));
          }
          return;
        }

        // ---- 通用代理: /api/proxy/<urlencoded> → 解码后转发任意 API ----
        // 用 encodeURIComponent / decodeURIComponent 而不是 base64,完全 URL 安全
        const proxyMatch = url.match(/^\/api\/proxy\/(.+)$/);
        if (proxyMatch) {
          let target: string;
          try { target = decodeURIComponent(proxyMatch[1]); } catch { res.statusCode = 400; res.end('bad proxy url'); return; }

          // SSRF 防护: 验证目标 URL
          const urlErr = validateProxyUrl(target);
          if (urlErr) {
            console.warn(`[api-proxy] BLOCKED: ${urlErr} — ${target}`);
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'proxy_blocked', reason: urlErr, target }));
            return;
          }
          const method = req.method || 'POST';
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks);
          const start = Date.now();
          console.log(`[api-proxy] ▶ ${method} /api/proxy → ${target}`);
          try {
            const upstream = await fetch(target, {
              method,
              headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Authorization': req.headers['authorization'] || '',
                'x-api-key': String(req.headers['x-api-key'] || ''),
                'anthropic-version': String(req.headers['anthropic-version'] || ''),
              },
              body: ['GET', 'HEAD'].includes(method) ? undefined : body,
            });
            const resBody = await upstream.text();
            const elapsed = Date.now() - start;
            console.log(`[api-proxy] ◀ ${upstream.status} (${elapsed}ms) ${resBody.slice(0, 120)}`);
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(resBody);
          } catch (e) {
            console.error(`[api-proxy] ✕ FAIL (${Date.now() - start}ms):`, (e as Error).message);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'proxy_error', detail: (e as Error).message }));
          }
          return;
        }

        const match = url.match(/^\/api\/(deepseek|anthropic|openai)(\/.*)?$/);
        if (!match) return next();

        const [, provider, rest] = match;
        const targetMap: Record<string, string> = {
          deepseek: 'https://api.deepseek.com',
          anthropic: 'https://api.anthropic.com',
          openai: 'https://api.openai.com',
        };
        const target = targetMap[provider] + (rest || '');
        const method = req.method || 'GET';

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        const start = Date.now();
        console.log(`[api-proxy] ▶ ${method} /api/${provider}${rest || ''} → ${target}`);

        try {
          const upstream = await fetch(target, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': String(req.headers['authorization'] || ''),
              'x-api-key': String(req.headers['x-api-key'] || ''),
              'anthropic-version': String(req.headers['anthropic-version'] || ''),
            },
            body: ['GET', 'HEAD'].includes(method) ? undefined : body,
          });

          const resBody = await upstream.text();
          const elapsed = Date.now() - start;
          console.log(`[api-proxy] ◀ ${upstream.status} (${elapsed}ms) ${resBody.slice(0, 100)}`);

          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(resBody);
        } catch (e) {
          const elapsed = Date.now() - start;
          console.error(`[api-proxy] ✕ FAIL (${elapsed}ms):`, (e as Error).message);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'proxy_error', detail: (e as Error).message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiProxy()],
  base: isGitHubPages ? '/kfblxt/' : '/',
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})