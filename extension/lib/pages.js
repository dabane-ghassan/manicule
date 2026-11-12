// The Manicule window: every page of settings, plus the Home page with the on/off switch.
// Used both by the standalone app (app.js) and by GNOME's extension settings (prefs.js).

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {Engine} from './engine.js';
import {importPointer} from './importer.js';
import {INK_CHOICES, MAX_PINNED, PointerCatalog, TAP_SOUNDS, customDir} from './pointers.js';

const INK_TITLES = {match: 'Match the pointer', rainbow: 'Rainbow'};
const INTERACT_KEYS = [['alt', 'Alt'], ['ctrl', 'Ctrl'], ['super', 'Super'], ['off', 'Off']];
const SHORTCUTS = [
    ['toggle-shortcut', 'Turn the pointer on or off'],
    ['clear-shortcut', 'Clear the drawing'],
    ['click-through-shortcut', 'Toggle click-through'],
];
const RESET_KEYS = [
    'pointer', 'pinned', 'pointer-size', 'show-shadow', 'tap-ripple', 'scroll-gesture', 'entrance-animation',
    'wobble', 'ink-color', 'fade-seconds', 'ink-permanent', 'sound-hands', 'sound-effects', 'tap-sound', 'interact-key',
    'interact-keeps-hand', 'double-shift-click-through', 'show-toolbar', 'show-ink-button', 'hint-shown',
    'toggle-shortcut', 'clear-shortcut', 'click-through-shortcut',
];

const CSS = `
.manicule-tile { padding: 14px 8px 8px; border-radius: 18px; min-width: 104px; background: alpha(currentColor, 0.045); transition: background 120ms; }
.manicule-tile:hover { background: alpha(currentColor, 0.09); }
.manicule-tile.selected { background: alpha(#E5482D, 0.14); box-shadow: inset 0 0 0 2px #E5482D; }
.manicule-tile-title { font-size: 0.86em; font-weight: 600; }
.manicule-pin { min-height: 24px; min-width: 24px; padding: 0; opacity: 0.45; }
.manicule-pin:hover, .manicule-pin:checked { opacity: 1; }
.manicule-pin:checked { color: #E5482D; background: none; }
.manicule-logo { margin-top: 12px; }
`;

const title = s => s.charAt(0).toUpperCase() + s.slice(1);

function switchRow(settings, key, rowTitle, subtitle = null) {
    const row = new Adw.SwitchRow({title: rowTitle, subtitle: subtitle ?? ''});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function comboRow(settings, key, rowTitle, options, subtitle = null) {
    const row = new Adw.ComboRow({
        title: rowTitle, subtitle: subtitle ?? '',
        model: Gtk.StringList.new(options.map(o => o[1])),
    });
    const sync = () => {
        const i = options.findIndex(o => o[0] === settings.get_string(key));
        if (i >= 0 && row.selected !== i)
            row.selected = i;
    };
    sync();
    row.connect('notify::selected', () => {
        const value = options[row.selected]?.[0];
        if (value && value !== settings.get_string(key))
            settings.set_string(key, value);
    });
    settings.connect(`changed::${key}`, sync);
    return row;
}

export class Pages {
    constructor(path, version) {
        this.path = path;
        this.version = version ?? '1.0.0';
    }

    /** Fill GNOME's stock preferences window (used by prefs.js). */
    fill(window, settings) {
        const host = {window, toast: t => window.add_toast(t)};
        for (const page of this.build(host, settings, true))
            window.add(page);
    }

    /**
     * Build every page. `host` is {window, toast(adwToast)}.
     * Returns Adw.PreferencesPage widgets in display order.
     */
    build(host, settings, withHome = false) {
        const window = host.window;
        const catalog = new PointerCatalog(this.path, settings);
        if (withHome) {
            window.set_default_size(720, 760);
            window.set_search_enabled?.(false);
        }

        const provider = new Gtk.CssProvider();
        if (provider.load_from_string)
            provider.load_from_string(CSS);
        else
            provider.load_from_data(CSS, -1);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        this.catalog = catalog;
        const pages = [
            this._pointersPage(host, settings, catalog),
            this._lookPage(settings),
            this._controlsPage(host, settings),
            this._soundPage(settings),
            this._aboutPage(host, settings),
        ];
        if (withHome)
            pages.unshift(this._homePage(host, settings, catalog));
        return pages;
    }

    // ------------------------------------------------------------ home

    _homePage(host, settings, catalog) {
        const window = host.window;
        const page = new Adw.PreferencesPage({title: 'Home', icon_name: 'go-home-symbolic'});
        const engine = new Engine();
        window.connect('close-request', () => {
            engine.destroy();
            return false;
        });

        const hero = new Adw.PreferencesGroup();
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.CENTER, margin_bottom: 6});
        const picture = new Gtk.Image({pixel_size: 112});
        box.append(picture);
        box.append(new Gtk.Label({label: 'Manicule', css_classes: ['title-1']}));
        const tagline = new Gtk.Label({label: 'A little hand on a stick that points at things on your screen.', css_classes: ['dim-label']});
        box.append(tagline);
        hero.add(box);
        page.add(hero);

        const power = new Adw.PreferencesGroup();
        const onOff = new Adw.SwitchRow({title: 'Pointer', subtitle: 'Also in the top bar, or press the shortcut.'});
        const through = new Adw.SwitchRow({title: 'Click-through', subtitle: 'Let clicks reach the apps underneath.'});
        power.add(onOff);
        power.add(through);
        page.add(power);

        // shown instead of the switches until GNOME has loaded the part that draws the hand
        const setup = new Adw.PreferencesGroup({visible: false});
        const notice = new Adw.ActionRow({
            title: 'One more step',
            subtitle: 'Log out and back in once so GNOME can load the pointer. After that it is ready whenever you are.',
        });
        notice.add_prefix(new Gtk.Image({icon_name: 'dialog-information-symbolic'}));
        setup.add(notice);
        page.add(setup);

        const how = new Adw.PreferencesGroup({title: 'How it works'});
        const tip = (keys, text) => {
            const row = new Adw.ActionRow({title: text});
            row.add_suffix(new Gtk.Label({label: keys, css_classes: ['dim-label', 'monospace'], valign: Gtk.Align.CENTER}));
            return row;
        };
        how.add(tip('Click', 'Tap. Nothing underneath gets clicked.'));
        how.add(tip('Drag', 'Draw on the screen. Hold Ctrl for an arrowhead.'));
        how.add(tip('Scroll', 'The page scrolls and the hand strokes it along.'));
        const hold = tip('Hold Alt', 'Click for real.');
        how.add(hold);
        how.add(tip('Esc', 'Clear everything and turn the pointer off.'));
        page.add(how);

        let syncing = false;
        const sync = state => {
            syncing = true;
            const ready = state !== null;
            power.visible = ready;
            setup.visible = !ready;
            if (ready) {
                onOff.active = state.active;
                through.active = state.clickThrough;
                through.sensitive = state.active;
            }
            const accel = settings.get_strv('toggle-shortcut')[0];
            onOff.subtitle = accel
                ? `Also in the top bar, or press ${Gtk.accelerator_get_label(...Gtk.accelerator_parse(accel).slice(1))}.`
                : 'Also in the top bar.';
            const key = settings.get_string('interact-key');
            hold.visible = key !== 'off';
            picture.file = catalog.iconPath(catalog.current);
            syncing = false;
        };
        onOff.connect('notify::active', () => !syncing && engine.call(onOff.active ? 'On' : 'Off'));
        through.connect('notify::active', () => !syncing && engine.call('SetClickThrough', through.active ? 'on' : 'off'));
        engine.watch(sync);
        for (const key of ['pointer', 'toggle-shortcut', 'interact-key', 'custom-pointers'])
            settings.connect(`changed::${key}`, () => sync(engine.state));
        return page;
    }

    // ------------------------------------------------------------ pointers

    _pointersPage(host, settings, catalog) {
        const window = host.window;
        const page = new Adw.PreferencesPage({title: 'Pointers', icon_name: 'input-mouse-symbolic'});

        const group = new Adw.PreferencesGroup({
            title: 'Pick a pointer',
            description: `Click one to use it. Pin up to ${MAX_PINNED} to the toolbar.`,
        });
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE, homogeneous: true,
            max_children_per_line: 5, min_children_per_line: 3, row_spacing: 10, column_spacing: 10,
        });
        group.add(flow);
        page.add(group);

        const rebuild = () => {
            let child;
            while ((child = flow.get_first_child()))
                flow.remove(child);
            const current = settings.get_string('pointer');
            const pinned = settings.get_strv('pinned');
            for (const p of catalog.all) {
                const tile = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2, css_classes: ['manicule-tile']});
                if (p.id === current)
                    tile.add_css_class('selected');
                const image = new Gtk.Image({file: catalog.iconPath(p), pixel_size: 76});
                tile.append(image);
                tile.append(new Gtk.Label({label: p.title, css_classes: ['manicule-tile-title'], ellipsize: 3}));

                const actions = new Gtk.Box({halign: Gtk.Align.CENTER, spacing: 2});
                const pin = new Gtk.ToggleButton({
                    icon_name: 'view-pin-symbolic', active: pinned.includes(p.id),
                    tooltip_text: 'Show in the toolbar', css_classes: ['flat', 'circular', 'manicule-pin'],
                });
                pin.connect('toggled', () => {
                    let list = settings.get_strv('pinned').filter(id => id !== p.id);
                    if (pin.active) {
                        if (list.length >= MAX_PINNED) {
                            pin.active = false;
                            host.toast(new Adw.Toast({title: `The toolbar holds ${MAX_PINNED} pointers. Unpin one first.`}));
                            return;
                        }
                        list.push(p.id);
                    }
                    settings.set_strv('pinned', list);
                });
                actions.append(pin);
                if (p.custom) {
                    const remove = new Gtk.Button({
                        icon_name: 'user-trash-symbolic', tooltip_text: 'Remove this pointer',
                        css_classes: ['flat', 'circular', 'manicule-pin'],
                    });
                    remove.connect('clicked', () => {
                        const list = catalog.custom.filter(c => c.id !== p.id)
                            .map(({dir: _d, custom: _c, kind: _k, ...rest}) => rest);
                        try {
                            Gio.File.new_for_path(GLib.build_filenamev([customDir(), p.poses.point.file])).delete(null);
                        } catch (_e) {
                            // the file was already gone
                        }
                        settings.set_strv('pinned', settings.get_strv('pinned').filter(id => id !== p.id));
                        if (settings.get_string('pointer') === p.id)
                            settings.reset('pointer');
                        settings.set_string('custom-pointers', JSON.stringify(list));
                    });
                    actions.append(remove);
                }
                tile.append(actions);

                const click = new Gtk.GestureClick();
                click.connect('released', () => settings.set_string('pointer', p.id));
                image.add_controller(click);
                image.set_cursor(Gdk.Cursor.new_from_name('pointer', null));
                flow.append(tile);
            }
        };
        rebuild();
        for (const key of ['pointer', 'custom-pointers'])
            settings.connect(`changed::${key}`, rebuild);

        const own = new Adw.PreferencesGroup({
            title: 'Your own pointer',
            description: 'Any PNG with a transparent background works: a hand, a carrot, your logo. ' +
                'Draw it pointing straight up. The topmost point becomes the tip and the stick attaches at the bottom.',
        });
        const add = new Adw.ActionRow({title: 'Add a pointer from an image…', activatable: true});
        add.add_suffix(new Gtk.Image({icon_name: 'list-add-symbolic'}));
        add.connect('activated', () => {
            const filter = new Gtk.FileFilter();
            filter.set_name('Images');
            filter.add_pixbuf_formats();
            const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
            filters.append(filter);
            const dialog = new Gtk.FileDialog({title: 'Choose an image', filters});
            dialog.open(window, null, (_d, result) => {
                let file;
                try {
                    file = dialog.open_finish(result);
                } catch (_e) {
                    return;
                }
                try {
                    const pointer = importPointer(file.get_path());
                    pointer.title = title(file.get_basename().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')).slice(0, 24);
                    const list = catalog.custom.map(({dir: _d, custom: _c, kind: _k, ...rest}) => rest);
                    list.push(pointer);
                    settings.set_string('custom-pointers', JSON.stringify(list));
                    settings.set_string('pointer', pointer.id);
                    host.toast(new Adw.Toast({title: `Added “${pointer.title}”.`}));
                } catch (e) {
                    host.toast(new Adw.Toast({title: e.message, timeout: 6}));
                }
            });
        });
        own.add(add);
        page.add(own);
        return page;
    }

    // ------------------------------------------------------------ look

    _lookPage(settings) {
        const page = new Adw.PreferencesPage({title: 'Look', icon_name: 'applications-graphics-symbolic'});

        const pointer = new Adw.PreferencesGroup({title: 'Pointer'});
        const size = new Adw.ActionRow({title: 'Size'});
        const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.08, 0.20, 0.01);
        scale.set_draw_value(false);
        scale.set_hexpand(true);
        scale.set_size_request(260, -1);
        scale.set_valign(Gtk.Align.CENTER);
        settings.bind('pointer-size', scale.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);
        size.add_suffix(scale);
        pointer.add(size);
        pointer.add(switchRow(settings, 'show-shadow', 'Shadow'));
        page.add(pointer);

        const motion = new Adw.PreferencesGroup({title: 'Gestures', description: 'What the hand does besides pointing.'});
        motion.add(switchRow(settings, 'scroll-gesture', 'Stroke the page while scrolling',
            'The hand opens and pushes the page along as you scroll.'));
        motion.add(switchRow(settings, 'tap-ripple', 'Ripple on tap'));
        motion.add(switchRow(settings, 'wobble', 'Sway on the stick', 'The hand leans when you move it quickly.'));
        motion.add(switchRow(settings, 'entrance-animation', 'Rise and wave when turned on'));
        page.add(motion);

        const ink = new Adw.PreferencesGroup({title: 'Ink'});
        ink.add(comboRow(settings, 'ink-color', 'Colour', INK_CHOICES.map(c => [c, INK_TITLES[c] ?? title(c)])));
        const fade = new Adw.SpinRow({
            title: 'Fade after', subtitle: 'Seconds. 0 keeps drawings until you clear them.',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 30, step_increment: 0.5, page_increment: 1}),
            digits: 1,
        });
        settings.bind('fade-seconds', fade, 'value', Gio.SettingsBindFlags.DEFAULT);
        ink.add(fade);
        ink.add(switchRow(settings, 'ink-permanent', 'Keep drawings',
            'Do not fade them. Erase with the toolbar button or the shortcut. Also the pin in the toolbar.'));
        page.add(ink);

        const bar = new Adw.PreferencesGroup({title: 'Toolbar'});
        bar.add(switchRow(settings, 'show-toolbar', 'Show the toolbar',
            'It slides in when the pointer nears the bottom of the screen.'));
        bar.add(switchRow(settings, 'show-ink-button', 'Ink colour button'));
        page.add(bar);
        return page;
    }

    // ------------------------------------------------------------ controls

    _controlsPage(host, settings) {
        const page = new Adw.PreferencesPage({title: 'Controls', icon_name: 'input-keyboard-symbolic'});

        const keys = new Adw.PreferencesGroup({
            title: 'Shortcuts',
            description: 'Esc clears everything and turns the pointer off while it is on.',
        });
        for (const [key, label] of SHORTCUTS)
            keys.add(this._shortcutRow(host, settings, key, label));
        page.add(keys);

        const real = new Adw.PreferencesGroup({
            title: 'Clicking for real',
            description: 'While the pointer is on, clicks are taps: nothing underneath gets clicked.',
        });
        real.add(comboRow(settings, 'interact-key', 'Hold to click for real', INTERACT_KEYS,
            'While held, clicks reach the app underneath.'));
        real.add(switchRow(settings, 'interact-keeps-hand', 'Keep the hand while clicking for real',
            'Otherwise the normal cursor comes back while the key is held.'));
        real.add(switchRow(settings, 'double-shift-click-through', 'Double-tap Shift for click-through',
            'Off by default: Manicule cannot see other keys, so typing ( ) quickly can look like a double tap.'));
        page.add(real);
        return page;
    }

    _shortcutRow(host, settings, key, label) {
        const window = host.window;
        const row = new Adw.ActionRow({title: label, activatable: true});
        const shown = new Gtk.ShortcutLabel({disabled_text: 'Off', valign: Gtk.Align.CENTER});
        const sync = () => (shown.accelerator = settings.get_strv(key)[0] ?? '');
        sync();
        settings.connect(`changed::${key}`, sync);
        row.add_suffix(shown);

        row.connect('activated', () => {
            const dialog = new Adw.Window({
                transient_for: window, modal: true, default_width: 420, default_height: 200, title: label,
            });
            const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 28,
                margin_bottom: 28, margin_start: 28, margin_end: 28, valign: Gtk.Align.CENTER});
            box.append(new Gtk.Label({label: 'Press the new shortcut', css_classes: ['title-2']}));
            box.append(new Gtk.Label({label: 'Backspace turns it off. Esc cancels.', css_classes: ['dim-label']}));
            const view = new Adw.ToolbarView({content: box});
            view.add_top_bar(new Adw.HeaderBar());
            dialog.set_content(view);

            const controller = new Gtk.EventControllerKey();
            controller.connect('key-pressed', (_c, keyval, keycode, state) => {
                const mods = state & Gtk.accelerator_get_default_mod_mask();
                if (keyval === Gdk.KEY_Escape && mods === 0) {
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }
                if (keyval === Gdk.KEY_BackSpace && mods === 0) {
                    settings.set_strv(key, []);
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }
                const lower = Gdk.keyval_to_lower(keyval);
                // need a real key plus at least one of Ctrl, Alt or Super
                const needed = Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK;
                if (!Gtk.accelerator_valid(lower, mods) || (mods & needed) === 0)
                    return Gdk.EVENT_STOP;
                settings.set_strv(key, [Gtk.accelerator_name_with_keycode(null, lower, keycode, mods)]);
                dialog.close();
                return Gdk.EVENT_STOP;
            });
            dialog.add_controller(controller);
            dialog.present();
        });
        return row;
    }

    // ------------------------------------------------------------ sound

    _soundPage(settings) {
        const page = new Adw.PreferencesPage({title: 'Sound', icon_name: 'audio-volume-high-symbolic'});
        const when = new Adw.PreferencesGroup({title: 'Tap sound'});
        when.add(switchRow(settings, 'sound-hands', 'Hands and objects'));
        when.add(switchRow(settings, 'sound-effects', 'Laser dot and spotlight'));
        page.add(when);

        const which = new Adw.PreferencesGroup({title: 'Sound', description: 'Pick one to hear it.'});
        let first = null;
        for (const [id, label] of TAP_SOUNDS) {
            const row = new Adw.ActionRow({title: label, activatable: true});
            const check = new Gtk.CheckButton({valign: Gtk.Align.CENTER, active: settings.get_string('tap-sound') === id});
            if (first)
                check.set_group(first);
            else
                first = check;
            row.add_prefix(check);
            row.set_activatable_widget(check);
            check.connect('toggled', () => {
                if (!check.active)
                    return;
                settings.set_string('tap-sound', id);
                try {
                    const media = Gtk.MediaFile.new_for_filename(
                        GLib.build_filenamev([this.path, 'assets', 'sounds', `${id}.wav`]));
                    media.play();
                    this._media = media;
                } catch (_e) {
                    // no media backend: the sound still changes, it just cannot be previewed here
                }
            });
            which.add(row);
        }
        page.add(which);
        return page;
    }

    // ------------------------------------------------------------ about

    _aboutPage(host, settings) {
        const window = host.window;
        const page = new Adw.PreferencesPage({title: 'About', icon_name: 'help-about-symbolic'});
        const head = new Adw.PreferencesGroup();
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, halign: Gtk.Align.CENTER});
        box.append(new Gtk.Image({
            file: GLib.build_filenamev([this.path, 'assets', 'icons', 'manicule.svg']),
            pixel_size: 96, css_classes: ['manicule-logo'],
        }));
        box.append(new Gtk.Label({label: 'Manicule', css_classes: ['title-1']}));
        box.append(new Gtk.Label({
            label: `Version ${this.version}`, css_classes: ['dim-label'],
        }));
        box.append(new Gtk.Label({
            label: 'A little hand on a stick for your Linux desktop. Free and open source.',
            wrap: true, justify: Gtk.Justification.CENTER,
        }));
        head.add(box);
        page.add(head);

        const links = new Adw.PreferencesGroup();
        const link = (rowTitle, subtitle, uri) => {
            const row = new Adw.ActionRow({title: rowTitle, subtitle, activatable: true});
            row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
            row.connect('activated', () => Gtk.show_uri(window, uri, Gdk.CURRENT_TIME));
            return row;
        };
        links.add(link('Website', 'dabane-ghassan.github.io/manicule', 'https://dabane-ghassan.github.io/manicule/'));
        links.add(link('Source code', 'github.com/dabane-ghassan/manicule', 'https://github.com/dabane-ghassan/manicule'));
        links.add(link('Inspired by TinyHand',
            'The original hand on a stick, for macOS, by Kamran Ahmed. Manicule is an independent Linux take on it.',
            'https://tinyhand.app'));
        links.add(link('License', 'MIT', 'https://github.com/dabane-ghassan/manicule/blob/main/LICENSE'));
        page.add(links);

        const update = new Adw.PreferencesGroup();
        const updateRow = new Adw.ActionRow({
            title: 'Update Manicule',
            subtitle: 'Downloads and installs the latest version. Same as running “manicule update”.',
            activatable: true,
        });
        const spinner = new Gtk.Spinner({visible: false});
        updateRow.add_suffix(spinner);
        updateRow.connect('activated', () => {
            if (spinner.visible)
                return;
            spinner.visible = true;
            spinner.start();
            const done = message => {
                spinner.stop();
                spinner.visible = false;
                host.toast(new Adw.Toast({title: message, timeout: 8}));
            };
            try {
                const url = 'https://raw.githubusercontent.com/dabane-ghassan/manicule/main/install.sh';
                const proc = Gio.Subprocess.new(['sh', '-c', `curl -fsSL ${url} | sh`],
                    Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
                proc.wait_check_async(null, (_p, result) => {
                    try {
                        proc.wait_check_finish(result);
                        done('Updated. Log out and back in to start using the new version.');
                    } catch (_e) {
                        done('The update did not finish. Check your connection and try again.');
                    }
                });
            } catch (_e) {
                done('Could not start the update.');
            }
        });
        update.add(updateRow);
        page.add(update);

        const danger = new Adw.PreferencesGroup();
        const reset = new Adw.ActionRow({title: 'Reset all settings', activatable: true});
        reset.connect('activated', () => {
            for (const key of RESET_KEYS)
                settings.reset(key);
            host.toast(new Adw.Toast({title: 'Settings reset.'}));
        });
        danger.add(reset);
        page.add(danger);
        return page;
    }
}
