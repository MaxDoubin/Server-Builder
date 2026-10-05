import sys, time
sys.path.insert(0, "/home/user/Server-Builder/script")
import sourceCoverImage as s
for cat in sys.argv[1:]:
    out = s.api({"action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmlimit": "100",
                 "prop": "imageinfo", "iiprop": "size|extmetadata"})
    pages = out.get("query", {}).get("pages", {})
    print(f"### {cat}: {len(pages)}")
    for p in pages.values():
        if p.get("ns") == 14: print("  [cat]", p["title"]); continue
        info = (p.get("imageinfo") or [None])[0]
        if not info: continue
        meta = info.get("extmetadata", {}); key = (meta.get("License", {}).get("value") or "").strip().lower()
        ok = key in s.ALLOWED and info.get("width",0) >= 1000
        print(("OK  " if ok else "--  ") + p["title"][5:90] + f"  {info.get('width')}x{info.get('height')}  {key}  {s._plain(meta.get('Artist',{}).get('value',''))[:30]}")
    time.sleep(3)
