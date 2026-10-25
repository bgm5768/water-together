import type { Env } from './models';
import { b64, decrypt, enc, encrypt, hash, HttpError, secret, unb64 } from './security';

type StoredRecovery = { purpose: string; user_id: string; code: string };

async function recoveryKey(key: string) {
  const material = await crypto.subtle.importKey('raw', unb64(key), 'HKDF', false, ['deriveBits']);
  return b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: enc.encode('water-together:recovery:v1'),
          info: enc.encode('AES-GCM recovery code storage'),
        },
        material,
        256,
      ),
    ),
  );
}

export async function encryptRecovery(env: Env, user: string, code: string) {
  if (!env.SUBSCRIPTION_KEY) return null;
  // Use a separate derived key for recovery codes; keep existing push encryption unchanged.
  return encrypt(
    { purpose: 'account-recovery-v1', user_id: user, code },
    await recoveryKey(env.SUBSCRIPTION_KEY),
  );
}

export async function readRecovery(env: Env, user: string) {
  const row = await env.DB.prepare(
    'SELECT r.encrypted_code,r.recovery_hash FROM recovery_codes r JOIN users u ON u.id=r.user_id AND u.recovery_hash=r.recovery_hash WHERE r.user_id=?',
  )
    .bind(user)
    .first<{ encrypted_code: string | null; recovery_hash: string }>();
  if (!row?.encrypted_code) return null;
  if (!env.SUBSCRIPTION_KEY)
    throw new HttpError(503, '복구 코드를 불러올 수 없어요. 잠시 후 다시 시도해 주세요.');
  const value = await decrypt<StoredRecovery>(
    row.encrypted_code,
    await recoveryKey(env.SUBSCRIPTION_KEY),
  );
  if (
    value.purpose !== 'account-recovery-v1' ||
    value.user_id !== user ||
    (await hash(value.code)) !== row.recovery_hash
  )
    throw new Error('RECOVERY_CODE_MISMATCH');
  return value.code;
}

export function storeRecovery(env: Env, user: string, verifier: string, encrypted: string | null) {
  return env.DB.prepare(
    'INSERT INTO recovery_codes(user_id,recovery_hash,encrypted_code) SELECT id,?,? FROM users WHERE id=? AND recovery_hash=? ON CONFLICT(user_id) DO UPDATE SET recovery_hash=excluded.recovery_hash,encrypted_code=excluded.encrypted_code',
  ).bind(verifier, encrypted, user, verifier);
}

export async function issueRecovery(env: Env, user: string, token: string) {
  if (!env.SUBSCRIPTION_KEY)
    throw new HttpError(503, '복구 코드 보관 설정이 필요해요. 잠시 후 다시 시도해 주세요.');
  const existing = await readRecovery(env, user);
  if (existing) return existing;
  const current = await env.DB.prepare('SELECT recovery_hash FROM users WHERE id=?')
    .bind(user)
    .first<{ recovery_hash: string }>();
  if (!current) throw new HttpError(401, '다시 연결해 주세요.');
  const code = secret();
  const verifier = await hash(code);
  const encrypted = await encryptRecovery(env, user, code);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET recovery_hash=?,updated_at=? WHERE id=? AND recovery_hash=? AND NOT EXISTS(SELECT 1 FROM recovery_codes r WHERE r.user_id=users.id AND r.recovery_hash=users.recovery_hash AND r.encrypted_code IS NOT NULL) AND EXISTS(SELECT 1 FROM sessions WHERE user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?)',
    ).bind(verifier, now, user, current.recovery_hash, user, await hash(token), now),
    storeRecovery(env, user, verifier, encrypted),
  ]);
  // Concurrent issuance returns the winner's code. A concurrent account recovery revokes this session.
  const active = await env.DB.prepare(
    'SELECT id FROM sessions WHERE user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?',
  )
    .bind(user, await hash(token), now)
    .first();
  if (!active) throw new HttpError(401, '복구 코드로 다시 연결해 주세요.');
  const saved = await readRecovery(env, user);
  if (!saved) throw new HttpError(409, '복구 코드가 변경됐어요. 다시 확인해 주세요.');
  return saved;
}
