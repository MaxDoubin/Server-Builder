import sys, json, time
sys.path.insert(0, "/home/user/Server-Builder/script")
import sourceCoverImage as s
q = " ".join(sys.argv[1:])
out = s.api({"action": "query", "generator": "search", "gsrsearch": f"{q} filetype:bitmap", "gsrnamespace": "6",
             "gsrlimit": "40", "prop": "imageinfo", "iiprop": "url|size|extmetadata"})
pages = sorted(out.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
for p in pages:
    info = (p.get("imageinfo") or [None])[0]
    if not info: continue
    meta = info.get("extmetadata", {})
    key = (meta.get("License", {}).get("value") or "").strip().lower()
    ok = key in s.ALLOWED and info.get("width",0) >= s.MIN_WIDTH and info.get("height",0) >= s.MIN_HEIGHT
    print(("OK  " if ok else "--  ") + p["title"] + f"  {info.get('width')}x{info.get('height')}  {key}  {s._plain(meta.get('Artist',{}).get('value',''))[:40]}")
