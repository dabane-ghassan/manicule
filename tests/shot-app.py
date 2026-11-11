#!/usr/bin/env python3
"""Opens the Manicule app window in the headless test shell and saves screenshots of each page.

    python3 tests/shot-app.py [WxH]
"""
import subprocess
import sys
import time
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import run as R

rig = R.Rig(sys.argv[1] if len(sys.argv) > 1 else "1280x800")
rig.start()
try:
    ext = rig.tmp / "home/.local/share/gnome-shell/extensions" / R.UUID
    p = subprocess.Popen(["gjs", "-m", str(ext / "app.js")], env=rig.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    rig.procs.append(p)
    time.sleep(5)
    if p.poll() is not None:
        print(p.stdout.read()[-3000:])
        raise SystemExit("the app exited")
    box = rig.js("(() => { const a = global.get_window_actors().find(w => w.meta_window.get_wm_class() === 'io.github.dabane_ghassan.Manicule'); const r = a.meta_window.get_frame_rect(); return [r.x, r.y, r.width, r.height]; })()")
    print("window", box)
    x, y, w, h = box
    rig.shot("app-home")
    for i, name in enumerate(["pointers", "look", "controls", "sound", "about"], start=1):
        rig.t(f"move({x + 100}, {y + 76 + i * 44})")
        rig.t("click()", 0.9)
        rig.shot(f"app-{name}")
    rig.t(f"move({x + 100}, {y + 76})")
    rig.t("click()", 0.6)
    rig.cmd("On")
    time.sleep(1.5)
    rig.t(f"move({x + w - 200}, {y + 300})")
    rig.shot("app-home-on")
    rig.cmd("Off")
    time.sleep(0.5)
    print("shell errors:", rig.errors()[:3])
    import os
    os.set_blocking(p.stdout.fileno(), False)
    try:
        print("app output:", (p.stdout.read() or "")[-1500:])
    except TypeError:
        print("app output: (none)")
finally:
    rig.stop()
