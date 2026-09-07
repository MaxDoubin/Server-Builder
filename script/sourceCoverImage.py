"""Source a post's cover photo from Wikimedia Commons, with its licence.

WHY THIS IS A FILE. Every cover on this site came from a one-off script that
was never committed, which meant the next post had no way to get one and the
licence metadata for the existing 239 could not be regenerated or checked.
This is the whole job, and it records where the picture came from.

WHAT IT WILL AND WILL NOT TAKE. Only files whose Commons licence permits
commercial use and derivative works, because the images are cropped and the
site carries a contact page: CC0, public domain, CC BY and CC BY-SA. Anything
else, including the non-commercial and no-derivatives variants and anything
whose licence Commons does not state in a form this can read, is skipped
rather than guessed at. A picture nobody can prove the licence of is worse
than no picture.

Usage:
    python3 script/sourceCoverImage.py <slug> "<search terms>"

Writes client/public/images/blog/<slug>.jpg at 1600x900 and prints the credit
as a JSON object to paste into the post's coverCredit field.
"""

from __future__ import annotations

import io
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path("client/public/images/blog")
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "maxdoubin.com-covers/2.0 (https://maxdoubin.com)"}

#: Commons licence short names this will accept, mapped to the canonical deed.
#: Deliberately narrow. Commons has dozens of templates and the ones left out
#: are left out because they forbid commercial use, forbid derivatives, or
#: cannot be read reliably from the API's short name.
ALLOWED = {
    "cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "pd": ("Public domain", "https://creativecommons.org/publicdomain/mark/1.0/"),
    "cc-by-2.0": ("CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
    "cc-by-2.5": ("CC BY 2.5", "https://creativecommons.org/licenses/by/2.5/"),
    "cc-by-3.0": ("CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"),
    "cc-by-4.0": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "cc-by-sa-2.0": ("CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
    "cc-by-sa-3.0": ("CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
    "cc-by-sa-4.0": ("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
}

#: Below this the crop to 1600x900 would be an upscale, which looks worse than
#: a different photograph.
MIN_WIDTH, MIN_HEIGHT = 1200, 700


def fetch(url: str, timeout: int = 45) -> bytes:
    """GET with backoff.

    Commons answers 429 readily from a shared address, and it means slow
    down rather than go away: the same request a few seconds later succeeds.
    Failing the whole run on the first one wastes the search.
    """
    last: Exception | None = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 503):
                raise
        except Exception as exc:
            last = exc
        time.sleep(2 ** attempt)
    raise last if last else RuntimeError("unreachable")


def api(params: dict) -> dict:
    url = f"{API}?{urllib.parse.urlencode({**params, 'format': 'json'})}"
    return json.loads(fetch(url))


def candidates(query: str, limit: int = 30) -> list[str]:
    """File titles matching the query, best match first."""
    out = api({
        "action": "query",
        "list": "search",
        "srsearch": f"{query} filetype:bitmap",
        "srnamespace": "6",
        "srlimit": str(limit),
    })
    return [hit["title"] for hit in out.get("query", {}).get("search", [])]


def details(title: str) -> dict | None:
    """Licence, author and dimensions for one file, or None if unusable."""
    out = api({
        "action": "query",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
    })
    pages = out.get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [None])[0]
        if not info:
            return None
        meta = info.get("extmetadata", {})
        short = (meta.get("LicenseShortName", {}).get("value") or "").strip()
        key = (meta.get("License", {}).get("value") or "").strip().lower()
        if key not in ALLOWED:
            return None
        if info.get("width", 0) < MIN_WIDTH or info.get("height", 0) < MIN_HEIGHT:
            return None
        # Commons returns the author as HTML often enough that it needs stripping.
        author = meta.get("Artist", {}).get("value", "") or "Unknown"
        author = _plain(author)
        name, deed = ALLOWED[key]
        return {
            "url": info["url"],
            "descriptionUrl": info.get("descriptionurl", ""),
            "author": author,
            "license": short or name,
            "licenseUrl": deed,
            "size": (info["width"], info["height"]),
        }
    return None


def _plain(html: str) -> str:
    """The author field, with the markup Commons wraps it in taken out."""
    import re

    text = re.sub(r"<[^>]+>", "", html)
    text = (
        text.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
    )
    return " ".join(text.split())[:120] or "Unknown"


def crop(raw: bytes, dst: Path) -> tuple[int, int]:
    """Centre crop to 16:9 and save. Verticals crop from above the middle,
    because the subject of a photograph of hardware is rarely its floor."""
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    tw, th = 1600, 900
    w, h = im.size
    if w / h > tw / th:
        nw = int(h * tw / th)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w * th / tw)
        top = int((h - nh) * 0.35)
        im = im.crop((0, top, w, top + nh))
    im = im.resize((tw, th), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    return im.size


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    slug, query = sys.argv[1], " ".join(sys.argv[2:])
    dst = OUT / f"{slug}.jpg"

    for title in candidates(query):
        d = details(title)
        if not d:
            continue
        try:
            crop(fetch(d["url"], timeout=90), dst)
        except Exception as exc:  # a broken file is not a reason to stop
            print(f"  skip {title}: {exc}", file=sys.stderr)
            continue
        credit = {
            "author": d["author"],
            "license": d["license"],
            "licenseUrl": d["licenseUrl"],
            "sourceUrl": d["descriptionUrl"],
        }
        print(f"{dst}  from {title}  {d['size'][0]}x{d['size'][1]}", file=sys.stderr)
        print(json.dumps(credit))
        return 0

    print(f"nothing usable for {slug!r} matching {query!r}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
