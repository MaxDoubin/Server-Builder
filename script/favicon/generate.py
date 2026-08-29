#!/usr/bin/env python3
"""
Regenerate the favicon set.

Run by hand when the mark changes:  python3 script/favicon/generate.py

The mark is MAX stacked down a three unit rack, one letter per unit, with a
lime status LED on each. Bone bars on obsidian, using the site's own palette
from client/src/index.css.

Two things this must not break:

1. Google renders a favicon beside the result on mobile search and wants a
   square whose side is a multiple of 48px. The previous icon was 128px,
   which is not, so every PNG here is 48, 96, 144, 192 or 512.
2. Google recrawls favicons on its own schedule and a changed URL restarts
   that clock, so the paths are fixed. Change the artwork, keep the names.

Apple touch and maskable icons are always composited as a solid square, so
they get the obsidian background and extra padding rather than alpha.
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib

FONT = "/mnt/skills/examples/canvas-design/canvas-fonts/JetBrainsMono-Bold.ttf"
OUT = pathlib.Path(__file__).resolve().parents[2] / "client" / "public"

OBSIDIAN = (9, 10, 11, 255)    # --brand-obsidian
BONE     = (238, 236, 231, 255)  # --brand-bone
LIME     = (204, 255, 0, 255)    # --brand-signal

LETTERS = ["M", "A", "X"]
SS = 12  # supersample factor, downscaled with LANCZOS for clean edges


def _fit(text, max_w, max_h):
    lo, hi = 4, 8000
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT, mid)
        l, t, r, b = f.getbbox(text)
        if (r - l) <= max_w and (b - t) <= max_h:
            lo = mid
        else:
            hi = mid - 1
    return ImageFont.truetype(FONT, lo)


def render(size, pad=0.0, bg=None):
    """`pad` shrinks the mark toward the centre, for tile icons that get cropped."""
    S = size * SS
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rectangle([0, 0, S, S], fill=bg)

    inset = S * pad
    span = S - 2 * inset
    m = inset + span * 0.11
    g = span * 0.062
    h = (span - 2 * (m - inset) - 2 * g) / 3
    w = S - 2 * m

    for i, ch in enumerate(LETTERS):
        y = m + i * (h + g)
        d.rounded_rectangle([m, y, m + w, y + h], radius=h * 0.26, fill=BONE)
        f = _fit(ch, w * 0.5, h * 0.66)
        l, t, r, b = f.getbbox(ch)
        d.text((m + h * 0.34 - l, y + (h - (b - t)) / 2 - t), ch, font=f, fill=OBSIDIAN)
        rr = h * 0.155
        cx, cy = m + w - h * 0.42, y + h / 2
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=LIME)

    return im.resize((size, size), Image.LANCZOS)


def main():
    for s in (48, 96, 144, 192, 512):
        render(s, bg=OBSIDIAN).save(OUT / f"favicon-{s}.png", optimize=True)
    # Historic path, kept so nothing that hardcoded it breaks.
    render(96, bg=OBSIDIAN).save(OUT / "favicon.png", optimize=True)
    # Root .ico, which Google still probes as a fallback.
    render(48, bg=OBSIDIAN).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    # 192 rather than the usual iOS 180: Google will also pick an
    # apple-touch-icon as the search favicon, and it wants a multiple of 48.
    # iOS downscales 192 cleanly, so this satisfies both.
    render(192, pad=0.10, bg=OBSIDIAN).save(OUT / "apple-touch-icon.png", optimize=True)
    for s in (192, 512):
        render(s, pad=0.20, bg=OBSIDIAN).save(OUT / f"icon-maskable-{s}.png", optimize=True)
    print("favicons written to", OUT)


if __name__ == "__main__":
    main()
