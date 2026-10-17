import { b64, unb64, enc, decrypt, validEndpoint } from './security';
import type { Env } from './models';
export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface Device {
  id: string;
  user_id: string;
  encrypted_subscription_data: string;
}
export type PushResult = 'accepted' | 'expired' | 'retry' | 'failed' | 'unknown';
const jwtCache = new Map<string, { token: string; until: number }>();
export function pushConfigured(env: Env) {
  return !!(
    env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT &&
    env.SUBSCRIPTION_KEY
  );
}
async function authorization(endpoint: string, env: Env) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000),
    cacheKey = audience + env.VAPID_PUBLIC_KEY;
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.until > now) return cached.token;
  const pub = unb64(env.VAPID_PUBLIC_KEY!);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64(pub.slice(1, 33)),
      y: b64(pub.slice(33)),
      d: env.VAPID_PRIVATE_KEY!,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const input =
    b64(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) +
    '.' +
    b64(enc.encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: env.VAPID_SUBJECT })));
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(input),
  );
  const token = `vapid t=${input}.${b64(new Uint8Array(signature))}, k=${env.VAPID_PUBLIC_KEY}`;
  jwtCache.set(cacheKey, { token, until: now + 3000 });
  return token;
}
export async function sendPush(env: Env, device: Device): Promise<PushResult> {
  let sub: Subscription, auth: string;
  try {
    sub = await decrypt<Subscription>(device.encrypted_subscription_data, env.SUBSCRIPTION_KEY!);
    if (!validEndpoint(sub.endpoint)) return 'failed';
    auth = await authorization(sub.endpoint, env);
  } catch {
    return 'failed';
  }
  try {
    // RFC 8030 permits a bodyless push. Text is constant in the service worker;
    // no personal hydration data crosses the push provider, no payload encryption needed.
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: auth, TTL: '300', Urgency: 'normal' },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    await res.body?.cancel();
    if (res.status >= 200 && res.status < 300) return 'accepted';
    if (res.status === 404 || res.status === 410) return 'expired';
    if (res.status === 429 || res.status >= 500) return 'retry';
    return 'failed';
  } catch {
    // Network outcome is ambiguous: an accepted request may lose its response.
    // Retrying it could produce a duplicate. Prefer an explicit unknown outcome.
    return 'unknown';
  }
}
