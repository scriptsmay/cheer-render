import { timingSafeEqual } from 'node:crypto';

// Bearer token 比对。未配置 token 时 fail-closed，绝不放行。
// timingSafeEqual 要求等长，故先比长度（长度本身不算秘密），等长再走常量时间比对。
export function authorize(authHeader, token) {
  if (!token) return 'unconfigured';
  const expected = `Bearer ${token}`;
  if (typeof authHeader !== 'string' || authHeader.length !== expected.length) return 'denied';
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)) ? 'ok' : 'denied';
}
