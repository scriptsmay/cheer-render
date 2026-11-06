import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveFontCss } from '../src/fonts.js';

function makeFontsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cheer-fonts-'));
  writeFileSync(
    join(dir, 'fonts.json'),
    JSON.stringify([
      { id: 'muyao-suixin', displayName: '沐瑶随心手写体', file: 'muyao.ttf', style: '手写', license: 'x' },
      { id: 'xiaolai', displayName: '小赖字体', file: 'xiaolai.otf', style: '手写', license: 'x' },
    ])
  );
  writeFileSync(join(dir, 'muyao.ttf'), Buffer.from([0x00, 0x01, 0x02]));
  writeFileSync(join(dir, 'xiaolai.otf'), Buffer.from([0x03, 0x04]));
  return dir;
}

test('未指定字体时返回空串（保持默认行为）', () => {
  assert.equal(resolveFontCss({}, '/not-exist'), '');
  assert.equal(resolveFontCss({ fonts: {} }, '/not-exist'), '');
});

test('指定不存在的字体 ID 抛错（不静默回落，且标记为客户端错误）', () => {
  let caught;
  try {
    resolveFontCss({ fonts: { body: 'nope' } }, '/not-exist');
  } catch (err) {
    caught = err;
  }
  assert.match(caught?.message ?? '', /unknown font: nope/);
  // 客户端错误约定：供 server.js 判 400 而非 502
  assert.equal(caught?.clientError, true);
});

test('body+title 双族注入生成两条 @font-face', () => {
  const dir = makeFontsDir();
  try {
    const css = resolveFontCss({ fonts: { body: 'muyao-suixin', title: 'xiaolai' } }, dir);
    assert.match(css, /font-family:\s*"--wuyan-body"/);
    assert.match(css, /font-family:\s*"--wuyan-title"/);
    assert.match(css, /format\("truetype"\)/);
    assert.match(css, /format\("opentype"\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('清单存在但字体文件缺失时抛错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cheer-fonts-'));
  try {
    writeFileSync(
      join(dir, 'fonts.json'),
      JSON.stringify([{ id: 'ghost', displayName: '幽灵', file: 'ghost.ttf', style: '手写', license: 'x' }])
    );
    assert.throws(() => resolveFontCss({ fonts: { body: 'ghost' } }, dir), /font file missing: ghost\.ttf/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
