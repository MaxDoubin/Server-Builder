import assert from "node:assert/strict";
import {
  MAX_LETTERS,
  alternateFiller,
  buildKeySquare,
  groupLetters,
  letterAt,
  preparePlaintext,
  prepareCiphertext,
  runPlayfair,
  stripLikelyFillers,
  transformPair,
} from "../../client/src/lib/toolkit/playfair-cipher.ts";

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

function enc(keyword: string, text: string, variant: "ij" | "noq" = "ij", filler = "X") {
  const r = runPlayfair({ keyword, text, variant, direction: "encrypt", filler });
  if (!r.ok) throw new Error(r.error);
  return r;
}
function dec(keyword: string, text: string, variant: "ij" | "noq" = "ij", filler = "X") {
  const r = runPlayfair({ keyword, text, variant, direction: "decrypt", filler });
  if (!r.ok) throw new Error(r.error);
  return r;
}

test("Wikipedia key square for PLAYFAIR EXAMPLE", () => {
  const sq = buildKeySquare("playfair example", "ij");
  assert.equal(sq.letters, "PLAYFIREXMBCDGHKNOQSTUVWZ");
  assert.equal(sq.keyPart, "PLAYFIREXM");
  assert.deepEqual(sq.pos.H, { row: 2, col: 4 });
});

test("Stallings MONARCHY square", () => {
  assert.equal(buildKeySquare("MONARCHY", "ij").letters, "MONARCHYBDEFGIKLPQSTUVWXZ");
});

test("J folds to I in keyword, square has no J", () => {
  const sq = buildKeySquare("jumbo", "ij");
  assert.equal(sq.letters.startsWith("IUMBO"), true);
  assert.equal(sq.letters.includes("J"), false);
  assert.equal(sq.letters.length, 25);
});

test("no-Q square keeps J and drops Q", () => {
  const sq = buildKeySquare("quick", "noq");
  assert.equal(sq.letters.length, 25);
  assert.equal(sq.letters.includes("Q"), false);
  assert.equal(sq.letters.includes("J"), true);
  assert.equal(sq.letters.startsWith("UICK"), true);
});

test("empty keyword gives the bare alphabet", () => {
  assert.equal(buildKeySquare("", "ij").letters, "ABCDEFGHIKLMNOPQRSTUVWXYZ");
  assert.equal(buildKeySquare("1234 !!", "noq").letters, "ABCDEFGHIJKLMNOPRSTUVWXYZ");
});

test("every square is a permutation of 25 distinct letters", () => {
  for (const kw of ["", "a", "zzzz", "the quick brown fox jumps over the lazy dog", "ÄÖÜ ß ı"]) {
    for (const v of ["ij", "noq"] as const) {
      const sq = buildKeySquare(kw, v);
      assert.equal(sq.letters.length, 25);
      assert.equal(new Set(sq.letters).size, 25);
    }
  }
});

test("Wikipedia digraph split: HIDE THE GOLD IN THE TREE STUMP", () => {
  const p = preparePlaintext("Hide the gold in the tree stump", "ij", "X");
  assert.equal(p.digraphs.map((d) => d.pair).join(" "), "HI DE TH EG OL DI NT HE TR EX ES TU MP");
  assert.equal(p.fillersBetween, 1);
  assert.equal(p.fillerAtEnd, false);
});

test("Wikipedia ciphertext BMODZBXDNABEKUDMUIXMMOUVIF", () => {
  const r = enc("playfair example", "Hide the gold in the tree stump");
  assert.equal(r.output, "BMODZBXDNABEKUDMUIXMMOUVIF");
  assert.deepEqual(
    r.steps.slice(0, 2).map((s) => [s.input, s.output, s.rule]),
    [
      ["HI", "BM", "rectangle"],
      ["DE", "OD", "column"],
    ],
  );
});

test("Wikipedia decryption round trip", () => {
  const r = dec("playfair example", "BMODZBXDNABEKUDMUIXMMOUVIF");
  assert.equal(r.output, "HIDETHEGOLDINTHETREXESTUMP");
  assert.equal(r.cleaned, "HIDETHEGOLDINTHETREESTUMP");
});

test("Stallings: balloon -> BA LX LO ON -> IBSUPMNA", () => {
  const r = enc("MONARCHY", "balloon");
  assert.equal(r.inputLetters, "BALXLOON");
  assert.equal(r.output, "IBSUPMNA");
  assert.deepEqual(
    r.steps.map((s) => s.rule),
    ["column", "rectangle", "rectangle", "row"],
  );
});

test("Stallings: instruments with MONARCHY", () => {
  const r = enc("MONARCHY", "instruments");
  assert.equal(r.inputLetters, "INSTRUMENTSX");
  assert.equal(r.output, "GATLMZCLRQXA");
});

test("row wraps right on encrypt and left on decrypt", () => {
  const sq = buildKeySquare("MONARCHY", "ij");
  // S T are the last two of row 3 (L P Q S T): T wraps to L.
  assert.equal(transformPair(sq, "ST", "encrypt").output, "TL");
  assert.equal(transformPair(sq, "TL", "decrypt").output, "ST");
});

test("column wraps down on encrypt and up on decrypt", () => {
  const sq = buildKeySquare("MONARCHY", "ij");
  // Column 3 is A B I S X. S X -> X A (X wraps to A).
  assert.equal(transformPair(sq, "SX", "encrypt").output, "XA");
  assert.equal(transformPair(sq, "XA", "decrypt").output, "SX");
});

test("rectangle is its own inverse and keeps each letter's row", () => {
  const sq = buildKeySquare("MONARCHY", "ij");
  const s = transformPair(sq, "RU", "encrypt");
  assert.equal(s.output, "MZ");
  assert.equal(s.rule, "rectangle");
  assert.equal(s.to[0].row, s.from[0].row);
  assert.equal(transformPair(sq, "MZ", "encrypt").output, "RU");
});

test("reversed digraph property: AB -> XY implies BA -> YX", () => {
  const sq = buildKeySquare("playfair example", "ij");
  const L = sq.letters;
  for (let i = 0; i < 25; i++) {
    for (let j = 0; j < 25; j++) {
      if (i === j) continue;
      const ab = transformPair(sq, L[i] + L[j], "encrypt").output;
      const ba = transformPair(sq, L[j] + L[i], "encrypt").output;
      assert.equal(ba, ab[1] + ab[0]);
      assert.notEqual(ab[0], ab[1]);
      assert.notEqual(ab[0], L[i]);
      assert.notEqual(ab[1], L[j]);
      assert.equal(transformPair(sq, ab, "decrypt").output, L[i] + L[j]);
    }
  }
});

test("letterAt wraps negative and overflow indices", () => {
  const sq = buildKeySquare("", "ij");
  assert.equal(letterAt(sq, -1, -1), "Z");
  assert.equal(letterAt(sq, 5, 5), "A");
});

test("doubled filler uses the alternate filler", () => {
  assert.equal(alternateFiller("X", "ij"), "Q");
  assert.equal(alternateFiller("X", "noq"), "Z");
  assert.equal(alternateFiller("Z", "ij"), "X");
  const p = preparePlaintext("XXA", "ij", "X");
  assert.equal(p.digraphs.map((d) => d.pair).join(" "), "XQ XA");
  const end = preparePlaintext("ABX", "ij", "X");
  assert.equal(end.digraphs.map((d) => d.pair).join(" "), "AB XQ");
  assert.deepEqual(end.digraphs[1].inserted, [false, true]);
});

test("triple letters: AAA becomes AX AX AX", () => {
  const p = preparePlaintext("AAA", "ij", "X");
  assert.equal(p.digraphs.map((d) => d.pair).join(" "), "AX AX AX");
  assert.equal(p.fillersBetween, 2);
  assert.equal(p.fillerAtEnd, true);
});

test("double across a pair boundary is not split: ABBC -> AB BC", () => {
  const p = preparePlaintext("ABBC", "ij", "X");
  assert.equal(p.digraphs.map((d) => d.pair).join(" "), "AB BC");
  assert.equal(p.fillersBetween, 0);
});

test("folding counts J, Q and non-letters", () => {
  const p = preparePlaintext("Jo-Jo! 42", "ij", "X");
  assert.equal(p.letters, "IOIO");
  assert.equal(p.folded, 2);
  assert.equal(p.ignored, 4);
  const q = preparePlaintext("quiz", "noq", "X");
  assert.equal(q.letters, "UIZ");
  assert.equal(q.dropped, 1);
});

test("non-ASCII letters are ignored rather than upper-cased into the square", () => {
  const p = preparePlaintext("ıßé", "ij", "X");
  assert.equal(p.letters, "");
  assert.equal(p.ignored, 3);
});

test("ciphertext validation: odd length", () => {
  const c = prepareCiphertext("ABC", "ij");
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.error, /even number of letters, and this has 3/);
});

test("ciphertext validation: doubled pair", () => {
  const c = prepareCiphertext("AB CC", "ij");
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.error, /Pair 2 is CC/);
});

test("ciphertext validation: Q in a no-Q square", () => {
  const c = prepareCiphertext("QA", "noq");
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.error, /contains Q once/);
});

test("filler must be in the square", () => {
  const r = runPlayfair({ keyword: "k", text: "hello", variant: "ij", direction: "encrypt", filler: "J" });
  assert.equal(r.ok, false);
  const r2 = runPlayfair({ keyword: "k", text: "hello", variant: "noq", direction: "encrypt", filler: "Q" });
  assert.equal(r2.ok, false);
  const r3 = runPlayfair({ keyword: "k", text: "hello", variant: "ij", direction: "encrypt", filler: "" });
  assert.equal(r3.ok, false);
  if (!r.ok) assert.match(r.error, /J is not in this square/);
  if (!r2.ok) assert.match(r2.error, /Q is not in this square/);
  if (!r3.ok) assert.match(r3.error, /single letter, A to Z/);
  const r4 = runPlayfair({ keyword: "k", text: "hello", variant: "ij", direction: "encrypt", filler: "z" });
  assert.equal(r4.ok, true);
  if (r4.ok) assert.equal(r4.inputLetters, "HELZLO");
});

test("empty input is an error, not a crash", () => {
  const r = runPlayfair({ keyword: "k", text: "  ", variant: "ij", direction: "encrypt", filler: "X" });
  assert.equal(r.ok, false);
  const r2 = runPlayfair({ keyword: "k", text: "", variant: "ij", direction: "decrypt", filler: "X" });
  assert.equal(r2.ok, false);
});

test("stripLikelyFillers only removes X between doubles and at the end", () => {
  assert.equal(stripLikelyFillers("BALXLOON", "X", "ij"), "BALLOON");
  assert.equal(stripLikelyFillers("INSTRUMENTSX", "X", "ij"), "INSTRUMENTS");
  // X at an even position is a real letter.
  assert.equal(stripLikelyFillers("XRAY", "X", "ij"), "XRAY");
  // X between unequal letters stays.
  assert.equal(stripLikelyFillers("AXBC", "X", "ij"), "AXBC");
  // XQ X: doubled X used the alternate.
  assert.equal(stripLikelyFillers("XQXA", "X", "ij"), "XXA");
});

test("round trip on random text in both variants", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 300; trial++) {
    const variant = trial % 2 ? "ij" : "noq";
    const len = 1 + Math.floor(rnd() * 40);
    let text = "";
    for (let i = 0; i < len; i++) text += String.fromCharCode(65 + Math.floor(rnd() * 26));
    const key = "SECRET" + String.fromCharCode(65 + Math.floor(rnd() * 26));
    const e = enc(key, text, variant);
    const d = dec(key, e.output, variant);
    assert.equal(d.output, e.inputLetters);
  }
});

test("grouping", () => {
  assert.equal(groupLetters("ABCDEFG", "pairs"), "AB CD EF G");
  assert.equal(groupLetters("ABCDEFGHIJK", "fives"), "ABCDE FGHIJ K");
  assert.equal(groupLetters("ABC", "none"), "ABC");
});

test("huge input is capped", () => {
  const r = enc("key", "AB".repeat(MAX_LETTERS));
  assert.equal(r.inputLetters.length, MAX_LETTERS);
  assert.ok(r.notices.some((n) => n.includes("first")));
});

test("errors name the field they belong to", () => {
  const r = runPlayfair({ keyword: "k", text: "hello", variant: "ij", direction: "encrypt", filler: "J" });
  assert.equal(!r.ok && r.field, "filler");
  const r2 = runPlayfair({ keyword: "k", text: "ABC", variant: "ij", direction: "decrypt", filler: "X" });
  assert.equal(!r2.ok && r2.field, "text");
  const r3 = runPlayfair({ keyword: "k", text: "123", variant: "ij", direction: "encrypt", filler: "X" });
  assert.equal(!r3.ok && r3.field, "text");
});

test("a multi-megabyte paste stops at the cap quickly", () => {
  const t0 = Date.now();
  const big = "the quick brown fox ".repeat(250000);
  const e = enc("key", big);
  assert.equal(e.inputLetters.length >= MAX_LETTERS, true);
  assert.ok(e.notices.some((n) => n.includes("first")));
  const d = runPlayfair({ keyword: "key", text: "AB".repeat(2000000), variant: "ij", direction: "decrypt", filler: "X" });
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.inputLetters.length, MAX_LETTERS);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});


/* ---------------------------------------------- independent verification */

import { readFileSync } from "node:fs";

test("differential: 299 vectors from an independent implementation of the rules", () => {
  const ref = JSON.parse(
    readFileSync("scripts-ci/toolkit-tests/rail-playfair-ref-vectors.json", "utf8"),
  ) as { playfair: { key: string; text: string; variant: "ij" | "noq"; filler: string; prepared: string; cipher: string }[] };
  assert.equal(ref.playfair.length, 299);
  for (const v of ref.playfair) {
    const e = enc(v.key, v.text, v.variant, v.filler);
    assert.equal(e.inputLetters, v.prepared, JSON.stringify(v));
    assert.equal(e.output, v.cipher, JSON.stringify(v));
    const d = dec(v.key, v.cipher, v.variant, v.filler);
    assert.equal(d.output, v.prepared, JSON.stringify(v));
  }
});

test("hand-derived: HELLO WORLD with CHARLES in both squares", () => {
  // CHARLES square (I/J): C H A R L / E S B D F / G I K M N / O P Q T U / V W X Y Z
  assert.equal(buildKeySquare("CHARLES", "ij").letters, "CHARLESBDFGIKMNOPQTUVWXYZ");
  const r = enc("CHARLES", "hello world");
  assert.equal(r.inputLetters, "HELXLOWORLDX");
  assert.equal(r.output, "CSAZCUVPLCBY");
  // HE: rectangle (r1c2, r2c1) -> C S. LX: rectangle -> A Z. LO: rectangle -> C U.
  assert.deepEqual(r.steps.slice(0, 3).map((s) => s.output), ["CS", "AZ", "CU"]);
  // RL share row 1: R -> L, L wraps to C.
  assert.equal(r.steps[4].input, "RL");
  assert.equal(r.steps[4].rule, "row");
  assert.equal(r.steps[4].output, "LC");
  assert.equal(enc("CHARLES", "hello world", "noq").output, "CSAZHUHWLCBY");
});

test("hand-derived: XX uses the alternate filler twice", () => {
  assert.equal(enc("CHARLES", "XX").inputLetters, "XQXQ");
  assert.equal(enc("CHARLES", "XX").output, "AXAX");
  assert.equal(enc("CHARLES", "XX", "noq").inputLetters, "XZXZ");
  assert.equal(enc("CHARLES", "XX", "noq").output, "YVYV");
  assert.equal(dec("CHARLES", "AXAX").cleaned, "XX");
});

test("J in the plaintext folds to I; in the no-Q square J is a letter of its own", () => {
  assert.equal(enc("CHARLES", "jazz").inputLetters, "IAZXZX");
  assert.equal(enc("CHARLES", "jazz").output, "KHVYVY");
  assert.equal(enc("CHARLES", "jazz", "noq").inputLetters, "JAZXZX");
  assert.equal(enc("CHARLES", "jazz", "noq").output, "PBVYVY");
  const q = enc("CHARLES", "quiz quietly", "noq");
  assert.equal(q.inputLetters, "UIZUIETLYX");
  assert.ok(q.notices.some((n) => n.includes("2 Q were removed")));
});

test("decrypting J in an I/J square reads it as I, with a notice", () => {
  const r = dec("playfair example", "BMODZBXDNABEKUDMUJXMMOUVIF");
  assert.equal(r.output, "HIDETHEGOLDINTHETREXESTUMP");
  assert.ok(r.notices.some((n) => n.includes("read as I")));
});

test("decryption ignores case, spaces and punctuation", () => {
  const r = dec("playfair example", "bm-od zb!xd na, be ku dm ui xm mo uv if.");
  assert.equal(r.output, "HIDETHEGOLDINTHETREXESTUMP");
  assert.ok(r.notices.some((n) => n.includes("not letters were ignored")));
});

test("misaligned ciphertext is caught as a doubled pair", () => {
  // Dropping the first letter of a valid ciphertext shifts every pair.
  const c = prepareCiphertext("XAXAX", "ij");
  assert.equal(c.ok, false);
  const shifted = prepareCiphertext("MODZBXDNABEKUDMUIXMMOUVIFF", "ij");
  assert.equal(shifted.ok, false);
  // MO DZ BX DN AB EK UD MU IX MM: the shift exposes the plaintext double.
  if (!shifted.ok) assert.match(shifted.error, /Pair 10 is MM/);
});

test("filler validation rejects non-ASCII look-alikes and multi-letter input", () => {
  for (const f of ["ı", "ſ", "XY", "1", " ", "\u{1F600}", "\uD800", "ß"]) {
    const r = runPlayfair({ keyword: "k", text: "hello", variant: "ij", direction: "encrypt", filler: f });
    assert.equal(r.ok, false, JSON.stringify(f));
    if (!r.ok) assert.equal(r.field, "filler");
  }
});

test("adversarial keywords and text never throw", () => {
  const nasty = ["\u0000", "𐀀\uD800", "\u{1F600}".repeat(5000), "Á".repeat(1000), "‮evil", "J".repeat(100000)];
  for (const k of nasty) {
    for (const t of nasty) {
      for (const v of ["ij", "noq"] as const) {
        for (const d of ["encrypt", "decrypt"] as const) {
          const r = runPlayfair({ keyword: k, text: t, variant: v, direction: d, filler: "X" });
          assert.equal(r.square.letters.length, 25);
          if (r.ok) assert.equal(r.output.length, r.steps.length * 2);
        }
      }
    }
  }
});

test("every step keeps rows on the rectangle rule and shifts by one otherwise", () => {
  const r = enc("ROYAL NEW ZEALAND NAVY", "the quick brown fox jumps over the lazy dog");
  assert.equal(r.output, "QKNSSMKTVOYEZVLSMSPHOEBNYQINRLWAELPL");
  assert.equal(enc("CHARLES", "the quick brown fox jumps over the lazy dog").output, "PRBOPNAGDAPVUNQVNPITEPCGDYCSCRVZETKV");
  for (const s of r.steps) {
    if (s.rule === "rectangle") {
      assert.equal(s.to[0].row, s.from[0].row);
      assert.equal(s.to[0].col, s.from[1].col);
    } else if (s.rule === "row") {
      assert.equal(s.to[0].col, (s.from[0].col + 1) % 5);
    } else {
      assert.equal(s.to[0].row, (s.from[0].row + 1) % 5);
    }
  }
});

console.log(`playfair-cipher: ${passed} tests passed`);
