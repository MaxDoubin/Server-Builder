import sys, json, time, urllib.parse
sys.path.insert(0, "/home/user/Server-Builder/script")
import sourceCoverImage as s
titles = sys.argv[1:]
out = s.api({"action": "query", "titles": "|".join(titles), "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": "500"})
for p in out["query"]["pages"].values():
    info = p["imageinfo"][0]
    name = p["title"].replace("File:", "").replace(" ", "_")
    raw = s.fetch(info["thumburl"]); open("cov/" + name.rsplit(".",1)[0] + ".jpg", "wb").write(raw)
    print(name, info["width"], info["height"])
    time.sleep(1)
