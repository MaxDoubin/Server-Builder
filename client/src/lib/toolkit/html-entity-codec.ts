/**
 * HTML character references: encoding, and decoding by the rules a browser
 * uses.
 *
 * Decoding follows the tokenizer in the HTML Living Standard (WHATWG, section
 * 13.2.5, the character reference state and the states after it), not a
 * regular expression. That matters at the edges, which are where the
 * interesting inputs live:
 *
 *   - A named reference takes the longest name in the table that matches,
 *     and 106 legacy names still decode with no semicolon, so "&notit;" is
 *     "¬it;" while "&notin;" is "∉".
 *   - In an attribute value, a legacy name with no semicolon that is
 *     followed by "=" or a letter or digit is left alone, for the sake of
 *     old query strings such as "?a=1&copy=2".
 *   - A numeric reference to NUL, a surrogate or anything past U+10FFFF
 *     becomes U+FFFD, and 0x80 to 0x9F are read as Windows-1252.
 *
 * The full WHATWG table has 2,231 entries. This one embeds the 252 HTML 4.01
 * names, the ASCII punctuation names HTML5 added, a few more in common use,
 * and every name that begins with one of the legacy names. The last group is
 * what keeps longest match exact: without "notin" in the table, "&notin;"
 * would wrongly decode as "&not" followed by "in;". A name outside the table
 * is reported rather than guessed at.
 *
 * Pure functions, no React and no DOM.
 */

/** Characters processed per run. Past this the input is cut and the caller says so. */
export const MAX_INPUT_CHARS = 200_000;
/** References listed individually in the decode report. Totals still count all of them. */
export const MAX_LISTED = 400;
/** Size of the full WHATWG table, for the reader's sense of scale. */
export const HTML5_ENTRY_COUNT = 2231;
export const HTML5_NAME_COUNT = 2125;
export const LEGACY_NAME_COUNT = 106;

/** [name without "&" or ";", code point or code points, 1 when it also decodes with no semicolon] */
type Entry = readonly [string, number | readonly number[], 1?];

/*
 * Generated from the WHATWG entities.json (via Python's html.entities.html5,
 * which carries the same table), values in hex. Order matters: the first
 * name listed for a code point is the one the encoder writes, so the HTML 4
 * names come before the HTML5 aliases.
 */
const TABLE: readonly Entry[] = [
  ["amp", 0x26, 1], ["lt", 0x3C, 1], ["gt", 0x3E, 1], ["quot", 0x22, 1], ["apos", 0x27],
  ["nbsp", 0xA0, 1], ["iexcl", 0xA1, 1], ["cent", 0xA2, 1], ["pound", 0xA3, 1], ["curren", 0xA4, 1],
  ["yen", 0xA5, 1], ["brvbar", 0xA6, 1], ["sect", 0xA7, 1], ["uml", 0xA8, 1], ["copy", 0xA9, 1],
  ["ordf", 0xAA, 1], ["laquo", 0xAB, 1], ["not", 0xAC, 1], ["shy", 0xAD, 1], ["reg", 0xAE, 1],
  ["macr", 0xAF, 1], ["deg", 0xB0, 1], ["plusmn", 0xB1, 1], ["sup2", 0xB2, 1], ["sup3", 0xB3, 1],
  ["acute", 0xB4, 1], ["micro", 0xB5, 1], ["para", 0xB6, 1], ["middot", 0xB7, 1], ["cedil", 0xB8, 1],
  ["sup1", 0xB9, 1], ["ordm", 0xBA, 1], ["raquo", 0xBB, 1], ["frac14", 0xBC, 1], ["frac12", 0xBD, 1],
  ["frac34", 0xBE, 1], ["iquest", 0xBF, 1], ["Agrave", 0xC0, 1], ["Aacute", 0xC1, 1],
  ["Acirc", 0xC2, 1], ["Atilde", 0xC3, 1], ["Auml", 0xC4, 1], ["Aring", 0xC5, 1], ["AElig", 0xC6, 1],
  ["Ccedil", 0xC7, 1], ["Egrave", 0xC8, 1], ["Eacute", 0xC9, 1], ["Ecirc", 0xCA, 1],
  ["Euml", 0xCB, 1], ["Igrave", 0xCC, 1], ["Iacute", 0xCD, 1], ["Icirc", 0xCE, 1], ["Iuml", 0xCF, 1],
  ["ETH", 0xD0, 1], ["Ntilde", 0xD1, 1], ["Ograve", 0xD2, 1], ["Oacute", 0xD3, 1], ["Ocirc", 0xD4, 1],
  ["Otilde", 0xD5, 1], ["Ouml", 0xD6, 1], ["times", 0xD7, 1], ["Oslash", 0xD8, 1],
  ["Ugrave", 0xD9, 1], ["Uacute", 0xDA, 1], ["Ucirc", 0xDB, 1], ["Uuml", 0xDC, 1],
  ["Yacute", 0xDD, 1], ["THORN", 0xDE, 1], ["szlig", 0xDF, 1], ["agrave", 0xE0, 1],
  ["aacute", 0xE1, 1], ["acirc", 0xE2, 1], ["atilde", 0xE3, 1], ["auml", 0xE4, 1], ["aring", 0xE5, 1],
  ["aelig", 0xE6, 1], ["ccedil", 0xE7, 1], ["egrave", 0xE8, 1], ["eacute", 0xE9, 1],
  ["ecirc", 0xEA, 1], ["euml", 0xEB, 1], ["igrave", 0xEC, 1], ["iacute", 0xED, 1], ["icirc", 0xEE, 1],
  ["iuml", 0xEF, 1], ["eth", 0xF0, 1], ["ntilde", 0xF1, 1], ["ograve", 0xF2, 1], ["oacute", 0xF3, 1],
  ["ocirc", 0xF4, 1], ["otilde", 0xF5, 1], ["ouml", 0xF6, 1], ["divide", 0xF7, 1],
  ["oslash", 0xF8, 1], ["ugrave", 0xF9, 1], ["uacute", 0xFA, 1], ["ucirc", 0xFB, 1],
  ["uuml", 0xFC, 1], ["yacute", 0xFD, 1], ["thorn", 0xFE, 1], ["yuml", 0xFF, 1], ["OElig", 0x152],
  ["oelig", 0x153], ["Scaron", 0x160], ["scaron", 0x161], ["Yuml", 0x178], ["fnof", 0x192],
  ["circ", 0x2C6], ["tilde", 0x2DC], ["Alpha", 0x391], ["Beta", 0x392], ["Gamma", 0x393],
  ["Delta", 0x394], ["Epsilon", 0x395], ["Zeta", 0x396], ["Eta", 0x397], ["Theta", 0x398],
  ["Iota", 0x399], ["Kappa", 0x39A], ["Lambda", 0x39B], ["Mu", 0x39C], ["Nu", 0x39D], ["Xi", 0x39E],
  ["Omicron", 0x39F], ["Pi", 0x3A0], ["Rho", 0x3A1], ["Sigma", 0x3A3], ["Tau", 0x3A4],
  ["Upsilon", 0x3A5], ["Phi", 0x3A6], ["Chi", 0x3A7], ["Psi", 0x3A8], ["Omega", 0x3A9],
  ["alpha", 0x3B1], ["beta", 0x3B2], ["gamma", 0x3B3], ["delta", 0x3B4], ["epsilon", 0x3B5],
  ["zeta", 0x3B6], ["eta", 0x3B7], ["theta", 0x3B8], ["iota", 0x3B9], ["kappa", 0x3BA],
  ["lambda", 0x3BB], ["mu", 0x3BC], ["nu", 0x3BD], ["xi", 0x3BE], ["omicron", 0x3BF], ["pi", 0x3C0],
  ["rho", 0x3C1], ["sigmaf", 0x3C2], ["sigma", 0x3C3], ["tau", 0x3C4], ["upsilon", 0x3C5],
  ["phi", 0x3C6], ["chi", 0x3C7], ["psi", 0x3C8], ["omega", 0x3C9], ["thetasym", 0x3D1],
  ["upsih", 0x3D2], ["piv", 0x3D6], ["ensp", 0x2002], ["emsp", 0x2003], ["thinsp", 0x2009],
  ["zwnj", 0x200C], ["zwj", 0x200D], ["lrm", 0x200E], ["rlm", 0x200F], ["ndash", 0x2013],
  ["mdash", 0x2014], ["lsquo", 0x2018], ["rsquo", 0x2019], ["sbquo", 0x201A], ["ldquo", 0x201C],
  ["rdquo", 0x201D], ["bdquo", 0x201E], ["dagger", 0x2020], ["Dagger", 0x2021], ["bull", 0x2022],
  ["hellip", 0x2026], ["permil", 0x2030], ["prime", 0x2032], ["Prime", 0x2033], ["lsaquo", 0x2039],
  ["rsaquo", 0x203A], ["oline", 0x203E], ["frasl", 0x2044], ["euro", 0x20AC], ["image", 0x2111],
  ["weierp", 0x2118], ["real", 0x211C], ["trade", 0x2122], ["alefsym", 0x2135], ["larr", 0x2190],
  ["uarr", 0x2191], ["rarr", 0x2192], ["darr", 0x2193], ["harr", 0x2194], ["crarr", 0x21B5],
  ["lArr", 0x21D0], ["uArr", 0x21D1], ["rArr", 0x21D2], ["dArr", 0x21D3], ["hArr", 0x21D4],
  ["forall", 0x2200], ["part", 0x2202], ["exist", 0x2203], ["empty", 0x2205], ["nabla", 0x2207],
  ["isin", 0x2208], ["notin", 0x2209], ["ni", 0x220B], ["prod", 0x220F], ["sum", 0x2211],
  ["minus", 0x2212], ["lowast", 0x2217], ["radic", 0x221A], ["prop", 0x221D], ["infin", 0x221E],
  ["ang", 0x2220], ["and", 0x2227], ["or", 0x2228], ["cap", 0x2229], ["cup", 0x222A], ["int", 0x222B],
  ["there4", 0x2234], ["sim", 0x223C], ["cong", 0x2245], ["asymp", 0x2248], ["ne", 0x2260],
  ["equiv", 0x2261], ["le", 0x2264], ["ge", 0x2265], ["sub", 0x2282], ["sup", 0x2283],
  ["nsub", 0x2284], ["sube", 0x2286], ["supe", 0x2287], ["oplus", 0x2295], ["otimes", 0x2297],
  ["perp", 0x22A5], ["sdot", 0x22C5], ["lceil", 0x2308], ["rceil", 0x2309], ["lfloor", 0x230A],
  ["rfloor", 0x230B], ["loz", 0x25CA], ["spades", 0x2660], ["clubs", 0x2663], ["hearts", 0x2665],
  ["diams", 0x2666], ["lang", 0x27E8], ["rang", 0x27E9], ["Tab", 0x9], ["NewLine", 0xA],
  ["excl", 0x21], ["num", 0x23], ["dollar", 0x24], ["percnt", 0x25], ["lpar", 0x28], ["rpar", 0x29],
  ["ast", 0x2A], ["plus", 0x2B], ["comma", 0x2C], ["period", 0x2E], ["sol", 0x2F], ["colon", 0x3A],
  ["semi", 0x3B], ["equals", 0x3D], ["quest", 0x3F], ["commat", 0x40], ["lsqb", 0x5B], ["bsol", 0x5C],
  ["rsqb", 0x5D], ["Hat", 0x5E], ["lowbar", 0x5F], ["grave", 0x60], ["lcub", 0x7B], ["verbar", 0x7C],
  ["rcub", 0x7D], ["lbrack", 0x5B], ["rbrack", 0x5D], ["lbrace", 0x7B], ["rbrace", 0x7D],
  ["vert", 0x7C], ["midast", 0x2A], ["NonBreakingSpace", 0xA0], ["ZeroWidthSpace", 0x200B],
  ["NoBreak", 0x2060], ["hyphen", 0x2010], ["dash", 0x2010], ["horbar", 0x2015], ["numsp", 0x2007],
  ["puncsp", 0x2008], ["hairsp", 0x200A], ["emsp13", 0x2004], ["emsp14", 0x2005], ["mldr", 0x2026],
  ["nldr", 0x2025], ["bullet", 0x2022], ["half", 0xBD], ["check", 0x2713], ["cross", 0x2717],
  ["star", 0x2606], ["starf", 0x2605], ["phone", 0x260E], ["female", 0x2640], ["male", 0x2642],
  ["flat", 0x266D], ["natur", 0x266E], ["sharp", 0x266F], ["TRADE", 0x2122], ["caret", 0x2041],
  ["AMP", 0x26, 1], ["COPY", 0xA9, 1], ["GT", 0x3E, 1], ["LT", 0x3C, 1], ["QUOT", 0x22, 1],
  ["REG", 0xAE, 1], ["centerdot", 0xB7], ["copysr", 0x2117], ["divideontimes", 0x22C7],
  ["gtcc", 0x2AA7], ["gtcir", 0x2A7A], ["gtdot", 0x22D7], ["gtlPar", 0x2995], ["gtquest", 0x2A7C],
  ["gtrapprox", 0x2A86], ["gtrarr", 0x2978], ["gtrdot", 0x22D7], ["gtreqless", 0x22DB],
  ["gtreqqless", 0x2A8C], ["gtrless", 0x2277], ["gtrsim", 0x2273], ["ltcc", 0x2AA6],
  ["ltcir", 0x2A79], ["ltdot", 0x22D6], ["lthree", 0x22CB], ["ltimes", 0x22C9], ["ltlarr", 0x2976],
  ["ltquest", 0x2A7B], ["ltrPar", 0x2996], ["ltri", 0x25C3], ["ltrie", 0x22B4], ["ltrif", 0x25C2],
  ["notinE", [0x22F9, 0x338]], ["notindot", [0x22F5, 0x338]], ["notinva", 0x2209],
  ["notinvb", 0x22F7], ["notinvc", 0x22F6], ["notni", 0x220C], ["notniva", 0x220C],
  ["notnivb", 0x22FE], ["notnivc", 0x22FD], ["parallel", 0x2225], ["timesb", 0x22A0],
  ["timesbar", 0x2A31], ["timesd", 0x2A30],
];

export interface NamedRef {
  name: string;
  value: string;
  codePoints: number[];
  /** Decodes without its semicolon. */
  legacy: boolean;
}

export const NAMED_REFS: NamedRef[] = TABLE.map(([name, value, legacy]) => {
  const codePoints = typeof value === "number" ? [value] : [...value];
  return { name, value: String.fromCodePoint(...codePoints), codePoints, legacy: legacy === 1 };
});

/** Tokenizer identifiers: "amp;" for every name, plus "amp" for the legacy ones. */
const BY_IDENTIFIER = new Map<string, NamedRef>();
/** Code point to the name the encoder writes for it. */
const PREFERRED = new Map<number, string>();
let MAX_NAME = 0;
for (const ref of NAMED_REFS) {
  BY_IDENTIFIER.set(`${ref.name};`, ref);
  if (ref.legacy) BY_IDENTIFIER.set(ref.name, ref);
  if (ref.codePoints.length === 1 && !PREFERRED.has(ref.codePoints[0])) PREFERRED.set(ref.codePoints[0], ref.name);
  if (ref.name.length > MAX_NAME) MAX_NAME = ref.name.length;
}

export const TABLE_SIZE = NAMED_REFS.length;

export function namedRefFor(codePoint: number): string | null {
  return PREFERRED.get(codePoint) ?? null;
}

/**
 * The numeric character reference end state's replacement table: a reference
 * to 0x80 to 0x9F is taken to mean the Windows-1252 character at that byte,
 * because that is what pages labeled ISO-8859-1 actually contained. The five
 * bytes Windows-1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) are not
 * in the table and decode to the C1 control itself.
 */
export const C1_REPLACEMENTS: ReadonlyMap<number, number> = new Map([
  [0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026], [0x86, 0x2020],
  [0x87, 0x2021], [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160], [0x8b, 0x2039], [0x8c, 0x0152],
  [0x8e, 0x017d], [0x91, 0x2018], [0x92, 0x2019], [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022],
  [0x96, 0x2013], [0x97, 0x2014], [0x98, 0x02dc], [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a],
  [0x9c, 0x0153], [0x9e, 0x017e], [0x9f, 0x0178],
]);

/* ---------------------------------------------------------------- helpers */

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function isHexDigit(c: number): boolean {
  return isDigit(c) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function isAsciiAlnum(c: number): boolean {
  return isDigit(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** Infra: a C0 control (U+0000 to U+001F) or U+007F to U+009F. */
function isControl(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
}

/** Infra: tab, LF, FF, CR, space. */
function isAsciiWhitespace(cp: number): boolean {
  return cp === 0x09 || cp === 0x0a || cp === 0x0c || cp === 0x0d || cp === 0x20;
}

/** U+FDD0 to U+FDEF, and the last two code points of every plane. */
export function isNoncharacter(cp: number): boolean {
  return (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;
}

function isSurrogate(cp: number): boolean {
  return cp >= 0xd800 && cp <= 0xdfff;
}

export function codePointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/* --------------------------------------------------------------- decoding */

export type DecodeContext = "text" | "attribute";
export type RefKind = "named" | "decimal" | "hex";

/**
 * What happened to one reference, beyond the semicolon. Names follow the
 * standard's parse error names where there is one.
 */
export type RefIssue =
  /** Legacy name, no semicolon, followed by "=" or alphanumeric inside an attribute: left as typed. */
  | "attribute-legacy"
  /** "&name;" where name is not in this table. A browser may know it. */
  | "unknown-name"
  /** "&#" or "&#x" with no digits after it: left as typed. */
  | "no-digits"
  /** &#0; becomes U+FFFD. */
  | "null"
  /** Past U+10FFFF: becomes U+FFFD. */
  | "out-of-range"
  /** U+D800 to U+DFFF: becomes U+FFFD. */
  | "surrogate"
  /** 0x80 to 0x9F read as Windows-1252. */
  | "c1-remapped"
  /** A control character other than whitespace: kept, but a parse error. */
  | "control"
  /** A noncharacter: kept, but a parse error. */
  | "noncharacter";

export interface FoundRef {
  /** Code unit offset of the "&". */
  start: number;
  /** Code unit offset just past the reference. */
  end: number;
  raw: string;
  kind: RefKind;
  /** Whether the reference was replaced. When false, `raw` stays in the output. */
  decoded: boolean;
  /** What went into the output in its place. Equal to raw when not decoded. */
  result: string;
  /** Whether it ended with a semicolon. A decoded reference without one is a parse error. */
  semicolon: boolean;
  issue: RefIssue | null;
  /** Named references: the name matched. */
  name?: string;
}

export interface DecodeResult {
  output: string;
  /** The first MAX_LISTED references found. */
  refs: FoundRef[];
  /** Every reference found, including the ones past MAX_LISTED. */
  total: number;
  decodedCount: number;
  /** References decoded despite a missing semicolon. */
  missingSemicolon: number;
  issues: Partial<Record<RefIssue, number>>;
  truncated: boolean;
}

/** Cuts long input without leaving half of a surrogate pair at the end. */
function cap(input: string): { text: string; truncated: boolean } {
  if (input.length <= MAX_INPUT_CHARS) return { text: input, truncated: false };
  let end = MAX_INPUT_CHARS;
  const c = input.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return { text: input.slice(0, end), truncated: true };
}

/** The numeric character reference end state: what a parsed number turns into. */
export function resolveNumeric(value: number, overflow: boolean): { cp: number; issue: RefIssue | null } {
  if (overflow || value > 0x10ffff) return { cp: 0xfffd, issue: "out-of-range" };
  if (value === 0) return { cp: 0xfffd, issue: "null" };
  if (isSurrogate(value)) return { cp: 0xfffd, issue: "surrogate" };
  if (isNoncharacter(value)) return { cp: value, issue: "noncharacter" };
  if (value === 0x0d || (isControl(value) && !isAsciiWhitespace(value))) {
    const mapped = C1_REPLACEMENTS.get(value);
    if (mapped !== undefined) return { cp: mapped, issue: "c1-remapped" };
    return { cp: value, issue: "control" };
  }
  return { cp: value, issue: null };
}

export function decodeEntities(input: string, context: DecodeContext = "text"): DecodeResult {
  const { text: s, truncated } = cap(input);
  const parts: string[] = [];
  const refs: FoundRef[] = [];
  const issues: Partial<Record<RefIssue, number>> = {};
  let total = 0;
  let decodedCount = 0;
  let missingSemicolon = 0;
  let last = 0;
  let i = 0;

  const record = (ref: FoundRef) => {
    total += 1;
    if (ref.decoded) decodedCount += 1;
    if (ref.decoded && !ref.semicolon) missingSemicolon += 1;
    if (ref.issue) issues[ref.issue] = (issues[ref.issue] ?? 0) + 1;
    if (refs.length < MAX_LISTED) refs.push(ref);
  };

  while (i < s.length) {
    const amp = s.indexOf("&", i);
    if (amp < 0) break;
    const next = s.charCodeAt(amp + 1);

    if (next === 0x23) {
      // Numeric character reference state.
      let j = amp + 2;
      let hex = false;
      if (s[j] === "x" || s[j] === "X") {
        hex = true;
        j += 1;
      }
      const digitsStart = j;
      let value = 0;
      let overflow = false;
      while (j < s.length) {
        const c = s.charCodeAt(j);
        if (hex ? !isHexDigit(c) : !isDigit(c)) break;
        // Keep consuming digits past the range, as the tokenizer does, but
        // stop accumulating so the number cannot lose precision.
        if (!overflow) {
          value = value * (hex ? 16 : 10) + parseInt(s[j], 16);
          if (value > 0x10ffff) overflow = true;
        }
        j += 1;
      }
      if (j === digitsStart) {
        // absence-of-digits-in-numeric-character-reference: flushed as text.
        const raw = s.slice(amp, j);
        record({ start: amp, end: j, raw, kind: hex ? "hex" : "decimal", decoded: false, result: raw, semicolon: false, issue: "no-digits" });
        i = j;
        continue;
      }
      const semicolon = s[j] === ";";
      if (semicolon) j += 1;
      const { cp, issue } = resolveNumeric(value, overflow);
      const result = String.fromCodePoint(cp);
      parts.push(s.slice(last, amp), result);
      last = j;
      record({ start: amp, end: j, raw: s.slice(amp, j), kind: hex ? "hex" : "decimal", decoded: true, result, semicolon, issue });
      i = j;
      continue;
    }

    if (!isAsciiAlnum(next)) {
      // Not a reference at all: the "&" is just text.
      i = amp + 1;
      continue;
    }

    // Named character reference state: longest identifier in the table.
    let runEnd = amp + 1;
    while (runEnd < s.length && isAsciiAlnum(s.charCodeAt(runEnd))) runEnd += 1;
    const runLength = runEnd - amp - 1;
    let match: NamedRef | null = null;
    let matchEnd = amp;
    let semicolon = false;

    if (runLength <= MAX_NAME && s[runEnd] === ";") {
      const ref = BY_IDENTIFIER.get(s.slice(amp + 1, runEnd + 1));
      if (ref) {
        match = ref;
        matchEnd = runEnd + 1;
        semicolon = true;
      }
    }
    if (!match) {
      // Only legacy names exist without a semicolon, so a shorter match can
      // only be one of those.
      for (let len = Math.min(runLength, MAX_NAME); len >= 1; len -= 1) {
        const ref = BY_IDENTIFIER.get(s.slice(amp + 1, amp + 1 + len));
        if (ref) {
          match = ref;
          matchEnd = amp + 1 + len;
          break;
        }
      }
    }

    if (match) {
      const raw = s.slice(amp, matchEnd);
      if (!semicolon && context === "attribute") {
        const after = s.charCodeAt(matchEnd);
        if (after === 0x3d || isAsciiAlnum(after)) {
          // "For historical reasons": flushed as text, and not a parse error.
          record({ start: amp, end: matchEnd, raw, kind: "named", decoded: false, result: raw, semicolon, issue: "attribute-legacy", name: match.name });
          i = matchEnd;
          continue;
        }
      }
      parts.push(s.slice(last, amp), match.value);
      last = matchEnd;
      record({ start: amp, end: matchEnd, raw, kind: "named", decoded: true, result: match.value, semicolon, issue: null, name: match.name });
      i = matchEnd;
      continue;
    }

    // Ambiguous ampersand state: the run is text. Followed by ";" it is an
    // unknown-named-character-reference parse error.
    if (s[runEnd] === ";") {
      const raw = s.slice(amp, runEnd + 1);
      record({ start: amp, end: runEnd + 1, raw, kind: "named", decoded: false, result: raw, semicolon: true, issue: "unknown-name" });
      i = runEnd + 1;
    } else {
      i = runEnd;
    }
  }

  parts.push(s.slice(last));
  return { output: parts.join(""), refs, total, decodedCount, missingSemicolon, issues, truncated };
}

/* --------------------------------------------------------------- encoding */

export type EncodeScope = "markup" | "nonascii" | "all";
export type EncodeFormat = "named" | "decimal" | "hex";

export interface EncodeOptions {
  scope: EncodeScope;
  format: EncodeFormat;
  /** Numeric form for characters that have no name, when format is "named". */
  fallback: "decimal" | "hex";
}

export interface EncodeResult {
  output: string;
  /** Characters (code points) read. */
  characters: number;
  /** References written. */
  encoded: number;
  /** Of those, how many used a name. */
  named: number;
  /** NUL and U+0080 to U+009F found where encoding was asked for, left raw because no reference round-trips them. */
  unencodable: { cp: number; count: number }[];
  /** Lone surrogates, replaced by U+FFFD. */
  loneSurrogates: number;
  truncated: boolean;
}

const MARKUP = new Set([0x26, 0x3c, 0x3e, 0x22, 0x27]);

export function isMarkupSignificant(cp: number): boolean {
  return MARKUP.has(cp);
}

export function numericRef(cp: number, form: "decimal" | "hex"): string {
  return form === "hex" ? `&#x${cp.toString(16).toUpperCase()};` : `&#${cp};`;
}

/** One code point as a reference in the requested format. */
export function referenceFor(cp: number, format: EncodeFormat, fallback: "decimal" | "hex" = "decimal"): string {
  if (format === "named") {
    const name = PREFERRED.get(cp);
    return name ? `&${name};` : numericRef(cp, fallback);
  }
  return numericRef(cp, format);
}

export function encodeEntities(input: string, options: EncodeOptions): EncodeResult {
  const { text, truncated } = cap(input);
  const parts: string[] = [];
  const raw = new Map<number, number>();
  let characters = 0;
  let encoded = 0;
  let named = 0;
  let loneSurrogates = 0;

  for (const ch of text) {
    characters += 1;
    let cp = ch.codePointAt(0) ?? 0;
    let out = ch;
    if (isSurrogate(cp)) {
      // Iterating by code point yields an unpaired surrogate on its own. It
      // has no UTF-8 form and &#xD800; is a parse error that becomes U+FFFD
      // anyway, so write the replacement character honestly.
      loneSurrogates += 1;
      cp = 0xfffd;
      out = "�";
    }
    const wanted =
      options.scope === "all" || MARKUP.has(cp) || (options.scope === "nonascii" && cp >= 0x80);
    if (!wanted) {
      parts.push(out);
      continue;
    }
    if (cp === 0 || (cp >= 0x80 && cp <= 0x9f)) {
      // &#0; decodes to U+FFFD and &#128; to the euro sign, so no reference
      // brings these back. Leave them as they are and say so.
      raw.set(cp, (raw.get(cp) ?? 0) + 1);
      parts.push(out);
      continue;
    }
    const ref = referenceFor(cp, options.format, options.fallback);
    if (ref.charCodeAt(1) !== 0x23) named += 1;
    encoded += 1;
    parts.push(ref);
  }

  return {
    output: parts.join(""),
    characters,
    encoded,
    named,
    unencodable: [...raw.entries()].map(([cp, count]) => ({ cp, count })),
    loneSurrogates,
    truncated,
  };
}

/* ------------------------------------------------------- other contexts */

/** HTML text content: the ampersand and the angle brackets. */
export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A quoted attribute value. Both quotes are escaped so the result is safe
 * between either kind; &#x27; rather than &apos; because &apos; is not an
 * HTML 4 name and some older parsers do not know it.
 */
export function escapeHtmlAttribute(s: string): string {
  return escapeHtmlText(s).replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/**
 * A JavaScript string literal inside a <script> block. Every code unit that
 * is not a letter, digit, space, comma, period or underscore becomes \xHH or
 * \uHHHH, which also covers the quotes, the backslash, "<" (so "</script>"
 * cannot close the block), and U+2028 and U+2029.
 */
export function escapeJsString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (isAsciiAlnum(c) || c === 0x20 || c === 0x2c || c === 0x2e || c === 0x5f) out += s[i];
    else if (c < 0x100) out += `\\x${c.toString(16).toUpperCase().padStart(2, "0")}`;
    else out += `\\u${c.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

/**
 * A URL query value: every byte of the UTF-8 form outside RFC 3986's
 * unreserved set (section 2.3: letters, digits, "-", ".", "_", "~") is
 * percent-encoded. Stricter than encodeURIComponent, which leaves ! ' ( ) *
 * alone, and the apostrophe matters inside a single-quoted attribute.
 */
export function escapeUrlComponent(s: string): { ok: true; value: string } | { ok: false; error: string } {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isSurrogate(cp)) {
      return { ok: false, error: "The text holds an unpaired surrogate, which has no UTF-8 form to percent-encode." };
    }
    if (isAsciiAlnum(cp) || cp === 0x2d || cp === 0x2e || cp === 0x5f || cp === 0x7e) {
      out += ch;
      continue;
    }
    for (const byte of utf8(cp)) out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return { ok: true, value: out };
}

/** RFC 3629 UTF-8 for one scalar value. */
export function utf8(cp: number): number[] {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

/* ------------------------------------------------------------- lookup */

export interface Lookup {
  matches: NamedRef[];
  total: number;
}

/**
 * Finds names by name, by the character itself, or by code point written as
 * U+00E9, 0xE9 or &#233;. Exact name matches first, then prefixes, then
 * names that merely contain the query.
 */
export function lookupNamed(query: string, limit: number): Lookup {
  const q = query.trim();
  if (q === "") return { matches: [], total: 0 };

  let cp: number | null = null;
  const hexForm = /^(?:U\+|0x|&#x)([0-9a-f]{1,6});?$/i.exec(q);
  const decForm = /^&#([0-9]{1,7});?$/.exec(q);
  if (hexForm) cp = parseInt(hexForm[1], 16);
  else if (decForm) cp = parseInt(decForm[1], 10);
  else if ([...q].length === 1 && !isAsciiAlnum(q.charCodeAt(0))) cp = q.codePointAt(0) ?? null;

  if (cp !== null) {
    const hits = NAMED_REFS.filter((ref) => ref.codePoints.length === 1 && ref.codePoints[0] === cp);
    return { matches: hits.slice(0, limit), total: hits.length };
  }

  // Names are case sensitive (&Eacute; is not &eacute;), so an exact match
  // in the case typed ranks above one that differs only in case.
  const typed = q.replace(/^&/, "").replace(/;$/, "");
  const needle = typed.toLowerCase();
  if (needle === "") return { matches: [], total: 0 };
  const exact: NamedRef[] = [];
  const folded: NamedRef[] = [];
  const prefix: NamedRef[] = [];
  const contains: NamedRef[] = [];
  for (const ref of NAMED_REFS) {
    const name = ref.name.toLowerCase();
    if (ref.name === typed) exact.push(ref);
    else if (name === needle) folded.push(ref);
    else if (name.startsWith(needle)) prefix.push(ref);
    else if (name.includes(needle)) contains.push(ref);
  }
  const all = [...exact, ...folded, ...prefix, ...contains];
  return { matches: all.slice(0, limit), total: all.length };
}
