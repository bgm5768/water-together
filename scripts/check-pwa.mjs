import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
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
const badge = await sharp(readFileSync(new URL('notification-droplet-badge.png', dist)))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
assert.equal(badge.info.width, 96);
assert.equal(badge.info.height, 96);
const alpha = Array.from(badge.data).filter((_, index) => index % 4 === 3);
assert.equal(alpha[0], 0, 'Notification badge background must be transparent');
assert.ok(
  alpha.some((a) => a === 255),
  'Notification badge must contain an opaque silhouette',
);
assert.ok(
  alpha.filter((a) => a === 0).length > alpha.length / 2,
  'Opaque squares must never be used as status-bar badges',
);
assert.ok(sw.includes("badge: new URL('notification-droplet-badge.png'"));
const emptyIcon = await sharp(readFileSync(new URL('notification-empty-icon.png', dist)))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
assert.equal(emptyIcon.info.width, 96);
assert.equal(emptyIcon.info.height, 96);
assert.ok(
  emptyIcon.data.every((value, index) => index % 4 !== 3 || value === 0),
  'The large notification icon must remain fully transparent',
);
assert.ok(sw.includes("icon: new URL('notification-empty-icon.png'"));
for (const path of [
  'notification-droplet-badge.png',
  'notification-empty-icon.png',
  'audio/can-pour.mp3',
  'brand/water-mark.svg',
])
  assert.ok(assets.includes(base + path), `Missing offline asset: ${path}`);
assert.ok(html.includes('Content-Security-Policy'));
assert.ok(html.includes(`href="${base}manifest.webmanifest"`));
console.log(`PWA paths, cache entries, CSP and PNG sizes verified for ${base}`);
