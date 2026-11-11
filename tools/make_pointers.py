#!/usr/bin/env python3
"""Draws every Manicule pointer as an SVG and writes the manifest the extension reads.

All artwork here is original to Manicule. Each pointer lives on a 240x240 canvas.
The manifest records, per pose, where the tip (the hotspot) and the wrist (where the
stick attaches) sit on that canvas, so the extension can aim the hand without measuring
pixels at runtime.

    python3 tools/make_pointers.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "extension" / "assets" / "pointers"
CANVAS = 240
LW = 6.0


def capsule(x, y, w, h, rot=0.0):
    """A pill, optionally rotated about its own centre."""
    r = min(w, h) / 2
    t = f' transform="rotate({rot:g} {x + w / 2:g} {y + h / 2:g})"' if rot else ""
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r:g}"{t}/>'


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" '
        f'width="{CANVAS}" height="{CANVAS}">'
        + (f"<defs>{defs}</defs>" if defs else "")
        + body
        + "</svg>\n"
    )


def merged(shapes, fill, line, lw=LW):
    """Stroke everything, then fill everything: one silhouette with a single outer outline."""
    s = "".join(shapes)
    return (
        f'<g fill="{line}" stroke="{line}" stroke-width="{lw * 2:g}" stroke-linejoin="round">{s}</g>'
        f'<g fill="{fill}">{s}</g>'
    )


def shadow_svg(shapes):
    s = "".join(shapes)
    defs = '<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>'
    return svg(
        f'<g filter="url(#b)" fill="#000" stroke="#000" stroke-width="{LW * 2:g}" stroke-linejoin="round">{s}</g>',
        defs,
    )


# ---------------------------------------------------------------- hands

BODY = (
    '<path d="M72 142 Q72 114 98 114 L152 114 Q180 114 180 142 L177 170 '
    'Q174 197 148 197 L104 197 Q78 197 75 170 Z"/>'
)
CUFF = '<rect x="85" y="186" width="70" height="30" rx="11"/>'

HAND_POSES = {
    # tip = hotspot, wrist = where the stick meets the cuff
    "point": {
        "fingers": [capsule(80, 24, 32, 130)],
        "knuckles": [capsule(113, 92, 27, 60), capsule(137, 98, 25, 56), capsule(158, 107, 21, 48)],
        "thumb": capsule(53, 114, 28, 66, -13),
        "creases": [
            "M112.5 104 L112.5 130",
            "M138 108 L138 128",
            "M159.5 116 L159.5 130",
            "M84 126 Q88 150 84 172",
        ],
        "shine": [capsule(87, 34, 8, 46)],
        "tip": (96, 21),
    },
    "open": {
        "fingers": [
            capsule(73, 46, 27, 110),
            capsule(99, 28, 28, 126),
            capsule(126, 38, 27, 116),
            capsule(152, 62, 24, 92),
        ],
        "knuckles": [],
        "thumb": capsule(40, 112, 27, 68, -40),
        "creases": [
            "M99.5 60 L99.5 130",
            "M126.5 52 L126.5 130",
            "M152.5 76 L152.5 130",
            "M80 134 Q86 152 84 172",
        ],
        "shine": [capsule(79, 56, 7, 38), capsule(106, 38, 7, 42), capsule(132, 48, 7, 38)],
        "tip": (113, 25),
    },
}
HAND_WRIST = (120, 214)

SKINS = [
    # id, title, fill, shade, light, line, cuff, rod, ink, extras
    ("vermilion", "Vermilion", "#E5482D", "#B8321C", "#FF8E76", "#1B1A17", "#F4EDE0", "#1B1A17", "#E5482D", {}),
    ("parchment", "Parchment", "#FBF6EC", "#DDD3BF", "#FFFFFF", "#1B1A17", "#E5482D", "#1B1A17", "#1B1A17", {}),
    ("ink", "Ink", "#24222B", "#121117", "#5B5868", "#0B0A0E", "#F4EDE0", "#F4EDE0", "#24222B", {}),
    ("lilac", "Lilac", "#B49CF2", "#8F74D6", "#DDD0FF", "#231A3D", "#F4EDE0", "#231A3D", "#8754F2", {}),
    ("mint", "Mint", "#6FD6A8", "#43B383", "#C2F5DE", "#103526", "#F4EDE0", "#103526", "#16A87A", {}),
    ("sky", "Sky", "#6CB6F5", "#3F8FDB", "#C6E4FF", "#10294A", "#F4EDE0", "#10294A", "#2F86F0", {}),
    ("sunflower", "Sunflower", "#FFCB3D", "#E8A317", "#FFEDA8", "#3D2A00", "#F4EDE0", "#3D2A00", "#F2B705", {}),
    ("bubblegum", "Bubblegum", "#FF8FC1", "#E8609C", "#FFD0E5", "#4A1030", "#F4EDE0", "#4A1030", "#EE4F98", {}),
    ("robot", "Robot", "#C3CAD3", "#8E98A6", "#EEF2F6", "#262B33", "#FFC400", "#7C8794", "#16A87A", {"robot": True}),
    ("zombie", "Zombie", "#A5C873", "#7FA24E", "#D3EBAE", "#22301A", "#6B4A32", "#3A2A1C", "#3E9E2E", {"zombie": True}),
    ("neon", "Neon", "#15121F", "#0C0A14", "#3C3558", "#3DF4FF", "#FF3DCB", "#3DF4FF", "#E0309A", {"neon": True}),
    ("gold", "Gold", "url(#gold)", "#D18A0A", "#FFF7C9", "#6A3F00", "#FFF4D6", "#B7791F", "#F2B705", {"gold": True}),
    ("scribe", "Scribe", "#F3E9D2", "#D9C9A6", "#FFFDF6", "#5B3A1E", "#F3E9D2", "#5B3A1E", "#5B3A1E", {"scribe": True}),
]


def hand(skin, pose_name):
    sid, _title, fill, shade, light, line, cuff, _rod, _ink, extra = skin
    pose = HAND_POSES[pose_name]
    lw = 4.6 if extra.get("scribe") else LW
    shapes = pose["knuckles"] + pose["fingers"] + [BODY, pose["thumb"]]
    defs = ""
    out = ""

    if extra.get("gold"):
        defs += (
            '<linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="70" y1="20" x2="180" y2="200">'
            '<stop offset="0" stop-color="#FFE98A"/><stop offset=".55" stop-color="#F5B82E"/>'
            '<stop offset="1" stop-color="#D98E0B"/></linearGradient>'
        )
    if extra.get("neon"):
        defs += '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>'
        s = "".join(shapes) + CUFF
        out += (
            f'<g filter="url(#glow)" fill="none" stroke="{line}" stroke-width="{lw * 2:g}" '
            f'stroke-linejoin="round" opacity=".85">{s}</g>'
        )

    out += merged(shapes, fill, line, lw)

    # soft shading on the lower right of the fist, clipped to the fist
    defs += f'<clipPath id="fist">{BODY}</clipPath>'
    out += (
        f'<g clip-path="url(#fist)"><path d="M190 120 Q186 206 104 204 L104 197 Q160 196 168 120 Z" '
        f'fill="{shade}" opacity=".85"/><ellipse cx="103" cy="140" rx="15" ry="8" '
        f'transform="rotate(-18 103 140)" fill="{light}" opacity=".5"/></g>'
    )
    for s in pose["shine"]:
        out += f'<g fill="{light}" opacity=".6">{s}</g>'

    crease_w = lw * 0.62
    out += (
        f'<g fill="none" stroke="{line}" stroke-width="{crease_w:g}" stroke-linecap="round" '
        f'opacity="{0.5 if not extra.get("neon") else 0.9}">'
        + "".join(f'<path d="{d}"/>' for d in pose["creases"])
        + "</g>"
    )

    if extra.get("robot"):
        joints = ""
        for f in pose["fingers"]:
            # read x/y/w/h back out of the capsule to place two joint lines
            parts = dict(p.split("=") for p in f.replace('"', "").replace("/>", "").split()[1:5])
            x, y, w, h = (float(parts[k]) for k in ("x", "y", "width", "height"))
            for frac in (0.3, 0.55):
                yy = y + h * frac
                if yy < 108:
                    joints += f'<path d="M{x + 3:g} {yy:g} L{x + w - 3:g} {yy:g}"/>'
        out += f'<g fill="none" stroke="{line}" stroke-width="3.4" stroke-linecap="round" opacity=".7">{joints}</g>'
        for cx, cy in ((92, 176), (158, 176), (158, 134)):
            out += (
                f'<circle cx="{cx}" cy="{cy}" r="5.2" fill="{light}" stroke="{line}" stroke-width="2.6"/>'
                f'<path d="M{cx - 2.6} {cy} L{cx + 2.6} {cy}" stroke="{line}" stroke-width="2"/>'
            )
        out += '<circle cx="126" cy="156" r="8" fill="#FF4B3A" stroke="#262B33" stroke-width="3"/><circle cx="123.5" cy="153.5" r="2.6" fill="#FFD2CC"/>'
    if extra.get("zombie"):
        out += (
            f'<g fill="none" stroke="{line}" stroke-width="3.2" stroke-linecap="round">'
            '<path d="M104 136 L150 168"/><path d="M110 148 L118 137"/><path d="M122 156 L130 145"/>'
            '<path d="M134 164 L142 153"/></g>'
            '<rect x="134" y="118" width="26" height="15" rx="3" transform="rotate(12 147 125)" '
            f'fill="#E9DDBE" stroke="{line}" stroke-width="3"/>'
            '<g fill="#6E8E43" opacity=".8"><circle cx="92" cy="176" r="4.5"/><circle cx="166" cy="150" r="3.5"/>'
            '<circle cx="96" cy="70" r="3.5"/></g>'
        )
    if extra.get("gold"):
        star = "M0 -11 L2.6 -2.6 L11 0 L2.6 2.6 L0 11 L-2.6 2.6 L-11 0 L-2.6 -2.6 Z"
        out += (
            f'<path d="{star}" transform="translate(150 140)" fill="#FFFDF0"/>'
            f'<path d="{star}" transform="translate(96 60) scale(.6)" fill="#FFFDF0"/>'
        )
    if extra.get("scribe"):
        out += (
            f'<g clip-path="url(#fist)" fill="none" stroke="{line}" stroke-width="1.7" stroke-linecap="round" opacity=".55">'
            + "".join(f'<path d="M{150 + i * 7} 196 L{178 + i * 7} 150"/>' for i in range(-3, 2))
            + "</g>"
        )

    # cuff on top, with its own outline
    if extra.get("scribe"):
        frill = "M82 190 Q120 180 158 190 L162 208 Q154 218 146 208 Q138 218 130 208 Q122 218 114 208 Q106 218 98 208 Q90 218 82 208 Z"
        out += f'<path d="{frill}" fill="{cuff}" stroke="{line}" stroke-width="{lw:g}" stroke-linejoin="round"/>'
        out += f'<path d="M88 196 Q120 188 152 196" fill="none" stroke="{line}" stroke-width="1.8" opacity=".6"/>'
    else:
        out += f'<g fill="{cuff}" stroke="{line}" stroke-width="{lw:g}" stroke-linejoin="round">{CUFF}</g>'
        if extra.get("robot"):
            out += f'<g fill="{line}">' + "".join(
                f'<path d="M{x} 189 l8 0 l-9 24 l-8 0 z"/>' for x in (100, 118, 136)
            ) + "</g>"
            out += f'<g fill="none" stroke="{line}" stroke-width="{lw:g}" stroke-linejoin="round">{CUFF}</g>'
        else:
            out += f'<path d="M92 207 L148 207" stroke="{line}" stroke-width="2.4" stroke-linecap="round" opacity=".28"/>'
    return svg(out, defs), shapes + [CUFF]


# ---------------------------------------------------------------- objects

def paw():
    line, fur, pad = "#3A2416", "#F2A65A", "#FF9FB0"
    toes = [f'<circle cx="{cx}" cy="{cy}" r="19"/>' for cx, cy in ((83, 88), (107, 66), (133, 66), (157, 88))]
    body = '<path d="M71 120 Q71 84 120 84 Q169 84 169 120 L166 216 L74 216 Z"/>'
    shapes = toes + [body]
    out = merged(shapes, fur, line)
    out += f'<path d="M92 152 Q104 128 120 134 Q136 128 148 152 Q156 178 120 178 Q84 178 92 152 Z" fill="{pad}" stroke="{line}" stroke-width="4" stroke-linejoin="round"/>'
    for cx, cy in ((84, 92), (107, 72), (133, 72), (156, 92)):
        out += f'<ellipse cx="{cx}" cy="{cy}" rx="8" ry="9.5" fill="{pad}" stroke="{line}" stroke-width="3.4"/>'
    out += '<g fill="none" stroke="#C97B32" stroke-width="5" stroke-linecap="round"><path d="M80 198 L96 193"/><path d="M144 193 L160 198"/></g>'
    return svg(out), shapes, {"tip": (120, 44), "wrist": (120, 214)}


def wand():
    line, gold = "#3D2A00", "#FFCB3D"
    import math
    pts = []
    for i in range(10):
        r = 50 if i % 2 == 0 else 22
        a = -math.pi / 2 + i * math.pi / 5
        pts.append(f"{120 + r * math.cos(a):.1f} {74 + r * math.sin(a):.1f}")
    star = f'<path d="M{" L".join(pts)} Z"/>'
    neck = '<rect x="111" y="110" width="18" height="106" rx="5"/>'
    out = f'<g fill="#1B1A17" stroke="#1B1A17" stroke-width="{LW:g}" stroke-linejoin="round">{neck}</g>'
    out += '<rect x="111" y="186" width="18" height="22" fill="#F4EDE0"/>'
    out += f'<g fill="{gold}" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{star}</g>'
    out += '<path d="M104 56 Q112 48 122 50" fill="none" stroke="#FFF3B8" stroke-width="6" stroke-linecap="round"/>'
    s = "M0 -9 L2.2 -2.2 L9 0 L2.2 2.2 L0 9 L-2.2 2.2 L-9 0 L-2.2 -2.2 Z"
    out += f'<path d="{s}" transform="translate(178 40)" fill="{gold}" stroke="{line}" stroke-width="2.4" stroke-linejoin="round"/>'
    out += f'<path d="{s}" transform="translate(58 104) scale(.7)" fill="{gold}" stroke="{line}" stroke-width="3" stroke-linejoin="round"/>'
    return svg(out), [star, neck], {"tip": (120, 21), "wrist": (120, 214)}


def foam():
    line, blue = "#0E2350", "#2F6FED"
    shapes = [capsule(76, 20, 40, 130), '<rect x="62" y="98" width="116" height="118" rx="26"/>', capsule(40, 120, 34, 70, -24)]
    out = merged(shapes, blue, line)
    out += '<g fill="#7FA8FF" opacity=".7">' + capsule(84, 32, 9, 44) + "</g>"
    out += (
        '<text x="124" y="188" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" '
        'font-weight="900" font-size="64" fill="#FFFFFF" stroke="#0E2350" stroke-width="3" paint-order="stroke">#1</text>'
    )
    return svg(out), shapes, {"tip": (96, 17), "wrist": (120, 214)}


def pencil():
    line = "#3D2A00"
    cone = '<path d="M120 18 L146 96 L94 96 Z"/>'
    shaft = '<rect x="94" y="92" width="52" height="124"/>'
    out = f'<g stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round"><g fill="#FFCB3D">{shaft}</g><g fill="#F6D7A7">{cone}</g></g>'
    out += '<path d="M120 18 L130 48 L110 48 Z" fill="#2B2B33" stroke="#3D2A00" stroke-width="3" stroke-linejoin="round"/>'
    out += '<path d="M94 96 Q103 106 111 96 Q120 106 129 96 Q137 106 146 96 L146 92 L94 92 Z" fill="#F6D7A7"/>'
    out += '<path d="M94 96 Q103 106 111 96 Q120 106 129 96 Q137 106 146 96" fill="none" stroke="#3D2A00" stroke-width="3.4" stroke-linejoin="round"/>'
    out += '<rect x="111" y="102" width="18" height="114" fill="#FFE38A"/>'
    out += f'<g fill="none" stroke="{line}" stroke-width="{LW:g}"><path d="M94 92 L94 216"/><path d="M146 92 L146 216"/></g>'
    return svg(out), [cone, shaft], {"tip": (120, 15), "wrist": (120, 214)}


def quill():
    line = "#3A2A1C"
    vane = '<path d="M120 52 Q168 78 160 150 Q156 186 124 206 L120 206 Q82 186 82 136 Q82 82 120 52 Z"/>'
    nib = '<path d="M120 14 L131 50 L109 50 Z"/>'
    stem = '<rect x="115" y="46" width="10" height="170" rx="3"/>'
    out = merged([vane], "#F7F1E3", line)
    out += '<g fill="none" stroke="#C9B994" stroke-width="2.6" stroke-linecap="round">' + "".join(
        f'<path d="M120 {y} Q{140 + (y - 80) * 0.12:.0f} {y - 14} {152 + min(6, (y - 80) * 0.08):.0f} {y - 22}"/>'
        f'<path d="M120 {y} Q102 {y - 12} {90 - min(4, (y - 80) * 0.05):.0f} {y - 18}"/>'
        for y in range(92, 200, 18)
    ) + "</g>"
    out += '<path d="M160 118 L146 124 L160 132" fill="#F4EDE0" stroke="#3A2A1C" stroke-width="4" stroke-linejoin="round"/>'
    out += f'<g fill="#E8DCC0" stroke="{line}" stroke-width="4" stroke-linejoin="round">{stem}</g>'
    out += f'<g fill="#1B1A17" stroke="{line}" stroke-width="4" stroke-linejoin="round">{nib}</g>'
    out += '<path d="M120 26 L120 44" stroke="#F4EDE0" stroke-width="2" stroke-linecap="round"/>'
    return svg(out), [vane, nib, stem], {"tip": (120, 12), "wrist": (120, 214)}


OBJECTS = [
    # id, title, builder, rod colour, rod outline, rod width (canvas units), ink, extras
    ("paw", "Cat paw", paw, "#F2A65A", "#3A2416", 98, "#F2A65A", {"rigid": True}),
    ("wand", "Magic wand", wand, "#1B1A17", "#1B1A17", 24, "#F2B705", {"sparkle": True}),
    ("foam", "Foam finger", foam, "#E9D3A8", "#5B4423", 20, "#2F6FED", {}),
    ("pencil", "Pencil", pencil, "#FFCB3D", "#3D2A00", 58, "#2B2B33", {"rigid": True}),
    ("quill", "Quill", quill, "#E8DCC0", "#3A2A1C", 14, "#1B1A17", {"rigid": True}),
]


def effect_icon(kind):
    if kind == "laser":
        defs = '<radialGradient id="g"><stop offset="0" stop-color="#FFD9D2"/><stop offset=".3" stop-color="#FF2A1F"/><stop offset="1" stop-color="#FF2A1F" stop-opacity="0"/></radialGradient>'
        return svg('<circle cx="120" cy="120" r="78" fill="url(#g)"/><circle cx="120" cy="120" r="26" fill="#FF2A1F"/><circle cx="120" cy="120" r="12" fill="#FFE1DC"/>', defs)
    defs = '<radialGradient id="g"><stop offset=".55" stop-color="#FFF6D8"/><stop offset="1" stop-color="#FFF6D8" stop-opacity="0"/></radialGradient>'
    return svg('<rect x="24" y="24" width="192" height="192" rx="44" fill="#24222B"/><circle cx="120" cy="120" r="70" fill="url(#g)"/>', defs)


def frac(p):
    return [round(p[0] / CANVAS, 4), round(p[1] / CANVAS, 4)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.svg"):
        f.unlink()
    manifest = []

    for pose_name in HAND_POSES:
        _, shapes = hand(SKINS[0], pose_name)
        (OUT / f"hand-{pose_name}.shadow.svg").write_text(shadow_svg(shapes))

    for skin in SKINS:
        sid, title, _fill, _shade, _light, line, _cuff, rod, ink, extra = skin
        poses = {}
        for pose_name, pose in HAND_POSES.items():
            art, _ = hand(skin, pose_name)
            name = f"{sid}-{pose_name}.svg"
            (OUT / name).write_text(art)
            poses[pose_name] = {
                "file": name,
                "shadow": f"hand-{pose_name}.shadow.svg",
                "tip": frac(pose["tip"]),
                "wrist": frac(HAND_WRIST),
            }
        manifest.append({
            "id": sid, "title": title, "kind": "hand", "ink": ink,
            "rod": {"color": rod, "line": line if rod != line else rod, "width": round(13 / CANVAS, 4)},
            "top": round(18 / CANVAS, 4),
            "poses": poses,
            **({"glow": True} if extra.get("neon") else {}),
        })

    for oid, title, build, rod, rod_line, rod_w, ink, extra in OBJECTS:
        art, shapes, geo = build()
        (OUT / f"{oid}.svg").write_text(art)
        (OUT / f"{oid}.shadow.svg").write_text(shadow_svg(shapes))
        manifest.append({
            "id": oid, "title": title, "kind": "object", "ink": ink,
            "rod": {"color": rod, "line": rod_line, "width": round(rod_w / CANVAS, 4)},
            "top": round(geo["tip"][1] / CANVAS, 4),
            "poses": {"point": {"file": f"{oid}.svg", "shadow": f"{oid}.shadow.svg",
                                "tip": frac(geo["tip"]), "wrist": frac(geo["wrist"])}},
            **({"sparkle": True} if extra.get("sparkle") else {}),
            **({"rigid": True} if extra.get("rigid") else {}),
        })

    for kind, title, ink in (("laser", "Laser dot", "#FF2A1F"), ("spotlight", "Spotlight", "#FFCB3D")):
        (OUT / f"{kind}.svg").write_text(effect_icon(kind))
        manifest.append({"id": kind, "title": title, "kind": kind, "ink": ink, "icon": f"{kind}.svg"})

    fx = ROOT / "extension" / "assets" / "effects"
    fx.mkdir(parents=True, exist_ok=True)
    (fx / "spotlight.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs>'
        '<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0B090F" stop-opacity="0"/>'
        '<stop offset=".8" stop-color="#0B090F" stop-opacity="0"/><stop offset="1" stop-color="#0B090F" stop-opacity=".66"/>'
        '</radialGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>\n')
    (fx / "laser.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90" width="90" height="90"><defs>'
        '<radialGradient id="g"><stop offset="0" stop-color="#FF2A1F" stop-opacity=".85"/>'
        '<stop offset=".3" stop-color="#FF2A1F" stop-opacity=".5"/><stop offset=".62" stop-color="#FF2A1F" stop-opacity=".14"/>'
        '<stop offset="1" stop-color="#FF2A1F" stop-opacity="0"/></radialGradient></defs>'
        '<circle cx="45" cy="45" r="45" fill="url(#g)"/><circle cx="45" cy="45" r="10" fill="#FF2A1F"/>'
        '<circle cx="45" cy="45" r="4.6" fill="#FFE1DC"/></svg>\n')
    (fx / "star.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
        '<path d="M24 3 L29 19 L45 24 L29 29 L24 45 L19 29 L3 24 L19 19 Z" fill="#FFD95A" stroke="#FFF7D6" stroke-width="2" stroke-linejoin="round"/></svg>\n')

    (OUT / "pointers.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{len(manifest)} pointers, {len(list(OUT.glob('*.svg')))} svg files -> {OUT}")


if __name__ == "__main__":
    main()
