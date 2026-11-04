import assert from "node:assert/strict";
import {
  ALPHABET,
  MAX_INPUT_CHARS,
  MAX_PLAY_SYMBOLS,
  MAX_PLAY_UNITS,
  UNKNOWN_MARK,
  activeAt,
  decodeMorse,
  encodeText,
  formatMorse,
  looksLikeMorse,
  lookupCode,
  morseTiming,
  normalizeMorse,
  parseToken,
  planPlayback,
  toSpoken,
  type MorseWord,
} from "../../client/src/lib/toolkit/morse-code-translator.ts";
import * as M2 from "../../client/src/lib/toolkit/morse-code-translator.ts";

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

function enc(text: string): string {
  const r = encodeText(text);
  if (!r.ok) throw new Error(r.error);
  return formatMorse(r.words, "symbols");
}
function encWords(text: string): MorseWord[] {
  const r = encodeText(text);
  if (!r.ok) throw new Error(r.error);
  return r.words;
}
function dec(morse: string): string {
  const r = decodeMorse(morse);
  if (!r.ok) throw new Error(r.error);
  return r.text;
}
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/* ITU-R M.1677-1 table, typed independently of the module, Part I 1.1. */
const ITU: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..", "É": "..-..",
  "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....",
  "6": "-....", "7": "--...", "8": "---..", "9": "----.", "0": "-----",
  ".": ".-.-.-", ",": "--..--", ":": "---...", "?": "..--..", "'": ".----.", "-": "-....-",
  "/": "-..-.", "(": "-.--.", ")": "-.--.-", '"': ".-..-.", "=": "-...-", "+": ".-.-.", "@": ".--.-.",
};

test("every ITU character encodes to the ITU pattern and decodes back", () => {
  for (const [ch, code] of Object.entries(ITU)) {
    assert.equal(enc(ch), code, ch);
    assert.equal(dec(code), ch, code);
    assert.equal(ALPHABET.find((s) => s.text === ch)?.itu, true, ch);
  }
});

test("lowercase and accented lowercase fold to uppercase", () => {
  assert.equal(enc("abc"), ".- -... -.-.");
  assert.equal(enc("é"), "..-..");
});

test("non-ITU signs in amateur use", () => {
  assert.equal(enc("!"), "-.-.--");
  assert.equal(enc(";"), "-.-.-.");
  assert.equal(enc("&"), ".-...");
  assert.equal(enc("$"), "...-..-");
  assert.equal(enc("_"), "..--.-");
  for (const ch of "!;&$_") assert.equal(ALPHABET.find((s) => s.text === ch)?.itu, false);
});

test("multiplication sign is the letter X (ITU), decodes as X", () => {
  assert.equal(enc("×"), "-..-");
  assert.equal(dec("-..-"), "X");
});

test("prosigns run together", () => {
  assert.equal(enc("<SK>"), "...-.-");
  assert.equal(enc("<sk>"), "...-.-");
  assert.equal(enc("<VA>"), "...-.-");
  assert.equal(enc("<AR>"), ".-.-.");
  assert.equal(enc("<SOS>"), "...---...");
  assert.equal(enc("SOS"), "... --- ...");
  assert.equal(enc("<BT>"), "-...-");
  assert.equal(enc("<KN>"), "-.--.");
  assert.equal(enc("<HH>"), "........");
  assert.equal(enc("<CL>"), "-.-..-..");
  assert.equal(enc("<BK>"), "-...-.-");
  assert.equal(enc("<KA>"), "-.-.-");
  assert.equal(enc("<CT>"), "-.-.-");
  assert.equal(enc("<VE>"), "...-.");
  assert.equal(enc("<SN>"), "...-.");
  const w = encWords("<VA>");
  assert.equal(w[0][0].text, "<SK>");
  // A single letter in brackets is not a prosign: brackets skipped, letter sent.
  const e = encodeText("<E>");
  assert.ok(e.ok);
  if (e.ok) {
    assert.equal(formatMorse(e.words, "symbols"), ".");
    assert.deepEqual(e.skipped.map((s) => s.char).sort(), ["<", ">"]);
  }
});

test("prosign patterns decode, and shared patterns note the prosign", () => {
  assert.equal(dec("...-.-"), "<SK>");
  assert.equal(dec("...---..."), "<SOS>");
  assert.equal(dec("... --- ..."), "SOS");
  assert.equal(dec("........"), "<HH>");
  assert.equal(dec("..........."), "<HH>"); // eight or more dots
  assert.equal(dec("...-."), "<VE>");
  assert.equal(dec("-.-.-"), "<KA>");
  const r = decodeMorse(".-.-. -...- -.--. .-...");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.text, "+=(&");
    assert.equal(r.notes.length, 4);
    assert.ok(r.notes.some((n) => n.includes("<AR>")));
    assert.ok(r.notes.some((n) => n.includes("<BT>")));
    assert.ok(r.notes.some((n) => n.includes("<KN>")));
    assert.ok(r.notes.some((n) => n.includes("<AS>")));
  }
});

test("no two symbols share a pattern except the documented prosign overlaps", () => {
  const byCode = new Map<string, string[]>();
  for (const s of ALPHABET) byCode.set(s.code, [...(byCode.get(s.code) ?? []), s.text]);
  const dupes = [...byCode.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}=${v.join(",")}`).sort();
  assert.deepEqual(dupes, ["-...-==,<BT>", "-.--.=(,<KN>", ".-...=&,<AS>", ".-.-.=+,<AR>"].sort());
  for (const s of ALPHABET) assert.match(s.code, /^[.-]+$/);
});

test("whole sentence, word separators", () => {
  assert.equal(enc("MORSE CODE"), "-- --- .-. ... . / -.-. --- -.. .");
  assert.equal(enc("  hello\n\tworld  "), ".... . .-.. .-.. --- / .-- --- .-. .-.. -..");
  assert.equal(dec("-- --- .-. ... . / -.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("-- --- .-. ... .   -.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("-- --- .-. ... .|-.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("-- --- .-. ... .\n-.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("-- --- .-. ... .\r\n-.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("-- --- .-. ... ./-.-. --- -.. ."), "MORSE CODE");
  assert.equal(dec("  / -- --- .-. ... . // -.-. --- -.. . /  "), "MORSE CODE");
});

test("spoken form both ways", () => {
  assert.equal(toSpoken(".-"), "di-dah");
  assert.equal(toSpoken("-.-."), "dah-di-dah-dit");
  assert.equal(toSpoken("."), "dit");
  assert.equal(toSpoken("...."), "di-di-di-dit");
  assert.equal(toSpoken("-"), "dah");
  assert.equal(parseToken("di-dah"), ".-");
  assert.equal(parseToken("didah"), ".-");
  assert.equal(parseToken("DAH-DI-DAH-DIT"), "-.-.");
  assert.equal(parseToken("dit"), ".");
  assert.equal(parseToken("dah-"), "-");
  assert.equal(parseToken("dot"), null);
  assert.equal(parseToken("hello"), null);
  assert.equal(parseToken("d"), null);
  assert.equal(dec("di-dah-dit dah-dah-dah / dah-di-dah-dit"), "RO C");
  const words = encWords("PARIS");
  assert.equal(formatMorse(words, "spoken"), "di-dah-dah-dit di-dah di-dah-dit di-dit di-di-dit");
  assert.equal(dec(formatMorse(words, "spoken")), "PARIS");
});

test("smart punctuation and look-alikes are undone", () => {
  assert.equal(normalizeMorse("…"), "...");
  assert.equal(normalizeMorse("—-"), "---");
  assert.equal(dec("… —- …"), "SOS");
  assert.equal(dec("·– ••"), "AI");
  assert.equal(dec("._ _..."), "AB");
  const r = encodeText("it’s “ok” – yes…");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.substitutions.length, 4);
    assert.equal(formatMorse(r.words, "symbols"), ".. - .----. ... / .-..-. --- -.- .-..-. / -....- / -.-- . ... .-.-.- .-.-.- .-.-.-");
  }
});

test("unknown and invalid tokens are reported, not thrown", () => {
  const r = decodeMorse("... ...... abc ---");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.text, `S${UNKNOWN_MARK}${UNKNOWN_MARK}O`);
    assert.deepEqual(r.problems.map((p) => [p.token, p.kind, p.word, p.position]), [
      ["......", "unknown", 1, 2],
      ["abc", "invalid", 1, 3],
    ]);
    // The unknown pattern is still playable; the invalid token is not.
    assert.deepEqual(r.words[0].map((s) => s.code), ["...", "......", "---"]);
  }
  const t = decodeMorse("hello world");
  assert.ok(!t.ok);
  if (!t.ok) assert.equal(t.looksLikeText, true);
  const e = decodeMorse("   ");
  assert.ok(e.ok && e.text === "");
});

test("unsupported characters are skipped and counted", () => {
  const r = encodeText("a#b#ß\u{1F600}");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(formatMorse(r.words, "symbols"), ".- -...");
    assert.deepEqual(r.skipped, [
      { char: "#", count: 2 },
      { char: "ß", count: 1 },
      { char: "\u{1F600}", count: 1 },
    ]);
  }
});

test("input cap", () => {
  const big = "e".repeat(MAX_INPUT_CHARS + 1);
  assert.equal(encodeText(big).ok, false);
  assert.equal(decodeMorse(".".repeat(MAX_INPUT_CHARS + 1)).ok, false);
  assert.equal(encodeText("e".repeat(MAX_INPUT_CHARS)).ok, true);
  // Adversarial: many "<" with no ">" stays fast.
  const t0 = Date.now();
  const r = encodeText("<".repeat(MAX_INPUT_CHARS));
  assert.ok(r.ok && r.words.length === 0);
  assert.ok(Date.now() - t0 < 500);
  // Many slashes and one enormous token.
  assert.ok(decodeMorse("/".repeat(MAX_INPUT_CHARS)).ok);
  const huge = decodeMorse("-".repeat(MAX_INPUT_CHARS));
  assert.ok(huge.ok && huge.problems.length === 1);
});

test("looksLikeMorse", () => {
  assert.equal(looksLikeMorse("... --- ..."), true);
  assert.equal(looksLikeMorse("di-dah dah"), true);
  assert.equal(looksLikeMorse("hello"), false);
  assert.equal(looksLikeMorse("-"), false);
  assert.equal(looksLikeMorse(""), false);
  assert.equal(looksLikeMorse("did"), false);
});

test("PARIS timing: 50 units, unit = 1.2 / WPM", () => {
  const t20 = morseTiming(20, 20);
  close(t20.unit, 0.06);
  close(t20.dah, 0.18);
  close(t20.letterGap, 0.18);
  close(t20.wordGap, 0.42);
  assert.equal(t20.farnsworth, false);
  const t12 = morseTiming(12, 12);
  const plan = planPlayback(encWords("PARIS"), t12);
  // 43 units of sound and gaps inside the word, plus the 7 unit word space = 50.
  close(plan.duration, 43 * t12.unit);
  close(plan.duration + t12.wordGap, 60 / 12);
  for (const wpm of [5, 13, 20, 35, 50]) {
    const t = morseTiming(wpm, wpm);
    const p = planPlayback(encWords("PARIS PARIS PARIS"), t);
    close(p.duration + t.wordGap, 3 * (60 / wpm), 1e-9);
  }
  // CODEX is 60 units.
  const codex = planPlayback(encWords("CODEX"), t12);
  close(codex.duration + t12.wordGap, 60 * t12.unit);
});

test("Farnsworth (Bloom, QEX 1990): characters at c, a PARIS takes 60/s", () => {
  const t = morseTiming(18, 5);
  assert.equal(t.farnsworth, true);
  close(t.unit, 1.2 / 18);
  const ta = (60 * 18 - 37.2 * 5) / (5 * 18);
  close(ta, 9.933333333333334);
  close(t.letterGap, (3 * ta) / 19);
  close(t.wordGap, (7 * ta) / 19);
  for (const [c, s] of [[18, 5], [20, 10], [25, 12], [15, 7], [50, 5]]) {
    const tm = morseTiming(c, s);
    const p = planPlayback(encWords("PARIS PARIS"), tm);
    close(p.duration + tm.wordGap, 2 * (60 / s), 1e-9);
    // Character shapes unchanged.
    const one = planPlayback(encWords("P"), tm);
    close(one.duration, 11 * (1.2 / c));
  }
});

test("timing clamps bad values", () => {
  const t = morseTiming(Number.NaN, Number.POSITIVE_INFINITY);
  assert.equal(t.charWpm, 20);
  assert.equal(t.effectiveWpm, 20);
  assert.equal(morseTiming(500, 2).charWpm, 50);
  assert.equal(morseTiming(500, 2).effectiveWpm, 5);
  assert.equal(morseTiming(10, 30).effectiveWpm, 10);
  assert.equal(morseTiming(10, 30).farnsworth, false);
});

test("plan: key downs, symbol windows, truncation, activeAt", () => {
  const t = morseTiming(12, 12); // unit 0.1 s
  const p = planPlayback(encWords("AE"), t);
  assert.equal(p.downs.length, 3);
  close(p.downs[0].on, 0);
  close(p.downs[0].off, 0.1);
  close(p.downs[1].on, 0.2);
  close(p.downs[1].off, 0.5);
  close(p.downs[2].on, 0.8); // letter gap of 3 units
  close(p.downs[2].off, 0.9);
  assert.deepEqual(activeAt(p, 0.05), { keyed: true, symbol: 0 });
  assert.deepEqual(activeAt(p, 0.15), { keyed: false, symbol: 0 });
  assert.deepEqual(activeAt(p, 0.6), { keyed: false, symbol: 0 });
  assert.deepEqual(activeAt(p, 0.85), { keyed: true, symbol: 1 });
  assert.deepEqual(activeAt(p, -1), { keyed: false, symbol: -1 });
  const many = planPlayback(encWords("E ".repeat(MAX_PLAY_SYMBOLS + 50)), t);
  assert.equal(many.truncated, true);
  assert.equal(many.symbols.length, MAX_PLAY_SYMBOLS);
  assert.equal(planPlayback([], t).duration, 0);
});

test("lookupCode", () => {
  assert.equal(lookupCode(".-")?.text, "A");
  assert.equal(lookupCode("......"), null);
});


/* ---------------- independent verifier, second pass ---------------- */

test("verifier 2: ITU-R M.1677-1 1.1.3 procedural signals by pattern", () => {
  // Understood ...-. ; wait .-... ; end of work ...-.- ; starting signal -.-.- ; error 8 dots.
  assert.equal(lookupCode("...-.")?.text, "<VE>");
  assert.equal(lookupCode("...-.-")?.text, "<SK>");
  assert.equal(lookupCode("-.-.-")?.text, "<KA>");
  assert.equal(lookupCode("........")?.text, "<HH>");
  assert.equal(lookupCode(".-...")?.text, "&"); // also <AS>, wait; a note says so
  // Invitation to transmit is the letter K.
  assert.equal(dec("-.-"), "K");
  // Seven dots is not a sign; nine or more read as the error signal.
  const seven = decodeMorse(".......");
  assert.ok(seven.ok && seven.problems.length === 1 && seven.problems[0].kind === "unknown");
  assert.equal(dec("........."), "<HH>");
});

test("verifier 2: a well-known call decodes and re-encodes", () => {
  const morse = "-.-. --.- / -.-. --.- / -.. . / .-- .---- .- .--";
  assert.equal(dec(morse), "CQ CQ DE W1AW");
  assert.equal(enc("cq cq de w1aw"), morse);
  assert.equal(enc("73"), "--... ...--");
  assert.equal(enc("user@example.com"), "..- ... . .-. .--.-. . -..- .- -- .--. .-.. . .-.-.- -.-. --- --");
});

test("verifier 2: spoken form, independent cases", () => {
  // Y is dah-di-dah-dah, Q is dah-dah-di-dah, 5 is five dots.
  assert.equal(dec("dah-dit-dah-dah dah-dah-di-dah"), "YQ");
  assert.equal(toSpoken("-.--"), "dah-di-dah-dah");
  assert.equal(toSpoken("....."), "di-di-di-di-dit");
  assert.equal(dec("dahdahdah"), "O");
  assert.equal(dec("Di-Di-Dit"), "S");
  assert.equal(parseToken("di--dah"), null);
  assert.equal(parseToken("dida"), null);
});

test("verifier 2: Unicode normalization and look-alike letters", () => {
  // e + COMBINING ACUTE ACCENT is canonically the accented E of ITU 1.1.1.
  assert.equal(enc("é"), "..-..");
  // KELVIN SIGN normalizes (NFC) to K.
  assert.equal(enc("K"), "-.-");
  const r = encodeText("ß");
  assert.ok(r.ok && r.words.length === 0 && r.skipped[0].char === "ß");
});

test("verifier 2: malformed prosign brackets", () => {
  const a = encodeText("<SK");
  assert.ok(a.ok);
  if (a.ok) assert.equal(formatMorse(a.words, "symbols"), "... -.-");
  const b = encodeText("<<SK>>");
  assert.ok(b.ok);
  if (b.ok) {
    assert.equal(formatMorse(b.words, "symbols"), "...-.-");
    assert.deepEqual(b.skipped, [{ char: "<", count: 1 }, { char: ">", count: 1 }]);
  }
  // Seven characters is past the longest prosign: sent as separate characters.
  assert.equal(enc("<ABCDEFG>"), ".- -... -.-. -.. . ..-. --.");
  assert.equal(enc("<A B>"), ".- / -...");
});

test("verifier 2: SOS as letters versus the prosign, in units", () => {
  const t = morseTiming(12, 12); // unit 100 ms
  // Letters: S 5 + gap 3 + O 11 + gap 3 + S 5 = 27 units.
  close(planPlayback(encWords("SOS"), t).duration, 2.7);
  // Prosign: 3 dots + 3 dashes + 3 dots = 15 units of tone, 8 one-unit gaps = 23 units.
  close(planPlayback(encWords("<SOS>"), t).duration, 2.3);
});

test("verifier 2: Farnsworth 20 WPM characters at 13 WPM overall", () => {
  const t = morseTiming(20, 13);
  const ta = (60 * 20 - 37.2 * 13) / (13 * 20); // 2.7553846...
  close(t.unit, 0.06);
  close(t.letterGap, (3 * ta) / 19);
  close(t.wordGap, (7 * ta) / 19);
  close(t.letterGap, 0.43506072874493924, 1e-12);
  // A PARIS plus its word space still takes 60 / 13 s.
  const p = planPlayback(encWords("PARIS"), t);
  close(p.duration + t.wordGap, 60 / 13);
  // At or above the character speed, Farnsworth is off.
  assert.equal(morseTiming(20, 20).farnsworth, false);
});

test("verifier 2: activeAt at element edges", () => {
  const t = morseTiming(12, 12);
  const p = planPlayback(encWords("T"), t); // one dash, 0 to 0.3 s
  assert.deepEqual(activeAt(p, 0), { keyed: true, symbol: 0 });
  assert.deepEqual(activeAt(p, 0.2999), { keyed: true, symbol: 0 });
  assert.deepEqual(activeAt(p, 0.3), { keyed: false, symbol: 0 });
  assert.deepEqual(activeAt(planPlayback([], t), 0), { keyed: false, symbol: -1 });
});


/* ---------------------------------------------------------------- verifier 3 */

/** Standard units of a plan, by summing key-down time and gaps at a known unit. */
function unitsOf(text: string): number {
  const t = morseTiming(20, 20);
  const p = planPlayback(encWords(text), t);
  return Math.round(p.duration / t.unit);
}

test("verifier 3: CODEX is 60 units and PARIS 50 at standard timing", () => {
  // Counted by hand: C -.-. 11, O --- 11, D -.. 7, E . 1, X -..- 11, four
  // letter gaps of 3 and the trailing word gap of 7.
  assert.equal(unitsOf("CODEX") + 7, 60);
  assert.equal(unitsOf("PARIS") + 7, 50);
  // So at 20 WPM by PARIS, CODEX words go out at 20 * 50 / 60 = 16.67 per minute.
  const t = morseTiming(20, 20);
  close(60 / ((unitsOf("CODEX") + 7) * t.unit), 50 / 3, 1e-9);
});

test("verifier 3: Bloom Farnsworth gaps at 20/10 and 18/5, computed by hand", () => {
  // ta = (60c - 37.2s) / (sc). 20/10: (1200 - 372) / 200 = 4.14 s.
  const a = morseTiming(20, 10);
  close(a.letterGap, (3 * 4.14) / 19, 1e-12);
  close(a.wordGap, (7 * 4.14) / 19, 1e-12);
  close(a.unit, 0.06, 1e-12);
  close(a.dah, 0.18, 1e-12);
  // 18/5: (1080 - 186) / 90 = 9.9333... s.
  const b = morseTiming(18, 5);
  close(b.letterGap, (3 * (894 / 90)) / 19, 1e-12);
  close(b.wordGap, (7 * (894 / 90)) / 19, 1e-12);
  // Ten PARIS words, nine word gaps plus the trailing one, take two minutes at 5 WPM.
  const p = planPlayback(encWords(Array(10).fill("PARIS").join(" ")), b);
  close(p.duration + b.wordGap, 120, 1e-9);
});

test("verifier 3: amateur reference strings", () => {
  assert.equal(enc("CQ"), "-.-. --.-");
  assert.equal(enc("73 de W1AW"), "--... ...-- / -.. . / .-- .---- .- .--");
  assert.equal(enc("QTH? 5NN"), "--.- - .... ..--.. / ..... -. -.");
  assert.equal(dec("--... ...-- / -.. . / .-- .---- .- .--"), "73 DE W1AW");
  assert.equal(dec("-.-.\t--.-"), "CQ");
  assert.equal(dec("dah-dah-di-dit di-di-dah-dah-di-dit"), "Z?");
  assert.equal(toSpoken("-----"), "dah-dah-dah-dah-dah");
  assert.equal(toSpoken(".-.-.-"), "di-dah-di-dah-di-dah");
});

test("verifier 3: case folding only where it round-trips", () => {
  // U+0131 dotless i and U+017F long s uppercase to I and S, but they are
  // not those letters. U+212A Kelvin sign is canonically equivalent to K
  // (a singleton NFC decomposition), so it is sent as K.
  const r = encodeText("\u0131\u017F \u212A ik");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(formatMorse(r.words, "symbols"), "-.- / .. -.-");
    assert.deepEqual(r.skipped.map((s) => s.char), ["\u0131", "\u017F"]);
  }
  // The accented E still folds both ways, composed or not.
  assert.equal(enc("\u00E9 e\u0301 \u00C9"), "..-.. / ..-.. / ..-..");
});

test("verifier 3: playback unit cap bounds one enormous token", () => {
  const huge = decodeMorse("-".repeat(MAX_INPUT_CHARS));
  assert.ok(huge.ok);
  if (!huge.ok) return;
  const t = morseTiming(20, 20);
  const p = planPlayback(huge.words, t);
  assert.equal(p.truncated, true);
  assert.equal(p.partial, true);
  // 12,000 units of dash-gap pairs: each dash after the first costs 4 units.
  assert.equal(p.downs.length, 1 + Math.floor((MAX_PLAY_UNITS - 3) / 4));
  assert.ok(p.duration <= MAX_PLAY_UNITS * t.unit + 1e-9);
  assert.equal(p.symbols.length, 1);
  // Many long characters stop at a character boundary, not partway.
  const many = planPlayback(encWords(Array(1000).fill("<SOS>").join(" ")), t);
  assert.equal(many.truncated, true);
  assert.equal(many.partial, false);
  // <SOS> is 23 units and each word gap 7, so 400 fit in 12,000 - 23 + 30 * 400 ... check exactly:
  const n = many.symbols.length;
  assert.ok(23 * n + 7 * (n - 1) <= MAX_PLAY_UNITS);
  assert.ok(23 * (n + 1) + 7 * n > MAX_PLAY_UNITS);
  assert.equal(n, 400);
  // Ordinary text under both caps is not truncated.
  const ok = planPlayback(encWords("THE QUICK BROWN FOX"), t);
  assert.equal(ok.truncated, false);
  assert.equal(ok.partial, false);
});

test("verifier 3: empty words and odd separators do not add gaps", () => {
  const t = morseTiming(20, 20);
  const p = planPlayback([[], [{ text: "E", code: "." }], [], [{ text: "E", code: "." }]], t);
  // One dot, one word gap, one dot.
  close(p.duration, t.unit + t.wordGap + t.unit);
  assert.equal(p.symbols.length, 2);
  assert.equal(dec(" | . || . |"), "E E");
  assert.equal(dec(".  ."), "E E");
});

test("verifier 4: independent reference cases", () => {
  // PARIS at 20 WPM: unit 60 ms; the word alone (no trailing word gap) is 43 units = 2.58 s.
  const t20 = morseTiming(20, 20);
  close(t20.unit, 0.06);
  close(planPlayback(encWords("PARIS"), t20).duration, 43 * 0.06);
  // CODEX is 60 units with its word gap, so 53 without; at 12 WPM a unit is 100 ms.
  close(planPlayback(encWords("CODEX"), morseTiming(12, 12)).duration, 5.3);
  // Two PARIS words: 50 + 43 units.
  close(planPlayback(encWords("PARIS PARIS"), t20).duration, 93 * 0.06);
  // Bloom (QEX 1990) worked case: c = 18, s = 5. ta = (60*18 - 37.2*5) / (5*18) = 9.9333 s.
  const f = morseTiming(18, 5);
  const ta = (60 * 18 - 37.2 * 5) / (5 * 18);
  close(f.letterGap, (3 * ta) / 19);
  close(f.wordGap, (7 * ta) / 19);
  close(f.unit, 1.2 / 18);
  // A PARIS word plus its word gap then lasts exactly 60 / s = 12 s.
  close(planPlayback(encWords("PARIS"), f).duration + f.wordGap, 12, 1e-9);
  // Effective above character speed clamps to standard timing; garbage clamps to defaults.
  assert.equal(morseTiming(15, 30).farnsworth, false);
  assert.equal(morseTiming(Number.NaN, Number.NaN).charWpm, 20);
  assert.equal(morseTiming(1000, 1).charWpm, 50);
  // ITU-R M.1677-1 signals.
  assert.equal(dec("-.-.-"), "<KA>"); // starting signal
  assert.equal(dec("...-."), "<VE>"); // understood
  assert.equal(dec("........"), "<HH>"); // error, eight dots
  assert.equal(dec("........."), "<HH>"); // operators send more
  assert.equal(dec(".-.-."), "+");
  assert.equal(enc("<va>"), "...-.-");
  assert.equal(enc("<ct>"), "-.-.-");
  assert.equal(enc("é"), "..-.."); // NFC composes to the accented E
  // Separators: slash, bar, newline and double space all split words.
  assert.equal(dec(".... .. / - .... . .-. ."), "HI THERE");
  assert.equal(dec(".... ..|-....-"), "HI -");
  assert.equal(dec(".... ..\n-"), "HI T");
  assert.equal(dec(".... ..  -"), "HI T");
  assert.equal(dec("dah-dah dah-dah-dah"), "MO");
  // Malformed input never throws.
  assert.equal(dec("   / / |  "), "");
  const bad = decodeMorse("hello world");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.looksLikeText, true);
  const unk = decodeMorse(".-.-.-.-.-.-.-");
  assert.ok(unk.ok && unk.problems[0].kind === "unknown" && unk.text === UNKNOWN_MARK);
  const skip = encodeText("ß\u{1F600}");
  assert.ok(skip.ok && skip.words.length === 0 && skip.skipped.length === 2);
  assert.equal(encodeText("a".repeat(MAX_INPUT_CHARS + 1)).ok, false);
  assert.doesNotThrow(() => planPlayback(decodeMorse(".".repeat(MAX_INPUT_CHARS)).ok ? (decodeMorse(".".repeat(MAX_INPUT_CHARS)) as { words: MorseWord[] }).words : [], t20));
  assert.doesNotThrow(() => encodeText("<".repeat(MAX_INPUT_CHARS)));
});

/* ---- Independent verification cases (second pass, written without reference to the builder's tests) ---- */
{
  const { ALPHABET, MAX_INPUT_CHARS, UNKNOWN_MARK, activeAt, decodeMorse, encodeText, formatMorse, looksLikeMorse, morseTiming, parseToken, planPlayback, toSpoken, normalizeMorse } = M2;
  const t = test;
  const enc = (s: string) => { const r = encodeText(s); if (!r.ok) throw new Error(r.error); return formatMorse(r.words, "symbols"); };
  const dec = (s: string) => { const r = decodeMorse(s); if (!r.ok) throw new Error(r.error); return r.text; };

  // Independent derivations ------------------------------------------------
  // Digits derive from a rule: 1-5 are n dots then (5-n) dashes; 6-9,0 are (n-5) dashes then (10-n) dots.
  t("digits by rule", () => {
    for (let d = 1; d <= 5; d++) assert.equal(enc(String(d)), ".".repeat(d) + "-".repeat(5 - d));
    for (let d = 6; d <= 9; d++) assert.equal(enc(String(d)), "-".repeat(d - 5) + ".".repeat(10 - d));
    assert.equal(enc("0"), "-----");
  });
  // Morse's first public message, 24 May 1844 (Vail/Morse), in standard ITU spacing.
  t("What hath God wrought", () => {
    assert.equal(enc("What hath God wrought?"), ".-- .... .- - / .... .- - .... / --. --- -.. / .-- .-. --- ..- --. .... - ..--..");
    assert.equal(dec(".-- .... .- - / .... .- - .... / --. --- -.. / .-- .-. --- ..- --. .... - ..--.."), "WHAT HATH GOD WROUGHT?");
  });
  t("CQ DE and callsign form", () => {
    assert.equal(enc("CQ DE W1AW"), "-.-. --.- / -.. . / .-- .---- .- .--");
    assert.equal(dec("-.-. --.- / -.. . / .-- .---- .- .--"), "CQ DE W1AW");
  });
  t("every ITU letter/figure round-trips and the code is prefix-ambiguous only by gaps", () => {
    const codes = new Set<string>();
    for (const s of ALPHABET) if (s.kind !== "prosign") { assert.ok(!codes.has(s.code), `dup ${s.code}`); codes.add(s.code); }
    for (const s of ALPHABET) if (s.kind !== "prosign") assert.equal(dec(s.code), s.text);
  });
  // SOS is nine elements, 3 + 3 + 3, and differs from S O S with gaps.
  t("SOS prosign vs letters", () => {
    assert.equal(enc("<SOS>"), "...---...");
    assert.equal(enc("SOS"), "... --- ...");
    assert.equal(enc("<sos>"), "...---...");
    assert.equal(dec("...---..."), "<SOS>");
  });
  // PARIS timing: 50 units incl. word space; unit = 1.2/W s.
  t("PARIS 50 units incl. word gap; 12 wpm unit 100ms", () => {
    const tm = morseTiming(12, 12);
    assert.ok(Math.abs(tm.unit - 0.1) < 1e-12);
    const r = encodeText("PARIS PARIS"); assert.ok(r.ok);
    if (r.ok) {
      const plan = planPlayback(r.words, tm);
      // two PARIS (31 + 4*3 = 43 units each) and one word gap of 7: 93 units
      assert.ok(Math.abs(plan.duration - 93 * 0.1) < 1e-9, String(plan.duration));
    }
  });
  // Farnsworth 18/5 (the ARRL example speeds): total PARIS cycle must be 60/5 = 12 s.
  t("Farnsworth 18/5 PARIS cycle is 12 s", () => {
    const tm = morseTiming(18, 5);
    const charTime = 31 * (1.2 / 18);
    const cycle = charTime + 4 * tm.letterGap + tm.wordGap;
    assert.ok(Math.abs(cycle - 12) < 1e-9, String(cycle));
    // Bloom: ta = (60c - 37.2s)/(sc) = 9.9333; letter gap = 3ta/19 = 1.5684 s; word gap = 7ta/19 = 3.6596 s
    assert.ok(Math.abs(tm.letterGap - 1.5684) < 5e-4, String(tm.letterGap));
    assert.ok(Math.abs(tm.wordGap - 3.6596) < 5e-4, String(tm.wordGap));
    assert.ok(Math.abs(tm.unit - 1.2 / 18) < 1e-12 && Math.abs(tm.intraGap - 1.2 / 18) < 1e-12);
    const r = encodeText("PARIS PARIS"); assert.ok(r.ok);
    if (r.ok) { const p = planPlayback(r.words, tm); assert.ok(Math.abs(p.duration - (120 / 5 - tm.wordGap)) < 1e-9); }
  });
  t("timing clamps garbage", () => {
    for (const [c, e] of [[NaN, NaN], [0, 0], [-5, 99], [1e9, 1e9], [Infinity, -Infinity]] as [number, number][]) {
      const tm = morseTiming(c, e);
      for (const v of [tm.unit, tm.dah, tm.intraGap, tm.letterGap, tm.wordGap]) assert.ok(Number.isFinite(v) && v > 0, `${c},${e}`);
      assert.ok(tm.effectiveWpm <= tm.charWpm && tm.charWpm >= 5 && tm.charWpm <= 50);
    }
  });
  // Smart punctuation from phones.
  t("smart punctuation", () => {
    assert.equal(dec("…"), "S"); // ellipsis = three dots
    assert.equal(dec("—"), "M"); // long dash = two hyphens
    assert.equal(dec("–"), "T");
    assert.equal(dec("· ··"), "EI");
    assert.equal(enc("“Hi”"), ".-..-. .... .. .-..-.");
    assert.equal(enc("it’s"), ".. - .----. ...");
  });
  // Spoken form.
  t("spoken form vectors", () => {
    assert.equal(toSpoken(".-"), "di-dah");
    assert.equal(toSpoken("-.-."), "dah-di-dah-dit");
    assert.equal(toSpoken("."), "dit");
    assert.equal(parseToken("dah-di-dah-dit"), "-.-.");
    assert.equal(parseToken("DAH-DI-DIT"), "-..");
    assert.equal(parseToken("didah"), ".-");
    assert.equal(parseToken("dididit"), "...");
    assert.equal(parseToken("dit-dah"), ".-");
    assert.equal(parseToken("dahdidit"), "-..");
    assert.equal(parseToken("dahh"), null);
    assert.equal(parseToken("d"), null);
    assert.equal(parseToken("-dah"), null);
    assert.equal(parseToken(""), null);
    assert.equal(dec("dah-dah dah-dah-dah / dit"), "MO E");
    // every symbol survives the spoken round trip
    for (const s of ALPHABET) assert.equal(parseToken(toSpoken(s.code)), s.code);
  });
  t("separators", () => {
    assert.equal(dec(".... ..\t-"), "HIT"); // a single tab is a letter gap
    assert.equal(dec(".... ..\r\n-"), "HI T");
    assert.equal(dec("....   ..   -"), "H I T"); // three spaces is still just a word gap
    assert.equal(dec("/ .... / ..  /"), "H I");
    assert.equal(dec("....|..|-"), "H I T");
    assert.equal(dec(" .... .. "), "HI");
  });
  // Malformed input: precise errors, no throw.
  t("malformed", () => {
    const r = decodeMorse("... xyz --- 12");
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.text, `S${UNKNOWN_MARK}O${UNKNOWN_MARK}`);
      assert.deepEqual(r.problems.map((p) => [p.token, p.word, p.position, p.kind]), [["xyz", 1, 2, "invalid"], ["12", 1, 4, "invalid"]]);
    }
    assert.equal(decodeMorse("hello").ok, false);
    assert.equal(decodeMorse("").ok, true);
    assert.equal(decodeMorse("   ").ok, true);
    const u = decodeMorse("......."); // seven dots: not a character
    assert.ok(u.ok && u.problems.length === 1 && u.problems[0].kind === "unknown");
    const big = decodeMorse(".".repeat(MAX_INPUT_CHARS + 1)); assert.equal(big.ok, false);
  });
  // Unicode / hostile text on the encode side.
  t("encode hostile", () => {
    const inputs = ["", " ", "\n\n", "\u0000", "\uD800", "\uDC00x", "á", "‮a", "​", "\u{1F600}x", "<", "<>", "<<>>", "<A>", "<AB", "A>B", "<ß>", "<ıı>", "K", "Ａ", "ǅ", "İ"];
    for (const s of inputs) { assert.doesNotThrow(() => encodeText(s), JSON.stringify(s)); }
    assert.equal(enc("K"), "-.-"); // Kelvin sign NFC-normalizes to K
    const acute = encodeText("a\u0301"); assert.ok(acute.ok && acute.words.length === 0 && acute.skipped.length === 1); // a-acute has no ITU sign: reported, not sent as A
  });
  t("lone surrogates and empties do not break formatting", () => {
    const r = encodeText("\uD800"); assert.ok(r.ok && r.words.length === 0 && r.skipped.length === 1);
    const r2 = encodeText("   "); assert.ok(r2.ok && r2.words.length === 0);
  });
  // Playback plan cannot be abused.
  t("plan caps", () => {
    const words: MorseWord[] = [Array.from({ length: 5000 }, () => ({ text: "5", code: "....." }))];
    const p = planPlayback(words, morseTiming(20, 20));
    assert.ok(p.truncated && p.symbols.length <= 1000);
    assert.ok(Number.isFinite(p.duration));
    const empty = planPlayback([], morseTiming(20, 20));
    assert.deepEqual([empty.downs.length, empty.duration, empty.truncated], [0, 0, false]);
    assert.deepEqual(activeAt(empty, 5), { keyed: false, symbol: -1 });
  });
  t("activeAt boundaries", () => {
    const r = encodeText("A"); assert.ok(r.ok); if (!r.ok) return;
    const tm = morseTiming(20, 20); const p = planPlayback(r.words, tm);
    assert.equal(activeAt(p, 0).keyed, true);
    assert.equal(activeAt(p, tm.unit * 0.999).keyed, true);
    assert.equal(activeAt(p, tm.unit * 1.001).keyed, false); // intra gap
    assert.equal(activeAt(p, tm.unit * 2.001).keyed, true); // dah
    assert.equal(activeAt(p, tm.unit * 5.001).keyed, false);
    assert.equal(activeAt(p, -1).symbol, -1);
  });
  t("looksLikeMorse", () => {
    assert.equal(looksLikeMorse("... --- ..."), true);
    assert.equal(looksLikeMorse("SOS"), false);
    assert.equal(looksLikeMorse("Hello, world"), false);
    assert.equal(looksLikeMorse(""), false);
  });

}

console.log(`morse-code-translator: ${passed} tests passed`);
