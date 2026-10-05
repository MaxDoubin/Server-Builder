import urllib.request, urllib.parse, json, ssl, time, sys, string
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
def suggest(q):
    url = "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return json.loads(r.read().decode("utf-8", "replace"))[1]
SEEDS = [
  "xserve", "xserve g5", "xserve raid", "xserve intel", "xserve 2009", "xserve g4", "xsan",
  "mac pro rack", "mac pro 2019 rack", "mac pro 7,1", "mac mini server", "macos server", "apple server",
  "poweredge r740", "poweredge r730", "poweredge r720", "poweredge r710", "r740xd", "r730xd", "r720xd",
  "idrac 9", "idrac 8", "idrac 7", "idrac 6", "perc h730", "perc h710", "perc h330",
  "proliant dl380 gen9", "proliant dl380 g7", "ilo 4", "microserver gen8",
  "fortigate 60f", "fortigate 40f", "fortigate 60e", "fortigate homelab",
  "catalyst 2960", "catalyst 3750", "cisco asa 5506", "sun fire", "power mac g5",
]
MODS = list(string.ascii_lowercase) + ["how to", "vs", "can", "does", "why", "not", "max", "best", "upgrade"]
out = {}
for seed in SEEDS:
    found = {}
    for i, m in enumerate([""] + MODS):
        q = seed if not m else f"{seed} {m}"
        try:
            for rank, s in enumerate(suggest(q)):
                if s not in found: found[s] = {"prefix": q, "rank": rank}
        except Exception as e:
            print("ERR", q, e, file=sys.stderr); time.sleep(3)
        time.sleep(0.15)
    out[seed] = found
    print(f"{seed}: {len(found)} suggestions", flush=True)
json.dump(out, open("suggestions.json", "w"), indent=1)
print("total unique:", len({s for f in out.values() for s in f}))
