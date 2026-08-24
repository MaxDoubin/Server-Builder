#!/usr/bin/env python3
"""
Generate branded social preview cards for every blog post.

A shared link currently shows the bare cover photo with no title, so every
post looks alike in a feed and none of them say what they are. This overlays
the post title, a category line and the site name onto each cover, at the
1200x630 size every platform crops to.

Output goes to client/public/images/og/<slug>.jpg. Regenerate with:

    python3 scripts-ci/make-og-images.py

It is deliberately NOT part of `npm run build`: it takes a while, the inputs
change rarely, and the results are committed. Run it after adding posts.
"""

import json
import os
import re
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "client/public/images/og")
COVER_DIR = os.path.join(ROOT, "client/public")

W, H = 1200, 630

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

# Matches the site's --brand-signal (72 100% 50%) and --brand-bone.
SIGNAL = (176, 255, 0)
BONE = (238, 236, 231)
ASH = (150, 152, 158)


def load_posts():
    """Read the generated post index through tsx, so this stays in step with it."""
    script = (
        'import("./client/src/lib/postIndex.ts").then(m=>'
        "console.log(JSON.stringify(m.postIndex.map(p=>"
        "({slug:p.slug,title:p.title,tags:p.tags,cover:p.coverImage,date:p.date})))))"
    )
    out = subprocess.run(
        ["npx", "tsx", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout.strip().splitlines()[-1])


def fit_title(draw, title, font_path, max_width, max_lines=3):
    """Largest size at which the title fits in max_lines. Shrinks, never clips."""
    for size in range(64, 33, -2):
        font = ImageFont.truetype(font_path, size)
        # Rough char budget for this size, then wrap and measure for real.
        approx = max(18, int(max_width / (size * 0.55)))
        lines = textwrap.wrap(title, width=approx)
        if len(lines) > max_lines:
            continue
        if all(draw.textlength(line, font=font) <= max_width for line in lines):
            return font, lines
    font = ImageFont.truetype(font_path, 34)
    lines = textwrap.wrap(title, width=42)[:max_lines]
    if lines:
        lines[-1] = lines[-1].rstrip() + "..."
    return font, lines


def build_card(post):
    cover_path = os.path.join(COVER_DIR, post["cover"].lstrip("/"))
    if not os.path.exists(cover_path):
        return None, f"missing cover: {post['cover']}"

    with Image.open(cover_path) as src:
        img = src.convert("RGB").resize((W, H), Image.LANCZOS)

    # Darken and soften the photo so text sits on it legibly. Without this
    # the title lands on a busy image and is unreadable at feed size.
    img = ImageEnhance.Brightness(img).enhance(0.42)
    img = img.filter(ImageFilter.GaussianBlur(radius=1.2))

    # Vertical scrim, heaviest at the bottom where the text sits.
    scrim = Image.new("L", (1, H))
    for y in range(H):
        t = y / (H - 1)
        scrim.putpixel((0, y), int(40 + 165 * (t**1.6)))
    scrim = scrim.resize((W, H))
    img = Image.composite(Image.new("RGB", (W, H), (8, 9, 11)), img, scrim)

    draw = ImageDraw.Draw(img)

    pad = 72
    text_w = W - pad * 2

    # Signal rule across the top, the site's recurring accent.
    draw.rectangle([0, 0, W, 6], fill=SIGNAL)

    eyebrow_font = ImageFont.truetype(FONT_MONO, 20)
    tags = " · ".join(t.upper() for t in post["tags"][:3]) or "FIELD NOTES"
    draw.text((pad, pad), tags, font=eyebrow_font, fill=SIGNAL)

    title_font, lines = fit_title(draw, post["title"], FONT_BOLD, text_w)
    line_h = title_font.size + 12
    block_h = line_h * len(lines)
    y = H - pad - 56 - block_h
    for line in lines:
        draw.text((pad, y), line, font=title_font, fill=BONE)
        y += line_h

    footer_font = ImageFont.truetype(FONT_MONO, 21)
    draw.text((pad, H - pad - 26), "maxdoubin.com", font=footer_font, fill=BONE)
    date_text = post["date"]
    date_w = draw.textlength(date_text, font=footer_font)
    draw.text((W - pad - date_w, H - pad - 26), date_text, font=footer_font, fill=ASH)

    return img, None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    posts = load_posts()
    made, problems = 0, []
    for post in posts:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", post["slug"]):
            problems.append(f"unsafe slug: {post['slug']}")
            continue
        img, err = build_card(post)
        if err:
            problems.append(err)
            continue
        img.save(
            os.path.join(OUT_DIR, f"{post['slug']}.jpg"),
            "JPEG",
            quality=84,
            optimize=True,
            progressive=True,
        )
        made += 1

    total_kb = sum(
        os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR)
    ) // 1024
    print(f"wrote {made} social cards, {total_kb}KB total")
    for p in problems[:10]:
        print("  problem:", p)
    if problems:
        print(f"  ({len(problems)} problems total)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
