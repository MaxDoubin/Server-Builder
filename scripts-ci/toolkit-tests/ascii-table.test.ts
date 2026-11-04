import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  ASCII_ROWS,
  CP1252_REVERSE,
  CP1252_ROWS,
  LATIN1_ROWS,
  MAX_QUERY_LENGTH,
  columnSiblings,
  copyValue,
  glyphOf,
  htmlFormOf,
  matchedCodes,
  mojibake,
  rowsFor,
  searchCodes,
  toBinary,
  toHex,
  toOctal,
  utf8Bytes,
  byteForCodePoint,
  htmlReferenceCodePoint,
  ENTITY_SYNONYMS,
  type CodeRow,
} from "../../client/src/lib/toolkit/ascii-table.ts";
import * as M2 from "../../client/src/lib/toolkit/ascii-table.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

/* Independent references from Python's standard library. */
const PY = String.raw`
import json, unicodedata, html.entities as h
out = {"names": {}, "entities": {}, "cp1252": {}, "aliases": {}}
for cp in range(32, 256):
    if cp == 127 or 0x80 <= cp < 0xA0: continue
    out["names"][cp] = unicodedata.name(chr(cp))
by_char = {}
for k, v in h.html5.items():
    if not k.endswith(";") or len(v) != 1: continue
    by_char.setdefault(ord(v), []).append(k[:-1])
out["entities"] = by_char
for b in range(0x80, 0xA0):
    try: out["cp1252"][b] = ord(bytes([b]).decode("cp1252"))
    except UnicodeDecodeError: out["cp1252"][b] = None
def check(name, cp):
    try: return unicodedata.lookup(name) == chr(cp)
    except KeyError: return False
import sys
names = json.loads(sys.stdin.read())
out["aliases"] = {str(cp): check(n, int(cp)) for cp, n in names.items()}
print(json.dumps(out))
`;

const aliasQueries: Record<string, string> = {};
for (const row of [...ASCII_ROWS, ...LATIN1_ROWS]) {
  if (row.control) aliasQueries[row.code] = row.code === 7 ? "ALERT" : row.name.toUpperCase();
}
const ref = JSON.parse(
  execFileSync("python3", ["-I", "-c", PY], { input: JSON.stringify(aliasQueries) }).toString(),
) as {
  names: Record<string, string>;
  entities: Record<string, string[]>;
  cp1252: Record<string, number | null>;
  aliases: Record<string, boolean>;
};

const nameCache = new Map<number, string>();
function execName(cp: number): string {
  if (!nameCache.has(cp)) {
    nameCache.set(cp, execFileSync("python3", ["-I", "-c", `import unicodedata;print(unicodedata.name(chr(${cp})))`]).toString().trim());
  }
  return nameCache.get(cp) as string;
}

test("128 ASCII rows, 128 upper rows, codes in order", () => {
  assert.equal(ASCII_ROWS.length, 128);
  assert.equal(LATIN1_ROWS.length, 128);
  assert.equal(CP1252_ROWS.length, 128);
  ASCII_ROWS.forEach((r, i) => assert.equal(r.code, i));
  LATIN1_ROWS.forEach((r, i) => assert.equal(r.code, 128 + i));
  CP1252_ROWS.forEach((r, i) => assert.equal(r.code, 128 + i));
  assert.equal(rowsFor("ascii").length, 128);
  assert.equal(rowsFor("latin1").length, 256);
  assert.equal(rowsFor("cp1252").length, 256);
});

test("control names are Unicode aliases (C0, DEL, C1); BEL's alias is ALERT", () => {
  for (const [cp, ok] of Object.entries(ref.aliases)) assert.ok(ok, `alias for ${cp}`);
  const controls = [...ASCII_ROWS, ...LATIN1_ROWS].filter((r) => r.control).map((r) => r.code);
  assert.equal(controls.length, 32 + 1 + 32);
});

test("printable names match unicodedata.name (ASCII and Latin-1)", () => {
  for (const row of [...ASCII_ROWS, ...LATIN1_ROWS]) {
    if (row.control) continue;
    assert.equal(row.name.toUpperCase(), ref.names[row.code], `name of ${row.code}`);
  }
});

test("control abbreviations, caret notation, C escapes", () => {
  const abbrs = ASCII_ROWS.filter((r) => r.control).map((r) => r.abbr).join(" ");
  assert.equal(
    abbrs,
    "NUL SOH STX ETX EOT ENQ ACK BEL BS HT LF VT FF CR SO SI DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM SUB ESC FS GS RS US DEL",
  );
  assert.equal(ASCII_ROWS[0].caret, "^@");
  assert.equal(ASCII_ROWS[1].caret, "^A");
  assert.equal(ASCII_ROWS[26].caret, "^Z");
  assert.equal(ASCII_ROWS[27].caret, "^[");
  assert.equal(ASCII_ROWS[28].caret, "^\\");
  assert.equal(ASCII_ROWS[29].caret, "^]");
  assert.equal(ASCII_ROWS[30].caret, "^^");
  assert.equal(ASCII_ROWS[31].caret, "^_");
  assert.equal(ASCII_ROWS[127].caret, "^?");
  assert.equal(ASCII_ROWS[65].caret, null);
  const esc = Object.fromEntries(ASCII_ROWS.filter((r) => r.cEscape).map((r) => [r.code, r.cEscape]));
  assert.deepEqual(esc, {
    0: "\\0", 7: "\\a", 8: "\\b", 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r",
    27: "\\e", 34: '\\"', 39: "\\'", 63: "\\?", 92: "\\\\",
  });
  assert.equal(ASCII_ROWS[32].abbr, "SP");
});

test("every listed HTML entity resolves to that character (WHATWG list)", () => {
  const all = [...ASCII_ROWS, ...LATIN1_ROWS, ...CP1252_ROWS];
  for (const row of all) {
    const cp = row.codePoint;
    for (const e of row.entities) {
      assert.ok(cp !== null && (ref.entities[cp] ?? []).includes(e), `&${e}; for ${row.code}`);
    }
  }
});

test("ASCII codes with no listed entity truly have none, and vice versa", () => {
  for (const row of ASCII_ROWS) {
    const has = (ref.entities[row.code] ?? []).length > 0;
    assert.equal(row.entities.length > 0, has, `entity presence for ${row.code}`);
  }
  // Every Latin-1 printable has an entity.
  for (const row of LATIN1_ROWS) if (!row.control) assert.equal(row.entities.length, 1);
  assert.equal(htmlFormOf(ASCII_ROWS[38]), "&amp;");
  assert.equal(htmlFormOf(ASCII_ROWS[65]), "&#65;");
  assert.equal(htmlFormOf(LATIN1_ROWS[0xa9 - 128]), "&copy;");
});

test("HTML notes on controls follow the WHATWG parser", () => {
  assert.match(ASCII_ROWS[0].htmlNote ?? "", /U\+FFFD/);
  for (const c of [9, 10, 12, 32]) assert.equal(ASCII_ROWS[c].htmlNote, null, `${c}`);
  for (const c of [1, 8, 11, 13, 27, 31, 127]) assert.match(ASCII_ROWS[c].htmlNote ?? "", /parse error/, `${c}`);
  assert.match(LATIN1_ROWS[0x96 - 128].htmlNote ?? "", /U\+2013/);
});

test("Windows-1252 matches Python's cp1252 codec, undefined bytes included", () => {
  for (let b = 0x80; b < 0xa0; b++) {
    const row = CP1252_ROWS[b - 128];
    assert.equal(row.codePoint, ref.cp1252[b], `cp1252 ${b.toString(16)}`);
    if (row.codePoint !== null) {
      assert.equal(row.name.toUpperCase(), execName(row.codePoint), `name ${b.toString(16)}`);
      assert.equal(row.differsInCp1252, true);
      assert.equal(row.numericRef, `&#${row.codePoint};`);
    }
  }
  const undefinedBytes = CP1252_ROWS.filter((r) => r.codePoint === null).map((r) => r.code);
  assert.deepEqual(undefinedBytes, [0x81, 0x8d, 0x8f, 0x90, 0x9d]);
  // Upper half identical to Latin-1 from 0xA0.
  for (let b = 0xa0; b <= 0xff; b++) assert.equal(CP1252_ROWS[b - 128], LATIN1_ROWS[b - 128]);
  assert.equal(CP1252_REVERSE.get(0x20ac), 0x80);
  assert.equal(CP1252_REVERSE.size, 27);
  assert.equal(LATIN1_ROWS.filter((r) => r.differsInCp1252).length, 27);
});

test("formatting: hex, octal, binary", () => {
  assert.equal(toHex(65), "41");
  assert.equal(toHex(10), "0A");
  assert.equal(toOctal(65), "101");
  assert.equal(toOctal(8), "010");
  assert.equal(toBinary(65), "0100 0001");
  assert.equal(toBinary(255), "1111 1111");
  assert.equal(toBinary(0), "0000 0000");
});

test("glyphs: controls and invisibles have none", () => {
  assert.equal(glyphOf(ASCII_ROWS[65]), "A");
  assert.equal(glyphOf(ASCII_ROWS[0]), null);
  assert.equal(glyphOf(ASCII_ROWS[32]), null);
  assert.equal(glyphOf(ASCII_ROWS[127]), null);
  assert.equal(glyphOf(LATIN1_ROWS[0xa0 - 128]), null);
  assert.equal(glyphOf(LATIN1_ROWS[0xad - 128]), null);
  assert.equal(glyphOf(LATIN1_ROWS[0xe9 - 128]), "é");
  assert.equal(glyphOf(CP1252_ROWS[0]), "€");
  assert.equal(glyphOf(CP1252_ROWS[1]), null);
  assert.equal(glyphOf(LATIN1_ROWS[0]), null);
});

test("the case bit: upper and lower differ by exactly 0x20", () => {
  for (let c = 65; c <= 90; c++) {
    assert.equal(c ^ 0x20, c + 32);
    assert.equal(String.fromCharCode(c ^ 0x20), String.fromCharCode(c).toLowerCase());
  }
  assert.deepEqual(columnSiblings(65), [1, 33, 65, 97]);
  assert.deepEqual(columnSiblings(97), [1, 33, 65, 97]);
  assert.deepEqual(columnSiblings(0x1b), [0x1b, 0x3b, 0x5b, 0x7b]);
  assert.deepEqual(columnSiblings(0xc9), [0x89, 0xa9, 0xc9, 0xe9]);
  // Caret notation is XOR 0x40.
  for (const r of ASCII_ROWS) if (r.caret) assert.equal(r.caret.charCodeAt(1), r.code ^ 0x40);
});

test("copy formats", () => {
  const A = ASCII_ROWS[65];
  assert.equal(copyValue(A, "char"), "A");
  assert.equal(copyValue(A, "decimal"), "65");
  assert.equal(copyValue(A, "hex"), "0x41");
  assert.equal(copyValue(A, "binary"), "01000001");
  assert.equal(copyValue(A, "html"), "&#65;");
  assert.equal(copyValue(A, "escape"), "A");
  assert.equal(copyValue(ASCII_ROWS[10], "escape"), "\\n");
  assert.equal(copyValue(ASCII_ROWS[27], "escape"), "\\x1b");
  assert.equal(copyValue(ASCII_ROWS[1], "escape"), "\\x01");
  assert.equal(copyValue(ASCII_ROWS[92], "escape"), "\\\\");
  assert.equal(copyValue(ASCII_ROWS[38], "html"), "&amp;");
  assert.equal(copyValue(CP1252_ROWS[0], "char"), "€");
  assert.equal(copyValue(CP1252_ROWS[0], "html"), "&euro;");
  assert.equal(copyValue(CP1252_ROWS[0], "escape"), "\\x80");
  assert.equal(copyValue(CP1252_ROWS[1], "char"), "\u0081");
  assert.equal(copyValue(LATIN1_ROWS[0], "char"), "\u0080");
});

/* ---------------------------------------------------------------- search */

function interp(q: string, cs: "ascii" | "latin1" | "cp1252" = "ascii") {
  const r = searchCodes(q, cs);
  return Object.fromEntries(r.interpretations.map((i) => [i.code, i.via.join("+")]));
}

test("bare numbers read in every valid base", () => {
  assert.deepEqual(interp("65"), { 65: "decimal", 53: "octal", 101: "hex" });
  assert.deepEqual(interp("10"), { 10: "decimal", 8: "octal", 16: "hex", 2: "binary" });
  assert.deepEqual(interp("1000001"), { 65: "binary" });
  assert.deepEqual(interp("7"), { 55: "character", 7: "decimal+octal+hex" });
  assert.deepEqual(interp("0"), { 48: "character", 0: "decimal+octal+hex+binary" });
  assert.deepEqual(interp("1f"), { 31: "hex" });
  const r = searchCodes("99", "ascii");
  assert.deepEqual(interp("99"), { 99: "decimal" });
  assert.equal(r.outOfRange.length, 1);
  assert.match(r.outOfRange[0], /hex is 153/);
  const big = searchCodes("1000001", "ascii");
  assert.equal(big.outOfRange.length, 0);
});

test("prefixed and escaped forms", () => {
  assert.deepEqual(interp("0x41"), { 65: "hex" });
  assert.deepEqual(interp("\\x41"), { 65: "hex" });
  assert.deepEqual(interp("41h"), { 65: "hex" });
  assert.deepEqual(interp("ah"), {});
  assert.deepEqual(interp("$41"), { 65: "hex" });
  assert.deepEqual(interp("0o101"), { 65: "octal" });
  assert.deepEqual(interp("\\101"), { 65: "C octal escape" });
  assert.deepEqual(interp("0b1000001"), { 65: "binary" });
  assert.deepEqual(interp("&#65;"), { 65: "HTML decimal reference" });
  assert.deepEqual(interp("&#x41;"), { 65: "HTML hex reference" });
  assert.deepEqual(interp("U+0041"), { 65: "Unicode code point" });
  assert.deepEqual(interp("\\u0041"), { 65: "Unicode code point" });
  assert.deepEqual(interp("\\u{41}"), { 65: "Unicode code point" });
  assert.deepEqual(interp("%41"), { 65: "URL percent-encoding" });
  assert.deepEqual(interp("%0A"), { 10: "URL percent-encoding" });
  assert.deepEqual(interp("^["), { 27: "caret notation" });
  assert.deepEqual(interp("^a"), { 1: "caret notation" });
  assert.deepEqual(interp("^?"), { 127: "caret notation" });
  assert.deepEqual(interp("^@"), { 0: "caret notation" });
  assert.deepEqual(interp("\\n"), { 10: "C escape" });
  assert.deepEqual(interp("\\0"), { 0: "C octal escape+C escape" });
  assert.deepEqual(interp("&amp;"), { 38: "HTML named reference" });
  assert.deepEqual(interp("&AMP"), { 38: "HTML named reference" });
  assert.deepEqual(interp("&Tab;"), { 9: "HTML named reference" });
  assert.deepEqual(interp("&copy;", "latin1"), { 169: "HTML named reference" });
  assert.deepEqual(interp("&euro;", "cp1252"), { 128: "HTML named reference" });
  assert.deepEqual(interp("&euro;", "latin1"), {});
});

test("single characters", () => {
  assert.deepEqual(interp("A"), { 65: "character" });
  assert.deepEqual(interp("a"), { 97: "character" });
  assert.deepEqual(interp(" "), { 32: "character" });
  assert.deepEqual(interp("é"), {});
  assert.match(searchCodes("é", "ascii").outOfRange[0], /0xE9 in Latin-1/);
  assert.deepEqual(interp("é", "latin1"), { 233: "character" });
  assert.deepEqual(interp("€", "cp1252"), { 128: "Windows-1252 character" });
  assert.match(searchCodes("€", "latin1").outOfRange[0], /byte 0x80 in Windows-1252/);
  assert.match(searchCodes("\u{1F600}", "cp1252").outOfRange[0], /not in ASCII, Latin-1 or Windows-1252/);
  // A raw C1 control in Windows-1252 mode does not land on the euro sign.
  assert.deepEqual(interp("\u0080", "cp1252"), {});
  assert.deepEqual(interp("\u0080", "latin1"), { 128: "character" });
  assert.deepEqual(interp("\u0081", "cp1252"), { 129: "character" });
});

test("names, abbreviations, nicknames and entities", () => {
  const codes = (q: string, cs: "ascii" | "latin1" | "cp1252" = "ascii") => searchCodes(q, cs).nameMatches;
  assert.ok(codes("esc").includes(27));
  assert.ok(codes("escape").includes(27));
  assert.ok(codes("tab").includes(9));
  assert.ok(codes("newline").includes(10));
  assert.ok(codes("xoff").includes(19));
  assert.ok(codes("backslash").includes(92));
  assert.ok(codes("underscore").includes(95));
  assert.ok(codes("backtick").includes(96));
  assert.ok(codes("pipe").includes(124));
  assert.deepEqual(codes("copyright", "latin1"), [169]);
  assert.ok(codes("nbsp", "latin1").includes(160));
  assert.ok(codes("space", "latin1").includes(32) && codes("space", "latin1").includes(160));
  assert.ok(codes("smart quote", "cp1252").includes(0x93));
  assert.deepEqual(codes("smart quote", "latin1"), []);
  assert.ok(codes("FF").includes(12));
  assert.ok(codes("^M").includes(13));
  // One letter does not trigger name search.
  assert.deepEqual(codes("a"), []);
  const m = matchedCodes(searchCodes("ff", "ascii"));
  assert.ok(m.has(12));
});

test("adversarial and empty queries", () => {
  assert.deepEqual(searchCodes("", "ascii"), { interpretations: [], nameMatches: [], outOfRange: [], error: null });
  assert.deepEqual(searchCodes("   ", "ascii").interpretations, []);
  assert.match(searchCodes("x".repeat(MAX_QUERY_LENGTH + 1), "ascii").error ?? "", /limited/);
  const huge = searchCodes("9".repeat(MAX_QUERY_LENGTH), "ascii");
  assert.equal(huge.error, null);
  assert.deepEqual(huge.interpretations, []);
  assert.ok(huge.outOfRange.length >= 1);
  assert.ok(huge.outOfRange.every((s) => !s.includes("NaN")));
  const hexHuge = searchCodes("0x" + "f".repeat(60), "ascii");
  assert.ok(hexHuge.outOfRange.every((s) => !s.includes("NaN")));
  assert.deepEqual(searchCodes("-1", "ascii").interpretations, []);
  assert.deepEqual(searchCodes("\u0000", "ascii").interpretations, [{ code: 0, via: ["character"] }]);
  // Every row of every charset is reachable by its byte value, and by the
  // numeric reference it lists, except where HTML itself cannot produce it:
  // &#0; becomes U+FFFD, and &#128; to &#159; are remapped through
  // Windows-1252 where that table assigns a character.
  for (const cs of ["ascii", "latin1", "cp1252"] as const) {
    for (const row of rowsFor(cs) as CodeRow[]) {
      assert.ok(matchedCodes(searchCodes(`0x${toHex(row.code)}`, cs)).has(row.code), `0x for ${row.code}`);
      const viaRef = matchedCodes(searchCodes(row.numericRef, cs)).has(row.code);
      const unreachable = row.code === 0 || (cs === "latin1" && row.differsInCp1252);
      assert.equal(viaRef, !unreachable, `${row.numericRef} in ${cs}`);
    }
  }
});

test("UTF-8 bytes (RFC 3629) agree with Node's encoder", () => {
  for (const cp of [0, 0x41, 0x7f, 0x80, 0xa9, 0xe9, 0xff, 0x7ff, 0x800, 0x20ac, 0xfffd, 0xffff, 0x10000, 0x1f600, 0x10ffff]) {
    assert.deepEqual(utf8Bytes(cp), [...Buffer.from(String.fromCodePoint(cp), "utf8")], cp.toString(16));
  }
  assert.deepEqual(utf8Bytes(0xe9), [0xc3, 0xa9]);
  assert.deepEqual(utf8Bytes(0x20ac), [0xe2, 0x82, 0xac]);
});

test("mojibake: UTF-8 read as Windows-1252", () => {
  assert.equal(mojibake(0x41), null);
  assert.equal(mojibake(0xe9), "\u00C3\u00A9"); // é -> Ã©
  assert.equal(mojibake(0x20ac), "\u00E2\u201A\u00AC"); // € -> â‚¬
  assert.equal(mojibake(0x2019), "\u00E2\u20AC\u2122"); // ’ -> â€™
  assert.equal(mojibake(0xc1), "\u00C3<81>"); // Á: 0x81 has no Windows-1252 character
  assert.equal(mojibake(0xe0), "\u00C3<A0>"); // à: second byte is NBSP, shown visibly
  // Cross-check against Python for every upper-half code point.
  const py = JSON.parse(
    execFileSync("python3", ["-I", "-c",
      "import json\nout={}\nfor cp in range(0xA0,0x100):\n  b=chr(cp).encode('utf-8')\n  out[cp]=b.decode('cp1252',errors='replace')\nprint(json.dumps(out))"]).toString(),
  ) as Record<string, string>;
  for (const [cp, text] of Object.entries(py)) {
    const mine = mojibake(Number(cp)) as string;
    if (text.includes("\uFFFD") || /[\u00A0\u00AD]/.test(text)) continue;
    assert.equal(mine, text, `mojibake ${cp}`);
  }
});


/* ------------------------------------------------- verifier: independent cases */

test("verifier: ANSI X3.4 reference codes", () => {
  // 'A' 65 = 0x41 = 0o101 = 100 0001; '0' 48; DEL 127 is ^?; ESC 27 is ^[.
  const A = ASCII_ROWS[65];
  assert.equal(toHex(65), "41");
  assert.equal(toOctal(65), "101");
  assert.equal(toBinary(65), "0100 0001");
  assert.equal(A.name, "Latin capital letter A");
  assert.equal(ASCII_ROWS[48].name, "Digit zero");
  assert.equal(ASCII_ROWS[127].abbr, "DEL");
  assert.equal(ASCII_ROWS[127].caret, "^?");
  assert.equal(ASCII_ROWS[27].caret, "^[");
  assert.equal(ASCII_ROWS[0x7e].name, "Tilde");
  assert.deepEqual(columnSiblings(0x40), [0x00, 0x20, 0x40, 0x60]);
  assert.deepEqual(columnSiblings(0x7f), [0x1f, 0x3f, 0x5f, 0x7f]);
  // Digits: low nibble is the value.
  for (let d = 0; d <= 9; d++) assert.equal((48 + d) & 0x0f, d);
});

test("verifier: WHATWG numeric reference substitutions", () => {
  // HTML Standard, numeric character reference end state, table of 0x80..0x9F.
  const table: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
    0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
    0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
    0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
  };
  for (let n = 0x80; n <= 0x9f; n++) assert.equal(htmlReferenceCodePoint(n), table[n] ?? n, n.toString(16));
  assert.equal(htmlReferenceCodePoint(0), 0xfffd);
  assert.equal(htmlReferenceCodePoint(0xd800), 0xfffd);
  assert.equal(htmlReferenceCodePoint(0xdfff), 0xfffd);
  assert.equal(htmlReferenceCodePoint(0x110000), 0xfffd);
  assert.equal(htmlReferenceCodePoint(13), 13);
  assert.equal(htmlReferenceCodePoint(0x10ffff), 0x10ffff);
});

test("verifier: code point to byte per charset", () => {
  assert.equal(byteForCodePoint(0x41, "ascii"), 0x41);
  assert.equal(byteForCodePoint(0xe9, "ascii"), null);
  assert.equal(byteForCodePoint(0xe9, "latin1"), 0xe9);
  assert.equal(byteForCodePoint(0xe9, "cp1252"), 0xe9);
  assert.equal(byteForCodePoint(0x20ac, "cp1252"), 0x80);
  assert.equal(byteForCodePoint(0x20ac, "latin1"), null);
  assert.equal(byteForCodePoint(0x80, "latin1"), 0x80);
  assert.equal(byteForCodePoint(0x80, "cp1252"), null);
  assert.equal(byteForCodePoint(0x81, "cp1252"), 0x81); // unassigned byte, WHATWG passes it through
  assert.equal(byteForCodePoint(0x178, "cp1252"), 0x9f);
  assert.equal(byteForCodePoint(0x100, "latin1"), null);
  assert.equal(byteForCodePoint(-1, "latin1"), null);
  assert.equal(byteForCodePoint(Number.NaN, "latin1"), null);
});

test("verifier: code point and HTML readings follow the charset", () => {
  assert.deepEqual(interp("U+20AC", "cp1252"), { 128: "Unicode code point" });
  assert.deepEqual(interp("&#8364;", "cp1252"), { 128: "HTML decimal reference" });
  assert.deepEqual(interp("&#x20ac;", "cp1252"), { 128: "HTML hex reference" });
  assert.deepEqual(interp("U+0080", "cp1252"), {});
  assert.match(searchCodes("U+0080", "cp1252").outOfRange[0], /C1 control PAD.*U\+20AC/);
  assert.deepEqual(interp("U+0080", "latin1"), { 128: "Unicode code point" });
  assert.deepEqual(interp("\\x80", "cp1252"), { 128: "hex" }); // a byte, not a code point
  assert.deepEqual(interp("%80", "cp1252"), { 128: "URL percent-encoding" });
  // &#150; is the en dash in HTML, never the C1 control SPA.
  assert.deepEqual(interp("&#150;", "latin1"), {});
  assert.match(searchCodes("&#150;", "latin1").outOfRange[0], /U\+2013.*0x96 in Windows-1252/);
  assert.deepEqual(interp("&#150;", "cp1252"), { 150: "HTML decimal reference, mapped through Windows-1252" });
  assert.deepEqual(interp("&#129;", "latin1"), { 129: "HTML decimal reference" });
  assert.deepEqual(interp("&#0;"), {});
  assert.match(searchCodes("&#0;", "ascii").outOfRange[0], /U\+FFFD/);
  assert.match(searchCodes("&#x110000;", "ascii").outOfRange[0], /past U\+10FFFF/);
  assert.match(searchCodes("U+FFFFFF", "ascii").outOfRange[0], /past U\+10FFFF/);
  // A raw C1 control typed in ASCII mode does not claim a Windows-1252 byte.
  assert.match(searchCodes("\u0080", "ascii").outOfRange[0], /Windows-1252 has no such character/);
  assert.match(searchCodes("\u0081", "ascii").outOfRange[0], /unassigned/);
  // Named reference outside the rows showing is explained.
  assert.match(searchCodes("&nbsp;", "ascii").outOfRange[0], /0xA0/);
  assert.match(searchCodes("&euro;", "latin1").outOfRange[0], /0x80 in Windows-1252/);
});

test("verifier: caret notation only folds ASCII letters", () => {
  assert.deepEqual(interp("^ß"), {}); // sharp s upper-cases to SS
  assert.deepEqual(interp("^ſ"), {}); // long s upper-cases to S
  assert.deepEqual(interp("^ı"), {}); // dotless i upper-cases to I
  assert.deepEqual(interp("^z"), { 26: "caret notation" });
  assert.deepEqual(interp("^_"), { 31: "caret notation" });
  assert.deepEqual(interp("^\\"), { 28: "caret notation" });
  assert.deepEqual(interp("^{"), {});
});

test("verifier: C escapes and octal escapes", () => {
  assert.deepEqual(interp("\\a"), { 7: "C escape" });
  assert.deepEqual(interp("\\e"), { 27: "C escape" });
  assert.deepEqual(interp("\\?"), { 63: "C escape" });
  assert.deepEqual(interp("\\033"), { 27: "C octal escape" });
  assert.deepEqual(interp("\\177"), { 127: "C octal escape" });
  assert.match(searchCodes("\\377", "ascii").outOfRange[0], /255, in the upper half/);
  assert.deepEqual(interp("\\377", "latin1"), { 255: "C octal escape" });
  assert.deepEqual(interp(" 0x41 "), { 65: "hex" });
  assert.deepEqual(interp("%E9", "latin1"), { 233: "URL percent-encoding" });
  assert.equal(copyValue(LATIN1_ROWS[0xe9 - 128], "escape"), "\\xe9");
});

test("verifier: RFC 3629 section 7 examples and classic mojibake", () => {
  // "A<NOT IDENTICAL TO><ALPHA>." is 41 E2 89 A2 CE 91 2E
  assert.deepEqual([0x41, 0x2262, 0x391, 0x2e].flatMap(utf8Bytes), [0x41, 0xe2, 0x89, 0xa2, 0xce, 0x91, 0x2e]);
  assert.deepEqual([0xd55c, 0xad6d, 0xc5b4].flatMap(utf8Bytes), [0xed, 0x95, 0x9c, 0xea, 0xb5, 0xad, 0xec, 0x96, 0xb4]);
  assert.deepEqual([0x65e5, 0x672c, 0x8a9e].flatMap(utf8Bytes), [0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0xe8, 0xaa, 0x9e]);
  assert.deepEqual(utf8Bytes(0x233b4), [0xf0, 0xa3, 0x8e, 0xb4]);
  assert.equal(mojibake(0xfc), "Ã¼"); // u with diaeresis
  assert.equal(mojibake(0xf1), "Ã±"); // n with tilde
  assert.equal(mojibake(0x2014), "â€”"); // the classic three-character garble
});

test("verifier: case bit across the alphabet, and its misuse on brackets", () => {
  for (let c = 0x41; c <= 0x5a; c++) {
    assert.equal(ASCII_ROWS[c | 0x20].name, ASCII_ROWS[c].name.replace("capital", "small").replace(/ ([A-Z])$/, (_, l: string) => ` ${l.toLowerCase()}`));
  }
  assert.equal(String.fromCharCode(0x5b | 0x20), "{");
  assert.equal(String.fromCharCode(0x40 | 0x20), "`");
});

test("verifier: adversarial queries do not throw", () => {
  const nasty = ["\uD800", "\uDFFF", "&#;", "&#x;", "U+", "0x", "%", "%G0", "^", "^^^", "&", "&;", "\\u{}", "\\u{110000}", "0b", "0o8", "h", "0h", "\u0000\u0000", "\u{1F600}\u{1F600}", "9".repeat(64), "&#" + "9".repeat(60) + ";"];
  for (const q of nasty) for (const cs of ["ascii", "latin1", "cp1252"] as const) {
    const r = searchCodes(q, cs);
    assert.equal(r.error, null, q);
    for (const line of r.outOfRange) assert.ok(!/NaN|undefined|Infinity/.test(line), `${q}: ${line}`);
    for (const i of r.interpretations) assert.ok(Number.isInteger(i.code) && i.code >= 0 && i.code <= 255, q);
  }
});


/* ---------------- independent verifier, second pass ---------------- */

test("verifier 2: Object.prototype names are not C escapes", () => {
  for (const q of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "__defineGetter__"]) {
    for (const cs of ["ascii", "latin1", "cp1252"] as const) {
      const r = searchCodes(q, cs);
      assert.ok(!r.interpretations.some((i) => i.via.includes("C escape")), `${q} read as a C escape`);
      for (const i of r.interpretations) assert.ok(Number.isInteger(i.code), `${q}: non-integer code`);
      for (const c of matchedCodes(r)) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255, `${q}: matched ${String(c)}`);
    }
  }
});

test("verifier 2: row names plus synonyms are exactly the WHATWG single-character names", () => {
  // Python's html.entities.html5 is the WHATWG list. Compare names with a semicolon.
  const want = new Map<number, Set<string>>();
  for (const [cp, names] of Object.entries(ref.entities)) want.set(Number(cp), new Set(names));
  const got = new Map<number, Set<string>>();
  const put = (cp: number, n: string) => {
    if (!got.has(cp)) got.set(cp, new Set());
    (got.get(cp) as Set<string>).add(n);
  };
  const tableCps = new Set<number>();
  for (const row of [...ASCII_ROWS, ...LATIN1_ROWS, ...CP1252_ROWS]) {
    if (row.codePoint === null) continue;
    tableCps.add(row.codePoint);
    for (const e of row.entities) put(row.codePoint, e);
  }
  for (const [name, cp] of ENTITY_SYNONYMS) {
    assert.ok((want.get(cp) ?? new Set()).has(name), `&${name}; is not U+${cp.toString(16)}`);
    put(cp, name);
  }
  for (const cp of tableCps) {
    const w = [...(want.get(cp) ?? [])].sort().join(" ");
    const g = [...(got.get(cp) ?? [])].sort().join(" ");
    assert.equal(g, w, `names for U+${cp.toString(16)}`);
  }
});

test("verifier 2: entity names are case sensitive", () => {
  assert.deepEqual(interp("&AMP;"), { 38: "HTML named reference" });
  assert.deepEqual(interp("&amp"), { 38: "HTML named reference" });
  assert.deepEqual(interp("&Amp;"), { 38: "HTML named reference, ignoring case" });
  assert.deepEqual(interp("&COPY;", "latin1"), { 169: "HTML named reference" });
  assert.deepEqual(interp("&COPY;", "ascii"), {});
  assert.match(searchCodes("&COPY;", "ascii").outOfRange[0], /0xA9/);
  assert.deepEqual(interp("&mldr;", "cp1252"), { 0x85: "HTML named reference" });
  assert.match(searchCodes("&mldr;", "latin1").outOfRange[0], /0x85 in Windows-1252/);
  assert.deepEqual(interp("&CloseCurlyQuote;", "cp1252"), { 0x92: "HTML named reference" });
  assert.deepEqual(interp("&midast;"), { 42: "HTML named reference" });
});

test("verifier 2: ANSI X3.4 chart values for ESC, DEL, space, tilde, digits", () => {
  // From the standard's 8 x 16 chart (column/row): ESC 1/11, SP 2/0, 0 3/0, ~ 7/14, DEL 7/15.
  const cases: [number, string, string, string, string | null][] = [
    [27, "1B", "033", "0001 1011", "ESC"],
    [32, "20", "040", "0010 0000", "SP"],
    [48, "30", "060", "0011 0000", null],
    [126, "7E", "176", "0111 1110", null],
    [127, "7F", "177", "0111 1111", "DEL"],
  ];
  for (const [code, h, o, b, abbr] of cases) {
    assert.equal(toHex(code), h);
    assert.equal(toOctal(code), o);
    assert.equal(toBinary(code), b);
    assert.equal(ASCII_ROWS[code].abbr, abbr);
  }
  // Every C0 control's caret form is ^ followed by code + 64.
  for (let c = 0; c < 32; c++) assert.equal(ASCII_ROWS[c].caret, `^${String.fromCharCode(c + 64)}`);
  // The same character from five directions.
  for (const q of ["0x1B", "\\x1b", "\\033", "^[", "\\e", "27", "%1B", "&#27;", "&#x1b;", "U+001B", "0b11011", "1Bh", "$1B"]) {
    assert.ok(searchCodes(q, "ascii").interpretations.some((i) => i.code === 27), q);
  }
});

test("verifier 2: Windows-1252 mojibake of common punctuation", () => {
  // UTF-8 of U+2019 is E2 80 99; read as Windows-1252 that is a-circumflex, euro sign, trade mark sign.
  assert.equal(mojibake(0x2019), "â€™");
  assert.equal(mojibake(0x20ac), "â‚¬");
  assert.equal(mojibake(0xe9), "Ã©");
  assert.equal(mojibake(0x41), null);
  // U+00C1 is C3 81; 0x81 has no Windows-1252 character, so it is shown as <81>.
  assert.equal(mojibake(0xc1), "Ã<81>");
  // Python's cp1252 codec as the oracle (Node 22's TextDecoder treats windows-1252 as Latin-1).
  for (const cp of [0x2019, 0x201c, 0x2026, 0xe9, 0xfc, 0x20ac, 0x2122]) {
    const py = execFileSync("python3", ["-I", "-c", `import sys;sys.stdout.write(chr(${cp}).encode("utf-8").decode("cp1252"))`]).toString();
    assert.equal(mojibake(cp), py, cp.toString(16));
  }
});

test("verifier 2: bare numbers and their bases", () => {
  // "65" is decimal 65 (A), octal 065 = 53 (5), hex 0x65 = 101 (e).
  assert.deepEqual(interp("65"), { 65: "decimal", 53: "octal", 101: "hex" });
  // "7F" is hex only; "777" octal is 511, outside one byte.
  assert.deepEqual(interp("7F"), { 127: "hex" });
  assert.deepEqual(interp("0"), { 48: "character", 0: "decimal+octal+hex+binary" });
  const big = searchCodes("256", "latin1");
  assert.deepEqual(big.interpretations.map((i) => i.code).sort((a, b) => a - b), [174]);
  assert.ok(big.outOfRange.length === 0);
  assert.equal(searchCodes("x".repeat(MAX_QUERY_LENGTH + 1), "ascii").error, `Search is limited to ${MAX_QUERY_LENGTH} characters.`);
});

test("verifier 2: copy values", () => {
  assert.equal(copyValue(ASCII_ROWS[27], "escape"), "\\x1b");
  assert.equal(copyValue(ASCII_ROWS[10], "escape"), "\\n");
  assert.equal(copyValue(ASCII_ROWS[0], "html"), "&#0;");
  assert.equal(copyValue(ASCII_ROWS[60], "html"), "&lt;");
  assert.equal(copyValue(CP1252_ROWS[0x80 - 128], "html"), "&euro;");
  assert.equal(copyValue(CP1252_ROWS[0x80 - 128], "char"), "€");
  assert.equal(copyValue(ASCII_ROWS[5], "binary"), "00000101");
  assert.equal(copyValue(LATIN1_ROWS[0xff - 128], "hex"), "0xFF");
});


/* ---------------------------------------------------------------- verifier 3 */

test("verifier 3: out-of-range numbers are reported exactly, past 2^53 too", () => {
  // 2^64 and 2^96 - 1, written out by hand.
  const a = searchCodes("18446744073709551616", "ascii");
  assert.ok(a.outOfRange.some((l) => l.includes("as decimal is 18,446,744,073,709,551,616,")));
  const b = searchCodes("0x" + "f".repeat(24), "ascii");
  assert.deepEqual(b.outOfRange, ["0x" + "f".repeat(24) + " as hex is 79,228,162,514,264,337,593,543,950,335, beyond one byte."]);
  const c = searchCodes("9".repeat(64), "ascii");
  assert.ok(c.outOfRange.some((l) => l.includes("as decimal is 9,999,999,999,")));
  for (const line of [...a.outOfRange, ...b.outOfRange, ...c.outOfRange]) assert.ok(!/e\+|NaN|Infinity|far/.test(line), line);
  // Leading zeros do not change the value or the reading.
  assert.deepEqual(searchCodes("0x" + "0".repeat(60) + "41", "ascii").interpretations, [{ code: 65, via: ["hex"] }]);
});

test("verifier 3: a prefix pins the base", () => {
  assert.deepEqual(searchCodes("0b1", "ascii"), { interpretations: [{ code: 1, via: ["binary"] }], nameMatches: [], outOfRange: [], error: null });
  assert.deepEqual(searchCodes("0B1000001", "ascii").interpretations, [{ code: 65, via: ["binary"] }]);
  assert.deepEqual(searchCodes("0b11111111", "ascii").outOfRange, ["0b11111111 as binary is 255, in the upper half. Show Latin-1 or Windows-1252 to see it."]);
  // Bare digits still read in every base.
  assert.deepEqual(searchCodes("10", "ascii").interpretations.map((i) => [i.code, i.via]), [
    [10, ["decimal"]], [8, ["octal"]], [16, ["hex"]], [2, ["binary"]],
  ]);
});

test("verifier 3: a combining sequence is read as the composed character", () => {
  // e + U+0301 is canonically U+00E9; A + U+030A is U+00C5 (Unicode NFC).
  assert.deepEqual(searchCodes("e\u0301", "latin1").interpretations, [{ code: 0xe9, via: ["character"] }]);
  assert.deepEqual(searchCodes("A\u030A", "cp1252").interpretations, [{ code: 0xc5, via: ["character"] }]);
  assert.match(searchCodes("e\u0301", "ascii").outOfRange[0], /U\+00E9 is byte 0xE9 in Latin-1/);
  // A lone compatibility character is not folded onto ASCII.
  assert.match(searchCodes("\u212A", "ascii").outOfRange[0], /U\+212A is not in ASCII/);
});

test("verifier 3: names that live in a charset not showing are pointed to", () => {
  assert.deepEqual(searchCodes("euro", "ascii").outOfRange, ["The name matches 1 code in the upper half, 128 to 255. Show Latin-1 or Windows-1252 to see it."]);
  assert.deepEqual(searchCodes("euro", "latin1").outOfRange, ["The name matches 1 code that only Windows-1252 has, at 128 to 159. Show Windows-1252 to see it."]);
  assert.deepEqual(searchCodes("euro", "cp1252").nameMatches, [0x80]);
  assert.match(searchCodes("NEL", "cp1252").outOfRange[0], /only Latin-1 has, the C1 controls/);
  const dash = searchCodes("dash", "ascii");
  assert.deepEqual(dash.nameMatches, [45]);
  assert.match(dash.outOfRange[0], /also matches 2 codes in the upper half/);
});

test("verifier 3: ANSI X3.4 / ISO 646 reference rows", () => {
  const r = (c: number) => ASCII_ROWS[c];
  // Digit zero: 48, 0x30, 060, 0011 0000.
  assert.deepEqual([toHex(48), toOctal(48), toBinary(48), r(48).name], ["30", "060", "0011 0000", "Digit zero"]);
  // Tilde 126 = 0x7E = 0176; DEL 127 = 0x7F = 0177, caret ^?.
  assert.deepEqual([toHex(126), toOctal(126), r(126).name], ["7E", "176", "Tilde"]);
  assert.deepEqual([toOctal(127), r(127).abbr, r(127).caret], ["177", "DEL", "^?"]);
  // Caret notation is the code XOR 0x40 for every C0 control.
  for (let c = 0; c < 32; c++) assert.equal(r(c).caret, "^" + String.fromCharCode(c + 64));
  // ^[ is ESC and ^M is CR, the two everyone meets.
  assert.deepEqual(searchCodes("^[", "ascii").interpretations, [{ code: 27, via: ["caret notation"] }]);
  assert.deepEqual(searchCodes("^m", "ascii").interpretations, [{ code: 13, via: ["caret notation"] }]);
  // The four codes that share the low five bits with [ : ESC ; [ {.
  assert.deepEqual(columnSiblings(0x5b), [0x1b, 0x3b, 0x5b, 0x7b]);
});

test("verifier 3: WHATWG numeric references at the edges of the 1252 table", () => {
  assert.equal(htmlReferenceCodePoint(0x9f), 0x178); // Y with diaeresis
  assert.equal(htmlReferenceCodePoint(0x80), 0x20ac);
  assert.equal(htmlReferenceCodePoint(0x81), 0x81); // not in the table: kept
  assert.equal(htmlReferenceCodePoint(0xa0), 0xa0);
  assert.equal(htmlReferenceCodePoint(0x10ffff), 0x10ffff);
  assert.equal(htmlReferenceCodePoint(0x110000), 0xfffd);
  assert.equal(htmlReferenceCodePoint(0xdfff), 0xfffd);
  assert.deepEqual(searchCodes("&#x9F;", "cp1252").interpretations, [{ code: 0x9f, via: ["HTML hex reference, mapped through Windows-1252"] }]);
});

test("verifier 3: classic mojibake and RFC 3629 boundaries", () => {
  assert.equal(mojibake(0x20ac), "\u00E2\u201A\u00AC"); // euro: E2 82 AC
  assert.equal(mojibake(0x2019), "\u00E2\u20AC\u2122"); // right single quote: E2 80 99
  assert.equal(mojibake(0xfc), "\u00C3\u00BC"); // u with diaeresis: C3 BC
  assert.deepEqual(utf8Bytes(0x7f), [0x7f]);
  assert.deepEqual(utf8Bytes(0x80), [0xc2, 0x80]);
  assert.deepEqual(utf8Bytes(0x7ff), [0xdf, 0xbf]);
  assert.deepEqual(utf8Bytes(0x800), [0xe0, 0xa0, 0x80]);
  assert.deepEqual(utf8Bytes(0xffff), [0xef, 0xbf, 0xbf]);
  assert.deepEqual(utf8Bytes(0x10000), [0xf0, 0x90, 0x80, 0x80]);
  assert.deepEqual(utf8Bytes(0x10ffff), [0xf4, 0x8f, 0xbf, 0xbf]);
});

test("verifier 3: no query of up to 64 characters throws", () => {
  const samples = ["\u0000", "\uD800", "\uDC00x", "&#;", "&#x;", "&;", "^", "^\u00DF", "\\u{}", "\\u{110000}", "%", "%G0", "0o9", "0b2", "U+", "1".repeat(64), "f".repeat(64), "\u0301", "e\u0301\u0301", " ", "\t", "<script>"];
  for (const q of samples) for (const cs of ["ascii", "latin1", "cp1252"] as const) {
    const res = searchCodes(q, cs);
    for (const line of res.outOfRange) assert.ok(!/NaN|undefined|Infinity/.test(line), `${q}: ${line}`);
  }
});

test("verifier 4: independent reference cases", () => {
  const codes = (q: string, cs: "ascii" | "latin1" | "cp1252" = "ascii") => searchCodes(q, cs).interpretations.map((i) => i.code);
  // Caret notation (ECMA-48 / terminal convention): ^@ = 0, ^[ = 27, ^_ = 31, ^? = 127.
  assert.deepEqual(codes("^@"), [0]);
  assert.deepEqual(codes("^["), [27]);
  assert.deepEqual(codes("^_"), [31]);
  assert.deepEqual(codes("^?"), [127]);
  assert.equal(ASCII_ROWS[0].caret, "^@");
  assert.equal(ASCII_ROWS[31].caret, "^_");
  assert.equal(ASCII_ROWS[127].caret, "^?");
  assert.equal(ASCII_ROWS[32].caret, null);
  // Prefixed forms pin the base.
  assert.deepEqual(codes("0x7F"), [127]);
  assert.deepEqual(codes("\\x1b"), [27]);
  assert.deepEqual(codes("\\033"), [27]);
  assert.deepEqual(codes("0b1000001"), [65]);
  assert.deepEqual(codes("0o141"), [97]);
  assert.deepEqual(codes("%7E"), [126]);
  // Bare "101": decimal 101 (e), octal 0101 = 65 (A), binary 101 = 5; hex 0x101 is past a byte.
  assert.deepEqual(codes("101").sort((a, b) => a - b), [5, 65, 101]);
  // Euro: U+20AC is byte 0x80 only in Windows-1252 (WHATWG index).
  assert.deepEqual(codes("U+20AC", "cp1252"), [0x80]);
  assert.deepEqual(codes("U+20AC", "latin1"), []);
  assert.ok(searchCodes("U+20AC", "latin1").outOfRange.some((l) => l.includes("0x80")));
  // HTML maps &#150; through Windows-1252 to U+2013, the en dash at byte 0x96.
  assert.equal(htmlReferenceCodePoint(150), 0x2013);
  assert.deepEqual(codes("&#150;", "cp1252"), [0x96]);
  // C escapes and copy forms.
  assert.equal(copyValue(ASCII_ROWS[27], "escape"), "\\x1b");
  assert.equal(copyValue(ASCII_ROWS[10], "escape"), "\\n");
  assert.equal(copyValue(ASCII_ROWS[127], "escape"), "\\x7f");
  assert.equal(copyValue(ASCII_ROWS[38], "html"), "&amp;");
  assert.equal(copyValue(CP1252_ROWS[0x80 - 128], "char"), "€");
  // Case bit: every letter pair differs by exactly 0x20.
  for (let c = 65; c <= 90; c++) assert.equal(ASCII_ROWS[c].name.toLowerCase().replace("capital", "small"), ASCII_ROWS[c ^ 0x20].name.toLowerCase());
  // Formatting at the byte boundaries.
  assert.equal(toBinary(255), "1111 1111");
  assert.equal(toOctal(255), "377");
  assert.equal(toHex(0), "00");
  // Five unassigned Windows-1252 bytes.
  assert.deepEqual(CP1252_ROWS.filter((r) => r.codePoint === null).map((r) => r.code), [0x81, 0x8d, 0x8f, 0x90, 0x9d]);
  // Over-long query is an error, not a throw.
  assert.ok(searchCodes("x".repeat(MAX_QUERY_LENGTH + 1), "ascii").error);
  assert.doesNotThrow(() => searchCodes("9".repeat(64), "latin1"));
  assert.doesNotThrow(() => searchCodes("0x" + "f".repeat(62), "cp1252"));
});

/* ---- Independent verification cases (second pass, written without reference to the builder's tests) ---- */
{
  const { ASCII_ROWS, LATIN1_ROWS, CP1252_ROWS, MAX_QUERY_LENGTH, byteForCodePoint, columnSiblings, copyValue, glyphOf, htmlFormOf, htmlReferenceCodePoint, matchedCodes, mojibake, rowsFor, searchCodes, toBinary, toHex, toOctal, utf8Bytes } = M2;
  type Charset = M2.Charset;
  const t = test;
  const codes = (q: string, cs: Charset = "ascii") => { const r = searchCodes(q, cs); return [...matchedCodes(r)].sort((a, b) => a - b); };

  t("number formats for all 256 bytes", () => {
    for (let c = 0; c < 256; c++) {
      assert.equal(toHex(c), c.toString(16).toUpperCase().padStart(2, "0"));
      assert.equal(toOctal(c), c.toString(8).padStart(3, "0"));
      assert.equal(toBinary(c).replace(" ", ""), c.toString(2).padStart(8, "0"));
      assert.equal(parseInt(toBinary(c).replace(" ", ""), 2), c);
    }
  });
  t("table shape: 128 + 128, rows indexed by code, control set is exactly 0-31 and 127", () => {
    assert.equal(ASCII_ROWS.length, 128); assert.equal(LATIN1_ROWS.length, 128); assert.equal(CP1252_ROWS.length, 128);
    ASCII_ROWS.forEach((r, i) => assert.equal(r.code, i));
    assert.deepEqual(ASCII_ROWS.filter((r) => r.control).map((r) => r.code), [...Array(32).keys(), 127]);
    assert.equal(rowsFor("ascii").length, 128); assert.equal(rowsFor("latin1").length, 256); assert.equal(rowsFor("cp1252").length, 256);
    rowsFor("cp1252").forEach((r, i) => assert.equal(r.code, i));
  });
  t("case differs by exactly bit 5 for every letter, and only letters", () => {
    for (let c = 65; c <= 90; c++) { assert.equal(c ^ 0x20, c + 32); assert.equal(ASCII_ROWS[c].name.replace("capital", "small").toLowerCase(), ASCII_ROWS[c + 32].name.toLowerCase()); }
    // XOR 0x20 on non-letters: the examples in the notes
    assert.equal(String.fromCharCode("[".charCodeAt(0) ^ 0x20), "{");
    assert.equal(String.fromCharCode("@".charCodeAt(0) ^ 0x20), "`");
    assert.equal(95 ^ 0x20, 127);
  });
  t("caret notation is code XOR 0x40", () => {
    assert.equal(ASCII_ROWS[0].caret, "^@"); assert.equal(ASCII_ROWS[1].caret, "^A"); assert.equal(ASCII_ROWS[13].caret, "^M");
    assert.equal(ASCII_ROWS[27].caret, "^["); assert.equal(ASCII_ROWS[31].caret, "^_"); assert.equal(ASCII_ROWS[127].caret, "^?");
    assert.equal(ASCII_ROWS[32].caret, null); assert.equal(ASCII_ROWS[65].caret, null);
  });
  t("C escapes from C11 6.4.4.4 plus \\0 and GNU \\e", () => {
    const want: Record<number, string> = { 7: "\\a", 8: "\\b", 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r", 34: '\\"', 39: "\\'", 63: "\\?", 92: "\\\\", 0: "\\0", 27: "\\e" };
    for (let c = 0; c < 128; c++) assert.equal(ASCII_ROWS[c].cEscape, want[c] ?? null, `code ${c}`);
  });
  t("HTML references", () => {
    assert.equal(htmlFormOf(ASCII_ROWS[38]), "&amp;"); assert.equal(htmlFormOf(ASCII_ROWS[60]), "&lt;"); assert.equal(htmlFormOf(ASCII_ROWS[62]), "&gt;");
    assert.equal(htmlFormOf(ASCII_ROWS[34]), "&quot;"); assert.equal(htmlFormOf(ASCII_ROWS[39]), "&apos;");
    assert.equal(htmlFormOf(ASCII_ROWS[65]), "&#65;"); assert.equal(htmlFormOf(ASCII_ROWS[0]), "&#0;");
    assert.equal(htmlFormOf(LATIN1_ROWS[0xa0 - 128]), "&nbsp;"); assert.equal(htmlFormOf(LATIN1_ROWS[0xe9 - 128]), "&eacute;");
    assert.equal(htmlFormOf(CP1252_ROWS[0]), "&euro;"); assert.equal(CP1252_ROWS[0].numericRef, "&#8364;");
    assert.equal(htmlFormOf(LATIN1_ROWS[0]), "&#128;"); // in Latin-1 the C1 control has only a numeric form, which HTML reads as the euro
  });
  t("HTML numeric reference substitutions (WHATWG)", () => {
    assert.equal(htmlReferenceCodePoint(0), 0xfffd); assert.equal(htmlReferenceCodePoint(0x80), 0x20ac); assert.equal(htmlReferenceCodePoint(0x81), 0x81);
    assert.equal(htmlReferenceCodePoint(0x96), 0x2013); assert.equal(htmlReferenceCodePoint(0x9f), 0x178); assert.equal(htmlReferenceCodePoint(0xa0), 0xa0);
    assert.equal(htmlReferenceCodePoint(0xd800), 0xfffd); assert.equal(htmlReferenceCodePoint(0xdfff), 0xfffd);
    assert.equal(htmlReferenceCodePoint(0x10ffff), 0x10ffff); assert.equal(htmlReferenceCodePoint(0x110000), 0xfffd);
    assert.equal(htmlReferenceCodePoint(NaN), 0xfffd); assert.equal(htmlReferenceCodePoint(Infinity), 0xfffd);
  });
  t("Windows-1252 0x80-0x9F against Python's cp1252 codec (WHATWG index agrees; Node's TextDecoder does not, it decodes this label as Latin-1)", () => {
    const ref: (number | null)[] = [0x20ac, null, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, null, 0x17d, null, null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, null, 0x17e, 0x178];
    ref.forEach((cp, i) => {
      const b = 0x80 + i; const row = CP1252_ROWS[i];
      assert.equal(row.codePoint, cp, `byte ${b.toString(16)}`);
      assert.equal(row.differsInCp1252, cp !== null);
      assert.equal(LATIN1_ROWS[i].differsInCp1252, cp !== null);
      if (cp !== null) { assert.equal(byteForCodePoint(cp, "cp1252"), b); assert.equal(byteForCodePoint(cp, "latin1"), null); assert.equal(byteForCodePoint(b, "cp1252"), null); }
      else assert.equal(byteForCodePoint(b, "cp1252"), b);
      assert.equal(byteForCodePoint(b, "latin1"), b);
    });
    for (let b = 0xa0; b <= 0xff; b++) { assert.equal(CP1252_ROWS[b - 128].codePoint, b); assert.equal(byteForCodePoint(b, "cp1252"), b); }
  });
  t("UTF-8 encoding matches Node for the full scalar range (excluding surrogates)", () => {
    for (const cp of [0, 0x7f, 0x80, 0x7ff, 0x800, 0xffff, 0x10000, 0x1f600, 0x10ffff, 0x20ac, 0xe9]) {
      assert.deepEqual(utf8Bytes(cp), [...Buffer.from(String.fromCodePoint(cp), "utf8")], `U+${cp.toString(16)}`);
    }
  });
  t("mojibake", () => {
    assert.equal(mojibake(0xe9), "Ã©"); // e-acute read as Windows-1252 is A-tilde, copyright sign
    assert.equal(mojibake(0x20ac), "â‚¬"); // euro: a-circumflex, single low-9 quote, not sign
    assert.equal(mojibake(0x41), null);
    assert.equal(mojibake(0xa0), "Â<A0>");
    assert.equal(mojibake(0x80), "Â€"); // C2 80 -> A-circumflex, euro
    // Python: x.encode('utf8').decode('cp1252', errors='replace') for these code points
    const py: Record<number, string> = { 0xdf: "\u00C3\u0178", 0xff: "\u00C3\u00BF", 0xa9: "\u00C2\u00A9", 0x2014: "\u00E2\u20AC\u201D", 0x2122: "\u00E2\u201E\u00A2", 0x152: "\u00C5\u2019", 0x178: "\u00C5\u00B8" };
    for (const [cp, want] of Object.entries(py)) assert.equal(mojibake(Number(cp)), want, `U+${Number(cp).toString(16)}`);
    assert.equal(mojibake(0x1f600), "\u00F0\u0178\u02DC\u20AC"); // F0 9F 98 80
  });
  t("columnSiblings", () => {
    assert.deepEqual(columnSiblings(0x41), [0x01, 0x21, 0x41, 0x61]);
    assert.deepEqual(columnSiblings(0x1b), [0x1b, 0x3b, 0x5b, 0x7b]);
    assert.deepEqual(columnSiblings(0x7f), [0x1f, 0x3f, 0x5f, 0x7f]);
    assert.deepEqual(columnSiblings(0xe9), [0x89, 0xa9, 0xc9, 0xe9]);
  });
  t("search: published equivalences resolve to one code", () => {
    for (const q of ["A", "65", "0x41", "0X41", "\\x41", "$41", "41h", "041h", "0b1000001", "0o101", "\\101", "%41", "U+0041", "u+41", "\\u0041", "\\u{41}", "&#65;", "&#x41;", "&#X41", "1000001"]) {
      assert.ok(codes(q).includes(65), `${q} -> ${codes(q)}`);
    }
    assert.deepEqual(codes("0x41"), [65]); assert.deepEqual(codes("0b1000001"), [65]); assert.deepEqual(codes("^A"), [1]);
    assert.deepEqual(codes("^?"), [127]); assert.deepEqual(codes("^@"), [0]); assert.deepEqual(codes("\\0"), [0]);
    assert.deepEqual(codes("\\e"), [27]); assert.deepEqual(codes("\\\\"), [92]);
    assert.deepEqual(codes("&amp;"), [38]); assert.deepEqual(codes("&AMP;"), [38]); assert.deepEqual(codes("&NewLine;"), [10]);
    assert.deepEqual(codes("0x7F"), [127]); assert.deepEqual(codes("127"), [87, 127]); // decimal 127, octal 0o127 = 87, hex 0x127 is beyond ASCII
  });
  t("search by name", () => {
    assert.ok(codes("DEL").includes(127)); assert.ok(codes("line feed").includes(10)); assert.ok(codes("xoff").includes(19)); assert.ok(codes("ctrl-c").includes(3));
    assert.ok(codes("backslash").includes(92)); assert.ok(codes("tab").includes(9)); assert.ok(codes("newline").includes(10));
    assert.ok(codes("esc").includes(27));
  });
  t("search in Latin-1 and Windows-1252", () => {
    assert.deepEqual(codes("€", "cp1252"), [0x80]); assert.deepEqual(codes("U+20AC", "cp1252"), [0x80]); assert.deepEqual(codes("&euro;", "cp1252"), [0x80]); assert.deepEqual(codes("&#128;", "cp1252"), [0x80]);
    assert.deepEqual(codes("ÿ", "latin1"), [255]); assert.deepEqual(codes("0xE9", "latin1"), [0xe9]); assert.deepEqual(codes("&eacute;", "cp1252"), [0xe9]);
    assert.deepEqual(codes("\u0080", "latin1"), [0x80]);
    assert.deepEqual(codes("€", "latin1"), []); // not in Latin-1
    assert.deepEqual(codes("U+0080", "cp1252"), []); // C1 PAD does not exist in 1252 (byte 0x80 is the euro)
    assert.deepEqual(codes("U+0081", "cp1252"), [0x81]); // unassigned byte decodes to U+0081
  });
  t("search never throws and stays inside the table", () => {
    const pool = ["0", "1", "7", "9", "a", "f", "x", "X", "h", "H", "b", "o", "%", "&", "#", ";", "\\", "^", "U", "+", "u", "{", "}", " ", "\t", "é", "\uD800", "\u{1F600}", "́", "K", "ı", "ß", "\u0000", "‮", "constructor", "__proto__", "toString"];
    let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 20000; i++) {
      let s = ""; const len = Math.floor(rnd() * 14);
      for (let j = 0; j < len; j++) s += pool[Math.floor(rnd() * pool.length)];
      for (const cs of ["ascii", "latin1", "cp1252"] as Charset[]) {
        const r = searchCodes(s, cs); const max = cs === "ascii" ? 127 : 255;
        for (const m of matchedCodes(r)) assert.ok(Number.isInteger(m) && m >= 0 && m <= max, `${JSON.stringify(s)} ${cs} -> ${m}`);
      }
    }
    for (const s of ["constructor", "__proto__", "hasOwnProperty", "toString", "valueOf", "&constructor;", "\\constructor"]) assert.doesNotThrow(() => searchCodes(s, "ascii"));
  });
  t("search limits", () => {
    assert.ok(searchCodes("x".repeat(MAX_QUERY_LENGTH + 1), "ascii").error);
    assert.equal(searchCodes("x".repeat(MAX_QUERY_LENGTH), "ascii").error, null);
    const t0 = Date.now(); for (const q of ["9".repeat(64), "f".repeat(64), "0x" + "f".repeat(62), "&#" + "9".repeat(60) + ";", "U+" + "f".repeat(6), "a".repeat(64), "\\u{" + "0".repeat(50) + "}"]) for (const cs of ["ascii", "latin1", "cp1252"] as Charset[]) searchCodes(q, cs);
    assert.ok(Date.now() - t0 < 1000);
    assert.deepEqual(codes(""), []); assert.deepEqual(codes("\t "), []);
  });
  t("copy values", () => {
    assert.equal(copyValue(ASCII_ROWS[65], "decimal"), "65"); assert.equal(copyValue(ASCII_ROWS[65], "hex"), "0x41"); assert.equal(copyValue(ASCII_ROWS[65], "binary"), "01000001");
    assert.equal(copyValue(ASCII_ROWS[65], "char"), "A"); assert.equal(copyValue(ASCII_ROWS[65], "escape"), "A"); assert.equal(copyValue(ASCII_ROWS[7], "escape"), "\\a");
    assert.equal(copyValue(ASCII_ROWS[1], "escape"), "\\x01"); assert.equal(copyValue(ASCII_ROWS[92], "escape"), "\\\\");
    assert.equal(copyValue(CP1252_ROWS[0x81 - 128], "char"), "\u0081"); assert.equal(copyValue(LATIN1_ROWS[0xe9 - 128], "char"), "é");
    assert.equal(glyphOf(ASCII_ROWS[32]), null); assert.equal(glyphOf(ASCII_ROWS[65]), "A"); assert.equal(glyphOf(LATIN1_ROWS[0xa0 - 128]), null);
  });


  t("a single whitespace character is a query, not an empty search", () => {
    assert.equal(M2.normalizeQuery(" "), " "); assert.equal(M2.normalizeQuery("\u00A0"), "\u00A0"); assert.equal(M2.normalizeQuery("  a "), "a");
    assert.equal(M2.normalizeQuery("\t"), "\t"); assert.equal(M2.normalizeQuery("   "), ""); assert.equal(M2.normalizeQuery(""), "");
    assert.deepEqual(codes("\u00A0", "latin1"), [0xa0]); assert.deepEqual(codes("\u00A0", "cp1252"), [0xa0]); assert.deepEqual(codes(" "), [32]);
    assert.deepEqual(codes("\t"), [9]); assert.deepEqual(codes("\uFEFF", "latin1"), []);
    const r = searchCodes("\u00A0", "ascii"); assert.ok(r.outOfRange.length === 1 && /0xA0/.test(r.outOfRange[0]));
  });
}

console.log(`ascii-table: ${passed} tests passed`);
