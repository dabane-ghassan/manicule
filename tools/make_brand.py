#!/usr/bin/env python3
"""Builds the Manicule logo and the images the website needs, from the same hand the app draws.

    python3 tools/make_brand.py        (needs rsvg-convert for the PNG exports)
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import make_pointers as mp  # noqa: E402

INK, PAPER, RED = "#1B1A17", "#F4EDE0", "#E5482D"


def inner(svg_text):
    """The drawing inside an <svg> wrapper, with its <defs> kept."""
    return re.sub(r"^<svg[^>]*>|</svg>\s*$", "", svg_text.strip())


def hand_group(skin_id, pose, transform, uid):
    skin = next(s for s in mp.SKINS if s[0] == skin_id)
    art, _ = mp.hand(skin, pose)
    body = inner(art).replace('id="fist"', f'id="fist{uid}"').replace("url(#fist)", f"url(#fist{uid})")
    rod = skin[7]
    stick = f'<rect x="113.5" y="208" width="13" height="900" rx="6.5" fill="{rod}"/>'
    return f'<g transform="{transform}">{stick}{body}</g>'


def logo(size=256):
    r = round(size * 0.225)
    hand = hand_group("vermilion", "point", "translate(34 26) rotate(-30 120 120) scale(.96)", "a")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="{size}" height="{size}">'
        f'<defs><clipPath id="tile"><rect width="256" height="256" rx="{r * 256 // size}"/></clipPath></defs>'
        f'<g clip-path="url(#tile)"><rect width="256" height="256" fill="{PAPER}"/>'
        f'<path d="M0 196 H256 M0 222 H256" stroke="{INK}" stroke-opacity=".10" stroke-width="3"/>'
        f'<path d="M30 0 V256" stroke="{RED}" stroke-opacity=".55" stroke-width="3"/>'
        f"{hand}</g>"
        f'<rect x="1.5" y="1.5" width="253" height="253" rx="{r * 256 // size - 1}" fill="none" stroke="{INK}" stroke-opacity=".14" stroke-width="3"/>'
        "</svg>\n"
    )


def og():
    left = hand_group("parchment", "point", "translate(-60 400) rotate(24 120 120) scale(1.05)", "b")
    right = hand_group("vermilion", "point", "translate(900 360) rotate(-24 120 120) scale(1.25)", "c")
    lines = "".join(f'<path d="M0 {y} H1200" stroke="{INK}" stroke-opacity=".07" stroke-width="2"/>' for y in range(90, 630, 54))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
        f'<rect width="1200" height="630" fill="{PAPER}"/>{lines}'
        f'<path d="M96 0 V630" stroke="{RED}" stroke-opacity=".5" stroke-width="3"/>'
        f'<text x="150" y="168" font-family="DejaVu Serif, serif" font-size="44" fill="{RED}">Manicule</text>'
        f'<text x="150" y="262" font-family="DejaVu Serif, serif" font-weight="bold" font-size="72" fill="{INK}">A little hand</text>'
        f'<text x="150" y="346" font-family="DejaVu Serif, serif" font-weight="bold" font-size="72" fill="{INK}">for your Linux desktop.</text>'
        f'<text x="150" y="412" font-family="DejaVu Sans Mono, monospace" font-size="26" fill="{INK}" fill-opacity=".62">free · open source · GNOME</text>'
        f"{left}{right}</svg>\n"
    )


def png(svg_path, out, width):
    subprocess.run(["rsvg-convert", "-w", str(width), str(svg_path), "-o", str(out)], check=True)


def main():
    brand = ROOT / "brand"
    site = ROOT / "docs" / "assets"
    icons = ROOT / "extension" / "assets" / "icons"
    for d in (brand, site, icons):
        d.mkdir(parents=True, exist_ok=True)
    (brand / "logo.svg").write_text(logo())
    (icons / "manicule.svg").write_text(logo())
    (site / "mark.svg").write_text(logo())
    (brand / "og.svg").write_text(og())
    png(brand / "logo.svg", brand / "logo-512.png", 512)
    png(brand / "logo.svg", brand / "logo-256.png", 256)
    png(brand / "logo.svg", site / "favicon.png", 64)
    png(brand / "logo.svg", site / "apple-touch-icon.png", 180)
    png(brand / "og.svg", site / "og.png", 1200)
    print("brand assets written")


if __name__ == "__main__":
    main()
