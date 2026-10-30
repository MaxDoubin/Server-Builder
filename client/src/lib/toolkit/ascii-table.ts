/**
 * ASCII, Latin-1 and Windows-1252, as data, plus a search that reads a
 * query as a character, a number in any base, an escape, or a name.
 *
 * Sources: ASCII is ANSI X3.4-1986 (the same 128 codes as ISO/IEC 646 IRV).
 * Control names are the Unicode aliases from NameAliases.txt, which follow
 * ISO/IEC 6429 for C0 and C1. Latin-1 is ISO/IEC 8859-1, whose 256 codes are
 * the first 256 Unicode code points. Windows-1252 is the WHATWG Encoding
 * Standard's index, which is also what the HTML parser's numeric character
 * reference table uses for 0x80 to 0x9F. HTML entity names are from the
 * WHATWG named character reference list.
 *
 * Every character here is stored as a number and turned into a string at
 * run time, so the source never has to contain the characters it describes.
 */

export const MAX_QUERY_LENGTH = 64;

export type Charset = "ascii" | "latin1" | "cp1252";

export interface CodeRow {
  /** The byte value, 0 to 255. */
  code: number;
  /** The Unicode code point this byte means under the chosen charset, or null for an undefined byte. */
  codePoint: number | null;
  /** True for a control character or an undefined byte: there is no glyph to draw. */
  control: boolean;
  /** Short name for a control or invisible character: NUL, ESC, NBSP. Null for an ordinary glyph. */
  abbr: string | null;
  /** Full name, in sentence case. Upper-cased, it is the Unicode name or alias. */
  name: string;
  /** Caret notation, ^@ to ^_ and ^?, for C0 controls and DEL. */
  caret: string | null;
  /** C simple escape sequence, where the language defines one. */
  cEscape: string | null;
  /** HTML named references, without the & and ;, most common first. */
  entities: string[];
  /** Numeric HTML reference that produces this character. */
  numericRef: string;
  /** Anything a reader should know about writing this one in HTML. */
  htmlNote: string | null;
  /** Further note: what is unusual about this code. */
  note: string | null;
  /** Lower case search terms beyond the name: common nicknames. */
  aliases: string[];
  /** True when this byte means something different in Windows-1252 than in Latin-1. */
  differsInCp1252: boolean;
}

/* ------------------------------------------------------------- C0 + DEL */

interface ControlSpec {
  abbr: string;
  name: string;
  aliases?: string[];
}

/** ASCII control names. Upper-cased each is a Unicode alias for the code (BEL's alias is ALERT). */
const C0: ControlSpec[] = [
  { abbr: "NUL", name: "Null" },
  { abbr: "SOH", name: "Start of heading" },
  { abbr: "STX", name: "Start of text" },
  { abbr: "ETX", name: "End of text", aliases: ["ctrl-c", "interrupt"] },
  { abbr: "EOT", name: "End of transmission", aliases: ["ctrl-d", "eof"] },
  { abbr: "ENQ", name: "Enquiry" },
  { abbr: "ACK", name: "Acknowledge" },
  { abbr: "BEL", name: "Bell", aliases: ["alert", "beep"] },
  { abbr: "BS", name: "Backspace" },
  { abbr: "HT", name: "Horizontal tabulation", aliases: ["tab", "character tabulation"] },
  { abbr: "LF", name: "Line feed", aliases: ["newline", "new line", "end of line", "eol"] },
  { abbr: "VT", name: "Vertical tabulation", aliases: ["vertical tab", "line tabulation"] },
  { abbr: "FF", name: "Form feed", aliases: ["page break", "new page"] },
  { abbr: "CR", name: "Carriage return", aliases: ["return", "enter"] },
  { abbr: "SO", name: "Shift out" },
  { abbr: "SI", name: "Shift in" },
  { abbr: "DLE", name: "Data link escape" },
  { abbr: "DC1", name: "Device control one", aliases: ["xon"] },
  { abbr: "DC2", name: "Device control two" },
  { abbr: "DC3", name: "Device control three", aliases: ["xoff"] },
  { abbr: "DC4", name: "Device control four" },
  { abbr: "NAK", name: "Negative acknowledge" },
  { abbr: "SYN", name: "Synchronous idle" },
  { abbr: "ETB", name: "End of transmission block" },
  { abbr: "CAN", name: "Cancel" },
  { abbr: "EM", name: "End of medium" },
  { abbr: "SUB", name: "Substitute", aliases: ["ctrl-z"] },
  { abbr: "ESC", name: "Escape", aliases: ["esc"] },
  { abbr: "FS", name: "File separator", aliases: ["information separator four"] },
  { abbr: "GS", name: "Group separator", aliases: ["information separator three"] },
  { abbr: "RS", name: "Record separator", aliases: ["information separator two"] },
  { abbr: "US", name: "Unit separator", aliases: ["information separator one"] },
];

/**
 * C simple escape sequences (C11 6.4.4.4). \0 is strictly an octal escape
 * with the value zero, listed because it is how everyone writes NUL; \e is
 * a GNU extension, not standard C.
 */
const C_ESCAPES: Record<number, string> = {
  0: "\\0",
  7: "\\a",
  8: "\\b",
  9: "\\t",
  10: "\\n",
  11: "\\v",
  12: "\\f",
  13: "\\r",
  27: "\\e",
  34: '\\"',
  39: "\\'",
  63: "\\?",
  92: "\\\\",
};

/* ------------------------------------------------------------- printable */

/** Names for printable ASCII other than the letters and digits, which are generated. */
const PRINTABLE: Record<number, { name: string; aliases?: string[] }> = {
  32: { name: "Space", aliases: ["blank", "sp"] },
  33: { name: "Exclamation mark", aliases: ["bang"] },
  34: { name: "Quotation mark", aliases: ["double quote", "quote"] },
  35: { name: "Number sign", aliases: ["hash", "pound", "octothorpe"] },
  36: { name: "Dollar sign" },
  37: { name: "Percent sign" },
  38: { name: "Ampersand", aliases: ["and"] },
  39: { name: "Apostrophe", aliases: ["single quote", "quote"] },
  40: { name: "Left parenthesis", aliases: ["open paren", "parenthesis"] },
  41: { name: "Right parenthesis", aliases: ["close paren", "parenthesis"] },
  42: { name: "Asterisk", aliases: ["star"] },
  43: { name: "Plus sign" },
  44: { name: "Comma" },
  45: { name: "Hyphen-minus", aliases: ["hyphen", "minus", "dash"] },
  46: { name: "Full stop", aliases: ["period", "dot"] },
  47: { name: "Solidus", aliases: ["slash", "forward slash"] },
  58: { name: "Colon" },
  59: { name: "Semicolon" },
  60: { name: "Less-than sign", aliases: ["left angle bracket"] },
  61: { name: "Equals sign" },
  62: { name: "Greater-than sign", aliases: ["right angle bracket"] },
  63: { name: "Question mark" },
  64: { name: "Commercial at", aliases: ["at sign"] },
  91: { name: "Left square bracket", aliases: ["open bracket", "bracket"] },
  92: { name: "Reverse solidus", aliases: ["backslash"] },
  93: { name: "Right square bracket", aliases: ["close bracket", "bracket"] },
  94: { name: "Circumflex accent", aliases: ["caret", "hat"] },
  95: { name: "Low line", aliases: ["underscore"] },
  96: { name: "Grave accent", aliases: ["backtick", "backquote"] },
  123: { name: "Left curly bracket", aliases: ["open brace", "brace"] },
  124: { name: "Vertical line", aliases: ["pipe", "vertical bar"] },
  125: { name: "Right curly bracket", aliases: ["close brace", "brace"] },
  126: { name: "Tilde" },
};

const DIGIT_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** WHATWG named references for ASCII. Only these have names; every other character takes &#N;. */
const ASCII_ENTITIES: Record<number, string[]> = {
  9: ["Tab"],
  10: ["NewLine"],
  33: ["excl"],
  34: ["quot"],
  35: ["num"],
  36: ["dollar"],
  37: ["percnt"],
  38: ["amp"],
  39: ["apos"],
  40: ["lpar"],
  41: ["rpar"],
  42: ["ast"],
  43: ["plus"],
  44: ["comma"],
  46: ["period"],
  47: ["sol"],
  58: ["colon"],
  59: ["semi"],
  60: ["lt"],
  61: ["equals"],
  62: ["gt"],
  63: ["quest"],
  64: ["commat"],
  91: ["lsqb", "lbrack"],
  92: ["bsol"],
  93: ["rsqb", "rbrack"],
  94: ["Hat"],
  95: ["lowbar"],
  96: ["grave"],
  123: ["lcub", "lbrace"],
  124: ["verbar", "vert"],
  125: ["rcub", "rbrace"],
};

/* ------------------------------------------------------------- C1 */

/** C1 controls, 0x80 to 0x9F, in ISO/IEC 6429 order. */
const C1: ControlSpec[] = [
  { abbr: "PAD", name: "Padding character" },
  { abbr: "HOP", name: "High octet preset" },
  { abbr: "BPH", name: "Break permitted here" },
  { abbr: "NBH", name: "No break here" },
  { abbr: "IND", name: "Index" },
  { abbr: "NEL", name: "Next line" },
  { abbr: "SSA", name: "Start of selected area" },
  { abbr: "ESA", name: "End of selected area" },
  { abbr: "HTS", name: "Character tabulation set" },
  { abbr: "HTJ", name: "Character tabulation with justification" },
  { abbr: "VTS", name: "Line tabulation set" },
  { abbr: "PLD", name: "Partial line forward" },
  { abbr: "PLU", name: "Partial line backward" },
  { abbr: "RI", name: "Reverse line feed", aliases: ["reverse index"] },
  { abbr: "SS2", name: "Single shift two" },
  { abbr: "SS3", name: "Single shift three" },
  { abbr: "DCS", name: "Device control string" },
  { abbr: "PU1", name: "Private use one" },
  { abbr: "PU2", name: "Private use two" },
  { abbr: "STS", name: "Set transmit state" },
  { abbr: "CCH", name: "Cancel character" },
  { abbr: "MW", name: "Message waiting" },
  { abbr: "SPA", name: "Start of guarded area" },
  { abbr: "EPA", name: "End of guarded area" },
  { abbr: "SOS", name: "Start of string" },
  { abbr: "SGC", name: "Single graphic character introducer" },
  { abbr: "SCI", name: "Single character introducer" },
  { abbr: "CSI", name: "Control sequence introducer" },
  { abbr: "ST", name: "String terminator" },
  { abbr: "OSC", name: "Operating system command" },
  { abbr: "PM", name: "Privacy message" },
  { abbr: "APC", name: "Application program command" },
];

/** Codes whose C1 name was proposed in a draft and never approved; Unicode keeps it as a "figment" alias. */
const C1_FIGMENTS = new Set([0x80, 0x81, 0x99]);

/* ------------------------------------------------------------- Latin-1 upper half */

/** 0xA0 to 0xFF: Unicode name (sentence case) and the HTML 4 Latin-1 entity name. */
const LATIN1_UPPER: [string, string, string[]?][] = [
  ["No-break space", "nbsp", ["nbsp", "non-breaking space"]],
  ["Inverted exclamation mark", "iexcl"],
  ["Cent sign", "cent"],
  ["Pound sign", "pound", ["sterling"]],
  ["Currency sign", "curren"],
  ["Yen sign", "yen"],
  ["Broken bar", "brvbar"],
  ["Section sign", "sect"],
  ["Diaeresis", "uml", ["umlaut"]],
  ["Copyright sign", "copy"],
  ["Feminine ordinal indicator", "ordf"],
  ["Left-pointing double angle quotation mark", "laquo", ["guillemet"]],
  ["Not sign", "not"],
  ["Soft hyphen", "shy", ["shy"]],
  ["Registered sign", "reg", ["registered trademark"]],
  ["Macron", "macr"],
  ["Degree sign", "deg"],
  ["Plus-minus sign", "plusmn"],
  ["Superscript two", "sup2", ["squared"]],
  ["Superscript three", "sup3", ["cubed"]],
  ["Acute accent", "acute"],
  ["Micro sign", "micro", ["mu"]],
  ["Pilcrow sign", "para", ["paragraph"]],
  ["Middle dot", "middot"],
  ["Cedilla", "cedil"],
  ["Superscript one", "sup1"],
  ["Masculine ordinal indicator", "ordm"],
  ["Right-pointing double angle quotation mark", "raquo", ["guillemet"]],
  ["Vulgar fraction one quarter", "frac14"],
  ["Vulgar fraction one half", "frac12"],
  ["Vulgar fraction three quarters", "frac34"],
  ["Inverted question mark", "iquest"],
  ["Latin capital letter A with grave", "Agrave"],
  ["Latin capital letter A with acute", "Aacute"],
  ["Latin capital letter A with circumflex", "Acirc"],
  ["Latin capital letter A with tilde", "Atilde"],
  ["Latin capital letter A with diaeresis", "Auml"],
  ["Latin capital letter A with ring above", "Aring"],
  ["Latin capital letter AE", "AElig"],
  ["Latin capital letter C with cedilla", "Ccedil"],
  ["Latin capital letter E with grave", "Egrave"],
  ["Latin capital letter E with acute", "Eacute"],
  ["Latin capital letter E with circumflex", "Ecirc"],
  ["Latin capital letter E with diaeresis", "Euml"],
  ["Latin capital letter I with grave", "Igrave"],
  ["Latin capital letter I with acute", "Iacute"],
  ["Latin capital letter I with circumflex", "Icirc"],
  ["Latin capital letter I with diaeresis", "Iuml"],
  ["Latin capital letter Eth", "ETH"],
  ["Latin capital letter N with tilde", "Ntilde"],
  ["Latin capital letter O with grave", "Ograve"],
  ["Latin capital letter O with acute", "Oacute"],
  ["Latin capital letter O with circumflex", "Ocirc"],
  ["Latin capital letter O with tilde", "Otilde"],
  ["Latin capital letter O with diaeresis", "Ouml"],
  ["Multiplication sign", "times"],
  ["Latin capital letter O with stroke", "Oslash"],
  ["Latin capital letter U with grave", "Ugrave"],
  ["Latin capital letter U with acute", "Uacute"],
  ["Latin capital letter U with circumflex", "Ucirc"],
  ["Latin capital letter U with diaeresis", "Uuml"],
  ["Latin capital letter Y with acute", "Yacute"],
  ["Latin capital letter Thorn", "THORN"],
  ["Latin small letter sharp s", "szlig", ["eszett"]],
  ["Latin small letter a with grave", "agrave"],
  ["Latin small letter a with acute", "aacute"],
  ["Latin small letter a with circumflex", "acirc"],
  ["Latin small letter a with tilde", "atilde"],
  ["Latin small letter a with diaeresis", "auml"],
  ["Latin small letter a with ring above", "aring"],
  ["Latin small letter ae", "aelig"],
  ["Latin small letter c with cedilla", "ccedil"],
  ["Latin small letter e with grave", "egrave"],
  ["Latin small letter e with acute", "eacute"],
  ["Latin small letter e with circumflex", "ecirc"],
  ["Latin small letter e with diaeresis", "euml"],
  ["Latin small letter i with grave", "igrave"],
  ["Latin small letter i with acute", "iacute"],
  ["Latin small letter i with circumflex", "icirc"],
  ["Latin small letter i with diaeresis", "iuml"],
  ["Latin small letter eth", "eth"],
  ["Latin small letter n with tilde", "ntilde"],
  ["Latin small letter o with grave", "ograve"],
  ["Latin small letter o with acute", "oacute"],
  ["Latin small letter o with circumflex", "ocirc"],
  ["Latin small letter o with tilde", "otilde"],
  ["Latin small letter o with diaeresis", "ouml"],
  ["Division sign", "divide"],
  ["Latin small letter o with stroke", "oslash"],
  ["Latin small letter u with grave", "ugrave"],
  ["Latin small letter u with acute", "uacute"],
  ["Latin small letter u with circumflex", "ucirc"],
  ["Latin small letter u with diaeresis", "uuml"],
  ["Latin small letter y with acute", "yacute"],
  ["Latin small letter thorn", "thorn"],
  ["Latin small letter y with diaeresis", "yuml"],
];

/* ------------------------------------------------------------- Windows-1252 */

/**
 * Windows-1252 at 0x80 to 0x9F, from the WHATWG index. Null marks the five
 * bytes Microsoft never assigned; the WHATWG decoder passes those through as
 * the C1 control with the same number.
 */
const CP1252: ([number, string, string] | null)[] = [
  [0x20ac, "Euro sign", "euro"],
  null,
  [0x201a, "Single low-9 quotation mark", "sbquo"],
  [0x0192, "Latin small letter f with hook", "fnof"],
  [0x201e, "Double low-9 quotation mark", "bdquo"],
  [0x2026, "Horizontal ellipsis", "hellip"],
  [0x2020, "Dagger", "dagger"],
  [0x2021, "Double dagger", "Dagger"],
  [0x02c6, "Modifier letter circumflex accent", "circ"],
  [0x2030, "Per mille sign", "permil"],
  [0x0160, "Latin capital letter S with caron", "Scaron"],
  [0x2039, "Single left-pointing angle quotation mark", "lsaquo"],
  [0x0152, "Latin capital ligature OE", "OElig"],
  null,
  [0x017d, "Latin capital letter Z with caron", "Zcaron"],
  null,
  null,
  [0x2018, "Left single quotation mark", "lsquo"],
  [0x2019, "Right single quotation mark", "rsquo"],
  [0x201c, "Left double quotation mark", "ldquo"],
  [0x201d, "Right double quotation mark", "rdquo"],
  [0x2022, "Bullet", "bull"],
  [0x2013, "En dash", "ndash"],
  [0x2014, "Em dash", "mdash"],
  [0x02dc, "Small tilde", "tilde"],
  [0x2122, "Trade mark sign", "trade"],
  [0x0161, "Latin small letter s with caron", "scaron"],
  [0x203a, "Single right-pointing angle quotation mark", "rsaquo"],
  [0x0153, "Latin small ligature oe", "oelig"],
  null,
  [0x017e, "Latin small letter z with caron", "zcaron"],
  [0x0178, "Latin capital letter Y with diaeresis", "Yuml"],
];

const CP1252_ALIASES: Record<number, string[]> = {
  0x2018: ["smart quote", "curly quote"],
  0x2019: ["smart quote", "curly quote", "apostrophe"],
  0x201c: ["smart quote", "curly quote"],
  0x201d: ["smart quote", "curly quote"],
  0x2122: ["trademark"],
  0x2013: ["dash"],
  0x2014: ["dash"],
};

/** Code point to Windows-1252 byte, for the characters that only exist in its 0x80 to 0x9F block. */
export const CP1252_REVERSE = new Map<number, number>();
CP1252.forEach((entry, i) => {
  if (entry) CP1252_REVERSE.set(entry[0], 0x80 + i);
});

/* ------------------------------------------------------------- building rows */

function hex(n: number, width = 2): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

/** U+0041 style code point label. */
export function codePointLabel(cp: number): string {
  return `U+${hex(cp, 4)}`;
}

/**
 * HTML parsing (WHATWG, "numeric character reference end state"): &#0;
 * becomes U+FFFD, and a reference to CR or to any control that is not ASCII
 * whitespace is a parse error, although the character is still produced.
 */
function controlHtmlNote(code: number): string | null {
  if (code === 0) return "&#0; is replaced with U+FFFD by every HTML parser.";
  if (code === 9 || code === 10 || code === 12) return null;
  return "A reference to this control is a parse error in HTML.";
}

function asciiRow(code: number): CodeRow {
  const base = {
    code,
    codePoint: code,
    numericRef: `&#${code};`,
    differsInCp1252: false,
    cEscape: C_ESCAPES[code] ?? null,
    entities: ASCII_ENTITIES[code] ?? [],
  };

  if (code < 32 || code === 127) {
    const spec = code === 127 ? { abbr: "DEL", name: "Delete", aliases: ["rubout"] } : C0[code];
    return {
      ...base,
      control: true,
      abbr: spec.abbr,
      name: spec.name,
      caret: `^${String.fromCharCode(code ^ 0x40)}`,
      htmlNote: controlHtmlNote(code),
      note:
        code === 127
          ? "All seven bits set: on paper tape, punching every hole over a character erased it."
          : code === 27
            ? "\\e is a GNU C extension; standard C writes \\x1b or \\033."
            : code === 0
              ? "\\0 is an octal escape with the value zero. C strings end at the first NUL."
              : null,
      aliases: spec.aliases ?? [],
    };
  }

  let name: string;
  let aliases: string[] = [];
  if (code >= 48 && code <= 57) {
    name = `Digit ${DIGIT_NAMES[code - 48]}`;
  } else if (code >= 65 && code <= 90) {
    name = `Latin capital letter ${String.fromCharCode(code)}`;
  } else if (code >= 97 && code <= 122) {
    name = `Latin small letter ${String.fromCharCode(code)}`;
  } else {
    const p = PRINTABLE[code];
    name = p.name;
    aliases = p.aliases ?? [];
  }
  return {
    ...base,
    control: false,
    abbr: code === 32 ? "SP" : null,
    name,
    caret: null,
    htmlNote: null,
    note: code === 63 ? "\\? exists in C so that ?? cannot start a trigraph." : null,
    aliases,
  };
}

function latin1Row(code: number): CodeRow {
  if (code < 0xa0) {
    const spec = C1[code - 0x80];
    const cp1252 = CP1252[code - 0x80];
    return {
      code,
      codePoint: code,
      control: true,
      abbr: spec.abbr,
      name: spec.name,
      caret: null,
      cEscape: null,
      entities: [],
      numericRef: `&#${code};`,
      htmlNote: cp1252
        ? `HTML does not give you this control from &#${code};: the parser maps that reference to ${codePointLabel(cp1252[0])}, the Windows-1252 character.`
        : "A reference to this control is a parse error in HTML.",
      note: C1_FIGMENTS.has(code)
        ? "Proposed in a draft standard but never approved; the name survives only as a Unicode alias."
        : null,
      aliases: spec.aliases ?? [],
      differsInCp1252: cp1252 !== null,
    };
  }
  const [name, entity, aliases] = LATIN1_UPPER[code - 0xa0];
  const invisible = code === 0xa0 || code === 0xad;
  return {
    code,
    codePoint: code,
    control: false,
    abbr: code === 0xa0 ? "NBSP" : code === 0xad ? "SHY" : null,
    name,
    caret: null,
    cEscape: null,
    entities: [entity],
    numericRef: `&#${code};`,
    htmlNote: null,
    note: invisible
      ? code === 0xa0
        ? "Looks like a space but does not match \\x20, so it slips past naive whitespace checks."
        : "Invisible unless a line breaks at it. It can split a keyword without changing how it looks."
      : null,
    aliases: aliases ?? [],
    differsInCp1252: false,
  };
}

function cp1252Row(code: number): CodeRow {
  const entry = CP1252[code - 0x80];
  if (entry === null) {
    return {
      code,
      codePoint: null,
      control: true,
      abbr: "n/a",
      name: "Undefined in Windows-1252",
      caret: null,
      cEscape: null,
      entities: [],
      numericRef: `&#${code};`,
      htmlNote: "A reference to this number is a parse error in HTML and yields the C1 control.",
      note: `Browsers decode this byte as ${codePointLabel(code)}, the C1 control ${C1[code - 0x80].abbr}; strict decoders reject it.`,
      aliases: ["undefined"],
      differsInCp1252: false,
    };
  }
  const [cp, name, entity] = entry;
  return {
    code,
    codePoint: cp,
    control: false,
    abbr: null,
    name,
    caret: null,
    cEscape: null,
    entities: [entity],
    numericRef: `&#${cp};`,
    htmlNote: `&#${code}; also produces it, because HTML maps 128 to 159 through this table, but that form is a parse error.`,
    note: `In Latin-1 and Unicode, ${hex(code)} is the C1 control ${C1[code - 0x80].abbr}.`,
    aliases: CP1252_ALIASES[cp] ?? [],
    differsInCp1252: true,
  };
}

export const ASCII_ROWS: CodeRow[] = Array.from({ length: 128 }, (_, i) => asciiRow(i));
export const LATIN1_ROWS: CodeRow[] = Array.from({ length: 128 }, (_, i) => latin1Row(128 + i));
export const CP1252_ROWS: CodeRow[] = LATIN1_ROWS.map((row) =>
  row.code >= 0x80 && row.code <= 0x9f ? cp1252Row(row.code) : row,
);

/** The rows a charset shows: always 0 to 127, then its upper half. */
export function rowsFor(charset: Charset): CodeRow[] {
  if (charset === "ascii") return ASCII_ROWS;
  return [...ASCII_ROWS, ...(charset === "latin1" ? LATIN1_ROWS : CP1252_ROWS)];
}

/* ------------------------------------------------------------- formatting */

export function toHex(code: number): string {
  return hex(code);
}

export function toOctal(code: number): string {
  return code.toString(8).padStart(3, "0");
}

/** Eight bits, split into nibbles: 0100 0001. */
export function toBinary(code: number): string {
  const bits = code.toString(2).padStart(8, "0");
  return `${bits.slice(0, 4)} ${bits.slice(4)}`;
}

/** The text a glyph cell shows: the character, or its abbreviation when there is nothing visible to draw. */
export function glyphOf(row: CodeRow): string | null {
  if (row.control || row.abbr !== null || row.codePoint === null) return null;
  return String.fromCodePoint(row.codePoint);
}

/** The best HTML form: a named reference when one exists, otherwise the numeric one. */
export function htmlFormOf(row: CodeRow): string {
  return row.entities.length ? `&${row.entities[0]};` : row.numericRef;
}

export type CopyFormat = "char" | "decimal" | "hex" | "binary" | "html" | "escape";

/** What a row puts on the clipboard in each format. */
export function copyValue(row: CodeRow, format: CopyFormat): string {
  switch (format) {
    case "decimal":
      return String(row.code);
    case "hex":
      return `0x${hex(row.code)}`;
    case "binary":
      return row.code.toString(2).padStart(8, "0");
    case "html":
      return htmlFormOf(row);
    case "escape":
      if (row.cEscape && row.code !== 27) return row.cEscape;
      if (!row.control && row.code >= 32 && row.code < 127) return String.fromCharCode(row.code);
      return `\\x${hex(row.code).toLowerCase()}`;
    case "char":
    default:
      return String.fromCodePoint(row.codePoint ?? row.code);
  }
}

/* ------------------------------------------------------------- the case bit */

export function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * The four codes that share the low five bits with this one, one from each
 * column of 32. Bits 6 and 5 pick the column: 00 controls, 01 digits and
 * punctuation, 10 capitals, 11 small letters. Within the upper half the
 * same layout repeats with bit 7 set.
 */
export function columnSiblings(code: number): number[] {
  const base = code & ~0x60 & 0xff;
  return [base, base | 0x20, base | 0x40, base | 0x60];
}

/* ------------------------------------------------------------- search */

export interface Interpretation {
  code: number;
  /** How the query was read: "decimal", "hex", "character" and so on. */
  via: string[];
}

export interface SearchResult {
  /** Exact readings of the query, merged by code, in the order found. */
  interpretations: Interpretation[];
  /** Codes whose name, nickname, abbreviation or entity contains the query. */
  nameMatches: number[];
  /** Readings that fell outside one byte, explained. */
  outOfRange: string[];
  error: string | null;
}

const NUMBER_FORMS: { re: RegExp; radix: number; via: string }[] = [
  { re: /^&#x([0-9a-f]+);?$/i, radix: 16, via: "HTML hex reference" },
  { re: /^&#([0-9]+);?$/, radix: 10, via: "HTML decimal reference" },
  { re: /^(?:u\+|\\u)([0-9a-f]{1,6})$/i, radix: 16, via: "Unicode code point" },
  { re: /^\\u\{([0-9a-f]{1,6})\}$/i, radix: 16, via: "Unicode code point" },
  { re: /^(?:0x|\\x|#x|\$)([0-9a-f]+)$/i, radix: 16, via: "hex" },
  { re: /^([0-9a-f]+)h$/i, radix: 16, via: "hex" },
  { re: /^%([0-9a-f]{2})$/i, radix: 16, via: "URL percent-encoding" },
  { re: /^0o([0-7]+)$/i, radix: 8, via: "octal" },
  { re: /^\\([0-7]{1,3})$/, radix: 8, via: "C octal escape" },
  { re: /^0b([01]+)$/i, radix: 2, via: "binary" },
];

const ESCAPE_TO_CODE: Record<string, number> = {};
for (const [code, esc] of Object.entries(C_ESCAPES)) ESCAPE_TO_CODE[esc] = Number(code);

/** Parse digits that have already matched a radix pattern; anything over 0x10FFFF is simply "too big". */
function parseDigits(digits: string, radix: number): number {
  const trimmed = digits.replace(/^0+(?=.)/, "");
  if (trimmed.length > 24) return Number.POSITIVE_INFINITY;
  return parseInt(trimmed, radix);
}

/**
 * Read a query every way it could be meant. A bare number is ambiguous, so
 * "65" comes back as decimal 65, hex 0x65 and octal 065, each labeled; a
 * single character is that character; anything of two or more characters
 * is also matched against names.
 */
export function searchCodes(query: string, charset: Charset): SearchResult {
  const result: SearchResult = { interpretations: [], nameMatches: [], outOfRange: [], error: null };
  if (query.length > MAX_QUERY_LENGTH) {
    result.error = `Search is limited to ${MAX_QUERY_LENGTH} characters.`;
    return result;
  }
  // A lone space is a real query: the space character.
  const q = query === " " ? " " : query.trim();
  if (q === "") return result;

  const maxCode = charset === "ascii" ? 127 : 255;
  const add = (code: number, via: string) => {
    const existing = result.interpretations.find((i) => i.code === code);
    if (existing) {
      if (!existing.via.includes(via)) existing.via.push(via);
    } else {
      result.interpretations.push({ code, via: [via] });
    }
  };
  const tooBig: string[] = [];
  const addNumber = (value: number, via: string, shown: string) => {
    if (value <= maxCode) add(value, via);
    else if (value <= 255) tooBig.push(`${shown} as ${via} is ${value}, in the upper half: switch to Latin-1 or Windows-1252 to see it.`);
    else tooBig.push(`${shown} as ${via} is ${Number.isFinite(value) ? value.toLocaleString("en-US") : "far"} beyond one byte.`);
  };

  const chars = Array.from(q);

  // One character: the character itself.
  if (chars.length === 1) {
    const cp = q.codePointAt(0) as number;
    if (cp <= maxCode) {
      add(cp, "character");
    } else if (charset === "cp1252" && CP1252_REVERSE.has(cp)) {
      add(CP1252_REVERSE.get(cp) as number, "Windows-1252 character");
    } else if (cp <= 255 || CP1252_REVERSE.has(cp)) {
      const where = cp <= 255 ? "Latin-1 and Windows-1252" : "Windows-1252";
      tooBig.push(`${codePointLabel(cp)} is in ${where}, not in 7-bit ASCII: switch the table to see it.`);
    } else {
      tooBig.push(`${codePointLabel(cp)} is not in ASCII, Latin-1 or Windows-1252.`);
    }
  }

  // Prefixed and suffixed numbers.
  for (const form of NUMBER_FORMS) {
    const m = form.re.exec(q);
    if (m) addNumber(parseDigits(m[1], form.radix), form.via, q);
  }

  // Bare digits: every base they are valid in. Letters a to f alone count as
  // hex only from two characters, so a single "a" stays the letter a.
  if (/^[0-9a-f]+$/i.test(q)) {
    if (/^[0-9]+$/.test(q)) addNumber(parseDigits(q, 10), "decimal", q);
    if (/^[0-7]+$/.test(q)) addNumber(parseDigits(q, 8), "octal", q);
    if (/[0-9]/.test(q) || q.length >= 2) addNumber(parseDigits(q, 16), "hex", q);
    if (/^[01]+$/.test(q)) addNumber(parseDigits(q, 2), "binary", q);
  }

  // Caret notation: ^A is 1, ^? is DEL. Lower case letters work as Ctrl does.
  const caret = /^\^(.)$/.exec(q);
  if (caret) {
    const c = caret[1].toUpperCase().charCodeAt(0);
    if (c === 63) add(127, "caret notation");
    else if (c >= 64 && c <= 95) add(c ^ 0x40, "caret notation");
  }

  // C escapes.
  if (q in ESCAPE_TO_CODE) add(ESCAPE_TO_CODE[q], "C escape");

  // Named HTML references: exact first, then any case.
  const entity = /^&([a-z][a-z0-9]*);?$/i.exec(q);
  const rows = rowsFor(charset);
  if (entity) {
    const name = entity[1];
    const exact = rows.find((r) => r.entities.includes(name));
    const loose = exact ?? rows.find((r) => r.entities.some((e) => e.toLowerCase() === name.toLowerCase()));
    if (loose) add(loose.code, "HTML named reference");
  }

  // Names, from two characters up; one letter would match nearly everything.
  if (chars.length >= 2) {
    const needle = q.toLowerCase();
    for (const row of rows) {
      const hay = [row.name, row.abbr ?? "", row.caret ?? "", row.cEscape ?? "", ...row.aliases, ...row.entities]
        .join("\n")
        .toLowerCase();
      if (hay.includes(needle)) result.nameMatches.push(row.code);
    }
  }

  // Only explain a too-big reading when nothing else matched, so "1000001"
  // shows binary 65 without three lines about the other bases.
  if (result.interpretations.length === 0 && result.nameMatches.length === 0) result.outOfRange = tooBig;
  return result;
}

/** Every code a search touches, sorted, for filtering the table. */
export function matchedCodes(result: SearchResult): Set<number> {
  return new Set([...result.interpretations.map((i) => i.code), ...result.nameMatches]);
}
