#!/bin/sh
# Installs Manicule for the current user. No root needed.
#
#   curl -fsSL https://dabane-ghassan.github.io/manicule/install.sh | sh
#
# Works on any distro with the GNOME desktop: it only uses sh, curl and tar.
#   sh install.sh             install from this folder instead (a checkout or an unpacked release)
#   sh install.sh --remove    uninstall
set -eu

UUID="manicule@dabane-ghassan.github.io"
APP="io.github.dabane_ghassan.Manicule"
RELEASE="https://github.com/dabane-ghassan/manicule/releases/latest/download/manicule.tar.gz"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
EXT="$DATA/gnome-shell/extensions/$UUID"
BIN="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }

if [ "${1:-}" = "--remove" ]; then
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    rm -rf "$EXT" "$BIN/manicule" "$DATA/applications/$APP.desktop" \
        "$DATA/icons/hicolor/scalable/apps/$APP.svg"
    say "Manicule removed. Your settings are kept; log out and back in to finish."
    exit 0
fi

command -v gnome-shell >/dev/null 2>&1 || { say "Manicule needs the GNOME desktop (GNOME Shell 45 or later)."; exit 1; }
command -v gjs >/dev/null 2>&1 || say "Note: 'gjs' was not found. The pointer will work, but the Manicule window needs it."

# Find the files: next to this script, or download the latest release.
SRC=""
HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/extension/metadata.json" ]; then
    SRC="$HERE"
else
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    say "Downloading Manicule..."
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$RELEASE" -o "$TMP/manicule.tar.gz"
    else
        wget -q "$RELEASE" -O "$TMP/manicule.tar.gz"
    fi
    tar -xzf "$TMP/manicule.tar.gz" -C "$TMP"
    SRC="$TMP/manicule"
fi

mkdir -p "$EXT" "$BIN" "$DATA/applications" "$DATA/icons/hicolor/scalable/apps"
rm -rf "$EXT"
mkdir -p "$EXT"
cp -R "$SRC/extension/." "$EXT/"
if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas "$EXT/schemas"
fi
install -m 755 "$SRC/bin/manicule" "$BIN/manicule"
sed "s|^Exec=manicule|Exec=$BIN/manicule|" "$SRC/packaging/$APP.desktop" > "$DATA/applications/$APP.desktop"
cp "$SRC/extension/assets/icons/manicule.svg" "$DATA/icons/hicolor/scalable/apps/$APP.svg"
update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
gtk-update-icon-cache -q "$DATA/icons/hicolor" >/dev/null 2>&1 || true

gnome-extensions enable "$UUID" >/dev/null 2>&1 || true

say ""
say "Manicule is installed."
if gdbus call --session --dest org.gnome.Shell --object-path /io/github/dabane_ghassan/Manicule \
        --method io.github.dabane_ghassan.Manicule.GetState >/dev/null 2>&1; then
    say "Log out and back in to load the new version."
else
    say "Log out and back in once so GNOME loads it."
fi
say "Then open Manicule from your apps, click the little hand in the top bar, or press Ctrl+Alt+H."
case ":$PATH:" in
    *":$BIN:"*) ;;
    *) say "(The 'manicule' command is in $BIN, which is not on your PATH yet.)" ;;
esac
