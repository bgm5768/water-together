import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
import { dayBounds, localDate, nextHydration } from '../../shared/time';
import type { Member, WaterLog } from '../../shared/types';
import { HttpError, secret, hash, encrypt, rate, validEndpoint, unb64 } from './security';
import { readSettings, type Env, type Actor } from './models';
import { pushConfigured, sendPush, type Device } from './push';
import { scheduled } from './scheduler';
import { intakeToday } from './reminders';

const nameSchema = z.string().trim().min(1).max(24);
const codeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{43}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    start_time: timeSchema,
    end_time: timeSchema,
    interval_minutes: z.union([
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(90),
      z.literal(120),
    ]),
    active_days: z
      .array(z.number().int().min(1).max(7))
      .max(7)
      .refine((x) => new Set(x).size === x.length),
    stop_when_goal_reached: z.boolean(),
    timezone: z
      .string()
      .max(64)
      .refine((x) => IANAZone.isValidZone(x)),
    daily_goal_ml: z.number().int().min(100).max(10000),
  })
  .strict()
  .refine((x) => x.start_time !== x.end_time, {
    message: '시작과 종료 시각을 다르게 설정해 주세요.',
  });
const logSchema = z
  .object({
    amount_ml: z.number().int().min(1).max(3000),
    consumed_at: z
      .string()
      .datetime({ offset: true })
      .refine(
        (x) => Date.parse(x) >= Date.parse('2020-01-01') && Date.parse(x) <= Date.now() + 60000,
      ),
  })
  .strict();
function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function stmt(db: D1Database, sql: string, ...values: unknown[]) {
  return db.prepare(sql).bind(...values);
}
async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    throw new HttpError(415, 'JSON 요청이 필요해요.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, '입력 내용을 확인해 주세요.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new HttpError(413, '요청이 너무 커요.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new HttpError(400, '입력 형식이나 범위를 확인해 주세요.');
  }
}
async function authenticate(req: Request, env: Env): Promise<Actor> {
  const token = req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token)
    throw new HttpError(401, '세션이 없거나 만료되었어요. 복구 코드로 다시 연결해 주세요.');
  const user = await stmt(
    env.DB,
    'SELECT u.id,u.display_name,m.group_id,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN group_members m ON m.user_id=u.id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?',
    await hash(token),
    new Date().toISOString(),
  ).first<Actor>();
  if (!user)
    throw new HttpError(401, '세션이 없거나 만료되었어요. 복구 코드로 다시 연결해 주세요.');
  return user;
}
async function route(req: Request, env: Env) {
  const u = new URL(req.url),
    path = u.pathname,
    method = req.method,
    now = new Date().toISOString();
  if (path === '/api/health' && method === 'GET') return json({ ok: true });
  if (method === 'POST' && ['/api/groups', '/api/join', '/api/recover'].includes(path)) {
    await rate(env.DB, 'entry:' + (req.headers.get('CF-Connecting-IP') || 'local'), 10, 600);
    if (path === '/api/recover') {
      const { recovery_code } = await body(req, z.object({ recovery_code: codeSchema }).strict());
      const oldHash = await hash(recovery_code);
      const user = await stmt(env.DB, 'SELECT id FROM users WHERE recovery_hash=?', oldHash).first<{
        id: string;
      }>();
      if (!user) throw new HttpError(400, '복구 코드를 확인해 주세요.');
      const token = secret(),
        recovery = secret(),
        newHash = await hash(recovery),
        sid = crypto.randomUUID();
      // D1 batch is transactional. Conditional rotation makes a code single-use,
      // even when concurrent recovery requests read the same old verifier.
      const result = await env.DB.batch([
        stmt(
          env.DB,
          'UPDATE users SET recovery_hash=?,updated_at=? WHERE id=? AND recovery_hash=?',
          newHash,
          now,
          user.id,
          oldHash,
        ),
        stmt(
          env.DB,
          'UPDATE sessions SET revoked_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)',
          now,
          user.id,
          user.id,
          newHash,
        ),
        stmt(
          env.DB,
          'INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at) SELECT ?,id,?,?,? FROM users WHERE id=? AND recovery_hash=?',
          sid,
          await hash(token),
          now,
          new Date(Date.now() + 365 * 86400000).toISOString(),
          user.id,
          newHash,
        ),
      ]);
      if (!result[2].meta.changes)
        throw new HttpError(409, '이미 사용된 복구 코드예요. 새 코드를 사용해 주세요.');
      return json({ token, recovery_code: recovery });
    }
    // A retry from an already authenticated member must not create another user.
    if (req.headers.has('Authorization')) {
      const actor = await authenticate(req, env);
      return json({ already_joined: true, group_id: actor.group_id });
    }
    const input = await body(
      req,
      z.object({ display_name: nameSchema, invite_code: codeSchema.optional() }).strict(),
    );
    const id = crypto.randomUUID(),
      token = secret(),
      recovery = secret(),
      invite = secret();
    let group = crypto.randomUUID();
    if (path === '/api/join') {
      if (!input.invite_code) throw new HttpError(400, '초대 코드를 입력해 주세요.');
      const row = await stmt(
        env.DB,
        'SELECT id FROM groups WHERE invite_code_hash=?',
        await hash(input.invite_code),
      ).first<{ id: string }>();
      if (!row) throw new HttpError(400, '초대 코드가 잘못되었거나 만료되었어요.');
      group = row.id;
    }
    const statements = [
      stmt(
        env.DB,
        'INSERT INTO users VALUES(?,?,?,?,?)',
        id,
        input.display_name,
        await hash(recovery),
        now,
        now,
      ),
    ];
    if (path === '/api/groups')
      statements.push(
        stmt(env.DB, 'INSERT INTO groups VALUES(?,?,?)', group, await hash(invite), now),
      );
    statements.push(
      stmt(
        env.DB,
        'INSERT INTO group_members VALUES(?,?,?,?)',
        group,
        id,
        path === '/api/groups' ? 'owner' : 'member',
        now,
      ),
      stmt(env.DB, 'INSERT INTO notification_settings(user_id,updated_at) VALUES(?,?)', id, now),
      stmt(
        env.DB,
        'INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)',
        crypto.randomUUID(),
        id,
        await hash(token),
        now,
        new Date(Date.now() + 365 * 86400000).toISOString(),
      ),
    );
    try {
      await env.DB.batch(statements);
    } catch (e) {
      if (String(e).includes('GROUP_FULL'))
        throw new HttpError(409, '이미 두 사람이 함께하고 있는 공간이에요.');
      throw e;
    }
    return json(
      {
        token,
        recovery_code: recovery,
        ...(path === '/api/groups' ? { invite_code: invite } : {}),
      },
      201,
    );
  }
  const actor = await authenticate(req, env);
  await rate(env.DB, 'user:' + actor.id, 120, 60);
  if (path === '/api/me' && method === 'GET') {
    const settings = await readSettings(env.DB, actor.id);
    const count = await stmt(
      env.DB,
      'SELECT count(*) n FROM push_subscriptions WHERE user_id=? AND revoked_at IS NULL',
      actor.id,
    ).first<{ n: number }>();
    const now = Date.now();
    const next =
      count?.n && pushConfigured(env)
        ? nextHydration(now, settings, await intakeToday(env, actor.id, settings, now))
        : null;
    return json({
      ...actor,
      settings,
      subscription_count: count?.n || 0,
      next_notification: next?.at || null,
      next_amount_ml: next?.amount_ml ?? null,
      vapid_public_key: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null,
    });
  }
  if (path === '/api/invite' && method === 'POST') {
    if (actor.role !== 'owner')
      throw new HttpError(403, '공간을 만든 사람만 초대 코드를 재발급할 수 있어요.');
    const code = secret();
    const r = await stmt(
      env.DB,
      'UPDATE groups SET invite_code_hash=? WHERE id=? AND (SELECT count(*) FROM group_members WHERE group_id=?)<2 RETURNING id',
      await hash(code),
      actor.group_id,
      actor.group_id,
    ).first();
    if (!r) throw new HttpError(409, '이미 두 사람이 함께하고 있어요.');
    return json({ invite_code: code });
  }
  if (path === '/api/day' && method === 'GET') {
    // No caller-supplied identity is used; reject ambiguous identity parameters.
    if ([...u.searchParams.keys()].some((k) => k !== 'date'))
      throw new HttpError(400, '지원하지 않는 조회 조건이에요.');
    const s = await readSettings(env.DB, actor.id),
      date = u.searchParams.get('date') || localDate(Date.now(), s.timezone);
    let bounds;
    try {
      bounds = dayBounds(date, s.timezone);
    } catch {
      throw new HttpError(400, '날짜를 확인해 주세요.');
    }
    // Both members use the viewer's timezone on this comparison screen.
    const logs = await stmt(
      env.DB,
      'SELECT * FROM water_logs WHERE group_id=? AND consumed_at>=? AND consumed_at<? ORDER BY consumed_at,id',
      actor.group_id,
      bounds.start,
      bounds.end,
    ).all<WaterLog>();
    const members = await stmt(
      env.DB,
      'SELECT u.id,u.display_name,n.daily_goal_ml FROM group_members m JOIN users u ON u.id=m.user_id JOIN notification_settings n ON n.user_id=u.id WHERE m.group_id=? ORDER BY m.joined_at,m.user_id',
      actor.group_id,
    ).all<Member>();
    return json({
      date,
      timezone: s.timezone,
      logs: logs.results,
      members: members.results.map((m) => ({
        ...m,
        total_ml: logs.results
          .filter((l) => l.user_id === m.id)
          .reduce((sum, l) => sum + l.amount_ml, 0),
      })),
    });
  }
  if (path === '/api/logs' && method === 'POST') {
    const input = await body(req, logSchema),
      key = req.headers.get('Idempotency-Key');
    if (!key || !z.string().uuid().safeParse(key).success)
      throw new HttpError(400, '기록 요청 식별자가 필요해요.');
    const consumed = DateTime.fromISO(input.consumed_at).toUTC().toISO()!;
    await stmt(
      env.DB,
      'INSERT INTO water_logs VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
      key,
      actor.id,
      actor.group_id,
      input.amount_ml,
      consumed,
      now,
      now,
    ).run();
    const row = await stmt(
      env.DB,
      'SELECT * FROM water_logs WHERE id=? AND user_id=? AND group_id=?',
      key,
      actor.id,
      actor.group_id,
    ).first<WaterLog>();
    if (!row || row.amount_ml !== input.amount_ml || row.consumed_at !== consumed)
      throw new HttpError(409, '중복된 요청 식별자예요. 새 기록으로 다시 시도해 주세요.');
    return json(row, 201);
  }
  const logId = path.match(/^\/api\/logs\/([\w-]+)$/)?.[1];
  if (logId && ['PATCH', 'DELETE'].includes(method)) {
    const own = await stmt(
      env.DB,
      'SELECT id FROM water_logs WHERE id=? AND user_id=? AND group_id=?',
      logId,
      actor.id,
      actor.group_id,
    ).first();
    if (!own) throw new HttpError(404, '수정할 수 있는 기록이 없어요.');
    if (method === 'DELETE')
      await stmt(
        env.DB,
        'DELETE FROM water_logs WHERE id=? AND user_id=? AND group_id=?',
        logId,
        actor.id,
        actor.group_id,
      ).run();
    else {
      const input = await body(req, logSchema);
      await stmt(
        env.DB,
        'UPDATE water_logs SET amount_ml=?,consumed_at=?,updated_at=? WHERE id=? AND user_id=? AND group_id=?',
        input.amount_ml,
        DateTime.fromISO(input.consumed_at).toUTC().toISO(),
        now,
        logId,
        actor.id,
        actor.group_id,
      ).run();
    }
    return json({ ok: true });
  }
  if (path === '/api/settings' && method === 'GET')
    return json(await readSettings(env.DB, actor.id));
  if (path === '/api/settings' && method === 'PUT') {
    const s = await body(req, settingsSchema);
    await env.DB.batch([
      stmt(
        env.DB,
        'UPDATE notification_settings SET enabled=?,start_time=?,end_time=?,interval_minutes=?,active_days=?,stop_when_goal_reached=?,timezone=?,daily_goal_ml=?,updated_at=? WHERE user_id=?',
        +s.enabled,
        s.start_time,
        s.end_time,
        s.interval_minutes,
        JSON.stringify(s.active_days),
        +s.stop_when_goal_reached,
        s.timezone,
        s.daily_goal_ml,
        now,
        actor.id,
      ),
      stmt(
        env.DB,
        "UPDATE notification_delivery_logs SET status='cancelled',updated_at=? WHERE user_id=? AND status='retry'",
        now,
        actor.id,
      ),
    ]);
    return json(s);
  }
  if (path === '/api/push/subscribe' && method === 'POST') {
    if (!pushConfigured(env))
      throw new HttpError(503, '서버의 푸시 키 설정이 아직 완료되지 않았어요.');
    const sub = await body(
      req,
      z
        .object({
          endpoint: z.string().max(2048).refine(validEndpoint),
          keys: z
            .object({
              p256dh: z
                .string()
                .regex(/^[\w-]+$/)
                .refine((s) => unb64(s).length === 65),
              auth: z
                .string()
                .regex(/^[\w-]+$/)
                .refine((s) => unb64(s).length === 16),
            })
            .strict(),
        })
        .strict(),
    );
    const endpointHash = await hash(sub.endpoint);
    // Upsert cannot steal a device registered to another identity.
    try {
      const row = await stmt(
        env.DB,
        'INSERT INTO push_subscriptions(id,user_id,endpoint_hash,encrypted_subscription_data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET encrypted_subscription_data=excluded.encrypted_subscription_data,updated_at=excluded.updated_at,revoked_at=NULL WHERE push_subscriptions.user_id=excluded.user_id RETURNING id',
        crypto.randomUUID(),
        actor.id,
        endpointHash,
        await encrypt(sub, env.SUBSCRIPTION_KEY!),
        now,
        now,
      ).first();
      if (!row)
        throw new HttpError(409, '다른 사용자에게 연결된 기기예요. 기존 구독을 해제해 주세요.');
      return json({ ok: true });
    } catch (e) {
      if (String(e).includes('DEVICE_LIMIT'))
        throw new HttpError(409, '알림 기기는 최대 3대까지 등록할 수 있어요.');
      throw e;
    }
  }
  if (path === '/api/push/subscribe' && method === 'DELETE') {
    const input = await body(
      req,
      z
        .object({ endpoint: z.string().max(2048).optional(), all: z.boolean().optional() })
        .strict()
        .refine((x) => x.all === true || !!x.endpoint),
    );
    if (input.all)
      await stmt(
        env.DB,
        'UPDATE push_subscriptions SET revoked_at=? WHERE user_id=?',
        now,
        actor.id,
      ).run();
    else
      await stmt(
        env.DB,
        'UPDATE push_subscriptions SET revoked_at=? WHERE user_id=? AND endpoint_hash=?',
        now,
        actor.id,
        await hash(input.endpoint!),
      ).run();
    return json({ ok: true });
  }
  if (path === '/api/push/test' && method === 'POST') {
    await rate(env.DB, 'test:' + actor.id, 3, 600);
    if (!pushConfigured(env)) throw new HttpError(503, '서버 푸시 설정이 필요해요.');
    const devices = await stmt(
      env.DB,
      'SELECT id,user_id,encrypted_subscription_data FROM push_subscriptions WHERE user_id=? AND revoked_at IS NULL',
      actor.id,
    ).all<Device>();
    if (!devices.results.length) throw new HttpError(409, '먼저 이 기기의 알림을 연결해 주세요.');
    const results = [];
    for (const d of devices.results) {
      const result = await sendPush(env, d);
      results.push({ status: result });
      if (result === 'expired')
        await stmt(
          env.DB,
          'UPDATE push_subscriptions SET revoked_at=? WHERE id=?',
          now,
          d.id,
        ).run();
      if (result === 'accepted')
        await stmt(
          env.DB,
          'UPDATE push_subscriptions SET last_sent_at=? WHERE id=?',
          now,
          d.id,
        ).run();
    }
    return json({
      accepted: results.filter((x) => x.status === 'accepted').length,
      total: results.length,
      results,
    });
  }
  throw new HttpError(404, '요청한 기능을 찾을 수 없어요.');
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    let response: Response;
    try {
      if (origin && origin !== env.ALLOWED_ORIGIN)
        throw new HttpError(403, '허용되지 않은 출처예요.');
      if (req.method === 'OPTIONS') response = new Response(null, { status: 204 });
      else response = await route(req, env);
    } catch (e) {
      response =
        e instanceof HttpError
          ? json({ error: e.message }, e.status)
          : json({ error: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 500);
      // Deliberately do not log raw request bodies, DB errors, tokens or endpoints.
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Vary', 'Origin');
    if (origin === env.ALLOWED_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key');
      headers.set('Access-Control-Max-Age', '600');
    }
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(event: ScheduledController, env: Env) {
    await scheduled(env, event.scheduledTime);
  },
} satisfies ExportedHandler<Env>;
