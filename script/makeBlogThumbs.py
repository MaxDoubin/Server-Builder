#!/usr/bin/env python3
"""
Generate the 480x270 card thumbnail for every blog cover that lacks one.

The /blog cards render about 220px wide and load
/images/blog/thumb/<name>.jpg instead of the 1600x900 hero. A cover without a
thumbnail still renders, because the card falls back to the hero on error, but
it costs a failed request plus the full-size JPEG. This fills the gaps;
scripts-ci/check-blog-thumbs.mjs is the gate that stops new ones.

Usage (from the repository root, needs Pillow):
    python3 script/makeBlogThumbs.py           # create the missing thumbnails
    python3 script/makeBlogThumbs.py --force   # regenerate every thumbnail
"""

import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "client/src/lib/blogPosts.source.ts"
PUBLIC = ROOT / "client/public"
PREFIX = "/images/blog/"
SIZE = (480, 270)


def main() -> int:
    force = "--force" in sys.argv[1:]
    covers = sorted(
        set(re.findall(r'coverImage:\s*"(/images/blog/[^"/]+)"', SOURCE.read_text("utf8")))
    )
    made = 0
    missing_hero = []
    for cover in covers:
        name = cover[len(PREFIX):]
        hero = PUBLIC / "images/blog" / name
        thumb = PUBLIC / "images/blog/thumb" / name
        if thumb.exists() and not force:
            continue
        if not hero.exists():
            missing_hero.append(cover)
            continue
        thumb.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(hero) as im:
            im = im.convert("RGB").resize(SIZE, Image.LANCZOS)
            im.save(thumb, "JPEG", quality=80, optimize=True, progressive=True)
        made += 1
        print(f"  {thumb.relative_to(ROOT)}  {thumb.stat().st_size / 1024:.1f} KiB")
    print(f"{made} thumbnail(s) written, {len(covers)} covers checked")
    if missing_hero:
        print("covers with no hero file to resize:", file=sys.stderr)
        for cover in missing_hero:
            print(f"  {cover}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
