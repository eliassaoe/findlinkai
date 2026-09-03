/**
 * Renders the extension's PNG icons from the same mark the n8n node uses
 * (rounded blue square, magnifying glass), at the four sizes MV3 asks for.
 *
 * Written by hand because this sandbox has no PIL, ImageMagick or rsvg, and
 * because Chrome will not accept an SVG icon in a manifest. It is a generator
 * rather than four committed binaries so the mark stays editable in one place:
 * change BLUE or the geometry below and re-run.
 *
 * Shapes are sampled 4x4 per pixel, which is enough antialiasing at 16px that
 * the glass does not turn into a grey smudge.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];
const SS = 4; // supersample factor per axis

// Geometry on the original 60x60 viewBox, so it matches linkfinderai.svg exactly.
const VB = 60;
const RADIUS = 12;
const GLASS = { cx: 26, cy: 26, r: 12, stroke: 4 };
const HANDLE = { x1: 35, y1: 35, x2: 46, y2: 46, stroke: 4 };

const insideRoundedRect = (x, y) => {
    const r = RADIUS;
    // Corner circles; the straight edges are the two overlapping inner rects.
    if (x >= r && x <= VB - r) return y >= 0 && y <= VB;
    if (y >= r && y <= VB - r) return x >= 0 && x <= VB;
    const cx = x < r ? r : VB - r;
    const cy = y < r ? r : VB - r;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const onRing = (x, y) => {
    const d = Math.hypot(x - GLASS.cx, y - GLASS.cy);
    return Math.abs(d - GLASS.r) <= GLASS.stroke / 2;
};

// Distance to the handle segment, with round caps (stroke-linecap="round").
const onHandle = (x, y) => {
    const dx = HANDLE.x2 - HANDLE.x1;
    const dy = HANDLE.y2 - HANDLE.y1;
    const len2 = dx * dx + dy * dy;
    let t = ((x - HANDLE.x1) * dx + (y - HANDLE.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = HANDLE.x1 + t * dx;
    const py = HANDLE.y1 + t * dy;
    return Math.hypot(x - px, y - py) <= HANDLE.stroke / 2;
};

function render(size) {
    // RGBA, one extra leading filter byte per scanline (PNG filter type 0).
    const raw = Buffer.alloc(size * (1 + size * 4));
    const scale = VB / size;

    for (let py = 0; py < size; py++) {
        const rowStart = py * (1 + size * 4);
        raw[rowStart] = 0;
        for (let px = 0; px < size; px++) {
            let inShape = 0;
            let inMark = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const x = (px + (sx + 0.5) / SS) * scale;
                    const y = (py + (sy + 0.5) / SS) * scale;
                    if (!insideRoundedRect(x, y)) continue;
                    inShape++;
                    if (onRing(x, y) || onHandle(x, y)) inMark++;
                }
            }
            const samples = SS * SS;
            const alpha = Math.round((inShape / samples) * 255);
            // Mark coverage is relative to the covered part of the pixel, so the
            // white does not get darkened twice at the rounded corners.
            const markRatio = inShape ? inMark / inShape : 0;
            const mix = (i) => Math.round(BLUE[i] + (WHITE[i] - BLUE[i]) * markRatio);
            const o = rowStart + 1 + px * 4;
            raw[o] = mix(0);
            raw[o + 1] = mix(1);
            raw[o + 2] = mix(2);
            raw[o + 3] = alpha;
        }
    }
    return raw;
}

const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function png(size) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(render(size), { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

for (const size of [16, 32, 48, 128]) {
    const out = join(HERE, 'src', 'icons', `icon-${size}.png`);
    writeFileSync(out, png(size));
    console.log(`icon-${size}.png`);
}
