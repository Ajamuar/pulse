#!/usr/bin/env python3
"""Regenerates the PWA icons and iOS launch screens in public/. Run: python3 scripts/gen-pwa-assets.py (needs Pillow and
rsvg-convert, `brew install librsvg`). The mark is the two pills from src/app/icon.svg (24-unit box: 6.9..17.1 x 4.5..19.5);
the wordmark is scripts/wordmark-black.svg (the splash weight of src/components/brand/Wordmark.tsx)."""
from PIL import Image, ImageDraw
import io, os, subprocess

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
DARK, LIGHT = (16, 21, 24), (246, 248, 249)  # manifest background_color, light page ground
GREEN, BLUE = (0, 241, 159), (31, 160, 240)
SS = 4  # supersample

def mark(img, cx, cy, height):
    """Draws the two pills so the whole mark is `height` px tall, centred on (cx, cy)."""
    u = height / 15  # px per unit
    d = ImageDraw.Draw(img)
    for x, y, color in ((6.9, 4.5, GREEN), (12.9, 8.5, BLUE)):
        x0, y0 = cx + (x - 12) * u, cy + (y - 12) * u
        d.rounded_rectangle([x0, y0, x0 + 4.2 * u, y0 + 11 * u], radius=2.1 * u, fill=color)

WORDMARK = os.path.join(os.path.dirname(__file__), "wordmark-black.svg")
WM_RATIO = 116.55 / 24.15  # width / height of the wordmark's viewBox

def wordmark(width, color):
    svg = open(WORDMARK).read().replace('stroke="currentColor"', f'stroke="rgb{color}"')
    png = subprocess.run(["rsvg-convert", "-w", str(round(width)), "-f", "png"], input=svg.encode(), capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(png)).convert("RGBA")

def render(w, h, bg, mark_h, path, name_w=None, name_color=None, gap=0):
    """The mark centred; with name_w, the mark and the wordmark under it are centred together as one lockup."""
    img = Image.new("RGB", (w * SS, h * SS), bg)
    cy = h * SS / 2
    if name_w:
        wm = wordmark(name_w * SS, name_color)
        top = cy - (mark_h * SS + gap * SS + wm.height) / 2
        cy = top + mark_h * SS / 2
        img.paste(wm, (round(w * SS / 2 - wm.width / 2), round(top + mark_h * SS + gap * SS)), wm)
    mark(img, w * SS / 2, cy, mark_h * SS)
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, path), optimize=True)

# "any" icons double as Android's launch screen: a small mark with the name under it, on the splash colour.
for s in (192, 512):
    render(s, s, DARK, s * 0.28, f"icons/icon-{s}.png", name_w=s * 0.5, name_color=LIGHT, gap=s * 0.07)
    # maskable: the launcher crops to a circle or squircle; the mark stays inside the 80% safe zone.
    render(s, s, DARK, s * 0.5, f"icons/icon-maskable-{s}.png")

# iOS launch screens: portrait px sizes of the devices Safari still serves (device width x height @ ratio).
IOS = [(430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2),
       (440, 956, 3), (402, 874, 3), (834, 1194, 2), (1024, 1366, 2), (810, 1080, 2), (768, 1024, 2), (834, 1112, 2)]
for w, h, r in IOS:
    for scheme, bg in (("dark", DARK), ("light", LIGHT)):
        render(w * r, h * r, bg, 56 * r, f"splash/{w}x{h}@{r}-{scheme}.png", name_w=124 * r, name_color=LIGHT if scheme == "dark" else DARK, gap=22 * r)
