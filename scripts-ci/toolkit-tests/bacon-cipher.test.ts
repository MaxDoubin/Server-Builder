import assert from "node:assert/strict";
import {
  MAX_CHARS,
  MAX_DECODE_CHARS,
  MAX_PREVIEW_CHARS,
  STYLE_IDS,
  alphabetTable,
  classifyLetter,
  codeOf,
  decodeBits,
  encodeLetters,
  extractBits,
  hideInCase,
  hideInStyles,
  isCaseCarrier,
  letterFor,
  letterIndex,
  parseSymbols,
  readCase,
  readStyles,
  renderBits,
  styleLetter,
  swapBits,
} from "../../client/src/lib/toolkit/bacon-cipher.ts";

let n = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
  n++;
}

const AB = { a: "A", b: "B" };
function sym(a: string, b: string) {
  const r = parseSymbols(a, b);
  if (!r.ok) throw new Error(r.error);
  return r.symbols;
}

/* Bacon's 24 letter table as it is usually reproduced from De Augmentis (1623). */
const BACON_24: Record<string, string> = {
  A: "aaaaa", B: "aaaab", C: "aaaba", D: "aaabb", E: "aabaa", F: "aabab", G: "aabba", H: "aabbb",
  I: "abaaa", J: "abaaa", K: "abaab", L: "ababa", M: "ababb", N: "abbaa", O: "abbab", P: "abbba",
  Q: "abbbb", R: "baaaa", S: "baaab", T: "baaba", U: "baabb", V: "baabb", W: "babaa", X: "babab",
  Y: "babba", Z: "babbb",
};

/* The 26 letter table: each letter's 0 to 25 index in five bits. */
const BACON_26: Record<string, string> = {
  A: "aaaaa", B: "aaaab", C: "aaaba", D: "aaabb", E: "aabaa", F: "aabab", G: "aabba", H: "aabbb",
  I: "abaaa", J: "abaab", K: "ababa", L: "ababb", M: "abbaa", N: "abbab", O: "abbba", P: "abbbb",
  Q: "baaaa", R: "baaab", S: "baaba", T: "baabb", U: "babaa", V: "babab", W: "babba", X: "babbb",
  Y: "bbaaa", Z: "bbaab",
};

t("24 letter table matches Bacon's", () => {
  for (const [letter, code] of Object.entries(BACON_24)) {
    assert.equal(codeOf(letterIndex(letter, 24)!), code, letter);
    assert.equal(codeOf(letterIndex(letter.toLowerCase(), 24)!), code, letter.toLowerCase());
  }
  const table = alphabetTable(24);
  assert.equal(table.length, 24);
  assert.equal(table[8].label, "I/J");
  assert.equal(table[19].label, "U/V");
  assert.equal(table[23].label, "Z");
  assert.equal(table[23].code, "babbb");
});

t("26 letter table numbers A to Z from 0", () => {
  for (const [letter, code] of Object.entries(BACON_26)) {
    assert.equal(codeOf(letterIndex(letter, 26)!), code, letter);
  }
  assert.equal(alphabetTable(26).length, 26);
  assert.equal(alphabetTable(26)[25].code, "bbaab");
});

t("letterFor inverts letterIndex and rejects unused codes", () => {
  for (let i = 0; i < 26; i++) assert.equal(letterIndex(letterFor(i, 26)!, 26), i);
  for (let i = 0; i < 24; i++) assert.equal(letterIndex(letterFor(i, 24)!, 24), i);
  assert.equal(letterFor(8, 24), "I");
  assert.equal(letterFor(19, 24), "U");
  assert.equal(letterFor(24, 24), null);
  assert.equal(letterFor(26, 26), null);
  assert.equal(letterFor(31, 26), null);
  assert.equal(letterFor(-1, 26), null);
  assert.equal(letterIndex("é", 26), null);
  assert.equal(letterIndex("ı", 26), null);
  assert.equal(letterIndex("1", 26), null);
  assert.equal(letterIndex("", 26), null);
});

t("encode HELLO in both alphabets", () => {
  const e24 = encodeLetters("Hello", 24);
  assert.equal(renderBits(e24.bits, AB, true), "AABBB AABAA ABABA ABABA ABBAB");
  const e26 = encodeLetters("Hello", 26);
  assert.equal(renderBits(e26.bits, AB, true), "AABBB AABAA ABABB ABABB ABBBA");
  assert.equal(renderBits(e26.bits, { a: "0", b: "1" }, false), "0011100100010110101101110");
});

t("encode drops non-letters and counts them, ignores whitespace, counts merged J and V", () => {
  const e = encodeLetters("Jive, 42 ways!\nVery", 24);
  assert.equal(e.letters.length, 12);
  assert.equal(e.dropped, 4); // , 4 2 !
  assert.deepEqual(e.droppedSample, [",", "4", "2", "!"]);
  assert.equal(e.merged, 3); // J, v, V
  assert.equal(encodeLetters("Jive", 26).merged, 0);
  const empty = encodeLetters("", 26);
  assert.equal(empty.bits, "");
  assert.equal(renderBits("", AB, true), "");
});

t("decode with A/B, case insensitive, with grouping noise", () => {
  const s = sym("A", "B");
  const x = extractBits("aabbb-aabaa ababa\nababa abbab", s);
  assert.equal(x.ignored, 1);
  const d = decodeBits(x.bits, 24);
  assert.equal(d.text, "HELLO");
  assert.equal(d.leftover, "");
  assert.equal(d.invalid, 0);
});

t("decode flags codes past the end of the table and leftover symbols", () => {
  // bbbbb = 31, past both tables. babbb = 23 = Z in 24, X in 26.
  const d24 = decodeBits("bbbbbbabbbab", 24);
  assert.equal(d24.text, "?Z");
  assert.equal(d24.invalid, 1);
  assert.equal(d24.leftover, "ab");
  const d26 = decodeBits("bbaabbbaab", 26);
  assert.equal(d26.text, "ZZ");
  assert.equal(decodeBits("babbb", 26).text, "X");
  assert.equal(decodeBits("bbaba", 26).text, "?"); // 26
  assert.equal(decodeBits("bbaab", 24).text, "?"); // 25
  assert.equal(decodeBits("", 24).text, "");
});

t("trailing A groups are counted", () => {
  assert.equal(decodeBits("aabbbaaaaaaaaaaaa", 26).trailingA, 2);
  assert.equal(decodeBits("aabbb", 26).trailingA, 0);
});

t("swapped reading", () => {
  assert.equal(swapBits("aab"), "bba");
  // HELLO (26) is aabbb aabaa ababb ababb abbba; swapped it is
  // bbaaa bbabb babaa babaa baaab = 24, 27, 20, 20, 17 = Y ? U U R.
  const sw = decodeBits(swapBits(encodeLetters("HELLO", 26).bits), 26);
  assert.equal(sw.text, "Y?UUR");
  assert.equal(sw.invalid, 1);
});

t("custom symbols round trip, case folding only when it cannot confuse", () => {
  const dots = sym(".", "-");
  assert.equal(dots.foldCase, true);
  const enc = encodeLetters("SOS", 26);
  const text = renderBits(enc.bits, dots, true);
  assert.equal(text, "-..-. .---. -..-.");
  assert.equal(decodeBits(extractBits(text, dots).bits, 26).text, "SOS");

  const cased = sym("a", "A");
  assert.equal(cased.foldCase, false);
  assert.equal(decodeBits(extractBits("aaAAA aaAaa", cased).bits, 24).text, "HE");

  const emoji = sym("🙂", "🙃");
  const out = renderBits(encodeLetters("Hi", 26).bits, emoji, true);
  assert.equal(decodeBits(extractBits(out, emoji).bits, 26).text, "HI");
});

t("symbol validation", () => {
  assert.equal(parseSymbols("", "B").ok, false);
  assert.equal(parseSymbols("AB", "C").ok, false);
  assert.equal(parseSymbols("A", "A").ok, false);
  assert.equal(parseSymbols(" ", "B").ok, false);
  assert.equal(parseSymbols("A", "\t").ok, false);
  const ok = parseSymbols("0", "1");
  assert.ok(ok.ok);
});

t("case carriers", () => {
  for (const c of ["a", "Z", "é", "Ä", "ı", "Σ", "σ"]) assert.equal(isCaseCarrier(c), true, c);
  for (const c of ["1", " ", "!", "ß", "𝐀", "ǅ", "ℎ", "", "中"]) assert.equal(isCaseCarrier(c), false, c);
});

t("hide in case and read back, both mappings", () => {
  const cover =
    "The quick brown fox jumps over the lazy dog while the cat sleeps in the warm afternoon sun by the window.";
  for (const aIsUpper of [false, true]) {
    const hidden = hideInCase("Hide", cover, 24, aIsUpper);
    assert.ok(hidden.ok, hidden.ok ? "" : hidden.error);
    if (!hidden.ok) return;
    assert.equal(hidden.used, 20);
    assert.equal(hidden.text.toLowerCase(), cover.toLowerCase());
    const back = readCase(hidden.text, aIsUpper);
    assert.ok(back.ok);
    if (!back.ok) return;
    const d = decodeBits(back.bits, 24);
    assert.ok(d.text.startsWith("HIDE"));
    assert.equal(d.text.slice(4).replace(/A/g, ""), "");
    assert.ok(d.trailingA >= 1);
  }
});

t("hide in case: exact HELLO case pattern", () => {
  // aIsUpper = false: lowercase is A. H = aabbb.
  const r = hideInCase("H", "abcde", 26, false);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.text, "abCDE");
    assert.equal(r.spare, 0);
    assert.deepEqual(
      r.pattern.segments.map((s) => [s.text, s.kind]),
      [
        ["ab", "a"],
        ["CDE", "b"],
      ],
    );
  }
});

t("hide in case: capacity and empty-message errors", () => {
  const short = hideInCase("Hello", "Too short", 24, false);
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.error, /has 8 letters .* takes 25 .* at least 17 more letters/);
  const one = hideInCase("A", "x", 24, false);
  assert.ok(!one.ok && /has 1 letter that/.test(one.error) && /4 more letters/.test(one.error));
  const empty = hideInCase("123", "plenty of cover text here", 24, false);
  assert.ok(!empty.ok && /no letters/.test(empty.error));
  const huge = hideInCase("a", "x".repeat(MAX_CHARS + 1), 24, false);
  assert.ok(!huge.ok && /20,000/.test(huge.error));
});

t("read case: punctuation, digits and non-carriers skipped, errors on no letters", () => {
  const r = readCase("aaBBB, 12 aaBaa!", false);
  assert.ok(r.ok);
  if (r.ok) assert.equal(decodeBits(r.bits, 24).text, "HE");
  assert.equal(readCase("123 !!!", false).ok, false);
  assert.equal(readCase("", false).ok, false);
});

t("Mathematical Alphanumeric letters: all 13 styles, holes and fillers", () => {
  assert.equal(styleLetter("A", "bold"), "𝐀");
  assert.equal(styleLetter("z", "bold"), "𝐳");
  assert.equal(styleLetter("h", "italic"), "ℎ"); // U+210E fills U+1D455
  assert.equal(styleLetter("B", "script"), "ℬ");
  assert.equal(styleLetter("C", "fraktur"), "ℭ");
  assert.equal(styleLetter("R", "double-struck"), "ℝ");
  assert.equal(styleLetter("a", "monospace"), "𝚊");
  assert.equal(styleLetter("A", "sans"), "𝖠");
  assert.equal(styleLetter("Q", "plain"), "Q");
  assert.equal(styleLetter("1", "bold"), "1");
  for (const style of STYLE_IDS) {
    for (let i = 0; i < 52; i++) {
      const base = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(97 + i - 26);
      const styled = styleLetter(base, style);
      const back = classifyLetter(styled);
      assert.deepEqual(back, { style, base }, `${style} ${base} -> U+${styled.codePointAt(0)!.toString(16)}`);
      // NFKC folds every one of them back to the plain letter.
      assert.equal(styled.normalize("NFKC"), base);
    }
  }
  // Reserved code points are not letters.
  assert.equal(classifyLetter(String.fromCodePoint(0x1d455)), null);
  assert.equal(classifyLetter(String.fromCodePoint(0x1d6a4)), null);
  assert.equal(classifyLetter("1"), null);
  assert.equal(classifyLetter("é"), null);
  assert.equal(classifyLetter(""), null);
});

t("hide in styles and read back", () => {
  const cover = "Meet me by the old oak tree after the rain stops tonight.";
  const hidden = hideInStyles("Run", cover, 26, "plain", "bold");
  assert.ok(hidden.ok);
  if (!hidden.ok) return;
  assert.equal(hidden.text.normalize("NFKC"), cover);
  const back = readStyles(hidden.text, false);
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.styleA, "plain");
  assert.equal(back.styleB, "bold");
  assert.ok(decodeBits(back.bits, 26).text.startsWith("RUN"));
  const flipped = readStyles(hidden.text, true);
  assert.ok(flipped.ok && flipped.styleA === "bold");
  if (flipped.ok) assert.equal(flipped.bits, swapBits(back.bits));
});

t("hide in styles with two non-plain styles: first seen is A", () => {
  const hidden = hideInStyles("B", "Hello world", 26, "italic", "sans-bold");
  assert.ok(hidden.ok);
  if (!hidden.ok) return;
  const back = readStyles(hidden.text, false);
  assert.ok(back.ok);
  if (back.ok) {
    // B = aaaab, so the first letter seen is in style A (italic).
    assert.equal(back.styleA, "italic");
    assert.equal(decodeBits(back.bits, 26).text.slice(0, 1), "B");
  }
});

t("hide in styles restyles letters already styled, and errors", () => {
  const already = hideInStyles("A", "𝐇𝐞𝐥𝐥𝐨", 26, "plain", "bold");
  assert.ok(already.ok && already.text === "Hello");
  assert.equal(hideInStyles("A", "Hello", 26, "bold", "bold").ok, false);
  const short = hideInStyles("AB", "Hello", 26, "plain", "bold");
  assert.ok(!short.ok && /5 letters from A to Z/.test(short.error));
});

t("read styles errors: none, one style, three styles", () => {
  assert.equal(readStyles("123", false).ok, false);
  const one = readStyles("plain text", false);
  assert.ok(!one.ok && /Every letter is plain/.test(one.error));
  const three = readStyles("a𝐀𝐴", false);
  assert.ok(!three.ok && /3 letter styles/.test(three.error));
});

t("pattern preview is capped", () => {
  const cover = "ab ".repeat(MAX_PREVIEW_CHARS);
  const r = readCase(cover, false);
  assert.ok(r.ok && r.pattern.truncated);
  if (r.ok) {
    const shown = r.pattern.segments.reduce((s, seg) => s + Array.from(seg.text).length, 0);
    assert.equal(shown, MAX_PREVIEW_CHARS);
  }
});

t("adversarial input does not throw", () => {
  const junk = "\u0000𐏿‮" + "𝐀".repeat(50) + "￿";
  encodeLetters(junk, 24);
  extractBits(junk, sym("A", "B"));
  readCase(junk, false);
  readStyles(junk, false);
  hideInCase("x", junk, 24, false);
  hideInStyles("x", junk, 24, "plain", "bold");
  // Lone surrogates are not letters.
  assert.equal(classifyLetter("\uD800"), null);
  assert.equal(isCaseCarrier("\uD800"), false);
});


/* ------------------------------------------------------------------ *
 * Independent verifier cases, worked by hand from Bacon's table
 * (A = aaaaa ... Z = babbb in 24 letters, I/J and U/V shared) and the
 * 26 letter table (index 0 to 25 in five bits).
 * ------------------------------------------------------------------ */

t("verifier: BACON in both tables", () => {
  // 24: B 1, A 0, C 2, O 13, N 12. 26: O 14, N 13.
  assert.equal(renderBits(encodeLetters("Bacon", 24).bits, AB, true), "AAAAB AAAAA AAABA ABBAB ABBAA");
  assert.equal(renderBits(encodeLetters("Bacon", 26).bits, AB, true), "AAAAB AAAAA AAABA ABBBA ABBAB");
});

t("verifier: J, U, V, W are where the tables part", () => {
  // 24: J = I = 8 abaaa, U = V = 19 baabb, W = 20 babaa.
  assert.equal(encodeLetters("JUVW", 24).bits, "abaaa" + "baabb" + "baabb" + "babaa");
  // 26: J 9 abaab, U 20 babaa, V 21 babab, W 22 babba.
  assert.equal(encodeLetters("JUVW", 26).bits, "abaab" + "babaa" + "babab" + "babba");
  // Decoding prints the first letter of a shared pair.
  assert.equal(decodeBits(encodeLetters("JUVW", 24).bits, 24).text, "IUUW");
});

t("verifier: groups that exist in one table and not the other", () => {
  assert.equal(decodeBits("bbaab", 26).text, "Z"); // 25
  assert.equal(decodeBits("bbaab", 24).text, "?");
  assert.equal(decodeBits("baabb", 24).text, "U"); // 19
  assert.equal(decodeBits("baabb", 26).text, "T"); // 19
  assert.equal(decodeBits("bbbbb", 24).invalid, 1);
  assert.equal(decodeBits("bbbbb", 26).invalid, 1);
});

t("verifier: ungrouped 0/1 with ragged spacing", () => {
  const s = sym("0", "1");
  // HELLO in 26: 00111 00100 01011 01011 01110, written with odd spacing.
  const x = extractBits("00111 0 0100\n01011 0101101110", s);
  assert.equal(x.ignored, 0);
  assert.equal(decodeBits(x.bits, 26).text, "HELLO");
});

t("verifier: case stego exact output", () => {
  // B = aaaab. lower = A: abcdE. UPPER = A: ABCDe.
  const lo = hideInCase("B", "abcde", 24, false);
  assert.ok(lo.ok && lo.text === "abcdE");
  const up = hideInCase("B", "abcde", 24, true);
  assert.ok(up.ok && up.text === "ABCDe");
  // Non-letters are skipped and kept: "ab, c-d e" with Z (babbb in 24).
  const z = hideInCase("z", "ab, c-d e", 24, false);
  // a carries b (upper), b carries a (lower), c d e carry b.
  assert.ok(z.ok && z.text === "Ab, C-D E");
});

t("verifier: capital sharp s is not a carrier, so case stego still round trips", () => {
  // U+1E9E lowercases to U+00DF, which has no one-character uppercase.
  assert.equal(isCaseCarrier("ẞ"), false);
  assert.equal(isCaseCarrier("ß"), false);
  const cover = "ẞẞ abcde fghij ẞ";
  const r = hideInCase("Hi", cover, 26, true);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.carriers, 10);
  const back = readCase(r.text, true);
  assert.ok(back.ok && decodeBits(back.bits, 26).text === "HI");
});

t("verifier: every case carrier flips to another carrier", () => {
  for (let cp = 0; cp <= 0x1ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const ch = String.fromCodePoint(cp);
    if (!isCaseCarrier(ch)) continue;
    assert.ok(isCaseCarrier(ch.toUpperCase()) && isCaseCarrier(ch.toLowerCase()), `U+${cp.toString(16)}`);
    assert.equal(ch.toUpperCase().length, ch.length);
    assert.equal(ch.toLowerCase().length, ch.length);
  }
});

t("verifier: non-ASCII case carriers round trip", () => {
  const cover = "Ωμέγα École straße Ǆemal ſoft dıgıt ẞ Привет мир";
  const r = hideInCase("Ok", cover, 24, false);
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const back = readCase(r.text, false);
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.carriers, r.carriers);
    assert.equal(back.bits.slice(0, 10), r.bits);
    assert.equal(decodeBits(back.bits, 24).text.slice(0, 2), "OK");
  }
});

t("verifier: a long styled cover can be read back and restyled", () => {
  const cover = "abcde ".repeat(3000); // 15,000 letters, 18,000 characters
  // Both styles are math letters, so every letter of the output is two code units.
  const hidden = hideInStyles("Long message", cover, 24, "italic", "bold");
  assert.ok(hidden.ok);
  if (!hidden.ok) return;
  assert.ok(hidden.text.length > MAX_CHARS); // styled letters are two code units
  const back = readStyles(hidden.text, false);
  assert.ok(back.ok, back.ok ? "" : back.error);
  if (back.ok) assert.ok(decodeBits(back.bits, 24).text.startsWith("LONGMESSAGE"));
  const again = hideInStyles("x", hidden.text, 24, "plain", "italic");
  assert.ok(again.ok, again.ok ? "" : again.error);
  // Past the limit in code points it is refused with a message, not a throw.
  const tooMany = readStyles("a".repeat(MAX_CHARS + 1), false);
  assert.ok(!tooMany.ok && /20,000/.test(tooMany.error));
  const tooManyUnits = readStyles("\u{1D400}".repeat(MAX_CHARS + 1), false);
  assert.ok(!tooManyUnits.ok);
});

t("verifier: the longest encoder output can be decoded", () => {
  const msg = "z".repeat(MAX_CHARS);
  const emoji = sym("\u{1F642}", "\u{1F643}");
  const out = renderBits(encodeLetters(msg, 26).bits, emoji, true);
  assert.ok(out.length <= MAX_DECODE_CHARS, `${out.length}`);
  const d = decodeBits(extractBits(out, emoji).bits, 26);
  assert.equal(d.groups.length, MAX_CHARS);
  assert.equal(d.text, "Z".repeat(MAX_CHARS));
});

t("verifier: random messages round trip through every path", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  for (let k = 0; k < 200; k++) {
    let msg = "";
    const len = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < len; i++) msg += letters[Math.floor(rnd() * 52)];
    const up = msg.toUpperCase();
    const fold24 = up.replace(/J/g, "I").replace(/V/g, "U");
    for (const alphabet of [24, 26] as const) {
      const want = alphabet === 24 ? fold24 : up;
      const enc = encodeLetters(msg, alphabet);
      assert.equal(decodeBits(enc.bits, alphabet).text, want);
      const cover = "the cover text goes on ".repeat(5 * len);
      const c = hideInCase(msg, cover, alphabet, k % 2 === 0);
      assert.ok(c.ok);
      if (c.ok) {
        const back = readCase(c.text, k % 2 === 0);
        assert.ok(back.ok && decodeBits(back.bits, alphabet).text.startsWith(want));
      }
      const st = hideInStyles(msg, cover, alphabet, "sans", "monospace");
      assert.ok(st.ok);
      if (st.ok) {
        const back = readStyles(st.text, false);
        assert.ok(back.ok);
        if (back.ok) {
          const bits = back.styleA === "sans" ? back.bits : swapBits(back.bits);
          assert.ok(decodeBits(bits, alphabet).text.startsWith(want));
        }
      }
    }
  }
});

console.log(`bacon-cipher: ${n} tests passed`);
