import assert from "node:assert/strict";
import {
  AMBIGUOUS,
  CHAR_CLASSES,
  SYMBOLS,
  byteModuloBias,
  countContainingEach,
  cryptoSource,
  generateCodes,
  generatePasswords,
  log2Big,
  planCode,
  planPassword,
  rejectionLimit,
  rejectionRate,
  uniformIndex,
  type PasswordOptions,
  type PasswordPlan,
  type Uint32Source,
} from "../../client/src/lib/toolkit/password-generator";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const ALL = { lower: true, upper: true, digits: true, symbols: true };
const base = (over: Partial<PasswordOptions> = {}): PasswordOptions => ({
  length: 16,
  classes: { ...ALL },
  excludeAmbiguous: false,
  exclude: "",
  requireEach: false,
  ...over,
});

function chiSquare(counts: number[], expected: number): number {
  return counts.reduce((s, c) => s + ((c - expected) * (c - expected)) / expected, 0);
}

function fromList(values: number[]): Uint32Source {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("source exhausted");
    return values[i++];
  };
}

/* Alphabets */
test("class sizes", () => {
  assert.equal(SYMBOLS.length, 32);
  assert.equal(new Set(SYMBOLS).size, 32);
  const all = CHAR_CLASSES.map((c) => c.chars).join("");
  assert.equal(all.length, 94);
  // The 94 printable ASCII characters other than space, 0x21 to 0x7E.
  for (let code = 0x21; code <= 0x7e; code++) assert.ok(all.includes(String.fromCharCode(code)));
  for (const ch of AMBIGUOUS) assert.ok(all.includes(ch));
});

/* Rejection sampling */
test("rejection limit divides evenly", () => {
  for (let n = 1; n <= 300; n++) {
    const limit = rejectionLimit(n);
    assert.equal(limit % n, 0, `n=${n}`);
    assert.ok(2 ** 32 - limit < n);
  }
  assert.equal(rejectionLimit(94), 2 ** 32 - 42);
  assert.equal(rejectionLimit(16), 2 ** 32);
});

test("uniformIndex rejects values at or above the limit", () => {
  const limit = rejectionLimit(94);
  assert.equal(uniformIndex(94, fromList([limit, 2 ** 32 - 1, 95])), 1);
  assert.equal(uniformIndex(94, fromList([limit - 1])), 93);
  assert.equal(uniformIndex(94, fromList([0])), 0);
  assert.equal(uniformIndex(16, fromList([2 ** 32 - 1])), 15); // no rejection when n divides 2^32
  assert.throws(() => uniformIndex(94, () => 2 ** 32 - 1), /rejected/);
  assert.throws(() => uniformIndex(0, () => 0), RangeError);
});

test("byte modulo bias numbers", () => {
  assert.deepEqual(byteModuloBias(62), { favored: 8, pHigh: 5 / 256, pLow: 4 / 256, ratio: 1.25 });
  assert.deepEqual(byteModuloBias(94), { favored: 68, pHigh: 3 / 256, pLow: 2 / 256, ratio: 1.5 });
  assert.deepEqual(byteModuloBias(16), { favored: 0, pHigh: 1 / 16, pLow: 1 / 16, ratio: 1 });
  assert.equal(byteModuloBias(300), null);
  assert.equal(rejectionRate(94), 42 / 2 ** 32);
  assert.equal(rejectionRate(32), 0);
});

test("crypto source is uniform, byte modulo is not (chi-square, df 93)", () => {
  const next = cryptoSource();
  assert.ok(next);
  const n = 94;
  const samples = 94 * 10000;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < samples; i++) counts[uniformIndex(n, next!)]++;
  const chi = chiSquare(counts, samples / n);
  // P(chi2 with 93 df > 170) is far below one in a million.
  assert.ok(chi < 170, `chi-square ${chi}`);

  const naive = new Array(n).fill(0);
  const bytes = new Uint8Array(samples);
  globalThis.crypto.getRandomValues(bytes.subarray(0, 65536));
  for (let off = 0; off < samples; off += 65536) globalThis.crypto.getRandomValues(bytes.subarray(off, off + 65536));
  for (const b of bytes) naive[b % n]++;
  assert.ok(chiSquare(naive, samples / n) > 10000, "byte % 94 should be grossly biased");
});

/* Counting and entropy */
test("log2Big", () => {
  assert.equal(log2Big(1n), 0);
  assert.equal(log2Big(1n << 100n), 100);
  assert.ok(Math.abs(log2Big(94n ** 16n) - 16 * Math.log2(94)) < 1e-9);
  assert.ok(Math.abs(log2Big(94n ** 128n) - 128 * Math.log2(94)) < 1e-9);
  assert.equal(log2Big(0n), -Infinity);
});

test("inclusion-exclusion matches brute force", () => {
  const cases: [number[], number][] = [
    [[2, 1, 3], 4],
    [[1, 1], 3],
    [[3, 2, 1, 2], 5],
    [[4], 3],
  ];
  for (const [sizes, length] of cases) {
    const total = sizes.reduce((a, b) => a + b, 0);
    const owner: number[] = [];
    sizes.forEach((s, g) => {
      for (let i = 0; i < s; i++) owner.push(g);
    });
    let brute = 0;
    const idx = new Array(length).fill(0);
    for (let iter = 0; iter < total ** length; iter++) {
      let x = iter;
      for (let p = 0; p < length; p++) {
        idx[p] = x % total;
        x = Math.floor(x / total);
      }
      const seen = new Set(idx.map((i) => owner[i]));
      if (seen.size === sizes.length) brute++;
    }
    assert.equal(countContainingEach(total, sizes, length), BigInt(brute), `${sizes} L=${length}`);
  }
});

test("plan: defaults, exclusions and entropy", () => {
  const p = planPassword(base());
  assert.ok(p.ok);
  assert.equal(p.alphabet.length, 94);
  assert.ok(Math.abs(p.bits - 104.873) < 0.001, String(p.bits)); // 16 x log2(94)
  assert.equal(p.acceptance, 1);

  const amb = planPassword(base({ excludeAmbiguous: true }));
  assert.equal(amb.alphabet.length, 87);
  for (const ch of AMBIGUOUS) assert.ok(!amb.alphabet.includes(ch));

  const custom = planPassword(base({ exclude: "\"'`\\ " }));
  assert.equal(custom.alphabet.length, 90);

  const digits = planPassword(base({ classes: { lower: false, upper: false, digits: true, symbols: false }, length: 8 }));
  assert.ok(Math.abs(digits.bits - 8 * Math.log2(10)) < 1e-12);

  // Clamping
  assert.equal(planPassword(base({ length: 3 })).length, 8);
  assert.equal(planPassword(base({ length: 1e9 })).length, 128);
  assert.equal(planPassword(base({ length: NaN })).length, 8);
});

test("plan: every-class rule lowers entropy by exactly -log2(acceptance)", () => {
  const p = planPassword(base({ length: 8, requireEach: true }));
  assert.ok(p.ok);
  const count = countContainingEach(94, [26, 26, 10, 32], 8);
  assert.equal(p.spaceSize, count);
  const exactAcceptance = Number((count * 10n ** 15n) / 94n ** 8n) / 1e15;
  assert.ok(Math.abs(p.acceptance - exactAcceptance) < 1e-12);
  assert.ok(p.bits < p.unconstrainedBits);
  assert.ok(Math.abs(p.unconstrainedBits - p.bits + Math.log2(p.acceptance)) < 1e-9);
  // Long passwords nearly always contain every class already.
  const long = planPassword(base({ length: 128, requireEach: true }));
  assert.ok(long.acceptance > 0.999999);
});

test("plan: errors and warnings", () => {
  assert.match(planPassword(base({ classes: { lower: false, upper: false, digits: false, symbols: false } })).error!, /at least one/);
  assert.match(planPassword(base({ requireEach: true, exclude: "0123456789" })).error!, /digits character is excluded/);
  const warn = planPassword(base({ exclude: "0123456789" }));
  assert.ok(warn.ok && warn.warnings.length === 1 && warn.alphabet.length === 84);
  assert.match(
    planPassword(base({ classes: { lower: false, upper: false, digits: true, symbols: false }, exclude: "012345678" })).error!,
    /Only "9"/,
  );
  assert.match(
    planPassword(base({ classes: { lower: false, upper: false, digits: true, symbols: false }, exclude: "0123456789" })).error!,
    /nothing left/,
  );
  // Huge exclusion input is read only up to the cap and does not throw.
  assert.ok(planPassword(base({ exclude: "x".repeat(1_000_000) })).ok);
});

test("generate: lengths, alphabet, and every class present", () => {
  const next = cryptoSource()!;
  const p = planPassword(base({ length: 8, requireEach: true, excludeAmbiguous: true }));
  const r = generatePasswords(p, 50, next);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.values.length, 50);
  for (const pw of r.values) {
    assert.equal(pw.length, 8);
    for (const ch of pw) assert.ok(p.alphabet.includes(ch));
    for (const g of p.groups) assert.ok([...pw].some((ch) => g.chars.includes(ch)), `${pw} lacks ${g.label}`);
  }
  // count is clamped
  const many = generatePasswords(planPassword(base()), 10_000, next);
  assert.ok(many.ok && many.values.length === 50);
});

test("generate: regeneration is uniform over the acceptable set", () => {
  // Alphabet {a, b, c} with groups {a} and {b, c}, length 3. 27 strings, of
  // which 8 lack a and 1 (aaa) lacks the second group: 18 acceptable, each
  // of which must come out equally often.
  const plan: PasswordPlan = {
    ok: true,
    error: null,
    warnings: [],
    alphabet: ["a", "b", "c"],
    groups: [
      { id: "lower", label: "A", chars: ["a"] },
      { id: "upper", label: "B", chars: ["b", "c"] },
    ],
    length: 3,
    unconstrainedBits: 3 * Math.log2(3),
    bits: Math.log2(18),
    acceptance: 18 / 27,
    enforceEach: true,
    rejectShare: 9 / 27,
    spaceSize: 18n,
  };
  assert.equal(countContainingEach(3, [1, 2], 3), 18n);
  const next = cryptoSource()!;
  const tally = new Map<string, number>();
  const rounds = 3600;
  for (let i = 0; i < rounds; i++) {
    const r = generatePasswords(plan, 50, next);
    assert.ok(r.ok);
    if (r.ok) for (const v of r.values) tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  assert.equal(tally.size, 18);
  assert.ok(!tally.has("aaa") && !tally.has("bcb"));
  const chi = chiSquare([...tally.values()], (rounds * 50) / 18);
  // df 17: P(chi2 > 60) is below one in a million.
  assert.ok(chi < 60, `chi-square ${chi}`);
});

test("generate: broken source fails gracefully", () => {
  const r = generatePasswords(planPassword(base()), 1, () => 2 ** 32 - 1);
  assert.equal(r.ok, false);
  const bad = generatePasswords(planPassword(base({ classes: { lower: false, upper: false, digits: false, symbols: false } })), 1, cryptoSource()!);
  assert.equal(bad.ok, false);
});

test("codes", () => {
  const p = planCode({ alphabet: "digits", groups: 4, groupSize: 4, separator: "-" });
  assert.ok(Math.abs(p.bits - 16 * Math.log2(10)) < 1e-12);
  const r = generateCodes(p, 20, cryptoSource()!);
  assert.ok(r.ok);
  if (r.ok) for (const v of r.values) assert.match(v, /^[0-9]{4}(-[0-9]{4}){3}$/);

  const c = planCode({ alphabet: "crockford", groups: 5, groupSize: 5, separator: " " });
  assert.equal(c.bits, 125);
  const rc = generateCodes(c, 20, cryptoSource()!);
  if (rc.ok) for (const v of rc.values) assert.match(v, /^[0-9A-HJKMNP-TV-Z]{5}( [0-9A-HJKMNP-TV-Z]{5}){4}$/);

  const h = planCode({ alphabet: "hex", groups: 1, groupSize: 8, separator: "" });
  assert.equal(h.bits, 32);
  const clamped = planCode({ alphabet: "hex", groups: 999, groupSize: -4, separator: "/" as never });
  assert.equal(clamped.groups, 16);
  assert.equal(clamped.groupSize, 1);
  assert.equal(clamped.separator, "-");
});

/* ------------------------------------------------------------------
 * Independent verifier additions.
 * ------------------------------------------------------------------ */

test("verifier: every-class rule is enforced even when acceptance rounds to 1", () => {
  // Lower and upper at 128 characters: a draw misses a class with
  // probability 2 x 2^-128, so acceptance is exactly 1 in floating point.
  const plan = planPassword(base({ length: 128, classes: { lower: true, upper: true, digits: false, symbols: false }, requireEach: true }));
  assert.ok(plan.ok);
  // Before the fix this came out as 1.0000000000000788 and the rule was skipped.
  assert.ok(plan.acceptance <= 1);
  assert.ok(plan.bits <= plan.unconstrainedBits);
  assert.equal(plan.enforceEach, true);
  assert.ok(Math.abs(Math.log2(plan.rejectShare) - -127) < 1e-9, `rejectShare ${plan.rejectShare}`);
  // First draw: 128 values that all map to "a". Second draw: alternate a, A.
  const values = [...new Array(128).fill(0), ...Array.from({ length: 128 }, (_, i) => (i % 2 ? 26 : 0))];
  const r = generatePasswords(plan, 1, fromList(values));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (r.ok) {
    assert.equal(r.redraws, 1);
    assert.match(r.values[0], /[A-Z]/);
    assert.match(r.values[0], /[a-z]/);
  }
  // With the rule off the all-lowercase draw is kept as is.
  const off = generatePasswords({ ...plan, enforceEach: false }, 1, fromList(values));
  assert.ok(off.ok && off.values[0] === "a".repeat(128));
});

test("verifier: rejection limits and byte bias reference values", () => {
  // 2^32 = 4294967296 = 69273666 x 62 + 4 = 45691141 x 94 + 42
  assert.equal(rejectionLimit(62), 4294967292);
  assert.equal(rejectionLimit(94), 4294967254);
  assert.equal(rejectionRate(94), 42 / 2 ** 32);
  assert.equal(rejectionLimit(16), 2 ** 32);
  assert.equal(rejectionLimit(1), 2 ** 32);
  // The last accepted value maps to the last character, the first rejected one is skipped.
  assert.equal(uniformIndex(94, fromList([4294967253])), 93);
  assert.equal(uniformIndex(94, fromList([4294967254, 2 ** 32 - 1, 95])), 1);
  assert.equal(uniformIndex(1, fromList([2 ** 32 - 1])), 0);
  assert.throws(() => uniformIndex(0, fromList([1])), RangeError);
  assert.throws(() => uniformIndex(2.5, fromList([1])), RangeError);
  // 256 = 25 x 10 + 6 and 256 = 9 x 26 + 22
  const d = byteModuloBias(10)!;
  assert.deepEqual([d.favored, d.pHigh, d.pLow], [6, 26 / 256, 25 / 256]);
  assert.ok(Math.abs(d.ratio - 1.04) < 1e-12);
  const l = byteModuloBias(26)!;
  assert.equal(l.favored, 22);
  assert.ok(Math.abs(l.ratio - 10 / 9) < 1e-12);
  assert.equal(byteModuloBias(32)!.ratio, 1);
  assert.equal(byteModuloBias(0), null);
  assert.equal(byteModuloBias(257), null);
});

test("verifier: entropy figures quoted in the notes", () => {
  const ent = (classes: Partial<Record<"lower" | "upper" | "digits" | "symbols", boolean>>, length: number) =>
    planPassword(base({ length, classes: { lower: false, upper: false, digits: false, symbols: false, ...classes } }));
  assert.equal(ent(ALL, 16).bits.toFixed(1), "104.9");
  assert.equal(ent({ lower: true, upper: true, digits: true }, 16).bits.toFixed(1), "95.3");
  assert.equal(ent({ lower: true }, 22).bits.toFixed(1), "103.4");
  // Every-class rule at 16 of 94 costs 0.2809 bits (inclusion and exclusion,
  // checked separately in Python with exact integers).
  const req = planPassword(base({ length: 16, requireEach: true }));
  assert.ok(Math.abs(req.unconstrainedBits - req.bits - 0.28090749159460415) < 1e-9);
  assert.ok(Math.abs(req.acceptance - 0.8230731206322299) < 1e-12);
  assert.ok(Math.abs(req.rejectShare - (1 - 0.8230731206322299)) < 1e-12);
  // Codes: 6-digit PIN, 25 Crockford characters, hex.
  const pin = planCode({ alphabet: "digits", groups: 1, groupSize: 6, separator: "" });
  assert.equal(pin.bits.toFixed(1), "19.9");
  assert.equal(10 ** 6 / 1e4 < 120, true); // exhausted in under two minutes at 10^4/s
  assert.equal(planCode({ alphabet: "crockford", groups: 5, groupSize: 5, separator: "-" }).bits, 125);
  assert.equal(planCode({ alphabet: "hex", groups: 2, groupSize: 4, separator: "-" }).bits, 32);
});

test("verifier: code alphabets", () => {
  const crock = planCode({ alphabet: "crockford", groups: 1, groupSize: 1, separator: "" }).alphabet;
  assert.equal(crock.length, 32);
  assert.equal(new Set(crock).size, 32);
  for (const ch of "ILOU") assert.ok(!crock.includes(ch), ch);
  const r = generateCodes(planCode({ alphabet: "crockford", groups: 4, groupSize: 5, separator: " " }), 50, cryptoSource()!);
  assert.ok(r.ok);
  if (r.ok) for (const v of r.values) assert.match(v, /^[0-9A-HJKMNP-TV-Z]{5}( [0-9A-HJKMNP-TV-Z]{5}){3}$/);
  const hex = generateCodes(planCode({ alphabet: "hex", groups: 3, groupSize: 2, separator: "." }), 3, cryptoSource()!);
  assert.ok(hex.ok && hex.values.every((v) => /^[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}$/.test(v)));
});

test("verifier: hostile options never throw", () => {
  for (const length of [Number.NaN, Infinity, -Infinity, -5, 0, 7, 8.5, 1e9, Number.MAX_SAFE_INTEGER]) {
    const plan = planPassword(base({ length }));
    assert.ok(plan.ok);
    assert.ok(plan.length >= 8 && plan.length <= 128 && Number.isInteger(plan.length), String(length));
    const r = generatePasswords(plan, Number.NaN, cryptoSource()!);
    assert.ok(r.ok && r.values.length === 1 && r.values[0].length === plan.length);
  }
  assert.equal(planPassword(base({ length: 8.5 })).length, 9);
  assert.equal(planPassword(base({ length: 1e9 })).length, 128);
  const many = generatePasswords(planPassword(base()), 1e9, cryptoSource()!);
  assert.ok(many.ok && many.values.length === 50);
  // Exclusions with astral characters, lone surrogates and a huge string.
  const weird = planPassword(base({ exclude: "\u{1F600}\uD800abc" + "!".repeat(1_000_000) + "x" }));
  assert.ok(weird.ok);
  // Only the first 200 code units are read, so "x" at the far end stays in.
  assert.ok(!weird.alphabet.includes("a") && !weird.alphabet.includes("!") && weird.alphabet.includes("x"));
  assert.equal(weird.alphabet.length, 90);
  // Missing class keys behave as unselected.
  const sparse = planPassword(base({ classes: { digits: true } as Record<"lower" | "upper" | "digits" | "symbols", boolean> }));
  assert.ok(sparse.ok && sparse.alphabet.length === 10);
  // Exclude everything in one required class.
  const noDigits = planPassword(base({ exclude: "0123456789", requireEach: true }));
  assert.equal(noDigits.ok, false);
  const noDigitsOff = planPassword(base({ exclude: "0123456789", requireEach: false }));
  assert.ok(noDigitsOff.ok && noDigitsOff.warnings.length === 1 && noDigitsOff.alphabet.length === 84);
  // Bad code options fall back to defaults.
  const code = planCode({ alphabet: "nope" as "digits", groups: Number.NaN, groupSize: -3, separator: "/" as "-" });
  assert.deepEqual([code.alphabet.length, code.groups, code.groupSize, code.separator], [10, 1, 1, "-"]);
});

test("verifier: sparse required classes still generate uniformly and completely", () => {
  // Leaves a, B and 1 as the only lower, upper and digit characters.
  const exclude = "bcdefghijklmnopqrstuvwxyzACDEFGHIJKLMNOPQRSTUVWXYZ023456789";
  const plan = planPassword(base({ length: 8, exclude, requireEach: true }));
  assert.ok(plan.ok, plan.error ?? "");
  assert.equal(plan.alphabet.length, 35);
  // Exact acceptance from inclusion and exclusion over sizes 1, 1, 1, 32.
  const expected = Number(countContainingEach(35, [1, 1, 1, 32], 8)) / 35 ** 8;
  assert.ok(Math.abs(plan.acceptance - expected) < 1e-12);
  const r = generatePasswords(plan, 50, cryptoSource()!);
  assert.ok(r.ok);
  if (r.ok) for (const v of r.values) assert.ok(/a/.test(v) && /B/.test(v) && /1/.test(v) && /[^aB1]/.test(v), v);
});

console.log(`password-generator: ${passed} tests passed`);
