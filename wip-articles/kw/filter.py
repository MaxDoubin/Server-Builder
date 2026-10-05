import json, re
d = json.load(open("suggestions.json"))

# For each seed: the term(s) a suggestion must contain to be about that hardware.
MUST = {
 "xserve": [r"\bxserve\b"], "xserve g5": [r"\bxserve\b"], "xserve raid": [r"\bxserve\b"],
 "xserve intel": [r"\bxserve\b"], "xserve 2009": [r"\bxserve\b"], "xserve g4": [r"\bxserve\b"],
 "xsan": [r"\bxsan\b"],
 "mac pro rack": [r"\bmac ?pro\b"], "mac pro 2019 rack": [r"\bmac ?pro\b"], "mac pro 7,1": [r"\bmac ?pro\b"],
 "mac mini server": [r"\bmac ?mini\b"], "macos server": [r"\b(macos|os x|osx|mac os) ?(x )?server\b"],
 "apple server": [r"\bapple\b.*\bserver\b|\bserver\b.*\bapple\b"],
 "poweredge r740": [r"\br740"], "poweredge r730": [r"\br730"], "poweredge r720": [r"\br720"],
 "poweredge r710": [r"\br710"], "r740xd": [r"\br740"], "r730xd": [r"\br730"],
 "r720xd": [r"\br720"],
 "idrac 9": [r"\bidrac ?9\b"], "idrac 8": [r"\bidrac ?8\b"], "idrac 7": [r"\bidrac ?7\b"], "idrac 6": [r"\bidrac ?6\b"],
 "perc h730": [r"\bh730"], "perc h710": [r"\bh710"], "perc h330": [r"\bh330"],
 "proliant dl380 gen9": [r"\bdl380"], "proliant dl380 g7": [r"\bdl380"], "ilo 4": [r"\bilo ?4\b"],
 "microserver gen8": [r"\bmicroserver\b"],
 "fortigate 60f": [r"\b60f\b"], "fortigate 40f": [r"\b40f\b"], "fortigate 60e": [r"\b60e\b"],
 "fortigate homelab": [r"\bfortigate\b"],
 "catalyst 2960": [r"\b2960"], "catalyst 3750": [r"\b3750"], "cisco asa 5506": [r"\b5506"],
 "sun fire": [r"\bsun ?fire\b"], "power mac g5": [r"\bpower ?mac g5\b|\bpowermac g5\b"],
}
DROP = re.compile(r"\b(price|prices|pricing|cost|costs|buy|buying|sale|sell|ebay|amazon|used|near me|rental|rent|kaufen|jual|cena|precio|prix|preis|"
                  r"value|worth|youtube|reddit|wiki|wikipedia|manual|manuals|datasheet|data sheet|download|downloads|pdf|quickspecs|"
                  r"spec sheet|drivers?|login|jobs?|stock|refurbished|renewed|deal|deals|cheap|ashburn|image|images|png|jpg|vector|"
                  r"clipart|logo|meme|amazon|walmart|newegg|craigslist|facebook|marketplace|alibaba|aliexpress|india|uk|australia|"
                  r"canada|philippines|pakistan|malaysia|indonesia|vietnam|dubai|singapore|lazada|shopee|tokopedia|olx|kijiji|"
                  r"quote|quotation|sku|part number|ordering guide|license key free|crack|keygen|torrent|iso download)\b")
FOREIGN = re.compile(r"[^\x00-\x7f]|\b(que es|co to jest|umbauen|zum|zur|mit|und|fiyat|giá|harga|precio|qué|wie|was ist|como|cómo|para|"
                     r"konfiguration|einrichten|anleitung|reset auf|werkseinstellungen|zurücksetzen|preço|configurar|nedir|nasıl)\b")
STOP = {"the","a","an","for","to","of","in","on","and","or","with","how","what","is","are","does","do","can","why","my","your","i","it"}

def demand(entries):
    # entries: list of (prefix, rank) where the suggestion appeared; base-prefix hits weigh most
    best = 0
    for seed, pre, rank in entries:
        w = 3.0 if pre == seed else 1.0
        best = max(best, w * (10 - rank))
    return best + 0.5 * (len(entries) - 1)

cands = {}
for seed, sugg in d.items():
    pats = MUST[seed]
    for s, m in sugg.items():
        s0 = re.sub(r"\s+", " ", s.lower()).strip()
        if not any(re.search(p, s0) for p in pats): continue
        if FOREIGN.search(s0) or DROP.search(s0): continue
        toks = [t for t in s0.split() if t not in STOP]
        if len(s0.split()) < 2: continue
        cands.setdefault(s0, []).append((seed, m["prefix"], m["rank"]))

out = []
for q, entries in cands.items():
    seeds = sorted({e[0] for e in entries})
    out.append({"q": q, "seeds": seeds, "entries": entries, "demand": demand(entries)})
out.sort(key=lambda x: -x["demand"])
json.dump(out, open("candidates.json", "w"), indent=0)
print(len(out))
from collections import Counter
c = Counter(s for o in out for s in o["seeds"][:1])
print(c.most_common())
