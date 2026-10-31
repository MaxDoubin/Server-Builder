/**
 * International Morse code: the alphabet, a tolerant parser in each
 * direction, and the timing model that drives playback.
 *
 * The alphabet and the 1:3:1:3:7 spacing follow ITU-R M.1677-1
 * (International Morse code, 10/2009). Farnsworth spacing follows the ARRL
 * formulation (J. Bloom, "A Standard for Morse Timing Using the Farnsworth
 * Technique", QEX, April 1990). Nothing in this file touches the DOM, so the
 * whole of it runs under Node for the unit tests.
 */

/** Longest input either direction will translate, in UTF-16 code units. */
export const MAX_INPUT_CHARS = 10_000;
/** Playback schedules at most this many characters, so a pasted book cannot queue hours of audio. */
export const MAX_PLAY_SYMBOLS = 1_000;
/** Problems listed individually before the rest are summarized as a count. */
export const MAX_LISTED_PROBLEMS = 20;

export const MIN_WPM = 5;
export const MAX_WPM = 50;
export const DEFAULT_WPM = 20;
export const MIN_TONE_HZ = 300;
export const MAX_TONE_HZ = 1200;
export const DEFAULT_TONE_HZ = 600;

/** Shown for a token that could not be read as a character. U+FFFD, the Unicode replacement character. */
export const UNKNOWN_MARK = "\uFFFD";

export type SymbolKind = "letter" | "figure" | "punctuation" | "prosign";

export interface MorseSymbol {
  /** How the symbol is written as text: "A", "?", or "<SK>" for a prosign. */
  text: string;
  /** Dots and dashes, with "." for a dot and "-" for a dash. */
  code: string;
  kind: SymbolKind;
  /** Plain English meaning, for punctuation and prosigns. */
  name: string | null;
  /** False for the few widely used signs that ITU-R M.1677-1 does not define. */
  itu: boolean;
}

/* ------------------------------------------------------------- alphabet */

// ITU-R M.1677-1, Part I, 1.1.1 (letters, including the accented e).
const LETTERS: [string, string][] = [
  ["A", ".-"], ["B", "-..."], ["C", "-.-."], ["D", "-.."], ["E", "."],
  ["F", "..-."], ["G", "--."], ["H", "...."], ["I", ".."], ["J", ".---"],
  ["K", "-.-"], ["L", ".-.."], ["M", "--"], ["N", "-."], ["O", "---"],
  ["P", ".--."], ["Q", "--.-"], ["R", ".-."], ["S", "..."], ["T", "-"],
  ["U", "..-"], ["V", "...-"], ["W", ".--"], ["X", "-..-"], ["Y", "-.--"],
  ["Z", "--.."], ["\u00C9", "..-.."],
];

// ITU-R M.1677-1, Part I, 1.1.2 (figures).
const FIGURES: [string, string][] = [
  ["1", ".----"], ["2", "..---"], ["3", "...--"], ["4", "....-"], ["5", "....."],
  ["6", "-...."], ["7", "--..."], ["8", "---.."], ["9", "----."], ["0", "-----"],
];

// ITU-R M.1677-1, Part I, 1.1.3 (punctuation and miscellaneous signs), then
// five signs in common amateur use that the ITU text does not list.
const PUNCTUATION: [string, string, string, boolean][] = [
  [".", ".-.-.-", "full stop", true],
  [",", "--..--", "comma", true],
  [":", "---...", "colon", true],
  ["?", "..--..", "question mark", true],
  ["'", ".----.", "apostrophe", true],
  ["-", "-....-", "hyphen or dash", true],
  ["/", "-..-.", "fraction bar", true],
  ["(", "-.--.", "left bracket", true],
  [")", "-.--.-", "right bracket", true],
  ['"', ".-..-.", "quotation mark", true],
  ["=", "-...-", "double hyphen", true],
  ["+", ".-.-.", "cross or plus sign", true],
  ["@", ".--.-.", "commercial at", true],
  ["!", "-.-.--", "exclamation mark", false],
  [";", "-.-.-.", "semicolon", false],
  ["&", ".-...", "ampersand", false],
  ["$", "...-..-", "dollar sign", false],
  ["_", "..--.-", "underscore", false],
];

/**
 * Procedural signals. Each is two or more characters sent with no letter gap
 * between them, which is why the code is the plain concatenation. The ITU
 * ones are in Part I, 1.1.3; the rest are standard amateur practice.
 */
const PROSIGNS: { letters: string; name: string; itu: boolean; aliases: string[] }[] = [
  { letters: "AR", name: "end of message", itu: true, aliases: [] },
  { letters: "AS", name: "wait", itu: true, aliases: [] },
  { letters: "BT", name: "break, new paragraph", itu: true, aliases: [] },
  { letters: "KN", name: "go ahead, named station only", itu: false, aliases: [] },
  { letters: "SK", name: "end of contact", itu: true, aliases: ["VA"] },
  { letters: "KA", name: "starting signal", itu: true, aliases: ["CT"] },
  { letters: "VE", name: "understood", itu: true, aliases: ["SN"] },
  { letters: "HH", name: "error, the last word follows again", itu: true, aliases: [] },
  { letters: "SOS", name: "distress", itu: false, aliases: [] },
  { letters: "CL", name: "closing down", itu: false, aliases: [] },
  { letters: "BK", name: "break in", itu: false, aliases: [] },
];

const ENCODE = new Map<string, string>();
for (const [ch, code] of [...LETTERS, ...FIGURES]) ENCODE.set(ch, code);
for (const [ch, code] of PUNCTUATION) ENCODE.set(ch, code);
// ITU lists the multiplication sign as the letter X. Encode-only: -..- still decodes to X.
ENCODE.set("\u00D7", "-..-");

function concatCodes(letters: string): string | null {
  let code = "";
  for (const ch of letters) {
    const part = ENCODE.get(ch);
    if (part === undefined || ch === "\u00D7") return null;
    code += part;
  }
  return code;
}

/** Every symbol, in the order a reference chart lists them. */
export const ALPHABET: MorseSymbol[] = [
  ...LETTERS.map(([text, code]): MorseSymbol => ({
    text,
    code,
    kind: "letter",
    name: text === "\u00C9" ? "accented e" : null,
    itu: true,
  })),
  ...FIGURES.map(([text, code]): MorseSymbol => ({ text, code, kind: "figure", name: null, itu: true })),
  ...PUNCTUATION.map(([text, code, name, itu]): MorseSymbol => ({ text, code, kind: "punctuation", name, itu })),
  ...PROSIGNS.map(
    (p): MorseSymbol => ({
      text: `<${p.letters}>`,
      code: concatCodes(p.letters) ?? "",
      kind: "prosign",
      name: p.name,
      itu: p.itu,
    }),
  ),
];

/** Pattern to symbol. Letters, figures and punctuation win; a prosign only fills a pattern nobody else uses. */
const DECODE = new Map<string, MorseSymbol>();
for (const sym of ALPHABET) {
  if (!DECODE.has(sym.code)) DECODE.set(sym.code, sym);
}

/** Prosigns that share their pattern with a punctuation mark, keyed by the mark. */
const SHARED_PATTERN = new Map<string, MorseSymbol>();
for (const sym of ALPHABET) {
  if (sym.kind !== "prosign") continue;
  const owner = DECODE.get(sym.code);
  if (owner && owner !== sym) SHARED_PATTERN.set(owner.text, sym);
}

const PROSIGN_BY_LETTERS = new Map<string, { name: string; canonical: string }>();
for (const p of PROSIGNS) {
  PROSIGN_BY_LETTERS.set(p.letters, { name: p.name, canonical: p.letters });
  for (const alias of p.aliases) PROSIGN_BY_LETTERS.set(alias, { name: p.name, canonical: p.letters });
}

export function lookupCode(code: string): MorseSymbol | null {
  return DECODE.get(code) ?? null;
}

/* ------------------------------------------------------------- spoken form */

/**
 * The spoken form operators learn by ear: a dot is "di" inside a character
 * and "dit" at its end, a dash is always "dah". A is di-dah, C is
 * dah-di-dah-dit.
 */
export function toSpoken(code: string): string {
  const parts: string[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "-") parts.push("dah");
    else parts.push(i === code.length - 1 ? "dit" : "di");
  }
  return parts.join("-");
}

/* ------------------------------------------------------------- encoding */

export interface PlayableSymbol {
  /** Text form, or UNKNOWN_MARK for a valid pattern that is not a character. */
  text: string;
  code: string;
}

export type MorseWord = PlayableSymbol[];

export type EncodeResult =
  | { ok: true; words: MorseWord[]; skipped: { char: string; count: number }[]; substitutions: string[] }
  | { ok: false; error: string };

/**
 * Typography that phones and word processors substitute for plain ASCII.
 * Morse has one quotation mark, one apostrophe and one dash, so each of
 * these is sent as the sign ITU defines for it, and the reader is told.
 */
const TEXT_SUBSTITUTIONS: { pattern: RegExp; replacement: string; note: string }[] = [
  {
    pattern: /[\u2018\u2019\u201B\u2032]/g,
    replacement: "'",
    note: "Curly apostrophes were sent as the apostrophe, .----.",
  },
  {
    pattern: /[\u201C\u201D\u201F\u2033]/g,
    replacement: '"',
    note: "Curly quotation marks were sent as the quotation mark, .-..-.",
  },
  {
    pattern: /\u2026/g,
    replacement: "...",
    note: "An ellipsis character was sent as three full stops.",
  },
  {
    // U+2010 to U+2015 covers every hyphen and dash Unicode has in that block.
    pattern: /[\u2010-\u2015\u2212]/g,
    replacement: "-",
    note: "Typographic dashes and the minus sign were sent as the hyphen, -....-, which ITU defines as hyphen or dash.",
  },
];

function prosignSymbol(inner: string): PlayableSymbol | null {
  const known = PROSIGN_BY_LETTERS.get(inner);
  const code = concatCodes(inner);
  if (code === null) return null;
  return { text: `<${known ? known.canonical : inner}>`, code };
}

/** Text to Morse. Whitespace separates words; a prosign is written in angle brackets, as in <SK>. */
export function encodeText(input: string): EncodeResult {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `Input is limited to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. This is ${input.length.toLocaleString("en-US")}.`,
    };
  }

  let text = input;
  const substitutions: string[] = [];
  for (const sub of TEXT_SUBSTITUTIONS) {
    const next = text.replace(sub.pattern, sub.replacement);
    if (next !== text) {
      text = next;
      substitutions.push(sub.note);
    }
  }

  const chars = Array.from(text);
  const words: MorseWord[] = [];
  const skipped = new Map<string, number>();
  let current: MorseWord = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      if (current.length) words.push(current);
      current = [];
      continue;
    }

    if (ch === "<") {
      // Look no further than a six character prosign away, so a long run of
      // "<" with no ">" stays linear rather than rescanning the rest each time.
      const window = chars.slice(i + 1, i + 8);
      const offset = window.indexOf(">");
      if (offset !== -1) {
        const close = i + 1 + offset;
        const inner = window.slice(0, offset).join("").toUpperCase();
        if (/^[A-Z0-9]{2,6}$/.test(inner)) {
          const sym = prosignSymbol(inner);
          if (sym) {
            current.push(sym);
            i = close;
            continue;
          }
        }
      }
    }

    const upper = ch.toUpperCase();
    // A character whose uppercase is longer than itself (German sharp s
    // becomes SS) is not in the alphabet; do not quietly send two letters.
    const key = Array.from(upper).length === 1 ? upper : ch;
    const code = ENCODE.get(key);
    if (code !== undefined) {
      current.push({ text: key, code });
    } else {
      skipped.set(ch, (skipped.get(ch) ?? 0) + 1);
    }
  }
  if (current.length) words.push(current);

  return {
    ok: true,
    words,
    skipped: [...skipped.entries()].map(([char, count]) => ({ char, count })),
    substitutions,
  };
}

/* ------------------------------------------------------------- decoding */

export interface DecodeProblem {
  token: string;
  /** 1-based word number. */
  word: number;
  /** 1-based character position within the word. */
  position: number;
  kind: "unknown" | "invalid";
}

export type DecodeResult =
  | {
      ok: true;
      text: string;
      words: MorseWord[];
      problems: DecodeProblem[];
      /** One line per punctuation mark in the output that is also a prosign. */
      notes: string[];
    }
  | { ok: false; error: string; looksLikeText: boolean };

/**
 * Undo what smart punctuation does to typed Morse, and accept the dot and
 * dash look-alikes that turn up in copied text. Two hyphens become one long
 * dash on most phones, so that long dash (U+2014) stands for two dashes.
 */
export function normalizeMorse(input: string): string {
  return input
    .replace(/\u2026/g, "...")
    .replace(/\u2014/g, "--")
    .replace(/[\u2010-\u2013\u2015\u2212_]/g, "-")
    .replace(/[\u00B7\u2022\u2219\u22C5]/g, ".");
}

const DITDAH = /(dah|dit|di)-?/y;

/** One character token to its dot and dash pattern, or null when it is neither form. */
export function parseToken(token: string): string | null {
  if (/^[.-]+$/.test(token)) return token;
  const lower = token.toLowerCase().replace(/-+$/, "");
  if (lower === "" || !/^[a-z-]+$/.test(lower)) return null;
  let code = "";
  DITDAH.lastIndex = 0;
  while (DITDAH.lastIndex < lower.length) {
    const start = DITDAH.lastIndex;
    const m = DITDAH.exec(lower);
    if (!m || m.index !== start) return null;
    code += m[1] === "dah" ? "-" : ".";
  }
  return code === "" ? null : code;
}

/**
 * Morse to text. A space separates characters; a slash, a vertical bar, a
 * line break or two or more spaces separate words. Each character may be
 * dots and dashes or spoken form (di-dah).
 */
export function decodeMorse(input: string): DecodeResult {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `Input is limited to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. This is ${input.length.toLocaleString("en-US")}.`,
      looksLikeText: false,
    };
  }

  const normalized = normalizeMorse(input).trim();
  if (normalized === "") return { ok: true, text: "", words: [], problems: [], notes: [] };

  const wordStrings = normalized
    .split(/\s*[/|]\s*|\s*\n\s*|\s{2,}/)
    .map((w) => w.trim())
    .filter((w) => w !== "");
  // Separators and nothing else: no characters, so nothing to report.
  if (wordStrings.length === 0) return { ok: true, text: "", words: [], problems: [], notes: [] };

  const words: MorseWord[] = [];
  const textWords: string[] = [];
  const problems: DecodeProblem[] = [];
  const shared = new Set<string>();
  let readable = 0;

  wordStrings.forEach((wordString, wi) => {
    const word: MorseWord = [];
    let wordText = "";
    wordString.split(/\s+/).forEach((token, ti) => {
      const code = parseToken(token);
      if (code === null) {
        problems.push({ token, word: wi + 1, position: ti + 1, kind: "invalid" });
        wordText += UNKNOWN_MARK;
        return;
      }
      readable += 1;
      // ITU calls the error signal eight dots; operators send eight or more.
      const sym = lookupCode(code) ?? (/^\.{8,}$/.test(code) ? lookupCode("........") : null);
      if (sym) {
        word.push({ text: sym.text, code });
        wordText += sym.text;
        if (SHARED_PATTERN.has(sym.text)) shared.add(sym.text);
      } else {
        problems.push({ token, word: wi + 1, position: ti + 1, kind: "unknown" });
        word.push({ text: UNKNOWN_MARK, code });
        wordText += UNKNOWN_MARK;
      }
    });
    if (word.length) words.push(word);
    textWords.push(wordText);
  });

  if (readable === 0) {
    return {
      ok: false,
      error:
        "Nothing here reads as Morse. Use . and - (or di, dit and dah), a space between characters, and / between words.",
      looksLikeText: /[a-z0-9]/i.test(normalized),
    };
  }

  const notes = [...shared].map((mark) => {
    const pro = SHARED_PATTERN.get(mark) as MorseSymbol;
    return `${mark} (${pro.code}) is the same signal as the prosign ${pro.text}, ${pro.name}. Only context tells them apart.`;
  });

  return { ok: true, text: textWords.join(" "), words, problems, notes };
}

/** True when text typed in the text box is more likely Morse that belongs in the other direction. */
export function looksLikeMorse(input: string): boolean {
  const s = normalizeMorse(input).trim();
  if (s.replace(/\s/g, "").length < 2) return false;
  if (/^[\s./|-]+$/.test(s)) return /[.-]/.test(s);
  return /^(?:[\s/|-]|dah|dit|di)+$/i.test(s) && /d/i.test(s);
}

/* ------------------------------------------------------------- formatting */

export type MorseStyle = "symbols" | "spoken";

export function formatMorse(words: MorseWord[], style: MorseStyle): string {
  return words
    .map((w) => w.map((s) => (style === "symbols" ? s.code : toSpoken(s.code))).join(" "))
    .join(" / ");
}

export function symbolCount(words: MorseWord[]): number {
  return words.reduce((n, w) => n + w.length, 0);
}

/* ------------------------------------------------------------- timing */

export interface Timing {
  charWpm: number;
  effectiveWpm: number;
  farnsworth: boolean;
  /** Length of one dot, in seconds, at the character speed. */
  unit: number;
  dah: number;
  /** Silence between the elements of one character. */
  intraGap: number;
  letterGap: number;
  wordGap: number;
}

function clampNumber(value: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * PARIS timing: the word PARIS plus its trailing word space is exactly 50
 * units, so at W words per minute a unit lasts 60 / (50 W) = 1.2 / W
 * seconds.
 *
 * Farnsworth: the characters keep the character speed c and only the gaps
 * stretch, so that a PARIS still takes 60 / s seconds at the effective
 * speed s. PARIS holds 31 units inside its characters and 19 units of gap
 * (four letter gaps of 3 and one word gap of 7). Bloom's formula spreads
 * the leftover time over those 19:
 *
 *   ta = (60 c - 37.2 s) / (s c)    total gap time per word, seconds
 *   tf = ta / 19                    one stretched gap unit
 */
export function morseTiming(charWpm: number, effectiveWpm: number): Timing {
  const c = clampNumber(charWpm, MIN_WPM, MAX_WPM, DEFAULT_WPM);
  const s = clampNumber(effectiveWpm, MIN_WPM, c, c);
  const unit = 1.2 / c;
  const base = { charWpm: c, effectiveWpm: s, unit, dah: 3 * unit, intraGap: unit };
  if (s >= c) {
    return { ...base, effectiveWpm: c, farnsworth: false, letterGap: 3 * unit, wordGap: 7 * unit };
  }
  const ta = (60 * c - 37.2 * s) / (s * c);
  const tf = ta / 19;
  return { ...base, farnsworth: true, letterGap: 3 * tf, wordGap: 7 * tf };
}

export interface KeyDown {
  /** Seconds from the start of playback. */
  on: number;
  off: number;
  /** Index into the plan's flat symbol list. */
  symbol: number;
}

export interface PlannedSymbol {
  text: string;
  code: string;
  start: number;
  end: number;
}

export interface Plan {
  downs: KeyDown[];
  symbols: PlannedSymbol[];
  /** From the first key down to the last key up, in seconds. No trailing gap. */
  duration: number;
  truncated: boolean;
}

/** Lay the message out on a timeline: every key down, every key up. */
export function planPlayback(words: MorseWord[], timing: Timing, maxSymbols = MAX_PLAY_SYMBOLS): Plan {
  const downs: KeyDown[] = [];
  const symbols: PlannedSymbol[] = [];
  let t = 0;
  let truncated = false;

  outer: for (let wi = 0; wi < words.length; wi++) {
    if (wi > 0 && symbols.length > 0) t += timing.wordGap;
    const word = words[wi];
    for (let si = 0; si < word.length; si++) {
      if (symbols.length >= maxSymbols) {
        truncated = true;
        break outer;
      }
      if (si > 0) t += timing.letterGap;
      const sym = word[si];
      const start = t;
      const index = symbols.length;
      for (let ei = 0; ei < sym.code.length; ei++) {
        if (ei > 0) t += timing.intraGap;
        const length = sym.code[ei] === "-" ? timing.dah : timing.unit;
        downs.push({ on: t, off: t + length, symbol: index });
        t += length;
      }
      symbols.push({ text: sym.text, code: sym.code, start, end: t });
    }
  }

  return { downs, symbols, duration: t, truncated };
}

/** Whether the key is down at time t, and which character is being sent. Binary search, so it is cheap per frame. */
export function activeAt(plan: Plan, t: number): { keyed: boolean; symbol: number } {
  const { downs, symbols } = plan;
  let lo = 0;
  let hi = downs.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (downs[mid].on <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const keyed = found >= 0 && t < downs[found].off;

  lo = 0;
  hi = symbols.length - 1;
  let symbol = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (symbols[mid].start <= t) {
      symbol = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { keyed, symbol };
}
