"""Fetch one named Commons file, crop it the way script/sourceCoverImage.py does, write cover + thumb, print credit."""
import sys, json
from pathlib import Path
sys.path.insert(0, "/home/user/Server-Builder/script")
import sourceCoverImage as s
from PIL import Image
slug, title = sys.argv[1], sys.argv[2]
top = float(sys.argv[3]) if len(sys.argv) > 3 else None
d = s.details(title)
assert d, "unusable"
info = s.api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": "1920"})
info = next(iter(info["query"]["pages"].values()))["imageinfo"][0]
src_url = info["thumburl"] if info["width"] > 1920 else info["url"]
raw = s.fetch(src_url, timeout=120)
dst = Path("/home/user/Server-Builder/client/public/images/blog") / f"{slug}.jpg"
if top is None:
    s.crop(raw, dst)
else:
    import io
    im = Image.open(io.BytesIO(raw)).convert("RGB"); w, h = im.size; tw, th = 1600, 900
    if w / h > tw / th:
        nw = int(h * tw / th); x = int((w - nw) * top); im = im.crop((x, 0, x + nw, h))
    else:
        nh = int(w * th / tw); y = int((h - nh) * top); im = im.crop((0, y, w, y + nh))
    im = im.resize((tw, th), Image.LANCZOS); im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
th = Image.open(dst); th = th.resize((480, 270), Image.LANCZOS)
th.save(dst.parent / "thumb" / f"{slug}.jpg", "JPEG", quality=80, optimize=True, progressive=True)
print(json.dumps({"author": d["author"], "license": d["license"], "licenseUrl": d["licenseUrl"], "sourceUrl": d["descriptionUrl"]}))
