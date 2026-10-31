/**
 * Playfair cipher: key square, digraph preparation, encryption and
 * decryption, with every step recorded so the page can show its working.
 *
 * The rules are Wheatstone's, as textbooks teach them (W. Stallings,
 * Cryptography and Network Security, whose MONARCHY examples are among the
 * unit test vectors, alongside the PLAYFAIR EXAMPLE square on Wikipedia):
 *
 *   1. The key square is the keyword's letters, first occurrence only,
 *      followed by the rest of the alphabet. Twenty six letters do not fit
 *      in twenty five cells, so one is sacrificed: J is written as I (the
 *      usual choice), or Q is left out entirely.
 *   2. Plaintext is split into pairs. A pair may not hold the same letter
 *      twice, so a filler (X by convention) goes between the two, and an odd
 *      letter left at the end gets the filler as its partner.
 *   3. Each pair is replaced by one of three rules: same row, take the
 *      letter to the right of each; same column, take the letter below
 *      each; otherwise, take the letter in your own row at the other
 *      letter's column (the opposite corners of their rectangle). Rows and
 *      columns wrap. Decryption runs the first two rules backward (left and
 *      up) and the third is its own inverse.
 *
 * Pure functions, no React and no DOM.
 */

/** Hard ceiling on letters processed, so a pasted book cannot stall the tab. */
export const MAX_LETTERS = 20000;

export type Variant = "ij" | "noq";
export type Direction = "encrypt" | "decrypt";
export type Rule = "row" | "column" | "rectangle";

export interface KeySquare {
  /** Twenty five letters, row by row. */
  letters: string;
  /** Row and column of each letter in the square. */
  pos: Record<string, { row: number; col: number }>;
  /** The keyword's own letters after merging and de-duplication. */
  keyPart: string;
  variant: Variant;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The letter the variant removes from the square. */
export function omittedLetter(variant: Variant): string {
  return variant === "ij" ? "J" : "Q";
}

/**
 * Upper-cases, keeps A to Z only, and folds the omitted letter: J becomes I
 * in the I/J variant, Q is dropped in the no-Q variant.
 */
function fold(text: string, variant: Variant): { letters: string; folded: number; dropped: number; ignored: number } {
  let letters = "";
  let folded = 0;
  let dropped = 0;
  let ignored = 0;
  for (const ch of text) {
    // ASCII test on the original character: "ı".toUpperCase() is "I" and
    // "ß".toUpperCase() is "SS", and neither belongs in the square.
    if (!/^[A-Za-z]$/.test(ch)) {
      if (!/\s/.test(ch)) ignored += 1;
      continue;
    }
    const up = ch.toUpperCase();
    if (variant === "ij" && up === "J") {
      letters += "I";
      folded += 1;
    } else if (variant === "noq" && up === "Q") {
      dropped += 1;
    } else {
      letters += up;
    }
  }
  return { letters, folded, dropped, ignored };
}

export function buildKeySquare(keyword: string, variant: Variant): KeySquare {
  const skip = omittedLetter(variant);
  const seen = new Set<string>();
  let keyPart = "";
  const { letters: keyLetters } = fold(keyword, variant);
  for (const ch of keyLetters) {
    if (!seen.has(ch)) {
      seen.add(ch);
      keyPart += ch;
    }
  }
  let letters = keyPart;
  for (const ch of ALPHABET) {
    if (ch !== skip && !seen.has(ch)) {
      seen.add(ch);
      letters += ch;
    }
  }
  const pos: KeySquare["pos"] = {};
  for (let i = 0; i < letters.length; i += 1) {
    pos[letters[i]] = { row: Math.floor(i / 5), col: i % 5 };
  }
  return { letters, pos, keyPart, variant };
}

export function letterAt(square: KeySquare, row: number, col: number): string {
  return square.letters[((row + 5) % 5) * 5 + ((col + 5) % 5)];
}

/** The filler used when the main filler itself is doubled or ends the text. */
export function alternateFiller(filler: string, variant: Variant): string {
  if (filler !== "X") return "X";
  return variant === "noq" ? "Z" : "Q";
}

export interface Digraph {
  /** The two letters as they go into the square. */
  pair: string;
  /** For each letter of the pair, true when it is a filler this code inserted. */
  inserted: [boolean, boolean];
}

export interface Prepared {
  letters: string;
  digraphs: Digraph[];
  /** J letters written as I. */
  folded: number;
  /** Q letters removed in the no-Q variant. */
  dropped: number;
  /** Characters other than letters and whitespace that were ignored. */
  ignored: number;
  /** How many fillers were inserted, between doubles and at the end. */
  fillersBetween: number;
  fillerAtEnd: boolean;
  truncated: boolean;
}

/**
 * Splits plaintext into digraphs. A doubled pair such as LL becomes LX and
 * the second L starts the next pair. When the doubled letter is the filler
 * itself (XX), or the odd letter at the end is the filler, the alternate
 * filler is used instead, since XX would break the rule it was meant to fix.
 */
export function preparePlaintext(text: string, variant: Variant, filler: string): Prepared {
  const f = fold(text, variant);
  let letters = f.letters;
  const truncated = letters.length > MAX_LETTERS;
  if (truncated) letters = letters.slice(0, MAX_LETTERS);
  const alt = alternateFiller(filler, variant);
  const digraphs: Digraph[] = [];
  let fillersBetween = 0;
  let fillerAtEnd = false;
  let i = 0;
  while (i < letters.length) {
    const a = letters[i];
    const b = letters[i + 1];
    if (b === undefined) {
      digraphs.push({ pair: a + (a === filler ? alt : filler), inserted: [false, true] });
      fillerAtEnd = true;
      i += 1;
    } else if (a === b) {
      digraphs.push({ pair: a + (a === filler ? alt : filler), inserted: [false, true] });
      fillersBetween += 1;
      i += 1;
    } else {
      digraphs.push({ pair: a + b, inserted: [false, false] });
      i += 2;
    }
  }
  return {
    letters,
    digraphs,
    folded: f.folded,
    dropped: f.dropped,
    ignored: f.ignored,
    fillersBetween,
    fillerAtEnd,
    truncated,
  };
}

export type CipherPrepared =
  | {
      ok: true;
      letters: string;
      digraphs: Digraph[];
      folded: number;
      ignored: number;
      truncated: boolean;
    }
  | { ok: false; error: string };

/**
 * Splits ciphertext into digraphs and rejects text Playfair cannot have
 * produced: an odd number of letters, a pair with the same letter twice, or
 * the letter the square does not contain.
 */
export function prepareCiphertext(text: string, variant: Variant): CipherPrepared {
  let letters = "";
  let folded = 0;
  let ignored = 0;
  let qCount = 0;
  for (const ch of text) {
    // ASCII test on the original character: "ı".toUpperCase() is "I" and
    // "ß".toUpperCase() is "SS", and neither belongs in the square.
    if (!/^[A-Za-z]$/.test(ch)) {
      if (!/\s/.test(ch)) ignored += 1;
      continue;
    }
    const up = ch.toUpperCase();
    if (variant === "ij" && up === "J") {
      letters += "I";
      folded += 1;
    } else {
      if (variant === "noq" && up === "Q") qCount += 1;
      letters += up;
    }
  }
  if (qCount > 0) {
    return {
      ok: false,
      error: `The ciphertext contains Q ${qCount === 1 ? "once" : `${qCount} times`}, but a square without Q can never output it. Switch to the I/J square, or check the text.`,
    };
  }
  const truncated = letters.length > MAX_LETTERS;
  if (truncated) letters = letters.slice(0, MAX_LETTERS);
  if (letters.length % 2 === 1) {
    return {
      ok: false,
      error: `Playfair ciphertext always has an even number of letters, and this has ${letters.length}. A letter was lost or added on the way here.`,
    };
  }
  const digraphs: Digraph[] = [];
  for (let i = 0; i < letters.length; i += 2) {
    const pair = letters.slice(i, i + 2);
    if (pair[0] === pair[1]) {
      return {
        ok: false,
        error: `Pair ${i / 2 + 1} is ${pair}. Playfair never outputs the same letter twice within a pair, so either this is not Playfair or the pairs are misaligned by one letter.`,
      };
    }
    digraphs.push({ pair, inserted: [false, false] });
  }
  return { ok: true, letters, digraphs, folded, ignored, truncated };
}

export interface Step {
  index: number;
  input: string;
  output: string;
  rule: Rule;
  /** Square coordinates of the two input letters. */
  from: [{ row: number; col: number }, { row: number; col: number }];
  /** Square coordinates of the two output letters. */
  to: [{ row: number; col: number }, { row: number; col: number }];
  inserted: [boolean, boolean];
}

/** Applies the three Playfair rules to one pair of distinct letters. */
export function transformPair(square: KeySquare, pair: string, direction: Direction): Omit<Step, "index" | "inserted"> {
  const a = square.pos[pair[0]];
  const b = square.pos[pair[1]];
  const d = direction === "encrypt" ? 1 : -1;
  let to: Step["to"];
  let rule: Rule;
  if (a.row === b.row) {
    rule = "row";
    to = [
      { row: a.row, col: (a.col + d + 5) % 5 },
      { row: b.row, col: (b.col + d + 5) % 5 },
    ];
  } else if (a.col === b.col) {
    rule = "column";
    to = [
      { row: (a.row + d + 5) % 5, col: a.col },
      { row: (b.row + d + 5) % 5, col: b.col },
    ];
  } else {
    rule = "rectangle";
    to = [
      { row: a.row, col: b.col },
      { row: b.row, col: a.col },
    ];
  }
  const output = letterAt(square, to[0].row, to[0].col) + letterAt(square, to[1].row, to[1].col);
  return { input: pair, output, rule, from: [a, b], to };
}

export function transformAll(square: KeySquare, digraphs: Digraph[], direction: Direction): Step[] {
  return digraphs.map((dg, index) => ({
    index,
    inserted: dg.inserted,
    ...transformPair(square, dg.pair, direction),
  }));
}

/**
 * A best guess at the original plaintext after decryption: drops a filler
 * that sits second in a pair between two equal letters (LX LO from LLO), and
 * a filler that ends the text. A genuine X in those places is removed too,
 * which is why the page labels this as a guess.
 */
export function stripLikelyFillers(plain: string, filler: string, variant: Variant): string {
  const alt = alternateFiller(filler, variant);
  let out = "";
  for (let i = 0; i < plain.length; i += 1) {
    const ch = plain[i];
    const secondOfPair = i % 2 === 1;
    const isFiller = ch === filler || ch === alt;
    if (secondOfPair && isFiller) {
      const prev = plain[i - 1];
      const next = plain[i + 1];
      const expected = prev === filler ? alt : filler;
      if (next !== undefined && prev === next && ch === expected) continue;
      if (next === undefined && ch === expected) continue;
    }
    out += ch;
  }
  return out;
}

export type Grouping = "pairs" | "fives" | "none";

export function groupLetters(letters: string, grouping: Grouping): string {
  if (grouping === "none") return letters;
  const size = grouping === "pairs" ? 2 : 5;
  const parts: string[] = [];
  for (let i = 0; i < letters.length; i += size) parts.push(letters.slice(i, i + size));
  return parts.join(" ");
}

export interface RunResult {
  ok: true;
  square: KeySquare;
  steps: Step[];
  /** Output letters with no spacing. */
  output: string;
  /** Prepared input letters (after folding and, for encryption, fillers). */
  inputLetters: string;
  notices: string[];
  /** Decryption only: output with likely fillers removed. */
  cleaned: string | null;
}

export type Run = RunResult | { ok: false; error: string; square: KeySquare };

/** One call for the page: build the square, prepare the text, transform it. */
export function runPlayfair(options: {
  keyword: string;
  text: string;
  variant: Variant;
  direction: Direction;
  filler: string;
}): Run {
  const { keyword, text, variant, direction } = options;
  const square = buildKeySquare(keyword, variant);
  const filler = options.filler.toUpperCase();
  if (!/^[A-Z]$/.test(filler)) {
    return { ok: false, square, error: "The filler must be a single letter, A to Z." };
  }
  if (!(filler in square.pos)) {
    return {
      ok: false,
      square,
      error: `${filler} is not in this square, so it cannot be the filler. Pick another letter; X is the usual choice.`,
    };
  }
  const notices: string[] = [];

  if (direction === "encrypt") {
    const prep = preparePlaintext(text, variant, filler);
    if (prep.letters.length === 0) {
      return { ok: false, square, error: "There are no letters to encrypt. Playfair works on A to Z only." };
    }
    if (prep.truncated) notices.push(`Only the first ${MAX_LETTERS.toLocaleString("en-US")} letters were processed.`);
    if (prep.folded) notices.push(`${prep.folded} J ${prep.folded === 1 ? "was" : "were"} written as I, since the square has no J.`);
    if (prep.dropped) notices.push(`${prep.dropped} Q ${prep.dropped === 1 ? "was" : "were"} removed, since this square has no Q.`);
    if (prep.ignored) notices.push(`${prep.ignored} ${prep.ignored === 1 ? "character that is not a letter was" : "characters that are not letters were"} ignored.`);
    if (prep.fillersBetween) notices.push(`${prep.fillersBetween} ${prep.fillersBetween === 1 ? "filler was" : "fillers were"} inserted to split doubled letters.`);
    if (prep.fillerAtEnd) notices.push("The text had an odd number of letters, so a filler pads the last pair.");
    const steps = transformAll(square, prep.digraphs, "encrypt");
    return {
      ok: true,
      square,
      steps,
      output: steps.map((s) => s.output).join(""),
      inputLetters: prep.digraphs.map((d) => d.pair).join(""),
      notices,
      cleaned: null,
    };
  }

  const prep = prepareCiphertext(text, variant);
  if (!prep.ok) return { ok: false, square, error: prep.error };
  if (prep.letters.length === 0) {
    return { ok: false, square, error: "There are no letters to decrypt. Playfair ciphertext is A to Z only." };
  }
  if (prep.truncated) notices.push(`Only the first ${MAX_LETTERS.toLocaleString("en-US")} letters were processed.`);
  if (prep.folded) notices.push(`${prep.folded} J ${prep.folded === 1 ? "was" : "were"} read as I. An I/J square never outputs J, so check where the text came from.`);
  if (prep.ignored) notices.push(`${prep.ignored} ${prep.ignored === 1 ? "character that is not a letter was" : "characters that are not letters were"} ignored.`);
  const steps = transformAll(square, prep.digraphs, "decrypt");
  const output = steps.map((s) => s.output).join("");
  return {
    ok: true,
    square,
    steps,
    output,
    inputLetters: prep.letters,
    notices,
    cleaned: stripLikelyFillers(output, filler, variant),
  };
}
