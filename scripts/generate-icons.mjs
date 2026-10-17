import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
function crc(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    size = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, sum]);
}
for (const size of [192, 512]) {
  const data = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * 512,
        py = (y / size) * 512,
        dx = Math.abs(px - 256);
      const drop =
        (py >= 265 && (px - 256) ** 2 + (py - 280) ** 2 < 100 ** 2) ||
        (py >= 110 && py < 280 && dx < (py - 110) * 0.59);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      data.set(drop ? [255, 255, 255, 255] : [23, 107, 239, 255], i);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    new URL(`../frontend/public/icon-${size}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(data)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
