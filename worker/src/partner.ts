import type { Env } from './models';
import { pushConfigured, sendPush, type Device } from './push';

// The INSERT trigger queues atomically with the record. Replaying a log cannot enqueue twice.
export async function flushPartnerNotifications(env: Env, logId?: string, now = Date.now()) {
  if (!pushConfigured(env)) return;
  const stamp = new Date(now).toISOString();
  await env.DB.prepare(
    "UPDATE partner_deliveries SET status='unknown',updated_at=? WHERE status='sending' AND updated_at<?",
  )
    .bind(stamp, new Date(now - 15 * 60000).toISOString())
    .run();
  const rows = await env.DB.prepare(
    `SELECT d.*,p.id,p.user_id,p.encrypted_subscription_data,p.revoked_at,n.partner_notifications
    FROM partner_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id
    JOIN notification_settings n ON n.user_id=p.user_id
    WHERE (d.status='pending' OR (d.status='retry' AND d.retry_at<=?)) AND (? IS NULL OR d.log_id=?)
    ORDER BY d.created_at LIMIT 12`,
  )
    .bind(stamp, logId ?? null, logId ?? null)
    .all<
      Device & {
        log_id: string;
        sender_name: string;
        amount_ml: number;
        attempts: number;
        created_at: string;
        revoked_at: string | null;
        partner_notifications: number;
      }
    >();
  await Promise.all(
    rows.results.map(async (row) => {
      if (
        !row.partner_notifications ||
        row.revoked_at ||
        now - Date.parse(row.created_at) > 15 * 60000
      ) {
        await env.DB.prepare(
          "UPDATE partner_deliveries SET status='cancelled',updated_at=? WHERE log_id=? AND subscription_id=? AND status IN ('pending','retry')",
        )
          .bind(stamp, row.log_id, row.id)
          .run();
        return;
      }
      const claim = await env.DB.prepare(
        "UPDATE partner_deliveries SET status='sending',attempts=attempts+1,updated_at=? WHERE log_id=? AND subscription_id=? AND status IN ('pending','retry') AND attempts=? RETURNING log_id",
      )
        .bind(stamp, row.log_id, row.id, row.attempts)
        .first();
      if (!claim) return;
      const result = await sendPush(env, row, {
        title: `${row.sender_name}님이 물을 기록했어요 💧`,
        body: `${row.amount_ml.toLocaleString('ko-KR')} ml를 기록했어요. 함께 만드는 작은 습관을 확인해 보세요.`,
        kind: 'partner',
      });
      const finished = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE partner_deliveries SET status=?,retry_at=?,updated_at=? WHERE log_id=? AND subscription_id=?',
        ).bind(
          result === 'retry' && row.attempts >= 2 ? 'failed' : result,
          result === 'retry' && row.attempts < 2 ? new Date(now + 60000).toISOString() : null,
          finished,
          row.log_id,
          row.id,
        ),
        env.DB.prepare(
          "UPDATE push_subscriptions SET last_sent_at=CASE WHEN ?='accepted' THEN ? ELSE last_sent_at END,revoked_at=CASE WHEN ?='expired' THEN ? ELSE revoked_at END WHERE id=?",
        ).bind(result, finished, result, finished, row.id),
      ]);
    }),
  );
}
