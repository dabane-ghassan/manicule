// Draws the pointer: a hand (or object) on a stick, a laser dot, or a spotlight.
//
// The stick is held from a "grip" just below the bottom edge of the screen, off to the
// right of the cursor, and the tip of the hand always lands exactly on the cursor.
// Everything is positioned with plain actor transforms, so a frame costs no rasterising.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {scaleFactor} from './compat.js';

const GRIP_LEAN = 0.30;     // grip sits this far right of the cursor, in screen widths
const GRIP_DEPTH = 0.12;    // and this far below the bottom edge, in screen heights
const GRIP_TAU = 0.10;      // seconds; how lazily the grip follows
const MIN_ROD = 0.05;
const LIFT = 0.06;          // shadow distance, in screen heights
const PRESS_TAU = 0.045;
const PRESS_SQUASH = 0.07;

const WOBBLE_GAIN = 0.009;  // degrees of lean per px/s of sideways speed
const WOBBLE_MAX = 16;
const WOBBLE_OMEGA = 17;
const WOBBLE_DAMP = 0.42;

const STROKE_RATE = 2.1;    // scroll strokes per second
const STROKE_CONTACT = 0.62;
const STROKE_REACH = 0.085; // stroke length, in screen heights
const SCROLL_LINGER = 0.34; // seconds the gesture outlives the last scroll event

const ENTER_TIME = 0.52;
const LEAVE_TIME = 0.2;
const WAVE_TIME = 0.85;

const TRAIL = 9;
const DEG = 180 / Math.PI;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const follow = (dt, tau) => 1 - Math.exp(-dt / tau);
const easeOutBack = t => {
    const c = 1.55;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const smooth = t => t * t * (3 - 2 * t);

export class Arm {
    constructor(settings) {
        this._settings = settings;
        this.actor = new Clutter.Actor({reactive: false});
        this._def = null;
        this._monitor = {x: 0, y: 0, width: 1280, height: 800};
        this._poses = {};
        this._pose = 'point';
        this._parts = [];

        this._press = 0;
        this.held = false;
        this._gripX = null;
        this._gripTarget = null;
        this._last = null;          // last cursor sample {x, y, t}
        this._vel = {x: 0, y: 0};
        this._lean = 0;
        this._leanSpeed = 0;

        this._scrollUntil = 0;
        this._scrollDir = {x: 0, y: -1};
        this._strokePhase = 0;
        this._stroking = false;

        this._enterStart = 0;
        this._leaveStart = 0;
        this._leaveDone = null;
        this._waveFrom = null;

        this._trail = [];
        this._sparks = 0;
        this._sparkFrom = null;
        this.tip = {x: 0, y: 0};
    }

    get kind() {
        return this._def?.kind ?? 'hand';
    }

    get isArm() {
        return this.kind !== 'laser' && this.kind !== 'spotlight';
    }

    setHidden(hidden) {
        this.actor.visible = !hidden;
    }

    setMonitor(m) {
        const changed = !this._monitor || ['x', 'y', 'width', 'height'].some(k => this._monitor[k] !== m[k]);
        this._monitor = {x: m.x, y: m.y, width: m.width, height: m.height};
        if (changed) {
            this._gripX = null;
            this._build();
        }
    }

    setPointer(def) {
        this._def = def;
        this._pose = 'point';
        this._build();
    }

    /** Re-read size and shadow settings. */
    refresh() {
        this._build();
    }

    // ------------------------------------------------------------ building

    _clear() {
        this.actor.destroy_all_children();
        this._poses = {};
        this._parts = [];
        this._trail = [];
        this._rod = this._rodShadow = this._dot = this._hole = null;
        this._dim = null;
        this._sparks = 0;
    }

    _build() {
        this._clear();
        if (!this._def)
            return;
        this._size = this._settings.get_double('pointer-size');
        this._shadow = this._settings.get_boolean('show-shadow');
        const m = this._monitor;
        if (this.kind === 'laser') {
            this.actor.remove_clip();
            this._buildLaser();
        } else if (this.kind === 'spotlight') {
            this.actor.remove_clip();
            this._buildSpotlight();
        } else {
            // The stick runs off the bottom of the screen; keep it from poking into a monitor below.
            this.actor.set_clip(m.x, m.y, m.width, m.height);
            this._buildArm();
        }
    }

    _icon(path, px, effect = null) {
        const sf = scaleFactor();
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(path)}),
            icon_size: Math.max(1, Math.round(px / sf)),
            reactive: false,
        });
        icon.set_size(px, px);
        if (effect)
            icon.add_effect(effect);
        return icon;
    }

    _buildArm() {
        const def = this._def;
        const m = this._monitor;
        const sf = scaleFactor();
        const point = def.poses.point;
        const top = def.top ?? point.tip[1];
        const span = Math.max(0.2, point.wrist[1] - top);
        // canvas size in stage pixels, snapped so the icon rasterises on whole pixels
        const c = Math.max(sf, Math.round(this._size * m.height / span / sf) * sf);
        this._c = c;

        const rodW = Math.max(3, Math.round((def.rod?.width ?? 0.055) * c));
        const rodLen = Math.round(Math.hypot(m.width, m.height) * 1.4);
        const border = Math.max(1, Math.round(c * 6 / 240 / sf));
        const radius = def.rigid ? 0 : Math.round(rodW / 2 / sf);
        this._rodW = rodW;
        this._rodLen = rodLen;

        if (this._shadow) {
            this._rodShadow = new St.Widget({
                style: `background-color: rgba(0,0,0,0.9); border-radius: ${radius}px;`,
                width: rodW, height: rodLen, opacity: 60,
            });
            this._rodShadow.set_pivot_point(0.5, 0);
            this.actor.add_child(this._rodShadow);
        }

        const shadows = {};
        for (const [name, pose] of Object.entries(def.poses)) {
            const entry = {tip: pose.tip, wrist: pose.wrist, icon: null, shadow: null};
            if (this._shadow) {
                if (pose.shadow) {
                    entry.shadow = this._icon(GLib.build_filenamev([def.dir, pose.shadow]), c);
                } else {
                    // no pre-blurred silhouette (a pointer the user added): darken the image itself
                    const fx = new Clutter.BrightnessContrastEffect();
                    fx.set_brightness(-1);
                    entry.shadow = this._icon(GLib.build_filenamev([def.dir, pose.file]), c, fx);
                }
                entry.shadow.opacity = 70;
                entry.shadow.visible = name === 'point';
                shadows[name] = entry.shadow;
                this.actor.add_child(entry.shadow);
            }
            this._poses[name] = entry;
        }

        const line = def.rod?.line ?? def.rod?.color ?? '#1B1A17';
        const fill = def.rod?.color ?? '#1B1A17';
        this._rod = new St.Widget({
            style: `background-color: ${fill}; border: ${border}px solid ${line}; border-radius: ${radius}px;`,
            width: rodW, height: rodLen,
        });
        this._rod.set_pivot_point(0.5, 0);
        this.actor.add_child(this._rod);

        for (const [name, pose] of Object.entries(def.poses)) {
            const entry = this._poses[name];
            entry.icon = this._icon(GLib.build_filenamev([def.dir, pose.file]), c);
            entry.icon.visible = name === 'point';
            this.actor.add_child(entry.icon);
        }
        this._showPose(this._pose in this._poses ? this._pose : 'point');
    }

    _buildLaser() {
        const m = this._monitor;
        const sf = scaleFactor();
        const r = Math.max(5, m.height * 0.0058 * this._size / 0.13);
        const css = v => (v / sf).toFixed(1);
        const dir = GLib.build_filenamev([GLib.path_get_dirname(this._def.dir), 'effects']);
        for (let i = TRAIL - 1; i >= 0; i--) {
            const k = 1 - (i + 1) / (TRAIL + 1);
            const d = Math.max(2, Math.round(2 * r * (0.35 + 0.6 * k)));
            const dot = new St.Widget({
                style: `background-color: #FF2A1F; border-radius: ${css(d)}px;`,
                width: d, height: d, opacity: Math.round(170 * k * k),
            });
            dot._d = d;
            dot._lag = (i + 1) * 0.014;
            this._trail.push(dot);
            this.actor.add_child(dot);
        }
        // the dot and its glow are one picture, so the glow costs nothing per frame
        const d = Math.round(r * 9 / sf) * sf;
        this._dot = this._icon(GLib.build_filenamev([dir, 'laser.svg']), d);
        this._dot.set_pivot_point(0.5, 0.5);
        this.actor.add_child(this._dot);
        this._history = [];
    }

    _buildSpotlight() {
        const m = this._monitor;
        const d = Math.round(m.height * 0.34 * this._size / 0.13 / 2) * 2;
        this._d = d;
        const dir = GLib.build_filenamev([GLib.path_get_dirname(this._def.dir), 'effects']);
        this._dim = [];
        for (let i = 0; i < 4; i++) {
            const w = new St.Widget({style: 'background-color: rgba(11,9,15,0.66);'});
            this._dim.push(w);
            this.actor.add_child(w);
        }
        this._hole = this._icon(GLib.build_filenamev([dir, 'spotlight.svg']), d);
        this.actor.add_child(this._hole);
    }

    _showPose(name) {
        if (!(name in this._poses))
            name = 'point';
        this._pose = name;
        for (const [n, p] of Object.entries(this._poses)) {
            p.icon.visible = n === name;
            if (p.shadow)
                p.shadow.visible = n === name;
        }
    }

    // ------------------------------------------------------------ gestures

    press() {
        this._press = 1;
        if (this._def?.sparkle)
            this._burst(this.tip.x, this.tip.y, 7);
    }

    /** One scroll sample. dx/dy are in the direction the user scrolls (dy > 0: down the page). */
    scroll(dx, dy) {
        if (!this._settings.get_boolean('scroll-gesture') || !this.isArm || !St.Settings.get().enable_animations)
            return;
        const now = GLib.get_monotonic_time() / 1e6;
        // the page moves opposite to the scroll direction, and the hand moves with the page
        if (Math.abs(dy) >= Math.abs(dx))
            this._scrollDir = {x: 0, y: dy > 0 ? -1 : 1};
        else
            this._scrollDir = {x: dx > 0 ? -1 : 1, y: 0};
        if (!this._stroking) {
            this._stroking = true;
            this._strokePhase = 0;
            this._showPose('open');
        }
        this._scrollUntil = now + SCROLL_LINGER;
    }

    enter() {
        this._leaveStart = 0;
        this._leaveDone = null;
        this._enterStart = GLib.get_monotonic_time() / 1e6;
        this._waveFrom = null;
        this._last = null;
        this._gripX = null;
        this._lean = this._leanSpeed = 0;
        this._stroking = false;
        if (this.isArm)
            this._showPose(this._animate && 'open' in this._poses ? 'open' : 'point');
        if (!this._animate)
            this._enterStart = 0;
    }

    leave(done) {
        if (!this._animate || !this.isArm) {
            done();
            return;
        }
        this._leaveStart = GLib.get_monotonic_time() / 1e6;
        this._leaveDone = done;
    }

    get _animate() {
        return this._settings.get_boolean('entrance-animation') && St.Settings.get().enable_animations;
    }

    /** True while something is still moving on its own, so the caller keeps drawing frames. */
    get settling() {
        if (this._press > 0.004 || this._stroking || this._enterStart || this._leaveStart)
            return true;
        if (this.kind === 'laser')
            return this._trailMoving;
        if (!this.isArm)
            return false;
        if (Math.abs(this._lean) > 0.05 || Math.abs(this._leanSpeed) > 0.5)
            return true;
        return this._gripX !== null && Math.abs(this._gripTarget - this._gripX) > 0.5;
    }

    // ------------------------------------------------------------ per frame

    aim(x, y) {
        const now = GLib.get_monotonic_time() / 1e6;
        const dt = this._last ? clamp(now - this._last.t, 0.001, 0.05) : 1 / 60;
        if (this._last) {
            const a = follow(dt, 0.05);
            this._vel.x += ((x - this._last.x) / dt - this._vel.x) * a;
            this._vel.y += ((y - this._last.y) / dt - this._vel.y) * a;
        } else {
            this._vel = {x: 0, y: 0};
        }
        this._last = {x, y, t: now};
        this.tip = {x, y};

        if (!this.held && !this._stroking)
            this._press += (0 - this._press) * follow(dt, PRESS_TAU);

        if (this.kind === 'laser')
            this._aimLaser(x, y, now);
        else if (this.kind === 'spotlight')
            this._aimSpotlight(x, y);
        else if (this._def)
            this._aimArm(x, y, now, dt);
    }

    _aimArm(x, y, now, dt) {
        const m = this._monitor;
        const c = this._c;
        const H = m.height;

        // --- entrance, wave and exit all move the point the hand reaches for
        let rise = 1;
        let wave = 0;
        if (this._enterStart) {
            const t = now - this._enterStart;
            rise = easeOutBack(clamp(t / ENTER_TIME, 0, 1));
            if (this._pose === 'open' && !this._stroking) {
                this._waveFrom ??= {x, y};
                const moved = Math.hypot(x - this._waveFrom.x, y - this._waveFrom.y);
                if (t > WAVE_TIME || moved > 14) {
                    this._showPose('point');
                } else {
                    const fade = 1 - smooth(clamp((t - WAVE_TIME + 0.25) / 0.25, 0, 1));
                    wave = 13 * Math.sin(t * 2 * Math.PI * 2.6) * fade;
                }
            }
            if (t > Math.max(ENTER_TIME, this._pose === 'open' ? WAVE_TIME : 0)) {
                this._enterStart = 0;
                if (!this._stroking)
                    this._showPose('point');
            }
        }
        if (this._leaveStart) {
            const t = clamp((now - this._leaveStart) / LEAVE_TIME, 0, 1);
            rise = 1 - t * t;
            if (t >= 1) {
                const done = this._leaveDone;
                this._leaveStart = 0;
                this._leaveDone = null;
                done?.();
                return;
            }
        }

        // --- scroll: the open hand strokes the page, lifts, and comes back for the next stroke
        let ox = 0;
        let oy = 0;
        let lifted = 0;
        if (this._stroking) {
            const before = this._strokePhase;
            this._strokePhase += dt * STROKE_RATE;
            if (this._strokePhase >= 1) {
                if (now > this._scrollUntil) {
                    this._stroking = false;
                    this._strokePhase = 0;
                    if (!this._enterStart)
                        this._showPose('point');
                } else {
                    this._strokePhase -= 1;
                }
            }
            if (this._stroking) {
                const p = this._strokePhase;
                const reach = STROKE_REACH * H * this._size / 0.13;
                let s;
                if (p < STROKE_CONTACT) {
                    s = p / STROKE_CONTACT - 0.5;
                    this._press += (0.8 - this._press) * follow(dt, 0.03);
                } else {
                    const r = smooth((p - STROKE_CONTACT) / (1 - STROKE_CONTACT));
                    s = 0.5 - r;
                    lifted = Math.sin(r * Math.PI);
                    this._press += (0 - this._press) * follow(dt, 0.03);
                }
                ox = this._scrollDir.x * s * reach;
                oy = this._scrollDir.y * s * reach;
                if (before < STROKE_CONTACT && p >= STROKE_CONTACT)
                    this._press *= 0.5;
            }
        }

        const pose = this._poses[this._pose] ?? this._poses.point;
        // pointers whose stick is part of the drawing (pencil, paw) must not shrink away from it
        const squash = this._def.rigid ? 0 : PRESS_SQUASH;
        const k = (1 - squash * this._press) * (1 + (this._def.rigid ? 0 : 0.05) * lifted);
        const ck = c * k;

        // --- where the tip goes
        const sink = (1 - rise) * (m.y + H - y + ck * 0.9);
        const tx = x + ox;
        const ty = y + oy + sink;

        // --- grip: below the bottom edge, trailing off to the right of the cursor
        const targetX = clamp(x + GRIP_LEAN * m.width, m.x + m.width * 0.15, m.x + m.width * 1.05);
        this._gripTarget = targetX;
        this._gripX = this._gripX === null ? targetX : this._gripX + (targetX - this._gripX) * follow(dt, GRIP_TAU);
        let gx = this._gripX;
        let gy = m.y + H + GRIP_DEPTH * H;

        const tipOffX = (pose.tip[0] - pose.wrist[0]) * ck;
        const handTip = (pose.wrist[1] - pose.tip[1]) * ck;
        const minReach = Math.hypot(tipOffX, handTip + MIN_ROD * H);
        let dx = tx - gx;
        let dy = ty - gy;
        let reach = Math.hypot(dx, dy);
        if (reach < minReach) {
            // too close to the grip for the hand to fit: hold the stick further down
            const f = minReach / Math.max(1, reach);
            gx = tx - dx * f;
            gy = ty - dy * f;
            dx = tx - gx;
            dy = ty - gy;
            reach = minReach;
        }
        const along = Math.sqrt(Math.max(0, reach * reach - tipOffX * tipOffX));
        const theta = Math.atan2(dy, dx) - Math.atan2(-along, tipOffX);

        // --- wobble: the hand leans back against sideways motion, on a damped spring
        let lean = 0;
        if (!this._def.rigid && this._settings.get_boolean('wobble') && St.Settings.get().enable_animations) {
            const ux = dx / reach;
            const uy = dy / reach;
            const sideways = this._vel.x * -uy + this._vel.y * ux;
            const target = clamp(sideways * WOBBLE_GAIN, -WOBBLE_MAX, WOBBLE_MAX);
            const acc = WOBBLE_OMEGA * WOBBLE_OMEGA * (target - this._lean) - 2 * WOBBLE_DAMP * WOBBLE_OMEGA * this._leanSpeed;
            this._leanSpeed += acc * dt;
            this._lean += this._leanSpeed * dt;
            lean = this._lean;
        }
        const angle = theta + (lean + wave) / DEG;

        // --- place the hand so its tip is on (tx, ty), then find where the wrist ended up
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const wvx = (pose.wrist[0] - pose.tip[0]) * ck;
        const wvy = (pose.wrist[1] - pose.tip[1]) * ck;
        const wx = tx + wvx * cos - wvy * sin;
        const wy = ty + wvx * sin + wvy * cos;

        const rodAngle = Math.atan2(gy - wy, gx - wx);
        const tuck = (this._def.rigid ? 0.02 : 0.05) * ck;
        const rx = wx - Math.cos(rodAngle) * tuck;
        const ry = wy - Math.sin(rodAngle) * tuck;
        const rodDeg = rodAngle * DEG - 90;

        const place = (icon, px, py) => {
            icon.set_pivot_point(pose.tip[0], pose.tip[1]);
            icon.set_position(px - pose.tip[0] * c, py - pose.tip[1] * c);
            icon.set_scale(k, k);
            icon.rotation_angle_z = angle * DEG;
        };
        place(pose.icon, tx, ty);
        this._rod.set_position(rx - this._rodW / 2, ry);
        this._rod.rotation_angle_z = rodDeg;

        if (pose.shadow) {
            const lift = LIFT * H * (this._size / 0.13) * (1 - 0.82 * this._press + 0.5 * lifted);
            const sx = lift * 0.55;
            const sy = lift;
            place(pose.shadow, tx + sx, ty + sy);
            this._rodShadow.set_position(rx + sx - this._rodW / 2, ry + sy);
            this._rodShadow.rotation_angle_z = rodDeg;
        }

        if (this._def.sparkle && rise >= 1) {
            this._sparkFrom ??= {x, y};
            if (Math.hypot(x - this._sparkFrom.x, y - this._sparkFrom.y) > 46) {
                this._sparkFrom = {x, y};
                this._burst(x, y, 1);
            }
        }
    }

    _aimLaser(x, y, now) {
        const d = this._dot.width;
        const k = 1 + 0.25 * this._press;
        this._dot.set_position(Math.round(x - d / 2), Math.round(y - d / 2));
        this._dot.set_scale(k, k);

        this._history.push({x, y, t: now});
        while (this._history.length > 2 && now - this._history[1].t > 0.2)
            this._history.shift();
        let moving = false;
        for (const dot of this._trail) {
            const at = now - dot._lag;
            let p = this._history[0];
            for (let i = this._history.length - 1; i >= 0; i--) {
                if (this._history[i].t <= at) {
                    p = this._history[i];
                    break;
                }
            }
            if (Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5)
                moving = true;
            dot.set_position(Math.round(p.x - dot._d / 2), Math.round(p.y - dot._d / 2));
        }
        this._trailMoving = moving;
    }

    _aimSpotlight(x, y) {
        const d = this._d;
        const W = global.stage.width;
        const Ht = global.stage.height;
        const hx = Math.round(x - d / 2);
        const hy = Math.round(y - d / 2);
        this._hole.set_position(hx, hy);
        const set = (w, px, py, pw, ph) => {
            w.set_position(px, py);
            w.set_size(Math.max(0, pw), Math.max(0, ph));
        };
        set(this._dim[0], 0, 0, W, hy);
        set(this._dim[1], 0, hy + d, W, Ht - hy - d);
        set(this._dim[2], 0, hy, hx, d);
        set(this._dim[3], hx + d, hy, W - hx - d, d);
    }

    // ------------------------------------------------------------ sparkles

    _burst(x, y, n) {
        if (!St.Settings.get().enable_animations)
            return;
        const dir = GLib.build_filenamev([GLib.path_get_dirname(this._def.dir), 'effects']);
        for (let i = 0; i < n && this._sparks < 36; i++) {
            const size = Math.round((10 + Math.random() * 14) * scaleFactor());
            const star = this._icon(GLib.build_filenamev([dir, 'star.svg']), size);
            star.set_pivot_point(0.5, 0.5);
            star.set_position(x - size / 2, y - size / 2);
            star.set_scale(0.4, 0.4);
            this.actor.add_child(star);
            star.connect('destroy', () => (star._gone = true));
            this._sparks++;
            const a = Math.random() * 2 * Math.PI;
            const far = (n > 1 ? 34 : 18) + Math.random() * 40;
            star.ease({
                translation_x: Math.cos(a) * far,
                translation_y: Math.sin(a) * far + 18,
                scale_x: 1, scale_y: 1,
                rotation_angle_z: (Math.random() - 0.5) * 240,
                opacity: 0,
                duration: 480 + Math.random() * 260,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    if (star._gone)
                        return;
                    this._sparks = Math.max(0, this._sparks - 1);
                    star.destroy();
                },
            });
        }
    }

    destroy() {
        this._leaveDone = null;
        this.actor.destroy();
    }
}
