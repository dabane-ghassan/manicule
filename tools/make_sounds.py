#!/usr/bin/env python3
"""Synthesises Manicule's tap sounds. Every sound is generated from scratch here.

    python3 tools/make_sounds.py
"""
import math
import pathlib
import random
import struct
import wave

RATE = 44100
OUT = pathlib.Path(__file__).resolve().parent.parent / "extension" / "assets" / "sounds"


def env(t, attack, decay):
    """Fast linear attack, exponential decay."""
    return min(1.0, t / attack) * math.exp(-t / decay)


def tone(freq, t, shape="sine"):
    p = 2 * math.pi * freq * t
    if shape == "square":
        return 1.0 if math.sin(p) >= 0 else -1.0
    if shape == "tri":
        return 2 / math.pi * math.asin(math.sin(p))
    return math.sin(p)


def render(seconds, fn, gain=0.8):
    rnd = random.Random(7)
    n = int(seconds * RATE)
    raw = [fn(i / RATE, rnd) for i in range(n)]
    peak = max(1e-9, max(abs(v) for v in raw))
    # keep every sound about equally loud: harsh waveforms are turned down to a common RMS
    rms = math.sqrt(sum(v * v for v in raw) / n) / peak * gain
    gain *= min(1.0, 0.15 / max(1e-9, rms))
    fade = int(0.004 * RATE)
    out = []
    for i, v in enumerate(raw):
        v = v / peak * gain
        if i > n - fade:
            v *= (n - i) / fade
        out.append(v)
    return out


def sweep(f0, f1, t, dur):
    """Phase of a tone gliding exponentially from f0 to f1 over dur."""
    k = math.log(f1 / f0) / dur
    return 2 * math.pi * f0 * (math.exp(k * t) - 1) / k


def lowpassed_noise():
    state = {"y": 0.0}

    def step(rnd, amount):
        state["y"] += (rnd.uniform(-1, 1) - state["y"]) * amount
        return state["y"]
    return step


def make():
    sounds = {}

    n1 = lowpassed_noise()
    sounds["thock"] = render(0.12, lambda t, r: (
        math.sin(sweep(190, 95, t, 0.12)) * env(t, 0.001, 0.028) + 0.5 * n1(r, 0.25) * env(t, 0.0005, 0.008)))

    n2 = lowpassed_noise()
    sounds["click"] = render(0.05, lambda t, r: (
        n2(r, 0.9) * env(t, 0.0003, 0.004) + 0.4 * tone(2300, t) * env(t, 0.0005, 0.006)))

    sounds["tock"] = render(0.10, lambda t, r: (
        tone(520, t) * env(t, 0.001, 0.02) + 0.5 * tone(1040, t) * env(t, 0.001, 0.008)))

    sounds["wood"] = render(0.14, lambda t, r: (
        tone(880, t) * env(t, 0.0008, 0.03) + 0.45 * tone(2210, t) * env(t, 0.0008, 0.012)
        + 0.25 * tone(3520, t) * env(t, 0.0008, 0.006)))

    sounds["pop"] = render(0.09, lambda t, r: math.sin(sweep(420, 1150, t, 0.09)) * env(t, 0.002, 0.018))

    sounds["boop"] = render(0.16, lambda t, r: math.sin(sweep(330, 250, t, 0.16)) * env(t, 0.004, 0.05))

    sounds["blip"] = render(0.08, lambda t, r: (
        0.6 * tone(1320 if t > 0.03 else 990, t, "square") * env(t, 0.001, 0.03)))

    sounds["coin"] = render(0.32, lambda t, r: (
        0.5 * tone(1319 if t > 0.07 else 988, t, "square") * (env(t, 0.001, 0.4) if t < 0.07 else env(t - 0.07, 0.001, 0.09))))

    sounds["pew"] = render(0.2, lambda t, r: math.sin(sweep(1900, 260, t, 0.2)) * env(t, 0.002, 0.07))

    sounds["squeak"] = render(0.16, lambda t, r: (
        math.sin(sweep(900, 2100, min(t, 0.08), 0.08) + (2 * math.pi * 2100 * (t - 0.08) if t > 0.08 else 0)
                 + 0.6 * math.sin(2 * math.pi * 38 * t)) * env(t, 0.006, 0.06)))

    sounds["quack"] = render(0.18, lambda t, r: (
        (tone(410 - 700 * t, t, "square") * 0.5 + tone(820 - 1400 * t, t, "tri") * 0.5)
        * (0.6 + 0.4 * math.sin(2 * math.pi * 70 * t)) * env(t, 0.008, 0.07)))

    sounds["chirp"] = render(0.16, lambda t, r: (
        math.sin(sweep(2400, 4200, t % 0.07, 0.07)) * env(t % 0.07, 0.003, 0.02) * (1 if t < 0.14 else 0)))

    OUT.mkdir(parents=True, exist_ok=True)
    for name, samples in sounds.items():
        with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32000)) for v in samples))
    print(f"{len(sounds)} sounds -> {OUT}")


if __name__ == "__main__":
    make()
