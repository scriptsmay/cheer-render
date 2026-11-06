import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { listen } from '../src/server.js';

function request(port, path, { method = 'POST', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('POST /render 带正确 token 返回 PNG', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const server = createServer(listen({ token: 'secret', renderCard: async () => png }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render?timestamp=123', {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: '测试文案', mood: 'daily', refs: [] }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.deepEqual([...res.body], [...png]);
  } finally {
    server.close();
  }
});

test('POST /render token 错误返回 401', async () => {
  const server = createServer(listen({ token: 'secret', renderCard: async () => Buffer.alloc(0) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'x', refs: [] }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /render 未配置 token 返回 503（fail-closed）', async () => {
  const server = createServer(listen({ token: '', renderCard: async () => Buffer.alloc(0) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer whatever', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'x', refs: [] }),
    });
    assert.equal(res.status, 503);
  } finally {
    server.close();
  }
});

test('GET /render 返回 404', async () => {
  const server = createServer(listen({ token: 'secret', renderCard: async () => Buffer.alloc(0) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', { method: 'GET' });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('非合法 JSON 请求体返回 400', async () => {
  const server = createServer(listen({ token: 'secret', renderCard: async () => Buffer.alloc(0) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: 'invalid-json{',
    });
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.body.toString()).ok, false);
  } finally {
    server.close();
  }
});

test('renderCard 渲染异常或上游超时返回 502', async () => {
  const server = createServer(
    listen({ token: 'secret', renderCard: async () => { throw new Error('render failed'); } })
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'x', refs: [] }),
    });
    assert.equal(res.status, 502);
    assert.equal(JSON.parse(res.body.toString()).ok, false);
  } finally {
    server.close();
  }
});

test('renderCard 抛出客户端错误（unknown font 等 4xx 语义）返回 400', async () => {
  const server = createServer(
    listen({ token: 'secret', renderCard: async () => { throw new Error('unknown font: nope'); } })
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'x', refs: [] }),
    });
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.body.toString()).ok, false);
  } finally {
    server.close();
  }
});

test('缺少必填字段 line 返回 400（不走渲染链路）', async () => {
  let called = false;
  const server = createServer(
    listen({ token: 'secret', renderCard: async () => { called = true; return Buffer.alloc(0); } })
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    for (const body of ['{}', '{"line":""}', '{"line":"   "}', '{"line":123}']) {
      const res = await request(port, '/render', {
        headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(res.status, 400, `body=${body}`);
      assert.match(JSON.parse(res.body.toString()).error, /missing required field: line/);
    }
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test('请求体超过上限返回 413', async () => {
  const server = createServer(
    listen({ token: 'secret', renderCard: async () => Buffer.alloc(0), maxBodyBytes: 1024 })
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/render', {
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: 'x'.repeat(4096) }),
    });
    assert.equal(res.status, 413);
    assert.equal(JSON.parse(res.body.toString()).ok, false);
  } finally {
    server.close();
  }
});

test('GET /health 无需鉴权返回 200', async () => {
  const server = createServer(listen({ token: 'secret', renderCard: async () => Buffer.alloc(0) }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const res = await request(port, '/health', { method: 'GET' });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body.toString()).ok, true);
  } finally {
    server.close();
  }
});
