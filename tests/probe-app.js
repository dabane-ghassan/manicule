#!/usr/bin/env gjs -m
// A plain GTK4 window that logs every click, scroll and key it receives.
// The end-to-end tests use it to prove which events Manicule swallows and which pass through.
//   gjs -m tests/probe-app.js /tmp/probe.log [fullscreen]
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [logPath, mode] = ARGV;
const log = line => {
    const f = Gio.File.new_for_path(logPath);
    const s = f.append_to(Gio.FileCreateFlags.NONE, null);
    s.write_all(`${line}\n`, null);
    s.close(null);
};

const app = new Gtk.Application({application_id: 'io.github.manicule.Probe'});
app.connect('activate', () => {
    const win = new Gtk.ApplicationWindow({application: app, title: 'Probe', default_width: 900, default_height: 600});
    const css = new Gtk.CssProvider();
    css.load_from_data('window { background: #f4ede0; } label { font-size: 28px; color: #1b1a17; }', -1);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, 600);

    const scroller = new Gtk.ScrolledWindow();
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 24, margin_top: 40, margin_start: 60});
    for (let i = 1; i <= 60; i++)
        box.append(new Gtk.Label({label: `Section ${i} — a long vertical page`, xalign: 0}));
    scroller.set_child(box);
    win.set_child(scroller);

    const click = new Gtk.GestureClick({button: 0});
    click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    click.connect('pressed', (_g, _n, x, y) => log(`press ${click.get_current_button()} ${Math.round(x)},${Math.round(y)}`));
    win.add_controller(click);

    const scroll = new Gtk.EventControllerScroll({flags: Gtk.EventControllerScrollFlags.BOTH_AXES});
    scroll.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    scroll.connect('scroll', (_c, dx, dy) => { log(`scroll ${dx.toFixed(2)},${dy.toFixed(2)}`); return false; });
    win.add_controller(scroll);

    const key = new Gtk.EventControllerKey();
    key.connect('key-pressed', (_c, keyval) => { log(`key ${Gdk.keyval_name(keyval)}`); return false; });
    win.add_controller(key);

    scroller.get_vadjustment().connect('value-changed', adj => log(`scrolled-to ${Math.round(adj.get_value())}`));

    if (mode === 'fullscreen')
        win.fullscreen();
    else
        win.maximize();
    win.present();
    log('ready');
});
app.run([]);
