/**
 * Luhn (mod 10) check digits, payment card brand detection, and IMEI layout.
 *
 * Luhn is specified in ISO/IEC 7812-1 Annex B and comes from H. P. Luhn's
 * US patent 2,950,048 (1960). Working leftward from the check digit, every
 * second digit is doubled, and a doubled value above 9 has 9 subtracted,
 * which is the same as adding its two digits. The number is valid when the
 * total is a multiple of 10. To compute a check digit, do the same over the
 * payload with the rightmost payload digit doubled, then take whatever
 * brings the total up to the next multiple of 10.
 *
 * IMEI layout is 3GPP TS 23.003 section 6.2: an 8 digit Type Allocation
 * Code, a 6 digit serial number and a Luhn check digit over those 14. The
 * 16 digit IMEISV replaces the check digit with a 2 digit software version
 * number and carries no check digit at all.
 *
 * Nothing here stores, logs or transmits a number. Pure functions, no DOM.
 */

/** Longest input accepted, separators included. */
export const MAX_INPUT_CHARS = 256;
/** Most digits checked. Card numbers top out at 19 and an IMEI is 15. */
export const MAX_DIGITS = 64;

export type Mode = "validate" | "compute";
export type ReadAs = "auto" | "card" | "imei" | "plain";
export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

/* ------------------------------------------------------------------ input */

export type Cleaned = { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; digits: string };

/**
 * Digits with spaces and hyphens removed. Anything else is refused rather
 * than skipped, because silently dropping an O typed for a 0 would check a
 * different number from the one the reader meant.
 */
export function cleanDigits(raw: string): Cleaned {
  if (raw.length > MAX_INPUT_CHARS) {
    return { kind: "error", message: `That is ${raw.length} characters. The cap is ${MAX_INPUT_CHARS}.` };
  }
  if (raw.trim() === "") return { kind: "empty" };
  // Walk the raw input, not a trimmed copy, so the position reported is
  // the one the reader sees in the field even after leading spaces.
  const chars = Array.from(raw);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/[0-9]/.test(c) || /[\s\- ]/.test(c)) continue;
    const shown = /^[\x21-\x7e]$/.test(c) ? `"${c}"` : `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
    const hint = /[oO]/.test(c) ? " A letter O in place of a zero is a common slip." : "";
    return {
      kind: "error",
      message: `Character ${i + 1}, ${shown}, is not a digit. Spaces and hyphens are ignored; nothing else is.${hint}`,
    };
  }
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) {
    return { kind: "error", message: "There are no digits here, only spaces or hyphens." };
  }
  if (digits.length > MAX_DIGITS) {
    return { kind: "error", message: `That is ${digits.length} digits. This page checks up to ${MAX_DIGITS}.` };
  }
  return { kind: "ok", digits };
}

/* ------------------------------------------------------------------- luhn */

export interface LuhnStep {
  /** Index from the left, 0 based. */
  position: number;
  digit: number;
  doubled: boolean;
  /** digit * 2 when doubled, else the digit. */
  product: number;
  /** product - 9 when product > 9, else product. */
  value: number;
  /** True for the rightmost digit when it is the check digit. */
  isCheck: boolean;
}

/**
 * The per-digit working. With hasCheckDigit the rightmost digit is the check
 * digit and is not doubled; without it the rightmost digit is the last
 * payload digit and is doubled (ISO/IEC 7812-1 Annex B).
 */
export function luhnSteps(digits: string, hasCheckDigit: boolean): LuhnStep[] {
  const steps: LuhnStep[] = [];
  const n = digits.length;
  for (let i = 0; i < n; i++) {
    const fromRight = n - 1 - i;
    const digit = digits.charCodeAt(i) - 48;
    const doubled = hasCheckDigit ? fromRight % 2 === 1 : fromRight % 2 === 0;
    const product = doubled ? digit * 2 : digit;
    steps.push({
      position: i,
      digit,
      doubled,
      product,
      value: product > 9 ? product - 9 : product,
      isCheck: hasCheckDigit && fromRight === 0,
    });
  }
  return steps;
}

export function stepSum(steps: LuhnStep[]): number {
  return steps.reduce((acc, s) => acc + s.value, 0);
}

export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  return stepSum(luhnSteps(digits, true)) % 10 === 0;
}

/** The digit that, appended to the payload, makes it pass. */
export function checkDigitFor(payload: string): number {
  if (!/^\d*$/.test(payload)) throw new Error("payload must be digits");
  return (10 - (stepSum(luhnSteps(payload, false)) % 10)) % 10;
}

/* ----------------------------------------------------------------- brands */

export interface Brand {
  id: string;
  name: string;
  /** Inclusive prefix ranges, each end the same length. */
  ranges: [string, string][];
  lengths: number[];
}

/*
  IIN ranges as the networks publish them and as Wikipedia's "Payment card
  number" table collects them. Where ranges overlap, the longest matching
  prefix wins. Diners Club cards numbered 54 and 55 are Mastercard co-brands,
  processed as Mastercard, and match Mastercard here.
*/
export const BRANDS: Brand[] = [
  { id: "visa", name: "Visa", ranges: [["4", "4"]], lengths: [13, 16, 19] },
  {
    id: "mastercard",
    name: "Mastercard",
    ranges: [
      ["51", "55"],
      ["2221", "2720"],
    ],
    lengths: [16],
  },
  {
    id: "amex",
    name: "American Express",
    ranges: [
      ["34", "34"],
      ["37", "37"],
    ],
    lengths: [15],
  },
  {
    id: "discover",
    name: "Discover",
    ranges: [
      ["6011", "6011"],
      ["644", "649"],
      ["65", "65"],
    ],
    lengths: [16, 17, 18, 19],
  },
  { id: "jcb", name: "JCB", ranges: [["3528", "3589"]], lengths: [16, 17, 18, 19] },
  { id: "unionpay", name: "UnionPay", ranges: [["62", "62"]], lengths: [16, 17, 18, 19] },
  {
    id: "diners",
    name: "Diners Club",
    ranges: [
      ["300", "305"],
      ["3095", "3095"],
      ["36", "36"],
      ["38", "39"],
    ],
    lengths: [14, 15, 16, 17, 18, 19],
  },
];

export interface BrandMatch {
  brand: Brand;
  /** The leading digits that matched. */
  prefix: string;
  /** The range they fell in, as text: "2221 to 2720" or "34". */
  range: string;
}

export function rangeText([lo, hi]: [string, string]): string {
  return lo === hi ? lo : `${lo} to ${hi}`;
}

export function lengthsText(lengths: number[]): string {
  const sorted = [...lengths].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${sorted[0]} to ${sorted[sorted.length - 1]}`;
  if (sorted.length === 1) return String(sorted[0]);
  return `${sorted.slice(0, -1).join(", ")} or ${sorted[sorted.length - 1]}`;
}

/** Longest-prefix match against BRANDS. Equal length digit strings compare correctly as text. */
export function detectBrand(digits: string): BrandMatch | null {
  let best: BrandMatch | null = null;
  for (const brand of BRANDS) {
    for (const range of brand.ranges) {
      const k = range[0].length;
      if (digits.length < k) continue;
      const head = digits.slice(0, k);
      if (head >= range[0] && head <= range[1] && (!best || k > best.prefix.length)) {
        best = { brand, prefix: head, range: rangeText(range) };
      }
    }
  }
  return best;
}

/** ISO/IEC 7812-1 Major Industry Identifier: the first digit. */
export const MII: string[] = [
  "ISO/TC 68 and other industry assignments",
  "Airlines",
  "Airlines, financial and other future industry assignments",
  "Travel and entertainment",
  "Banking and financial",
  "Banking and financial",
  "Merchandising and banking/financial",
  "Petroleum and other future industry assignments",
  "Healthcare, telecommunications and other future industry assignments",
  "For assignment by national standards bodies",
];

/** Display grouping: Amex 4-6-5, 14 digit Diners 4-6-4, everything else in fours. */
export function groupCard(full: string, brandId: string | null): string {
  let sizes: number[] | null = null;
  if (brandId === "amex" && full.length === 15) sizes = [4, 6, 5];
  if (brandId === "diners" && full.length === 14) sizes = [4, 6, 4];
  if (!sizes) return full.replace(/(\d{4})(?=\d)/g, "$1 ");
  const out: string[] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(full.slice(at, at + size));
    at += size;
  }
  return out.join(" ");
}

/** First six and last four, the most PCI DSS has traditionally allowed on display. */
export function maskCard(full: string): string | null {
  if (full.length < 13) return null;
  return `${full.slice(0, 6)}${"*".repeat(full.length - 10)}${full.slice(-4)}`;
}

/* ------------------------------------------------------------------ IMEI */

export interface ImeiParts {
  form: "imei" | "imeisv";
  /** Reporting Body Identifier: the first two digits of the TAC. */
  rbi: string;
  tac: string;
  serial: string;
  /** The check digit, for a 15 digit IMEI. */
  check: string | null;
  /** The software version number, for a 16 digit IMEISV. */
  svn: string | null;
  formatted: string;
}

/** Split a full IMEI (15 digits) or IMEISV (16 digits). Anything else is not one. */
export function imeiParts(full: string): ImeiParts | null {
  if (full.length !== 15 && full.length !== 16) return null;
  const tac = full.slice(0, 8);
  const serial = full.slice(8, 14);
  const tail = full.slice(14);
  const form = full.length === 15 ? "imei" : "imeisv";
  return {
    form,
    rbi: tac.slice(0, 2),
    tac,
    serial,
    check: form === "imei" ? tail : null,
    svn: form === "imeisv" ? tail : null,
    formatted: `${tac.slice(0, 2)}-${tac.slice(2)}-${serial}-${tail}`,
  };
}

/* --------------------------------------------------------------- analysis */

export type Kind = "card" | "imei" | "plain";
export type Verdict = "valid" | "invalid" | "computed" | "no-check-digit";

export interface CardInfo {
  match: BrandMatch | null;
  /** null when no brand matched, so there is no expected length. */
  lengthOk: boolean | null;
  mii: { digit: number; meaning: string };
  formatted: string;
  masked: string | null;
}

export interface Analysis {
  mode: Mode;
  /** The digits as entered, separators removed. */
  digits: string;
  /** The full number: as entered when validating, payload plus check digit when computing. */
  full: string;
  steps: LuhnStep[];
  sum: number;
  /** The check digit the payload calls for. */
  expectedCheck: number;
  verdict: Verdict;
  kind: Kind;
  card: CardInfo | null;
  imei: ImeiParts | null;
  findings: Finding[];
}

export type Outcome = { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; analysis: Analysis };

function classify(full: string, readAs: ReadAs): Kind {
  if (readAs !== "auto") return readAs;
  const match = detectBrand(full);
  if (match && match.brand.lengths.includes(full.length)) return "card";
  if (full.length === 15) return "imei";
  if (match) return "card";
  return "plain";
}

export function analyze(raw: string, mode: Mode, readAs: ReadAs): Outcome {
  const cleaned = cleanDigits(raw);
  if (cleaned.kind !== "ok") return cleaned;
  const digits = cleaned.digits;

  if (mode === "validate" && digits.length < 2) {
    return { kind: "error", message: "Validating needs at least two digits: a payload and the check digit after it." };
  }

  const hasCheck = mode === "validate";
  const steps = luhnSteps(digits, hasCheck);
  const sum = stepSum(steps);
  const payload = hasCheck ? digits.slice(0, -1) : digits;
  const expectedCheck = checkDigitFor(payload);
  const full = hasCheck ? digits : `${digits}${expectedCheck}`;
  const kind = classify(full, readAs);
  const findings: Finding[] = [];

  let verdict: Verdict = hasCheck ? (sum % 10 === 0 ? "valid" : "invalid") : "computed";

  let card: CardInfo | null = null;
  let imei: ImeiParts | null = null;

  if (kind === "card") {
    const match = detectBrand(full);
    const lengthOk = match ? match.brand.lengths.includes(full.length) : null;
    card = {
      match,
      lengthOk,
      mii: { digit: Number(full[0]), meaning: MII[Number(full[0])] },
      formatted: groupCard(full, match?.brand.id ?? null),
      masked: maskCard(full),
    };
    if (!match) {
      findings.push({
        tone: "info",
        text: "The prefix matches none of the networks in the table below. The number can still pass Luhn, which applies to any length and any issuer.",
      });
    } else if (!lengthOk) {
      const expected = lengthsText(match.brand.lengths);
      findings.push({
        tone: "warn",
        text: hasCheck
          ? `${match.brand.name} numbers are ${expected} digits long. This one has ${full.length}, so a digit is missing or extra even if the check passes.`
          : `With its check digit this would be ${full.length} digits, and ${match.brand.name} numbers are ${expected} digits long.`,
      });
    }
    if (match?.brand.id === "unionpay") {
      findings.push({
        tone: "info",
        text: "Some UnionPay cards are issued without a Luhn check digit, so a failed check on a number starting 62 is not conclusive on its own.",
      });
      const six = Number(full.slice(0, 6));
      if (full.length >= 6 && six >= 622126 && six <= 622925) {
        findings.push({
          tone: "info",
          text: "The first six digits fall in 622126 to 622925, a UnionPay range that Discover also lists among the IINs its network accepts.",
        });
      }
    }
  }

  if (kind === "imei") {
    // Computing appends a check digit, so only a 14 digit payload gives an
    // IMEI. A 15 digit payload must not be shown as an IMEISV: the 16th
    // digit here would be a computed check digit, not a software version.
    imei = hasCheck || full.length === 15 ? imeiParts(full) : null;
    if (!imei) {
      findings.push({
        tone: "warn",
        text: hasCheck
          ? `An IMEI is 15 digits: 14 plus the check digit. This has ${full.length}.${full.length === 14 ? " If the check digit is missing, compute it instead." : ""}`
          : `An IMEI payload is 14 digits (an 8 digit TAC and a 6 digit serial). This has ${digits.length}.`,
      });
    } else if (imei.form === "imeisv") {
      verdict = "no-check-digit";
      findings.push({
        tone: "info",
        text: "Sixteen digits read as an IMEISV: the TAC and serial followed by a 2 digit software version number. An IMEISV has no check digit, so the Luhn total here proves nothing either way.",
      });
    }
  }

  if (/^0+$/.test(full) && verdict === "valid") {
    findings.push({
      tone: "info",
      text: "Every digit is zero, and it passes. A Luhn pass says only that the digits agree with each other.",
    });
  }

  if (verdict === "invalid") {
    findings.unshift({
      tone: "danger",
      text: `The check digit is ${digits[digits.length - 1]}, and the digits before it call for ${expectedCheck}. The usual causes are one mistyped digit, which Luhn always catches, or two neighboring digits swapped, which it catches except for 09 and 90.`,
    });
  }

  return {
    kind: "ok",
    analysis: { mode, digits, full, steps, sum, expectedCheck, verdict, kind, card, imei, findings },
  };
}

/* -------------------------------------------------------------- examples */

/**
 * Published test numbers that payment processors document for sandbox
 * integration testing, a common documentation example IMEI, and the
 * textbook Luhn example (7992739871, check digit 3).
 */
export const EXAMPLES: { label: string; value: string; mode: Mode }[] = [
  { label: "Visa", value: "4111 1111 1111 1111", mode: "validate" },
  { label: "Mastercard", value: "5555 5555 5555 4444", mode: "validate" },
  { label: "Mastercard 2-series", value: "2223 0031 2200 3222", mode: "validate" },
  { label: "Amex", value: "3782 822463 10005", mode: "validate" },
  { label: "Discover", value: "6011 1111 1111 1117", mode: "validate" },
  { label: "JCB", value: "3530 1113 3330 0000", mode: "validate" },
  { label: "UnionPay", value: "6200 0000 0000 0005", mode: "validate" },
  { label: "Diners Club", value: "3056 930902 5904", mode: "validate" },
  { label: "IMEI", value: "49-015420-323751-8", mode: "validate" },
  { label: "One digit off", value: "4111 1111 1111 1112", mode: "validate" },
  { label: "Compute 7992739871", value: "7992739871", mode: "compute" },
];
