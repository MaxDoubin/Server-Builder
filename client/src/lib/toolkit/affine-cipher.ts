/**
 * The affine cipher over the 26 letter alphabet.
 *
 *   E(x) = (a * x + b) mod 26
 *   D(y) = a^-1 * (y - b) mod 26
 *
 * with A = 0 through Z = 25. The map is a bijection only when gcd(a, 26) = 1,
 * which leaves phi(26) = 12 multipliers and 12 * 26 = 312 keys. a = 1 is the
 * Caesar family and a = 25, b = 25 is Atbash.
 *
 * Case is preserved and anything that is not A to Z passes through, the same
 * convention as the classical ciphers tool. Every number here is below 26 *
 * 26, so plain integers are exact; the only BigInt is in parsing b, where a
 * reader may type a number too large for a double.
 *
 * Pure functions, no React and no DOM.
 */

export const M = 26;

/** The twelve multipliers coprime to 26, in order. */
export const VALID_A: readonly number[] = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

/** Longest text accepted, in UTF-16 code units. */
export const MAX_CHARS = 20_000;

/** Fewer letters than this and a chi-squared ranking is mostly noise. */
export const MIN_LETTERS_FOR_RANKING = 20;

/** Relative frequencies of English letters, as percentages, A to Z. */
export const ENGLISH_FREQ: readonly number[] = [
  8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507,
  1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.36, 0.15, 1.974, 0.074,
];

/** Least non-negative residue, which JavaScript's % does not give for negatives. */
export function mod(n: number, m: number = M): number {
  return ((n % m) + m) % m;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** Inverse of a modulo m by the extended Euclidean algorithm, or null when gcd(a, m) is not 1. */
export function modInverse(a: number, m: number = M): number | null {
  let [oldR, r] = [mod(a, m), m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) return m === 1 ? 0 : null;
  return mod(oldS, m);
}

export function isValidA(a: number): boolean {
  return Number.isInteger(a) && gcd(a, M) === 1;
}

/** Letter to number, A = 0. Null for anything that is not A to Z. */
export function letterValue(ch: string): number | null {
  if (!/^[A-Za-z]$/.test(ch)) return null;
  return ch.toUpperCase().charCodeAt(0) - 65;
}

export function valueLetter(n: number): string {
  return String.fromCharCode(65 + mod(n));
}

function mapLetters(text: string, f: (x: number) => number): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) out += String.fromCharCode(65 + f(code - 65));
    else if (code >= 97 && code <= 122) out += String.fromCharCode(97 + f(code - 97));
    else out += text[i];
  }
  return out;
}

/** Encrypt with E(x) = (a x + b) mod 26. Throws only on a programming error (invalid a). */
export function affineEncrypt(text: string, a: number, b: number): string {
  if (!isValidA(a)) throw new RangeError(`a = ${a} is not coprime to 26`);
  const table = Array.from({ length: M }, (_, x) => mod(a * x + b));
  return mapLetters(text, (x) => table[x]);
}

/** Decrypt with D(y) = a^-1 (y - b) mod 26. */
export function affineDecrypt(text: string, a: number, b: number): string {
  const inv = modInverse(a);
  if (inv === null) throw new RangeError(`a = ${a} is not coprime to 26`);
  const table = Array.from({ length: M }, (_, y) => mod(inv * (y - b)));
  return mapLetters(text, (y) => table[y]);
}

/** Where each plaintext letter goes under the key, A to Z. */
export function substitutionRow(a: number, b: number): string {
  let out = "";
  for (let x = 0; x < M; x += 1) out += valueLetter(a * x + b);
  return out;
}

/** What the key is a special case of, or null for an ordinary key. */
export function specialCase(a: number, b: number): string | null {
  const s = mod(b);
  if (a === 1 && s === 0) return "Identity: a = 1 and b = 0 leave every letter where it is.";
  if (a === 1 && s === 13) return "ROT13: a Caesar shift of 13, which is its own inverse.";
  if (a === 1) return `Caesar: with a = 1 the multiplier does nothing and this is a shift of ${s}.`;
  if (a === 25 && s === 25) return "Atbash: E(x) = 25 - x, so A and Z swap, B and Y, and so on.";
  if (a === 25) return "With a = 25 every key is its own inverse, like Atbash, which is the one with b = 25.";
  return null;
}

/* --------------------------------------------------------------- parsing */

export type ParsedB = { ok: true; value: number; note: string | null } | { ok: false; error: string };

/** Parse the shift. Any integer is accepted and reduced mod 26, and the reduction is reported. */
export function parseB(raw: string): ParsedB {
  const s = raw.trim();
  if (s === "") return { ok: false, error: "Type a shift b from 0 to 25." };
  if (!/^[+-]?\d+$/.test(s)) return { ok: false, error: "The shift b is a whole number, such as 8." };
  if (s.replace(/^[+-]/, "").length > 40) {
    return { ok: false, error: "That number is over 40 digits. b only matters mod 26, so 0 to 25 is enough." };
  }
  const big = BigInt(s);
  const value = Number(((big % BigInt(M)) + BigInt(M)) % BigInt(M));
  const note = big >= BigInt(0) && big < BigInt(M) ? null : `${s} reduces to ${value} mod 26.`;
  return { ok: true, value, note };
}

/* ------------------------------------------------------------ frequency */

export function letterCounts(text: string): number[] {
  const counts = new Array<number>(M).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) counts[code - 65] += 1;
    else if (code >= 97 && code <= 122) counts[code - 97] += 1;
  }
  return counts;
}

/** Pearson's chi-squared distance from English. Lower is closer. Null with no letters. */
export function chiSquared(counts: readonly number[]): number | null {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return null;
  let score = 0;
  for (let x = 0; x < M; x += 1) {
    const expected = (total * ENGLISH_FREQ[x]) / 100;
    const diff = counts[x] - expected;
    score += (diff * diff) / expected;
  }
  return score;
}

export interface Candidate {
  a: number;
  b: number;
  score: number | null;
  /** The start of the text decrypted with this key. */
  preview: string;
}

export interface BruteForce {
  candidates: Candidate[];
  letters: number;
}

/**
 * Try all 312 keys as decryptions and rank them by chi-squared. Decryption
 * only permutes the letter counts, so each score is computed from the 26
 * ciphertext counts rather than by decrypting the whole text 312 times.
 */
export function bruteForce(text: string, previewChars = 96): BruteForce {
  const counts = letterCounts(text);
  const letters = counts.reduce((sum, c) => sum + c, 0);
  const head = Array.from(text.slice(0, previewChars * 2))
    .slice(0, previewChars)
    .join("")
    .replace(/\s+/g, " ");
  const candidates: Candidate[] = [];
  for (const a of VALID_A) {
    const inv = modInverse(a)!;
    for (let b = 0; b < M; b += 1) {
      const plain = new Array<number>(M).fill(0);
      for (let y = 0; y < M; y += 1) plain[mod(inv * (y - b))] += counts[y];
      candidates.push({ a, b, score: chiSquared(plain), preview: affineDecrypt(head, a, b) });
    }
  }
  candidates.sort((p, q) => {
    if (p.score !== null && q.score !== null && p.score !== q.score) return p.score - q.score;
    if (p.score === null && q.score !== null) return 1;
    if (q.score === null && p.score !== null) return -1;
    return p.a - q.a || p.b - q.b;
  });
  return { candidates, letters };
}

/* ------------------------------------------------- known plaintext solve */

export interface Key {
  a: number;
  b: number;
}

export type SolveResult =
  | { ok: false; error: string }
  | { ok: true; keys: Key[]; steps: string[]; verdict: string };

function signed(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

/** "n" when n is already reduced, otherwise "n ≡ r". */
function reduced(n: number, m: number = M): string {
  const r = mod(n, m);
  return n === r ? String(n) : `${n} ≡ ${r}`;
}

/** k times a, written the way a person would: a, 2a, (-13)a. */
function times(k: number): string {
  if (k === 1) return "a";
  return `${signed(k)}a`;
}

/** The right side of c = p a + b. */
function rhs(p: number): string {
  return p === 0 ? "b" : `${times(p)} + b`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Recover (a, b) from two plaintext/ciphertext letter pairs.
 *
 * Subtracting c2 = a p2 + b from c1 = a p1 + b leaves the linear congruence
 * a d = e (mod 26) with d = p1 - p2 and e = c1 - c2. With g = gcd(d, 26) it
 * has no solution unless g divides e, and then exactly g solutions mod 26:
 * a = (e/g) (d/g)^-1 mod (26/g), plus multiples of 26/g. Only the solutions
 * coprime to 26 are affine keys.
 */
export function solveFromPairs(P1: string, C1: string, P2: string, C2: string): SolveResult {
  const fields: [string, string][] = [
    ["first plaintext letter", P1],
    ["first ciphertext letter", C1],
    ["second plaintext letter", P2],
    ["second ciphertext letter", C2],
  ];
  for (const [name, raw] of fields) {
    const t = raw.trim();
    if (t === "") return { ok: false, error: `The ${name} is empty. Type one letter from A to Z.` };
    if (letterValue(t) === null) {
      return { ok: false, error: `The ${name} is "${t}". It has to be a single letter from A to Z.` };
    }
  }
  const [p1, c1, p2, c2] = fields.map(([, raw]) => letterValue(raw.trim())!);
  const [L1, K1, L2, K2] = [p1, c1, p2, c2].map(valueLetter);
  const steps: string[] = [];
  steps.push(`Number the letters from A = 0: ${L1} = ${p1}, ${K1} = ${c1}, ${L2} = ${p2}, ${K2} = ${c2}.`);
  steps.push(`The key must satisfy ${c1} ≡ ${rhs(p1)} and ${c2} ≡ ${rhs(p2)} (mod 26).`);

  const rawE = c1 - c2;
  const rawD = p1 - p2;
  const e = mod(rawE);
  const d = mod(rawD);
  const alreadyReduced = rawE === e && rawD === d;
  steps.push(
    `Subtract the second from the first to remove b: ${c1} - ${c2} ≡ (${p1} - ${p2})a, which is ${signed(rawE)} ≡ ${times(
      rawD,
    )}${alreadyReduced ? "" : `, or ${e} ≡ ${times(d)}`} (mod 26).`,
  );

  const withB = (a: number): Key => ({ a, b: mod(c1 - a * p1) });
  const bStep = (a: number) => {
    return `With a = ${a}: b ≡ ${c1} - ${a} × ${p1} = ${reduced(c1 - a * p1)} (mod 26).`;
  };

  if (d === 0) {
    if (e === 0) {
      steps.push(
        "Both pairs encrypt the same letter to the same letter, so they are one equation in two unknowns. Every valid a fits, each with its own b = c1 - a × p1.",
      );
      const keys = VALID_A.map(withB);
      return {
        ok: true,
        keys,
        steps,
        verdict: "12 keys fit. Use a pair with two different plaintext letters to pin the key down.",
      };
    }
    steps.push("One plaintext letter cannot encrypt to two different letters under a single key.");
    return { ok: true, keys: [], steps, verdict: "No affine key fits these pairs. Check that they were copied correctly." };
  }

  const g = gcd(d, M);
  let candidates: number[];
  if (g === 1) {
    const inv = modInverse(d)!;
    steps.push(
      `gcd(${d}, 26) = 1, so ${d} has an inverse mod 26: ${d} × ${inv} = ${d * inv} = ${Math.floor((d * inv) / M)} × 26 + 1, so the inverse is ${inv}.`,
    );
    const a = mod(e * inv);
    steps.push(`Multiply both sides by ${inv}: a ≡ ${e} × ${inv} = ${reduced(e * inv)} (mod 26).`);
    candidates = [a];
  } else {
    steps.push(`gcd(${d}, 26) = ${g}, so ${d} has no inverse mod 26 and the congruence may have several solutions or none.`);
    if (e % g !== 0) {
      steps.push(`${g} does not divide ${e}, so ${times(d)} ≡ ${e} (mod 26) has no solution.`);
      return {
        ok: true,
        keys: [],
        steps,
        verdict: "No affine key fits these pairs. Check that they were copied correctly.",
      };
    }
    const m2 = M / g;
    const d2 = d / g;
    const e2 = e / g;
    const inv2 = modInverse(d2, m2)!;
    const a0 = mod(e2 * inv2, m2);
    steps.push(
      `Divide through by ${g}: ${e2} ≡ ${times(d2)} (mod ${m2}). The inverse of ${d2} mod ${m2} is ${inv2}, so a ≡ ${e2} × ${inv2} = ${reduced(
        e2 * inv2,
        m2,
      )} (mod ${m2}).`,
    );
    candidates = Array.from({ length: g }, (_, k) => a0 + k * m2);
    steps.push(`That gives ${g} values of a mod 26: ${listWords(candidates.map(String))}.`);
  }

  const valid = candidates.filter(isValidA);
  const rejected = candidates.filter((a) => !isValidA(a));
  if (rejected.length > 0 && valid.length > 0 && rejected.length <= 3) {
    steps.push(
      `${listWords(rejected.map(String))} ${rejected.length === 1 ? "shares" : "share"} a factor with 26, so only ${listWords(
        valid.map(String),
      )} ${valid.length === 1 ? "is a valid multiplier" : "are valid multipliers"}.`,
    );
  } else if (rejected.length > 3 && valid.length > 0) {
    steps.push(`Of those, the ${valid.length} that are coprime to 26 are valid multipliers.`);
  }
  if (valid.length === 0) {
    steps.push(
      candidates.length === 1
        ? `a = ${candidates[0]} shares a factor with 26, so it is not a valid multiplier.`
        : "None of them is coprime to 26, so none is a valid multiplier.",
    );
    return {
      ok: true,
      keys: [],
      steps,
      verdict: "No affine key fits these pairs. Check that they were copied correctly.",
    };
  }

  const keys = valid.map(withB);
  if (keys.length <= 2) {
    for (const k of keys) steps.push(bStep(k.a));
  }
  if (keys.length === 1) {
    const { a, b } = keys[0];
    steps.push(`Check: E(${L2}) = ${a} × ${p2} + ${b} = ${reduced(a * p2 + b)}, which is ${valueLetter(a * p2 + b)}.`);
    return { ok: true, keys, steps, verdict: `The key is a = ${a}, b = ${b}.` };
  }
  return {
    ok: true,
    keys,
    steps,
    verdict: `${keys.length} keys fit both pairs. A second pair whose plaintext letters are an odd distance apart, other than 13, gives a unique answer.`,
  };
}
