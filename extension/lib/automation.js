// Lets scripts and launchers drive Manicule: a D-Bus interface on the shell's session-bus
// connection, and a small JSON file that mirrors the current state.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BUS_PATH = '/io/github/dabane_ghassan/Manicule';
export const BUS_IFACE = 'io.github.dabane_ghassan.Manicule';

const XML = `
<node>
  <interface name="${BUS_IFACE}">
    <method name="Toggle"/>
    <method name="On"/>
    <method name="Off"/>
    <method name="Clear"/>
    <method name="SetPointer"><arg type="s" direction="in" name="id"/><arg type="b" direction="out" name="ok"/></method>
    <method name="SetSound"><arg type="s" direction="in" name="value"/></method>
    <method name="SetClickThrough"><arg type="s" direction="in" name="value"/></method>
    <method name="SetKeepInk"><arg type="s" direction="in" name="value"/></method>
    <method name="GetState"><arg type="s" direction="out" name="json"/></method>
    <signal name="StateChanged"><arg type="s" name="json"/></signal>
  </interface>
</node>`;

const flip = (value, current) => value === 'on' ? true : value === 'off' ? false : !current;

export class Automation {
    constructor(overlay, catalog) {
        this._overlay = overlay;
        this._catalog = catalog;
        this._dir = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'manicule']);
        this._file = GLib.build_filenamev([this._dir, 'state.json']);
        this._dbus = Gio.DBusExportedObject.wrapJSObject(XML, this);
        this._dbus.export(Gio.DBus.session, BUS_PATH);
        this.publish();
    }

    Toggle() { this._overlay.toggle(); }
    On() { this._overlay.activate(); }
    Off() { this._overlay.deactivate(); }
    Clear() { this._overlay.clearInk(); }

    SetPointer(id) {
        if (!this._overlay.pick(id))
            return false;
        this._overlay.activate();
        return true;
    }

    SetSound(value) {
        this._overlay.soundOn = flip(value, this._overlay.soundOn);
    }

    SetClickThrough(value) {
        this._overlay.setClickThrough(flip(value, this._overlay.clickThrough));
    }

    SetKeepInk(value) {
        this._overlay.inkPermanent = flip(value, this._overlay.inkPermanent);
    }

    GetState() {
        return JSON.stringify(this._state());
    }

    _state() {
        const o = this._overlay;
        return {
            active: o.isActive,
            pointer: o.pointer.id,
            soundOn: o.soundOn,
            clickThrough: o.clickThrough,
            keepInk: o.inkPermanent,
            pointers: this._catalog.all.map(p => ({id: p.id, name: p.title, type: p.kind})),
        };
    }

    /** Write the state file and tell D-Bus listeners. */
    publish() {
        const json = JSON.stringify(this._state(), null, 2);
        try {
            GLib.mkdir_with_parents(this._dir, 0o700);
            GLib.file_set_contents(this._file, `${json}\n`);
        } catch (e) {
            console.warn(`Manicule: could not write ${this._file}: ${e.message}`);
        }
        try {
            this._dbus.emit_signal('StateChanged', new GLib.Variant('(s)', [json]));
        } catch (_e) {
            // nobody listening
        }
    }

    destroy() {
        this._dbus.unexport();
        try {
            Gio.File.new_for_path(this._file).delete(null);
        } catch (_e) {
            // already gone
        }
    }
}
