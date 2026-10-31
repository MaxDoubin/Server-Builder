/**
 * JSON formatter and validator, without React.
 *
 * This is a hand-written RFC 8259 parser rather than a wrapper around
 * JSON.parse, for three reasons. JSON.parse words its errors differently in
 * every engine and only some of them give a position. It turns every number
 * into an IEEE 754 double, so 9007199254740993 silently becomes
 * 9007199254740992 before anything can warn about it. And it keeps the last
 * of two duplicate keys without saying a word.
 *
 * So the parser builds a small tree that keeps each number's and each
 * string's exact source text, records where every node sits, and stops at
 * the first error with a line, a column and a sentence about what went
 * wrong. Formatting re-emits that source text, which means pretty-printing,
 * minifying and sorting change whitespace and order but never a value.
 *
 * It accepts exactly the grammar of RFC 8259 section 2 to 7, which is also
 * the grammar JSON.parse accepts, with one deliberate exception: a leading
 * byte order mark is skipped and reported, as section 8.1 permits.
 */

/** Longest input read at all. Parsing is linear, but the textarea is not. */
export const MAX_INPUT_CHARS = 5_000_000;

/** Deepest nesting accepted. Deeper input is rejected rather than recursed into. */
export const MAX_DEPTH = 512;

/** Warnings of each kind kept for display. The totals are always counted in full. */
export const MAX_LISTED_WARNINGS = 100;

/** 2^53 - 1, the largest integer a double holds with every smaller integer also exact. */
const MAX_SAFE = 9007199254740991n;

/* ------------------------------------------------------------------ tree */

interface NodeBase {
  /** Offset of the node's first character in the parsed text. */
  start: number;
  /** Offset just past its last character. */
  end: number;
}

export interface JsonMember {
  /** The key after escapes are decoded. */
  key: string;
  /** The key exactly as written, quotes included. */
  keyRaw: string;
  value: JsonNode;
  /** True when an earlier member of the same object has the same decoded key. */
  duplicate: boolean;
}

export interface JsonObject extends NodeBase {
  kind: "object";
  members: JsonMember[];
}

export interface JsonArray extends NodeBase {
  kind: "array";
  items: JsonNode[];
}

export interface JsonString extends NodeBase {
  kind: "string";
  value: string;
  /** Exactly as written, quotes and escapes included. */
  raw: string;
}

export interface JsonNumber extends NodeBase {
  kind: "number";
  /** Exactly as written. Never converted, so never rounded. */
  raw: string;
  /** Set when JSON.parse would not read this number back as written. */
  issue: NumberIssue | null;
}

export interface JsonBoolean extends NodeBase {
  kind: "boolean";
  value: boolean;
}

export interface JsonNull extends NodeBase {
  kind: "null";
}

export type JsonNode = JsonObject | JsonArray | JsonString | JsonNumber | JsonBoolean | JsonNull;

/* --------------------------------------------------------------- numbers */

export type NumberIssueKind = "unsafe-integer" | "beyond-safe" | "overflow" | "underflow";

export interface NumberIssue {
  kind: NumberIssueKind;
  /** What a double holds after JSON.parse, written out exactly. */
  exact: string;
  /** What JavaScript prints for that double, which is also what JSON.stringify writes. */
  printed: string;
}

/**
 * Decide whether a JSON number survives a trip through an IEEE 754 double.
 *
 * Integers written without a fraction or exponent are compared as BigInt, so
 * the check itself cannot round. Anything at or below 2^53 - 1 in magnitude
 * is safe: every integer in that range has its own double. Past it, adjacent
 * integers share one double, which is what corrupts 64-bit IDs.
 *
 * Fraction and exponent forms are judged by the double they produce: one
 * that overflows to Infinity, one that underflows to zero from a nonzero
 * literal, and one whose magnitude passes 2^53 - 1.
 */
export function classifyNumber(raw: string): NumberIssue | null {
  const integerForm = !/[.eE]/.test(raw);
  if (integerForm) {
    const digits = raw.charCodeAt(0) === 0x2d ? raw.length - 1 : raw.length;
    // Fifteen digits is at most 999,999,999,999,999, well inside 2^53.
    if (digits < 16) return null;
    let big: bigint;
    try {
      big = BigInt(raw);
    } catch {
      return null;
    }
    const magnitude = big < 0n ? -big : big;
    if (magnitude <= MAX_SAFE) return null;
    const double = Number(raw);
    if (!Number.isFinite(double)) {
      return { kind: "overflow", exact: double > 0 ? "Infinity" : "-Infinity", printed: "null" };
    }
    return { kind: "unsafe-integer", exact: BigInt(double).toString(), printed: String(double) };
  }

  const double = Number(raw);
  if (!Number.isFinite(double)) {
    return { kind: "overflow", exact: double > 0 ? "Infinity" : "-Infinity", printed: "null" };
  }
  if (double === 0 && /[1-9]/.test(raw.split(/[eE]/)[0])) {
    return { kind: "underflow", exact: "0", printed: "0" };
  }
  if (Math.abs(double) > Number.MAX_SAFE_INTEGER) {
    return { kind: "beyond-safe", exact: BigInt(double).toString(), printed: String(double) };
  }
  return null;
}

/** One sentence about what happens to this number in JavaScript. */
export function describeNumberIssue(raw: string, issue: NumberIssue): string {
  switch (issue.kind) {
    case "unsafe-integer":
      if (issue.exact === raw) {
        // Past 2^53 the gap between doubles is at least 2, so the next
        // integer out from an exact one is never exact itself.
        const big = BigInt(raw);
        const next = (big < 0n ? big - 1n : big + 1n).toString();
        return `This one happens to be exact, but past 2^53 - 1 not every integer is: ${next} would read as ${BigInt(
          Number(next),
        ).toString()}.`;
      }
      return `JSON.parse turns this into ${issue.exact}, and JSON.stringify writes that back as ${issue.printed}.`;
    case "beyond-safe":
      return `Past 2^53 - 1 in magnitude. JSON.parse holds it as ${issue.printed}, where neighboring integers are no longer distinct.`;
    case "overflow":
      return `Too large for a double. JSON.parse reads it as ${issue.exact}, and JSON.stringify writes that as null.`;
    case "underflow":
      return "Too small for a double. JSON.parse reads this nonzero literal as 0.";
  }
}

/* ---------------------------------------------------------------- errors */

export interface JsonError {
  message: string;
  /** Offset into the parsed text (after any byte order mark). */
  offset: number;
  /** 1-based. */
  line: number;
  /** 1-based, counted in Unicode code points from the start of the line. */
  column: number;
}

/**
 * Line and column of an offset. CRLF, a lone LF and a lone CR each end one
 * line, which matches how editors number lines in a file with any of them.
 */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const stop = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < stop; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) {
      line++;
      lineStart = i + 1;
    } else if (c === 0x0d) {
      if (text.charCodeAt(i + 1) === 0x0a && i + 1 < stop) i++;
      line++;
      lineStart = i + 1;
    }
  }
  let column = 1;
  for (let i = lineStart; i < stop; i++) {
    const c = text.charCodeAt(i);
    // The trailing half of a surrogate pair is part of the same code point.
    if (c >= 0xdc00 && c <= 0xdfff && i > lineStart) {
      const prev = text.charCodeAt(i - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) continue;
    }
    column++;
  }
  return { line, column };
}

export interface ErrorSnippet {
  before: string;
  /** The offending character, or "" at the end of the input. */
  at: string;
  /** A visible stand-in when the offending character is invisible. */
  atLabel: string | null;
  after: string;
  clippedStart: boolean;
  clippedEnd: boolean;
}

const SNIPPET_RADIUS = 48;

/** The text around an error, clipped to its own line and a few dozen characters either side. */
export function errorSnippet(text: string, offset: number): ErrorSnippet {
  const at = Math.max(0, Math.min(offset, text.length));
  let lineStart = at;
  while (lineStart > 0) {
    const c = text.charCodeAt(lineStart - 1);
    if (c === 0x0a || c === 0x0d) break;
    lineStart--;
  }
  let lineEnd = at;
  while (lineEnd < text.length) {
    const c = text.charCodeAt(lineEnd);
    if (c === 0x0a || c === 0x0d) break;
    lineEnd++;
  }

  let from = Math.max(lineStart, at - SNIPPET_RADIUS);
  if (from > lineStart && isLowSurrogate(text.charCodeAt(from))) from--;

  let atChar = "";
  let atLabel: string | null = null;
  let afterStart = at;
  if (at < text.length) {
    const cp = text.codePointAt(at) ?? 0;
    atChar = String.fromCodePoint(cp);
    afterStart = at + atChar.length;
    if (cp === 0x0a || cp === 0x0d) atLabel = "line break";
    else if (cp === 0x09) atLabel = "tab";
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) atLabel = codePointLabel(cp);
    else if (cp === 0x20) atLabel = "space";
  } else {
    atLabel = "end of input";
  }
  const afterLimit = at < text.length && atLabel === "line break" ? afterStart : lineEnd;
  let to = Math.min(afterLimit, afterStart + SNIPPET_RADIUS);
  if (to < afterLimit && isLowSurrogate(text.charCodeAt(to))) to++;

  return {
    before: text.slice(from, at).replace(/\t/g, " "),
    at: atLabel === "line break" ? "" : atChar,
    atLabel,
    after: atLabel === "line break" ? "" : text.slice(afterStart, to).replace(/\t/g, " "),
    clippedStart: from > lineStart,
    clippedEnd: atLabel !== "line break" && to < lineEnd,
  };
}

function isLowSurrogate(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

function codePointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/* --------------------------------------------------------------- warnings */

export interface NumberWarning {
  /** Child indexes from the root to the node. */
  path: number[];
  raw: string;
  issue: NumberIssue;
}

export interface DuplicateWarning {
  /** Path to the later member's value. */
  path: number[];
  key: string;
}

export interface SurrogateWarning {
  path: number[];
  /** True when the unpaired surrogate is in a key rather than a value. */
  inKey: boolean;
}

export interface Warnings {
  numbers: NumberWarning[];
  numberCount: number;
  duplicates: DuplicateWarning[];
  duplicateCount: number;
  surrogates: SurrogateWarning[];
  surrogateCount: number;
}

/* ----------------------------------------------------------------- parser */

export type ParseResult =
  | { ok: true; root: JsonNode; text: string; bom: boolean; warnings: Warnings }
  | { ok: false; error: JsonError; text: string; bom: boolean };

class Stop {
  constructor(
    readonly message: string,
    readonly offset: number,
  ) {}
}

const ANY_SURROGATE = /[\uD800-\uDFFF]/;

/**
 * True when the string holds half of a surrogate pair on its own. Such a
 * string is legal JSON grammar but not valid Unicode (RFC 8259 section 8.2).
 * A loop rather than a lookbehind regex, which older Safari cannot compile.
 */
export function hasUnpairedSurrogate(text: string): boolean {
  if (!ANY_SURROGATE.test(text)) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function isWordStart(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c === 0x24;
}

function isWordChar(c: number): boolean {
  return isWordStart(c) || isDigit(c);
}

/** A short, quoted rendering of a character for an error message. */
export function describeChar(text: string, offset: number): string {
  if (offset >= text.length) return "the end of the input";
  const cp = text.codePointAt(offset) ?? 0;
  if (cp === 0x0a || cp === 0x0d) return "a line break";
  if (cp === 0x09) return "a tab";
  if (cp === 0x20) return "a space";
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0xfeff || (cp >= 0xd800 && cp <= 0xdfff)) {
    return codePointLabel(cp);
  }
  return `'${String.fromCodePoint(cp)}'`;
}

function clip(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

class Parser {
  i = 0;
  readonly n: number;
  readonly path: number[] = [];
  readonly warnings: Warnings = {
    numbers: [],
    numberCount: 0,
    duplicates: [],
    duplicateCount: 0,
    surrogates: [],
    surrogateCount: 0,
  };

  constructor(readonly s: string) {
    this.n = s.length;
  }

  where(offset: number): string {
    const { line, column } = lineColumn(this.s, offset);
    return `line ${line}, column ${column}`;
  }

  ws(): void {
    const s = this.s;
    let i = this.i;
    while (i < this.n) {
      const c = s.charCodeAt(i);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) i++;
      else break;
    }
    this.i = i;
  }

  isComment(at: number): boolean {
    if (this.s.charCodeAt(at) !== 0x2f) return false;
    const next = this.s.charCodeAt(at + 1);
    return next === 0x2f || next === 0x2a;
  }

  word(at: number): string {
    let j = at;
    while (j < this.n && isWordChar(this.s.charCodeAt(j))) j++;
    return this.s.slice(at, j);
  }

  value(depth: number): JsonNode {
    const s = this.s;
    if (this.i >= this.n) throw new Stop("Unexpected end of input: a value was expected here.", this.i);
    const c = s.charCodeAt(this.i);
    if (c === 0x7b) return this.object(depth + 1);
    if (c === 0x5b) return this.array(depth + 1);
    if (c === 0x22) return this.string(false);
    if (c === 0x2d || isDigit(c)) return this.number();
    if (isWordStart(c)) {
      const start = this.i;
      const word = this.word(start);
      if (word === "true" || word === "false") {
        this.i += word.length;
        return { kind: "boolean", value: word === "true", start, end: this.i };
      }
      if (word === "null") {
        this.i += 4;
        return { kind: "null", start, end: this.i };
      }
      throw new Stop(this.wordMessage(word), start);
    }
    throw new Stop(this.unexpectedValue(c), this.i);
  }

  wordMessage(word: string): string {
    if (word === "NaN" || word === "Infinity") {
      return `${word} is not a JSON value. JSON has no NaN or Infinity; use null or a string instead.`;
    }
    if (word === "undefined") return "undefined is not a JSON value. Use null, or leave the member out.";
    const lower: Record<string, string> = {
      True: "true",
      TRUE: "true",
      False: "false",
      FALSE: "false",
      None: "null",
      Null: "null",
      NULL: "null",
      nil: "null",
    };
    if (lower[word]) return `'${word}' is not a JSON literal. JSON literals are lowercase: write ${lower[word]}.`;
    return `Unexpected word '${clip(word)}'. Text values need double quotes, as in "${clip(word)}".`;
  }

  unexpectedValue(c: number): string {
    if (c === 0x27) return "Strings need double quotes. Single quotes are JavaScript syntax, not JSON.";
    if (this.isComment(this.i)) return "Comments are not allowed in JSON.";
    if (c === 0x2b) return "A JSON number cannot start with '+'. Drop the sign.";
    if (c === 0x2e) return "A JSON number needs a digit before the decimal point: write 0.5, not .5.";
    if (c === 0x7d || c === 0x5d) return `Unexpected ${describeChar(this.s, this.i)}: a value was expected here.`;
    if (c === 0x2c) return "Unexpected ',': a value was expected here. Two commas in a row, or a comma before the first item, leaves a gap.";
    if (c === 0x3a) return "Unexpected ':': a value was expected here.";
    if (c === 0xfeff) return "A byte order mark (U+FEFF) can only appear at the very start of the input.";
    return `Unexpected ${describeChar(this.s, this.i)}: a value was expected here.`;
  }

  object(depth: number): JsonObject {
    const start = this.i;
    if (depth > MAX_DEPTH) {
      throw new Stop(`Nesting goes deeper than ${MAX_DEPTH} levels. Parsing stopped here rather than recurse further.`, start);
    }
    this.i++;
    const members: JsonMember[] = [];
    // Small objects are scanned for duplicates directly; a Set only pays
    // for itself once an object is wide.
    let seen: Set<string> | null = null;
    this.ws();
    if (this.s.charCodeAt(this.i) === 0x7d) {
      this.i++;
      return { kind: "object", members, start, end: this.i };
    }
    let commaAt = -1;
    for (;;) {
      if (this.i >= this.n) {
        throw new Stop(`Unexpected end of input: the object opened at ${this.where(start)} is never closed with '}'.`, this.i);
      }
      const c = this.s.charCodeAt(this.i);
      if (c !== 0x22) {
        if (c === 0x7d && commaAt >= 0) {
          throw new Stop("Trailing comma: JSON does not allow a comma before '}'.", commaAt);
        }
        if (c === 0x27) throw new Stop("Object keys need double quotes, not single quotes.", this.i);
        if (isWordStart(c) || isDigit(c)) {
          const word = this.word(this.i) || this.s[this.i];
          throw new Stop(`Object keys must be double-quoted strings: write "${clip(word)}", not ${clip(word)}.`, this.i);
        }
        if (this.isComment(this.i)) throw new Stop("Comments are not allowed in JSON.", this.i);
        throw new Stop(
          `Expected a double-quoted key${commaAt >= 0 ? "" : " or '}'"}, found ${describeChar(this.s, this.i)}.`,
          this.i,
        );
      }
      const keyNode = this.string(true);
      this.ws();
      if (this.s.charCodeAt(this.i) !== 0x3a) {
        if (this.i >= this.n) {
          throw new Stop(`Unexpected end of input: the object opened at ${this.where(start)} is never closed with '}'.`, this.i);
        }
        throw new Stop(
          `Expected ':' after the key ${clip(keyNode.raw)}, found ${describeChar(this.s, this.i)}.`,
          this.i,
        );
      }
      this.i++;
      this.ws();
      const index = members.length;
      let duplicate = false;
      if (seen === null && index < 16) {
        for (let k = 0; k < index; k++) {
          if (members[k].key === keyNode.value) {
            duplicate = true;
            break;
          }
        }
      } else {
        if (seen === null) seen = new Set(members.map((m) => m.key));
        duplicate = seen.has(keyNode.value);
        seen.add(keyNode.value);
      }
      this.path.push(index);
      if (duplicate) {
        this.warnings.duplicateCount++;
        if (this.warnings.duplicates.length < MAX_LISTED_WARNINGS) {
          this.warnings.duplicates.push({ path: this.path.slice(), key: keyNode.value });
        }
      }
      if (hasUnpairedSurrogate(keyNode.value)) this.surrogate(true);
      const value = this.value(depth);
      this.path.pop();
      members.push({ key: keyNode.value, keyRaw: keyNode.raw, value, duplicate });
      this.ws();
      if (this.i >= this.n) {
        throw new Stop(`Unexpected end of input: the object opened at ${this.where(start)} is never closed with '}'.`, this.i);
      }
      const next = this.s.charCodeAt(this.i);
      if (next === 0x2c) {
        commaAt = this.i;
        this.i++;
        this.ws();
        continue;
      }
      if (next === 0x7d) {
        this.i++;
        return { kind: "object", members, start, end: this.i };
      }
      if (next === 0x22) throw new Stop("Missing ',' between two members of an object.", this.i);
      if (this.isComment(this.i)) throw new Stop("Comments are not allowed in JSON.", this.i);
      throw new Stop(`Expected ',' or '}' after a value in the object, found ${describeChar(this.s, this.i)}.`, this.i);
    }
  }

  array(depth: number): JsonArray {
    const start = this.i;
    if (depth > MAX_DEPTH) {
      throw new Stop(`Nesting goes deeper than ${MAX_DEPTH} levels. Parsing stopped here rather than recurse further.`, start);
    }
    this.i++;
    const items: JsonNode[] = [];
    this.ws();
    if (this.s.charCodeAt(this.i) === 0x5d) {
      this.i++;
      return { kind: "array", items, start, end: this.i };
    }
    let commaAt = -1;
    for (;;) {
      if (this.i >= this.n) {
        throw new Stop(`Unexpected end of input: the array opened at ${this.where(start)} is never closed with ']'.`, this.i);
      }
      if (this.s.charCodeAt(this.i) === 0x5d && commaAt >= 0) {
        throw new Stop("Trailing comma: JSON does not allow a comma before ']'.", commaAt);
      }
      this.path.push(items.length);
      items.push(this.value(depth));
      this.path.pop();
      this.ws();
      if (this.i >= this.n) {
        throw new Stop(`Unexpected end of input: the array opened at ${this.where(start)} is never closed with ']'.`, this.i);
      }
      const next = this.s.charCodeAt(this.i);
      if (next === 0x2c) {
        commaAt = this.i;
        this.i++;
        this.ws();
        continue;
      }
      if (next === 0x5d) {
        this.i++;
        return { kind: "array", items, start, end: this.i };
      }
      if (next === 0x22 || next === 0x7b || next === 0x5b || next === 0x2d || isDigit(next) || isWordStart(next)) {
        throw new Stop("Missing ',' between two items of an array.", this.i);
      }
      if (this.isComment(this.i)) throw new Stop("Comments are not allowed in JSON.", this.i);
      throw new Stop(`Expected ',' or ']' after an item in the array, found ${describeChar(this.s, this.i)}.`, this.i);
    }
  }

  surrogate(inKey: boolean): void {
    this.warnings.surrogateCount++;
    if (this.warnings.surrogates.length < MAX_LISTED_WARNINGS) {
      this.warnings.surrogates.push({ path: this.path.slice(), inKey });
    }
  }

  /** RFC 8259 section 7. */
  string(isKey: boolean): JsonString {
    const s = this.s;
    const start = this.i;
    let i = start + 1;
    let segment = i;
    let parts: string[] | null = null;
    for (;;) {
      if (i >= this.n) {
        throw new Stop(`Unterminated string: the string that starts at ${this.where(start)} has no closing quote.`, start);
      }
      const c = s.charCodeAt(i);
      if (c === 0x22) break;
      if (c === 0x5c) {
        if (parts === null) parts = [];
        parts.push(s.slice(segment, i));
        if (i + 1 >= this.n) {
          throw new Stop(`Unterminated string: the string that starts at ${this.where(start)} has no closing quote.`, start);
        }
        const e = s.charCodeAt(i + 1);
        switch (e) {
          case 0x22:
            parts.push('"');
            break;
          case 0x5c:
            parts.push("\\");
            break;
          case 0x2f:
            parts.push("/");
            break;
          case 0x62:
            parts.push("\b");
            break;
          case 0x66:
            parts.push("\f");
            break;
          case 0x6e:
            parts.push("\n");
            break;
          case 0x72:
            parts.push("\r");
            break;
          case 0x74:
            parts.push("\t");
            break;
          case 0x75: {
            const hex = s.slice(i + 2, i + 6);
            if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
              throw new Stop("Invalid \\u escape: it must be followed by exactly four hex digits.", i);
            }
            parts.push(String.fromCharCode(parseInt(hex, 16)));
            i += 6;
            segment = i;
            continue;
          }
          case 0x27:
            throw new Stop("\\' is not a JSON escape. A single quote needs no escaping inside a double-quoted string.", i);
          default:
            throw new Stop(
              `Invalid escape ${describeEscape(s, i + 1)}. JSON allows \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.`,
              i,
            );
        }
        i += 2;
        segment = i;
        continue;
      }
      if (c < 0x20) {
        if (c === 0x0a || c === 0x0d) {
          throw new Stop(
            `Line break inside a string. Either the string that starts at ${this.where(start)} is missing its closing quote, or the line break needs to be written as \\n.`,
            i,
          );
        }
        throw new Stop(
          `Raw control character ${codePointLabel(c)} inside a string. Write it as an escape${
            c === 0x09 ? " (\\t)" : ` (\\u${c.toString(16).padStart(4, "0")})`
          }.`,
          i,
        );
      }
      i++;
    }
    const value = parts === null ? s.slice(segment, i) : parts.join("") + s.slice(segment, i);
    this.i = i + 1;
    const node: JsonString = { kind: "string", value, raw: s.slice(start, this.i), start, end: this.i };
    if (!isKey && hasUnpairedSurrogate(value)) this.surrogate(false);
    return node;
  }

  /** RFC 8259 section 6. */
  number(): JsonNumber {
    const s = this.s;
    const start = this.i;
    let i = start;
    if (s.charCodeAt(i) === 0x2d) {
      i++;
      if (!isDigit(s.charCodeAt(i))) {
        if (s.startsWith("Infinity", i)) {
          throw new Stop("-Infinity is not a JSON value. JSON has no NaN or Infinity; use null or a string instead.", start);
        }
        throw new Stop(`Expected a digit after '-', found ${describeChar(s, i)}.`, i);
      }
    }
    if (s.charCodeAt(i) === 0x30) {
      i++;
      if (isDigit(s.charCodeAt(i))) {
        throw new Stop("Leading zeros are not allowed in JSON numbers: write 7, not 07. Quote it if the zeros matter.", start);
      }
      const x = s.charCodeAt(i);
      if (x === 0x78 || x === 0x58) {
        throw new Stop("Hexadecimal numbers are not allowed in JSON. Write the value in decimal.", start);
      }
    } else {
      while (isDigit(s.charCodeAt(i))) i++;
    }
    let fractionOrExponent = false;
    if (s.charCodeAt(i) === 0x2e) {
      fractionOrExponent = true;
      i++;
      if (!isDigit(s.charCodeAt(i))) {
        throw new Stop("Expected a digit after the decimal point: write 1.0 or 1, not 1.", i);
      }
      while (isDigit(s.charCodeAt(i))) i++;
    }
    const e = s.charCodeAt(i);
    if (e === 0x65 || e === 0x45) {
      fractionOrExponent = true;
      i++;
      const sign = s.charCodeAt(i);
      if (sign === 0x2b || sign === 0x2d) i++;
      if (!isDigit(s.charCodeAt(i))) throw new Stop("Expected a digit in the exponent, as in 1e5 or 2.5E-3.", i);
      while (isDigit(s.charCodeAt(i))) i++;
    }
    this.i = i;
    const raw = s.slice(start, i);
    // Fifteen or fewer integer digits can never be unsafe, which is most numbers.
    const plain = i - start - (s.charCodeAt(start) === 0x2d ? 1 : 0);
    const issue = fractionOrExponent || plain >= 16 ? classifyNumber(raw) : null;
    if (issue) {
      this.warnings.numberCount++;
      if (this.warnings.numbers.length < MAX_LISTED_WARNINGS) {
        this.warnings.numbers.push({ path: this.path.slice(), raw, issue });
      }
    }
    return { kind: "number", raw, issue, start, end: i };
  }
}

function describeEscape(s: string, at: number): string {
  if (at >= s.length) return "at the end of the input";
  const cp = s.codePointAt(at) ?? 0;
  if (cp < 0x20 || cp === 0x7f) return `\\ followed by ${codePointLabel(cp)}`;
  return `'\\${String.fromCodePoint(cp)}'`;
}

/** Parse one JSON text. Never throws. */
export function parseJson(input: string): ParseResult {
  let text = input;
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const fail = (message: string, at: number): ParseResult => {
    // An error at the very end points just past the last real character,
    // not at the start of an empty line after a trailing newline.
    let offset = at;
    if (offset >= text.length) {
      offset = text.length;
      while (offset > 0 && /[ \t\r\n]/.test(text[offset - 1])) offset--;
    }
    const { line, column } = lineColumn(text, offset);
    return { ok: false, error: { message, offset, line, column }, text, bom };
  };

  if (input.length > MAX_INPUT_CHARS) {
    return fail(
      `The input is ${input.length.toLocaleString("en-US")} characters. This tool reads up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
      0,
    );
  }

  const parser = new Parser(text);
  try {
    parser.ws();
    if (parser.i >= parser.n) return fail("The input is empty. A JSON text holds exactly one value.", parser.i);
    const root = parser.value(0);
    parser.ws();
    if (parser.i < parser.n) {
      const rest = text.slice(root.end, parser.i);
      const startsValue = /^[[{"\-0-9tfn]/.test(text[parser.i]);
      if (startsValue && /[\r\n]/.test(rest)) {
        return fail(
          "More data after the first value. One value per line is JSON Lines (NDJSON), not a single JSON text. Wrap the values in [ ] with commas between them to make an array.",
          parser.i,
        );
      }
      if (text.charCodeAt(parser.i) === 0x2c) {
        return fail("Unexpected ',' after the end of the JSON value. A JSON text holds exactly one value.", parser.i);
      }
      return fail(
        `Unexpected ${describeChar(text, parser.i)} after the end of the JSON value. A JSON text holds exactly one value.`,
        parser.i,
      );
    }
    return { ok: true, root, text, bom, warnings: parser.warnings };
  } catch (err) {
    if (err instanceof Stop) return fail(err.message, err.offset);
    if (err instanceof RangeError) {
      return fail("The input is nested too deeply for this browser to walk. Parsing stopped.", parser.i);
    }
    return fail("The parser stopped unexpectedly on this input.", parser.i);
  }
}

/* ------------------------------------------------------------- formatting */

export type IndentChoice = "2" | "4" | "tab" | "none";

export function indentString(choice: IndentChoice): string {
  if (choice === "2") return "  ";
  if (choice === "4") return "    ";
  if (choice === "tab") return "\t";
  return "";
}

/**
 * Members in output order. With sorting on, keys compare by UTF-16 code
 * unit, the order RFC 8785 (JSON Canonicalization Scheme) specifies and the
 * order a plain JavaScript sort gives. The sort is stable, so duplicate keys
 * keep their relative order.
 */
export function orderedMembers(node: JsonObject, sortKeys: boolean): JsonMember[] {
  if (!sortKeys || node.members.length < 2) return node.members;
  return node.members.slice().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Member indexes in output order, for views that need to keep source identity. */
export function orderedMemberIndexes(node: JsonObject, sortKeys: boolean): number[] {
  const indexes = node.members.map((_, i) => i);
  if (!sortKeys || indexes.length < 2) return indexes;
  return indexes.sort((a, b) => {
    const ka = node.members[a].key;
    const kb = node.members[b].key;
    return ka < kb ? -1 : ka > kb ? 1 : a - b;
  });
}

/**
 * Write a parsed tree back out. Strings and numbers are copied from their
 * source text, so the output differs from the input only in whitespace and,
 * when sorting, in member order. With an empty indent the output has no
 * whitespace at all. Empty containers stay on one line, as JSON.stringify
 * writes them.
 */
export function formatJson(root: JsonNode, indent: string, sortKeys: boolean): string {
  let out = "";
  const pretty = indent !== "";
  const colon = pretty ? ": " : ":";
  const pads: string[] = [""];
  const pad = (level: number): string => {
    while (pads.length <= level) pads.push(pads[pads.length - 1] + indent);
    return pads[level];
  };

  const write = (node: JsonNode, level: number): void => {
    switch (node.kind) {
      case "object": {
        if (node.members.length === 0) {
          out += "{}";
          return;
        }
        const members = orderedMembers(node, sortKeys);
        out += "{";
        const inner = pretty ? `\n${pad(level + 1)}` : "";
        for (let k = 0; k < members.length; k++) {
          if (k > 0) out += ",";
          out += inner + members[k].keyRaw + colon;
          write(members[k].value, level + 1);
        }
        out += pretty ? `\n${pad(level)}}` : "}";
        return;
      }
      case "array": {
        if (node.items.length === 0) {
          out += "[]";
          return;
        }
        out += "[";
        const inner = pretty ? `\n${pad(level + 1)}` : "";
        for (let k = 0; k < node.items.length; k++) {
          if (k > 0) out += ",";
          out += inner;
          write(node.items[k], level + 1);
        }
        out += pretty ? `\n${pad(level)}]` : "]";
        return;
      }
      case "string":
        out += node.raw;
        return;
      case "number":
        out += node.raw;
        return;
      case "boolean":
        out += node.value ? "true" : "false";
        return;
      case "null":
        out += "null";
        return;
    }
  };

  write(root, 0);
  return out;
}

/* ------------------------------------------------------------------ stats */

export interface JsonStats {
  /** Containers on the deepest path. A scalar root is 0, {} is 1. */
  depth: number;
  objects: number;
  arrays: number;
  /** Object members, duplicates included. */
  keys: number;
  /** Distinct key names across the whole document. */
  distinctKeys: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  /** Every node, containers included. */
  values: number;
}

export function computeStats(root: JsonNode): JsonStats {
  const stats: JsonStats = {
    depth: 0,
    objects: 0,
    arrays: 0,
    keys: 0,
    distinctKeys: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    values: 0,
  };
  const names = new Set<string>();
  const stack: { node: JsonNode; depth: number }[] = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    stats.values++;
    switch (node.kind) {
      case "object":
        stats.objects++;
        stats.keys += node.members.length;
        if (depth + 1 > stats.depth) stats.depth = depth + 1;
        for (const m of node.members) {
          names.add(m.key);
          stack.push({ node: m.value, depth: depth + 1 });
        }
        break;
      case "array":
        stats.arrays++;
        if (depth + 1 > stats.depth) stats.depth = depth + 1;
        for (const item of node.items) stack.push({ node: item, depth: depth + 1 });
        break;
      case "string":
        stats.strings++;
        break;
      case "number":
        stats.numbers++;
        break;
      case "boolean":
        stats.booleans++;
        break;
      case "null":
        stats.nulls++;
        break;
    }
  }
  stats.distinctKeys = names.size;
  return stats;
}

/**
 * Bytes the text occupies as UTF-8, the encoding RFC 8259 section 8.1
 * requires for JSON exchanged between systems. An unpaired surrogate counts
 * as the three bytes of U+FFFD, which is what an encoder writes in its place.
 */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/* ------------------------------------------------------------------ paths */

/** One step from a container to a child: an object key or an array index. */
export type PathSegment = string | number;

/** The child at one step, by source index. */
export function childAt(node: JsonNode, index: number): JsonNode | null {
  if (node.kind === "object") return node.members[index]?.value ?? null;
  if (node.kind === "array") return node.items[index] ?? null;
  return null;
}

/** Follow child indexes from the root. Null when the path no longer exists. */
export function nodeAt(root: JsonNode, path: number[]): JsonNode | null {
  let node: JsonNode | null = root;
  for (const index of path) {
    if (!node) return null;
    node = childAt(node, index);
  }
  return node;
}

/** Turn child indexes into keys and array indexes. Null when the path no longer exists. */
export function segmentsAt(root: JsonNode, path: number[]): PathSegment[] | null {
  const segments: PathSegment[] = [];
  let node: JsonNode | null = root;
  for (const index of path) {
    if (!node) return null;
    if (node.kind === "object") {
      const member: JsonMember | undefined = node.members[index];
      if (!member) return null;
      segments.push(member.key);
      node = member.value;
    } else if (node.kind === "array") {
      if (index >= node.items.length) return null;
      segments.push(index);
      node = node.items[index];
    } else return null;
  }
  return segments;
}

/** RFC 6901 section 3 and 4: "~" becomes "~0" and "/" becomes "~1", in that order. */
export function toPointer(segments: PathSegment[]): string {
  let out = "";
  for (const seg of segments) out += "/" + String(seg).replace(/~/g, "~0").replace(/\//g, "~1");
  return out;
}

const FRAGMENT_SAFE = /[A-Za-z0-9\-._~!$&'()*+,;=:@/?]/;

/**
 * RFC 6901 section 6: the pointer as a URI fragment, with every character
 * outside RFC 3986's fragment set percent-encoded as UTF-8.
 */
export function pointerToFragment(pointer: string): string {
  let out = "#";
  for (const ch of pointer) {
    if (FRAGMENT_SAFE.test(ch)) out += ch;
    else {
      try {
        out += encodeURIComponent(ch);
      } catch {
        // An unpaired surrogate has no UTF-8 encoding. Write U+FFFD, as an encoder would.
        out += "%EF%BF%BD";
      }
    }
  }
  return out;
}

const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * A JavaScript expression that reaches the node. Dot access for plain ASCII
 * identifiers (reserved words included, which ES5 allows after a dot),
 * bracket access with a JSON string literal for everything else. Since
 * ES2019 every JSON string literal is also a valid JavaScript one.
 */
export function toJsPath(segments: PathSegment[], root = "data"): string {
  let out = root;
  for (const seg of segments) {
    if (typeof seg === "number") out += `[${seg}]`;
    else if (JS_IDENTIFIER.test(seg)) out += `.${seg}`;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

const JQ_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** jq keywords, which older releases refuse after a bare dot. */
const JQ_KEYWORDS = new Set([
  "and",
  "as",
  "catch",
  "def",
  "elif",
  "else",
  "end",
  "foreach",
  "if",
  "import",
  "include",
  "label",
  "module",
  "or",
  "reduce",
  "then",
  "try",
  "__loc__",
]);

/** A jq path expression that reaches the node. */
export function toJqPath(segments: PathSegment[]): string {
  if (segments.length === 0) return ".";
  let out = "";
  for (const seg of segments) {
    if (typeof seg === "number") out += out === "" ? `.[${seg}]` : `[${seg}]`;
    else if (JQ_IDENTIFIER.test(seg) && !JQ_KEYWORDS.has(seg)) out += `.${seg}`;
    else out += `.${JSON.stringify(seg)}`;
  }
  return out;
}

export type PointerResult = { ok: true; path: number[] } | { ok: false; message: string };

/**
 * Resolve an RFC 6901 pointer against a parsed tree, returning child
 * indexes. Accepts the plain form and the URI fragment form (#/a/b). When an
 * object has the same key twice the last one wins, as it does in JSON.parse.
 */
export function resolvePointer(root: JsonNode, input: string): PointerResult {
  let pointer = input;
  if (pointer.startsWith("#")) {
    try {
      pointer = decodeURIComponent(pointer.slice(1));
    } catch {
      return { ok: false, message: "The fragment has a malformed percent escape." };
    }
  }
  if (pointer === "") return { ok: true, path: [] };
  if (!pointer.startsWith("/")) {
    return { ok: false, message: "A JSON Pointer is empty or starts with '/', as in /items/0/name." };
  }
  const tokens = pointer.slice(1).split("/");
  const path: number[] = [];
  let node: JsonNode = root;
  let walked = "";
  for (const token of tokens) {
    if (/~(?![01])/.test(token)) {
      return { ok: false, message: `'${clip(token)}' has a '~' that is not ~0 or ~1, which RFC 6901 does not allow.` };
    }
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node.kind === "object") {
      let found = -1;
      for (let k = node.members.length - 1; k >= 0; k--) {
        if (node.members[k].key === key) {
          found = k;
          break;
        }
      }
      if (found < 0) return { ok: false, message: `The object at '${walked || "/"}' has no key ${clip(JSON.stringify(key))}.` };
      path.push(found);
      node = node.members[found].value;
    } else if (node.kind === "array") {
      if (key === "-") {
        return { ok: false, message: `'-' names the position after the last item of '${walked || "/"}', which holds no value.` };
      }
      if (!/^(0|[1-9][0-9]*)$/.test(key)) {
        return { ok: false, message: `'${clip(key)}' is not an array index. RFC 6901 indexes are digits with no leading zeros.` };
      }
      const index = Number(key);
      if (index >= node.items.length) {
        return {
          ok: false,
          message: `The array at '${walked || "/"}' has ${node.items.length} ${node.items.length === 1 ? "item" : "items"}, so index ${key} is past its end.`,
        };
      }
      path.push(index);
      node = node.items[index];
    } else {
      return { ok: false, message: `'${walked || "/"}' is a ${node.kind}, which has no children.` };
    }
    walked += `/${token}`;
  }
  return { ok: true, path };
}

/** A one-line preview of a node for a tree row. */
export function previewOf(node: JsonNode, max = 72): string {
  switch (node.kind) {
    case "object":
      return `{${node.members.length} ${node.members.length === 1 ? "key" : "keys"}}`;
    case "array":
      return `[${node.items.length} ${node.items.length === 1 ? "item" : "items"}]`;
    case "string":
      return node.raw.length > max ? `${node.raw.slice(0, max)}..."` : node.raw;
    case "number":
      return node.raw.length > max ? `${node.raw.slice(0, max)}...` : node.raw;
    case "boolean":
      return node.value ? "true" : "false";
    case "null":
      return "null";
  }
}
