// Manicule: a little hand on a stick that points at things on your screen.
// https://github.com/dabane-ghassan/manicule
//
// A Linux take on TinyHand for macOS by Kamran Ahmed (https://tinyhand.app), which inspired it.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Automation} from './lib/automation.js';
import {Overlay} from './lib/overlay.js';
import {PointerCatalog} from './lib/pointers.js';

const SHORTCUTS = ['toggle-shortcut', 'clear-shortcut', 'click-through-shortcut'];

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Manicule');
        this._ext = extension;
        const icons = GLib.build_filenamev([extension.path, 'assets', 'icons']);
        this._on = Gio.icon_new_for_string(GLib.build_filenamev([icons, 'manicule-symbolic.svg']));
        this._off = Gio.icon_new_for_string(GLib.build_filenamev([icons, 'manicule-off-symbolic.svg']));
        this._icon = new St.Icon({gicon: this._off, style_class: 'system-status-icon'});
        this.add_child(this._icon);
        this._buildMenu();
        this.sync();

        // Left click (or tap) turns the pointer on or off; right or middle click opens the menu.
        // Newer shells open the menu from a click gesture, older ones from the event handler below.
        if (this._clickGesture && Clutter.ClickGesture) {
            this._clickGesture.set_enabled(false);
            const gesture = new Clutter.ClickGesture();
            gesture.set_recognize_on_press(true);
            gesture.connect('recognize', () => {
                const button = gesture.get_button();
                if (button > Clutter.BUTTON_PRIMARY)
                    this.menu.toggle();
                else if (this.menu.isOpen)
                    this.menu.close();
                else
                    this._ext.overlay.toggle();
            });
            this.add_action(gesture);
            this._ownGesture = gesture;
        }
    }

    vfunc_event(event) {
        if (this._ownGesture)
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            if (this.menu.isOpen)
                this.menu.close();
            else
                this._ext.overlay.toggle();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._ext.overlay.toggle();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_PRESS) {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _buildMenu() {
        const {overlay, catalog} = this._ext;
        this._power = new PopupMenu.PopupSwitchMenuItem('Pointer', false);
        this._power.connect('toggled', (_i, on) => {
            if (on)
                overlay.activate();
            else
                overlay.deactivate();
        });
        this.menu.addMenuItem(this._power);

        this._through = new PopupMenu.PopupSwitchMenuItem('Click-through', false);
        this._through.connect('toggled', (_i, on) => overlay.setClickThrough(on));
        this.menu.addMenuItem(this._through);

        this._sound = new PopupMenu.PopupSwitchMenuItem('Tap sound', true);
        this._sound.connect('toggled', (_i, on) => (overlay.soundOn = on));
        this.menu.addMenuItem(this._sound);

        this._pointers = new PopupMenu.PopupSubMenuMenuItem('Pointer style', true);
        this.menu.addMenuItem(this._pointers);
        this._pointerItems = new Map();
        this.rebuildPointers();

        this.menu.addAction('Clear drawing', () => overlay.clearInk());
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Open Manicule…', () => this._ext.openApp());
        this.menu.connect('open-state-changed', (_m, open) => open && this.sync());
        void catalog;
    }

    rebuildPointers() {
        const {overlay, catalog} = this._ext;
        this._pointers.menu.removeAll();
        this._pointerItems.clear();
        for (const p of catalog.all) {
            const item = new PopupMenu.PopupImageMenuItem(p.title, catalog.icon(p));
            item.connect('activate', () => {
                overlay.pick(p.id);
                overlay.activate();
            });
            this._pointerItems.set(p.id, item);
            this._pointers.menu.addMenuItem(item);
        }
    }

    sync() {
        const {overlay, catalog} = this._ext;
        this._icon.gicon = overlay.isActive ? this._on : this._off;
        this._power.setToggleState(overlay.isActive);
        this._through.setToggleState(overlay.clickThrough);
        this._through.setSensitive(overlay.isActive);
        this._sound.setToggleState(overlay.soundOn);
        this._pointers.icon.gicon = catalog.icon(overlay.pointer);
        for (const [id, item] of this._pointerItems)
            item.setOrnament(id === overlay.pointer.id ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
    }
});

export default class ManiculeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this.catalog = new PointerCatalog(this.path, this._settings);
        this.overlay = new Overlay(this._settings, this.catalog, this.path);
        this._automation = new Automation(this.overlay, this.catalog);
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this.overlay.onChanged = () => {
            this._indicator?.sync();
            this._automation?.publish();
        };
        this._settingsId = this._settings.connect('changed::custom-pointers', () => {
            this._indicator.rebuildPointers();
            this._automation.publish();
        });

        const handlers = {
            'toggle-shortcut': () => this.overlay.toggle(),
            'clear-shortcut': () => this.overlay.clearInk(),
            'click-through-shortcut': () => this.overlay.setClickThrough(!this.overlay.clickThrough),
        };
        for (const name of SHORTCUTS) {
            Main.wm.addKeybinding(name, this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP, handlers[name]);
        }
    }

    /** Open the Manicule window; fall back to GNOME's own settings dialog if gjs cannot start it. */
    openApp() {
        try {
            Gio.Subprocess.new(['gjs', '-m', GLib.build_filenamev([this.path, 'app.js'])], Gio.SubprocessFlags.NONE);
        } catch (_e) {
            this.openPreferences();
        }
    }

    disable() {
        // Also runs when the screen locks: the pointer turns itself off, as it should.
        for (const name of SHORTCUTS)
            Main.wm.removeKeybinding(name);
        if (this._settingsId)
            this._settings.disconnect(this._settingsId);
        this._settingsId = 0;
        this.overlay.onChanged = null;
        this.overlay.destroy();
        this.overlay = null;
        this._automation.destroy();
        this._automation = null;
        this._indicator.destroy();
        this._indicator = null;
        this.catalog = null;
        this._settings = null;
    }
}
