/**
 * Bacon's biliteral cipher, plain and steganographic.
 *
 * Every letter becomes a group of five symbols drawn from two, which is a
 * five bit binary number written with A for 0 and B for 1. Bacon's own table
 * (De Augmentis Scientiarum, 1623) has 24 letters because I/J and U/V were
 * still one letter each; the later 26 letter table simply numbers A to Z
 * from 0 to 25. The two tables agree from A to I and differ from J onward.
 *
 * The steganographic half hides those A/B symbols in a cover text, one per
 * letter of the cover: either in the letter's case, or in which of two
 * typefaces it is set in. For plain text the "typefaces" are the Unicode
 * Mathematical Alphanumeric Symbols (U+1D400 to U+1D6A3), which survive a
 * copy and paste where CSS bold would not.
 *
 * Pure functions, no React and no DOM.
 */

export type BaconAlphabet = 24 | 26;

/** Longest text accepted in any field, in UTF-16 code units. */
export const MAX_CHARS = 20_000;

/** Characters of a cover text drawn in the highlighted pattern view. */
export const MAX_PREVIEW_CHARS = 4_000;

/** Sample of dropped or ignored characters reported back to the reader. */
const SAMPLE_LIMIT = 8;

/* ---------------------------------------------------------------- tables */

const ASCII_LETTER = /^[A-Za-z]$/;

/**
 * Position of a letter in the chosen table, or null for anything that is
 * not A to Z. In the 24 letter table J reads as I and V reads as U.
 */
export function letterIndex(ch: string, alphabet: BaconAlphabet): number | null {
  if (!ASCII_LETTER.test(ch)) return null;
  const n = ch.toUpperCase().charCodeAt(0) - 65;
  if (alphabet === 26) return n;
  if (n <= 8) return n; // A to I
  if (n === 9) return 8; // J shares I
  if (n <= 20) return n - 1; // K to U
  if (n === 21) return 19; // V shares U
  return n - 2; // W to Z
}

/** The letter a decoder prints for an index, or null when the index is unused. */
export function letterFor(index: number, alphabet: BaconAlphabet): string | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (alphabet === 26) return index <= 25 ? String.fromCharCode(65 + index) : null;
  if (index > 23) return null;
  if (index <= 8) return String.fromCharCode(65 + index);
  if (index <= 19) return String.fromCharCode(65 + index + 1);
  return String.fromCharCode(65 + index + 2);
}

/** Like letterFor, but shows the shared letters of the 24 letter table as I/J and U/V. */
export function letterLabel(index: number, alphabet: BaconAlphabet): string | null {
  if (alphabet === 24 && index === 8) return "I/J";
  if (alphabet === 24 && index === 19) return "U/V";
  return letterFor(index, alphabet);
}

/** Five symbols, most significant first, with "a" for 0 and "b" for 1. */
export function codeOf(index: number): string {
  let out = "";
  for (let bit = 4; bit >= 0; bit -= 1) out += (index >> bit) & 1 ? "b" : "a";
  return out;
}

export interface TableRow {
  index: number;
  label: string;
  code: string;
}

/** The whole table for the chosen alphabet, in order. */
export function alphabetTable(alphabet: BaconAlphabet): TableRow[] {
  const rows: TableRow[] = [];
  for (let i = 0; i < alphabet; i += 1) {
    rows.push({ index: i, label: letterLabel(i, alphabet) ?? "?", code: codeOf(i) });
  }
  return rows;
}

/* --------------------------------------------------------------- symbols */

export interface Symbols {
  a: string;
  b: string;
  /** True when the two symbols differ even ignoring case, so case is not significant. */
  foldCase: boolean;
}

export type SymbolsResult = { ok: true; symbols: Symbols } | { ok: false; error: string };

/** Validate the two symbols a reader wants to write A and B with. */
export function parseSymbols(rawA: string, rawB: string): SymbolsResult {
  const pa = Array.from(rawA);
  const pb = Array.from(rawB);
  for (const [name, parts] of [
    ["A", pa],
    ["B", pb],
  ] as const) {
    if (parts.length === 0) return { ok: false, error: `The symbol for ${name} is empty. Type one character.` };
    if (parts.length > 1) {
      return {
        ok: false,
        error: `The symbol for ${name} is ${parts.length} characters. Each symbol has to be exactly one character.`,
      };
    }
    if (/\s/u.test(parts[0])) {
      return {
        ok: false,
        error: `The symbol for ${name} is whitespace, which is what separates the groups. Pick a visible character.`,
      };
    }
  }
  if (rawA === rawB) return { ok: false, error: "The two symbols are the same character, so nothing could be told apart." };
  const foldCase = rawA.toLowerCase() !== rawB.toLowerCase();
  return { ok: true, symbols: { a: rawA, b: rawB, foldCase } };
}

/* -------------------------------------------------------------- encoding */

export interface EncodedLetter {
  /** The character as it appeared in the message. */
  source: string;
  index: number;
  /** Five symbols of "a" and "b". */
  code: string;
}

export interface EncodeResult {
  letters: EncodedLetter[];
  /** Every group joined, as "a" and "b". */
  bits: string;
  /** Characters that were neither letters nor whitespace and so were dropped. */
  dropped: number;
  droppedSample: string[];
  /** J and V letters folded into I and U by the 24 letter table. */
  merged: number;
}

function pushSample(sample: string[], ch: string) {
  if (sample.length < SAMPLE_LIMIT && !sample.includes(ch)) sample.push(ch);
}

/** Turn every A to Z letter of a message into its five symbol group. */
export function encodeLetters(text: string, alphabet: BaconAlphabet): EncodeResult {
  const letters: EncodedLetter[] = [];
  const droppedSample: string[] = [];
  let dropped = 0;
  let merged = 0;
  let bits = "";
  for (const ch of text) {
    const index = letterIndex(ch, alphabet);
    if (index === null) {
      if (!/\s/u.test(ch)) {
        dropped += 1;
        pushSample(droppedSample, ch);
      }
      continue;
    }
    if (alphabet === 24 && /[JjVv]/.test(ch)) merged += 1;
    const code = codeOf(index);
    letters.push({ source: ch, index, code });
    bits += code;
  }
  return { letters, bits, dropped, droppedSample, merged };
}

/** Write a/b bits with the reader's two symbols, optionally in groups of five. */
export function renderBits(bits: string, symbols: Pick<Symbols, "a" | "b">, spaced: boolean): string {
  let out = "";
  for (let i = 0; i < bits.length; i += 1) {
    if (spaced && i > 0 && i % 5 === 0) out += " ";
    out += bits[i] === "b" ? symbols.b : symbols.a;
  }
  return out;
}

/* -------------------------------------------------------------- decoding */

export interface ExtractResult {
  bits: string;
  /** Visible characters that matched neither symbol. */
  ignored: number;
  ignoredSample: string[];
}

/** Read the A/B stream out of a text written with two symbols. Whitespace is skipped silently. */
export function extractBits(text: string, symbols: Symbols): ExtractResult {
  const a = symbols.foldCase ? symbols.a.toLowerCase() : symbols.a;
  const b = symbols.foldCase ? symbols.b.toLowerCase() : symbols.b;
  const ignoredSample: string[] = [];
  let ignored = 0;
  let bits = "";
  for (const raw of text) {
    const ch = symbols.foldCase ? raw.toLowerCase() : raw;
    if (ch === a) bits += "a";
    else if (ch === b) bits += "b";
    else if (!/\s/u.test(raw)) {
      ignored += 1;
      pushSample(ignoredSample, raw);
    }
  }
  return { bits, ignored, ignoredSample };
}

export interface DecodedGroup {
  code: string;
  index: number;
  /** Null when the group is past the end of the table. */
  letter: string | null;
}

export interface DecodeResult {
  groups: DecodedGroup[];
  /** Decoded letters, with "?" for a group the table has no letter for. */
  text: string;
  /** Symbols after the last whole group of five. */
  leftover: string;
  /** Groups past the end of the table. */
  invalid: number;
  /** Trailing groups that are all A, which is what unused cover letters read as. */
  trailingA: number;
}

/** Split a/b bits into groups of five and look each one up. */
export function decodeBits(bits: string, alphabet: BaconAlphabet): DecodeResult {
  const groups: DecodedGroup[] = [];
  let text = "";
  let invalid = 0;
  const whole = bits.length - (bits.length % 5);
  for (let i = 0; i < whole; i += 5) {
    const code = bits.slice(i, i + 5);
    let index = 0;
    for (const c of code) index = index * 2 + (c === "b" ? 1 : 0);
    const letter = letterFor(index, alphabet);
    if (letter === null) invalid += 1;
    groups.push({ code, index, letter });
    text += letter ?? "?";
  }
  let trailingA = 0;
  for (let i = groups.length - 1; i >= 0 && groups[i].index === 0; i -= 1) trailingA += 1;
  return { groups, text, leftover: bits.slice(whole), invalid, trailingA };
}

/** The same stream with every A read as B and every B as A. */
export function swapBits(bits: string): string {
  let out = "";
  for (let i = 0; i < bits.length; i += 1) out += bits[i] === "a" ? "b" : "a";
  return out;
}

/* ---------------------------------------------------- pattern segments */

export type SegmentKind = "a" | "b" | "pad" | "none";

export interface Segment {
  text: string;
  kind: SegmentKind;
}

export interface Segments {
  segments: Segment[];
  /** True when the text was longer than MAX_PREVIEW_CHARS and was cut. */
  truncated: boolean;
}

/** Collapse a text into runs of the same kind, for drawing the carrier pattern. */
function buildSegments(chars: string[], kinds: SegmentKind[]): Segments {
  const segments: Segment[] = [];
  const limit = Math.min(chars.length, MAX_PREVIEW_CHARS);
  for (let i = 0; i < limit; i += 1) {
    const last = segments[segments.length - 1];
    if (last && last.kind === kinds[i]) last.text += chars[i];
    else segments.push({ text: chars[i], kind: kinds[i] });
  }
  return { segments, truncated: chars.length > MAX_PREVIEW_CHARS };
}

/* ------------------------------------------------------ case carriers */

/**
 * A character carries a bit in its case only when it has distinct single
 * character upper and lower forms and is currently one of them. That keeps
 * out digits, punctuation, the Mathematical Alphanumeric letters (which
 * have no case mapping), titlecase digraphs, and letters such as the German
 * sharp s whose uppercase is two characters.
 */
export function isCaseCarrier(ch: string): boolean {
  const up = ch.toUpperCase();
  const low = ch.toLowerCase();
  if (up === low) return false;
  if (Array.from(up).length !== 1 || Array.from(low).length !== 1) return false;
  return ch === up || ch === low;
}

export type HideResult =
  | {
      ok: true;
      text: string;
      bits: string;
      letters: EncodedLetter[];
      carriers: number;
      used: number;
      spare: number;
      dropped: number;
      pattern: Segments;
    }
  | { ok: false; error: string };

function capacityError(carriers: number, need: number, letters: number, unit: [string, string]): string {
  const short = need - carriers;
  const noun = (n: number) => (n === 1 ? unit[0] : unit[1]);
  return `The cover text has ${carriers} ${noun(carriers)} that can carry a symbol. Hiding ${letters} ${
    letters === 1 ? "letter" : "letters"
  } takes ${need} (five per letter), so add at least ${short} more ${noun(short)} to the cover or shorten the message.`;
}

function tooLong(name: string, length: number): string {
  return `The ${name} is ${length.toLocaleString("en-US")} characters long. This tool stops at ${MAX_CHARS.toLocaleString(
    "en-US",
  )} so the page stays responsive.`;
}

/**
 * Hide a message in the case of a cover text's letters. Carriers past the
 * end of the message are set to the A case, so a reader who decodes the
 * whole cover sees trailing A groups rather than random letters.
 */
export function hideInCase(
  message: string,
  cover: string,
  alphabet: BaconAlphabet,
  aIsUpper: boolean,
): HideResult {
  if (message.length > MAX_CHARS) return { ok: false, error: tooLong("message", message.length) };
  if (cover.length > MAX_CHARS) return { ok: false, error: tooLong("cover text", cover.length) };
  const encoded = encodeLetters(message, alphabet);
  if (encoded.letters.length === 0) {
    return { ok: false, error: "The message has no letters from A to Z, so there is nothing to hide." };
  }
  const chars = Array.from(cover);
  let carriers = 0;
  for (const ch of chars) if (isCaseCarrier(ch)) carriers += 1;
  const need = encoded.bits.length;
  if (carriers < need) {
    return { ok: false, error: capacityError(carriers, need, encoded.letters.length, ["letter", "letters"]) };
  }

  const kinds: SegmentKind[] = [];
  let out = "";
  let i = 0;
  for (const ch of chars) {
    if (!isCaseCarrier(ch)) {
      out += ch;
      kinds.push("none");
      continue;
    }
    const bit = i < need ? encoded.bits[i] : "a";
    const wantUpper = (bit === "a") === aIsUpper;
    out += wantUpper ? ch.toUpperCase() : ch.toLowerCase();
    kinds.push(i < need ? (bit as "a" | "b") : "pad");
    i += 1;
  }
  return {
    ok: true,
    text: out,
    bits: encoded.bits,
    letters: encoded.letters,
    carriers,
    used: need,
    spare: carriers - need,
    dropped: encoded.dropped,
    // isCaseCarrier only admits letters whose other case is one character,
    // so the output has exactly as many code points as kinds has entries.
    pattern: buildSegments(Array.from(out), kinds),
  };
}

export type ReadResult =
  | { ok: true; bits: string; carriers: number; pattern: Segments; styleA: StyleId | null; styleB: StyleId | null }
  | { ok: false; error: string };

/** Read the A/B stream from the case of a text's letters. */
export function readCase(text: string, aIsUpper: boolean): ReadResult {
  if (text.length > MAX_CHARS) return { ok: false, error: tooLong("text", text.length) };
  const chars = Array.from(text);
  const kinds: SegmentKind[] = [];
  let bits = "";
  for (const ch of chars) {
    if (!isCaseCarrier(ch)) {
      kinds.push("none");
      continue;
    }
    const upper = ch === ch.toUpperCase();
    const bit = upper === aIsUpper ? "a" : "b";
    bits += bit;
    kinds.push(bit);
  }
  if (bits.length === 0) {
    return { ok: false, error: "There are no upper or lower case letters in this text, so it carries no case pattern." };
  }
  return { ok: true, bits, carriers: bits.length, pattern: buildSegments(chars, kinds), styleA: null, styleB: null };
}

/* ------------------------------------------------------ style carriers */

export type StyleId =
  | "plain"
  | "bold"
  | "italic"
  | "bold-italic"
  | "script"
  | "bold-script"
  | "fraktur"
  | "double-struck"
  | "bold-fraktur"
  | "sans"
  | "sans-bold"
  | "sans-italic"
  | "sans-bold-italic"
  | "monospace";

/**
 * The thirteen Latin letter styles of the Mathematical Alphanumeric
 * Symbols block, in code point order. Each is 52 code points, capitals
 * then small letters, starting at U+1D400 (Unicode chapter 22.2).
 */
const MATH_STYLES: StyleId[] = [
  "bold",
  "italic",
  "bold-italic",
  "script",
  "bold-script",
  "fraktur",
  "double-struck",
  "bold-fraktur",
  "sans",
  "sans-bold",
  "sans-italic",
  "sans-bold-italic",
  "monospace",
];

export const STYLE_LABELS: Record<StyleId, string> = {
  plain: "Plain",
  bold: "Bold",
  italic: "Italic",
  "bold-italic": "Bold italic",
  script: "Script",
  "bold-script": "Bold script",
  fraktur: "Fraktur",
  "double-struck": "Double-struck",
  "bold-fraktur": "Bold Fraktur",
  sans: "Sans-serif",
  "sans-bold": "Sans-serif bold",
  "sans-italic": "Sans-serif italic",
  "sans-bold-italic": "Sans-serif bold italic",
  monospace: "Monospace",
};

export const STYLE_IDS: StyleId[] = ["plain", ...MATH_STYLES];

const MATH_START = 0x1d400;
const MATH_END = MATH_START + MATH_STYLES.length * 52; // exclusive, U+1D6A4

/**
 * Letters that were encoded in the Letterlike Symbols block before the
 * mathematical block existed. Their slots in the mathematical block are
 * reserved and never used, so a styled letter has to come from here.
 */
const HOLES: Record<number, number> = {
  0x1d455: 0x210e, // italic small h
  0x1d49d: 0x212c, // script B
  0x1d4a0: 0x2130, // script E
  0x1d4a1: 0x2131, // script F
  0x1d4a3: 0x210b, // script H
  0x1d4a4: 0x2110, // script I
  0x1d4a7: 0x2112, // script L
  0x1d4a8: 0x2133, // script M
  0x1d4ad: 0x211b, // script R
  0x1d4ba: 0x212f, // script small e
  0x1d4bc: 0x210a, // script small g
  0x1d4c4: 0x2134, // script small o
  0x1d506: 0x212d, // Fraktur C
  0x1d50b: 0x210c, // Fraktur H
  0x1d50c: 0x2111, // Fraktur I
  0x1d515: 0x211c, // Fraktur R
  0x1d51d: 0x2128, // Fraktur Z
  0x1d53a: 0x2102, // double-struck C
  0x1d53f: 0x210d, // double-struck H
  0x1d545: 0x2115, // double-struck N
  0x1d547: 0x2119, // double-struck P
  0x1d548: 0x211a, // double-struck Q
  0x1d549: 0x211d, // double-struck R
  0x1d551: 0x2124, // double-struck Z
};

const FILLERS = new Map<number, number>(Object.entries(HOLES).map(([slot, filler]) => [filler, Number(slot)]));

/** Set a plain A to Z or a to z letter in one of the styles. */
export function styleLetter(base: string, style: StyleId): string {
  if (!ASCII_LETTER.test(base) || style === "plain") return base;
  const code = base.charCodeAt(0);
  const offset = code <= 90 ? code - 65 : code - 97 + 26;
  const slot = MATH_START + MATH_STYLES.indexOf(style) * 52 + offset;
  return String.fromCodePoint(HOLES[slot] ?? slot);
}

/** Which style a letter is set in, and the plain letter underneath, or null for anything else. */
export function classifyLetter(ch: string): { style: StyleId; base: string } | null {
  if (ASCII_LETTER.test(ch)) return { style: "plain", base: ch };
  const cp = ch.codePointAt(0);
  if (cp === undefined || Array.from(ch).length !== 1) return null;
  const slot = FILLERS.get(cp) ?? cp;
  if (slot < MATH_START || slot >= MATH_END) return null;
  if (slot === cp && HOLES[cp] !== undefined) return null; // a reserved, unassigned code point
  const rel = slot - MATH_START;
  const style = MATH_STYLES[Math.floor(rel / 52)];
  const offset = rel % 52;
  const base = offset < 26 ? String.fromCharCode(65 + offset) : String.fromCharCode(97 + offset - 26);
  return { style, base };
}

/** Hide a message by setting each cover letter in style A or style B. */
export function hideInStyles(
  message: string,
  cover: string,
  alphabet: BaconAlphabet,
  styleA: StyleId,
  styleB: StyleId,
): HideResult {
  if (message.length > MAX_CHARS) return { ok: false, error: tooLong("message", message.length) };
  if (cover.length > MAX_CHARS) return { ok: false, error: tooLong("cover text", cover.length) };
  if (styleA === styleB) return { ok: false, error: "The two styles are the same, so the letters could not be told apart." };
  const encoded = encodeLetters(message, alphabet);
  if (encoded.letters.length === 0) {
    return { ok: false, error: "The message has no letters from A to Z, so there is nothing to hide." };
  }
  const chars = Array.from(cover);
  let carriers = 0;
  for (const ch of chars) if (classifyLetter(ch)) carriers += 1;
  const need = encoded.bits.length;
  if (carriers < need) {
    return { ok: false, error: capacityError(carriers, need, encoded.letters.length, ["letter from A to Z", "letters from A to Z"]) };
  }
  const kinds: SegmentKind[] = [];
  const outChars: string[] = [];
  let i = 0;
  for (const ch of chars) {
    const info = classifyLetter(ch);
    if (!info) {
      outChars.push(ch);
      kinds.push("none");
      continue;
    }
    const bit = i < need ? encoded.bits[i] : "a";
    outChars.push(styleLetter(info.base, bit === "b" ? styleB : styleA));
    kinds.push(i < need ? (bit as "a" | "b") : "pad");
    i += 1;
  }
  return {
    ok: true,
    text: outChars.join(""),
    bits: encoded.bits,
    letters: encoded.letters,
    carriers,
    used: need,
    spare: carriers - need,
    dropped: encoded.dropped,
    pattern: buildSegments(outChars, kinds),
  };
}

/**
 * Read the A/B stream from which of two styles each letter is set in.
 * Plain letters are A when they are one of the two styles; otherwise the
 * style seen first is A. flip swaps the two.
 */
export function readStyles(text: string, flip: boolean): ReadResult {
  if (text.length > MAX_CHARS) return { ok: false, error: tooLong("text", text.length) };
  const chars = Array.from(text);
  const infos = chars.map(classifyLetter);
  const seen: StyleId[] = [];
  for (const info of infos) if (info && !seen.includes(info.style)) seen.push(info.style);
  if (seen.length === 0) {
    return { ok: false, error: "There are no letters from A to Z in this text, plain or styled." };
  }
  if (seen.length === 1) {
    return {
      ok: false,
      error: `Every letter is ${STYLE_LABELS[seen[0]].toLowerCase()}. A two style message needs letters in exactly two styles, such as plain and bold.`,
    };
  }
  if (seen.length > 2) {
    return {
      ok: false,
      error: `This text mixes ${seen.length} letter styles (${seen
        .map((s) => STYLE_LABELS[s].toLowerCase())
        .join(", ")}). Bacon's cipher uses exactly two.`,
    };
  }
  let [first, second] = seen.includes("plain") ? (["plain", seen.find((s) => s !== "plain")!] as StyleId[]) : seen;
  if (flip) [first, second] = [second, first];
  const kinds: SegmentKind[] = [];
  let bits = "";
  for (const info of infos) {
    if (!info) {
      kinds.push("none");
      continue;
    }
    const bit = info.style === first ? "a" : "b";
    bits += bit;
    kinds.push(bit);
  }
  return { ok: true, bits, carriers: bits.length, pattern: buildSegments(chars, kinds), styleA: first, styleB: second };
}
