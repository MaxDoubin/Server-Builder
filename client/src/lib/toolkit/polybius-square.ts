/**
 * Polybius square, tap code, and the ADFGX / ADFGVX substitution stage.
 *
 * All three are the same mechanism: write an alphabet into a grid and name
 * each character by its row and its column.
 *
 *   - Polybius 5x5: 25 cells, so J shares I's cell. Coordinates 1 to 5.
 *   - Polybius 6x6: A to Z and 0 to 9, nothing merged. Coordinates 1 to 6.
 *   - Tap code: the 5x5 grid with K dropped and sent as C, letters in
 *     alphabetical order (A-E, F-J, L-P, Q-U, V-Z). Sent as taps.
 *   - ADFGX labels the 5x5 rows and columns A D F G X; ADFGVX labels the
 *     6x6 grid A D F G V X. Only this substitution step is implemented. The
 *     real ciphers follow it with a keyed columnar transposition, which is
 *     where their strength came from, and that stage is out of scope here.
 *
 * A keyword mixes the square: its characters first, each only once, then the
 * rest of the alphabet in order. Pure functions, no React and no DOM.
 */

/** Characters of input read per run. Past this the input is cut and the caller says so. */
export const MAX_INPUT_CHARS = 10_000;
/** Letters scheduled for audio playback. A letter of tap code takes two to four seconds. */
export const MAX_PLAY_LETTERS = 100;

export type Scheme = "polybius" | "tap";
export type Size = 5 | 6;
export type LabelStyle = "digits" | "letters";

export interface SquareOptions {
  scheme: Scheme;
  size: Size;
  keyword: string;
  labels: LabelStyle;
}

export interface Square {
  scheme: Scheme;
  size: Size;
  /** size * size characters, row by row. */
  cells: string[];
  /** The letter folded into another cell, if any: J into I, or K into C. */
  merge: { from: string; to: string } | null;
  /** Row and column labels, in order. */
  labels: string[];
  /** The keyword's characters after folding and de-duplication. */
  keyPart: string;
  /** Characters the keyword held that the square cannot use. */
  keywordIgnored: number;
  index: Map<string, number>;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** Display label for a cell, showing the letter merged into it. */
export function cellLabel(square: Square, cell: number): string {
  const ch = square.cells[cell];
  return square.merge && square.merge.to === ch ? `${ch}/${square.merge.from}` : ch;
}

/** The labels used for coordinates. */
export function coordinateLabels(size: Size, style: LabelStyle): string[] {
  if (style === "letters") return (size === 5 ? "ADFGX" : "ADFGVX").split("");
  return Array.from({ length: size }, (_, i) => String(i + 1));
}

/**
 * One input character as the square sees it: uppercased, accents removed
 * (é is E), and the merged letter folded. Returns null for anything the
 * square has no cell for.
 */
export function foldChar(ch: string, square: Pick<Square, "size" | "merge">): { char: string; merged: boolean; accent: boolean } | null {
  let base = ch;
  let accent = false;
  if (!/^[A-Za-z0-9]$/.test(ch)) {
    // Decompose and drop combining marks: "é" becomes "e". The ASCII test
    // afterward keeps out "ß" and the dotless "ı", whose uppercase forms are
    // not single Latin letters.
    base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    accent = true;
    if (!/^[A-Za-z]$/.test(base)) return null;
  }
  const up = base.toUpperCase();
  if (DIGITS.includes(up) && square.size !== 6) return null;
  if (square.merge && up === square.merge.from) return { char: square.merge.to, merged: true, accent };
  return { char: up, merged: false, accent };
}

export function buildSquare(options: SquareOptions): Square {
  const scheme = options.scheme;
  const size: Size = scheme === "tap" ? 5 : options.size;
  const merge = scheme === "tap" ? { from: "K", to: "C" } : size === 5 ? { from: "J", to: "I" } : null;
  const alphabet = (size === 6 ? LETTERS + DIGITS : LETTERS).split("").filter((c) => !merge || c !== merge.from);
  const labels = scheme === "tap" ? coordinateLabels(5, "digits") : coordinateLabels(size, options.labels);

  // The tap code grid is fixed by convention; a keyword applies to the
  // Polybius and ADFGX squares only.
  const keyword = scheme === "tap" ? "" : options.keyword.slice(0, 200);
  const seen = new Set<string>();
  let keyPart = "";
  let keywordIgnored = 0;
  for (const ch of keyword) {
    if (/\s/.test(ch)) continue;
    const folded = foldChar(ch, { size, merge });
    if (!folded) {
      keywordIgnored += 1;
      continue;
    }
    if (!seen.has(folded.char)) {
      seen.add(folded.char);
      keyPart += folded.char;
    }
  }
  const cells = [...keyPart.split(""), ...alphabet.filter((c) => !seen.has(c))];
  const index = new Map<string, number>();
  cells.forEach((c, i) => index.set(c, i));
  return { scheme, size, cells, merge, labels, keyPart, keywordIgnored, index };
}

/* --------------------------------------------------------------- encoding */

export interface Letter {
  /** The character as it appears in the square. */
  char: string;
  cell: number;
  row: number;
  col: number;
  /** What it came from in the input: the original character, or the coordinate text. */
  source: string;
  /** Code unit offset of the source in the input. */
  at: number;
  /** True when the input letter was folded (J to I, K to C). */
  merged: boolean;
}

export interface Skipped {
  char: string;
  count: number;
}

export interface EncodeResult {
  words: Letter[][];
  letters: Letter[];
  skipped: Skipped[];
  merged: number;
  accents: number;
  truncated: boolean;
}

function capInput(input: string): { text: string; truncated: boolean } {
  if (input.length <= MAX_INPUT_CHARS) return { text: input, truncated: false };
  let end = MAX_INPUT_CHARS;
  const c = input.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return { text: input.slice(0, end), truncated: true };
}

export function encode(input: string, square: Square): EncodeResult {
  const { text, truncated } = capInput(input);
  const words: Letter[][] = [];
  const letters: Letter[] = [];
  const skipped = new Map<string, number>();
  let current: Letter[] = [];
  let merged = 0;
  let accents = 0;
  let at = 0;

  for (const ch of text) {
    const offset = at;
    at += ch.length;
    if (/\s/.test(ch)) {
      if (current.length) words.push(current);
      current = [];
      continue;
    }
    const folded = foldChar(ch, square);
    const cell = folded ? square.index.get(folded.char) : undefined;
    if (!folded || cell === undefined) {
      skipped.set(ch, (skipped.get(ch) ?? 0) + 1);
      continue;
    }
    if (folded.merged) merged += 1;
    if (folded.accent) accents += 1;
    const letter: Letter = {
      char: folded.char,
      cell,
      row: Math.floor(cell / square.size),
      col: cell % square.size,
      source: ch,
      at: offset,
      merged: folded.merged,
    };
    current.push(letter);
    letters.push(letter);
  }
  if (current.length) words.push(current);

  return {
    words,
    letters,
    skipped: [...skipped.entries()].map(([char, count]) => ({ char, count })),
    merged,
    accents,
    truncated,
  };
}

/** Row and column labels per letter, letters split by spaces and words by " / ". */
export function formatCoordinates(words: Letter[][], square: Square): string {
  return words
    .map((word) => word.map((l) => `${square.labels[l.row]}${square.labels[l.col]}`).join(" "))
    .join(" / ");
}

/** Tap code as dots: row taps, a space, column taps; two spaces between letters, " / " between words. */
export function formatTapDots(words: Letter[][]): string {
  return words
    .map((word) => word.map((l) => `${".".repeat(l.row + 1)} ${".".repeat(l.col + 1)}`).join("  "))
    .join(" / ");
}

/** Decoded letters, words separated by spaces. */
export function formatPlain(words: Letter[][]): string {
  return words.map((word) => word.map((l) => l.char).join("")).join(" ");
}

/* --------------------------------------------------------------- decoding */

export type DecodeResult =
  | { ok: true; words: Letter[][]; letters: Letter[]; truncated: boolean }
  | { ok: false; error: string; at: number };

interface Coordinate {
  value: number;
  at: number;
  text: string;
}

const KNOCK_MARKS = new Set([".", "•", "·", "∙", "*", "x", "X"]);

function describe(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(ch) ? `"${ch}"` : hex;
}

function labelList(labels: string[]): string {
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Splits coordinate text into words of single coordinates. "/", "|" and line
 * breaks end a word; spaces, commas and similar only separate.
 */
function scan(text: string, square: Square): { ok: true; words: Coordinate[][] } | { ok: false; error: string; at: number } {
  const words: Coordinate[][] = [];
  let current: Coordinate[] = [];
  const tap = square.scheme === "tap";
  const letters = square.labels[0] === "A";
  let run: Coordinate | null = null;
  let at = 0;

  const endRun = (): string | null => {
    if (!run) return null;
    if (run.value > square.size) {
      const msg = `The group of ${run.value} taps at position ${run.at + 1} is more than the ${square.size} rows or columns the tap code square has.`;
      run = null;
      return msg;
    }
    current.push(run);
    run = null;
    return null;
  };

  for (const ch of text) {
    const offset = at;
    at += ch.length;

    if (tap && KNOCK_MARKS.has(ch)) {
      if (run) {
        run.value += 1;
        run.text += ch;
      } else {
        run = { value: 1, at: offset, text: ch };
      }
      continue;
    }
    const problem = endRun();
    if (problem) return { ok: false, error: problem, at: offset };

    if (ch === "/" || ch === "|" || ch === "\n" || ch === "\r") {
      if (current.length) words.push(current);
      current = [];
      continue;
    }
    if (/\s/.test(ch) || ch === "," || ch === ";" || ch === ":" || ch === "-" || ch === "(" || ch === ")" || (!tap && ch === ".")) {
      continue;
    }
    const up = ch.toUpperCase();
    const label = square.labels.indexOf(up);
    if (label >= 0 && (letters || /^[0-9]$/.test(ch))) {
      current.push({ value: label + 1, at: offset, text: ch });
      continue;
    }
    if (/^[0-9]$/.test(ch) && !letters) {
      return {
        ok: false,
        error: `${ch} at position ${offset + 1} is outside the square. Rows and columns are numbered 1 to ${square.size}.`,
        at: offset,
      };
    }
    if (letters && /^[A-Za-z]$/.test(ch)) {
      return {
        ok: false,
        error: `${up} at position ${offset + 1} is not a coordinate. This square labels its rows and columns ${labelList(square.labels)}.`,
        at: offset,
      };
    }
    const expected = tap
      ? "dots (or *, x) for taps, or the digits 1 to 5"
      : letters
        ? `the letters ${labelList(square.labels)}`
        : `the digits 1 to ${square.size}`;
    return {
      ok: false,
      error: `${describe(ch)} at position ${offset + 1} is not part of a coordinate. Use ${expected}, with "/" between words.`,
      at: offset,
    };
  }
  const problem = endRun();
  if (problem) return { ok: false, error: problem, at: text.length };
  if (current.length) words.push(current);
  return { ok: true, words };
}

export function decode(input: string, square: Square): DecodeResult {
  const { text, truncated } = capInput(input);
  const scanned = scan(text, square);
  if (!scanned.ok) return scanned;

  const words: Letter[][] = [];
  const letters: Letter[] = [];
  for (let w = 0; w < scanned.words.length; w += 1) {
    const coords = scanned.words[w];
    if (coords.length % 2 === 1) {
      const lastOne = coords[coords.length - 1];
      return {
        ok: false,
        error:
          scanned.words.length > 1
            ? `Word ${w + 1} has ${coords.length} coordinates, an odd number. Every letter takes two, row then column, so one is missing or extra. The unpaired one starts at position ${lastOne.at + 1}.`
            : `There are ${coords.length} coordinates, an odd number. Every letter takes two, row then column, so one is missing or extra.`,
        at: lastOne.at,
      };
    }
    const word: Letter[] = [];
    for (let k = 0; k < coords.length; k += 2) {
      const row = coords[k].value - 1;
      const col = coords[k + 1].value - 1;
      const cell = row * square.size + col;
      const letter: Letter = {
        char: square.cells[cell],
        cell,
        row,
        col,
        source: `${coords[k].text}${square.scheme === "tap" ? " " : ""}${coords[k + 1].text}`,
        at: coords[k].at,
        merged: false,
      };
      word.push(letter);
      letters.push(letter);
    }
    words.push(word);
  }
  return { ok: true, words, letters, truncated };
}

/* ------------------------------------------------------------ tap timing */

/**
 * Gaps between the starts of successive knocks, in units. There is no formal
 * timing standard for the tap code; what matters is that the pause between
 * a letter's two numbers is clearly longer than the gap between taps, and
 * the pause between letters longer again.
 */
export const TAP_GAPS = { tap: 1, group: 3, letter: 6, word: 10 } as const;

export interface Knock {
  /** Seconds from the start. */
  t: number;
  /** Index into the flat letter list. */
  letter: number;
  phase: "row" | "col";
  /** 1-based count within its group. */
  count: number;
}

export interface TapPlan {
  knocks: Knock[];
  /** Start of the first knock to the end of the last one, in seconds. */
  duration: number;
  /** Letters scheduled, at most MAX_PLAY_LETTERS. */
  letterCount: number;
  /** Letters left out by the cap. */
  omitted: number;
}

/** Length of one knock sound, which the duration allows for after the last onset. */
export const KNOCK_SECONDS = 0.09;

export function planTaps(words: Letter[][], unit: number, maxLetters = MAX_PLAY_LETTERS): TapPlan {
  const knocks: Knock[] = [];
  let t = 0;
  let index = 0;
  let total = 0;
  let first = true;
  for (const word of words) total += word.length;

  outer: for (let w = 0; w < words.length; w += 1) {
    for (let l = 0; l < words[w].length; l += 1) {
      if (index >= maxLetters) break outer;
      const letter = words[w][l];
      if (!first) t += (l === 0 ? TAP_GAPS.word : TAP_GAPS.letter) * unit;
      first = false;
      for (let k = 1; k <= letter.row + 1; k += 1) {
        if (k > 1) t += TAP_GAPS.tap * unit;
        knocks.push({ t, letter: index, phase: "row", count: k });
      }
      t += TAP_GAPS.group * unit;
      for (let k = 1; k <= letter.col + 1; k += 1) {
        if (k > 1) t += TAP_GAPS.tap * unit;
        knocks.push({ t, letter: index, phase: "col", count: k });
      }
      index += 1;
    }
  }
  const duration = knocks.length ? knocks[knocks.length - 1].t + KNOCK_SECONDS : 0;
  return { knocks, duration, letterCount: index, omitted: total - index };
}

/** The most recent knock at time t, or null before the first. Binary search. */
export function knockAt(plan: TapPlan, t: number): Knock | null {
  const ks = plan.knocks;
  if (!ks.length || t < ks[0].t) return null;
  let lo = 0;
  let hi = ks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ks[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return ks[lo];
}
