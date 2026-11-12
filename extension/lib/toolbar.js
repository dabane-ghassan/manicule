// The little toolbar at the bottom of the screen, plus the hint bubble above it.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {INK_CHOICES, INK_COLORS} from './pointers.js';

const SLIDE_MS = 180;

export class Toolbar {
    constructor(catalog, settings, extensionPath, actions) {
        this._catalog = catalog;
        this._settings = settings;
        this._actions = actions;
        this._icons = GLib.build_filenamev([extensionPath, 'assets', 'icons']);
        this._monitor = null;
        this.revealed = false;
        this._inkOpen = false;
        this._hint = null;
        this._hintTimer = 0;
        this._styleButtons = new Map();
        this._current = null;

        this.actor = new Clutter.Actor({reactive: false});

        this._bar = new St.BoxLayout({style_class: 'manicule-toolbar', reactive: true, opacity: 0, visible: false});
        this._styles = new St.BoxLayout({style_class: 'manicule-toolbar-group'});
        this._bar.add_child(this._styles);
        this._bar.add_child(new St.Widget({style_class: 'manicule-toolbar-sep', y_align: Clutter.ActorAlign.CENTER}));

        this._inkDot = new St.Bin({style_class: 'manicule-ink-dot'});
        this._inkButton = this._button(this._inkDot, 'Ink colour', () => this._setInkOpen(!this._inkOpen));
        this._bar.add_child(this._inkButton);

        this._keepButton = this._button(
            new St.Icon({gicon: this._fileIcon('keep-symbolic.svg'), style_class: 'manicule-tool-icon'}),
            'Keep drawings (do not fade)', () => actions.toggleKeep());
        this._bar.add_child(this._keepButton);

        this._clearButton = this._button(
            new St.Icon({gicon: this._fileIcon('eraser-symbolic.svg'), style_class: 'manicule-tool-icon'}),
            'Erase all drawings', () => actions.clear());
        this._bar.add_child(this._clearButton);
        this._bar.add_child(new St.Widget({style_class: 'manicule-toolbar-sep', y_align: Clutter.ActorAlign.CENTER}));

        this._soundIcon = new St.Icon({icon_name: 'audio-volume-high-symbolic', style_class: 'manicule-tool-icon'});
        this._soundButton = this._button(this._soundIcon, 'Tap sound', () => actions.toggleSound());
        this._bar.add_child(this._soundButton);

        this._throughButton = this._button(
            new St.Icon({gicon: this._fileIcon('through-symbolic.svg'), style_class: 'manicule-tool-icon'}),
            'Click-through', () => actions.toggleClickThrough());
        this._bar.add_child(this._throughButton);

        this._bar.add_child(this._button(
            new St.Icon({icon_name: 'window-close-symbolic', style_class: 'manicule-tool-icon'}),
            'Turn the pointer off', () => actions.exit()));
        this.actor.add_child(this._bar);

        this._tray = new St.BoxLayout({style_class: 'manicule-toolbar manicule-ink-tray', reactive: true, visible: false});
        this._swatches = new Map();
        for (const choice of INK_CHOICES) {
            const b = this._button(this._swatch(choice), `Ink: ${choice}`, () => {
                this._settings.set_string('ink-color', choice);
                this._setInkOpen(false);
            });
            this._swatches.set(choice, b);
            this._tray.add_child(b);
        }
        this.actor.add_child(this._tray);

        this.rebuild();
    }

    _fileIcon(name) {
        return new Gio.FileIcon({file: Gio.File.new_for_path(GLib.build_filenamev([this._icons, name]))});
    }

    _button(child, label, onClick) {
        const b = new St.Button({style_class: 'manicule-tool', child, can_focus: false, accessible_name: label});
        b.connect('clicked', onClick);
        return b;
    }

    _swatch(choice, pointer = null) {
        if (choice === 'rainbow')
            return new St.Icon({gicon: this._fileIcon('rainbow.svg'), style_class: 'manicule-ink-swatch-icon'});
        if (choice === 'match' && !pointer) {
            const ring = new St.Bin({style_class: 'manicule-ink-swatch manicule-ink-match'});
            ring.set_child(new St.Label({text: 'A', style_class: 'manicule-ink-match-label', y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER}));
            return ring;
        }
        const color = INK_COLORS[choice] ?? pointer?.ink ?? '#8754F2';
        return new St.Widget({style_class: 'manicule-ink-swatch', style: `background-color: ${color};`});
    }

    /** Rebuild the pointer buttons from the pinned list. */
    rebuild() {
        this._styles.destroy_all_children();
        this._styleButtons.clear();
        for (const p of this._catalog.pinned) {
            const icon = new St.Icon({gicon: this._catalog.icon(p), style_class: 'manicule-pointer-icon'});
            const b = this._button(icon, p.title, () => this._actions.pick(p.id));
            b.add_style_class_name('manicule-pointer');
            this._styleButtons.set(p.id, b);
            this._styles.add_child(b);
        }
        this._inkButton.visible = this._settings.get_boolean('show-ink-button');
        if (!this._inkButton.visible)
            this._setInkOpen(false);
        this.select(this._current);
        this._queuePlace();
    }

    select(pointer) {
        this._current = pointer;
        for (const [id, b] of this._styleButtons) {
            if (pointer && id === pointer.id)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
        const choice = this._settings.get_string('ink-color');
        this._inkDot.set_child(choice === 'rainbow'
            ? new St.Icon({gicon: this._fileIcon('rainbow.svg'), style_class: 'manicule-ink-swatch-icon'})
            : this._swatch(choice, pointer ?? {}));
        for (const [c, b] of this._swatches) {
            if (c === choice)
                b.add_style_pseudo_class('checked');
            else
                b.remove_style_pseudo_class('checked');
        }
    }

    setSoundOn(on) {
        this._soundIcon.icon_name = on ? 'audio-volume-high-symbolic' : 'audio-volume-muted-symbolic';
    }

    setKeep(on) {
        if (on)
            this._keepButton.add_style_pseudo_class('checked');
        else
            this._keepButton.remove_style_pseudo_class('checked');
    }

    setClickThrough(on) {
        if (on)
            this._throughButton.add_style_pseudo_class('checked');
        else
            this._throughButton.remove_style_pseudo_class('checked');
    }

    _setInkOpen(open) {
        if (open === this._inkOpen)
            return;
        this._inkOpen = open;
        this._tray.visible = open;
        if (open)
            this._inkButton.add_style_pseudo_class('checked');
        else
            this._inkButton.remove_style_pseudo_class('checked');
        this._queuePlace();
    }

    // ------------------------------------------------------------ geometry

    place(monitor) {
        this._monitor = monitor;
        this._placeNow();
    }

    _queuePlace() {
        if (this._placeIdle)
            return;
        this._placeIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._placeIdle = 0;
            this._placeNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _placeNow() {
        const m = this._monitor;
        if (!m)
            return;
        const [, w] = this._bar.get_preferred_width(-1);
        const [, h] = this._bar.get_preferred_height(-1);
        this._barBox = {x: Math.round(m.x + (m.width - w) / 2), y: Math.round(m.y + m.height - h - 18), w, h};
        this._bar.set_position(this._barBox.x, this._barBox.y);
        if (this._inkOpen) {
            const [, tw] = this._tray.get_preferred_width(-1);
            const [, th] = this._tray.get_preferred_height(-1);
            this._tray.set_position(Math.round(m.x + (m.width - tw) / 2), this._barBox.y - th - 8);
        }
        if (this._hint) {
            const [, hw] = this._hint.get_preferred_width(-1);
            const [, hh] = this._hint.get_preferred_height(-1);
            this._hint.set_position(Math.round(m.x + (m.width - hw) / 2), this._barBox.y - hh - 12);
        }
    }

    /** True when (x, y) is close enough to the toolbar that it should slide into view. */
    near(x, y) {
        const b = this._barBox;
        if (!b)
            return false;
        const top = this._inkOpen ? b.y - 70 : b.y - 90;
        return x >= b.x - 80 && x <= b.x + b.w + 80 && y >= top;
    }

    setRevealed(on) {
        if (on === this.revealed)
            return;
        this.revealed = on;
        this._bar.remove_all_transitions();
        if (on) {
            this._bar.visible = true;
            this._bar.translation_y = 14;
            this._bar.ease({opacity: 255, translation_y: 0, duration: SLIDE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else {
            this._setInkOpen(false);
            this._bar.ease({
                opacity: 0, translation_y: 14, duration: SLIDE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => (this._bar.visible = false),
            });
        }
    }

    // ------------------------------------------------------------ hints

    /** parts: [[key, text], ...]; shown above the toolbar for `seconds`. */
    showHint(parts, seconds = 2) {
        this.hideHint();
        const hint = new St.BoxLayout({style_class: 'manicule-hint', opacity: 0});
        for (const [key, text] of parts) {
            const pair = new St.BoxLayout({style_class: 'manicule-hint-pair'});
            pair.add_child(new St.Label({text: key, style_class: 'manicule-hint-key', y_align: Clutter.ActorAlign.CENTER}));
            pair.add_child(new St.Label({text, style_class: 'manicule-hint-text', y_align: Clutter.ActorAlign.CENTER}));
            hint.add_child(pair);
        }
        this._hint = hint;
        hint.connect('destroy', () => (hint._gone = true));
        this.actor.add_child(hint);
        this._placeNow();
        this._queuePlace();     // again once the labels have their real size
        hint.ease({opacity: 255, duration: 160});
        this._hintTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, seconds * 1000, () => {
            this._hintTimer = 0;
            this.hideHint();
            return GLib.SOURCE_REMOVE;
        });
    }

    hideHint() {
        if (this._hintTimer) {
            GLib.source_remove(this._hintTimer);
            this._hintTimer = 0;
        }
        const hint = this._hint;
        if (!hint)
            return;
        this._hint = null;
        hint.ease({
            opacity: 0, duration: 160,
            onStopped: () => {
                if (!hint._gone)
                    hint.destroy();
            },
        });
    }

    get hintVisible() {
        return this._hint !== null;
    }

    destroy() {
        if (this._placeIdle)
            GLib.source_remove(this._placeIdle);
        if (this._hintTimer)
            GLib.source_remove(this._hintTimer);
        this._hint = null;
        this.actor.destroy();
    }
}
