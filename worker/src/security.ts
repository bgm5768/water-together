export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const enc = new TextEncoder();
export function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
export function secret() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hash(s: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}
export async function encrypt(value: unknown, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt']);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    k,
    enc.encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}
export async function decrypt<T>(value: string, key: string): Promise<T> {
  const [iv, data] = value.split('.');
  const k = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(data)),
    ),
  );
}
export async function rate(
  db: D1Database,
  key: string,
  max: number,
  seconds: number,
  now = Date.now(),
) {
  const bucket = Math.floor(now / (seconds * 1000));
  const r = await db
    .prepare(
      'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(await hash(`${key}:${bucket}`), (bucket + 1) * seconds * 1000)
    .first<{ count: number }>();
  if (!r || r.count > max)
    throw new HttpError(429, '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
}
// Exact vendor hosts only. No user-controlled redirects or arbitrary network destinations.
export function validEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === 'https:' &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
