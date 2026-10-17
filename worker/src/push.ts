import { buildPushPayload } from '@block65/webcrypto-web-push';
import { decrypt, validEndpoint } from './security';
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
export function pushConfigured(env: Env) {
  return !!(
    env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT &&
    env.SUBSCRIPTION_KEY
  );
}
export async function sendPush(
  env: Env,
  device: Device,
  message = {
    title: '알림 연결 확인 💧',
    body: '연결됐어요! 설정한 시간마다 남은 목표에 맞춰 마실 양을 알려드릴게요.',
  },
): Promise<PushResult> {
  let sub: Subscription, payload: Awaited<ReturnType<typeof buildPushPayload>>;
  try {
    sub = await decrypt<Subscription>(device.encrypted_subscription_data, env.SUBSCRIPTION_KEY!);
    if (!validEndpoint(sub.endpoint)) return 'failed';
    // RFC 8291 encryption keeps the recommended amount private from the push provider.
    payload = await buildPushPayload(
      { data: JSON.stringify(message), options: { ttl: 300, urgency: 'normal' } },
      { ...sub, expirationTime: null },
      {
        publicKey: env.VAPID_PUBLIC_KEY!,
        privateKey: env.VAPID_PRIVATE_KEY!,
        subject: env.VAPID_SUBJECT!,
      },
    );
  } catch {
    return 'failed';
  }
  try {
    const res = await fetch(sub.endpoint, {
      ...payload,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    await res.body?.cancel();
    if (res.status >= 200 && res.status < 300) return 'accepted';
    if (res.status === 404 || res.status === 410) return 'expired';
    if (res.status === 429 || res.status >= 500) return 'retry';
    return 'failed';
  } catch {
    // An ambiguous response must not cause a duplicate notification.
    return 'unknown';
  }
}
