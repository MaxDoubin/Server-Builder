/**
 * Password and code generation with uniform character selection.
 *
 * Randomness comes only from crypto.getRandomValues (W3C Web Cryptography
 * API), never Math.random. Each character is chosen by rejection sampling
 * over 32-bit values, so every character of the alphabet is exactly equally
 * likely, and a "must contain every class" rule is met by discarding and
 * redrawing the whole password, which keeps every acceptable password
 * equally likely too.
 *
 * Pure functions with an injectable random source, so the unit tests can
 * drive the rejection logic with chosen values.
 */

/* ------------------------------------------------------------ alphabets */

export type ClassId = "lower" | "upper" | "digits" | "symbols";

export interface CharClass {
  id: ClassId;
  label: string;
  chars: string;
}

/** The 32 printable ASCII punctuation characters, 0x21 to 0x7E minus letters and digits. */
export const SYMBOLS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

export const CHAR_CLASSES: CharClass[] = [
  { id: "lower", label: "Lowercase", chars: "abcdefghijklmnopqrstuvwxyz" },
  { id: "upper", label: "Uppercase", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { id: "digits", label: "Digits", chars: "0123456789" },
  { id: "symbols", label: "Symbols", chars: SYMBOLS },
];

/** Characters that are easy to misread in common fonts. */
export const AMBIGUOUS = "0Oo1lI|";

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;
export const MIN_COUNT = 1;
export const MAX_COUNT = 50;
/** How many characters the custom exclusion field reads. */
export const MAX_EXCLUDE_INPUT = 200;
/**
 * Below this fraction of acceptable draws, "require every class" would need
 * more than a thousand redraws per password on average, so it is refused
 * with an explanation instead of spinning.
 */
export const MIN_ACCEPTANCE = 0.001;

export interface PasswordOptions {
  length: number;
  classes: Record<ClassId, boolean>;
  excludeAmbiguous: boolean;
  /** Extra characters to leave out, typed by the reader. */
  exclude: string;
  requireEach: boolean;
}

export interface ClassGroup {
  id: ClassId;
  label: string;
  /** The characters of this class still in the alphabet. */
  chars: string[];
}

export interface PasswordPlan {
  ok: boolean;
  error: string | null;
  warnings: string[];
  alphabet: string[];
  /** Selected classes that still have at least one character. */
  groups: ClassGroup[];
  length: number;
  /** length x log2(alphabet size): every string of that length is possible. */
  unconstrainedBits: number;
  /** The entropy of what is actually produced, after the every-class rule. */
  bits: number;
  /** Fraction of uniformly drawn strings that already satisfy the rule (1 without it). */
  acceptance: number;
  /** Number of distinct passwords the settings can produce. */
  spaceSize: bigint;
}

/** log2 of a positive BigInt, accurate to double precision. */
export function log2Big(x: bigint): number {
  if (x <= 0n) return -Infinity;
  const bits = x.toString(2).length;
  if (bits <= 53) return Math.log2(Number(x));
  const shift = bits - 53;
  return Math.log2(Number(x >> BigInt(shift))) + shift;
}

/**
 * How many strings of `length` over an alphabet of `total` characters
 * contain at least one character from each of the disjoint groups whose
 * sizes are given. Inclusion and exclusion over every subset of groups:
 * sum of (-1)^|S| x (total - size(S))^length. BigInt, because 94^128 has
 * 839 bits.
 */
export function countContainingEach(total: number, groupSizes: number[], length: number): bigint {
  const k = groupSizes.length;
  const L = BigInt(length);
  let sum = 0n;
  for (let mask = 0; mask < 1 << k; mask++) {
    let removed = 0;
    let bitsSet = 0;
    for (let g = 0; g < k; g++) {
      if (mask & (1 << g)) {
        removed += groupSizes[g];
        bitsSet++;
      }
    }
    const term = BigInt(total - removed) ** L;
    sum += bitsSet % 2 === 0 ? term : -term;
  }
  return sum;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function planPassword(opts: PasswordOptions): PasswordPlan {
  const warnings: string[] = [];
  const length = clampInt(opts.length, MIN_LENGTH, MAX_LENGTH);
  const fail = (error: string): PasswordPlan => ({
    ok: false,
    error,
    warnings,
    alphabet: [],
    groups: [],
    length,
    unconstrainedBits: 0,
    bits: 0,
    acceptance: 0,
    spaceSize: 0n,
  });

  const removed = new Set<string>();
  if (opts.excludeAmbiguous) for (const ch of AMBIGUOUS) removed.add(ch);
  for (const ch of opts.exclude.slice(0, MAX_EXCLUDE_INPUT)) removed.add(ch);

  const selected = CHAR_CLASSES.filter((c) => opts.classes[c.id]);
  if (selected.length === 0) return fail("Choose at least one character class.");

  const groups: ClassGroup[] = [];
  for (const cls of selected) {
    const chars = [...cls.chars].filter((ch) => !removed.has(ch));
    if (chars.length === 0) {
      if (opts.requireEach) {
        return fail(
          `Every ${cls.label.toLowerCase()} character is excluded, so no password can contain one. Allow some back or turn off the every-class rule.`,
        );
      }
      warnings.push(`Every ${cls.label.toLowerCase()} character is excluded, so that class adds nothing.`);
      continue;
    }
    groups.push({ id: cls.id, label: cls.label, chars });
  }

  const alphabet = groups.flatMap((g) => g.chars);
  if (alphabet.length === 0) return fail("Every character is excluded. There is nothing left to draw from.");
  if (alphabet.length === 1) {
    return fail(
      `Only "${alphabet[0]}" is left after the exclusions, so every password would be the same string.`,
    );
  }

  const unconstrainedBits = length * Math.log2(alphabet.length);
  const everything = BigInt(alphabet.length) ** BigInt(length);
  let spaceSize = everything;
  let acceptance = 1;
  let bits = unconstrainedBits;

  if (opts.requireEach && groups.length > 1) {
    spaceSize = countContainingEach(
      alphabet.length,
      groups.map((g) => g.chars.length),
      length,
    );
    if (spaceSize <= 0n) return fail("No password of this length can contain every selected class.");
    bits = log2Big(spaceSize);
    acceptance = Math.pow(2, bits - unconstrainedBits);
    if (acceptance < MIN_ACCEPTANCE) {
      return fail(
        `With these exclusions only ${(acceptance * 100).toPrecision(2)}% of random passwords contain every class, so each one would take about ${Math.round(1 / acceptance).toLocaleString("en-US")} redraws. Allow more characters in the sparse classes, make the password longer, or turn off the every-class rule.`,
      );
    }
  }

  return {
    ok: true,
    error: null,
    warnings,
    alphabet,
    groups,
    length,
    unconstrainedBits,
    bits,
    acceptance,
    spaceSize,
  };
}

/* ------------------------------------------------------------ randomness */

/** Returns one uniformly distributed integer in [0, 2^32). */
export type Uint32Source = () => number;

const TWO_32 = 4294967296;

/**
 * A buffered source over crypto.getRandomValues, or null when the browser
 * has none. There is deliberately no Math.random fallback.
 */
export function cryptoSource(): Uint32Source | null {
  const c: Crypto | undefined = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") return null;
  // getRandomValues refuses more than 65536 bytes per call; 1024 bytes is far under it.
  const buffer = new Uint32Array(256);
  let pos = buffer.length;
  return () => {
    if (pos >= buffer.length) {
      c.getRandomValues(buffer);
      pos = 0;
    }
    return buffer[pos++];
  };
}

/** The first value rejected for an alphabet of n: the largest multiple of n not above 2^32. */
export function rejectionLimit(n: number): number {
  return TWO_32 - (TWO_32 % n);
}

/**
 * Guards a broken source. For the alphabets here (at most 94 characters) a
 * draw is rejected with probability under 2^-25, so a thousand rejections in
 * a row means the source is not random, not that the page was unlucky.
 */
const MAX_REJECTIONS = 1000;

/**
 * A uniform index in [0, n). Values at or above the largest multiple of n
 * are discarded and redrawn, so the surviving range divides evenly by n and
 * the remainder carries no bias.
 */
export function uniformIndex(n: number, next: Uint32Source): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new RangeError(`alphabet size ${n} out of range`);
  const limit = rejectionLimit(n);
  for (let i = 0; i < MAX_REJECTIONS; i++) {
    const r = next();
    if (r < limit) return r % n;
  }
  throw new Error("The random source kept returning values that had to be rejected.");
}

export type GenerateResult = { ok: true; values: string[]; redraws: number } | { ok: false; error: string };

function drawString(alphabet: string[], length: number, next: Uint32Source): string[] {
  const out = new Array<string>(length);
  for (let i = 0; i < length; i++) out[i] = alphabet[uniformIndex(alphabet.length, next)];
  return out;
}

export function generatePasswords(plan: PasswordPlan, count: number, next: Uint32Source): GenerateResult {
  if (!plan.ok) return { ok: false, error: plan.error ?? "These settings cannot produce a password." };
  const n = clampInt(count, MIN_COUNT, MAX_COUNT);
  const needed =
    plan.groups.length > 1 && plan.acceptance < 1 ? plan.groups.map((g) => new Set(g.chars)) : null;
  // With acceptance p, failing this many redraws in a row has probability about e^-64.
  const maxAttempts = needed ? Math.ceil(64 / plan.acceptance) : 1;

  const values: string[] = [];
  let redraws = 0;
  try {
    for (let k = 0; k < n; k++) {
      let made: string | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const chars = drawString(plan.alphabet, plan.length, next);
        // Regenerate rather than patch: overwriting a position to insert a
        // missing class would make passwords with that character in that
        // spot more likely than the rest.
        if (!needed || needed.every((set) => chars.some((ch) => set.has(ch)))) {
          made = chars.join("");
          break;
        }
        redraws++;
      }
      if (made === null)
        return { ok: false, error: "Gave up after too many redraws. Loosen the settings and try again." };
      values.push(made);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Random generation failed." };
  }
  return { ok: true, values, redraws };
}

/* ------------------------------------------------------------ codes */

export type CodeAlphabetId = "digits" | "hex" | "crockford";

export const CODE_ALPHABETS: Record<CodeAlphabetId, { label: string; chars: string; note: string }> = {
  digits: { label: "Digits", chars: "0123456789", note: "0 to 9. What a PIN pad can type." },
  hex: { label: "Hex", chars: "0123456789abcdef", note: "0 to 9 and a to f, four bits per character." },
  crockford: {
    label: "Crockford Base32",
    chars: "0123456789ABCDEFGHJKMNPQRSTVWXYZ",
    note: "Digits and uppercase letters without I, L, O and U, five bits per character.",
  },
};

export type Separator = "-" | " " | "." | "";

export const MIN_GROUPS = 1;
export const MAX_GROUPS = 16;
export const MIN_GROUP_SIZE = 1;
export const MAX_GROUP_SIZE = 12;

export interface CodeOptions {
  alphabet: CodeAlphabetId;
  groups: number;
  groupSize: number;
  separator: Separator;
}

export interface CodePlan {
  ok: boolean;
  error: string | null;
  alphabet: string[];
  groups: number;
  groupSize: number;
  separator: Separator;
  totalChars: number;
  bits: number;
}

export function planCode(opts: CodeOptions): CodePlan {
  const def = CODE_ALPHABETS[opts.alphabet] ?? CODE_ALPHABETS.digits;
  const groups = clampInt(opts.groups, MIN_GROUPS, MAX_GROUPS);
  const groupSize = clampInt(opts.groupSize, MIN_GROUP_SIZE, MAX_GROUP_SIZE);
  const separator: Separator = ["-", " ", ".", ""].includes(opts.separator) ? opts.separator : "-";
  const alphabet = [...def.chars];
  const totalChars = groups * groupSize;
  const bits = totalChars * Math.log2(alphabet.length);
  return { ok: true, error: null, alphabet, groups, groupSize, separator, totalChars, bits };
}

export function generateCodes(plan: CodePlan, count: number, next: Uint32Source): GenerateResult {
  const n = clampInt(count, MIN_COUNT, MAX_COUNT);
  const values: string[] = [];
  try {
    for (let k = 0; k < n; k++) {
      const parts: string[] = [];
      for (let g = 0; g < plan.groups; g++)
        parts.push(drawString(plan.alphabet, plan.groupSize, next).join(""));
      values.push(parts.join(plan.separator));
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Random generation failed." };
  }
  return { ok: true, values, redraws: 0 };
}

/* ------------------------------------------------------------ the bias, shown */

export interface ByteBias {
  /** How many characters a byte-modulo scheme would favor (256 mod n). */
  favored: number;
  /** Probability of each favored character. */
  pHigh: number;
  /** Probability of each other character. */
  pLow: number;
  /** pHigh / pLow, 1 when there is no bias. */
  ratio: number;
}

/**
 * What `byte % n` would do: 256 values cannot split evenly into n buckets
 * unless n divides 256, so the first 256 mod n characters get one extra
 * value each.
 */
export function byteModuloBias(n: number): ByteBias | null {
  if (!Number.isInteger(n) || n < 1 || n > 256) return null;
  const q = Math.floor(256 / n);
  const r = 256 % n;
  return { favored: r, pHigh: (r === 0 ? q : q + 1) / 256, pLow: q / 256, ratio: r === 0 ? 1 : (q + 1) / q };
}

/** Fraction of 32-bit draws this generator throws away for an alphabet of n. */
export function rejectionRate(n: number): number {
  return (TWO_32 % n) / TWO_32;
}
