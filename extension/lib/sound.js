// Tap sounds, played through the shell's own sound player (libcanberra).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class TapSound {
    constructor(extensionPath) {
        this._dir = GLib.build_filenamev([extensionPath, 'assets', 'sounds']);
        this.enabled = true;
        this.name = 'thock';
    }

    play(name = this.name, force = false) {
        if (!this.enabled && !force)
            return;
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._dir, `${name}.wav`]));
        try {
            global.display.get_sound_player().play_from_file(file, 'Manicule tap', null);
        } catch (e) {
            console.warn(`Manicule: could not play ${name}: ${e.message}`);
        }
    }
}
