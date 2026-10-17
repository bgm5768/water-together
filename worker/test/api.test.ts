import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  generateKeyPairSync,
  randomBytes,
  createPublicKey,
  verify,
  diffieHellman,
  hkdfSync,
  createDecipheriv,
} from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';
import { defaults } from '../../shared/types';

let mf: Miniflare,
  db: Awaited<ReturnType<Miniflare['getD1Database']>>,
  counter = 0;
const fetchMock = createFetchMock();
fetchMock.disableNetConnect();
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
  jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x!, 'base64url'),
  Buffer.from(jwk.y!, 'base64url'),
]).toString('base64url');
before(async () => {
  const output = await build({
    entryPoints: ['worker/test/harness.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  mf = new Miniflare({
    modules: true,
    script: output.outputFiles[0].text,
    compatibilityDate: '2025-10-14',
    d1Databases: ['DB'],
    fetchMock,
    bindings: {
      ALLOWED_ORIGIN: 'http://localhost:5173',
      VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: jwk.d!,
      VAPID_SUBJECT: 'mailto:test@example.com',
      SUBSCRIPTION_KEY: randomBytes(32).toString('base64url'),
    },
  });
  db = await mf.getD1Database('DB');
  const sql = await readFile('worker/migrations/0001_initial.sql', 'utf8');
  for (const part of sql.split('-- statement')) if (part.trim()) await db.prepare(part).run();
});
after(async () => {
  await mf?.dispose();
  await fetchMock.close();
});
beforeEach(async () => {
  for (const table of [
    'notification_delivery_logs',
    'push_subscriptions',
    'water_logs',
    'sessions',
    'notification_settings',
    'group_members',
    'groups',
    'users',
    'rate_limits',
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
async function request(
  path: string,
  method = 'GET',
  data?: unknown,
  token?: string,
  extra: Record<string, string> = {},
) {
  const r = await mf.dispatchFetch('http://localhost' + path, {
    method,
    headers: {
      Origin: 'http://localhost:5173',
      'CF-Connecting-IP': `192.0.2.${++counter}`,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, data: (await r.json()) as any, headers: r.headers };
}
async function create(name = '가람') {
  const r = await request('/api/groups', 'POST', { display_name: name });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data as { token: string; recovery_code: string; invite_code: string };
}
async function pair() {
  const a = await create();
  const b = await request('/api/join', 'POST', {
    display_name: '나래',
    invite_code: a.invite_code,
  });
  assert.equal(b.status, 201);
  return { a, b: b.data as { token: string; recovery_code: string } };
}
const stamp = '2025-05-02T01:30:00.000Z';
async function log(token: string, ml = 200, when = stamp, id = crypto.randomUUID()) {
  return request('/api/logs', 'POST', { amount_ml: ml, consumed_at: when }, token, {
    'Idempotency-Key': id,
  });
}
const endpoint = 'https://fcm.googleapis.com/fcm/send/';
function subscription(name = 'device') {
  return {
    endpoint: endpoint + name,
    keys: { p256dh: publicKey, auth: randomBytes(16).toString('base64url') },
  };
}
async function subscribe(token: string, name = 'device') {
  const r = await request('/api/push/subscribe', 'POST', subscription(name), token);
  assert.equal(r.status, 200, JSON.stringify(r.data));
}
async function cron(now: number) {
  const r = await mf.dispatchFetch('http://localhost/__test/cron?now=' + now);
  assert.equal(r.status, 200, await r.text());
}
const scheduledAt = Date.parse('2025-05-05T00:00:00Z');
test('create, authenticate, safe hashes, and invalid token', async () => {
  const a = await create(),
    me = await request('/api/me', 'GET', undefined, a.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.display_name, '가람');
  assert.equal(me.data.settings.daily_goal_ml, 2000);
  assert.equal((await request('/api/me', 'GET', undefined, 'x'.repeat(43))).status, 401);
  assert.equal((await request('/api/me')).status, 401);
  const user = await db
    .prepare('SELECT recovery_hash FROM users')
    .first<{ recovery_hash: string }>();
  assert.notEqual(user?.recovery_hash, a.recovery_code);
  const session = await db
    .prepare('SELECT token_hash FROM sessions')
    .first<{ token_hash: string }>();
  assert.notEqual(session?.token_hash, a.token);
  assert.equal(me.headers.get('cache-control'), 'no-store');
});
test('join exactly two, reject third and invalid invite, no duplicate authenticated join', async () => {
  const { a, b } = await pair();
  assert.equal(
    (await request('/api/join', 'POST', { display_name: '셋', invite_code: a.invite_code })).status,
    409,
  );
  assert.equal(
    (await request('/api/join', 'POST', { display_name: '셋', invite_code: 'x'.repeat(43) }))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        '/api/join',
        'POST',
        { display_name: '또', invite_code: a.invite_code },
        b.token,
      )
    ).data.already_joined,
    true,
  );
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>())?.n, 2);
});
test('concurrent second joins cannot exceed capacity and failed batch leaves no user', async () => {
  const a = await create();
  const r = await Promise.all([
    request('/api/join', 'POST', { display_name: '둘', invite_code: a.invite_code }),
    request('/api/join', 'POST', { display_name: '셋', invite_code: a.invite_code }),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>())?.n, 2);
});
test('recovery preserves settings/logs, rotates code and revokes old session', async () => {
  const a = await create();
  await log(a.token);
  await request('/api/settings', 'PUT', { ...defaults, daily_goal_ml: 2500 }, a.token);
  const r = await request('/api/recover', 'POST', { recovery_code: a.recovery_code });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.recovery_code, a.recovery_code);
  assert.equal((await request('/api/me', 'GET', undefined, a.token)).status, 401);
  assert.equal(
    (await request('/api/me', 'GET', undefined, r.data.token)).data.settings.daily_goal_ml,
    2500,
  );
  assert.equal(
    (await request('/api/day?date=2025-05-02', 'GET', undefined, r.data.token)).data.logs.length,
    1,
  );
  assert.equal(
    (await request('/api/recover', 'POST', { recovery_code: a.recovery_code })).status,
    400,
  );
});
test('concurrent recovery yields one new session only', async () => {
  const a = await create();
  const results = await Promise.all([
    request('/api/recover', 'POST', { recovery_code: a.recovery_code }),
    request('/api/recover', 'POST', { recovery_code: a.recovery_code }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(
    (
      await db
        .prepare('SELECT count(*) n FROM sessions WHERE revoked_at IS NULL')
        .first<{ n: number }>()
    )?.n,
    1,
  );
});
test('own CRUD, peer forbidden, other groups isolated, and idempotent creation', async () => {
  const { a, b } = await pair(),
    outsider = await create('외부');
  const key = crypto.randomUUID();
  const r = await log(a.token, 200, stamp, key);
  assert.equal(r.status, 201);
  assert.equal((await log(a.token, 200, stamp, key)).status, 201);
  assert.equal((await log(a.token, 300, stamp, key)).status, 409);
  const url = '/api/logs/' + r.data.id;
  assert.equal(
    (await request(url, 'PATCH', { amount_ml: 500, consumed_at: stamp }, b.token)).status,
    404,
  );
  assert.equal((await request(url, 'DELETE', undefined, b.token)).status, 404);
  assert.equal((await request(url, 'DELETE', undefined, outsider.token)).status, 404);
  assert.equal(
    (await request('/api/day?date=2025-05-02', 'GET', undefined, outsider.token)).data.logs.length,
    0,
  );
  assert.equal((await request('/api/day?group_id=other', 'GET', undefined, a.token)).status, 400);
  assert.equal(
    (await request(url, 'PATCH', { amount_ml: 500, consumed_at: stamp }, a.token)).status,
    200,
  );
  const day = await request('/api/day?date=2025-05-02', 'GET', undefined, a.token);
  assert.equal(day.data.logs.length, 1);
  assert.equal(day.data.members.find((m: any) => m.display_name === '가람').total_ml, 500);
  assert.equal((await request(url, 'DELETE', undefined, a.token)).status, 200);
});
test('daily totals, zero, Seoul midnight, past dates and validation', async () => {
  const { a, b } = await pair();
  await log(a.token, 100, '2025-05-01T14:59:59Z');
  await log(a.token, 200, '2025-05-01T15:00:00Z');
  await log(a.token, 300, stamp);
  await log(b.token, 150, stamp);
  const day = (await request('/api/day?date=2025-05-02', 'GET', undefined, a.token)).data;
  assert.deepEqual(
    day.members.map((m: any) => m.total_ml).sort((a: number, b: number) => a - b),
    [150, 500],
  );
  const past = (await request('/api/day?date=2025-05-01', 'GET', undefined, a.token)).data;
  assert.equal(past.logs.length, 1);
  assert.equal(
    (await request('/api/day?date=2025-05-03', 'GET', undefined, a.token)).data.members[0].total_ml,
    0,
  );
  assert.equal((await request('/api/day?date=2025-02-30', 'GET', undefined, a.token)).status, 400);
  for (const amount of [0, -1, 1.5, 3001]) assert.equal((await log(a.token, amount)).status, 400);
  assert.equal(
    (
      await request(
        '/api/logs',
        'POST',
        { amount_ml: 100, consumed_at: stamp, user_id: 'spoof' },
        a.token,
        { 'Idempotency-Key': crypto.randomUUID() },
      )
    ).status,
    400,
  );
  const recent = await log(a.token, 120, new Date().toISOString());
  assert.equal(recent.status, 201);
  assert.equal((await request('/api/day', 'GET', undefined, a.token)).data.logs.length, 1);
});
test('settings validation and independent user settings', async () => {
  const { a, b } = await pair();
  const initial = (await request('/api/me', 'GET', undefined, a.token)).data.settings;
  assert.deepEqual(Object.keys(initial).sort(), Object.keys(defaults).sort());
  assert.equal(
    (await request('/api/settings', 'PUT', { ...initial, daily_goal_ml: 2200 }, a.token)).status,
    200,
  );
  const settings = {
    ...defaults,
    enabled: false,
    start_time: '22:00',
    end_time: '02:00',
    interval_minutes: 45,
    active_days: [1, 3, 5],
    timezone: 'America/New_York',
    daily_goal_ml: 1700,
  };
  assert.equal((await request('/api/settings', 'PUT', settings, a.token)).status, 200);
  const current = (await request('/api/settings', 'GET', undefined, a.token)).data;
  for (const k of Object.keys(settings))
    assert.deepEqual(current[k], settings[k as keyof typeof settings]);
  assert.equal((await request('/api/settings', 'GET', undefined, b.token)).data.enabled, true);
  for (const bad of [
    { interval_minutes: 10 },
    { timezone: 'nonsense' },
    { active_days: [1, 1] },
    { daily_goal_ml: 0 },
    { start_time: '99:00' },
    { end_time: '09:00' },
  ])
    assert.equal(
      (await request('/api/settings', 'PUT', { ...defaults, ...bad }, a.token)).status,
      400,
    );
});
test('CORS, entry and user request limits, content validation', async () => {
  assert.equal(
    (
      await request('/api/groups', 'POST', { display_name: 'bad' }, undefined, {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request(
          '/api/join',
          'POST',
          { display_name: 'bad', invite_code: 'x'.repeat(43) },
          undefined,
          { 'CF-Connecting-IP': 'same-ip' },
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await request(
        '/api/join',
        'POST',
        { display_name: 'bad', invite_code: 'x'.repeat(43) },
        undefined,
        { 'CF-Connecting-IP': 'same-ip' },
      )
    ).status,
    429,
  );
  const a = await create();
  for (let i = 0; i < 120; i++)
    assert.equal((await request('/api/settings', 'GET', undefined, a.token)).status, 200);
  assert.equal((await request('/api/settings', 'GET', undefined, a.token)).status, 429);
});
test('encrypted subscriptions, vendor allowlist, ownership and unsubscribe', async () => {
  const { a, b } = await pair();
  await subscribe(a.token);
  const row = await db
    .prepare('SELECT encrypted_subscription_data FROM push_subscriptions')
    .first<{ encrypted_subscription_data: string }>();
  assert.ok(!row?.encrypted_subscription_data.includes('googleapis'));
  assert.equal((await request('/api/push/subscribe', 'POST', subscription(), b.token)).status, 409);
  assert.equal(
    (
      await request(
        '/api/push/subscribe',
        'POST',
        { ...subscription(), endpoint: 'https://127.0.0.1/admin' },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request('/api/push/subscribe', 'DELETE', { endpoint: endpoint + 'device' }, b.token))
      .status,
    200,
  );
  assert.equal((await request('/api/me', 'GET', undefined, a.token)).data.subscription_count, 1);
  await request('/api/push/subscribe', 'DELETE', { endpoint: endpoint + 'device' }, a.token);
  assert.equal((await request('/api/me', 'GET', undefined, a.token)).data.subscription_count, 0);
});
test('scheduled concurrency deduplicates, VAPID verifies, and encrypted amount decrypts for recipient', async () => {
  const a = await create();
  const sub = subscription();
  assert.equal((await request('/api/push/subscribe', 'POST', sub, a.token)).status, 200);
  let calls = 0;
  let validatePayload: Promise<void> | undefined;
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/device', method: 'POST' })
    .reply((options) => {
      calls++;
      validatePayload = (async () => {
        const headers = new Headers(options.headers as HeadersInit);
        const authorization = headers.get('authorization')!;
        assert.ok(authorization.startsWith('vapid t='));
        const jwt = authorization.slice(8).split(',')[0],
          parts = jwt.split('.');
        const claim = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        assert.equal(claim.aud, 'https://fcm.googleapis.com');
        assert.equal(
          verify(
            'sha256',
            Buffer.from(parts[0] + '.' + parts[1]),
            { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' },
            Buffer.from(parts[2], 'base64url'),
          ),
          true,
        );
        assert.equal(headers.get('content-encoding'), 'aes128gcm');
        assert.equal(headers.get('ttl'), '300');
        const payload = Buffer.from(await new Response(options.body as BodyInit).arrayBuffer());
        assert.equal(payload.length, 4096);
        assert.equal(payload.includes(Buffer.from('이번에는 약')), false);
        // Independently decrypt RFC 8291 using the recipient's private key.
        const serverPublic = payload.subarray(21, 86);
        const serverKey = createPublicKey({
          format: 'jwk',
          key: {
            kty: 'EC',
            crv: 'P-256',
            x: serverPublic.subarray(1, 33).toString('base64url'),
            y: serverPublic.subarray(33).toString('base64url'),
          },
        });
        const shared = diffieHellman({ privateKey, publicKey: serverKey });
        const keyInfo = Buffer.concat([
          Buffer.from('WebPush: info\0'),
          Buffer.from(publicKey, 'base64url'),
          serverPublic,
        ]);
        const ikm = hkdfSync(
          'sha256',
          shared,
          Buffer.from(sub.keys.auth, 'base64url'),
          keyInfo,
          32,
        );
        const salt = payload.subarray(0, 16);
        const cek = hkdfSync(
          'sha256',
          Buffer.from(ikm),
          salt,
          Buffer.from('Content-Encoding: aes128gcm\0'),
          16,
        );
        const nonce = hkdfSync(
          'sha256',
          Buffer.from(ikm),
          salt,
          Buffer.from('Content-Encoding: nonce\0'),
          12,
        );
        const decipher = createDecipheriv('aes-128-gcm', Buffer.from(cek), Buffer.from(nonce));
        decipher.setAuthTag(payload.subarray(-16));
        const plain = Buffer.concat([decipher.update(payload.subarray(86, -16)), decipher.final()]);
        let delimiter = plain.length - 1;
        while (delimiter >= 0 && plain[delimiter] === 0) delimiter--;
        assert.equal(plain[delimiter], 2);
        const message = JSON.parse(plain.subarray(0, delimiter).toString());
        assert.equal(message.title, '이번에는 약 154 ml 💧');
        assert.match(message.body, /2,000 ml/);
      })();
      return { statusCode: 201, data: '' };
    });
  await Promise.all([cron(scheduledAt), cron(scheduledAt)]);
  await cron(scheduledAt + 5 * 60000);
  await validatePayload;
  assert.equal(calls, 1);
  const rows = await db.prepare('SELECT status FROM notification_delivery_logs').all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].status, 'accepted');
});

test('drinking ahead cancels a retry and suppresses the next scheduled push', async () => {
  const a = await create();
  await subscribe(a.token, 'ahead');
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/ahead', method: 'POST' })
    .reply(503);
  await cron(scheduledAt);
  await log(a.token, 500, new Date(scheduledAt + 60000).toISOString());
  await cron(scheduledAt + 5 * 60000);
  await cron(scheduledAt + 60 * 60000);
  const rows = await db.prepare('SELECT status FROM notification_delivery_logs').all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].status, 'cancelled');
});

test('a delayed overnight slot never uses the new calendar day intake', async () => {
  const a = await create();
  await subscribe(a.token, 'midnight');
  await request(
    '/api/settings',
    'PUT',
    {
      ...defaults,
      start_time: '23:58',
      end_time: '01:00',
      active_days: [1],
    },
    a.token,
  );
  await cron(Date.parse('2025-05-05T15:03:00Z'));
  const result = await db
    .prepare('SELECT count(*) n FROM notification_delivery_logs')
    .first<{ n: number }>();
  assert.equal(result?.n, 0);
});
test('disabled, achieved goal, inactive weekday and no subscription suppress cron', async () => {
  const a = await create();
  await cron(scheduledAt);
  await subscribe(a.token);
  await request('/api/settings', 'PUT', { ...defaults, enabled: false }, a.token);
  await cron(scheduledAt);
  await request('/api/settings', 'PUT', { ...defaults, active_days: [7] }, a.token);
  await cron(scheduledAt);
  await request('/api/settings', 'PUT', defaults, a.token);
  await log(a.token, 2000, '2025-05-04T16:00:00Z');
  await cron(scheduledAt);
  assert.equal(
    (await db.prepare('SELECT count(*) n FROM notification_delivery_logs').first<{ n: number }>())
      ?.n,
    0,
  );
});
test('expired push deactivates device and bounded transient retries', async () => {
  const a = await create();
  await subscribe(a.token, 'gone');
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/gone', method: 'POST' })
    .reply(410);
  await cron(scheduledAt);
  assert.equal((await request('/api/me', 'GET', undefined, a.token)).data.subscription_count, 0);
  await subscribe(a.token, 'retry');
  let calls = 0;
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/retry', method: 'POST' })
    .reply(() => {
      calls++;
      return { statusCode: 503, data: '' };
    })
    .times(3);
  await cron(scheduledAt);
  await cron(scheduledAt + 5 * 60000);
  await cron(scheduledAt + 10 * 60000);
  await cron(scheduledAt + 15 * 60000);
  assert.equal(calls, 3);
  const row = await db
    .prepare("SELECT attempts,status FROM notification_delivery_logs WHERE status='failed'")
    .first<{ attempts: number; status: string }>();
  assert.equal(row?.attempts, 3);
});
test('test push needs auth, reports provider acceptance, rate limited', async () => {
  assert.equal((await request('/api/push/test', 'POST')).status, 401);
  const a = await create();
  await subscribe(a.token, 'test');
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/test', method: 'POST' })
    .reply(201)
    .times(3);
  for (let i = 0; i < 3; i++) {
    const r = await request('/api/push/test', 'POST', undefined, a.token);
    assert.equal(r.status, 200);
    assert.equal(r.data.accepted, 1);
  }
  assert.equal((await request('/api/push/test', 'POST', undefined, a.token)).status, 429);
});
test('turning notifications off cancels pending retries', async () => {
  const a = await create();
  await subscribe(a.token, 'cancel');
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/cancel', method: 'POST' })
    .reply(503);
  await cron(scheduledAt);
  await request('/api/settings', 'PUT', { ...defaults, enabled: false }, a.token);
  await cron(scheduledAt + 5 * 60000);
  assert.equal(
    (await db.prepare('SELECT status FROM notification_delivery_logs').first<{ status: string }>())
      ?.status,
    'cancelled',
  );
});
test('ambiguous network outcome is recorded without duplicate retry', async () => {
  const a = await create();
  await subscribe(a.token, 'ambiguous');
  await cron(scheduledAt);
  await cron(scheduledAt + 5 * 60000);
  const r = await db
    .prepare('SELECT status,attempts FROM notification_delivery_logs')
    .first<{ status: string; attempts: number }>();
  assert.equal(r?.status, 'unknown');
  assert.equal(r?.attempts, 1);
});
test('three-device limit includes reactivating an old device', async () => {
  const a = await create();
  await subscribe(a.token, 'one');
  await subscribe(a.token, 'two');
  await subscribe(a.token, 'three');
  assert.equal(
    (await request('/api/push/subscribe', 'POST', subscription('four'), a.token)).status,
    409,
  );
  await request('/api/push/subscribe', 'DELETE', { endpoint: endpoint + 'one' }, a.token);
  await subscribe(a.token, 'four');
  assert.equal(
    (await request('/api/push/subscribe', 'POST', subscription('one'), a.token)).status,
    409,
  );
});
