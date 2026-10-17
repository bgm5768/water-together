import { readFileSync, writeFileSync } from 'node:fs';
const { D1_DATABASE_ID, ALLOWED_ORIGIN } = process.env;
if (
  !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(D1_DATABASE_ID || '') ||
  D1_DATABASE_ID === '00000000-0000-0000-0000-000000000000'
)
  throw Error('Set D1_DATABASE_ID');
const origin = new URL(ALLOWED_ORIGIN);
if (origin.protocol !== 'https:' || ALLOWED_ORIGIN !== origin.origin)
  throw Error('ALLOWED_ORIGIN must be an exact HTTPS origin, no path or trailing slash');
const path = new URL('../worker/wrangler.toml', import.meta.url);
writeFileSync(
  path,
  readFileSync(path, 'utf8')
    .replace(/database_id = "[^"]+"/, `database_id = "${D1_DATABASE_ID}"`)
    .replace(/ALLOWED_ORIGIN = "[^"]+"/, `ALLOWED_ORIGIN = "${origin.origin}"`),
);
console.log('Worker deployment configuration validated.');
