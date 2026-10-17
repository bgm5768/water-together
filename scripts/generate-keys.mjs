import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const target = new URL('../worker/.dev.vars', import.meta.url);
if (existsSync(target)) {
  console.error('worker/.dev.vars가 이미 있습니다. 기존 키를 덮어쓰지 않습니다.');
  process.exit(1);
}
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]).toString('base64url');
writeFileSync(
  target,
  `VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${jwk.d}\nVAPID_SUBJECT=mailto:replace-with-your-email@example.com\nSUBSCRIPTION_KEY=${randomBytes(32).toString('base64url')}\n`,
  { mode: 0o600 },
);
console.log(
  'worker/.dev.vars에 키를 저장했습니다. VAPID_SUBJECT를 수정하세요. 비밀 키를 Git에 커밋하지 마세요.',
);
