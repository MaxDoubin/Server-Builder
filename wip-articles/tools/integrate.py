"""Insert finished drafts into client/src/lib/blogPosts.source.ts, newest first.

Usage: integrate.py <slug> [<slug> ...]   (reads drafts/<slug>.md and drafts/<slug>.json)
JSON keys used: title, excerpt, tags, coverCredit (optional: author, license, licenseUrl, sourceUrl), date (optional).
"""
import json, sys, re
from pathlib import Path
REPO = Path("/home/user/Server-Builder")
SRC = REPO / "client/src/lib/blogPosts.source.ts"
D = Path(__file__).parent / "drafts"
TODAY = "2026-10-05"
ALLOWED_TAGS = {"networking","servers","operations","security","ai","linux","storage","homelab","hardware","cybersecurity","monitoring","virtualization","automation","ml","tools","apple","mac-pro","career","learning","power","switching","routing","troubleshooting","firewall","dell","fortinet","cisco","history","programming","performance","web"}

def tl(s):
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

def entry(slug):
    meta = json.loads((D / f"{slug}.json").read_text())
    body = (D / f"{slug}.md").read_text().strip("\n")
    assert body.startswith("## "), f"{slug}: body must start with a heading"
    for ch in ("—", "–"):
        assert ch not in body and ch not in meta["title"] and ch not in meta["excerpt"], f"{slug}: dash {ch!r}"
    tags = meta["tags"]
    bad = [t for t in tags if t not in ALLOWED_TAGS]
    assert not bad, f"{slug}: unknown tags {bad}"
    cover = REPO / "client/public/images/blog" / f"{slug}.jpg"
    assert cover.exists(), f"{slug}: missing cover {cover}"
    lines = [
        "  {",
        f"    slug: {json.dumps(slug)},",
        f"    title: {json.dumps(meta['title'], ensure_ascii=False)},",
        f"    date: {json.dumps(meta.get('date', TODAY))},",
        f"    tags: {json.dumps(tags)},",
        "    excerpt:",
        f"      {json.dumps(meta['excerpt'], ensure_ascii=False)},",
        f"    coverImage: \"/images/blog/{slug}.jpg\",",
    ]
    cc = meta.get("coverCredit")
    if cc:
        lines += ["    coverCredit: {",
                  f"      author: {json.dumps(cc['author'], ensure_ascii=False)},",
                  f"      license: {json.dumps(cc['license'])},",
                  f"      licenseUrl: {json.dumps(cc['licenseUrl'])},",
                  f"      sourceUrl: {json.dumps(cc['sourceUrl'])},",
                  "    },"]
    lines += ["    content: `", tl(body), "`,", "  },"]
    return "\n".join(lines)

src = SRC.read_text()
marker = "export const blogPosts: BlogPost[] = [\n"
assert src.count(marker) == 1
slugs = sys.argv[1:]
for s in slugs:
    assert f'slug: "{s}",' not in src, f"{s} already in source"
block = "\n".join(entry(s) for s in slugs) + "\n"
src = src.replace(marker, marker + block, 1)
SRC.write_text(src)
print("inserted:", ", ".join(slugs))
