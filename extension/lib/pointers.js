// The pointer catalogue: built-in art plus pointers the user added.
// Shared by the shell extension and the preferences window, so it only uses Gio and GLib.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const MAX_PINNED = 8;

export const INK_COLORS = {
    red: '#FF2A1F',
    orange: '#FF8A00',
    yellow: '#FFCC00',
    green: '#30C25A',
    blue: '#0A84FF',
    purple: '#8754F2',
    white: '#FFFFFF',
    black: '#1D1D21',
};
export const INK_CHOICES = ['match', ...Object.keys(INK_COLORS), 'rainbow'];

export const TAP_SOUNDS = [
    ['thock', 'Thock'], ['click', 'Click'], ['tock', 'Tock'], ['wood', 'Wood block'],
    ['pop', 'Pop'], ['boop', 'Boop'], ['blip', 'Blip'], ['coin', 'Coin'],
    ['pew', 'Pew'], ['squeak', 'Squeak'], ['quack', 'Quack'], ['chirp', 'Chirp'],
];

export function customDir() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'manicule', 'pointers']);
}

function readJson(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (ok)
            return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        console.warn(`Manicule: could not read ${path}: ${e.message}`);
    }
    return null;
}

export class PointerCatalog {
    constructor(extensionPath, settings) {
        this._dir = GLib.build_filenamev([extensionPath, 'assets', 'pointers']);
        this._settings = settings;
        this._builtIn = readJson(GLib.build_filenamev([this._dir, 'pointers.json'])) ?? [];
        for (const p of this._builtIn) {
            p.dir = this._dir;
            p.custom = false;
        }
    }

    get custom() {
        let list = [];
        try {
            list = JSON.parse(this._settings.get_string('custom-pointers'));
        } catch (_e) {
            list = [];
        }
        if (!Array.isArray(list))
            return [];
        return list
            .filter(p => p && typeof p.id === 'string' && p.poses?.point?.file)
            .map(p => ({...p, kind: 'custom', custom: true, dir: customDir()}));
    }

    get all() {
        const effects = this._builtIn.filter(p => p.kind === 'laser' || p.kind === 'spotlight');
        const arms = this._builtIn.filter(p => !effects.includes(p));
        return [...arms, ...this.custom, ...effects];
    }

    get(id) {
        return this.all.find(p => p.id === id) ?? null;
    }

    /** The saved pointer, or the default when the saved one no longer exists. */
    get current() {
        return this.get(this._settings.get_string('pointer')) ?? this._builtIn[0];
    }

    get pinned() {
        const seen = new Set();
        const out = [];
        for (const id of this._settings.get_strv('pinned')) {
            const p = this.get(id);
            if (p && !seen.has(id)) {
                seen.add(id);
                out.push(p);
            }
        }
        return out.slice(0, MAX_PINNED);
    }

    iconPath(p) {
        const file = p.icon ?? p.poses?.point?.file;
        return GLib.build_filenamev([p.dir, file]);
    }

    icon(p) {
        return new Gio.FileIcon({file: Gio.File.new_for_path(this.iconPath(p))});
    }

    inkFor(p, choice) {
        if (choice === 'rainbow')
            return 'rainbow';
        return INK_COLORS[choice] ?? p?.ink ?? INK_COLORS.purple;
    }

    isEffect(p) {
        return p.kind === 'laser' || p.kind === 'spotlight';
    }
}

export function parseColor(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
}
