import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
  for (const file of (await readdir('worker/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = await readFile('worker/migrations/' + file, 'utf8');
    for (const part of sql.split('-- statement')) if (part.trim()) await db.prepare(part).run();
  }
});
after(async () => {
  await mf?.dispose();
  await fetchMock.close();
});
beforeEach(async () => {
  for (const table of [
    'partner_deliveries',
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
test('nickname changes only the authenticated user and is visible to their partner', async () => {
  const { a, b } = await pair();
  const before = (await request('/api/me', 'GET', undefined, a.token)).data;
  assert.equal((await request('/api/me', 'PATCH', { display_name: '새 이름' })).status, 401);
  for (const display_name of ['', '   ', '가'.repeat(25)])
    assert.equal((await request('/api/me', 'PATCH', { display_name }, a.token)).status, 400);
  assert.equal(
    (await request('/api/me', 'PATCH', { display_name: '변경', user_id: 'other' }, a.token)).status,
    400,
  );
  const result = await request('/api/me', 'PATCH', { display_name: '  물친구  ' }, a.token);
  assert.equal(result.status, 200);
  assert.equal(result.data.display_name, '물친구');
  const after = (await request('/api/me', 'GET', undefined, a.token)).data;
  assert.equal(after.id, before.id);
  assert.deepEqual(after.settings, before.settings);
  assert.equal((await request('/api/me', 'GET', undefined, b.token)).data.display_name, '나래');
  const peer = (await request('/api/day?date=2025-05-02', 'GET', undefined, b.token)).data;
  assert.equal(peer.members.find((m: any) => m.id === before.id).display_name, '물친구');
});

test('month calendar aggregates both members, includes zero days and isolates other groups', async () => {
  const { a, b } = await pair();
  const outsider = await create('다른 공간');
  const aid = (await request('/api/me', 'GET', undefined, a.token)).data.id;
  const bid = (await request('/api/me', 'GET', undefined, b.token)).data.id;
  await log(a.token, 100, '2025-04-30T14:59:59.000Z'); // April in Seoul
  await log(a.token, 250, '2025-04-30T15:00:00.000Z');
  await log(a.token, 350, '2025-05-01T05:00:00.000Z');
  await log(b.token, 500, '2025-05-01T10:00:00.000Z');
  await log(a.token, 400, '2025-05-31T15:00:00.000Z'); // June in Seoul
  await log(outsider.token, 500, '2025-05-01T01:00:00.000Z');
  const result = await request('/api/month?month=2025-05', 'GET', undefined, a.token);
  assert.equal(result.status, 200);
  assert.equal(result.data.days.length, 31);
  assert.equal(result.data.members.length, 2);
  assert.deepEqual(result.data.days[0].totals, { [aid]: 600, [bid]: 500 });
  assert.ok(
    result.data.days.slice(1).every((d: any) => Object.values(d.totals).every((n) => n === 0)),
  );
  assert.equal(
    (await request('/api/month?month=2024-02', 'GET', undefined, a.token)).data.days.length,
    29,
  );
  assert.equal((await request('/api/month?month=2025-05')).status, 401);
  for (const query of [
    'month=2025-13',
    'month=2025-5',
    'month=2019-12',
    'month=2099-01',
    'month=2025-05&group_id=other',
  ])
    assert.equal((await request('/api/month?' + query, 'GET', undefined, a.token)).status, 400);
});

test('monthly totals use viewer timezone and retain DST day boundaries', async () => {
  const a = await create();
  await request('/api/settings', 'PUT', { ...defaults, timezone: 'America/New_York' }, a.token);
  const id = (await request('/api/me', 'GET', undefined, a.token)).data.id;
  await log(a.token, 100, '2025-03-09T04:59:59.000Z');
  await log(a.token, 200, '2025-03-09T05:00:00.000Z');
  await log(a.token, 300, '2025-03-10T03:59:59.000Z');
  await log(a.token, 400, '2025-03-10T04:00:00.000Z');
  const { data } = await request('/api/month?month=2025-03', 'GET', undefined, a.token);
  assert.equal(data.timezone, 'America/New_York');
  assert.equal(data.days[7].totals[id], 100);
  assert.equal(data.days[8].totals[id], 500);
  assert.equal(data.days[9].totals[id], 400);
});
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
const scheduledAt = Date.parse('2025-05-05T02:00:00Z');
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

test('default cup persists per user, survives old clients, and rejects invalid amounts', async () => {
  const { a, b } = await pair();
  assert.equal(
    (await request('/api/me', 'GET', undefined, a.token)).data.settings.default_drink_ml,
    200,
  );
  const settings = { ...defaults, default_drink_ml: 337 };
  assert.equal(
    (await request('/api/settings', 'PUT', settings, a.token)).data.default_drink_ml,
    337,
  );
  const { default_drink_ml: omitted, ...oldClient } = defaults;
  assert.equal(
    (await request('/api/settings', 'PUT', oldClient, a.token)).data.default_drink_ml,
    337,
  );
  assert.equal(
    (await request('/api/me', 'GET', undefined, a.token)).data.settings.default_drink_ml,
    337,
  );
  assert.equal(
    (await request('/api/me', 'GET', undefined, b.token)).data.settings.default_drink_ml,
    200,
  );
  assert.equal(
    (await request('/api/settings', 'PUT', { ...settings, default_drink_ml: 500 }, a.token)).status,
    200,
  );
  for (const amount of [0, 501, 3001, 1.5])
    assert.equal(
      (await request('/api/settings', 'PUT', { ...settings, default_drink_ml: amount }, a.token))
        .status,
      400,
    );
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
test('recovery codes are encrypted, private, stable and never included in regular profile responses', async () => {
  const { a, b } = await pair();
  assert.equal((await request('/api/recovery-code')).status, 401);
  const own = await request('/api/recovery-code', 'GET', undefined, a.token);
  assert.equal(own.data.recovery_code, a.recovery_code);
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.equal(
    (await request('/api/recovery-code', 'GET', undefined, b.token)).data.recovery_code,
    b.recovery_code,
  );
  assert.equal(
    (await request('/api/recovery-code?user_id=other', 'GET', undefined, a.token)).status,
    400,
  );
  assert.equal(
    (await request('/api/recovery-code', 'POST', { user_id: 'other' }, a.token)).status,
    400,
  );
  assert.equal(
    (await request('/api/recovery-code', 'POST', {}, a.token)).data.recovery_code,
    a.recovery_code,
  );
  const rows = await db
    .prepare('SELECT encrypted_code FROM recovery_codes')
    .all<{ encrypted_code: string }>();
  assert.equal(rows.results.length, 2);
  for (const row of rows.results) {
    assert(row.encrypted_code);
    assert(!row.encrypted_code.includes(a.recovery_code));
    assert(!row.encrypted_code.includes(b.recovery_code));
  }
  assert(
    !JSON.stringify((await request('/api/me', 'GET', undefined, a.token)).data).includes(
      a.recovery_code,
    ),
  );
});

test('legacy accounts explicitly issue one reusable recovery code without losing their session or records', async () => {
  const a = await create();
  await log(a.token);
  // Simulate an account created before encrypted recovery storage existed.
  await db.prepare('DELETE FROM recovery_codes').run();
  const oldVerifier = await db.prepare('SELECT recovery_hash FROM users').first();
  assert.equal(
    (await request('/api/recovery-code', 'GET', undefined, a.token)).data.recovery_code,
    null,
  );
  assert.deepEqual(await db.prepare('SELECT recovery_hash FROM users').first(), oldVerifier);
  const results = await Promise.all([
    request('/api/recovery-code', 'POST', {}, a.token),
    request('/api/recovery-code', 'POST', {}, a.token),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200],
  );
  const code = results[0].data.recovery_code;
  assert.equal(code, results[1].data.recovery_code);
  assert.notEqual(code, a.recovery_code);
  assert.equal((await request('/api/recovery-code', 'POST', {}, a.token)).data.recovery_code, code);
  assert.equal((await request('/api/me', 'GET', undefined, a.token)).status, 200);
  assert.equal(
    (await request('/api/day?date=2025-05-02', 'GET', undefined, a.token)).data.logs.length,
    1,
  );
  assert.equal(
    (await request('/api/recover', 'POST', { recovery_code: a.recovery_code })).status,
    400,
  );
  const recovered = await request('/api/recover', 'POST', { recovery_code: code });
  assert.equal(recovered.status, 200);
  assert.equal((await request('/api/recovery-code', 'GET', undefined, a.token)).status, 401);
  assert.equal(
    (await request('/api/recovery-code', 'GET', undefined, recovered.data.token)).data
      .recovery_code,
    recovered.data.recovery_code,
  );
});

test('legacy issuance racing account recovery cannot overwrite the winning code', async () => {
  const a = await create();
  await db.prepare('DELETE FROM recovery_codes').run();
  const [issued, recovered] = await Promise.all([
    request('/api/recovery-code', 'POST', {}, a.token),
    request('/api/recover', 'POST', { recovery_code: a.recovery_code }),
  ]);
  if (recovered.status === 200) {
    assert.equal(issued.status, 401);
    assert.equal(
      (await request('/api/recovery-code', 'GET', undefined, recovered.data.token)).data
        .recovery_code,
      recovered.data.recovery_code,
    );
  } else {
    assert.equal(issued.status, 200);
    assert([400, 409].includes(recovered.status));
    assert.equal(
      (await request('/api/recovery-code', 'GET', undefined, a.token)).data.recovery_code,
      issued.data.recovery_code,
    );
  }
});

test('recovery preserves settings/logs, rotates code and revokes old session', async () => {
  const a = await create();
  await log(a.token);
  await request('/api/settings', 'PUT', { ...defaults, daily_goal_ml: 2500 }, a.token);
  const r = await request('/api/recover', 'POST', { recovery_code: a.recovery_code });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.recovery_code, a.recovery_code);
  assert.equal(
    (await request('/api/recovery-code', 'GET', undefined, r.data.token)).data.recovery_code,
    r.data.recovery_code,
  );
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
  const winner = results.find((r) => r.status === 200)!;
  assert.equal(
    (await request('/api/recovery-code', 'GET', undefined, winner.data.token)).data.recovery_code,
    winner.data.recovery_code,
  );
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
    { daily_goal_ml: 5001 },
    { start_time: '99:00' },
    { end_time: '09:00' },
  ])
    assert.equal(
      (await request('/api/settings', 'PUT', { ...defaults, ...bad }, a.token)).status,
      400,
    );
});
test('new amount limits reject overflow and preserve historical intake while normalizing old settings', async () => {
  const a = await create();
  const me = (await request('/api/me', 'GET', undefined, a.token)).data;
  assert.equal(
    (
      await request(
        '/api/settings',
        'PUT',
        { ...defaults, daily_goal_ml: 5000, default_drink_ml: 500 },
        a.token,
      )
    ).status,
    200,
  );
  const entry = await log(a.token, 500);
  assert.equal(entry.status, 201);
  assert.equal((await log(a.token, 501)).status, 400);
  assert.equal(
    (
      await request(
        '/api/logs/' + entry.data.id,
        'PATCH',
        { amount_ml: 501, consumed_at: stamp },
        a.token,
      )
    ).status,
    400,
  );
  await db
    .prepare(
      'UPDATE notification_settings SET daily_goal_ml=9000,default_drink_ml=900 WHERE user_id=?',
    )
    .bind(me.id)
    .run();
  await db.prepare('UPDATE water_logs SET amount_ml=1500 WHERE id=?').bind(entry.data.id).run();
  const settings = (await request('/api/settings', 'GET', undefined, a.token)).data;
  assert.equal(settings.daily_goal_ml, 5000);
  assert.equal(settings.default_drink_ml, 500);
  assert.equal(
    (await request('/api/me', 'GET', undefined, a.token)).data.settings.daily_goal_ml,
    5000,
  );
  const day = (await request('/api/day?date=2025-05-02', 'GET', undefined, a.token)).data;
  assert.equal(day.members[0].daily_goal_ml, 5000);
  assert.equal(day.members[0].total_ml, 1500);
  assert.equal(day.logs[0].amount_ml, 1500);
  const month = (await request('/api/month?month=2025-05', 'GET', undefined, a.token)).data;
  assert.equal(month.members[0].daily_goal_ml, 5000);
  assert.equal(month.days[1].totals[me.id], 1500);
  const { default_drink_ml: omitted, ...oldClient } = settings;
  assert.equal((await request('/api/settings', 'PUT', oldClient, a.token)).status, 200);
  assert.equal(
    (await db
      .prepare('SELECT default_drink_ml FROM notification_settings WHERE user_id=?')
      .bind(me.id)
      .first())!.default_drink_ml,
    500,
  );
});

test('CORS, entry and user request limits, content validation', async () => {
  await mf.dispatchFetch('http://localhost/__test/clock?now=' + Date.now());
  try {
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
  } finally {
    await mf.dispatchFetch('http://localhost/__test/clock');
  }
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
        assert.equal(headers.get('ttl'), '900');
        assert.equal(headers.get('urgency'), 'high');
        const payload = Buffer.from(await new Response(options.body as BodyInit).arrayBuffer());
        assert.equal(payload.length, 4096);
        assert.equal(payload.includes(Buffer.from('지금 약')), false);
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
        assert.equal(message.title, '지금 약 286 ml 마실 시간이에요 💧');
        assert.match(message.body, /지금 약 286 ml/);
        assert.match(message.body, /0 \/ 2,000 ml/);
        assert.match(message.body, /7회\(이번 포함\)/);
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

test('fixed times persist independently, validate rows and survive old clients', async () => {
  const { a, b } = await pair();
  const initial = (await request('/api/me', 'GET', undefined, a.token)).data.settings;
  assert.deepEqual(initial.reminders, defaults.reminders);
  const reminders = initial.reminders.map((row: any, i: number) => ({
    ...row,
    time: i === 0 ? '07:32' : row.time,
    enabled: i !== 1,
  }));
  assert.equal(
    (await request('/api/settings', 'PUT', { ...initial, reminders }, a.token)).status,
    200,
  );
  const { reminders: ignored, ...legacy } = initial;
  assert.equal((await request('/api/settings', 'PUT', legacy, a.token)).status, 200);
  assert.deepEqual(
    (await request('/api/settings', 'GET', undefined, a.token)).data.reminders,
    reminders,
  );
  assert.deepEqual(
    (await request('/api/settings', 'GET', undefined, b.token)).data.reminders,
    defaults.reminders,
  );
  for (const invalid of [
    reminders.slice(1),
    reminders.map((row: any) => ({ ...row, id: 'wake' })),
    reminders.map((row: any) => ({ ...row, time: '25:00' })),
  ])
    assert.equal(
      (await request('/api/settings', 'PUT', { ...initial, reminders: invalid }, a.token)).status,
      400,
    );
});

test('regular cron sends even ahead of pace, catches close edited times once and exposes own status', async () => {
  const { a, b } = await pair();
  await subscribe(a.token, 'fixed');
  const reminders = defaults.reminders!.map((row, i) => ({
    ...row,
    time: i === 0 ? '11:00' : '11:01',
    enabled: i < 2,
  }));
  await request('/api/settings', 'PUT', { ...defaults, reminders }, a.token);
  for (let i = 0; i < 3; i++) await log(a.token, 500, new Date(scheduledAt - 60000).toISOString());
  let calls = 0;
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/fixed', method: 'POST' })
    .reply(() => {
      calls++;
      return { statusCode: 201, data: '' };
    })
    .times(2);
  await cron(scheduledAt + 2 * 60000);
  await cron(scheduledAt + 3 * 60000);
  assert.equal(calls, 2);
  const me = (await request('/api/me', 'GET', undefined, a.token)).data;
  assert.equal(me.last_scheduled_notification.status, 'accepted');
  assert.equal(
    me.last_scheduled_notification.scheduled_at,
    new Date(scheduledAt + 60000).toISOString(),
  );
  assert.equal(
    (await request('/api/me', 'GET', undefined, b.token)).data.last_scheduled_notification,
    null,
  );
});

test('reaching the goal cancels a retry and suppresses the next scheduled push', async () => {
  const a = await create();
  await subscribe(a.token, 'ahead');
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/ahead', method: 'POST' })
    .reply(503);
  await cron(scheduledAt);
  for (let i = 0; i < 4; i++) await log(a.token, 500, new Date(scheduledAt + 60000).toISOString());
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
      reminders: defaults.reminders!.map((row, i) => ({ ...row, time: '23:58', enabled: i === 0 })),
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
  for (let i = 0; i < 4; i++) await log(a.token, 500, '2025-05-04T16:00:00Z');
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

test('new drink notifies only partner once even with concurrent replay, not edits or other groups', async () => {
  const { a, b } = await pair(),
    outsider = await create('다른 공간');
  await subscribe(a.token, 'sender');
  await subscribe(b.token, 'recipient');
  await subscribe(outsider.token, 'outsider');
  let calls = 0;
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/recipient', method: 'POST' })
    .reply(() => {
      calls++;
      return { statusCode: 201, data: '' };
    });
  const id = crypto.randomUUID(),
    when = new Date().toISOString();
  const results = await Promise.all([log(a.token, 250, when, id), log(a.token, 250, when, id)]);
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(calls, 1);
  const rows = await db
    .prepare('SELECT sender_name,amount_ml,status,attempts FROM partner_deliveries')
    .all();
  assert.deepEqual(rows.results, [
    { sender_name: '가람', amount_ml: 250, status: 'accepted', attempts: 1 },
  ]);
  assert.equal(
    (await request('/api/logs/' + id, 'PATCH', { amount_ml: 300, consumed_at: when }, a.token))
      .status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal((await request('/api/logs/' + id, 'DELETE', undefined, a.token)).status, 200);
  assert.equal(calls, 1);
});

test('partner preference is independent of reminders, survives legacy clients and cancels pending retries', async () => {
  const { a, b } = await pair();
  await subscribe(b.token, 'preference');
  assert.equal(
    (await request('/api/me', 'GET', undefined, b.token)).data.settings.partner_notifications,
    true,
  );
  await request(
    '/api/settings',
    'PUT',
    { ...defaults, enabled: false, partner_notifications: false },
    b.token,
  );
  const { partner_notifications: omitted, ...legacy } = defaults;
  await request('/api/settings', 'PUT', legacy, b.token);
  assert.equal(
    (await request('/api/me', 'GET', undefined, b.token)).data.settings.partner_notifications,
    false,
  );
  await log(a.token);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM partner_deliveries').first())!.n, 0);
  await request(
    '/api/settings',
    'PUT',
    { ...defaults, enabled: false, partner_notifications: true },
    b.token,
  );
  for (let i = 0; i < 4; i++) await log(b.token, 500, new Date().toISOString());
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/preference', method: 'POST' })
    .reply(503);
  assert.equal((await log(a.token)).status, 201);
  assert.equal(
    (await db.prepare('SELECT status FROM partner_deliveries').first())!.status,
    'retry',
  );
  await request(
    '/api/settings',
    'PUT',
    { ...defaults, enabled: false, partner_notifications: false },
    b.token,
  );
  await cron(Date.now() + 65000);
  assert.equal(
    (await db.prepare('SELECT status FROM partner_deliveries').first())!.status,
    'cancelled',
  );
});

test('partner failures preserve drink records and retry once through cron with no duplicate delivery', async () => {
  const { a, b } = await pair();
  await subscribe(b.token, 'peer-retry');
  await request('/api/settings', 'PUT', { ...defaults, enabled: false }, b.token);
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/peer-retry', method: 'POST' })
    .reply(503);
  const created = await log(a.token);
  assert.equal(created.status, 201);
  fetchMock
    .get('https://fcm.googleapis.com')
    .intercept({ path: '/fcm/send/peer-retry', method: 'POST' })
    .reply(201);
  const at = Date.now() + 65000;
  await Promise.all([cron(at), cron(at)]);
  const row = await db.prepare('SELECT status,attempts FROM partner_deliveries').first();
  assert.deepEqual(row, { status: 'accepted', attempts: 2 });
  assert.ok(await db.prepare('SELECT id FROM water_logs WHERE id=?').bind(created.data.id).first());
});
