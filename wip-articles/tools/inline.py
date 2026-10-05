"""Fetch a Commons file at a standard thumbnail width and save it as an in-article photo.

Usage: inline.py <slug> <name> "<File:...>" [width]   -> client/public/images/blog/<slug>/<name>.jpg
"""
import sys, json, io, time
from pathlib import Path
sys.path.insert(0, "/home/user/Server-Builder/script")
import sourceCoverImage as s
from PIL import Image
slug, name, title = sys.argv[1:4]
want = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
for attempt in range(6):
    try:
        out = s.api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": str(want)})
        page = next(iter(out["query"]["pages"].values())); info = page["imageinfo"][0]
        raw = s.fetch(info.get("thumburl") or info["url"], timeout=120)
        break
    except Exception as e:
        print("retry", attempt, e, file=sys.stderr); time.sleep(20 * (attempt + 1))
else:
    sys.exit(1)
im = Image.open(io.BytesIO(raw)).convert("RGB")
if im.width > 1200:
    im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
dst = Path("/home/user/Server-Builder/client/public/images/blog") / slug / f"{name}.jpg"
dst.parent.mkdir(parents=True, exist_ok=True)
im.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
m = info["extmetadata"]; key = (m.get("License", {}).get("value") or "").strip().lower()
lic = s.ALLOWED.get(key)
print(json.dumps({"path": f"/images/blog/{slug}/{name}.jpg", "w": im.width, "h": im.height, "kib": dst.stat().st_size // 1024,
                  "author": s._plain(m.get("Artist", {}).get("value", "")), "license": lic[0] if lic else key,
                  "licenseUrl": lic[1] if lic else "", "sourceUrl": info.get("descriptionurl", ""),
                  "desc": s._plain(m.get("ImageDescription", {}).get("value", ""))[:300]}))
