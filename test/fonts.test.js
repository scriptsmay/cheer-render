import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFontCss } from '../src/fonts.js';

test('buildFontCss 生成直接绑定占位族名的 base64 @font-face', () => {
  const css = buildFontCss([
    { targetFamily: '--wuyan-body', base64: 'QUJD', format: 'truetype' },
  ]);
  assert.match(css, /@font-face/);
  assert.match(css, /font-family:\s*"--wuyan-body"/);
  assert.match(css, /data:font\/ttf;base64,QUJD/);
  assert.match(css, /font-display:\s*block/);
});

test('buildFontCss 空清单返回空串', () => {
  assert.equal(buildFontCss([]), '');
});

test('buildFontCss 拒绝缺 base64 的条目', () => {
  assert.throws(() => buildFontCss([{ targetFamily: '--wuyan-body' }]), /missing base64/);
});
