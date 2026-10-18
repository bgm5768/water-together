import { dueSlots, hydrationAt, localDate, windowOpen } from '../../shared/time';
import { readSettings, settingsFrom, type Env, type SettingsRow } from './models';
import { sendPush, pushConfigured, type Device } from './push';
import { intakeToday, reminderMessage } from './reminders';
import { flushPartnerNotifications } from './partner';
async function deliver(
  env: Env,
  device: Device,
  id: string,
  attempt: number,
  now: number,
  plan: { amount_ml: number; remaining_ml: number },
) {
  const result = await sendPush(env, device, reminderMessage(plan));
  const stamp = new Date(now).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE notification_delivery_logs SET status=?,sent_at=?,retry_at=?,updated_at=? WHERE id=? AND status='sending'",
    ).bind(
      result === 'retry' && attempt >= 3 ? 'failed' : result,
      result === 'accepted' ? stamp : null,
      result === 'retry' && attempt < 3 ? new Date(now + 5 * 60000).toISOString() : null,
      stamp,
      id,
    ),
    env.DB.prepare(
      "UPDATE push_subscriptions SET last_sent_at=CASE WHEN ?='accepted' THEN ? ELSE last_sent_at END,revoked_at=CASE WHEN ?='expired' THEN ? ELSE revoked_at END WHERE id=?",
    ).bind(result, stamp, result, stamp, device.id),
  ]);
}
export async function scheduled(env: Env, now = Date.now()) {
  if (!pushConfigured(env)) return;
  await flushPartnerNotifications(env, undefined, now);
  const stamp = new Date(now).toISOString();
  // Recover bookkeeping, never re-send a claimed request with unknown outcome.
  await env.DB.prepare(
    "UPDATE notification_delivery_logs SET status='unknown',updated_at=? WHERE status='sending' AND updated_at<?",
  )
    .bind(stamp, new Date(now - 15 * 60000).toISOString())
    .run();
  const users = await env.DB.prepare(
    'SELECT * FROM notification_settings n WHERE enabled=1 AND EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.user_id=n.user_id AND p.revoked_at IS NULL)',
  ).all<SettingsRow>();
  for (const row of users.results) {
    const s = settingsFrom(row);
    for (const slot of dueSlots(now, s)) {
      const plan = hydrationAt(slot, s, await intakeToday(env, row.user_id, s, now));
      if (!plan) continue;
      const devices = await env.DB.prepare(
        'SELECT id,user_id,encrypted_subscription_data FROM push_subscriptions WHERE user_id=? AND revoked_at IS NULL',
      )
        .bind(row.user_id)
        .all<Device>();
      for (const device of devices.results) {
        const id = crypto.randomUUID();
        const claim = await env.DB.prepare(
          "INSERT INTO notification_delivery_logs(id,user_id,subscription_id,scheduled_at,status,idempotency_key,updated_at) VALUES(?,?,?,?,'sending',?,?) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id",
        )
          .bind(
            id,
            row.user_id,
            device.id,
            new Date(slot).toISOString(),
            `${device.id}:${slot}`,
            stamp,
          )
          .first();
        if (claim) await deliver(env, device, id, 1, now, plan);
      }
    }
  }
  const retries = await env.DB.prepare(
    "SELECT d.id delivery_id,d.attempts,d.scheduled_at,p.* FROM notification_delivery_logs d JOIN push_subscriptions p ON p.id=d.subscription_id WHERE d.status='retry' AND d.retry_at<=? AND p.revoked_at IS NULL LIMIT 12",
  )
    .bind(stamp)
    .all<Device & { delivery_id: string; attempts: number; scheduled_at: string }>();
  for (const r of retries.results) {
    const s = await readSettings(env.DB, r.user_id);
    const slot = Date.parse(r.scheduled_at);
    const plan = hydrationAt(slot, s, await intakeToday(env, r.user_id, s, now));
    if (
      !windowOpen(now, s) ||
      now - Date.parse(r.scheduled_at) > 15 * 60000 ||
      localDate(slot, s.timezone) !== localDate(now, s.timezone) ||
      !plan
    ) {
      await env.DB.prepare(
        "UPDATE notification_delivery_logs SET status='cancelled',updated_at=? WHERE id=? AND status='retry'",
      )
        .bind(stamp, r.delivery_id)
        .run();
      continue;
    }
    const claim = await env.DB.prepare(
      "UPDATE notification_delivery_logs SET status='sending',attempts=attempts+1,updated_at=? WHERE id=? AND status='retry' AND attempts=? RETURNING id",
    )
      .bind(stamp, r.delivery_id, r.attempts)
      .first();
    if (claim) await deliver(env, r, r.delivery_id, r.attempts + 1, now, plan!);
  }
  // At most once per UTC day; old idempotency keys cannot match current slots.
  if (new Date(now).getUTCHours() === 3 && new Date(now).getUTCMinutes() < 5) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM partner_deliveries WHERE created_at<?').bind(
        new Date(now - 30 * 86400000).toISOString(),
      ),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM notification_delivery_logs WHERE updated_at<?').bind(
        new Date(now - 30 * 86400000).toISOString(),
      ),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<? OR revoked_at IS NOT NULL').bind(
        stamp,
      ),
    ]);
  }
}
