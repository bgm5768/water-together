import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const dist = new URL('../frontend/dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', dist), 'utf8'));
const base = manifest.scope;
assert.equal(manifest.start_url, base);
assert.ok(base.startsWith('/') && base.endsWith('/'));
for (const icon of manifest.icons) {
  assert.ok(icon.src.startsWith(base));
  const bytes = readFileSync(new URL(icon.src.slice(base.length), dist));
  assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
}
const sw = readFileSync(new URL('sw.js', dist), 'utf8');
assert.ok(!sw.includes('__PRECACHE__') && !sw.includes('__REVISION__'));
const assets = JSON.parse(sw.match(/const ASSETS = (.*);/)[1]);
for (const asset of assets) {
  assert.ok(asset.startsWith(base));
  assert.ok(!asset.includes('/api/') && !asset.endsWith('sw.js'));
  assert.ok(existsSync(new URL(asset.slice(base.length) || 'index.html', dist)), asset);
}
const html = readFileSync(new URL('index.html', dist), 'utf8');
assert.ok(html.includes('Content-Security-Policy'));
assert.ok(html.includes(`href="${base}manifest.webmanifest"`));
console.log(`PWA paths, cache entries, CSP and PNG sizes verified for ${base}`);
