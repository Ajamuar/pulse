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

# Icons carry the mark only, no name: Android 12+ builds its launch screen from the home-screen (adaptive) icon, so a name
# in the icon would sit on the home screen too. The name lives on the iOS launch screens below.
for s in (192, 512):
    render(s, s, DARK, s * 0.34, f"icons/icon-{s}.png")
    # maskable: the launcher crops to a circle or squircle, so the mark stays inside the 80% safe zone (a circle of radius 40%).
    render(s, s, DARK, s * 0.5, f"icons/icon-maskable-{s}.png")

# App shortcut icons (long-press menu): a lucide glyph in the brand colour on the splash colour, drawn for a circular crop.
SHORTCUTS = {"checkin": LIGHT, "recovery": GREEN, "sleep": BLUE}
for name, color in SHORTCUTS.items():
    svg = open(os.path.join(os.path.dirname(__file__), "shortcuts", f"{name}.svg")).read().replace("currentColor", f"rgb{color}")
    glyph = Image.open(io.BytesIO(subprocess.run(["rsvg-convert", "-w", str(192 * SS // 2), "-f", "png"], input=svg.encode(), capture_output=True, check=True).stdout)).convert("RGBA")
    img = Image.new("RGB", (192 * SS, 192 * SS), DARK)
    img.paste(glyph, ((192 * SS - glyph.width) // 2, (192 * SS - glyph.height) // 2), glyph)
    img.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, f"icons/shortcut-{name}.png"), optimize=True)

# iOS launch screens: portrait px sizes of the devices Safari still serves (device width x height @ ratio).
IOS = [(430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2),
       (440, 956, 3), (402, 874, 3), (834, 1194, 2), (1024, 1366, 2), (810, 1080, 2), (768, 1024, 2), (834, 1112, 2)]
for w, h, r in IOS:
    for scheme, bg in (("dark", DARK), ("light", LIGHT)):
        render(w * r, h * r, bg, 56 * r, f"splash/{w}x{h}@{r}-{scheme}.png", name_w=124 * r, name_color=LIGHT if scheme == "dark" else DARK, gap=22 * r)
