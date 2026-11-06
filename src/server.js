import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { authorize } from './auth.js';
import { renderCard as defaultRenderCard } from './renderer.js';

const PORT = Number(process.env.PORT || 13000);
const HOST = process.env.HOST || '127.0.0.1';
// 请求体上限：CardInput 正常 < 100KB，5MB 已极宽；超限直接 413 断流，防内存拼装 OOM。
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 5 * 1024 * 1024);

/**
 * 返回 http 请求处理器工厂，便于单测注入 mock renderCard 与 token。
 * 生产入口见文件尾部的自启动分支。
 */
export function listen({ token, renderCard, maxBodyBytes = MAX_BODY_BYTES }) {
  return async function handler(req, res) {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;

    // 轻量健康探针：不查 browserless，供反向代理或监控拨测。
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== 'POST' || (pathname !== '/render' && pathname !== '/render/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }
    const auth = authorize(req.headers.authorization || '', token);
    if (auth === 'unconfigured') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'render token not configured' }));
      return;
    }
    if (auth === 'denied') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > maxBodyBytes) {
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (tooLarge) return;
      let input;
      try {
        input = JSON.parse(raw || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid json body' }));
        return;
      }

      // 最小语义校验：缺 line 直接 400，不浪费 puppeteer 链路的算力与带宽。
      if (!input || typeof input.line !== 'string' || !input.line.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'missing required field: line' }));
        return;
      }

      try {
        const png = await renderCard(input);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
        res.end(png);
      } catch (err) {
        // 区分客户端传参错误（400）与上游渲染/browserless 故障（502）。
        // 客户端错误约定：渲染侧抛带 err.clientError === true 或消息以已知前缀开头。
        const message = err?.message || 'render failed';
        const isClientError = err?.clientError === true || message.startsWith('unknown font');
        const status = isClientError ? 400 : 502;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: message }));
      }
    });
  };
}

export function start({ token, renderCard = defaultRenderCard, port = PORT, host = HOST } = {}) {
  const server = createServer(listen({ token, renderCard }));
  server.listen(port, host, () => {
    console.log(`cheer-render listening on ${host}:${port}`);
  });
  // 优雅停机：systemd 重启/停止发 SIGTERM，先停止接收新连接，
  // 让在途渲染交付完再退出，避免强杀留 browserless 孤儿 tab。
  const shutdown = (signal) => {
    console.log(`received ${signal}, closing server...`);
    server.close(() => process.exit(0));
    // 兜底：10s 内未排空在途请求则强退（由 systemd Restart 拉起）。
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

// 生产进程自执行入口（Node 模块直接运行）。
// Node 20.11+ 用 import.meta.filename 比对，避免路径含空格/特殊字符时 URL 编码失配。
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  start({ token: process.env.RENDER_TOKEN });
}
