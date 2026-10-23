// Draws the app icons as PNGs with no dependencies: `node scripts/generate-icons.mjs`.
// A white tooth on the design system's primary navy. Re-run it after changing the colours or the shape,
// then commit the PNGs it writes to web/public/icons/.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const NAVY = [0x24, 0x32, 0x60]; // --primary (primary-deep) in web/src/index.css
const WHITE = [0xff, 0xff, 0xff];
const OUT = new URL('../web/public/icons/', import.meta.url);

// Tooth in a unit square (0..1, y down): two crown lobes, a body, two roots.
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const box = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const root = (cx) => (x, y) => {
    if (y < 0.55 || y > 0.95) return false;
    const half = 0.17 * (1 - (y - 0.55) / 0.4) + 0.03; // tapers to a tip
    return Math.abs(x - cx) <= half;
};
const parts = [circle(0.34, 0.33, 0.24), circle(0.66, 0.33, 0.24), box(0.12, 0.33, 0.88, 0.62), root(0.33), root(0.67)];
const inTooth = (x, y) => parts.some((p) => p(x, y));

function render(size, toothScale) {
    const SS = 4;
    const px = Buffer.alloc(size * size * 3);
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            let hits = 0;
            for (let sj = 0; sj < SS; sj++) {
                for (let si = 0; si < SS; si++) {
                    const u = (i + (si + 0.5) / SS) / size;
                    const v = (j + (sj + 0.5) / SS) / size;
                    const x = (u - 0.5) / toothScale + 0.5;
                    const y = (v - 0.5) / toothScale + 0.5;
                    if (inTooth(x, y)) hits++;
                }
            }
            const t = hits / (SS * SS);
            for (let c = 0; c < 3; c++) px[(j * size + i) * 3 + c] = Math.round(NAVY[c] + (WHITE[c] - NAVY[c]) * t);
        }
    }
    return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
};
function png(size, rgb) {
    const raw = Buffer.alloc(size * (size * 3 + 1));
    for (let j = 0; j < size; j++) rgb.copy(raw, j * (size * 3 + 1) + 1, j * size * 3, (j + 1) * size * 3);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Maskable icons are cropped to a circle by some launchers, so the tooth stays inside the
// central 80% safe zone. "any" icons and the iOS icon can use more of the canvas.
const icons = [
    ['icon-192.png', 192, 0.72],
    ['icon-512.png', 512, 0.72],
    ['icon-maskable-192.png', 192, 0.52],
    ['icon-maskable-512.png', 512, 0.52],
    ['apple-touch-icon.png', 180, 0.62],
];
mkdirSync(OUT, { recursive: true });
for (const [name, size, scale] of icons) {
    writeFileSync(new URL(name, OUT), png(size, render(size, scale)));
    console.log('wrote', name);
}
