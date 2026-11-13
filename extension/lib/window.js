// The Manicule app window: a sidebar, a stage with the current hand and a big on/off button,
// and the settings pages.

import Adw from 'gi://Adw';
import Cairo from 'cairo';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {Engine} from './engine.js';
import {Pages} from './pages.js';
import {parseColor} from './pointers.js';

const RED = '#E5482D';

const CSS = `
@define-color accent_bg_color ${RED};
@define-color accent_color #D13F26;
@define-color accent_fg_color #ffffff;

.manicule-side { background: #1B1A17; color: #F4EDE0; }
.manicule-side headerbar { background: none; box-shadow: none; color: #F4EDE0; }
.manicule-brand { font-weight: 800; font-size: 1.15em; letter-spacing: -0.01em; }
.manicule-nav { background: none; padding: 6px 10px; }
.manicule-nav row { border-radius: 12px; padding: 10px 12px; margin: 2px 0; color: alpha(#F4EDE0, 0.72); font-weight: 600; }
.manicule-nav row:hover { background: alpha(#F4EDE0, 0.08); }
.manicule-nav row:selected { background: alpha(#F4EDE0, 0.14); color: #F4EDE0; }

.manicule-stage { border-radius: 26px; }
.manicule-state { font-weight: 800; font-size: 1.9em; letter-spacing: -0.02em; }
.manicule-power { border-radius: 999px; padding: 12px 34px; font-weight: 700; font-size: 1.05em; }
.manicule-chip { border-radius: 999px; padding: 6px 14px; background: alpha(currentColor, 0.07); font-size: 0.9em; }
.manicule-chip-key { font-weight: 700; }
.manicule-setup { border-radius: 18px; padding: 16px 18px; background: alpha(${RED}, 0.12); }
`;

// libadwaita 1.6+ reads the accent from CSS variables; GTK older than 4.16 rejects them
const CSS_VARS = `
window.manicule { --accent-bg-color: ${RED}; --accent-color: #D13F26; --accent-fg-color: #ffffff; }
`;

const NAV = [
    ['home', 'Home', 'go-home-symbolic'],
    ['pointers', 'Pointers', 'input-mouse-symbolic'],
    ['look', 'Look', 'applications-graphics-symbolic'],
    ['controls', 'Controls', 'input-keyboard-symbolic'],
    ['sound', 'Sound', 'audio-volume-high-symbolic'],
    ['about', 'About', 'help-about-symbolic'],
];

/** The stage: the current pointer on its stick, swaying a little, glowing while it is on. */
class Stage {
    constructor(catalog) {
        this._catalog = catalog;
        this.active = false;
        this.widget = new Gtk.DrawingArea({content_height: 250, hexpand: true, css_classes: ['manicule-stage']});
        this.widget.set_draw_func((_a, cr, w, h) => this._draw(cr, w, h));
        this._start = GLib.get_monotonic_time();
        this._lift = 0;
        this.widget.add_tick_callback(() => {
            const want = this.active ? 1 : 0;
            this._lift += (want - this._lift) * 0.12;
            this.widget.queue_draw();
            return GLib.SOURCE_CONTINUE;
        });
        this.setPointer(catalog.current);
    }

    setPointer(p) {
        this._p = p;
        this._pix = null;
        try {
            this._pix = GdkPixbuf.Pixbuf.new_from_file_at_size(this._catalog.iconPath(p), 440, 440);
        } catch (_e) {
            // drawn without the picture
        }
        this.widget.queue_draw();
    }

    _draw(cr, w, h) {
        const t = (GLib.get_monotonic_time() - this._start) / 1e6;
        const r = 26;
        const [ir, ig, ib] = parseColor(this._p.ink ?? RED);

        // rounded card
        cr.newSubPath();
        cr.arc(w - r, r, r, -Math.PI / 2, 0);
        cr.arc(w - r, h - r, r, 0, Math.PI / 2);
        cr.arc(r, h - r, r, Math.PI / 2, Math.PI);
        cr.arc(r, r, r, Math.PI, 1.5 * Math.PI);
        cr.closePath();
        cr.clip();
        cr.setSourceRGB(0.106, 0.102, 0.090);
        cr.paint();

        // a glow in the pointer's own colour, stronger while it is on
        const cx = w * 0.5;
        const cy = h * 0.46;
        const glow = new Cairo.RadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.62);
        const a = 0.20 + 0.34 * this._lift;
        glow.addColorStopRGBA(0, ir, ig, ib, a);
        glow.addColorStopRGBA(1, ir, ig, ib, 0);
        cr.setSource(glow);
        cr.paint();

        if (!this._pix || this._p.kind === 'laser' || this._p.kind === 'spotlight') {
            if (this._pix) {
                const s = 150 / this._pix.get_width();
                cr.save();
                cr.translate(cx - 75, cy - 75);
                cr.scale(s, s);
                Gdk.cairo_set_source_pixbuf(cr, this._pix, 0, 0);
                cr.paint();
                cr.restore();
            }
            return;
        }

        const pose = this._p.poses.point;
        const size = 200;                       // canvas size on screen
        const k = size / this._pix.get_width();
        const sway = (Math.sin(t * 1.3) * 2.2 + (this.active ? Math.sin(t * 5.2) * 1.2 : 0)) * Math.PI / 180;
        const angle = -24 * Math.PI / 180 + sway;
        const tipX = cx - 26;
        const tipY = cy - 62 - 10 * this._lift;

        cr.save();
        cr.translate(tipX, tipY);
        cr.rotate(angle);
        cr.translate(-pose.tip[0] * size, -pose.tip[1] * size);
        // stick
        const rod = this._p.rod ?? {color: '#F4EDE0', width: 0.055};
        const rw = rod.width * size;
        const light = c => (c === '#1B1A17' || c === '#0B0A0E' ? '#F4EDE0' : c);
        cr.setSourceRGB(...parseColor(light(rod.color)));
        cr.rectangle(pose.wrist[0] * size - rw / 2, pose.wrist[1] * size - 8, rw, 900);
        cr.fill();
        // hand
        cr.scale(k, k);
        Gdk.cairo_set_source_pixbuf(cr, this._pix, 0, 0);
        cr.paint();
        cr.restore();
    }
}

export function buildAppWindow(app, path, version, settings) {
    const display = Gdk.Display.get_default();
    const provider = new Gtk.CssProvider();
    const css = CSS + (Gtk.get_minor_version() >= 16 ? CSS_VARS : '');
    if (provider.load_from_string)
        provider.load_from_string(css);
    else
        provider.load_from_data(css, -1);
    Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    Gtk.IconTheme.get_for_display(display).add_search_path(GLib.build_filenamev([path, 'assets', 'icons']));

    const window = new Adw.ApplicationWindow({
        application: app, title: 'Manicule', default_width: 980, default_height: 700,
        width_request: 360, height_request: 480,
    });
    window.add_css_class('manicule');
    const toasts = new Adw.ToastOverlay();
    const host = {window, toast: t => toasts.add_toast(t)};
    const pages = new Pages(path, version);
    const [pointers, look, controls, sound, about] = pages.build(host, settings);
    const catalog = pages.catalog;
    const engine = new Engine();
    window.connect('close-request', () => {
        engine.destroy();
        return false;
    });

    // ---------------------------------------------------------- home
    const stage = new Stage(catalog);
    const state = new Gtk.Label({css_classes: ['manicule-state'], xalign: 0});
    const detail = new Gtk.Label({css_classes: ['dim-label'], xalign: 0, wrap: true});
    const power = new Gtk.Button({css_classes: ['manicule-power', 'suggested-action'], valign: Gtk.Align.CENTER});
    const words = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true, valign: Gtk.Align.CENTER});
    words.append(state);
    words.append(detail);
    const bar = new Gtk.Box({spacing: 16});
    bar.append(words);
    bar.append(power);

    const setup = new Gtk.Label({
        label: 'One more step: log out and back in once, so GNOME can load the pointer. After that it is ready whenever you are.',
        wrap: true, xalign: 0, css_classes: ['manicule-setup'], visible: false,
    });

    const chips = Adw.WrapBox ? new Adw.WrapBox({child_spacing: 8, line_spacing: 8}) : new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE, column_spacing: 8, row_spacing: 8, max_children_per_line: 6, homogeneous: false,
    });
    const chip = (key, text) => {
        const b = new Gtk.Box({spacing: 7, css_classes: ['manicule-chip']});
        b.append(new Gtk.Label({label: key, css_classes: ['manicule-chip-key']}));
        b.append(new Gtk.Label({label: text, css_classes: ['dim-label']}));
        chips.append(b);
        return b;
    };
    chip('Click', 'tap');
    chip('Drag', 'draw');
    chip('Scroll', 'the hand strokes the page');
    const hold = chip('Hold Alt', 'click for real');
    chip('Esc', 'put it away');

    const homeBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 20,
        margin_top: 8, margin_bottom: 28, margin_start: 28, margin_end: 28});
    homeBox.append(stage.widget);
    homeBox.append(bar);
    homeBox.append(setup);
    homeBox.append(chips);
    const home = new Gtk.ScrolledWindow({hscrollbar_policy: Gtk.PolicyType.NEVER,
        child: new Adw.Clamp({maximum_size: 720, child: homeBox})});

    const sync = s => {
        const ready = s !== null;
        const on = ready && s.active;
        stage.active = on;
        stage.setPointer(catalog.current);
        setup.visible = !ready;
        power.sensitive = ready;
        power.label = on ? 'Turn off' : 'Turn on';
        if (on)
            power.remove_css_class('suggested-action');
        else
            power.add_css_class('suggested-action');
        state.label = on ? 'The hand is out' : 'The hand is away';
        const accel = settings.get_strv('toggle-shortcut')[0];
        const keys = accel ? Gtk.accelerator_get_label(...Gtk.accelerator_parse(accel).slice(1)) : null;
        detail.label = `${catalog.current.title}. Toggle it here, from the hand in the top bar${keys ? `, or with ${keys}` : ''}.`;
        const key = settings.get_string('interact-key');
        hold.visible = key !== 'off';
        hold.get_first_child().label = `Hold ${{alt: 'Alt', ctrl: 'Ctrl', super: 'Super'}[key] ?? ''}`;
    };
    power.connect('clicked', () => engine.call(engine.state?.active ? 'Off' : 'On'));
    engine.watch(sync);
    for (const key of ['pointer', 'toggle-shortcut', 'interact-key', 'custom-pointers'])
        settings.connect(`changed::${key}`, () => sync(engine.state));

    // ---------------------------------------------------------- layout
    const stack = new Gtk.Stack({transition_type: Gtk.StackTransitionType.CROSSFADE, transition_duration: 120});
    const content = {home, pointers, look, controls, sound, about};
    for (const [id] of NAV)
        stack.add_named(content[id], id);

    const nav = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.SINGLE, css_classes: ['manicule-nav']});
    for (const [id, label, icon] of NAV) {
        const row = new Gtk.Box({spacing: 12});
        row.append(new Gtk.Image({icon_name: icon}));
        row.append(new Gtk.Label({label, xalign: 0}));
        const item = new Gtk.ListBoxRow({child: row});
        item._id = id;
        nav.append(item);
    }

    const brand = new Gtk.Box({spacing: 10});
    brand.append(new Gtk.Image({file: GLib.build_filenamev([path, 'assets', 'icons', 'manicule.svg']), pixel_size: 28}));
    brand.append(new Gtk.Label({label: 'Manicule', css_classes: ['manicule-brand']}));
    const sideHeader = new Adw.HeaderBar({title_widget: new Gtk.Box(), show_title: false});
    sideHeader.pack_start(brand);
    const sideBody = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    sideBody.append(nav);
    const side = new Adw.ToolbarView({content: sideBody, css_classes: ['manicule-side']});
    side.add_top_bar(sideHeader);

    const main = new Adw.ToolbarView({content: stack});
    const title = new Adw.WindowTitle({title: 'Home'});
    main.add_top_bar(new Adw.HeaderBar({title_widget: title}));

    const split = new Adw.NavigationSplitView({
        sidebar: new Adw.NavigationPage({title: 'Manicule', child: side}),
        content: new Adw.NavigationPage({title: 'Home', child: main, tag: 'content'}),
        min_sidebar_width: 210, max_sidebar_width: 240,
    });
    nav.connect('row-selected', (_l, row) => {
        if (!row)
            return;
        stack.visible_child_name = row._id;
        const label = NAV.find(n => n[0] === row._id)[1];
        title.title = label;
        split.content.title = label;
        split.show_content = true;
    });
    nav.select_row(nav.get_row_at_index(0));
    split.show_content = false;

    const narrow = new Adw.Breakpoint({condition: Adw.BreakpointCondition.parse('max-width: 620sp')});
    narrow.add_setter(split, 'collapsed', true);
    window.add_breakpoint(narrow);

    toasts.set_child(split);
    window.set_content(toasts);
    return window;
}
