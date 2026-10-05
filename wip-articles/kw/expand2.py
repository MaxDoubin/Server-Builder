import urllib.request, urllib.parse, json, ssl, time, sys, string, os
ctx = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
def suggest(q):
    url = "https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=" + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return json.loads(r.read().decode("utf-8", "replace"))[1]
SEEDS = [
  # Apple pro and server hardware
  "mac pro 5,1", "mac pro 4,1", "mac pro 6,1", "mac pro 2013", "mac pro 2010", "mac pro 2012", "mac pro 2009",
  "mac pro 2019", "mac pro 2023", "mac studio server", "mac mini m4 server", "mac mini home server",
  "xserve raid", "mac os x server", "macos server alternative", "profile manager", "open directory",
  "apple workgroup server", "apple network server", "power mac g4", "imac pro", "afterburner card",
  "mpx module", "opencore legacy patcher", "t2 chip",
  # Dell
  "poweredge r630", "poweredge r640", "poweredge r650", "poweredge r750", "poweredge r760", "poweredge r620",
  "poweredge r330", "poweredge r340", "poweredge r430", "poweredge r440", "poweredge r530", "poweredge r540",
  "poweredge t620", "poweredge t630", "poweredge t640", "poweredge t430", "poweredge t440", "poweredge r820",
  "dell boss card", "dell hba330", "perc h740p", "perc h755", "perc h310", "perc h810", "dell lifecycle controller",
  "racadm", "idrac fan", "idrac 10", "dell openmanage",
  # HPE and others
  "proliant dl360 gen9", "proliant dl360 gen10", "proliant dl380 gen10", "proliant ml350 gen9", "proliant ml350 gen10",
  "proliant dl380p gen8", "proliant dl360p gen8", "ilo 5", "ilo 6", "smart array p440ar", "smart array p420i",
  "microserver gen10 plus", "supermicro ipmi", "supermicro x10", "supermicro x11", "lenovo sr650", "xclarity",
  # Networking
  "catalyst 9200", "catalyst 9300", "catalyst 3850", "catalyst 2960x", "catalyst 3560", "nexus 3048",
  "cisco sg350", "cisco 4331", "cisco 1941", "cisco asa 5516", "cisco asa 5508", "juniper ex2200", "juniper ex3300",
  "brocade icx 6450", "brocade icx 7250", "arista 7050", "aruba 2530", "mikrotik crs326", "mikrotik crs309",
  "ubiquiti usw", "netgear gs108", "meraki mx64", "meraki mx67",
  # Firewalls
  "fortigate 30e", "fortigate 70g", "fortigate 80f", "fortigate 100f", "fortigate 90g", "fortigate vm",
  "fortiwifi 40f", "fortios 7.6", "fortigate factory reset", "palo alto pa-220", "palo alto pa-440",
  "sophos xg home", "opnsense on", "pfsense on",
  # Storage and HBAs
  "lsi 9211-8i", "lsi 9207-8i", "lsi 9300-8i", "netapp ds4246", "emc ktn-stl3", "sas expander", "truenas on dell",
  # Misc homelab
  "server fan noise", "rack server for home", "homelab rack",
]
MODS = list(string.ascii_lowercase) + ["how to", "vs", "can", "does", "why", "not", "max", "best", "upgrade"]
out = json.load(open("suggestions2.json")) if os.path.exists("suggestions2.json") else {}
for seed in SEEDS:
    if seed in out: continue
    found = {}
    for m in [""] + MODS:
        q = seed if not m else f"{seed} {m}"
        for attempt in range(3):
            try:
                for rank, s in enumerate(suggest(q)):
                    if s not in found: found[s] = {"prefix": q, "rank": rank}
                break
            except Exception as e:
                print("ERR", q, e, file=sys.stderr, flush=True); time.sleep(3 * (attempt + 1))
        time.sleep(0.15)
    out[seed] = found
    json.dump(out, open("suggestions2.json", "w"))
    print(f"{seed}: {len(found)}", flush=True)
print("DONE total unique:", len({s for f in out.values() for s in f}), flush=True)
