import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 字体清单：本地 fonts.json */
export function loadManifest(fontsDir) {
  const path = join(fontsDir, 'fonts.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** 单款字体 → 读取 base64，文件缺失时抛错 */
export function loadFontFile(fontsDir, entry) {
  const file = join(fontsDir, entry.file);
  if (!existsSync(file)) throw new Error(`font file missing: ${entry.file}`);
  const format = entry.file.endsWith('.otf') ? 'opentype' : 'truetype';
  return {
    id: entry.id,
    base64: readFileSync(file).toString('base64'),
    format,
  };
}

/** 拼装 @font-face CSS，直接绑定到 targetFamily（如 --wuyan-body） */
export function buildFontCss(slots) {
  if (!slots.length) return '';
  return slots
    .map((slot) => {
      if (!slot.base64) throw new Error(`missing base64 for slot: ${slot.targetFamily}`);
      return `@font-face{font-family:"${slot.targetFamily}";src:url(data:font/ttf;base64,${slot.base64}) format("${slot.format}");font-display:block}`;
    })
    .join('\n');
}

/** 客户端传参错误：标记 clientError 供 server.js 判 400（区别于上游故障 502） */
function clientError(message) {
  const err = new Error(message);
  err.clientError = true;
  return err;
}

/** 根据 CardInput.fonts 与清单组装待注入样式 */
export function resolveFontCss(input, fontsDir) {
  const fontReq = input?.fonts;
  if (!fontReq || (!fontReq.body && !fontReq.title)) return '';

  const manifest = loadManifest(fontsDir);
  const byId = new Map(manifest.map((f) => [f.id, f]));
  const slots = [];

  if (fontReq.body) {
    const entry = byId.get(fontReq.body);
    if (!entry) throw clientError(`unknown font: ${fontReq.body}`);
    const { base64, format } = loadFontFile(fontsDir, entry);
    slots.push({ targetFamily: '--wuyan-body', base64, format });
  }

  if (fontReq.title) {
    const entry = byId.get(fontReq.title);
    if (!entry) throw clientError(`unknown font: ${fontReq.title}`);
    const { base64, format } = loadFontFile(fontsDir, entry);
    slots.push({ targetFamily: '--wuyan-title', base64, format });
  }

  return buildFontCss(slots);
}
