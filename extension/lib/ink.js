// Drawing on the screen. Each stroke is its own small canvas, sized to the stroke,
// so drawing never repaints a full-screen surface and finished strokes can fade on their own.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {parseColor} from './pointers.js';

const GROW = 160;       // canvases grow in chunks of this many pixels
const FADE_MS = 600;

function hue(h) {
    const f = n => {
        const k = (n + h * 6) % 6;
        return 1 - Math.max(0, Math.min(k, 4 - k, 1)) * 0.92;
    };
    return [f(5), f(3), f(1)];
}

class Stroke {
    constructor(parent, x, y, width, color) {
        this.points = [{x, y}];
        this.width = width;
        this.color = color;
        this.arrow = false;
        this._pad = Math.ceil(width * 5 + 24);
        this._box = null;
        this.area = new St.DrawingArea({reactive: false});
        this.area.connect('repaint', a => this._paint(a));
        parent.add_child(this.area);
        this._fit();
    }

    add(x, y) {
        const last = this.points[this.points.length - 1];
        if (Math.hypot(x - last.x, y - last.y) < 1.5)
            return;
        this.points.push({x, y});
        this._fit();
    }

    setArrow(on) {
        if (on === this.arrow)
            return;
        this.arrow = on;
        this.area.queue_repaint();
    }

    _fit() {
        const p = this.points[this.points.length - 1];
        const b = this._box;
        const pad = this._pad;
        if (!b || p.x - pad < b.x || p.y - pad < b.y || p.x + pad > b.x + b.w || p.y + pad > b.y + b.h) {
            let x0 = p.x - pad - GROW;
            let y0 = p.y - pad - GROW;
            let x1 = p.x + pad + GROW;
            let y1 = p.y + pad + GROW;
            if (b) {
                x0 = Math.min(b.x, p.x - pad < b.x ? x0 : b.x);
                y0 = Math.min(b.y, p.y - pad < b.y ? y0 : b.y);
                x1 = Math.max(b.x + b.w, p.x + pad > b.x + b.w ? x1 : b.x + b.w);
                y1 = Math.max(b.y + b.h, p.y + pad > b.y + b.h ? y1 : b.y + b.h);
            }
            this._box = {x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0)};
            this.area.set_position(this._box.x, this._box.y);
            this.area.set_size(this._box.w, this._box.h);
        }
        this.area.queue_repaint();
    }

    /** Shrink the canvas to the finished stroke. */
    freeze() {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of this.points) {
            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x);
            y1 = Math.max(y1, p.y);
        }
        const pad = this._pad;
        this._box = {x: Math.floor(x0 - pad), y: Math.floor(y0 - pad), w: Math.ceil(x1 - x0 + 2 * pad), h: Math.ceil(y1 - y0 + 2 * pad)};
        this.area.set_position(this._box.x, this._box.y);
        this.area.set_size(this._box.w, this._box.h);
        this.area.queue_repaint();
    }

    _trace(cr, from = 1, to = this.points.length) {
        const pts = this.points;
        // quadratic curves through the midpoints, written as the equivalent cubics
        for (let i = from; i < to; i++) {
            const prev = pts[i - 1];
            const p = pts[i];
            const mid = {x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2};
            const [cx, cy] = cr.getCurrentPoint();
            cr.curveTo(
                cx + (prev.x - cx) * 2 / 3, cy + (prev.y - cy) * 2 / 3,
                mid.x + (prev.x - mid.x) * 2 / 3, mid.y + (prev.y - mid.y) * 2 / 3,
                mid.x, mid.y);
        }
    }

    _path(cr) {
        const pts = this.points;
        cr.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) {
            cr.lineTo(pts[0].x + 0.01, pts[0].y);
            return;
        }
        this._trace(cr);
        const last = pts[pts.length - 1];
        cr.lineTo(last.x, last.y);
        if (this.arrow)
            this._head(cr);
    }

    // Aim the head along the last stretch of the stroke, so a wobble at the very end doesn't twist it.
    _head(cr) {
        const pts = this.points;
        const end = pts[pts.length - 1];
        const size = Math.max(14, this.width * 3.2);
        let back = pts[0];
        for (let i = pts.length - 1; i >= 0; i--) {
            if (Math.hypot(end.x - pts[i].x, end.y - pts[i].y) >= size * 1.2) {
                back = pts[i];
                break;
            }
        }
        const length = Math.hypot(end.x - back.x, end.y - back.y);
        if (length <= 1)
            return;
        const head = Math.min(size, length * 0.8);
        const angle = Math.atan2(end.y - back.y, end.x - back.x);
        for (const side of [-1, 1]) {
            const a = angle + Math.PI + side * Math.PI / 7;
            cr.moveTo(end.x, end.y);
            cr.lineTo(end.x + Math.cos(a) * head, end.y + Math.sin(a) * head);
        }
    }

    _paint(area) {
        const cr = area.get_context();
        cr.translate(-this._box.x, -this._box.y);
        cr.setLineWidth(this.width);
        cr.setLineCap(1);   // round
        cr.setLineJoin(1);  // round

        cr.save();
        cr.translate(1, 1.5);
        cr.setSourceRGBA(0, 0, 0, 0.18);
        this._path(cr);
        cr.stroke();
        cr.restore();

        if (this.color === 'rainbow') {
            const pts = this.points;
            let travelled = 0;
            if (pts.length === 1) {
                cr.setSourceRGBA(...hue(0), 1);
                this._path(cr);
                cr.stroke();
            }
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1];
                const b = pts[i];
                const start = i === 1 ? a : {x: (pts[i - 2].x + a.x) / 2, y: (pts[i - 2].y + a.y) / 2};
                cr.setSourceRGBA(...hue((travelled / 420) % 1), 1);
                cr.moveTo(start.x, start.y);
                this._trace(cr, i, i + 1);
                if (i === pts.length - 1) {
                    cr.lineTo(b.x, b.y);
                    if (this.arrow)
                        this._head(cr);
                }
                cr.stroke();
                travelled += Math.hypot(b.x - a.x, b.y - a.y);
            }
        } else {
            cr.setSourceRGBA(...parseColor(this.color), 1);
            this._path(cr);
            cr.stroke();
        }
        cr.$dispose();
    }
}

export class Ink {
    constructor(settings) {
        this._settings = settings;
        this.actor = new Clutter.Actor({reactive: false});
        this.color = '#8754F2';
        this._stroke = null;
        this._timers = new Set();
    }

    get isDrawing() {
        return this._stroke !== null;
    }

    get count() {
        return this.actor.get_n_children();
    }

    begin(x, y, width) {
        this._stroke = new Stroke(this.actor, x, y, width, this.color);
    }

    extend(x, y) {
        this._stroke?.add(x, y);
    }

    setArrow(on) {
        this._stroke?.setArrow(on);
    }

    end() {
        const stroke = this._stroke;
        if (!stroke)
            return;
        this._stroke = null;
        stroke.freeze();
        const area = stroke.area;
        area._box = stroke._box;
        area.connect('destroy', () => {
            area._gone = true;
            if (area._timer && this._timers.delete(area._timer))
                GLib.source_remove(area._timer);
        });
        if (!this._settings.get_boolean('ink-permanent'))
            this._fadeLater(area);
    }

    _fadeLater(area) {
        const seconds = this._settings.get_double('fade-seconds');
        if (seconds <= 0 || area._timer || area._gone)
            return;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(500, seconds * 1000), () => {
            this._timers.delete(id);
            area._timer = 0;
            area.ease({
                opacity: 0,
                duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => {
                    if (!area._gone)
                        area.destroy();
                },
            });
            return GLib.SOURCE_REMOVE;
        });
        area._timer = id;
        this._timers.add(id);
    }

    /** Start the fade for everything that was being kept (when "keep ink" is switched off). */
    fadeKept() {
        for (const area of this.actor.get_children()) {
            if (area !== this._stroke?.area)
                this._fadeLater(area);
        }
    }

    /** Make every drawing vanish at once; returns the middle of each, for the puffs of smoke. */
    poof() {
        const centres = [];
        for (const area of this.actor.get_children()) {
            if (area === this._stroke?.area || area._gone)
                continue;
            const b = area._box;
            if (b)
                centres.push([b.x + b.w / 2, b.y + b.h / 2]);
            area.set_pivot_point(0.5, 0.5);
            area.remove_all_transitions();
            area.ease({
                opacity: 0, scale_x: 1.08, scale_y: 1.08, duration: 260,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    if (!area._gone)
                        area.destroy();
                },
            });
        }
        return centres;
    }

    clear() {
        this._stroke = null;
        this.actor.destroy_all_children();
    }

    destroy() {
        this.clear();
        for (const id of this._timers)
            GLib.source_remove(id);
        this._timers.clear();
        this.actor.destroy();
    }
}
