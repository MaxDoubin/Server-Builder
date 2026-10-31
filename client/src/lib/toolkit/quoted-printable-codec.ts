/**
 * Quoted-printable and MIME encoded-words.
 *
 * Quoted-printable is the body encoding of RFC 2045 section 6.7: printable
 * ASCII stands for itself, every other octet is "=" and two uppercase hex
 * digits, an "=" at the end of a line is a soft line break that the decoder
 * removes, and no encoded line may exceed 76 characters. Encoded-words are
 * the header form of RFC 2047: =?charset?B?base64?= or =?charset?Q?text?=,
 * where Q is quoted-printable with "_" standing for a space.
 *
 * The three charsets the page offers are implemented here rather than through
 * TextDecoder. Browsers decode the label ISO-8859-1 as Windows-1252 (the
 * WHATWG Encoding Standard says to), and some Node releases decode
 * windows-1252 as ISO-8859-1, so owning both tables is the only way the
 * page and its tests agree. Any other charset named inside an encoded-word
 * goes to TextDecoder, which knows the rest.
 *
 * Pure data in, data out. Nothing here throws on any input.
 */

/* ------------------------------------------------------------------ caps */

/** Largest input either direction accepts, in UTF-16 code units. */
export const MAX_INPUT_CHARS = 1_000_000;
/** Individual warnings kept; the count beyond this is still reported. */
export const MAX_WARNINGS = 50;
/** RFC 2045 section 6.7 rule 5: encoded lines are at most 76 characters. */
export const MAX_LINE = 76;
/** RFC 2047 section 2: an encoded-word is at most 75 characters. */
export const MAX_ENCODED_WORD = 75;

/* --------------------------------------------------------------- charsets */

export type Charset = "utf-8" | "iso-8859-1" | "windows-1252";

export const CHARSETS: { id: Charset; label: string; mime: string }[] = [
  { id: "utf-8", label: "UTF-8", mime: "UTF-8" },
  { id: "iso-8859-1", label: "ISO-8859-1", mime: "ISO-8859-1" },
  { id: "windows-1252", label: "Windows-1252", mime: "windows-1252" },
];

/**
 * Windows-1252 bytes 0x80 to 0x9F. The five Microsoft never assigned (0x81,
 * 0x8D, 0x8F, 0x90, 0x9D) decode to the C1 control of the same value, which
 * is what the WHATWG index specifies and what browsers do.
 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const CP1252_REVERSE = new Map<number, number>(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]));

const LATIN1_ALIASES = new Set([
  "iso-8859-1",
  "iso8859-1",
  "iso_8859-1",
  "iso_8859-1:1987",
  "iso-ir-100",
  "latin1",
  "latin-1",
  "l1",
  "cp819",
  "ibm819",
  "csisolatin1",
]);
const CP1252_ALIASES = new Set(["windows-1252", "cp1252", "x-cp1252", "windows1252"]);
const ASCII_ALIASES = new Set(["us-ascii", "ascii", "ansi_x3.4-1968", "iso646-us", "us", "csascii"]);
const UTF8_ALIASES = new Set(["utf-8", "utf8", "unicode-1-1-utf-8"]);

/**
 * Canonical lowercase name for a charset label. The three built-in tables
 * plus US-ASCII are recognized; anything else is returned lowercased for
 * TextDecoder to try.
 */
export function normalizeCharset(label: string): string {
  const name = label.trim().toLowerCase();
  if (UTF8_ALIASES.has(name)) return "utf-8";
  if (LATIN1_ALIASES.has(name)) return "iso-8859-1";
  if (CP1252_ALIASES.has(name)) return "windows-1252";
  if (ASCII_ALIASES.has(name)) return "us-ascii";
  return name;
}

export interface EncodedChars {
  bytes: Uint8Array;
  /** starts[i] is the byte index where character i begins; one extra entry marks the end. */
  starts: number[];
  /** The characters, one string per code point, aligned with starts. */
  chars: string[];
}

export type EncodeCharsetResult =
  | { ok: true; value: EncodedChars }
  | { ok: false; error: string };

function describeCodePoint(cp: number): string {
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  const printable = cp >= 0x20 && !(cp >= 0x7f && cp <= 0x9f) && !(cp >= 0xd800 && cp <= 0xdfff);
  return printable ? `U+${hex} (${String.fromCodePoint(cp)})` : `U+${hex}`;
}

/**
 * Text to bytes in one of the three charsets, keeping where each character
 * starts so an encoder never splits one. A lone surrogate becomes U+FFFD in
 * UTF-8, as TextEncoder does. A character a single-byte charset cannot hold
 * is an error naming the first few offenders.
 */
export function encodeCharset(text: string, charset: Charset): EncodeCharsetResult {
  const bytes = new Uint8Array(text.length * 3 + 4);
  const starts: number[] = [];
  const chars: string[] = [];
  const missing: number[] = [];
  let missingCount = 0;
  let n = 0;
  for (let i = 0; i < text.length; ) {
    let cp = text.codePointAt(i) as number;
    const width = cp > 0xffff ? 2 : 1;
    chars.push(text.slice(i, i + width));
    i += width;
    starts.push(n);
    if (charset === "utf-8") {
      if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
      if (cp < 0x80) bytes[n++] = cp;
      else if (cp < 0x800) {
        bytes[n++] = 0xc0 | (cp >> 6);
        bytes[n++] = 0x80 | (cp & 0x3f);
      } else if (cp < 0x10000) {
        bytes[n++] = 0xe0 | (cp >> 12);
        bytes[n++] = 0x80 | ((cp >> 6) & 0x3f);
        bytes[n++] = 0x80 | (cp & 0x3f);
      } else {
        bytes[n++] = 0xf0 | (cp >> 18);
        bytes[n++] = 0x80 | ((cp >> 12) & 0x3f);
        bytes[n++] = 0x80 | ((cp >> 6) & 0x3f);
        bytes[n++] = 0x80 | (cp & 0x3f);
      }
      continue;
    }
    let byte: number | undefined;
    if (cp < 0x80) byte = cp;
    else if (charset === "iso-8859-1") byte = cp <= 0xff ? cp : undefined;
    else if (cp >= 0xa0 && cp <= 0xff) byte = cp;
    else byte = CP1252_REVERSE.get(cp);
    if (byte === undefined) {
      missingCount++;
      if (missing.length < 3 && !missing.includes(cp)) missing.push(cp);
      byte = 0x3f;
    }
    bytes[n++] = byte;
  }
  starts.push(n);
  if (missingCount) {
    const name = CHARSETS.find((c) => c.id === charset)?.label ?? charset;
    const list = missing.map(describeCodePoint).join(", ");
    const suggestion =
      charset === "iso-8859-1" && missing.every((cp) => CP1252_REVERSE.has(cp))
        ? " Windows-1252 has a byte for each of these, and UTF-8 can hold any character."
        : " UTF-8 can hold any character.";
    return {
      ok: false,
      error: `${missingCount} ${missingCount === 1 ? "character has" : "characters have"} no byte in ${name}: ${list}${
        missingCount > missing.length ? " and others" : ""
      }.${suggestion}`,
    };
  }
  return { ok: true, value: { bytes: bytes.slice(0, n), starts, chars } };
}

export type DecodeBytesResult =
  | { ok: true; text: string; notes: string[] }
  | { ok: false; error: string };

/**
 * Bytes to text under a charset label. UTF-8 is checked strictly first so a
 * malformed sequence is reported rather than silently replaced; the text is
 * then produced with U+FFFD in its place, as every mail client would show it.
 */
export function decodeBytes(bytes: Uint8Array, label: string): DecodeBytesResult {
  const name = normalizeCharset(label);
  if (name === "utf-8") {
    try {
      return { ok: true, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), notes: [] };
    } catch {
      return {
        ok: true,
        text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
        notes: [
          "The bytes are not valid UTF-8. Each malformed sequence is shown as U+FFFD. If the text came from an older mailer, try ISO-8859-1 or Windows-1252.",
        ],
      };
    }
  }
  if (name === "iso-8859-1" || name === "windows-1252" || name === "us-ascii") {
    let out = "";
    let c1 = 0;
    let high = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 0x80) high++;
      if (b >= 0x80 && b <= 0x9f) c1++;
      const cp = name === "iso-8859-1" || b < 0x80 || b > 0x9f ? b : CP1252_HIGH[b - 0x80];
      out += String.fromCharCode(cp);
    }
    const notes: string[] = [];
    if (name === "iso-8859-1" && c1) {
      notes.push(
        `${c1} ${c1 === 1 ? "byte falls" : "bytes fall"} between 0x80 and 0x9F, which ISO-8859-1 assigns to invisible C1 control codes. Text labeled ISO-8859-1 that contains them was almost always written as Windows-1252, where those bytes are curly quotes, dashes and the euro sign.`,
      );
    }
    if (name === "us-ascii" && high) {
      notes.push(
        `${high} ${high === 1 ? "byte is" : "bytes are"} above 0x7F, so this is not US-ASCII. They are shown as Windows-1252, which is how browsers read mislabeled ASCII.`,
      );
    }
    return { ok: true, text: out, notes };
  }
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(name);
  } catch {
    return { ok: false, error: `The charset "${label}" is not one this browser can decode.` };
  }
  try {
    return { ok: true, text: decoder.decode(bytes), notes: [] };
  } catch {
    return { ok: false, error: `The bytes could not be decoded as ${label}.` };
  }
}

/* -------------------------------------------------------- shared helpers */

const HEX = "0123456789ABCDEF";

function hexByte(b: number): string {
  return HEX[b >> 4] + HEX[b & 15];
}

function hexValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** A bounded warning list: the first MAX_WARNINGS messages and a total. */
class Warnings {
  list: string[] = [];
  total = 0;
  add(message: string) {
    this.total++;
    if (this.list.length < MAX_WARNINGS) this.list.push(message);
  }
}

function lineList(lines: number[]): string {
  const shown = lines.slice(0, 6).join(", ");
  return lines.length > 6 ? `${shown} and ${lines.length - 6} more` : shown;
}

function show(ch: string): string {
  if (ch === "") return "the end of the line";
  const code = ch.charCodeAt(0);
  if (code === 9) return "a tab";
  if (code === 32) return "a space";
  if (code < 32 || code === 127) return `control character 0x${hexByte(code)}`;
  return `"${ch}"`;
}

/* --------------------------------------------- quoted-printable decoding */

export interface QpDecodeOptions {
  charset: Charset;
  /** What a hard line break becomes in the decoded bytes. Defaults to LF. */
  lineBreak?: "\n" | "\r\n";
}

export interface QpDecodeSuccess {
  ok: true;
  text: string;
  bytes: Uint8Array;
  warnings: string[];
  /** Warnings found, including any beyond the kept list. */
  warningTotal: number;
  /** Notes from the charset decoder, such as malformed UTF-8. */
  charsetNotes: string[];
  encodedLines: number;
  softBreaks: number;
  escapes: number;
  longestLine: number;
}

export type QpDecodeResult = QpDecodeSuccess | { ok: false; error: string };

/**
 * RFC 2045 section 6.7, receiving side.
 *
 * Rule 1: "=" and two hex digits is one octet. Uppercase is required of a
 * sender; lowercase is accepted, as the RFC allows a robust decoder to do.
 * Rule 3: whitespace at the end of an encoded line was added in transit and
 * is deleted. Rule 5: "=" at the end of a line (after any such padding) is a
 * soft break and produces nothing. Any other "=" is malformed; the RFC's
 * suggested recovery, keeping it as a literal, is what happens here.
 */
export function decodeQuotedPrintable(input: string, options: QpDecodeOptions): QpDecodeResult {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `The input is ${input.length.toLocaleString("en-US")} characters. The decoder accepts up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const breakBytes = options.lineBreak === "\r\n" ? [13, 10] : [10];
  const lines = input.split(/\r\n|\n|\r/);
  const out = new Uint8Array(input.length * 3 + 4);
  let n = 0;
  const warnings = new Warnings();
  const longLines: number[] = [];
  const paddedLines: number[] = [];
  let lowercase = 0;
  let raw = 0;
  let softBreaks = 0;
  let escapes = 0;
  let longest = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const stripped = line.replace(/[ \t]+$/, "");
    const soft = stripped.endsWith("=");
    const content = soft ? stripped.slice(0, -1) : stripped;
    if (stripped.length > longest) longest = stripped.length;
    if (stripped.length > MAX_LINE) longLines.push(li + 1);
    if (stripped.length !== line.length && !soft) paddedLines.push(li + 1);

    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code === 61) {
        const hi = i + 1 < content.length ? hexValue(content.charCodeAt(i + 1)) : -1;
        const lo = i + 2 < content.length ? hexValue(content.charCodeAt(i + 2)) : -1;
        if (hi >= 0 && lo >= 0) {
          if (/[a-f]/.test(content.slice(i + 1, i + 3))) lowercase++;
          out[n++] = hi * 16 + lo;
          escapes++;
          i += 2;
          continue;
        }
        const next = content.slice(i + 1, i + 3);
        warnings.add(
          `Line ${li + 1}, column ${i + 1}: "=" is followed by ${
            next.length === 0 ? "the end of the data" : next.length === 1 ? show(next) : `"${next}"`
          }, not two hex digits. Kept as a literal "=".`,
        );
        out[n++] = 61;
        continue;
      }
      if (code === 9 || (code >= 32 && code <= 126)) {
        out[n++] = code;
        continue;
      }
      // A control character or a non-ASCII character, which rule 4 says must
      // not appear. Keep it, as the selected charset would encode it, and
      // say so; dropping it would lose text the reader can see.
      raw++;
      const cp = content.codePointAt(i) as number;
      const ch = String.fromCodePoint(cp);
      if (cp > 0xffff) i++;
      const enc = encodeCharset(ch, options.charset);
      const bytes = enc.ok ? enc.value.bytes : (encodeCharset(ch, "utf-8") as { ok: true; value: EncodedChars }).value.bytes;
      for (const b of bytes) out[n++] = b;
    }

    if (soft) softBreaks++;
    else if (li < lines.length - 1) for (const b of breakBytes) out[n++] = b;
  }

  if (longLines.length) {
    warnings.add(
      `${longLines.length === 1 ? "Line" : "Lines"} ${lineList(longLines)} ${longLines.length === 1 ? "is" : "are"} longer than 76 characters, which RFC 2045 forbids. Decoded anyway, but a strict gateway may have wrapped or rejected the original.`,
    );
  }
  if (paddedLines.length) {
    warnings.add(
      `Trailing spaces or tabs were removed from ${paddedLines.length === 1 ? "line" : "lines"} ${lineList(paddedLines)}. RFC 2045 treats whitespace at the end of an encoded line as transport padding; an encoder that meant a real trailing space writes =20.`,
    );
  }
  if (lowercase) {
    warnings.add(
      `${lowercase} ${lowercase === 1 ? "escape uses" : "escapes use"} lowercase hex. RFC 2045 requires uppercase from an encoder and allows a decoder to accept lowercase, as this one does.`,
    );
  }
  if (raw) {
    warnings.add(
      `${raw} ${raw === 1 ? "character is" : "characters are"} neither printable ASCII nor an escape. Quoted-printable data should contain only printable ASCII, so this text was probably decoded once already. ${raw === 1 ? "It is" : "They are"} kept as the selected charset encodes ${raw === 1 ? "it" : "them"}.`,
    );
  }

  const bytes = out.slice(0, n);
  const decoded = decodeBytes(bytes, options.charset);
  const text = decoded.ok ? decoded.text : "";
  return {
    ok: true,
    text,
    bytes,
    warnings: warnings.list,
    warningTotal: warnings.total,
    charsetNotes: decoded.ok ? decoded.notes : [decoded.error],
    encodedLines: lines.length,
    softBreaks,
    escapes,
    longestLine: longest,
  };
}

/* --------------------------------------------- quoted-printable encoding */

export interface QpEncodeOptions {
  charset: Charset;
  /**
   * Binary mode encodes CR and LF as =0D and =0A, so line breaks survive
   * exactly. Text mode (the default) makes each input line an encoded line,
   * which a receiver turns back into its own line ending.
   */
  binary?: boolean;
  /** Also escape the characters EBCDIC translation is known to change. */
  ebcdicSafe?: boolean;
  /** Separator between encoded lines in the output. Defaults to LF. */
  lineBreak?: "\n" | "\r\n";
}

export const EBCDIC_UNSAFE = '!"#$@[\\]^`{|}~';
const EBCDIC_SET = new Set(Array.from(EBCDIC_UNSAFE, (c) => c.charCodeAt(0)));

export interface QpEncodeSuccess {
  ok: true;
  output: string;
  bytes: number;
  lines: number;
  longestLine: number;
}

export type QpEncodeResult = QpEncodeSuccess | { ok: false; error: string };

/**
 * RFC 2045 section 6.7, sending side.
 *
 * Octets 33 to 126 other than "=" are literal (rule 2). Space and tab are
 * literal except as the last character of a line, where a transport could
 * strip them, so they become =20 and =09 there (rule 3). Everything else is
 * "=" plus two uppercase hex digits (rule 1). Lines are broken with a soft
 * "=" so that no encoded line, "=" included, exceeds 76 characters, and an
 * escape is never split (rule 5). The bytes of one character are also kept
 * on one line, which the RFC does not require but makes the output readable.
 */
export function encodeQuotedPrintable(text: string, options: QpEncodeOptions): QpEncodeResult {
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `The input is ${text.length.toLocaleString("en-US")} characters. The encoder accepts up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const source = options.binary ? text : text.replace(/\r\n?/g, "\n");
  const enc = encodeCharset(source, options.charset);
  if (!enc.ok) return { ok: false, error: enc.error };
  const { bytes, starts } = enc.value;
  const sep = options.lineBreak ?? "\n";

  const outLines: string[] = [];
  let line = "";
  let longest = 0;
  const pushLine = (value: string) => {
    if (value.length > longest) longest = value.length;
    outLines.push(value);
  };

  const charCount = starts.length - 1;
  for (let c = 0; c < charCount; c++) {
    const from = starts[c];
    const to = starts[c + 1];
    if (!options.binary && to - from === 1 && bytes[from] === 10) {
      pushLine(line);
      line = "";
      continue;
    }
    const lastOnLine =
      c === charCount - 1 || (!options.binary && starts[c + 2] - starts[c + 1] === 1 && bytes[starts[c + 1]] === 10);
    let token = "";
    for (let i = from; i < to; i++) {
      const b = bytes[i];
      const literal =
        (b >= 33 && b <= 126 && b !== 61 && !(options.ebcdicSafe && EBCDIC_SET.has(b))) ||
        ((b === 32 || b === 9) && !(lastOnLine && i === to - 1));
      token += literal ? String.fromCharCode(b) : `=${hexByte(b)}`;
    }
    // A line that ends here may use all 76 columns; one that continues
    // needs the last column for the soft-break "=".
    const limit = lastOnLine ? MAX_LINE : MAX_LINE - 1;
    if (line.length > 0 && line.length + token.length > limit) {
      pushLine(`${line}=`);
      line = "";
    }
    line += token;
  }
  pushLine(line);

  return {
    ok: true,
    output: outLines.join(sep),
    bytes: bytes.length,
    lines: outLines.length,
    longestLine: longest,
  };
}

/* ----------------------------------------------- RFC 2047 encoded-words */

export interface EncodedWord {
  /** The encoded-word exactly as it appeared. */
  raw: string;
  /** Offset in the unfolded header text. */
  start: number;
  charset: string;
  /** RFC 2231 language tag after "*", if present. */
  language: string | null;
  encoding: "B" | "Q";
  /** Decoded text of this word alone, or null when it could not be decoded. */
  text: string | null;
  error: string | null;
}

export interface HeaderDecodeSuccess {
  ok: true;
  text: string;
  words: EncodedWord[];
  warnings: string[];
  warningTotal: number;
}

export type HeaderDecodeResult = HeaderDecodeSuccess | { ok: false; error: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUE = new Map<string, number>(Array.from(B64, (c, i) => [c, i]));

type BytesOrError = { ok: true; bytes: Uint8Array; note?: string } | { ok: false; error: string };

/** RFC 2047 section 4.1: the B encoding is RFC 2045 Base64. */
export function decodeBase64(text: string): BytesOrError {
  const body = text.replace(/=+$/, "");
  const padding = text.length - body.length;
  for (const ch of body) {
    if (!B64_VALUE.has(ch)) {
      return {
        ok: false,
        error: `${show(ch)} is not a Base64 character${ch === "-" || ch === "_" ? " (that is the URL-safe alphabet, which RFC 2047 does not use)" : ""}.`,
      };
    }
  }
  if (body.length % 4 === 1) return { ok: false, error: "The Base64 text is one character short of a whole byte." };
  if (padding > 2) return { ok: false, error: "Base64 has at most two padding characters." };
  const expectedPad = (4 - (body.length % 4)) % 4;
  const note =
    padding === expectedPad
      ? undefined
      : padding === 0
        ? "is missing its Base64 padding"
        : "carries the wrong amount of Base64 padding";
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (const ch of body) {
    acc = (acc << 6) | (B64_VALUE.get(ch) as number);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes: out.slice(0, n), note };
}

/** RFC 2047 section 4.2: quoted-printable with "_" for space and no soft breaks. */
export function decodeQ(text: string): BytesOrError {
  const out = new Uint8Array(text.length);
  let n = 0;
  let bad: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 95) {
      out[n++] = 32;
    } else if (code === 61) {
      const hi = hexValue(text.charCodeAt(i + 1));
      const lo = hexValue(text.charCodeAt(i + 2));
      if (hi >= 0 && lo >= 0) {
        out[n++] = hi * 16 + lo;
        i += 2;
      } else {
        bad ??= `has an "=" at position ${i + 1} that is not followed by two hex digits, kept as a literal`;
        out[n++] = 61;
      }
    } else if (code > 126 || code < 33) {
      return { ok: false, error: `${show(text[i])} cannot appear in Q-encoded text.` };
    } else {
      out[n++] = code;
    }
  }
  return { ok: true, bytes: out.slice(0, n), note: bad };
}

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function validUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes every encoded-word in a header value (RFC 2047 section 6).
 *
 * The value is unfolded first (RFC 5322 section 2.2.3: a line break followed
 * by a space or tab is removed). Whitespace between two adjacent
 * encoded-words is dropped, which is how a long value split across several
 * words reads as one string; whitespace next to ordinary text is kept.
 * Words with no whitespace around them, or a character split across two
 * words, both break RFC 2047 and both are common, so they are decoded the
 * way mail clients decode them and reported.
 */
export function decodeHeader(input: string): HeaderDecodeResult {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `The input is ${input.length.toLocaleString("en-US")} characters. The decoder accepts up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const text = input.replace(/\r\n(?=[ \t])|\n(?=[ \t])|\r(?=[ \t])/g, "");
  const warnings = new Warnings();

  type Seg = { kind: "text"; value: string } | { kind: "word"; word: EncodedWord; bytes: Uint8Array | null };
  const segs: Seg[] = [];
  const words: EncodedWord[] = [];
  let last = 0;
  let longWords = 0;
  let unspaced = 0;
  let quoted = 0;
  for (const m of text.matchAll(ENCODED_WORD)) {
    const start = m.index ?? 0;
    if (start > last) segs.push({ kind: "text", value: text.slice(last, start) });
    const [raw, charsetField, enc, payload] = m;
    const star = charsetField.indexOf("*");
    const charset = star >= 0 ? charsetField.slice(0, star) : charsetField;
    const language = star >= 0 ? charsetField.slice(star + 1) || null : null;
    const encoding = enc.toUpperCase() as "B" | "Q";
    const word: EncodedWord = { raw, start, charset, language, encoding, text: null, error: null };
    if (raw.length > MAX_ENCODED_WORD) longWords++;

    let bytes: Uint8Array | null = null;
    if (charset === "") {
      word.error = "The charset is empty.";
    } else {
      const decoded = encoding === "B" ? decodeBase64(payload) : decodeQ(payload);
      if (!decoded.ok) {
        word.error = decoded.error;
      } else {
        bytes = decoded.bytes;
        if (decoded.note) warnings.add(`The word ${shorten(raw)} ${decoded.note}.`);
        const alone = decodeBytes(bytes, charset);
        if (alone.ok) word.text = alone.text;
        else {
          word.error = alone.error;
          bytes = null;
        }
      }
    }
    words.push(word);
    segs.push({ kind: "word", word, bytes });
    last = start + raw.length;
  }
  if (last < text.length) segs.push({ kind: "text", value: text.slice(last) });

  // Whitespace that only separates two decodable words is dropped. An empty
  // gap between words, or a word glued to ordinary text, is a violation of
  // section 5 that real mail still contains.
  const kept: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kind === "text") {
      const prev = segs[i - 1];
      const next = segs[i + 1];
      const between = prev?.kind === "word" && next?.kind === "word" && prev.bytes && next.bytes;
      if (between && /^[ \t]*$/.test(seg.value)) continue;
      kept.push(seg);
      continue;
    }
    if (seg.bytes) {
      const prev = segs[i - 1];
      const next = segs[i + 1];
      const before = prev ? (prev.kind === "text" ? prev.value.slice(-1) : "") : " ";
      const after = next ? (next.kind === "text" ? next.value.slice(0, 1) : "") : " ";
      if (before === '"' && after === '"') quoted++;
      else if (!/[ \t(:"]/.test(before) || !/[ \t)"]/.test(after)) unspaced++;
    }
    kept.push(seg);
  }

  // Adjacent decodable words in the same charset are joined at the byte
  // level, so a multibyte character split across two words still decodes.
  let out = "";
  let splitChars = 0;
  for (let i = 0; i < kept.length; i++) {
    const seg = kept[i];
    if (seg.kind === "text") {
      out += seg.value;
      continue;
    }
    if (!seg.bytes) {
      out += seg.word.raw;
      continue;
    }
    const charset = normalizeCharset(seg.word.charset);
    const run: Uint8Array[] = [seg.bytes];
    const runWords = [seg];
    while (i + 1 < kept.length) {
      const next = kept[i + 1];
      if (next.kind !== "word" || !next.bytes || normalizeCharset(next.word.charset) !== charset) break;
      run.push(next.bytes);
      runWords.push(next);
      i++;
    }
    const joined = concat(run);
    const decoded = decodeBytes(joined, charset);
    if (decoded.ok) {
      out += decoded.text;
      for (const note of decoded.notes) warnings.add(note);
      if (charset === "utf-8" && runWords.length > 1 && validUtf8(joined) && runWords.some((w) => !validUtf8(w.bytes as Uint8Array))) {
        splitChars++;
      }
    } else {
      out += runWords.map((w) => w.word.raw).join("");
    }
  }

  for (const w of words) if (w.error) warnings.add(`The word ${shorten(w.raw)} was left as is: ${w.error}`);
  if (unspaced) {
    warnings.add(
      `${unspaced} ${unspaced === 1 ? "encoded-word touches" : "encoded-words touch"} the text or word beside ${unspaced === 1 ? "it" : "them"} with no whitespace between. RFC 2047 section 5 requires a separating space; most clients decode it anyway, as done here.`,
    );
  }
  if (quoted) {
    warnings.add(
      `${quoted} ${quoted === 1 ? "encoded-word sits" : "encoded-words sit"} inside a quoted string, where RFC 2047 section 5 says ${quoted === 1 ? "it" : "they"} must not appear. Many mailers write display names this way and most clients decode them, as done here.`,
    );
  }
  if (splitChars) {
    warnings.add(
      "A UTF-8 character is split across two encoded-words, which RFC 2047 section 5 forbids. The words were joined before decoding, which is what most clients do.",
    );
  }
  if (longWords) {
    warnings.add(
      `${longWords} ${longWords === 1 ? "encoded-word is" : "encoded-words are"} longer than the 75 characters RFC 2047 section 2 allows. Decoded anyway.`,
    );
  }
  return { ok: true, text: out, words, warnings: warnings.list, warningTotal: warnings.total };
}

function shorten(raw: string): string {
  return raw.length > 40 ? `${raw.slice(0, 37)}...` : raw;
}

/* ------------------------------------------------------ header encoding */

export interface HeaderEncodeOptions {
  charset: Charset;
  encoding: "B" | "Q";
  /** Field name such as Subject. Empty means encode the value alone. */
  headerName?: string;
  /** Separator for folded lines. Defaults to LF. */
  lineBreak?: "\n" | "\r\n";
}

export interface HeaderEncodeSuccess {
  ok: true;
  output: string;
  words: string[];
  /** False when the value is plain printable ASCII and could be sent unencoded. */
  needed: boolean;
  notes: string[];
}

export type HeaderEncodeResult = HeaderEncodeSuccess | { ok: false; error: string };

/**
 * RFC 2047 section 5 rule 3: inside a phrase only letters, digits and
 * ! * + - / may stand for themselves in Q text. Using that set everywhere
 * makes one output valid in a Subject, a display name or a comment.
 */
function qSafe(b: number): boolean {
  return (
    (b >= 48 && b <= 57) ||
    (b >= 65 && b <= 90) ||
    (b >= 97 && b <= 122) ||
    b === 33 ||
    b === 42 ||
    b === 43 ||
    b === 45 ||
    b === 47
  );
}

function qToken(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    s += b === 32 ? "_" : qSafe(b) ? String.fromCharCode(b) : `=${hexByte(b)}`;
  }
  return s;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    s += B64[(triple >> 18) & 63] + B64[(triple >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(triple >> 6) & 63] : "=";
    s += i + 2 < bytes.length ? B64[triple & 63] : "=";
  }
  return s;
}

/**
 * Encodes a header value as RFC 2047 encoded-words, folded so every line is
 * at most 76 characters (section 2) and every word at most 75. Each word
 * holds whole characters (section 5), so no decoder has to join bytes
 * across words. Words go one per line; the fold's whitespace is dropped by
 * the decoder because it sits between two encoded-words.
 */
export function encodeHeader(value: string, options: HeaderEncodeOptions): HeaderEncodeResult {
  if (value.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `The input is ${value.length.toLocaleString("en-US")} characters. The encoder accepts up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const notes: string[] = [];
  const name = (options.headerName ?? "").trim().replace(/:$/, "");
  if (name && !/^[\x21-\x39\x3b-\x7e]+$/.test(name)) {
    return {
      ok: false,
      error: "A header field name is printable ASCII with no spaces or colons (RFC 5322 section 3.6.8), such as Subject or X-Report.",
    };
  }
  let flat = value;
  if (/[\r\n]/.test(value)) {
    flat = value.replace(/\r\n|\r|\n/g, " ");
    notes.push("A header value is one logical line, so the line breaks in the input were replaced with spaces.");
  }
  if (flat === "") return { ok: true, output: name ? `${name}: ` : "", words: [], needed: false, notes };

  const needed = /[^\x20-\x7e]/.test(flat) || flat.includes("=?");
  const enc = encodeCharset(flat, options.charset);
  if (!enc.ok) return { ok: false, error: enc.error };
  const { bytes, starts } = enc.value;
  const mime = CHARSETS.find((c) => c.id === options.charset)?.mime ?? "UTF-8";
  const prefix = `=?${mime}?${options.encoding}?`;
  const overhead = prefix.length + 2;
  const firstUsed = name ? name.length + 2 : 0;
  const sep = options.lineBreak ?? "\n";

  const words: string[] = [];
  let wordFrom = 0;
  let wordLen = 0;
  let onFirstLine = true;
  // The longest single character: four UTF-8 bytes, 12 Q characters or 8 of Base64.
  const minText = options.encoding === "Q" ? 12 : 8;
  let budget = Math.min(MAX_ENCODED_WORD, MAX_LINE - firstUsed) - overhead;
  let startOnNextLine = false;
  if (budget < minText) {
    startOnNextLine = true;
    onFirstLine = false;
    budget = MAX_ENCODED_WORD - overhead;
  }

  const emit = (to: number) => {
    const text = options.encoding === "Q" ? qToken(bytes, wordFrom, to) : base64(bytes.subarray(wordFrom, to));
    words.push(`${prefix}${text}?=`);
    wordFrom = to;
    wordLen = 0;
    if (onFirstLine) {
      onFirstLine = false;
      budget = MAX_ENCODED_WORD - overhead;
    }
  };

  const charCount = starts.length - 1;
  for (let c = 0; c < charCount; c++) {
    const from = starts[c];
    const to = starts[c + 1];
    let nextLen: number;
    if (options.encoding === "Q") nextLen = wordLen + qToken(bytes, from, to).length;
    else nextLen = Math.ceil((to - wordFrom) / 3) * 4;
    if (nextLen > budget && from > wordFrom) {
      emit(from);
      nextLen = options.encoding === "Q" ? qToken(bytes, from, to).length : Math.ceil((to - from) / 3) * 4;
    }
    wordLen = nextLen;
  }
  if (wordFrom < bytes.length) emit(bytes.length);

  const head = name ? `${name}:` : "";
  let output: string;
  if (startOnNextLine) output = `${head}${sep} ${words.join(`${sep} `)}`;
  else output = `${head}${name ? " " : ""}${words.join(`${sep} `)}`;
  if (!needed) notes.push("This value is printable ASCII and could be sent as is. Encoding it is allowed but not required.");
  return { ok: true, output, words, needed, notes };
}
