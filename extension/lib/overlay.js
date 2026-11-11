// Runs the pointer while it is on: tracks the mouse, turns clicks into taps and drags
// into ink, lets scrolling and "real" clicks through, and keeps the cursor hidden.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Arm} from './arm.js';
import {Ink} from './ink.js';
import {Toolbar} from './toolbar.js';
import {TapSound} from './sound.js';
import {CursorHider, getSeat, setUnredirect} from './compat.js';

const IDLE_AFTER = 0.5;         // seconds of stillness before frames stop
const IDLE_POLL_MS = 30;
const SCROLL_PASS = 0.12;       // seconds the click catcher steps aside after a scroll
const SCROLL_UNIT = 10;         // Mutter reports smooth scrolling in units of 10 pixels
const MENU_SCAN = 0.1;
const SHIFT_TAP_MAX = 0.3;
const SHIFT_DOUBLE_MAX = 0.35;
const DRAG_START = 4;

const INTERACT_MASKS = {
    alt: Clutter.ModifierType.MOD1_MASK,
    ctrl: Clutter.ModifierType.CONTROL_MASK,
    super: Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK,
    off: 0,
};
export const INTERACT_LABELS = {alt: 'Alt', ctrl: 'Ctrl', super: 'Super'};
const KEYBOARD_MODS = Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.CONTROL_MASK |
    Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK;
const MENU_TYPES = [
    Meta.WindowType.MENU, Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU, Meta.WindowType.COMBO,
];

const now = () => GLib.get_monotonic_time() / 1e6;

export class Overlay {
    constructor(settings, catalog, extensionPath) {
        this._settings = settings;
        this._catalog = catalog;
        this._path = extensionPath;
        this.isActive = false;
        this.clickThrough = false;
        this.onChanged = null;

        this._sound = new TapSound(extensionPath);
        this._cursor = new CursorHider();
        this._pointer = catalog.current;
        this._signals = [];
        this._settingsId = settings.connect('changed', (_s, key) => this._onSetting(key));
        this._syncSound();
    }

    // ------------------------------------------------------------ public

    get pointer() {
        return this._pointer;
    }

    get soundOn() {
        return this._settings.get_boolean(this._soundKey);
    }

    set soundOn(on) {
        this._settings.set_boolean(this._soundKey, on);
    }

    get inkStrokes() {
        return this._ink?.count ?? 0;
    }

    toggle() {
        if (this.isActive)
            this.deactivate();
        else
            this.activate();
    }

    pick(id) {
        const p = this._catalog.get(id);
        if (!p)
            return false;
        if (this._settings.get_string('pointer') !== id)
            this._settings.set_string('pointer', id);
        this._applyPointer(p);
        return true;
    }

    clearInk() {
        this._ink?.clear();
    }

    /** Clear everything and turn the pointer off. */
    exit() {
        this.clearInk();
        this.deactivate();
    }

    setClickThrough(on) {
        if (!this.isActive || on === this.clickThrough)
            return;
        this.clickThrough = on;
        if (on)
            this._release();
        this._toolbar.setClickThrough(on);
        const how = this._throughHow();
        this._toolbar.showHint(on
            ? [['Clicks go through', 'the hand stays'], [how, 'to tap again']]
            : [['Taps', "clicks don't reach apps"], [how, 'to click through']], 1.8);
        this._syncEsc();
        this._wake();
        this.onChanged?.();
    }

    activate() {
        if (this.isActive)
            return;
        if (this._leaving)
            this._teardown();
        this.isActive = true;
        this.clickThrough = false;

        const ui = Main.layoutManager.uiGroup;

        // Swallows clicks over windows. It sits just above the windows and below the panel,
        // the overview and shell menus, so those keep working as usual.
        this._catcher = new Clutter.Actor({reactive: true, name: 'manicule-catcher'});
        this._catcher.set_size(global.stage.width, global.stage.height);
        ui.insert_child_above(this._catcher, global.window_group);
        this._catcher.connect('button-press-event', (_a, ev) => this._onPress(ev));
        this._catcher.connect('button-release-event', () => this._onRelease());
        this._catcher.connect('scroll-event', (_a, ev) => this._onScroll(ev));
        this._catcher.connect('touch-event', () => Clutter.EVENT_STOP);

        // Everything visible lives in one group kept on top of the whole shell.
        this._group = new Clutter.Actor({reactive: false, name: 'manicule-overlay'});
        ui.add_child(this._group);
        this._ink = new Ink(this._settings);
        this._ripples = new Clutter.Actor({reactive: false});
        this._arm = new Arm(this._settings);
        this._toolbar = new Toolbar(this._catalog, this._settings, this._path, {
            pick: id => this.pick(id),
            toggleSound: () => (this.soundOn = !this.soundOn),
            toggleClickThrough: () => this.setClickThrough(!this.clickThrough),
            exit: () => this.exit(),
        });
        this._group.add_child(this._ink.actor);
        this._group.add_child(this._toolbar.actor);
        this._group.add_child(this._ripples);
        this._group.add_child(this._arm.actor);

        for (const signal of ['child-added', 'actor-added']) {
            try {
                this._connect(ui, signal, () => this._raise());
                break;
            } catch (_e) {
                // signal name differs between shell versions
            }
        }
        this._connect(global.stage, 'notify::width', () => this._resize());
        this._connect(global.stage, 'notify::height', () => this._resize());
        this._connect(Main.layoutManager, 'monitors-changed', () => this._resize());

        this._seat = getSeat();
        this._virtual ??= this._seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);

        this._monitor = null;
        this._down = null;
        this._passUntil = 0;
        this._menuOpen = false;
        this._lastMenuScan = 0;
        this._interacting = false;
        this._normalCursor = false;
        this._lastXY = null;
        this._lastMods = 0;
        this._stillSince = now();
        this._shiftDownAt = 0;
        this._lastShiftTap = 0;
        this._revealUntil = now() + 3;

        setUnredirect(true);
        this._cursor.hide();
        this._arm.setPointer(this._pointer);
        this._ink.color = this._inkColor();
        this._toolbar.select(this._pointer);
        this._toolbar.setSoundOn(this.soundOn);
        this._toolbar.setClickThrough(false);

        this._timeline = new Clutter.Timeline({actor: this._group, duration: 1000, repeat_count: -1});
        this._timeline.connect('new-frame', () => this._tick());
        this._tick();
        this._arm.enter();
        this._timeline.start();

        if (!this._settings.get_boolean('hint-shown')) {
            this._settings.set_boolean('hint-shown', true);
            const parts = [['Click', 'to tap'], ['Drag', 'to draw']];
            const key = this._settings.get_string('interact-key');
            if (key !== 'off')
                parts.push([`Hold ${INTERACT_LABELS[key]}`, 'to click for real']);
            parts.push(['Esc', 'to exit']);
            this._toolbar.showHint(parts, 10);
            this._revealUntil = now() + 10;
        }
        this._syncEsc();
        this.onChanged?.();
    }

    deactivate() {
        if (!this.isActive)
            return;
        this.isActive = false;
        this.clickThrough = false;
        this._release();
        this._removeEsc();
        this._catcher.hide();
        this._toolbar.setRevealed(false);
        this._toolbar.hideHint();
        this._ink.clear();
        this._leaving = true;
        // let the hand drop out of view, then take everything down
        this._arm.leave(() => this._teardown());
        if (this._leaving) {
            this._cursor.show();
            this._ensureTimeline();
        }
        this.onChanged?.();
    }

    destroy() {
        this.isActive = false;
        this._removeEsc();
        this._teardown();
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        this._virtual = null;
    }

    // ------------------------------------------------------------ lifecycle helpers

    _connect(obj, signal, handler) {
        this._signals.push([obj, obj.connect(signal, handler)]);
    }

    _teardown() {
        this._leaving = false;
        if (this._idlePoll) {
            GLib.source_remove(this._idlePoll);
            this._idlePoll = 0;
        }
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];
        this._cursor.show();
        setUnredirect(false);
        this._ink?.destroy();
        this._toolbar?.destroy();
        this._arm?.destroy();
        this._group?.destroy();
        this._catcher?.destroy();
        this._ink = this._toolbar = this._arm = this._group = this._catcher = this._ripples = null;
    }

    _raise() {
        if (!this._group)
            return;
        const ui = Main.layoutManager.uiGroup;
        if (ui.get_last_child() !== this._group)
            ui.set_child_above_sibling(this._group, null);
    }

    _resize() {
        this._catcher?.set_size(global.stage.width, global.stage.height);
        this._monitor = null;
        this._wake();
    }

    // ------------------------------------------------------------ settings

    get _soundKey() {
        return this._catalog.isEffect(this._pointer) ? 'sound-effects' : 'sound-hands';
    }

    _syncSound() {
        this._sound.enabled = this.soundOn;
        this._sound.name = this._settings.get_string('tap-sound');
        this._toolbar?.setSoundOn(this.soundOn);
    }

    _inkColor() {
        return this._catalog.inkFor(this._pointer, this._settings.get_string('ink-color'));
    }

    _applyPointer(p) {
        this._pointer = p;
        this._syncSound();
        if (this._arm && this.isActive) {
            this._arm.setPointer(p);
            this._ink.color = this._inkColor();
            this._toolbar.select(p);
            this._wake();
        }
        this.onChanged?.();
    }

    _onSetting(key) {
        switch (key) {
        case 'pointer':
        case 'custom-pointers': {
            const p = this._catalog.current;
            if (p.id !== this._pointer.id || key === 'custom-pointers')
                this._applyPointer(p);
            this._toolbar?.rebuild();
            break;
        }
        case 'pinned':
        case 'show-ink-button':
            this._toolbar?.rebuild();
            break;
        case 'pointer-size':
        case 'show-shadow':
            this._arm?.refresh();
            this._wake();
            break;
        case 'ink-color':
            if (this._ink)
                this._ink.color = this._inkColor();
            this._toolbar?.select(this._pointer);
            break;
        case 'sound-hands':
        case 'sound-effects':
        case 'tap-sound':
            this._syncSound();
            this.onChanged?.();
            break;
        case 'double-shift-click-through':
            if (!this._settings.get_boolean(key) && this.clickThrough && !this._hasThroughShortcut())
                this.setClickThrough(false);
            break;
        default:
            break;
        }
    }

    _hasThroughShortcut() {
        return this._settings.get_strv('click-through-shortcut').length > 0;
    }

    _throughHow() {
        const [accel] = this._settings.get_strv('click-through-shortcut');
        if (accel)
            return accel.replace(/<Control>|<Primary>/g, 'Ctrl+').replace(/<Alt>/g, 'Alt+')
                .replace(/<Shift>/g, 'Shift+').replace(/<Super>/g, 'Super+').replace(/\+(\w)$/, (_m, c) => `+${c.toUpperCase()}`);
        return 'Double-tap Shift';
    }

    // ------------------------------------------------------------ Esc

    _syncEsc() {
        // Esc exits, unless a menu is open (Esc should close it) or clicks are going through.
        const want = this.isActive && !this.clickThrough && !this._menuOpen;
        if (want && !this._escBound) {
            this._escBound = true;
            Main.wm.addKeybinding('exit-shortcut', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL, () => this.exit());
        } else if (!want) {
            this._removeEsc();
        }
    }

    _removeEsc() {
        if (this._escBound) {
            this._escBound = false;
            Main.wm.removeKeybinding('exit-shortcut');
        }
    }

    // ------------------------------------------------------------ input

    _onPress(ev) {
        if (!this.isActive)
            return Clutter.EVENT_PROPAGATE;
        this._arm.press();
        this._arm.held = true;
        this._sound.play();
        this._toolbar.hideHint();
        const [x, y] = ev.get_coords();
        this._down = {x, y, primary: ev.get_button() === Clutter.BUTTON_PRIMARY};
        this._ripple(x, y);
        this._wake();
        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        this._release();
        return Clutter.EVENT_STOP;
    }

    _release() {
        if (this._arm)
            this._arm.held = false;
        this._down = null;
        this._ink?.end();
    }

    _drag(x, y, mods) {
        const d = this._down;
        if (!d || !d.primary)
            return;
        if (!this._ink.isDrawing) {
            if (Math.hypot(x - d.x, y - d.y) < DRAG_START)
                return;
            const h = this._monitor?.height ?? 1080;
            this._ink.begin(d.x, d.y, Math.max(3, h * 0.0055));
        }
        this._ink.setArrow(!!(mods & Clutter.ModifierType.CONTROL_MASK));
        this._ink.extend(x, y);
    }

    _onScroll(ev) {
        if (!this.isActive)
            return Clutter.EVENT_PROPAGATE;
        const dir = ev.get_scroll_direction();
        let dx = 0;
        let dy = 0;
        switch (dir) {
        case Clutter.ScrollDirection.SMOOTH:
            [dx, dy] = ev.get_scroll_delta();
            break;
        case Clutter.ScrollDirection.UP: dy = -1; break;
        case Clutter.ScrollDirection.DOWN: dy = 1; break;
        case Clutter.ScrollDirection.LEFT: dx = -1; break;
        case Clutter.ScrollDirection.RIGHT: dx = 1; break;
        default: break;
        }
        if (dx !== 0 || dy !== 0)
            this._arm.scroll(dx, dy);
        this._wake();

        // A wheel click arrives twice: an emulated smooth event, then the real discrete one.
        // Apps only ever see the discrete one, so that is the one to hand on.
        if (ev.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED)
            return Clutter.EVENT_STOP;

        // The catcher cannot let a single event fall through, so it steps aside for a moment
        // and the scroll is sent again for the window underneath to receive.
        this._passUntil = now() + SCROLL_PASS;
        this._syncCatcher();
        const t = GLib.get_monotonic_time();
        try {
            if (dir === Clutter.ScrollDirection.SMOOTH)
                this._virtual.notify_scroll_continuous(t, dx * SCROLL_UNIT, dy * SCROLL_UNIT, ev.get_scroll_source(), ev.get_scroll_finish_flags());
            else
                this._virtual.notify_discrete_scroll(t, dir, ev.get_scroll_source());
        } catch (e) {
            console.warn(`Manicule: could not forward scroll: ${e.message}`);
        }
        return Clutter.EVENT_STOP;
    }

    _syncCatcher() {
        if (!this._catcher)
            return;
        const pass = !this.isActive || this.clickThrough || this._interacting || this._menuOpen ||
            now() < this._passUntil;
        // hide()/show() rather than toggling `reactive`: showing re-picks the actor under a
        // still pointer, so a click right after a scroll is caught again.
        if (this._catcher.visible === pass)
            this._catcher.visible = !pass;
    }

    _ripple(x, y) {
        if (!this._settings.get_boolean('tap-ripple') || !St.Settings.get().enable_animations)
            return;
        const ink = this._inkColor();
        const color = ink === 'rainbow' ? '#FFFFFF' : ink;
        const d = Math.round((this._monitor?.height ?? 1080) * 0.075 * this._settings.get_double('pointer-size') / 0.13);
        const ring = new St.Widget({
            style: `border: 3px solid ${color}; border-radius: ${d}px; background-color: rgba(255,255,255,0.10);`,
            width: d, height: d, x: Math.round(x - d / 2), y: Math.round(y - d / 2),
        });
        ring.set_pivot_point(0.5, 0.5);
        ring.set_scale(0.2, 0.2);
        ring.connect('destroy', () => (ring._gone = true));
        this._ripples.add_child(ring);
        ring.ease({
            scale_x: 1, scale_y: 1, opacity: 0, duration: 420, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (!ring._gone)
                    ring.destroy();
            },
        });
    }

    // ------------------------------------------------------------ frames

    _ensureTimeline() {
        if (this._idlePoll) {
            GLib.source_remove(this._idlePoll);
            this._idlePoll = 0;
        }
        if (this._timeline && !this._timeline.is_playing())
            this._timeline.start();
    }

    _wake() {
        this._stillSince = now();
        if (this.isActive || this._leaving)
            this._ensureTimeline();
    }

    _goIdle() {
        // Nothing is moving: stop drawing frames and just watch for the mouse or a modifier.
        this._timeline.stop();
        this._idlePoll = GLib.timeout_add(GLib.PRIORITY_DEFAULT, IDLE_POLL_MS, () => {
            this._raise();
            const [x, y, mods] = global.get_pointer();
            const moved = !this._lastXY || x !== this._lastXY[0] || y !== this._lastXY[1];
            if (moved || mods !== this._lastMods || this._toolbar.revealed !== this._wantToolbar(x, y)) {
                this._idlePoll = 0;
                this._wake();
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _wantToolbar(x, y) {
        if (!this.isActive || !this._settings.get_boolean('show-toolbar') || this._ink.isDrawing)
            return false;
        return this._toolbar.near(x, y) || now() < this._revealUntil;
    }

    _monitorAt(x, y) {
        const monitors = Main.layoutManager.monitors;
        return monitors.find(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ??
            Main.layoutManager.primaryMonitor ?? monitors[0];
    }

    _watchShift(mods, t) {
        if (!this._settings.get_boolean('double-shift-click-through'))
            return;
        const held = mods & KEYBOARD_MODS;
        const was = this._lastMods & KEYBOARD_MODS;
        if (held === was)
            return;
        if (held === Clutter.ModifierType.SHIFT_MASK && was === 0) {
            this._shiftDownAt = t;
            return;
        }
        if (held === 0 && was === Clutter.ModifierType.SHIFT_MASK && this._shiftDownAt) {
            const down = this._shiftDownAt;
            this._shiftDownAt = 0;
            if (t - down > SHIFT_TAP_MAX || this._down) {
                this._lastShiftTap = 0;
                return;
            }
            if (down - this._lastShiftTap < SHIFT_DOUBLE_MAX) {
                this._lastShiftTap = 0;
                this.setClickThrough(!this.clickThrough);
                return;
            }
            this._lastShiftTap = t;
            return;
        }
        this._shiftDownAt = 0;
        this._lastShiftTap = 0;
    }

    _tick() {
        if (!this._arm)
            return;
        const [x, y, mods] = global.get_pointer();
        const t = now();

        if (this._leaving) {
            this._arm.aim(x, y);
            return;
        }

        // shell menus raise themselves when they open; stay above them
        this._raise();

        const monitor = this._monitorAt(x, y);
        if (monitor && monitor !== this._monitor) {
            const moving = this._monitor !== null;
            this._monitor = monitor;
            if (moving) {
                this._release();
                this._revealUntil = t + 1.5;
            }
            this._arm.setMonitor(monitor);
            this._toolbar.place(monitor);
        }

        if (!this._lastXY || x !== this._lastXY[0] || y !== this._lastXY[1] || mods !== this._lastMods)
            this._stillSince = t;
        this._watchShift(mods, t);

        // --- menus opened by an app: let clicks reach them
        if (t - this._lastMenuScan > MENU_SCAN) {
            this._lastMenuScan = t;
            const open = global.get_window_actors().some(a => MENU_TYPES.includes(a.meta_window?.get_window_type()));
            if (open !== this._menuOpen) {
                this._menuOpen = open;
                this._syncEsc();
            }
        }

        // --- hold the interact key to click for real
        const mask = INTERACT_MASKS[this._settings.get_string('interact-key')] ?? 0;
        this._interacting = mask !== 0 && (mods & mask) !== 0 && !this._down;
        this._syncCatcher();

        const normal = this._interacting && !this.clickThrough && !this._ink.isDrawing &&
            !this._settings.get_boolean('interact-keeps-hand');
        if (normal !== this._normalCursor) {
            this._normalCursor = normal;
            this._arm.setHidden(normal);
            if (normal)
                this._cursor.show();
            else
                this._cursor.hide();
        }

        this._toolbar.setRevealed(this._wantToolbar(x, y));
        this._arm.aim(x, y);

        if (this._down) {
            // the release can be missed if another actor grabs the pointer mid-drag
            const anyButton = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK | Clutter.ModifierType.BUTTON3_MASK;
            if (this._down.seenDown && !(mods & anyButton))
                this._release();
            else {
                if (mods & anyButton)
                    this._down.seenDown = true;
                this._drag(x, y, mods);
            }
        }

        this._lastXY = [x, y];
        this._lastMods = mods;

        const busy = this._arm.settling || this._down || this._ink.isDrawing || t < this._passUntil ||
            t < this._revealUntil || this._toolbar.hintVisible;
        if (!busy && t - this._stillSince > IDLE_AFTER)
            this._goIdle();
    }
}
