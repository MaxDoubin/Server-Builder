import assert from "node:assert/strict";
import {
  VALID_A,
  affineDecrypt,
  affineEncrypt,
  bruteForce,
  chiSquared,
  gcd,
  isValidA,
  letterCounts,
  mod,
  modInverse,
  parseB,
  solveFromPairs,
  specialCase,
  substitutionRow,
} from "../../client/src/lib/toolkit/affine-cipher.ts";

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

t("the twelve multipliers are exactly the residues coprime to 26", () => {
  const expected = Array.from({ length: 26 }, (_, i) => i).filter((a) => gcd(a, 26) === 1);
  assert.deepEqual([...VALID_A], expected);
  assert.equal(VALID_A.length, 12);
  assert.equal(isValidA(13), false);
  assert.equal(isValidA(2), false);
  assert.equal(isValidA(0), false);
});

t("modular inverses mod 26 match the published table", () => {
  const table: Record<number, number> = { 1: 1, 3: 9, 5: 21, 7: 15, 9: 3, 11: 19, 15: 7, 17: 23, 19: 11, 21: 5, 23: 17, 25: 25 };
  for (const a of VALID_A) {
    assert.equal(modInverse(a), table[a], `inverse of ${a}`);
    assert.equal(mod(a * table[a]), 1);
  }
  assert.equal(modInverse(13), null);
  assert.equal(modInverse(2), null);
  assert.equal(modInverse(0), null);
  assert.equal(modInverse(13, 2), 1);
  assert.equal(modInverse(4, 13), 10);
});

t("mod gives the least non-negative residue", () => {
  assert.equal(mod(-1), 25);
  assert.equal(mod(-26), 0);
  assert.equal(mod(27), 1);
});

t("Wikipedia worked example: AFFINE CIPHER with a = 5, b = 8", () => {
  assert.equal(affineEncrypt("AFFINE CIPHER", 5, 8), "IHHWVC SWFRCP");
  assert.equal(affineDecrypt("IHHWVC SWFRCP", 5, 8), "AFFINE CIPHER");
});

t("case and punctuation are preserved", () => {
  assert.equal(affineEncrypt("Affine, cipher! 123", 5, 8), "Ihhwvc, swfrcp! 123");
});

t("Caesar and Atbash are special cases", () => {
  assert.equal(affineEncrypt("HELLO", 1, 3), "KHOOR");
  assert.equal(affineEncrypt("abcxyz", 25, 25), "zyxcba");
  assert.equal(substitutionRow(25, 25), "ZYXWVUTSRQPONMLKJIHGFEDCBA");
  assert.equal(affineEncrypt("Why did the chicken", 1, 13), "Jul qvq gur puvpxra");
  assert.match(specialCase(1, 3)!, /Caesar/);
  assert.match(specialCase(1, 13)!, /ROT13/);
  assert.match(specialCase(25, 25)!, /Atbash/);
  assert.match(specialCase(1, 0)!, /Identity/);
  assert.match(specialCase(25, 4)!, /own inverse/);
  assert.equal(specialCase(5, 8), null);
});

t("every a = 25 key is an involution, and no other non-trivial key is", () => {
  for (const a of VALID_A) {
    for (let b = 0; b < 26; b++) {
      const row = substitutionRow(a, b);
      const twice = affineEncrypt(row, a, b);
      const involution = twice === "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const expected = a === 25 || (a === 1 && (b === 0 || b === 13));
      assert.equal(involution, expected, `a=${a} b=${b}`);
    }
  }
});

t("all 312 keys are distinct permutations and decrypt inverts encrypt", () => {
  const seen = new Set<string>();
  const sample = "The Quick Brown Fox Jumps Over The Lazy Dog";
  for (const a of VALID_A) {
    for (let b = 0; b < 26; b++) {
      const row = substitutionRow(a, b);
      assert.equal(new Set(row).size, 26);
      seen.add(row);
      assert.equal(affineDecrypt(affineEncrypt(sample, a, b), a, b), sample);
    }
  }
  assert.equal(seen.size, 312);
});

t("invalid a throws a RangeError rather than producing a non-bijection", () => {
  assert.throws(() => affineEncrypt("x", 13, 0), RangeError);
  assert.throws(() => affineDecrypt("x", 2, 0), RangeError);
});

t("parseB reduces any integer mod 26, BigInt exact", () => {
  assert.deepEqual(parseB("8"), { ok: true, value: 8, note: null });
  assert.deepEqual(parseB(" 0 "), { ok: true, value: 0, note: null });
  const r = parseB("29");
  assert.ok(r.ok && r.value === 3 && r.note === "29 reduces to 3 mod 26.");
  const neg = parseB("-1");
  assert.ok(neg.ok && neg.value === 25);
  // 10^30 mod 26: 10 mod 26 = 10, 10^2 = 100 mod 26 = 22, 10^3 = 220 mod 26 = 12 ...
  let expect = 1;
  for (let i = 0; i < 30; i++) expect = (expect * 10) % 26;
  const huge = parseB("1" + "0".repeat(30));
  assert.ok(huge.ok && huge.value === expect);
  assert.equal(parseB("").ok, false);
  assert.equal(parseB("3.5").ok, false);
  assert.equal(parseB("abc").ok, false);
  assert.equal(parseB("9".repeat(41)).ok, false);
});

t("chi-squared is null for no letters and zero for exact English proportions is impossible, but low for English", () => {
  assert.equal(chiSquared(letterCounts("123 !!")), null);
  const english = "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness";
  const scoreEnglish = chiSquared(letterCounts(english))!;
  const scoreCipher = chiSquared(letterCounts(affineEncrypt(english, 7, 3)))!;
  assert.ok(scoreEnglish < scoreCipher);
});

t("brute force ranks the true key first for a paragraph of English", () => {
  const plain =
    "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.";
  for (const [a, b] of [
    [7, 3],
    [5, 8],
    [25, 25],
    [1, 13],
    [19, 0],
  ]) {
    const ct = affineEncrypt(plain, a, b);
    const { candidates, letters } = bruteForce(ct);
    assert.equal(candidates.length, 312);
    assert.equal(letters, letterCounts(plain).reduce((s, c) => s + c, 0));
    assert.deepEqual([candidates[0].a, candidates[0].b], [a, b], `key ${a},${b}`);
    assert.ok(candidates[0].preview.startsWith("It was the best"));
  }
});

t("brute force scores match decrypting the whole text", () => {
  const ct = "Ihhwvc swfrcp, qdwvb hroc";
  const { candidates } = bruteForce(ct);
  for (const c of candidates.slice(0, 40)) {
    const direct = chiSquared(letterCounts(affineDecrypt(ct, c.a, c.b)));
    assert.ok(Math.abs((direct ?? 0) - (c.score ?? 0)) < 1e-9);
  }
  // Sorted ascending.
  for (let i = 1; i < candidates.length; i++) assert.ok(candidates[i - 1].score! <= candidates[i].score!);
});

t("brute force on text without letters keeps all 312, unscored, in key order", () => {
  const { candidates, letters } = bruteForce("12345 !!!");
  assert.equal(letters, 0);
  assert.equal(candidates.length, 312);
  assert.ok(candidates.every((c) => c.score === null));
  assert.deepEqual([candidates[0].a, candidates[0].b], [1, 0]);
  assert.deepEqual([candidates[311].a, candidates[311].b], [25, 25]);
  assert.equal(bruteForce("").candidates.length, 312);
});

t("solve: E->R and T->I gives a = 15, b = 9 with working", () => {
  const r = solveFromPairs("E", "R", "T", "I");
  assert.ok(r.ok);
  assert.deepEqual(r.keys, [{ a: 15, b: 9 }]);
  assert.equal(affineEncrypt("ET", 15, 9), "RI");
  assert.ok(r.steps.some((s) => s.includes("gcd(11, 26) = 1")));
  assert.ok(r.steps.some((s) => s.includes("11 × 19 = 209 = 8 × 26 + 1")));
  assert.ok(r.steps.some((s) => s.includes("a ≡ 9 × 19 = 171 ≡ 15 (mod 26)")));
  assert.ok(r.steps.some((s) => s.includes("b ≡ 17 - 15 × 4 = -43 ≡ 9 (mod 26)")));
  assert.equal(r.verdict, "The key is a = 15, b = 9.");
});

t("solve: Wikipedia key (5, 8) from A->I and F->H", () => {
  const r = solveFromPairs("a", "i", "f", "h");
  assert.ok(r.ok);
  assert.deepEqual(r.keys, [{ a: 5, b: 8 }]);
});

t("solve: even difference gives two candidates, one valid", () => {
  // Key (3, 5): A->F, C->L. d = 0 - 2 = -2 = 24, gcd 2.
  assert.equal(affineEncrypt("AC", 3, 5), "FL");
  const r = solveFromPairs("A", "F", "C", "L");
  assert.ok(r.ok);
  assert.deepEqual(r.keys, [{ a: 3, b: 5 }]);
  assert.ok(r.steps.some((s) => s.includes("gcd(24, 26) = 2")));
  assert.ok(r.steps.some((s) => s.includes("16 shares a factor with 26")));
});

t("solve: difference of 13 leaves all 12 multipliers", () => {
  // Key (7, 2): A->C, N->(91+2)%26 = 15 = P.
  assert.equal(affineEncrypt("AN", 7, 2), "CP");
  const r = solveFromPairs("A", "C", "N", "P");
  assert.ok(r.ok);
  assert.equal(r.keys.length, 12);
  assert.ok(r.keys.some((k) => k.a === 7 && k.b === 2));
  assert.match(r.verdict, /12 keys fit/);
});

t("solve: same letter twice, consistent and inconsistent", () => {
  const same = solveFromPairs("E", "R", "E", "R");
  assert.ok(same.ok && same.keys.length === 12);
  const contra = solveFromPairs("E", "R", "E", "S");
  assert.ok(contra.ok && contra.keys.length === 0);
});

t("solve: no solution when gcd does not divide e", () => {
  // d = 2, e = 1: 2a = 1 mod 26 has no solution.
  const r = solveFromPairs("C", "B", "A", "A");
  assert.ok(r.ok && r.keys.length === 0);
  assert.ok(r.steps.some((s) => s.includes("2 does not divide 1")));
});

t("solve: unique a that is not coprime is rejected", () => {
  // d = 1 (B - A), e = 2 (C - A): a = 2, not coprime.
  const r = solveFromPairs("B", "C", "A", "A");
  assert.ok(r.ok && r.keys.length === 0);
  assert.ok(r.steps.some((s) => s.includes("a = 2 shares a factor with 26")));
});

t("solve: input validation", () => {
  assert.equal(solveFromPairs("", "R", "T", "I").ok, false);
  assert.equal(solveFromPairs("EE", "R", "T", "I").ok, false);
  assert.equal(solveFromPairs("E", "7", "T", "I").ok, false);
  assert.equal(solveFromPairs("é", "R", "T", "I").ok, false);
  assert.equal(solveFromPairs(" e ", "R", "T", "I").ok, true);
});

t("solve agrees with exhaustive search over every pair of pairs", () => {
  const L = (i: number) => String.fromCharCode(65 + i);
  const keyRows = VALID_A.flatMap((a) => Array.from({ length: 26 }, (_, b) => ({ a, b, row: substitutionRow(a, b) })));
  for (let p1 = 0; p1 < 26; p1++) {
    for (let p2 = 0; p2 < 26; p2++) {
      for (let c1 = 0; c1 < 26; c1++) {
        for (let c2 = 0; c2 < 26; c2++) {
          const expected = keyRows
            .filter((k) => k.row[p1] === L(c1) && k.row[p2] === L(c2))
            .map((k) => `${k.a},${k.b}`)
            .sort();
          const r = solveFromPairs(L(p1), L(c1), L(p2), L(c2));
          assert.ok(r.ok);
          const got = r.keys.map((k) => `${k.a},${k.b}`).sort();
          if (got.join("|") !== expected.join("|")) {
            assert.fail(`${L(p1)}${L(c1)} ${L(p2)}${L(c2)}: got ${got} expected ${expected}`);
          }
        }
      }
    }
  }
});


/* ------------------------------------------------------------------ *
 * Independent verifier cases. Every expected value below was worked by
 * hand from E(x) = (a x + b) mod 26 with A = 0, not taken from the code.
 * ------------------------------------------------------------------ */

t("verifier: HELLO under (5, 8) is RCLLA", () => {
  // H 7 -> 43 mod 26 = 17 R; E 4 -> 28 = 2 C; L 11 -> 63 = 11 L; O 14 -> 78 = 0 A.
  assert.equal(affineEncrypt("HELLO", 5, 8), "RCLLA");
  assert.equal(affineDecrypt("RCLLA", 5, 8), "HELLO");
});

t("verifier: ATTACKATDAWN under (7, 3) is DGGDRVDGYDBQ", () => {
  // A 0 -> 3 D; T 19 -> 136 = 6 G; C 2 -> 17 R; K 10 -> 73 = 21 V; D 3 -> 24 Y; W 22 -> 157 = 1 B; N 13 -> 94 = 16 Q.
  assert.equal(affineEncrypt("ATTACKATDAWN", 7, 3), "DGGDRVDGYDBQ");
  assert.equal(affineDecrypt("dggdrvdgydbq", 7, 3), "attackatdawn");
});

t("verifier: Atbash and Caesar 3 classic sentences", () => {
  assert.equal(affineEncrypt("Hello, World!", 25, 25), "Svool, Dliow!");
  assert.equal(affineDecrypt("Svool, Dliow!", 25, 25), "Hello, World!");
  assert.equal(
    affineEncrypt("The quick brown fox jumps over the lazy dog", 1, 3),
    "Wkh txlfn eurzq ira mxpsv ryhu wkh odcb grj",
  );
});

t("verifier: decryption table D(y) = a^-1 (y - b) for (11, 19)", () => {
  // a^-1 = 19. D(A) = 19 * (0 - 19) = -361 mod 26 = 3 -> D. Check: E(D) = 33 + 19 = 52 = 0 -> A.
  assert.equal(affineDecrypt("A", 11, 19), "D");
  assert.equal(affineEncrypt("D", 11, 19), "A");
});

t("verifier: non-ASCII letters, digits, emoji and lone surrogates pass through", () => {
  const s = "Ça va? 42 😀 \uD800 ß Ω";
  const e = affineEncrypt(s, 5, 8);
  // v 21 -> 113 mod 26 = 9 j; a 0 -> 8 i.
  assert.equal(e, "Çi ji? 42 😀 \uD800 ß Ω");
  assert.equal(affineDecrypt(e, 5, 8), s);
  assert.equal(affineEncrypt("", 3, 0), "");
});

t("verifier: parseB edge cases", () => {
  const m27 = parseB("-27");
  assert.ok(m27.ok && m27.value === 25 && m27.note === "-27 reduces to 25 mod 26.");
  const p26 = parseB("26");
  assert.ok(p26.ok && p26.value === 0 && p26.note !== null);
  assert.deepEqual(parseB(" +3 "), { ok: true, value: 3, note: null });
  const negZero = parseB("-0");
  assert.ok(negZero.ok && negZero.value === 0);
  assert.equal(parseB("٣").ok, false); // Arabic-Indic digit three
  assert.equal(parseB("1e3").ok, false);
  assert.equal(parseB("0x1A").ok, false);
  assert.equal(parseB("--3").ok, false);
  assert.equal(parseB("9".repeat(40)).ok, true);
  // 2^64 mod 26: 2^64 = 18446744073709551616; computed exactly with BigInt.
  const p64 = parseB("18446744073709551616");
  assert.ok(p64.ok && p64.value === Number((1n << 64n) % 26n));
  assert.equal(Number((1n << 64n) % 26n), 16);
});

t("verifier: chi-squared identity sum(c^2/e) - N for a single repeated letter", () => {
  // Ten E's: chi^2 = sum over x of (c - e)^2 / e. With every count in E this is
  // sum_x e_x - e_E + (10 - e_E)^2 / e_E.
  const counts = new Array(26).fill(0);
  counts[4] = 10;
  const freqSum = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507,
    1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.36, 0.15, 1.974, 0.074].reduce((s, f) => s + f, 0);
  const eE = (10 * 12.702) / 100;
  const expected = (10 * freqSum) / 100 - eE + (10 - eE) ** 2 / eE;
  assert.ok(Math.abs(chiSquared(counts)! - expected) < 1e-9);
  assert.ok(Math.abs(expected - 68.7273) < 0.01);
});

t("verifier: brute force on (7, 3) ciphertext of a second paragraph", () => {
  const plain =
    "Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.";
  for (const [a, b] of [
    [7, 3],
    [3, 25],
    [23, 11],
  ]) {
    const { candidates } = bruteForce(affineEncrypt(plain, a, b));
    assert.deepEqual([candidates[0].a, candidates[0].b], [a, b]);
    assert.ok(candidates[0].preview.startsWith("Call me Ishmael"));
  }
});

t("verifier: brute force preview collapses whitespace and survives astral text", () => {
  const { candidates } = bruteForce("Ab\n\n\tcd " + "😀".repeat(300), 10);
  const id = candidates.find((c) => c.a === 1 && c.b === 0)!;
  assert.equal(id.preview, "Ab cd " + "😀".repeat(2)); // 10 code points are taken, then whitespace runs collapse
});

t("verifier: solver worked cases", () => {
  // Default page pairs: E -> C, T -> Z. d = 4 - 19 = -15 = 11, e = 2 - 25 = -23 = 3,
  // 11^-1 = 19, a = 57 mod 26 = 5, b = 2 - 20 = -18 = 8.
  const r = solveFromPairs("E", "C", "T", "Z");
  assert.ok(r.ok);
  assert.deepEqual(r.keys, [{ a: 5, b: 8 }]);
  assert.ok(r.steps.some((s) => s.includes("a ≡ 3 × 19 = 57 ≡ 5 (mod 26)")));
  // A -> A, N -> N: 13a = 13 (mod 26), every odd a, and b = 0 each time.
  const all = solveFromPairs("A", "A", "N", "N");
  assert.ok(all.ok && all.keys.length === 12 && all.keys.every((k) => k.b === 0));
  // A -> A, N -> A: 13a = 0 needs a even, so nothing.
  const none13 = solveFromPairs("A", "A", "N", "A");
  assert.ok(none13.ok && none13.keys.length === 0);
  assert.ok(none13.steps.some((s) => s.includes("None of them is coprime to 26")));
  // A -> A, C -> A: two letters to one, 24a = 0 gives a = 0 or 13, neither valid.
  const collide = solveFromPairs("A", "A", "C", "A");
  assert.ok(collide.ok && collide.keys.length === 0);
  // Lowercase input is accepted.
  const lower = solveFromPairs("e", "c", "t", "z");
  assert.ok(lower.ok && lower.keys.length === 1);
});

t("verifier: modInverse by extended Euclid on other moduli", () => {
  assert.equal(modInverse(3, 7), 5);
  assert.equal(modInverse(10, 17), 12); // 120 = 7 * 17 + 1
  assert.equal(modInverse(-3, 26), 17); // -3 = 23, 23 * 17 = 391 = 15 * 26 + 1
  assert.equal(modInverse(6, 9), null);
  assert.equal(modInverse(1, 1), 0);
});

console.log(`affine-cipher: ${n} tests passed`);
