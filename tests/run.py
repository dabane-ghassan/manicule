#!/usr/bin/env python3
"""End-to-end tests for Manicule, in a real (headless) GNOME Shell.

Starts a private session bus and `gnome-shell --headless`, loads the extension from this
checkout, drives it with simulated mouse and keyboard input, and checks what a plain GTK
window underneath actually received. Screenshots land in tests/out/.

    python3 tests/run.py            # or: make test
    python3 tests/run.py --keep     # leave the shell running afterwards, for poking around

Needs gnome-shell, gjs and GTK 4. In a container you also need a system D-Bus
(`dbus-daemon --system --fork`) and no stale /run/systemd/seats directory.
"""
import ast
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
UUID = "manicule@dabane-ghassan.github.io"
OUT = ROOT / "tests" / "out"
OBJ = "/io/github/dabane_ghassan/Manicule"
IFACE = "io.github.dabane_ghassan.Manicule"

RIG_JS = """
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
export default class Rig extends Extension {
    enable() { global.context.unsafe_mode = true; }
    disable() { global.context.unsafe_mode = false; }
}
"""

INPUT_JS = """
const Clutter = imports.gi.Clutter; const GLib = imports.gi.GLib;
const backend = Clutter.get_default_backend ? Clutter.get_default_backend() : global.stage.context.get_backend();
const seat = backend.get_default_seat();
const t = global._t = {};
t.v = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
t.k = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
t.now = () => GLib.get_monotonic_time();
t.move = (x, y) => t.v.notify_absolute_motion(t.now(), x, y);
t.down = (b = 1) => t.v.notify_button(t.now(), b, Clutter.ButtonState.PRESSED);
t.up = (b = 1) => t.v.notify_button(t.now(), b, Clutter.ButtonState.RELEASED);
t.click = (b = 1) => { t.down(b); t.up(b); };
t.scroll = (dy, dx = 0) => t.v.notify_scroll_continuous(t.now(), dx, dy, Clutter.ScrollSource.FINGER, Clutter.ScrollFinishFlags.NONE);
t.wheel = dir => t.v.notify_discrete_scroll(t.now(), dir, Clutter.ScrollSource.WHEEL);
t.key = (keyval, down) => t.k.notify_keyval(t.now(), keyval, down ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
t.chord = (...keys) => { keys.forEach(k => t.key(k, true)); keys.slice().reverse().forEach(k => t.key(k, false)); };
t.glide = (pts, ms) => { const n = Math.max(2, Math.round(ms / 8)); let i = 0;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8, () => { const f = i / n * (pts.length - 1); const a = Math.min(pts.length - 2, Math.floor(f)); const u = f - a;
        t.move(pts[a][0] + (pts[a + 1][0] - pts[a][0]) * u, pts[a][1] + (pts[a + 1][1] - pts[a][1]) * u); return ++i <= n; }); };
t.ext = () => Main.extensionManager.lookup('%s').stateObj;
imports.gi.St.Settings.get().uninhibit_animations();
'ready'
""" % UUID


class Rig:
    def __init__(self, size="1280x800"):
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="manicule-test-"))
        self.env = dict(os.environ)
        self.env.update({
            "HOME": str(self.tmp / "home"),
            "XDG_RUNTIME_DIR": str(self.tmp / "run"),
            "XDG_DATA_HOME": str(self.tmp / "home/.local/share"),
            "XDG_CONFIG_HOME": str(self.tmp / "home/.config"),
            "XDG_CACHE_HOME": str(self.tmp / "home/.cache"),
            "XDG_SESSION_TYPE": "wayland", "XDG_CURRENT_DESKTOP": "GNOME",
            "GSETTINGS_BACKEND": "keyfile", "LIBGL_ALWAYS_SOFTWARE": "1",
            "NO_AT_BRIDGE": "1", "GTK_A11Y": "none",
        })
        self.env.pop("DBUS_SESSION_BUS_ADDRESS", None)
        self.env.pop("WAYLAND_DISPLAY", None)
        for d in ("home", "run"):
            (self.tmp / d).mkdir()
        (self.tmp / "run").chmod(0o700)
        self.size = size
        self.procs = []
        self.log = self.tmp / "shell.log"
        self.probe_log = self.tmp / "probe.log"

    # -- session ------------------------------------------------------------

    def start(self):
        exts = self.tmp / "home/.local/share/gnome-shell/extensions"
        (exts / "rig@test").mkdir(parents=True)
        (exts / "rig@test/metadata.json").write_text(json.dumps({
            "uuid": "rig@test", "name": "rig", "description": "lets the tests drive the shell",
            "shell-version": [self.shell_major()]}))
        (exts / "rig@test/extension.js").write_text(RIG_JS)
        shutil.copytree(ROOT / "extension", exts / UUID)
        subprocess.run(["glib-compile-schemas", str(exts / UUID / "schemas")], check=True)

        bus = subprocess.Popen(["dbus-daemon", "--session", "--nofork", "--print-address=1"],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=self.env, text=True)
        self.procs.append(bus)
        self.env["DBUS_SESSION_BUS_ADDRESS"] = bus.stdout.readline().strip()
        gs = ["gsettings", "set", "org.gnome.shell"]
        subprocess.run(gs + ["enabled-extensions", f"['rig@test', '{UUID}']"], env=self.env, check=True)
        subprocess.run(gs + ["disable-user-extensions", "false"], env=self.env, check=True)
        subprocess.run(gs + ["welcome-dialog-last-shown-version", "99.0"], env=self.env, check=True)

        shell = subprocess.Popen(
            ["gnome-shell", "--headless", "--wayland", "--no-x11", "--virtual-monitor", self.size],
            stdout=open(self.log, "w"), stderr=subprocess.STDOUT, env=self.env)
        self.procs.append(shell)
        self.env["WAYLAND_DISPLAY"] = "wayland-0"
        deadline = time.time() + 40
        while time.time() < deadline:
            if shell.poll() is not None:
                raise SystemExit(f"gnome-shell exited early:\n{self.log.read_text()[-3000:]}")
            r = subprocess.run(["gdbus", "call", "--session", "-d", "org.gnome.Shell", "-o", "/org/gnome/Shell",
                                "-m", "org.freedesktop.DBus.Properties.Get", "org.gnome.Shell", "ShellVersion"],
                               env=self.env, capture_output=True, text=True)
            if r.returncode == 0:
                break
            time.sleep(0.3)
        else:
            raise SystemExit("gnome-shell did not come up")
        time.sleep(2)
        self.js("Main.overview.hide(); 1")
        time.sleep(0.8)
        assert "ready" in self.js(INPUT_JS)

    @staticmethod
    def shell_major():
        out = subprocess.run(["gnome-shell", "--version"], capture_output=True, text=True).stdout
        return out.split()[-1].split(".")[0]

    def stop(self):
        for p in reversed(self.procs):
            p.send_signal(signal.SIGTERM)
        for p in self.procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- helpers ------------------------------------------------------------

    def js(self, code):
        r = subprocess.run(["gdbus", "call", "--session", "-d", "org.gnome.Shell", "-o", "/org/gnome/Shell",
                            "-m", "org.gnome.Shell.Eval", code], env=self.env, capture_output=True, text=True)
        out = r.stdout.strip()
        if not out.startswith("(true"):
            raise RuntimeError(f"shell eval failed: {out or r.stderr}\n  code: {code[:200]}")
        # Eval answers (true, '<json>') in GVariant text form, quoted like a Python string
        inner = ast.literal_eval(out[len("(true, "):-1])
        return json.loads(inner) if inner else None

    def t(self, call, wait=0.25):
        self.js(f"global._t.{call}; 1")
        time.sleep(wait)

    def keys(self, *names, wait=0.4):
        self.js("const C = imports.gi.Clutter; global._t.chord(%s); 1" % ", ".join(f"C.KEY_{n}" for n in names))
        time.sleep(wait)

    def cmd(self, method, *args):
        r = subprocess.run(["gdbus", "call", "--session", "-d", "org.gnome.Shell", "-o", OBJ,
                            "-m", f"{IFACE}.{method}", *args], env=self.env, capture_output=True, text=True)
        return r.stdout.strip()

    def state(self):
        return json.loads(self.js("global._t.ext()._automation.GetState()"))

    def overlay(self, expr):
        return self.js(f"((o) => {expr})(global._t.ext().overlay)")

    def shot(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / f"{name}.png"
        path.unlink(missing_ok=True)
        subprocess.run(["gdbus", "call", "--session", "-d", "org.gnome.Shell.Screenshot",
                        "-o", "/org/gnome/Shell/Screenshot", "-m", "org.gnome.Shell.Screenshot.Screenshot",
                        "false", "false", str(path)], env=self.env, capture_output=True)

    def open_probe(self, mode=""):
        subprocess.run(["pkill", "-f", "probe-app.js"])
        time.sleep(0.3)
        self.probe_log.write_text("")
        p = subprocess.Popen(["gjs", "-m", str(ROOT / "tests/probe-app.js"), str(self.probe_log), mode],
                             env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.procs.append(p)
        deadline = time.time() + 15
        while "ready" not in self.probe_log.read_text() and time.time() < deadline:
            time.sleep(0.2)
        time.sleep(1.2)
        # the first click after a window appears only gives it pointer focus on some shells
        self.t("move(600, 400)")
        self.t("move(610, 410)")
        self.t("click()")
        self.t("move(620, 420)")
        self.probe_log.write_text("")

    def probe(self, clear=True):
        """What the window underneath received since the last call."""
        time.sleep(0.15)
        lines = [line for line in self.probe_log.read_text().split("\n") if line]
        if clear:
            self.probe_log.write_text("")
        return lines

    def errors(self):
        text = self.log.read_text()
        return [line for line in text.split("\n") if "JS ERROR" in line or ("CRITICAL" in line and "manicule" in line.lower())]


class Results:
    def __init__(self):
        self.failed = []
        self.count = 0

    def check(self, name, ok, detail=""):
        self.count += 1
        print(f"  {'ok  ' if ok else 'FAIL'} {name}" + (f"   [{detail}]" if detail and not ok else ""))
        if not ok:
            self.failed.append(name)


def run(rig, r):
    presses = lambda lines: [x for x in lines if x.startswith("press")]
    scrolls = lambda lines: [x for x in lines if x.startswith("scroll ")]

    print("loading")
    st = rig.state()
    r.check("extension loads and answers on D-Bus", st["active"] is False and len(st["pointers"]) >= 20, st)
    rig.open_probe()
    rig.t("click()")
    r.check("with the pointer off, clicks reach the window", len(presses(rig.probe())) == 1)

    print("turning on")
    rig.cmd("On")
    time.sleep(1.4)
    r.check("On turns the pointer on", rig.state()["active"] is True)
    r.check("state file is written", json.loads((pathlib.Path(rig.env["XDG_RUNTIME_DIR"]) / "manicule/state.json").read_text())["active"] is True)
    r.check("system cursor is hidden", rig.overlay("o._cursor.hidden") is True)
    rig.shot("01-on")

    print("tap and draw")
    rig.t("move(420, 300)")
    rig.t("click()")
    r.check("a click is a tap: the window gets nothing", presses(rig.probe()) == [])
    rig.t("click(3)")
    r.check("right-clicks are taps too", presses(rig.probe()) == [])
    rig.js("global._t.ext().overlay._settings.set_double('fade-seconds', 0); 1")
    rig.t("move(300, 220)")
    rig.t("down()", 0.1)
    rig.t("glide([[300, 220], [420, 180], [560, 280], [700, 210]], 300)", 0.6)
    rig.shot("02-drawing")
    r.check("dragging draws", rig.overlay("o._ink.isDrawing") is True)
    rig.t("up()")
    r.check("the stroke stays when the button is released", rig.overlay("o.inkStrokes") == 1)
    r.check("drawing never clicks the window", presses(rig.probe()) == [])

    print("scrolling")
    rig.t("move(640, 420)")
    rig.t("scroll(14)", 0.45)
    got = scrolls(rig.probe())
    r.check("touchpad scrolling passes through, same distance", len(got) == 1 and got[0].endswith(",13.98") or got == ["scroll 0.00,14.00"], got)
    rig.t("wheel(imports.gi.Clutter.ScrollDirection.DOWN)", 0.1)
    r.check("scrolling opens the hand", rig.overlay("o._arm._pose") == "open")
    rig.shot("03-scrolling")
    time.sleep(0.4)
    got = scrolls(rig.probe())
    r.check("a wheel click passes through exactly once", got == ["scroll 0.00,1.00"], got)
    time.sleep(0.3)
    rig.t("click()")
    r.check("a click right after scrolling is still a tap", presses(rig.probe()) == [])
    time.sleep(0.9)
    r.check("the hand points again once scrolling stops", rig.overlay("o._arm._pose") == "point")

    print("clicking for real")
    rig.js("const C = imports.gi.Clutter; global._t.key(C.KEY_Alt_L, true); 1")
    time.sleep(0.3)
    rig.t("click()")
    r.check("holding Alt lets a click through", len(presses(rig.probe())) == 1)
    r.check("and brings the normal cursor back meanwhile", rig.overlay("o._cursor.hidden") is False)
    rig.js("const C = imports.gi.Clutter; global._t.key(C.KEY_Alt_L, false); 1")
    time.sleep(0.3)
    rig.t("click()")
    r.check("releasing Alt makes clicks taps again", presses(rig.probe()) == [])

    rig.keys("Control_L", "Alt_L", "c")
    r.check("Ctrl+Alt+C turns click-through on", rig.state()["clickThrough"] is True)
    rig.t("click()")
    r.check("in click-through, clicks reach the window", len(presses(rig.probe())) == 1)
    rig.shot("04-click-through")
    rig.keys("Escape")
    r.check("in click-through, Esc belongs to the app", rig.state()["active"] is True and "key Escape" in rig.probe())
    rig.keys("Control_L", "Alt_L", "c")
    r.check("Ctrl+Alt+C turns click-through off", rig.state()["clickThrough"] is False)

    print("shortcuts")
    r.check("ink is still there", rig.overlay("o.inkStrokes") == 1)
    rig.keys("Control_L", "Alt_L", "x")
    r.check("Ctrl+Alt+X clears the drawing", rig.overlay("o.inkStrokes") == 0)
    rig.probe()
    rig.keys("Escape", wait=0.7)
    r.check("Esc turns the pointer off", rig.state()["active"] is False)
    r.check("and the app never sees that Esc", "key Escape" not in rig.probe())
    r.check("the cursor is back", rig.overlay("o._cursor.hidden") is False)
    rig.keys("Control_L", "Alt_L", "h", wait=1.2)
    r.check("Ctrl+Alt+H turns it on", rig.state()["active"] is True)
    rig.js("global._t.ext().overlay._settings.reset('fade-seconds'); 1")

    print("top bar")
    box = rig.js("(() => { const a = Main.panel.statusArea['%s']; const [x, y] = a.get_transformed_position(); return [x + a.width / 2, y + a.height / 2]; })()" % UUID)
    rig.t(f"move({box[0]}, {box[1]})")
    rig.t("click()", 0.7)
    r.check("clicking the top-bar hand turns the pointer off", rig.state()["active"] is False)
    rig.t("click()", 1.2)
    r.check("and on again", rig.state()["active"] is True)
    rig.t("click(3)", 0.6)
    r.check("right-click opens the menu", rig.js("Main.panel.statusArea['%s'].menu.isOpen" % UUID) is True)
    rig.shot("05-menu")
    rig.keys("Escape")
    r.check("Esc closes the menu, not the pointer", rig.state()["active"] is True)

    print("every pointer")
    rig.t("move(640, 380)")
    bad = []
    for p in rig.state()["pointers"]:
        if "true" not in rig.cmd("SetPointer", p["id"]):
            bad.append(p["id"])
        time.sleep(0.25)
        rig.t("click()", 0.1)
        rig.t("move(660, 390)", 0.1)
        rig.t("move(640, 380)", 0.1)
        if rig.state()["pointer"] != p["id"]:
            bad.append(p["id"])
    r.check("all pointers can be selected and tapped", bad == [], bad)
    r.check("an unknown pointer is refused", "false" in rig.cmd("SetPointer", "nope"))
    for name in ("wand", "laser", "spotlight", "vermilion"):
        rig.cmd("SetPointer", name)
        time.sleep(1.0)
        rig.shot(f"06-{name}")

    print("your own pointer")
    png = rig.tmp / "carrot.png"
    subprocess.run(["rsvg-convert", "-w", "300", str(ROOT / "tests/carrot.svg"), "-o", str(png)], check=True)
    made = subprocess.run(["gjs", "-m", str(ROOT / "tests/import-pointer.js"), str(png)], env=rig.env, capture_output=True, text=True)
    r.check("an image is measured and imported", made.returncode == 0, made.stderr[-300:])
    if made.returncode == 0:
        pointer = json.loads(made.stdout)
        tip, wrist = pointer["poses"]["point"]["tip"], pointer["poses"]["point"]["wrist"]
        r.check("tip at the top, wrist at the bottom, both centred", abs(tip[0] - 0.5) < 0.06 and tip[1] < 0.1 and wrist[1] > 0.9 and abs(wrist[0] - 0.5) < 0.06, (tip, wrist))
        subprocess.run(["gsettings", "--schemadir", str(rig.tmp / "home/.local/share/gnome-shell/extensions" / UUID / "schemas"), "set",
                        "org.gnome.shell.extensions.manicule", "custom-pointers", json.dumps([pointer])], env=rig.env, check=True)
        time.sleep(0.4)
        r.check("the new pointer can be used", "true" in rig.cmd("SetPointer", pointer["id"]) and rig.state()["pointer"] == pointer["id"])
        time.sleep(1.0)
        rig.t("move(640, 360)")
        rig.shot("06-custom")
        bad = subprocess.run(["gjs", "-m", str(ROOT / "tests/import-pointer.js"), str(ROOT / "docs/assets/og.png")], env=rig.env, capture_output=True, text=True)
        r.check("an image without transparency is refused with a reason", bad.returncode != 0 and "transparent" in bad.stderr)
        rig.cmd("SetPointer", "vermilion")
        time.sleep(0.5)

    print("keeping and erasing ink")
    def draw(y=220):
        rig.t(f"move(300, {y})")
        rig.t("down()", 0.1)
        rig.t(f"glide([[300, {y}], [500, {y + 40}], [700, {y}]], 200)", 0.45)
        rig.t("up()")

    def button(name):
        rig.t("move(640, 770)", 0.6)
        x, y = rig.overlay("(() => { const b = o._toolbar.%s; const [x, y] = b.get_transformed_position(); return [x + b.width / 2, y + b.height / 2]; })()" % name)
        rig.t(f"move({x}, {y})")
        rig.t("click()", 0.4)

    rig.cmd("SetPointer", "vermilion")
    time.sleep(0.6)
    rig.js("global._t.ext().overlay._settings.set_double('fade-seconds', 0.6); 1")
    draw()
    r.check("a drawing is there right after drawing", rig.overlay("o.inkStrokes") == 1)
    time.sleep(2.2)
    r.check("and fades away on its own", rig.overlay("o.inkStrokes") == 0)
    button("_keepButton")
    r.check("the pin button in the toolbar turns on keeping", rig.state()["keepInk"] is True)
    draw()
    draw(300)
    time.sleep(2.2)
    r.check("kept drawings do not fade", rig.overlay("o.inkStrokes") == 2)
    r.check("toolbar clicks never reach the window", presses(rig.probe()) == [])
    button("_clearButton")
    r.check("the eraser button removes everything", rig.overlay("o.inkStrokes") == 0)
    draw()
    button("_keepButton")
    r.check("the pin button turns keeping off again", rig.state()["keepInk"] is False)
    time.sleep(2.2)
    r.check("and what was kept then fades", rig.overlay("o.inkStrokes") == 0)

    print("special pointers")
    rig.cmd("SetKeepInk", "on")
    rig.cmd("SetPointer", "magician")
    time.sleep(0.6)
    draw()
    draw(320)
    rig.t("move(900, 300)")
    rig.t("click()", 0.12)
    rig.t("click()", 0.9)
    r.check("magician's glove: a double tap snaps every drawing away", rig.overlay("o.inkStrokes") == 0)
    rig.cmd("SetKeepInk", "off")
    rig.cmd("SetPointer", "lobster")
    time.sleep(0.6)
    rig.t("move(600, 300)")
    rig.t("down()", 0.35)
    r.check("lobster claw: closes while the button is held", rig.overlay("o._arm._pose") == "press")
    rig.t("up()", 0.7)
    r.check("and opens again", rig.overlay("o._arm._pose") == "point")
    rig.cmd("SetPointer", "neuron")
    time.sleep(0.6)
    r.check("pyramidal neuron: draws spike trains instead of plain lines", rig.overlay("o._ink.style") == "spikes")
    rig.t("click()", 0.15)
    rig.shot("06-neuron")
    rig.cmd("SetPointer", "electrode")
    time.sleep(0.6)
    r.check("other pointers draw plain lines again", rig.overlay("o._ink.style") is None)
    rig.t("click()", 0.15)
    rig.shot("06-electrode")
    rig.cmd("SetPointer", "boxing")
    time.sleep(0.6)
    rig.t("click()", 0.12)
    rig.shot("06-boxing")
    rig.cmd("SetPointer", "swatter")
    time.sleep(0.6)
    rig.t("click()", 0.2)
    rig.t("move(700, 380)", 0.3)
    rig.shot("06-swatter")
    rig.js("global._t.ext().overlay._settings.reset('fade-seconds'); 1")
    rig.cmd("SetPointer", "vermilion")
    time.sleep(0.5)

    print("command line")
    cli = lambda *a: subprocess.run([str(ROOT / "bin/manicule"), *a], env=rig.env, capture_output=True, text=True)
    cli("off")
    time.sleep(0.6)
    r.check("manicule off", rig.state()["active"] is False)
    cli("manicule://on")
    time.sleep(1.2)
    r.check("a manicule://on link turns it on", rig.state()["active"] is True)
    r.check("manicule state prints JSON", json.loads(cli("state").stdout)["active"] is True)
    r.check("manicule list names the pointers", "wand\tMagic wand" in cli("list").stdout)
    cli("manicule://pointer/robot")
    time.sleep(0.5)
    r.check("a manicule://pointer/<id> link switches pointer", rig.state()["pointer"] == "robot")
    r.check("an unknown pointer exits with an error", cli("pointer", "nope").returncode == 2)
    cli("ink", "keep")
    r.check("manicule ink keep", rig.state()["keepInk"] is True)
    cli("manicule://ink/fade")
    r.check("a manicule://ink/fade link", rig.state()["keepInk"] is False)
    cli("pointer", "vermilion")
    time.sleep(0.5)

    print("fullscreen")
    rig.open_probe("fullscreen")
    full = rig.js("global.display.focus_window.is_fullscreen()") is True
    r.check("the window underneath is fullscreen", full)
    r.check("the hand is still shown above it", rig.overlay("o._group.mapped && o._group.get_parent().get_last_child() === o._group") is True)
    rig.t("move(500, 300)")
    rig.t("click()")
    r.check("fullscreen: a click is a tap", presses(rig.probe()) == [])
    rig.t("wheel(imports.gi.Clutter.ScrollDirection.DOWN)", 0.5)
    r.check("fullscreen: scrolling passes through", scrolls(rig.probe()) == ["scroll 0.00,1.00"])
    rig.keys("Right")
    r.check("fullscreen: arrow keys reach the presentation", "key Right" in rig.probe())
    rig.shot("07-fullscreen")

    print("cleaning up")
    rig.js("Main.extensionManager.disableExtension('%s'); 1" % UUID)
    time.sleep(0.8)
    left = rig.js("Main.layoutManager.uiGroup.get_children().filter(c => (c.name || '').startsWith('manicule')).length")
    r.check("disabling removes every actor", left == 0, left)
    rig.t("click()")
    r.check("and clicks reach windows again", len(presses(rig.probe())) == 1)
    rig.js("Main.extensionManager.enableExtension('%s'); 1" % UUID)
    time.sleep(0.8)
    r.check("it can be enabled again", rig.state()["active"] is False)
    errs = rig.errors()
    r.check("no JavaScript errors in the shell log", errs == [], errs[:3])


def main():
    keep = "--keep" in sys.argv
    rig = Rig()
    r = Results()
    try:
        rig.start()
        run(rig, r)
    finally:
        if keep:
            print(f"\nshell left running; env in {rig.tmp}")
        else:
            rig.stop()
    print(f"\n{r.count - len(r.failed)}/{r.count} checks passed" + (f"; failed: {', '.join(r.failed)}" if r.failed else ""))
    sys.exit(1 if r.failed else 0)


if __name__ == "__main__":
    main()
