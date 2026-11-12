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
    ("magician", "Magician's glove", "#FFFFFF", "#D3D8E2", "#FFFFFF", "#17161B", "#17161B", "#17161B", "#8754F2", {"magician": True, "fx": "snap"}),
    ("skeleton", "Skeleton", "#F1EEDF", "#CBC5AE", "#FFFFFF", "#2A2924", "#2A2924", "#DDD8C4", "#2A2924", {"skeleton": True}),
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
    if extra.get("magician"):
        # three stitched darts on the back of the glove
        out += (
            f'<g fill="none" stroke="{line}" stroke-width="3" stroke-linecap="round" opacity=".55">'
            '<path d="M106 140 L106 176"/><path d="M126 138 L126 178"/><path d="M146 140 L146 176"/></g>'
        )
    if extra.get("skeleton"):
        joints = ""
        for f in pose["fingers"] + pose["knuckles"]:
            parts = dict(q.split("=") for q in f.replace('"', "").replace("/>", "").split()[1:5])
            x, y, w, h = (float(parts[k]) for k in ("x", "y", "width", "height"))
            for frac_ in (0.28, 0.56):
                yy = y + h * frac_
                if yy < 112:
                    joints += f'<path d="M{x + 2:g} {yy:g} Q{x + w / 2:g} {yy + 5:g} {x + w - 2:g} {yy:g}"/>'
        out += f'<g fill="none" stroke="{line}" stroke-width="3.6" stroke-linecap="round">{joints}</g>'
        out += (
            f'<g fill="{line}" opacity=".8"><ellipse cx="104" cy="150" rx="5" ry="13"/>'
            '<ellipse cx="124" cy="152" rx="5" ry="14"/><ellipse cx="144" cy="152" rx="5" ry="13"/>'
            '<ellipse cx="162" cy="150" rx="4" ry="10"/></g>'
        )
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
            if extra.get("magician"):
                out += '<path d="M90 194 L150 194" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>'
                out += '<circle cx="120" cy="205" r="5" fill="#FFCB3D"/>'
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


def boxing():
    line, red = "#3A0B0B", "#E0322B"
    mitt = '<path d="M72 98 Q72 22 124 22 Q178 22 178 98 L178 148 Q178 172 154 172 L96 172 Q72 172 72 148 Z"/>'
    thumb = capsule(44, 92, 40, 74, -10)
    cuff = '<rect x="84" y="164" width="80" height="52" rx="10"/>'
    out = merged([mitt, thumb], red, line)
    out += '<path d="M150 40 Q168 60 166 96" fill="none" stroke="#FF8A80" stroke-width="9" stroke-linecap="round" opacity=".7"/>'
    out += f'<path d="M84 104 Q84 150 100 160" fill="none" stroke="{line}" stroke-width="4" stroke-linecap="round" opacity=".45"/>'
    out += f'<g fill="#FFF6E6" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{cuff}</g>'
    out += f'<g fill="none" stroke="{line}" stroke-width="3.4" stroke-linecap="round"><path d="M112 176 L136 190"/><path d="M136 176 L112 190"/><path d="M112 192 L136 206"/><path d="M136 192 L112 206"/></g>'
    return svg(out), [mitt, thumb, cuff], {"tip": (124, 19), "wrist": (124, 214)}


def swatter():
    line, lime = "#1F3A12", "#B8E04A"
    head = '<rect x="62" y="16" width="116" height="112" rx="16"/>'
    neck = '<path d="M108 124 L132 124 L127 216 L113 216 Z"/>'
    out = merged([head, neck], lime, line)
    grid = "".join(f'<path d="M{x} 26 L{x} 118"/>' for x in range(82, 170, 19))
    grid += "".join(f'<path d="M72 {y} L168 {y}"/>' for y in range(36, 118, 19))
    out += f'<g fill="none" stroke="{line}" stroke-width="3" opacity=".5">{grid}</g>'
    out += '<path d="M74 30 Q76 24 86 24" fill="none" stroke="#F0FFC0" stroke-width="5" stroke-linecap="round"/>'
    return svg(out), [head, neck], {"tip": (120, 72), "top": 16, "wrist": (120, 214)}


def lobster():
    line, red, dark = "#4A0D0D", "#E8452F", "#B92A1B"
    big = '<path d="M80 152 Q50 98 82 46 Q98 22 118 24 Q110 60 120 92 Q128 122 124 152 Z"/>'
    small_d = "M122 152 Q128 112 123 84 Q121 54 133 34 Q160 60 166 100 Q168 132 160 152 Z"
    palm = '<ellipse cx="121" cy="160" rx="47" ry="32"/>'
    arm = '<rect x="97" y="176" width="48" height="40" rx="13"/>'

    def pose(angle):
        small = f'<path d="{small_d}" transform="rotate({angle} 142 152)"/>'
        shapes = [arm, small, big, palm]
        out = merged(shapes, red, line)
        out += f'<path d="M88 140 Q70 100 90 60" fill="none" stroke="#FF9A85" stroke-width="7" stroke-linecap="round" opacity=".7"/>'
        out += f'<g fill="{dark}" opacity=".8"><circle cx="104" cy="160" r="5"/><circle cx="124" cy="168" r="5"/><circle cx="143" cy="158" r="5"/></g>'
        out += f'<path d="M100 196 L142 196" stroke="{line}" stroke-width="3.4" stroke-linecap="round" opacity=".45"/>'
        return svg(out), shapes

    art, shapes = pose(20)
    return art, shapes, {"tip": (118, 21), "wrist": (121, 214), "press": pose(-3)}


def rocket():
    line = "#1D2433"
    body = '<path d="M120 16 Q160 60 160 122 L160 168 L80 168 L80 122 Q80 60 120 16 Z"/>'
    fin_l = '<path d="M82 128 L50 176 L82 170 Z"/>'
    fin_r = '<path d="M158 128 L190 176 L158 170 Z"/>'
    nozzle = '<path d="M96 166 L144 166 L152 196 L88 196 Z"/>'
    out = f'<g fill="#E0322B" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{fin_l}{fin_r}</g>'
    out += f'<g fill="#5B6577" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{nozzle}</g>'
    out += f'<g fill="#F4F6FA" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{body}</g>'
    out += '<path d="M120 16 Q142 40 152 76 L88 76 Q98 40 120 16 Z" fill="#E0322B"/>'
    out += f'<path d="M88 76 L152 76" stroke="{line}" stroke-width="4"/>'
    out += f'<g fill="none" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{body}</g>'
    out += f'<circle cx="120" cy="112" r="17" fill="#6CB6F5" stroke="{line}" stroke-width="5"/><path d="M110 106 Q114 100 122 100" fill="none" stroke="#DDF0FF" stroke-width="4" stroke-linecap="round"/>'
    out += '<path d="M98 196 Q104 222 120 236 Q136 222 142 196 Z" fill="#FFB02E" stroke="#B04A00" stroke-width="4" stroke-linejoin="round"/><path d="M108 198 Q112 214 120 222 Q128 214 132 198 Z" fill="#FFE98A"/>'
    return svg(out), [body, fin_l, fin_r, nozzle], {"tip": (120, 13), "wrist": (120, 200)}


def pizza():
    line = "#5A2E0C"
    slice_ = '<path d="M120 16 L182 178 Q120 204 58 178 Z"/>'
    crust = '<path d="M54 172 Q120 200 186 172 L190 196 Q120 226 50 196 Z"/>'
    out = f'<g fill="#FFC83D" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{slice_}</g>'
    out += '<path d="M120 40 L160 150 Q120 164 80 150 Z" fill="#FFDD6E" opacity=".7"/>'
    for cx, cy, r in ((120, 78, 11), (100, 132, 13), (142, 126, 12), (122, 160, 9)):
        out += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#D8432B" stroke="{line}" stroke-width="3.4"/>'
    out += '<g fill="#3F8F3A"><rect x="126" y="100" width="12" height="5" rx="2.5" transform="rotate(30 132 102)"/><rect x="96" y="104" width="12" height="5" rx="2.5" transform="rotate(-24 102 106)"/></g>'
    out += f'<g fill="#E0A458" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{crust}</g>'
    out += '<path d="M70 190 Q120 210 170 190" fill="none" stroke="#F6CE94" stroke-width="5" stroke-linecap="round" opacity=".8"/>'
    return svg(out), [slice_, crust], {"tip": (120, 13), "wrist": (120, 214)}


def electrode():
    line = "#1D3557"
    glass = '<path d="M120 12 L140 150 Q140 164 120 164 Q100 164 100 150 Z"/>'
    holder = '<rect x="92" y="156" width="56" height="60" rx="10"/>'
    out = f'<g fill="#CFEAFB" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{glass}</g>'
    out += '<path d="M120 30 L120 160" stroke="#9AA7B5" stroke-width="4" stroke-linecap="round"/>'
    out += '<path d="M112 70 L108 140" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity=".8"/>'
    out += f'<g fill="#3A4A63" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{holder}</g>'
    out += '<rect x="100" y="170" width="40" height="9" rx="4.5" fill="#F2B705"/><circle cx="120" cy="198" r="6" fill="#E5482D"/>'
    return svg(out), [glass, holder], {"tip": (120, 9), "wrist": (120, 214)}


def neuron():
    line, fill = "#3B1466", "#B985F5"
    soma = '<path d="M120 112 L154 176 Q120 192 86 176 Z"/>'
    branches = [
        "M120 118 L120 16",                       # apical dendrite, up to the tip
        "M120 74 Q104 60 96 36", "M120 58 Q138 46 146 24", "M120 92 Q142 84 160 62", "M120 96 Q98 90 82 70",
        "M92 174 Q70 176 52 162", "M148 174 Q170 176 188 162", "M96 168 Q78 188 60 198", "M144 168 Q162 188 180 198",
    ]
    tree = "".join(f'<path d="{d}"/>' for d in branches)
    out = f'<g fill="none" stroke="{line}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">{tree}</g>'
    out += f'<g fill="{line}" stroke="{line}" stroke-width="{LW * 2:g}" stroke-linejoin="round">{soma}</g>'
    out += f'<g fill="none" stroke="{fill}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">{tree}</g>'
    out += f'<g fill="{fill}">{soma}</g>'
    out += '<ellipse cx="120" cy="158" rx="13" ry="11" fill="#6B2FB3"/><circle cx="116" cy="154" r="4" fill="#E9D6FF"/>'
    out += '<rect x="113" y="182" width="14" height="34" rx="5" fill="#B985F5" stroke="#3B1466" stroke-width="5"/>'
    shapes = [soma, '<rect x="114" y="18" width="12" height="198" rx="6"/>']
    return svg(out), shapes, {"tip": (120, 12), "wrist": (120, 214)}


def opto():
    line = "#1B2A49"
    ferrule = '<rect x="98" y="96" width="44" height="120" rx="9"/>'
    fibre = '<rect x="113" y="30" width="14" height="74" rx="5"/>'
    defs = '<radialGradient id="blu"><stop offset="0" stop-color="#BFE3FF"/><stop offset=".35" stop-color="#3D9BFF" stop-opacity=".85"/><stop offset="1" stop-color="#3D9BFF" stop-opacity="0"/></radialGradient>'
    out = '<circle cx="120" cy="30" r="30" fill="url(#blu)"/>'
    out += f'<g fill="#E8EEF6" stroke="{line}" stroke-width="5" stroke-linejoin="round">{fibre}</g>'
    out += f'<g fill="#C9D2DE" stroke="{line}" stroke-width="{LW:g}" stroke-linejoin="round">{ferrule}</g>'
    out += f'<g fill="none" stroke="{line}" stroke-width="3.4" opacity=".5"><path d="M98 126 L142 126"/><path d="M98 186 L142 186"/></g>'
    out += '<path d="M108 108 L108 200" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity=".7"/><circle cx="120" cy="30" r="7" fill="#EAF6FF"/>'
    return svg(out, defs), [ferrule, fibre], {"tip": (120, 26), "top": 12, "wrist": (120, 214)}


OBJECTS = [
    # id, title, builder, rod colour, rod outline, rod width (canvas units), ink, extras
    ("paw", "Cat paw", paw, "#F2A65A", "#3A2416", 98, "#F2A65A", {"rigid": True}),
    ("wand", "Magic wand", wand, "#1B1A17", "#1B1A17", 24, "#F2B705", {"sparkle": True}),
    ("foam", "Foam finger", foam, "#E9D3A8", "#5B4423", 20, "#2F6FED", {}),
    ("pencil", "Pencil", pencil, "#FFCB3D", "#3D2A00", 58, "#2B2B33", {"rigid": True}),
    ("boxing", "Boxing glove", boxing, "#1B1A17", "#1B1A17", 16, "#E0322B", {"fx": "pow"}),
    ("swatter", "Fly swatter", swatter, "#B8E04A", "#1F3A12", 16, "#5C9E1E", {"fx": "splat", "rigid": True}),
    ("lobster", "Lobster claw", lobster, "#E8452F", "#4A0D0D", 26, "#E8452F", {}),
    ("rocket", "Rocket", rocket, "#C9CED8", "#8A93A3", 9, "#FF7A1A", {"sparkle": True, "trail": "flame"}),
    ("pizza", "Pizza slice", pizza, "#D9A066", "#5A2E0C", 16, "#D8432B", {}),
    ("electrode", "Electrode", electrode, "#3A4A63", "#1D3557", 14, "#16A87A", {"fx": "trace"}),
    ("neuron", "Pyramidal neuron", neuron, "#B985F5", "#3B1466", 14, "#8754F2", {"fx": "wave", "inkStyle": "spikes"}),
    ("opto", "Optogenetics fibre", opto, "#2B5FA8", "#1B2A49", 10, "#2F86F0", {"fx": "flash"}),
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
            **({"fx": extra["fx"]} if extra.get("fx") else {}),
        })

    for oid, title, build, rod, rod_line, rod_w, ink, extra in OBJECTS:
        art, shapes, geo = build()
        (OUT / f"{oid}.svg").write_text(art)
        (OUT / f"{oid}.shadow.svg").write_text(shadow_svg(shapes))
        point = {"file": f"{oid}.svg", "shadow": f"{oid}.shadow.svg",
                 "tip": frac(geo["tip"]), "wrist": frac(geo["wrist"])}
        poses = {"point": point}
        if "press" in geo:      # a second drawing shown while the button is held
            art2, shapes2 = geo["press"]
            (OUT / f"{oid}-press.svg").write_text(art2)
            (OUT / f"{oid}-press.shadow.svg").write_text(shadow_svg(shapes2))
            poses["press"] = {**point, "file": f"{oid}-press.svg", "shadow": f"{oid}-press.shadow.svg"}
        manifest.append({
            "id": oid, "title": title, "kind": "object", "ink": ink,
            "rod": {"color": rod, "line": rod_line, "width": round(rod_w / CANVAS, 4)},
            "top": round(geo.get("top", geo["tip"][1]) / CANVAS, 4),
            "poses": poses,
            **{k: extra[k] for k in ("sparkle", "rigid", "fx", "trail", "inkStyle") if extra.get(k)},
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
    import math
    import random
    rnd = random.Random(3)
    burst = " ".join(
        f"{'M' if i == 0 else 'L'}{150 + (140 if i % 2 == 0 else 86 + rnd.uniform(-8, 8)) * math.cos(i * math.pi / 11 - 0.2):.0f} "
        f"{110 + (100 if i % 2 == 0 else 60 + rnd.uniform(-6, 6)) * math.sin(i * math.pi / 11 - 0.2):.0f}"
        for i in range(22)) + " Z"
    (fx / "pow.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 220" width="300" height="220">'
        f'<path d="{burst}" fill="#17161B" transform="translate(6 7)"/>'
        f'<path d="{burst}" fill="#FFD93B" stroke="#17161B" stroke-width="7" stroke-linejoin="round"/>'
        '<text x="150" y="134" text-anchor="middle" font-family="DejaVu Sans, Cantarell, Arial, sans-serif" font-weight="900" '
        'font-size="68" font-style="italic" fill="#E0322B" stroke="#17161B" stroke-width="5" paint-order="stroke" '
        'transform="rotate(-8 150 110)">POW!</text></svg>\n')
    drops = "".join(
        f'<circle cx="{100 + 84 * math.cos(a):.0f}" cy="{100 + 84 * math.sin(a):.0f}" r="{r}"/>'
        for a, r in ((0.3, 8), (1.4, 5), (2.3, 9), (3.5, 6), (4.4, 10), (5.5, 5)))
    blob = " ".join(
        f"{'M' if i == 0 else 'L'}{100 + (62 if i % 2 == 0 else 40) * math.cos(i * math.pi / 7):.0f} "
        f"{100 + (62 if i % 2 == 0 else 40) * math.sin(i * math.pi / 7):.0f}" for i in range(14)) + " Z"
    (fx / "splat.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
        f'<g fill="#7BC043" stroke="#7BC043" stroke-width="22" stroke-linejoin="round"><path d="{blob}"/></g>'
        f'<g fill="#7BC043">{drops}</g>'
        '<ellipse cx="84" cy="82" rx="16" ry="9" fill="#C6F08C" transform="rotate(-30 84 82)"/>'
        '<g fill="#17161B"><ellipse cx="100" cy="104" rx="9" ry="12"/><path d="M92 96 Q76 84 70 96 Q80 104 92 102 Z M108 96 Q124 84 130 96 Q120 104 108 102 Z" fill="#17161B" opacity=".55"/></g>'
        '</svg>\n')
    (fx / "flame.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
        '<circle cx="24" cy="24" r="20" fill="#FF8A1F" opacity=".9"/><circle cx="24" cy="24" r="12" fill="#FFD95A"/></svg>\n')
    (fx / "puff.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
        '<g fill="#FFFFFF" opacity=".92"><circle cx="18" cy="26" r="12"/><circle cx="30" cy="22" r="13"/><circle cx="27" cy="33" r="10"/></g></svg>\n')
    ap = "M14 78 L60 78 L74 70 L84 18 L96 96 L108 74 L122 78 L186 78"
    (fx / "trace.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120">'
        '<rect x="3" y="3" width="194" height="114" rx="16" fill="#10161F" stroke="#2B3A4F" stroke-width="5"/>'
        '<g stroke="#22303F" stroke-width="2"><path d="M14 40 H186"/><path d="M14 78 H186"/><path d="M66 12 V108"/><path d="M134 12 V108"/></g>'
        f'<path d="{ap}" fill="none" stroke="#3DFFA2" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>\n')
    (fx / "ring.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">'
        '<circle cx="50" cy="50" r="44" fill="none" stroke="#B985F5" stroke-width="6"/></svg>\n')
    (fx / "flash.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs>'
        '<radialGradient id="g"><stop offset="0" stop-color="#EAF6FF"/><stop offset=".3" stop-color="#3D9BFF" stop-opacity=".8"/>'
        '<stop offset="1" stop-color="#3D9BFF" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/></svg>\n')
    (fx / "star.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">'
        '<path d="M24 3 L29 19 L45 24 L29 29 L24 45 L19 29 L3 24 L19 19 Z" fill="#FFD95A" stroke="#FFF7D6" stroke-width="2" stroke-linejoin="round"/></svg>\n')

    (OUT / "pointers.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{len(manifest)} pointers, {len(list(OUT.glob('*.svg')))} svg files -> {OUT}")


if __name__ == "__main__":
    main()
