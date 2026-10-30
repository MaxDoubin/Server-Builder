/**
 * Byte statistics for the entropy analyzer.
 *
 * Shannon entropy (C. E. Shannon, "A Mathematical Theory of Communication",
 * 1948) of a byte sequence is H = -sum(p_i * log2 p_i) over the 256 byte
 * values, in bits per byte: 0 when every byte is the same, 8 when all 256
 * values are equally frequent. This is the order-0 figure, which looks at
 * byte frequencies only and ignores their order.
 *
 * The chi-square, arithmetic mean and serial correlation figures follow the
 * definitions in John Walker's ent program, which is the usual reference for
 * these tests on a byte stream. Everything here is pure data in and data
 * out, with no DOM access, so it can be unit tested.
 */

/* ------------------------------------------------------------------ limits */

/** Largest file read. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Largest paste, in characters. */
export const MAX_PASTE_CHARS = 10 * 1024 * 1024;
export const MIN_WINDOW = 16;
export const MAX_WINDOW = 65_536;
/** Windows computed at most. The step is raised to stay under it. */
export const MAX_WINDOWS = 200_000;
/** Regions listed at most. All of them are counted and shaded. */
export const MAX_REGIONS_LISTED = 500;

/* ----------------------------------------------------------------- entropy */

/** Counts of each byte value in bytes[start, end). */
export function byteHistogram(bytes: Uint8Array, start = 0, end = bytes.length): Uint32Array {
  const counts = new Uint32Array(256);
  for (let i = start; i < end; i++) counts[bytes[i]]++;
  return counts;
}

/** Shannon entropy in bits per symbol, from symbol counts that sum to `total`. */
export function entropyFromCounts(counts: ArrayLike<number>, total: number): number {
  if (total <= 0) return 0;
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i];
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  // Rounding can leave -0 or a value a hair past 8; neither is meaningful.
  return Math.min(Math.log2(counts.length), Math.max(0, h));
}

export function shannonEntropy(bytes: Uint8Array): number {
  return entropyFromCounts(byteHistogram(bytes), bytes.length);
}

/** The highest entropy n bytes can reach: every byte distinct below 256, all values equal above. */
export function maxEntropyFor(n: number): number {
  if (n <= 1) return 0;
  return Math.min(8, Math.log2(n));
}

/**
 * Expected order-0 entropy of n uniformly random bytes. A finite sample
 * always measures below 8 because some values are over- and some
 * under-represented by chance. Each count is Binomial(n, 1/256), so
 *
 *   E[H] = log2 n - (256 / n) * E[c log2 c]
 *
 * which is summed exactly over the binomial distribution up to MAX_WINDOW.
 * Past that the Miller-Madow bias, (256 - 1) / (2 n ln 2), is accurate to
 * far better than the four decimals shown.
 */
export function expectedRandomEntropy(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 0;
  n = Math.floor(n);
  if (n > MAX_WINDOW) return 8 - 255 / (2 * n * Math.LN2);
  const p = 1 / 256;
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  const stop = Math.min(n, Math.ceil(mean + 40 * sd + 10));
  // pmf(0) = (255/256)^n, at least 1e-112 for n up to 65,536, so no underflow.
  let pmf = Math.exp(n * Math.log1p(-p));
  let eClogC = 0;
  for (let c = 0; c < stop; c++) {
    pmf *= ((n - c) / (c + 1)) * (p / (1 - p));
    const k = c + 1;
    eClogC += pmf * k * Math.log2(k);
  }
  return Math.log2(n) - (256 / n) * eClogC;
}

/* -------------------------------------------------------------- chi-square */

/** ln Gamma(x) for x > 0, Lanczos approximation (g = 7, 9 terms). */
function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized upper incomplete gamma Q(a, x): a series for x < a + 1 and a
 * Lentz continued fraction otherwise (Numerical Recipes, section 6.2).
 */
export function gammaQ(a: number, x: number): number {
  if (!(a > 0) || !(x >= 0)) return NaN;
  if (x === 0) return 1;
  const lead = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 10_000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, Math.min(1, 1 - sum * Math.exp(lead)));
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.max(0, Math.min(1, Math.exp(lead) * h));
}

/** Probability that a chi-square variable with df degrees of freedom exceeds x. */
export function chiSquareUpperTail(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

/* ------------------------------------------------------------ whole buffer */

export interface ByteStats {
  size: number;
  histogram: Uint32Array;
  entropy: number;
  /** Byte values that occur at least once. */
  distinct: number;
  /** Arithmetic mean of the byte values. 127.5 for uniform data. */
  mean: number;
  /** Pearson chi-square against a uniform distribution, 255 degrees of freedom. */
  chiSquare: number;
  /** Probability that uniform random data would give a larger chi-square. */
  chiP: number;
  /** ent's serial correlation coefficient, or null when undefined (constant data or fewer than 2 bytes). */
  serialCorrelation: number | null;
  maxPossible: number;
  /** Expected entropy of random data of this length. */
  randomExpected: number;
}

/**
 * Every whole-file statistic in one pass. The serial correlation sums are
 * exact integers in a double (255^2 * 50 MiB is under 2^53), but the
 * products in its numerator and denominator are not, so those two are
 * formed in BigInt before the one division.
 */
export function byteStats(bytes: Uint8Array): ByteStats {
  const n = bytes.length;
  const histogram = new Uint32Array(256);
  let sum = 0;
  let sumSq = 0;
  let sumLag = 0;
  for (let i = 0; i < n; i++) {
    const u = bytes[i];
    histogram[u]++;
    sum += u;
    sumSq += u * u;
    if (i > 0) sumLag += bytes[i - 1] * u;
  }
  // ent closes the ring: the last byte is paired with the first.
  if (n > 1) sumLag += bytes[n - 1] * bytes[0];

  let distinct = 0;
  let chiSquare = 0;
  const expected = n / 256;
  for (let i = 0; i < 256; i++) {
    if (histogram[i] > 0) distinct++;
    if (expected > 0) {
      const d = histogram[i] - expected;
      chiSquare += (d * d) / expected;
    }
  }

  let serialCorrelation: number | null = null;
  if (n > 1) {
    const N = BigInt(n);
    const S = BigInt(sum);
    const den = N * BigInt(sumSq) - S * S;
    if (den !== 0n) serialCorrelation = Number(N * BigInt(sumLag) - S * S) / Number(den);
  }

  return {
    size: n,
    histogram,
    entropy: entropyFromCounts(histogram, n),
    distinct,
    mean: n > 0 ? sum / n : 0,
    chiSquare,
    chiP: n > 0 ? chiSquareUpperTail(chiSquare, 255) : NaN,
    serialCorrelation,
    maxPossible: maxEntropyFor(n),
    randomExpected: expectedRandomEntropy(n),
  };
}

/* ---------------------------------------------------------- sliding window */

export interface SlidingResult {
  window: number;
  /** The step actually used. */
  step: number;
  requestedStep: number;
  /** True when the step was raised to keep the window count under MAX_WINDOWS. */
  stepRaised: boolean;
  /** True when the step ended up larger than the window, so some bytes fall between windows. */
  gaps: boolean;
  /** Bytes that no window covers. Zero unless `gaps` is true. */
  uncovered: number;
  /** Start offset of each window. */
  offsets: Float64Array;
  /** Length of each window. Shorter than `window` only when the input is. */
  lengths: Float64Array;
  entropy: Float64Array;
  count: number;
}

export type WindowCheck = { ok: true } | { ok: false; error: string };

export function checkWindow(window: number, step: number): WindowCheck {
  if (!Number.isInteger(window) || window < MIN_WINDOW || window > MAX_WINDOW) {
    return {
      ok: false,
      error: `The window is a whole number of bytes from ${MIN_WINDOW} to ${MAX_WINDOW.toLocaleString("en-US")}.`,
    };
  }
  if (!Number.isInteger(step) || step < 1) {
    return { ok: false, error: "The step is a whole number of bytes, at least 1." };
  }
  if (step > window) {
    return {
      ok: false,
      error: `A step larger than the window (${window.toLocaleString("en-US")}) would skip bytes between windows. Use a step no larger than the window.`,
    };
  }
  return { ok: true };
}

/**
 * Entropy of each window bytes[o, o + window) for o = 0, step, 2 step, ...
 * When the last regular window stops short of the end, one more window is
 * aligned to the end so the final bytes are never left out. Counts are
 * updated incrementally, so the whole pass is O(n) for any step up to the
 * window; each window's entropy is then read from its 256 counts through a
 * precomputed c log2 c table, which keeps it exact rather than drifting.
 */
export function slidingEntropy(
  bytes: Uint8Array,
  window: number,
  requestedStep: number,
  maxWindows = MAX_WINDOWS,
): SlidingResult {
  const n = bytes.length;
  const empty = (step: number): SlidingResult => ({
    window,
    step,
    requestedStep,
    stepRaised: false,
    gaps: false,
    uncovered: 0,
    offsets: new Float64Array(0),
    lengths: new Float64Array(0),
    entropy: new Float64Array(0),
    count: 0,
  });
  if (n === 0) return empty(requestedStep);

  if (n <= window) {
    return {
      window,
      step: requestedStep,
      requestedStep,
      stepRaised: false,
      gaps: false,
      uncovered: 0,
      offsets: Float64Array.of(0),
      lengths: Float64Array.of(n),
      entropy: Float64Array.of(shannonEntropy(bytes)),
      count: 1,
    };
  }

  let step = requestedStep;
  const regular = (s: number) => Math.floor((n - window) / s) + 1;
  const total = (s: number) => regular(s) + ((n - window) % s === 0 ? 0 : 1);
  let stepRaised = false;
  if (total(step) > maxWindows) {
    step = Math.ceil((n - window) / (maxWindows - 2));
    while (total(step) > maxWindows) step++;
    stepRaised = true;
  }

  const count = total(step);
  const offsets = new Float64Array(count);
  const lengths = new Float64Array(count).fill(window);
  const entropy = new Float64Array(count);

  const clog = new Float64Array(window + 1);
  for (let c = 2; c <= window; c++) clog[c] = c * Math.log2(c);
  const logW = Math.log2(window);
  const counts = new Uint32Array(256);
  const read = () => {
    let s = 0;
    for (let i = 0; i < 256; i++) s += clog[counts[i]];
    const h = logW - s / window;
    return h < 0 ? 0 : h > 8 ? 8 : h;
  };

  for (let i = 0; i < window; i++) counts[bytes[i]]++;
  let pos = 0;
  offsets[0] = 0;
  entropy[0] = read();

  for (let k = 1; k < count; k++) {
    const next = k < regular(step) ? k * step : n - window;
    const move = next - pos;
    if (move >= window) {
      counts.fill(0);
      for (let i = next; i < next + window; i++) counts[bytes[i]]++;
    } else {
      for (let i = pos; i < next; i++) counts[bytes[i]]--;
      for (let i = pos + window; i < next + window; i++) counts[bytes[i]]++;
    }
    pos = next;
    offsets[k] = next;
    entropy[k] = read();
  }

  // Union of [offset, offset + window) over all windows. Offsets only grow,
  // so each window adds at most the distance to the next one.
  let union = window;
  for (let k = 0; k + 1 < count; k++) union += Math.min(window, offsets[k + 1] - offsets[k]);
  const uncovered = n - union;

  return { window, step, requestedStep, stepRaised, gaps: step > window, uncovered, offsets, lengths, entropy, count };
}

export interface Region {
  start: number;
  /** Exclusive. */
  end: number;
  windows: number;
  max: number;
  /** Mean of the window values inside the region. */
  mean: number;
}

/** Runs of windows at or above the threshold, merged where they overlap or touch. */
export function highRegions(sliding: SlidingResult, threshold: number): Region[] {
  const out: Region[] = [];
  let cur: Region | null = null;
  let sum = 0;
  for (let k = 0; k < sliding.count; k++) {
    const h = sliding.entropy[k];
    if (h < threshold) continue;
    const start = sliding.offsets[k];
    const end = start + sliding.lengths[k];
    if (cur && start <= cur.end) {
      cur.end = Math.max(cur.end, end);
      cur.windows++;
      cur.max = Math.max(cur.max, h);
      sum += h;
      cur.mean = sum / cur.windows;
    } else {
      cur = { start, end, windows: 1, max: h, mean: h };
      sum = h;
      out.push(cur);
    }
  }
  return out;
}

export interface Column {
  min: number;
  max: number;
  /** Index of the window with the highest value in this column. */
  peak: number;
  first: number;
  last: number;
}

/**
 * Reduces the windows to at most `columns` buckets for drawing, keeping the
 * minimum and maximum of each so a one-window spike survives the reduction.
 */
export function downsample(sliding: SlidingResult, columns: number): Column[] {
  const count = sliding.count;
  if (count === 0) return [];
  const cols = Math.max(1, Math.min(columns, count));
  const out: Column[] = [];
  for (let c = 0; c < cols; c++) {
    const first = Math.floor((c * count) / cols);
    const last = Math.max(first, Math.floor(((c + 1) * count) / cols) - 1);
    let min = Infinity;
    let max = -Infinity;
    let peak = first;
    for (let k = first; k <= last; k++) {
      const h = sliding.entropy[k];
      if (h < min) min = h;
      if (h > max) {
        max = h;
        peak = k;
      }
    }
    out.push({ min, max, peak, first, last });
  }
  return out;
}

/* ------------------------------------------------------------------ input */

export type Decoded = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/**
 * Hex in the shapes people paste: "deadbeef", "de ad be ef", "de:ad:be:ef",
 * "0xde, 0xad" and "\xde\xad". Separators are dropped and the rest must be
 * an even number of hex digits.
 */
export function decodeHex(text: string): Decoded {
  const stripped = text
    .replace(/\\x/gi, "")
    .replace(/(^|[^0-9a-f])0x/gi, "$1")
    .replace(/[\s:,;.\-]/g, "");
  const bad = stripped.search(/[^0-9a-fA-F]/);
  if (bad !== -1) {
    const ch = stripped[bad];
    const shown = ch.charCodeAt(0) < 0x20 ? `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : `"${ch}"`;
    return { ok: false, error: `${shown} is not a hex digit. Hex uses 0 to 9 and a to f only.` };
  }
  if (stripped.length % 2 !== 0) {
    return {
      ok: false,
      error: `There are ${stripped.length} hex digits, an odd number. Every byte is exactly two digits, so one is missing or extra.`,
    };
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes: out };
}

/** Standard or URL-safe Base64 (RFC 4648 sections 4 and 5), padding optional, whitespace ignored. */
export function decodeBase64(text: string): Decoded {
  let s = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.match(/=+$/);
  if (pad && pad[0].length > 2) return { ok: false, error: "Base64 ends with at most two = signs of padding." };
  s = s.replace(/=+$/, "");
  const bad = s.search(/[^A-Za-z0-9+/]/);
  if (bad !== -1) {
    return {
      ok: false,
      error: `"${s[bad]}" at position ${bad + 1} is not in the Base64 alphabet (A to Z, a to z, 0 to 9, + and /, or - and _ for URL-safe).`,
    };
  }
  if (s.length % 4 === 1) {
    return {
      ok: false,
      error: "The length is impossible for Base64: one leftover character cannot encode a whole byte, so something was cut off.",
    };
  }
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return { ok: false, error: "This is not valid Base64." };
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return { ok: true, bytes: out };
}

/* ---------------------------------------------------------------- reading */

export type Alphabet = "hex" | "base64" | null;

const HEX_SET = "0123456789abcdefABCDEF\r\n\t ";
// No space or tab: Base64 is wrapped with line breaks, and prose made only of
// letters and spaces would otherwise read as Base64.
const B64_SET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_\r\n";

/**
 * Whether every byte present belongs to the hex or the Base64 alphabet. Data
 * that is only hex digits can never exceed 4 bits per byte however random it
 * is, and Base64 can never exceed 6, so a reading on encoded text measures
 * the encoding as much as the content.
 */
export function encodedAlphabet(histogram: Uint32Array, size: number): Alphabet {
  if (size < 16) return null;
  const within = (set: string) => {
    for (let b = 0; b < 256; b++) {
      if (histogram[b] > 0 && set.indexOf(String.fromCharCode(b)) === -1) return false;
    }
    return true;
  };
  if (within(HEX_SET)) return "hex";
  if (within(B64_SET)) return "base64";
  return null;
}

/** A plain reading of a bits-per-byte figure. Rough bands, not a classifier. */
export function describeEntropy(h: number): string {
  if (h < 1) return "Almost every byte is the same value: padding, zero fill, or a sparse region.";
  if (h < 3) return "Highly repetitive: a small set of byte values dominates, as in simple tables or bitmaps.";
  if (h < 5) return "In the range typical of plain text, markup, logs and source code.";
  if (h < 6.5) return "In the range typical of executable code and structured binary formats.";
  if (h < 7.5) return "Dense binary data, such as media, packed data, or compressed data mixed with structure.";
  return "Consistent with compressed or encrypted data. Entropy alone cannot say which.";
}

/** Deterministic pseudo-random bytes (mulberry32) for the built-in samples. Not for cryptographic use. */
export function pseudoRandomBytes(n: number, seed = 0x9e3779b9): Uint8Array {
  const out = new Uint8Array(n);
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
  }
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export function hexOffset(n: number): string {
  return `0x${n.toString(16).toUpperCase()}`;
}
