import test from 'node:test';
import assert from 'node:assert/strict';
import { dataUrlToPng, makeRenderer } from '../src/renderer.js';

test('dataUrlToPng 解析标准 PNG data URL', () => {
  const png = dataUrlToPng('data:image/png;base64,QUJD');
  assert.deepEqual([...png], [0x41, 0x42, 0x43]); // "ABC"
});

test('dataUrlToPng 拒绝非 PNG data URL', () => {
  assert.throws(() => dataUrlToPng('data:image/jpeg;base64,QUJD'), /invalid data url/);
});

test('dataUrlToPng 拒绝空串', () => {
  assert.throws(() => dataUrlToPng(''), /invalid data url/);
});

function fakeBrowserWith(page) {
  return {
    newPage: async () => page,
    disconnect: async () => {},
  };
}

function basePage(overrides = {}) {
  return {
    setDefaultTimeout() {},
    async goto() {},
    async waitForFunction() {},
    async evaluate() {
      return 'data:image/png;base64,QUJD';
    },
    async close() {},
    ...overrides,
  };
}

test('renderCard evaluate 永久挂起时在 renderTimeout 内 reject（不泄露 tab/连接）', async () => {
  let closed = false;
  let disconnected = false;
  const page = basePage({
    evaluate: () => new Promise(() => {}), // 永不 resolve，模拟 CORS 图片/fonts.ready 卡死
    close: async () => { closed = true; },
  });
  const browser = fakeBrowserWith(page);
  browser.disconnect = async () => { disconnected = true; };
  const renderCard = makeRenderer({ connect: async () => browser, renderTimeout: 50 });
  await assert.rejects(() => renderCard({ line: 'x' }), /render evaluation timed out/);
  assert.equal(closed, true);
  assert.equal(disconnected, true);
});

test('renderCard 正常路径返回 PNG Buffer', async () => {
  const renderCard = makeRenderer({
    connect: async () => fakeBrowserWith(basePage()),
    renderTimeout: 1000,
  });
  const png = await renderCard({ line: 'x' });
  assert.deepEqual([...png], [0x41, 0x42, 0x43]);
});
