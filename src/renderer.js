import puppeteer from 'puppeteer-core';
import { resolveFontCss } from './fonts.js';

// 环境读取（部署时由 .env / systemd EnvironmentFile 注入）
const BROWSERLESS_WS = process.env.BROWSERLESS_WS || 'ws://127.0.0.1:11300';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';
const RENDER_HOST_URL = process.env.RENDER_HOST_URL || 'http://127.0.0.1:5173/render.html';
const GOTO_TIMEOUT = Number(process.env.GOTO_TIMEOUT || 60000);
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT || 60000);
// 字体目录（本地目录，含 fonts.json + TTF；不入 git、不经 Web 暴露）
const FONTS_DIR = process.env.FONTS_DIR || new URL('../fonts', import.meta.url).pathname;

/** 'data:image/png;base64,<b64>' → PNG Buffer */
export function dataUrlToPng(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('invalid data url');
  }
  return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
}

/**
 * 渲染工厂：注入 connect（便于单测 mock），返回 renderCard。
 * 出卡只做「连 browserless → 开页 → 等 __wuyanRender → evaluate 出 dataUrl」。
 * evaluate 不受 setDefaultTimeout 约束，需显式 Promise.race 兜底，
 * 否则 CORS 图片挂起 / fonts.ready 不 resolve 时 Node 侧永久挂起、tab 与 WS 连接泄露。
 */
export function makeRenderer({ connect = defaultConnect, renderHostUrl = RENDER_HOST_URL, renderTimeout = RENDER_TIMEOUT, fontsDir = FONTS_DIR } = {}) {
  return async function renderCard(input) {
    // 先解析字体注入参数：unknown font 等客户端错误在连 browserless 之前抛出，
    // 避免浪费一次无头浏览器往返；resolveFontCss 抛的错带 clientError 标记（server.js 据此判 400）。
    const fontCss = resolveFontCss(input, fontsDir);
    const browser = await connect();
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(renderTimeout);
      try {
        await page.goto(renderHostUrl, { waitUntil: 'networkidle0', timeout: GOTO_TIMEOUT });
        // 字体注入在 evaluate 之前：@font-face 绑定占位族名，Canvas 遇到时由 renderCheerCard
        // 内部的 document.fonts.load 拉取。font-display:block 保证宁等字体也不用 fallback 画错图。
        if (fontCss) {
          await page.addStyleTag({ content: fontCss });
        }
        await page.waitForFunction('typeof window.__wuyanRender === "function"', { timeout: renderTimeout });
        const evaluatePromise = page.evaluate(async (cardInput) => {
          const card = await window.__wuyanRender(cardInput);
          return card.dataUrl;
        }, input);
        // evaluate 挂起兜底：超时即 reject，由 finally 链关闭 tab 并断开连接。
        // unref 防止兜底定时器拖住进程退出。
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('render evaluation timed out')), renderTimeout);
          timeoutId.unref?.();
        });
        const dataUrl = await Promise.race([evaluatePromise, timeoutPromise]);
        clearTimeout(timeoutId);
        return dataUrlToPng(dataUrl);
      } finally {
        await page.close().catch(() => {});
      }
    } finally {
      await browser.disconnect();
    }
  };
}

function defaultConnect() {
  return puppeteer.connect({
    browserWSEndpoint: `${BROWSERLESS_WS}?token=${BROWSERLESS_TOKEN}`,
  });
}

// 默认实例（生产路径）
export const renderCard = makeRenderer();
