<img src="./brand/logo-256.png" width="80" alt="">

# Manicule

A little hand on a stick that points at things on your Linux screen.

<img src="./.github/screenshot.png" alt="A red cartoon hand on a stick drawing a line over a window" width="720">

<img src="./.github/app.png" alt="The Manicule window: a dark sidebar, the current hand on a stage, and a button to turn it on or off" width="720">

It follows your mouse, taps when you click, draws when you drag, and opens up to stroke the
page along when you scroll. Made for demos, screen recordings and talks, on the GNOME desktop.

**[Website with a live demo](https://dabane-ghassan.github.io/manicule/)**

> Manicule is inspired by [TinyHand](https://tinyhand.app), the original hand on a stick for
> macOS, made by [Kamran Ahmed](https://github.com/nilbuild/tinyhand). The idea, and the way it
> behaves, are his; thank you. Manicule is an independent take on it for Linux: the code, the
> drawings and the sounds here are written from scratch.

## Install

```sh
curl -fsSL https://dabane-ghassan.github.io/manicule/install.sh | sh
```

Then **log out and back in once** so GNOME picks it up. After that, open **Manicule** from
your apps, or click the little hand in the top bar.

It works on any distro with the GNOME desktop, version 45 or later (Fedora 39+, Ubuntu 24.04+,
Debian 13, Arch). Nothing needs root: everything goes under `~/.local`. To remove it, run the
same line with `sh -s -- --remove` at the end.

## Use

| | |
|---|---|
| Click the hand in the top bar, or **Ctrl+Alt+H** | Turn the pointer on or off |
| Right-click the hand in the top bar | Menu: pointer style, sound, open the app |
| Click | Tap (nothing underneath gets clicked) |
| Hold and drag | Draw on the screen |
| Hold **Ctrl** while drawing | Add an arrowhead to the end of the line |
| Scroll | The page scrolls, and the hand strokes it along |
| Hold **Alt** | Click for real while it is held |
| **Ctrl+Alt+C** | Click-through: every click reaches the app, the hand stays |
| **Ctrl+Alt+X** | Clear the drawing |
| **Esc** | Clear everything and turn the pointer off |

While the pointer is on, a small toolbar slides in at the bottom of the screen. Pick a
pointer, change the ink colour, mute the tap sound, toggle click-through, or put the hand away.

It stays on top of fullscreen windows, so it works over slides, videos and HTML presentations.
Keyboard keys always go to the app, so arrow keys still change slides.

### Pointers

Twenty to choose from: thirteen hands (Vermilion, Parchment, Ink, Lilac, Mint, Sky, Sunflower,
Bubblegum, Robot, Zombie, Neon, Gold, Scribe), a cat paw, a magic wand that sheds sparkles, a
foam finger, a pencil, a quill, a laser dot with a trail, and a spotlight that dims everything
but a circle around the mouse.

You can add your own from any PNG with a transparent background, in the Manicule window under
Pointers. Draw it pointing straight up: the topmost point becomes the tip.

### What is different from TinyHand

- The hand opens and strokes the page while you scroll.
- Tap ripples, a springy sway on the stick, and a rise-and-wave when it turns on. Each can be
  switched off, and all of them respect the desktop's "reduce animation" setting.
- Rainbow ink, a spotlight pointer, and object pointers alongside the hands.
- Double-tap Shift for click-through exists but is off by default, with **Ctrl+Alt+C** in its
  place. On Linux Manicule cannot see which other keys you press, so typing `( )` quickly
  could look like a double tap.

## Automation

```sh
manicule toggle            # on, off
manicule clear
manicule pointer wand      # see: manicule list
manicule sound off         # on, off, toggle
manicule through on        # click-through
manicule state             # JSON
```

Links work too, for launchers: `xdg-open manicule://toggle` (`on`, `off`, `clear`,
`pointer/<id>`, `sound/<v>`, `through/<v>`).

While it runs, the current state is mirrored to `$XDG_RUNTIME_DIR/manicule/state.json`:
whether the pointer is on, the selected pointer, sound, click-through, and every pointer with
its id, name and type. The same is available over D-Bus on `org.gnome.Shell` at
`/io/github/dabane_ghassan/Manicule`, which also emits `StateChanged`.

## How it is built, and its limits

Manicule is an app with two parts. The window (GTK 4 and libadwaita), the command and the
installer are ordinary. The hand itself is drawn inside GNOME Shell, because on Wayland only
the shell may draw over every window, hide the cursor and catch clicks. That is also why it is
GNOME only, and why it needs one log-out after installing.

- **Tested on GNOME 46, 49, 50 and 51.** The end-to-end suite in [`tests/`](tests/) runs a real
  headless GNOME Shell and passes on each of them (that covers Fedora 43 to 45 and Ubuntu 24.04
  to 26.10). Versions 45, 47 and 48 are declared as supported but have not been run. The tests
  use simulated input on a virtual screen, not a physical mouse, touchpad or GPU.
- While the pointer is on, apps under it do not see the mouse hover (no hover highlights or
  tooltips) unless you hold Alt or turn on click-through.
- Menus that an app opens get real clicks, so they stay usable.
- The tap sounds are synthesised by a script; I could check their length and loudness but not
  listen to them where this was built.

## Develop

```sh
make assets     # redraw pointers, sounds and logo from tools/
make install    # install for your user from this checkout
make test       # end-to-end tests in a headless GNOME Shell
make dist       # dist/manicule.tar.gz and manicule.shell-extension.zip
```

Everything visual is generated: [`tools/make_pointers.py`](tools/make_pointers.py) draws every
pointer as SVG, [`tools/make_sounds.py`](tools/make_sounds.py) synthesises the taps, and
[`tools/make_brand.py`](tools/make_brand.py) builds the logo. The website lives in [`docs/`](docs/).

## License

MIT. See [LICENSE](LICENSE).
