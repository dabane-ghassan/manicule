#!/usr/bin/env -S gjs -m
// The Manicule app: the window you get from the app list.
// The hand itself is drawn by GNOME Shell (extension.js); this window switches it on and off
// and holds every setting.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const {buildAppWindow} = await import(`file://${here}/lib/window.js`);

const APP_ID = 'io.github.dabane_ghassan.Manicule';
const SCHEMA = 'org.gnome.shell.extensions.manicule';

function loadSettings() {
    const dir = GLib.build_filenamev([here, 'schemas']);
    if (!GLib.file_test(GLib.build_filenamev([dir, 'gschemas.compiled']), GLib.FileTest.EXISTS)) {
        try {
            GLib.spawn_command_line_sync(`glib-compile-schemas ${GLib.shell_quote(dir)}`);
        } catch (_e) {
            // read-only install without compiled schemas: reported below
        }
    }
    const source = Gio.SettingsSchemaSource.new_from_directory(dir, Gio.SettingsSchemaSource.get_default(), false);
    return new Gio.Settings({settings_schema: source.lookup(SCHEMA, true)});
}

function version() {
    try {
        const [, bytes] = GLib.file_get_contents(GLib.build_filenamev([here, 'metadata.json']));
        return JSON.parse(new TextDecoder().decode(bytes))['version-name'];
    } catch (_e) {
        return null;
    }
}

const app = new Adw.Application({application_id: APP_ID, flags: Gio.ApplicationFlags.DEFAULT_FLAGS});
app.connect('activate', () => {
    let window = app.get_active_window();
    if (!window)
        window = buildAppWindow(app, here, version(), loadSettings());
    window.present();
});
System.exit(app.run([System.programInvocationName, ...ARGV]));
