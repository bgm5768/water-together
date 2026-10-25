// Use the same filled Lucide Droplet as TodayScreen's "물 마시기" button.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Droplet } from 'lucide-react';
const publicDir = new URL('../frontend/public/', import.meta.url);
const droplet = (color, size, position = {}) =>
  renderToStaticMarkup(
    createElement(Droplet, {
      width: size,
      height: size,
      color,
      fill: color,
      strokeWidth: 1.5,
      ...position,
    }),
  );
// Keep the silhouette inside the maskable safe area and center it optically.
const source = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#e4ebff"/>${droplet('#2888ef', 352, { x: 80, y: 73 })}</svg>`,
);
writeFileSync(new URL('icon.svg', publicDir), source);
for (const size of [32, 180, 192, 512]) {
  const bytes = await sharp(source)
    .resize(size, size)
    .flatten({ background: '#e4ebff' })
    .png()
    .toBuffer();
  writeFileSync(new URL('icon-droplet-' + size + '.png', publicDir), bytes);
  // Preserve existing icon URLs for older installations.
  writeFileSync(new URL('icon-water-' + size + '.png', publicDir), bytes);
  if (size === 192 || size === 512)
    writeFileSync(new URL('icon-' + size + '.png', publicDir), bytes);
}
// Android uses the alpha mask, not the RGB colors, for its small status-bar icon.
const badge = await sharp(Buffer.from(droplet('white', 96)))
  .png()
  .toBuffer();
writeFileSync(new URL('notification-droplet-badge.png', publicDir), badge);
writeFileSync(new URL('notification-badge.png', publicDir), badge);
const png = await sharp(source).resize(48, 48).png().toBuffer();
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
console.log('Drink-button droplet icons, transparent notification badge and favicon generated.');
