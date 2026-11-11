// Talks to the part of Manicule that runs inside GNOME Shell and draws the hand.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEST = 'org.gnome.Shell';
const PATH = '/io/github/dabane_ghassan/Manicule';
const IFACE = 'io.github.dabane_ghassan.Manicule';
export const UUID = 'manicule@dabane-ghassan.github.io';

export class Engine {
    constructor() {
        this._bus = Gio.DBus.session;
        this.state = null;      // null until the shell side answers
        this._watchers = [];
        this._signal = this._bus.signal_subscribe(DEST, IFACE, 'StateChanged', PATH, null,
            Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, params) => this._set(params.deep_unpack()[0]));
        this._retry = 0;
        this._tries = 0;
        this.refresh();
    }

    _set(json) {
        try {
            this.state = json === null ? null : JSON.parse(json);
        } catch (_e) {
            this.state = null;
        }
        for (const w of this._watchers)
            w(this.state);
    }

    /** Ask the shell for the current state; keep asking for a while if it is not there yet. */
    refresh() {
        this._bus.call(DEST, PATH, IFACE, 'GetState', null, null, Gio.DBusCallFlags.NONE, 2000, null, (bus, res) => {
            try {
                this._set(bus.call_finish(res).deep_unpack()[0]);
            } catch (_e) {
                this._set(null);
                if (this._tries === 0)
                    this._enable();
                if (this._tries++ < 8 && !this._retry) {
                    this._retry = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                        this._retry = 0;
                        this.refresh();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        });
    }

    _enable() {
        // harmless if it is already enabled, or if GNOME has not seen the files yet
        try {
            Gio.Subprocess.new(['gnome-extensions', 'enable', UUID],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (_e) {
            // not a GNOME session
        }
    }

    call(method, arg = null) {
        const params = arg === null ? null : new GLib.Variant('(s)', [arg]);
        this._bus.call(DEST, PATH, IFACE, method, params, null, Gio.DBusCallFlags.NONE, 2000, null, (bus, res) => {
            try {
                bus.call_finish(res);
            } catch (_e) {
                this.refresh();
            }
        });
    }

    watch(callback) {
        this._watchers.push(callback);
        callback(this.state);
    }

    destroy() {
        this._watchers = [];
        if (this._signal)
            this._bus.signal_unsubscribe(this._signal);
        this._signal = 0;
        if (this._retry)
            GLib.source_remove(this._retry);
        this._retry = 0;
    }
}
