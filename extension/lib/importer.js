// Turns any transparent image into a pointer: finds the tip and the wrist, and saves a
// square PNG the extension can aim. Used by the preferences window.

import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';

import {customDir} from './pointers.js';

/** Measure a transparent image and save it as a square PNG Manicule can aim. */
export function importPointer(path) {
    let src;
    try {
        src = GdkPixbuf.Pixbuf.new_from_file(path);
    } catch (_e) {
        throw new Error("That file isn't an image Manicule can read.");
    }
    if (!src.get_has_alpha())
        throw new Error('The image needs a transparent background. Save it as a PNG with transparency.');
    if (src.get_width() < 64 || src.get_height() < 64)
        throw new Error('The image is too small. Use one at least 256 pixels tall.');

    // scale down large images first so measuring stays quick
    const limit = 640;
    const shrink = Math.min(1, limit / Math.max(src.get_width(), src.get_height()));
    if (shrink < 1) {
        src = src.scale_simple(Math.round(src.get_width() * shrink), Math.round(src.get_height() * shrink),
            GdkPixbuf.InterpType.BILINEAR);
    }
    const w = src.get_width();
    const h = src.get_height();
    const stride = src.get_rowstride();
    const px = src.get_pixels();
    const solid = (x, y) => px[y * stride + x * 4 + 3] > 128;
    const span = y => {
        let lo = -1;
        let hi = -1;
        for (let x = 0; x < w; x++) {
            if (solid(x, y)) {
                if (lo < 0)
                    lo = x;
                hi = x;
            }
        }
        return lo < 0 ? null : [lo, hi];
    };
    let top = -1;
    let bottom = -1;
    let minX = w;
    let maxX = 0;
    let filled = 0;
    for (let y = 0; y < h; y++) {
        const s = span(y);
        if (!s)
            continue;
        if (top < 0)
            top = y;
        bottom = y;
        minX = Math.min(minX, s[0]);
        maxX = Math.max(maxX, s[1]);
        filled++;
    }
    if (top < 0 || filled < 24)
        throw new Error('The image looks empty.');
    if (maxX - minX > w * 0.985 && bottom - top > h * 0.985)
        throw new Error('The picture fills the whole image. It needs some transparent space around it.');

    const tipSpan = span(Math.min(bottom, top + Math.max(1, Math.round((bottom - top) / 200))));
    const wristSpan = span(Math.max(top, bottom - Math.max(1, Math.round((bottom - top) / 200))));

    // crop to the drawing, then centre it on a square canvas with a margin
    const cw = maxX - minX + 1;
    const ch = bottom - top + 1;
    const side = Math.round(Math.max(cw, ch) * 1.12);
    const ox = Math.round((side - cw) / 2);
    const oy = Math.round((side - ch) / 2);
    const canvas = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, side, side);
    canvas.fill(0x00000000);
    src.copy_area(minX, top, cw, ch, canvas, ox, oy);

    // ink colour: the average of the opaque pixels, pushed towards something saturated
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = top; y <= bottom; y += 3) {
        for (let x = minX; x <= maxX; x += 3) {
            if (solid(x, y)) {
                const i = y * stride + x * 4;
                r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
            }
        }
    }
    const avg = [r, g, b].map(v => v / Math.max(1, n));
    const mean = (avg[0] + avg[1] + avg[2]) / 3;
    const ink = `#${avg.map(v => Math.round(Math.min(255, Math.max(0, mean + (v - mean) * 1.6)))
        .toString(16).padStart(2, '0')).join('')}`.toUpperCase();

    const fx = x => +((x - minX + ox) / side).toFixed(4);
    const fy = y => +((y - top + oy) / side).toFixed(4);
    const id = `custom-${GLib.uuid_string_random().slice(0, 8)}`;
    const dir = customDir();
    GLib.mkdir_with_parents(dir, 0o755);
    canvas.savev(GLib.build_filenamev([dir, `${id}.png`]), 'png', [], []);
    return {
        id,
        title: 'My pointer',
        ink,
        rod: {color: '#1B1A17', line: '#1B1A17', width: 0.05},
        top: fy(top),
        poses: {point: {
            file: `${id}.png`,
            tip: [fx((tipSpan[0] + tipSpan[1]) / 2), fy(top)],
            wrist: [fx((wristSpan[0] + wristSpan[1]) / 2), fy(bottom)],
        }},
    };
}
