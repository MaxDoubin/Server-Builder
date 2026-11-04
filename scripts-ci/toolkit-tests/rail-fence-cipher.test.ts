import assert from "node:assert/strict";
import {
  BIGRAM_TENTHS,
  BRUTE_MAX_CHARS,
  BRUTE_MAX_INPUT,
  BRUTE_TOP,
  MAX_CHARS,
  QUAD_BUCKETS,
  QUAD_FLOOR,
  QUAD_TOP,
  bruteForce,
  checkKey,
  cycleLength,
  decryptSources,
  decryptStream,
  encryptStream,
  englishFitness,
  letterCode,
  railAt,
  railLengths,
  railPattern,
  runRailFence,
  splitText,
} from "../../client/src/lib/toolkit/rail-fence-cipher.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function enc(text: string, rails: number, offset = 0, mode: "all" | "strip" | "fixed" = "all") {
  const r = runRailFence({ text, rails, offset, direction: "encrypt", mode });
  if (r.kind !== "ok") throw new Error(r.kind === "error" ? r.message : "empty");
  return r;
}
function dec(text: string, rails: number, offset = 0, mode: "all" | "strip" | "fixed" = "all") {
  const r = runRailFence({ text, rails, offset, direction: "decrypt", mode });
  if (r.kind !== "ok") throw new Error(r.kind === "error" ? r.message : "empty");
  return r;
}

test("Wikipedia example: WE ARE DISCOVERED. RUN AT ONCE. on 3 rails", () => {
  const r = enc("WE ARE DISCOVERED. RUN AT ONCE.", 3, 0, "strip");
  assert.equal(r.output, "WECRUOERDSOEERNTNEAIVDAC");
  assert.deepEqual(r.railTexts, ["WECRUO", "ERDSOEERNTNE", "AIVDAC"]);
  assert.equal(dec("WECRUOERDSOEERNTNEAIVDAC", 3).output, "WEAREDISCOVEREDRUNATONCE");
});

test("two rails: even positions then odd", () => {
  assert.equal(enc("HELLOWORLD", 2).output, "HLOOLELWRD");
  assert.equal(dec("HLOOLELWRD", 2).output, "HELLOWORLD");
});

test("zigzag rails follow the triangle wave", () => {
  assert.deepEqual(Array.from(railPattern(9, 3, 0)), [0, 1, 2, 1, 0, 1, 2, 1, 0]);
  assert.deepEqual(Array.from(railPattern(8, 4, 0)), [0, 1, 2, 3, 2, 1, 0, 1]);
  assert.deepEqual(Array.from(railPattern(5, 3, 1)), [1, 2, 1, 0, 1]);
  for (let i = 0; i < 50; i++) assert.equal(railAt(i, 5, 3), railPattern(50, 5, 3)[i]);
  assert.equal(cycleLength(2), 2);
  assert.equal(cycleLength(5), 8);
});

test("offset hand case: ABCDE, 3 rails, offset 1 is DACEB", () => {
  assert.equal(enc("ABCDE", 3, 1).output, "DACEB");
  assert.equal(dec("DACEB", 3, 1).output, "ABCDE");
});

test("rail lengths: 24 letters on 3 rails are 6, 12, 6", () => {
  assert.deepEqual(railLengths(railPattern(24, 3, 0), 3), [6, 12, 6]);
  assert.deepEqual(railLengths(railPattern(10, 4, 0), 4), [2, 3, 3, 2]);
});

test("offset is reduced modulo the cycle, with a notice", () => {
  const a = enc("THEQUICKBROWNFOX", 4, 7);
  const b = enc("THEQUICKBROWNFOX", 4, 1);
  assert.equal(a.output, b.output);
  assert.equal(a.offset, 1);
  assert.ok(a.notices.some((n) => n.includes("offset 7 is the same as offset 1")));
});

test("more rails than characters with offset 0 returns the input", () => {
  const r = enc("ABC", 5);
  assert.equal(r.output, "ABC");
  assert.ok(r.notices.some((n) => n.includes("own rail")));
});

test("large offset with many rails and short text does not crash", () => {
  const r = enc("AB", 10, 5);
  assert.equal(r.output.length, 2);
  assert.equal(dec(r.output, 10, 5).output, "AB");
});

test("decryptSources is the inverse permutation of encryption", () => {
  for (const [n, r, o] of [[24, 3, 0], [17, 5, 3], [1, 2, 1], [100, 7, 11]]) {
    const plain = Array.from({ length: n }, (_, i) => i);
    const cipher = encryptStream(plain, r, o);
    const src = decryptSources(n, r, o);
    for (let i = 0; i < n; i++) assert.equal(cipher[src[i]], i);
  }
});

test("round trip on random text, rails and offsets", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 400; t++) {
    const n = 1 + Math.floor(rnd() * 60);
    const stream = Array.from({ length: n }, () => String.fromCharCode(32 + Math.floor(rnd() * 90)));
    const rails = 2 + Math.floor(rnd() * 12);
    const offset = Math.floor(rnd() * 30);
    assert.deepEqual(decryptStream(encryptStream(stream, rails, offset), rails, offset), stream);
  }
});

test("mode all: spaces ride the fence", () => {
  const r = enc("AB CD", 2);
  assert.equal(r.output, "A DBC");
  assert.equal(dec("A DBC", 2).output, "AB CD");
});

test("mode strip: removes spaces and punctuation, keeps digits and case", () => {
  const r = enc("Hi, 2 you!", 2, 0, "strip");
  assert.equal(r.output, "H2oiyu");
  assert.ok(r.notices.some((n) => n.includes("removed")));
});

test("mode fixed: punctuation stays in place, letters move", () => {
  const r = enc("AB, CD!", 2, 0, "fixed");
  assert.equal(r.output, "AC, BD!");
  assert.equal(dec("AC, BD!", 2, 0, "fixed").output, "AB, CD!");
});

test("splitText handles astral code points as one character", () => {
  const s = splitText("a\u{1F600}b", "all");
  assert.equal(s.stream.length, 3);
  const f = splitText("a\u{1F600}b", "fixed");
  assert.deepEqual(f.stream, ["a", "b"]);
  assert.equal(f.rebuild(["b", "a"]), "b\u{1F600}a");
});

test("trailing line breaks are ignored in mode all", () => {
  const r = dec("HLOOLELWRD\r\n", 2);
  assert.equal(r.output, "HELLOWORLD");
  assert.ok(r.notices.some((n) => n.includes("trailing line break")));
});

test("empty and invalid input never throws", () => {
  assert.equal(runRailFence({ text: "", rails: 3, offset: 0, direction: "encrypt", mode: "all" }).kind, "empty");
  assert.equal(runRailFence({ text: "!!!", rails: 3, offset: 0, direction: "encrypt", mode: "strip" }).kind, "error");
  assert.equal(runRailFence({ text: "abc", rails: 1, offset: 0, direction: "encrypt", mode: "all" }).kind, "error");
  assert.equal(runRailFence({ text: "abc", rails: 2.5, offset: 0, direction: "encrypt", mode: "all" }).kind, "error");
  assert.equal(runRailFence({ text: "abc", rails: 3, offset: -1, direction: "encrypt", mode: "all" }).kind, "error");
});

test("checkKey messages", () => {
  assert.equal(checkKey("3", "").ok, true);
  assert.equal(checkKey("3", "").offset, 0);
  assert.match(checkKey("1", "0").message, /at least 2 rails/);
  assert.match(checkKey("x", "0").message, /whole number/);
  assert.match(checkKey("3.5", "0").message, /whole number/);
  assert.match(checkKey("1001", "0").message, /up to 1000/);
  assert.match(checkKey("3", "-2").message, /offset must be a whole number/);
  assert.match(checkKey("3", "99999999").message, /under/);
});

test("input over MAX_CHARS is truncated with a notice", () => {
  const r = enc("A".repeat(MAX_CHARS + 10), 3);
  assert.equal(r.output.length, MAX_CHARS);
  assert.ok(r.notices.some((n) => n.includes("first")));
});

test("table integrity: 2000 distinct A-Z quadgrams, 676 bigrams", () => {
  const all = QUAD_BUCKETS.join(" ").split(" ").filter(Boolean);
  assert.equal(all.length, 2000);
  assert.equal(new Set(all).size, 2000);
  for (const q of all) assert.match(q, /^[A-Z]{4}$/);
  assert.equal(QUAD_BUCKETS[0], "TION");
  assert.equal(BIGRAM_TENTHS.length, 676);
  for (const v of BIGRAM_TENTHS) assert.ok(Number.isInteger(v) && v > 0 && v <= 70);
  // TH is the most common English bigram.
  const th = 19 * 26 + 7;
  assert.equal(Math.min(...BIGRAM_TENTHS), BIGRAM_TENTHS[th]);
  assert.equal(QUAD_TOP, -2.4);
  assert.ok(Math.abs(QUAD_FLOOR - -5.0) < 1e-9);
});

test("fitness of TION: three bigrams plus the top quadgram", () => {
  const f = englishFitness("tion");
  const bi = (a: string, b: string) => -BIGRAM_TENTHS[letterCode(a) * 26 + letterCode(b)] / 10;
  const expected = bi("t", "i") + bi("i", "o") + bi("o", "n") + QUAD_TOP;
  assert.ok(Math.abs(f.total - expected) < 1e-9);
  assert.equal(f.letters, 4);
});

test("English outscores the same letters shuffled", () => {
  const english = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOGANDKEEPSRUNNING";
  const shuffled = english.split("").sort().join("");
  assert.ok(englishFitness(english).perLetter > englishFitness(shuffled).perLetter + 0.5);
  const rf = enc(english, 3).output;
  assert.ok(englishFitness(english).perLetter > englishFitness(rf).perLetter);
});

test("brute force recovers the Wikipedia ciphertext at rank 1", () => {
  const b = bruteForce("WECRUOERDSOEERNTNEAIVDAC", { mode: "all", offsets: false });
  assert.equal(b.kind, "ok");
  if (b.kind !== "ok") return;
  assert.equal(b.candidates[0].text, "WEAREDISCOVEREDRUNATONCE");
  assert.equal(b.candidates[0].rails, 3);
  assert.equal(b.railsTo, 23);
  assert.equal(b.tried, 22);
  assert.equal(b.capped, false);
});

test("brute force ranks the true key first for typical sentences", () => {
  const sentences = [
    "MEET ME BEHIND THE GYM AFTER THE LAST BELL RINGS",
    "THE PASSWORD FOR THE BACKUP SERVER IS IN THE LOCKED DRAWER",
    "CRYPTOGRAPHY IS THE PRACTICE AND STUDY OF SECURE COMMUNICATION",
    "IF YOU CAN READ THIS MESSAGE THEN YOU HAVE BROKEN THE CIPHER",
  ];
  let wins = 0;
  let total = 0;
  for (const s of sentences) {
    for (const mode of ["all", "strip"] as const) {
      for (const rails of [2, 3, 4, 5, 6, 7]) {
        const c = enc(s, rails, 0, mode).output;
        const b = bruteForce(c, { mode, offsets: false });
        assert.equal(b.kind, "ok");
        if (b.kind !== "ok") continue;
        total++;
        const want = mode === "strip" ? s.replace(/ /g, "") : s;
        if (b.candidates[0].text === want && b.candidates[0].rails === rails) wins++;
      }
    }
  }
  assert.equal(wins, total, `${wins} of ${total}`);
});

test("brute force with offsets keeps the true key in the top 3", () => {
  const s = "DEFEND THE EAST WALL OF THE CASTLE AT MIDNIGHT";
  for (const [rails, offset] of [[3, 1], [4, 2], [5, 7], [3, 0]]) {
    const c = enc(s, rails, offset, "strip").output;
    const b = bruteForce(c, { mode: "strip", offsets: true });
    assert.equal(b.kind, "ok");
    if (b.kind !== "ok") continue;
    const plain = s.replace(/ /g, "");
    assert.ok(b.candidates.slice(0, 3).some((x) => x.text === plain), `rails ${rails} offset ${offset}`);
    assert.ok(b.candidates.length <= BRUTE_TOP);
  }
});

test("brute force in fixed mode restores punctuation", () => {
  const s = "Meet me at noon, by the old clock tower.";
  const c = enc(s, 3, 0, "fixed").output;
  const b = bruteForce(c, { mode: "fixed", offsets: false });
  assert.equal(b.kind, "ok");
  if (b.kind === "ok") assert.equal(b.candidates[0].text, s);
});

test("brute force candidates are distinct and sorted", () => {
  const b = bruteForce("AAAAAAAAAAAAB", { mode: "all", offsets: true });
  assert.equal(b.kind, "ok");
  if (b.kind !== "ok") return;
  const texts = b.candidates.map((c) => c.text);
  assert.equal(new Set(texts).size, texts.length);
  for (let i = 1; i < b.candidates.length; i++) assert.ok(b.candidates[i - 1].fitness >= b.candidates[i].fitness);
});

test("brute force errors: empty, too short, too long, no letters", () => {
  assert.equal(bruteForce("   ", { mode: "all", offsets: false }).kind, "empty");
  assert.equal(bruteForce("AB", { mode: "all", offsets: false }).kind, "error");
  assert.equal(bruteForce("12345678", { mode: "all", offsets: false }).kind, "error");
  const long = bruteForce("A".repeat(BRUTE_MAX_CHARS + 1), { mode: "all", offsets: false });
  assert.equal(long.kind, "error");
  if (long.kind === "error") assert.match(long.message, /up to 5,000/);
});

test("brute force caps work on long text with offsets and says so", () => {
  const text = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG".repeat(60);
  const t0 = Date.now();
  const b = bruteForce(text, { mode: "all", offsets: true });
  const ms = Date.now() - t0;
  assert.equal(b.kind, "ok");
  if (b.kind !== "ok") return;
  assert.equal(b.capped, true);
  assert.ok(b.railsTo < b.railsLimit);
  assert.ok(b.notices.some((n) => n.includes("capped")));
  assert.ok(ms < 5000, `took ${ms} ms`);
  console.log(`  capped brute force over ${text.length} chars: ${b.tried} keys, rails to ${b.railsTo}, ${ms} ms`);
});

test("full brute force over 200 characters with offsets is fast", () => {
  const plain = "WHEN IN THE COURSE OF HUMAN EVENTS IT BECOMES NECESSARY FOR ONE PEOPLE TO DISSOLVE THE POLITICAL BANDS WHICH HAVE CONNECTED THEM WITH ANOTHER AND TO ASSUME AMONG THE POWERS OF THE EARTH THE SEPARATE AND EQUAL".slice(0, 200);
  assert.equal(plain.length, 200);
  const text = enc(plain, 6, 0, "all").output;
  const t0 = Date.now();
  const b = bruteForce(text, { mode: "all", offsets: true });
  const ms = Date.now() - t0;
  assert.equal(b.kind, "ok");
  if (b.kind === "ok") {
    assert.equal(b.capped, false);
    assert.equal(b.railsTo, 199);
    assert.equal(b.tried, 199 * 198);
    assert.equal(b.candidates[0].text, plain);
    console.log(`  full brute force over 200 chars: ${b.tried} keys, ${ms} ms`);
  }
  assert.ok(ms < 5000);
});

test("huge astral paste is cut to exactly MAX_CHARS code points without a broken surrogate", () => {
  const r = enc("\u{1F600}".repeat(MAX_CHARS + 5), 3);
  assert.equal(Array.from(r.output).length, MAX_CHARS);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(r.output));
  assert.ok(r.notices.some((n) => n.includes("first")));
  const mixed = enc("a\u{1F600}".repeat(MAX_CHARS), 2);
  assert.equal(Array.from(mixed.output).length, MAX_CHARS);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(mixed.output));
});

test("adversarial line breaks do not backtrack", () => {
  const t0 = Date.now();
  const r = enc("\n".repeat(200000) + "a", 3);
  assert.equal(r.output.length, MAX_CHARS);
  const r2 = bruteForce("\n".repeat(90000) + "abcdefgh", { mode: "all", offsets: false });
  assert.equal(r2.kind, "error");
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});

test("brute force refuses a giant paste before splitting it", () => {
  const b = bruteForce("ab ".repeat(BRUTE_MAX_INPUT), { mode: "strip", offsets: false });
  assert.equal(b.kind, "error");
  if (b.kind === "error") assert.match(b.message, /reads at most 100,000 characters/);
});


/* ---------------------------------------------- independent verification */

import { readFileSync } from "node:fs";

test("CyberChef test vector: 2 rails, offset 0, encode and decode", () => {
  const plain = "Cryptography is THE Art of Writing or solving codes";
  const cipher = "Cytgah sTEAto rtn rsligcdsrporpyi H r fWiigo ovn oe";
  assert.equal(enc(plain, 2, 0, "all").output, cipher);
  assert.equal(dec(cipher, 2, 0, "all").output, plain);
});

test("CyberChef test vector: 4 rails, offset 2, digits", () => {
  assert.equal(enc("12345678901234567890", 4, 2, "all").output, "51746026813793592840");
  assert.equal(dec("51746026813793592840", 4, 2, "all").output, "12345678901234567890");
  // Digits ride the fence in every mode.
  assert.equal(enc("12345678901234567890", 4, 2, "strip").output, "51746026813793592840");
});

test("CyberChef test vector: 3 rails, offset 2, with spaces", () => {
  const plain = "No one expects the spanish Inquisition.";
  const cipher = "  e  n ut.ooeepcstesaihIqiiinNnxthpsnso";
  assert.equal(enc(plain, 3, 2, "all").output, cipher);
  assert.equal(dec(cipher, 3, 2, "all").output, plain);
});

test("GeeksforGeeks worked examples, spaces on the fence", () => {
  assert.equal(enc("GeeksforGeeks ", 3).output, "GsGsekfrek eoe");
  assert.equal(dec("GsGsekfrek eoe", 3).output, "GeeksforGeeks ");
  assert.equal(enc("defend the east wall", 3).output, "dnhaweedtees alf  tl");
  assert.equal(dec("dnhaweedtees alf  tl", 3).output, "defend the east wall");
  assert.equal(dec("atc toctaka ne", 2).output, "attack at once");
});

test("differential: 300 vectors from an independent pen simulation", () => {
  const ref = JSON.parse(
    readFileSync("scripts-ci/toolkit-tests/rail-playfair-ref-vectors.json", "utf8"),
  ) as { rail: { text: string; rails: number; offset: number; cipher: string }[] };
  assert.equal(ref.rail.length, 300);
  for (const v of ref.rail) {
    assert.equal(encryptStream(Array.from(v.text), v.rails, v.offset).join(""), v.cipher, JSON.stringify(v));
    assert.equal(decryptStream(Array.from(v.cipher), v.rails, v.offset).join(""), v.text, JSON.stringify(v));
  }
});

test("boundaries: n - 1 rails swaps the last two, n or more rails is the identity", () => {
  assert.equal(enc("ABCDEF", 5).output, "ABCDFE");
  assert.equal(dec("ABCDFE", 5).output, "ABCDEF");
  assert.equal(enc("ABCDEF", 6).output, "ABCDEF");
  assert.equal(enc("ABCDEF", 1000).output, "ABCDEF");
  assert.equal(enc("A", 2).output, "A");
  assert.equal(dec("A", 2, 1).output, "A");
  // Offset on two rails: offset 1 starts on the bottom rail.
  assert.equal(enc("ABCD", 2, 1).output, "BDAC");
});

test("decryption refuses a ciphertext over the cap instead of decrypting a slice", () => {
  const r = runRailFence({ text: "A".repeat(MAX_CHARS + 1), rails: 3, offset: 0, direction: "decrypt", mode: "all" });
  assert.equal(r.kind, "error");
  if (r.kind === "error") assert.match(r.message, /whole ciphertext/);
  const ok = runRailFence({ text: "A".repeat(MAX_CHARS), rails: 3, offset: 0, direction: "decrypt", mode: "all" });
  assert.equal(ok.kind, "ok");
  const big = runRailFence({ text: "\u{1F600}".repeat(3 * MAX_CHARS), rails: 3, offset: 0, direction: "decrypt", mode: "fixed" });
  assert.equal(big.kind, "error");
});

test("checkKey rejects malformed numbers without throwing", () => {
  for (const raw of ["", "   ", "٣", "３", "1e3", "0x10", "+3", "3 4", "-0", "NaN", "Infinity"]) {
    assert.equal(checkKey(raw, "0").ok, false, JSON.stringify(raw));
  }
  assert.equal(checkKey("9".repeat(400), "0").ok, false);
  assert.equal(checkKey("3", "9".repeat(400)).ok, false);
  const k = checkKey(" 0004 ", " 7 ");
  assert.equal(k.ok, true);
  assert.equal(k.rails, 4);
  assert.equal(k.offset, 7);
  assert.equal(checkKey("1000", "1000000").ok, true);
});

test("the page examples decrypt to what they promise", () => {
  assert.equal(dec("fhcehltenedstia{_e_i_on}gfhng", 4).output, "flag{the_fence_hides_nothing}");
  const unknown = "TE V DTNHR OTREMIE  HODEAKTHEROSPUREC K PE ES O ANE EDSSY RTDSE";
  const b = bruteForce(unknown, { mode: "all", offsets: false });
  assert.equal(b.kind, "ok");
  if (b.kind === "ok") {
    assert.equal(b.candidates[0].text, "THE SPARE KEY TO THE SERVER ROOM IS TAPED UNDER THE SECOND DESK");
    assert.equal(b.candidates[0].rails, 5);
  }
});

test("brute force on digits only explains that it needs letters", () => {
  const b = bruteForce("51746026813793592840", { mode: "all", offsets: true });
  assert.equal(b.kind, "error");
  if (b.kind === "error") assert.match(b.message, /at least 4 letters/);
});

test("non-ASCII letters, marks and emoji never throw and round trip", () => {
  for (const mode of ["all", "strip", "fixed"] as const) {
    const s = "Ñandú été \u{1F600}\u{1F468}‍\u{1F469} مرحبا 42!";
    const e = enc(s, 4, 3, mode);
    const d = dec(e.output, 4, 3, mode);
    if (mode !== "strip") assert.equal(d.output, s);
    const b = bruteForce(e.output, { mode, offsets: true });
    assert.ok(b.kind === "ok" || b.kind === "error");
  }
  // Lone surrogates are odd input but must not throw.
  assert.equal(runRailFence({ text: "\uD800ab\uDC00", rails: 2, offset: 0, direction: "encrypt", mode: "all" }).kind, "ok");
});

test("whitespace only input", () => {
  assert.equal(runRailFence({ text: "\n\r\n", rails: 3, offset: 0, direction: "encrypt", mode: "all" }).kind, "error");
  assert.equal(runRailFence({ text: "   ", rails: 3, offset: 0, direction: "encrypt", mode: "strip" }).kind, "error");
  assert.equal(enc("   ", 2).output, "   ");
});

console.log(`rail-fence-cipher: ${passed} tests passed`);
