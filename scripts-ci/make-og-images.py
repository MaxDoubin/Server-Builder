#!/usr/bin/env python3
"""
Generate branded social preview cards for every page worth sharing.

Two families, one visual language:

  Posts. A shared link used to show the bare cover photo with no title, so
  every post looked alike in a feed and none of them said what they were.
  The title, a category line and the site name are overlaid on the cover.

  Standalone pages. /resume, /projects, /certifications and the rest had no
  card at all and fell back to one generic site image, so the pages most
  likely to be sent to an admissions officer or a recruiter arrived looking
  identical to every other link. These have no cover photo, so they get a
  typographic card on the brand's obsidian with the same signal rule,
  eyebrow, title and footer.

Both are 1200x630, the size every platform crops to.

Output goes to client/public/images/og/. Regenerate with:

    python3 scripts-ci/make-og-images.py

It is deliberately NOT part of `npm run build`: it takes a while, the inputs
change rarely, and the results are committed. Run it after adding posts, and
after changing a standalone page's title.

Standalone titles are read from the prerendered HTML in dist/public rather
than duplicated here, so a card can never disagree with the page it
represents. That means a build must have run first.
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
DIST_DIR = os.path.join(ROOT, "dist/public")

W, H = 1200, 630

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

# Matches the site's --brand-signal (72 100% 50%) and --brand-bone.
SIGNAL = (176, 255, 0)
BONE = (238, 236, 231)
ASH = (150, 152, 158)

# Eyebrow for a page, chosen by its URL prefix. Longest prefix wins, so
# study/ccna beats study. Anything unmatched falls back to the site name.
SECTION_EYEBROWS = [
    ("study/security-plus", "COMPTIA SECURITY+"),
    ("study/network-plus", "COMPTIA NETWORK+"),
    ("study/ccna", "CISCO CCNA"),
    ("cyber-club", "CYBER CLUB"),
    ("coding-camps", "CODING CAMPS"),
    ("topics", "FIELD NOTES · TOPIC"),
    ("racks", "RACK LIBRARY"),
    ("tools", "TOOLS"),
    ("study", "STUDY"),
    ("ncl", "NATIONAL CYBER LEAGUE"),
]

# Exact eyebrows for the top level pages, where the slug alone is a poor label.
PAGE_EYEBROWS = {
    "resume": "RESUME",
    "projects": "PROJECTS",
    "certifications": "CERTIFICATIONS",
    "blog": "FIELD NOTES",
    "archive": "ARCHIVE",
    "data": "OPEN DATA",
    "paths": "READING PATHS",
    "flashcards": "FLASHCARDS",
    "study-timer": "STUDY TIMER",
    "game": "BUILD SIMULATOR",
    "timeline": "TIMELINE",
    "now": "NOW",
    "uses": "USES",
    "links": "LINKS",
    "faq": "QUESTIONS",
    "contact": "CONTACT",
    "colophon": "COLOPHON",
    "changelog": "CHANGELOG",
    "roadmap": "ROADMAP",
    "racks": "RACK LIBRARY",
    "ask": "ASK",
    "subscribe": "SUBSCRIBE",
    # The simulator's five dashboards. Noindex, so these cards are never for
    # a search result; they are for the link somebody pastes into a chat.
    "noc": "NOC",
    "network": "NETWORK OPS",
    "floor": "FLOOR OPS",
    "incidents": "INCIDENT COMMAND",
    "build": "BUILD CENTER",
}

# Pages that keep the generic site image on purpose. The home page's card IS
# the site card, and nobody deliberately shares a 404.
SKIP = {"index", "404"}


def eyebrow_for(slug):
    if slug in PAGE_EYEBROWS:
        return PAGE_EYEBROWS[slug]
    for prefix, label in SECTION_EYEBROWS:
        if slug == prefix or slug.startswith(prefix + "/"):
            return label
    return "MAX DOUBIN"


def discover_standalone():
    """Every prerendered page that is not a blog post.

    Discovered from the build rather than listed by hand. The hand written
    list covered 27 pages and missed 69 others, among them all 17 tool pages
    and all 26 topic hubs, which are some of the most shareable things here.
    A list that has to be remembered is a list that goes stale.
    """
    found = []
    for root, _dirs, files in os.walk(DIST_DIR):
        for name in files:
            if not name.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(root, name), DIST_DIR)
            slug = rel[: -len(".html")]
            if slug in SKIP:
                continue
            # Posts already get photographic cards from build_card.
            if slug == "blog" or not slug.startswith("blog/"):
                found.append(slug)
    return sorted(found)





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


def unescape(text):
    """Just the entities the prerenderer emits into title and meta content."""
    for entity, char in (
        ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
        ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " "),
    ):
        text = text.replace(entity, char)
    return text


def read_page_meta(slug):
    """Pull the real title and description out of the prerendered page.

    Reading the built HTML rather than keeping a second copy of every title
    here means a card cannot drift out of step with the page it advertises.
    """
    path = os.path.join(DIST_DIR, f"{slug}.html")
    if not os.path.exists(path):
        return None, None
    with open(path, encoding="utf-8") as fh:
        html = fh.read()

    m = re.search(r"<title>(.*?)</title>", html, re.S)
    if not m:
        return None, None
    title = unescape(re.sub(r"\s+", " ", m.group(1)).strip())
    # Titles are "Subject | Max Doubin"; the card already says maxdoubin.com.
    title = title.split(" | ")[0].strip() or None

    d = re.search(r'<meta property="og:description" content="(.*?)"', html, re.S)
    desc = unescape(re.sub(r"\s+", " ", d.group(1)).strip()) if d else None
    return title, desc


def build_standalone_card(slug, eyebrow, title, desc=None):
    """A typographic card for a page with no cover photo.

    Same furniture as the post cards so the two families read as one set:
    signal rule, mono eyebrow, bold title, mono footer. The faint grid is the
    same motif the site uses behind its hero sections.
    """
    img = Image.new("RGB", (W, H), (8, 9, 11))
    draw = ImageDraw.Draw(img)

    # Grid, dim enough to read as texture rather than content.
    for x in range(0, W, 56):
        draw.line([(x, 0), (x, H)], fill=(20, 22, 26), width=1)
    for y in range(0, H, 56):
        draw.line([(0, y), (W, y)], fill=(20, 22, 26), width=1)

    # Corner glow, brightest behind the title block.
    glow = Image.new("L", (1, H))
    for y in range(H):
        t = y / (H - 1)
        glow.putpixel((0, y), int(255 - 40 * (t ** 2)))
    img = Image.composite(img, Image.new("RGB", (W, H), (12, 14, 18)), glow.resize((W, H)))
    draw = ImageDraw.Draw(img)

    pad = 72
    text_w = W - pad * 2

    draw.rectangle([0, 0, W, 6], fill=SIGNAL)

    eyebrow_font = ImageFont.truetype(FONT_MONO, 20)
    draw.text((pad, pad), eyebrow, font=eyebrow_font, fill=SIGNAL)

    # Title and description are laid out as one block anchored to the footer,
    # so a one word title like "Resume" does not float in dead space.
    title_font, lines = fit_title(draw, title, FONT_BOLD, text_w)
    line_h = title_font.size + 12

    desc_font = ImageFont.truetype(FONT_MONO, 23)
    desc_lines = []
    if desc:
        for candidate in textwrap.wrap(desc, width=74)[:2]:
            desc_lines.append(candidate)
        if desc_lines and len(textwrap.wrap(desc, width=74)) > 2:
            desc_lines[-1] = desc_lines[-1].rstrip(" .,;:") + "..."
    desc_h = (desc_font.size + 9) * len(desc_lines)
    gap = 22 if desc_lines else 0

    block_h = line_h * len(lines) + gap + desc_h
    y = H - pad - 56 - block_h
    for line in lines:
        draw.text((pad, y), line, font=title_font, fill=BONE)
        y += line_h
    y += gap
    for line in desc_lines:
        draw.text((pad, y), line, font=desc_font, fill=ASH)
        y += desc_font.size + 9

    footer_font = ImageFont.truetype(FONT_MONO, 21)
    draw.text((pad, H - pad - 26), "maxdoubin.com", font=footer_font, fill=BONE)
    tail = "Max Doubin"
    tail_w = draw.textlength(tail, font=footer_font)
    draw.text((W - pad - tail_w, H - pad - 26), tail, font=footer_font, fill=ASH)

    return img


def save_card(img, name):
    os.makedirs(os.path.dirname(os.path.join(OUT_DIR, f"{name}.jpg")), exist_ok=True)
    img.save(
        os.path.join(OUT_DIR, f"{name}.jpg"),
        "JPEG",
        quality=84,
        optimize=True,
        progressive=True,
    )


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
        save_card(img, post["slug"])
        made += 1

    # Standalone pages. Missing dist is a hard stop rather than a silent skip:
    # quietly emitting no cards would look identical to success.
    if not os.path.isdir(DIST_DIR):
        problems.append(
            "dist/public is missing, so no standalone cards were made. "
            "Run `npm run build` first."
        )
    else:
        for slug in discover_standalone():
            title, desc = read_page_meta(slug)
            if not title:
                problems.append(f"no <title> found for standalone page: {slug}")
                continue
            save_card(build_standalone_card(slug, eyebrow_for(slug), title, desc), slug)
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
