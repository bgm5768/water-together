// Generate icons from the shared light-blue water mark.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../frontend/public/brand/water-mark.svg', import.meta.url));
const publicDir = new URL('../frontend/public/', import.meta.url);
for (const size of [32, 180, 192, 512]) {
  const bytes = await sharp(source)
    .resize(size, size)
    .flatten({ background: '#e4ebff' })
    .png()
    .toBuffer();
  writeFileSync(new URL('icon-water-' + size + '.png', publicDir), bytes);
  if (size === 192 || size === 512)
    writeFileSync(new URL('icon-' + size + '.png', publicDir), bytes);
}
// Android uses the alpha mask, not the RGB colors, for its small status-bar icon.
const solid = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill="white" d="M48 8C43 19 20 41 20 58a28 28 0 0 0 56 0C76 41 53 19 48 8Z"/></svg>`,
);
const cutout = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path fill="none" stroke="white" stroke-width="7" stroke-linecap="round" d="M32 58c0 10 7 17 16 17"/></svg>`,
);
writeFileSync(
  new URL('notification-badge.png', publicDir),
  await sharp(solid)
    .composite([{ input: cutout, blend: 'dest-out' }])
    .png()
    .toBuffer(),
);
const png = await sharp(source).resize(48, 48).flatten({ background: '#e4ebff' }).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 48;
ico[7] = 48;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
writeFileSync(new URL('favicon.ico', publicDir), Buffer.concat([ico, png]));
console.log('Matching water icons, transparent notification badge and favicon generated.');
