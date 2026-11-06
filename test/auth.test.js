import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../src/auth.js';

test('authorize 未配置 token 返回 unconfigured（fail-closed）', () => {
  assert.equal(authorize('Bearer x', ''), 'unconfigured');
});

test('authorize token 不匹配返回 denied', () => {
  assert.equal(authorize('Bearer wrong', 'secret'), 'denied');
});

test('authorize token 匹配返回 ok', () => {
  assert.equal(authorize('Bearer secret', 'secret'), 'ok');
});

test('authorize 无 Authorization 头返回 denied', () => {
  assert.equal(authorize('', 'secret'), 'denied');
});
