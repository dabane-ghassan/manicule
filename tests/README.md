# Tests

`python3 tests/run.py` (or `make test`) starts a private, headless GNOME Shell, loads the
extension from this checkout and drives it with simulated mouse and keyboard input. A plain
GTK window (`probe-app.js`) sits underneath and logs every click, scroll and key it receives,
so the tests can tell what Manicule swallowed and what it let through. Screenshots are saved
to `tests/out/`.

You need `gnome-shell`, `gjs`, GTK 4 and `rsvg-convert`. Nothing touches your own session or
settings: the run uses a temporary home folder and its own D-Bus.

In a container there is usually no system bus and no login manager. Start one bus with
`dbus-daemon --system --fork`, and if GNOME Shell exits complaining about the login manager,
move an empty `/run/systemd/seats` out of the way.

Two things the headless shell cannot show: sound, and the exact pacing of the shell's own
fade animations (it draws frames as fast as it can instead of at the screen's refresh rate).
