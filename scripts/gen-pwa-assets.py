#!/usr/bin/env python3
"""Regenerates the PWA icons and iOS launch screens in public/. Run: python3 scripts/gen-pwa-assets.py (needs Pillow).
The mark is the two pills from src/app/icon.svg (24-unit box: 6.9..17.1 x 4.5..19.5)."""
from PIL import Image, ImageDraw
import os

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

def render(w, h, bg, mark_h, path):
    img = Image.new("RGB", (w * SS, h * SS), bg)
    mark(img, w * SS / 2, h * SS / 2, mark_h * SS)
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, path), optimize=True)

# "any" icons double as Android's launch screen: a small mark on the splash colour, not a full-bleed logo.
for s in (192, 512):
    render(s, s, DARK, s * 0.34, f"icons/icon-{s}.png")
    # maskable: the launcher crops to a circle or squircle; the mark stays inside the 80% safe zone.
    render(s, s, DARK, s * 0.5, f"icons/icon-maskable-{s}.png")

# iOS launch screens: portrait px sizes of the devices Safari still serves (device width x height @ ratio).
IOS = [(430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2),
       (440, 956, 3), (402, 874, 3), (834, 1194, 2), (1024, 1366, 2), (810, 1080, 2), (768, 1024, 2), (834, 1112, 2)]
for w, h, r in IOS:
    for scheme, bg in (("dark", DARK), ("light", LIGHT)):
        render(w * r, h * r, bg, 56 * r, f"splash/{w}x{h}@{r}-{scheme}.png")
