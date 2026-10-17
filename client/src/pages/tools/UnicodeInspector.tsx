/**
 * Unicode inspector.
 *
 * Breaks text into code points and reports each one: general category and
 * script (from Unicode property escapes built into the regular expression
 * engine), UTF-8 and UTF-16BE bytes, and whether it is invisible, a
 * bidirectional control, a tag character carrying hidden ASCII, a lookalike
 * of an ASCII letter, or a form that normalization changes. Full character
 * names live in the Unicode Character Database, which is too large to bundle,
 * so the category and script stand in for them except for the characters
 * that matter most here. The lookalike table is a subset of the Unicode
 * confusables list, not the whole thing.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Severity = "high" | "medium" | "low";

interface Flag {
  key: string;
  label: string;
}

interface CharInfo {
  index: number;
  ch: string;
  cp: number;
  gc: string;
  gcLabel: string;
  script: string;
  utf8: string;
  utf16: string;
  visible: string;
  flags: Flag[];
}

interface TokenInfo {
  token: string;
  scripts: string[];
  skeleton: string;
  severity: Severity;
  reason: string;
}

interface FlagTotal {
  key: string;
  title: string;
  severity: Severity;
  count: number;
  first: number;
  glyph: string;
  sample: string;
}

interface Analysis {
  truncated: boolean;
  chars: CharInfo[];
  codeUnits: number;
  utf8Bytes: number;
  graphemes: number;
  asciiCount: number;
  nfc: string;
  nfkc: string;
  nfcDiffers: boolean;
  nfkcDiffers: boolean;
  stripped: string;
  escaped: string;
  skeleton: string;
  hidden: string;
  tokens: TokenInfo[];
  flagTotals: FlagTotal[];
  scripts: Array<{ name: string; count: number }>;
}

const MAX_CHARS = 20000;
const ROW_STEP = 500;

const EXAMPLES: Array<{ label: string; value: string }> = [
  { label: "Zero-width", value: "pay\u200bpal.com/log\u200din" },
  { label: "Bidi override", value: "user\u202e\u2066 // check admin\u2069 \u2066 end" },
  { label: "Homograph", value: "Sign in at p\u0430yp\u0430l.com for the \u0430ccount review" },
  { label: "Tag smuggling", value: "Hello there\u{e0068}\u{e0069}" },
  { label: "NFC vs NFD", value: "cafe\u0301 and \ufb01le" },
];

/* General category labels, tested with \p{..} property escapes. */
const GC_NAMES: Array<[string, string]> = [
  ["Lu", "Uppercase letter"], ["Ll", "Lowercase letter"], ["Lt", "Titlecase letter"],
  ["Lm", "Modifier letter"], ["Lo", "Other letter"], ["Mn", "Nonspacing mark"],
  ["Mc", "Spacing mark"], ["Me", "Enclosing mark"], ["Nd", "Decimal digit"],
  ["Nl", "Letter number"], ["No", "Other number"], ["Pc", "Connector punctuation"],
  ["Pd", "Dash punctuation"], ["Ps", "Open punctuation"], ["Pe", "Close punctuation"],
  ["Pi", "Initial quote"], ["Pf", "Final quote"], ["Po", "Other punctuation"],
  ["Sm", "Math symbol"], ["Sc", "Currency symbol"], ["Sk", "Modifier symbol"],
  ["So", "Other symbol"], ["Zs", "Space separator"], ["Zl", "Line separator"],
  ["Zp", "Paragraph separator"], ["Cc", "Control"], ["Cf", "Format"],
  ["Cs", "Surrogate"], ["Co", "Private use"], ["Cn", "Unassigned"],
];

const GC_TESTS = GC_NAMES.map(([code, label]) => ({
  code,
  label,
  re: new RegExp(`^\\p{${code}}$`, "u"),
}));

const SCRIPT_NAMES = [
  "Latin", "Greek", "Cyrillic", "Armenian", "Hebrew", "Arabic", "Devanagari",
  "Thai", "Georgian", "Hangul", "Hiragana", "Katakana", "Han", "Common", "Inherited",
];

const SCRIPT_TESTS = SCRIPT_NAMES.map((name) => ({
  name,
  re: new RegExp(`^\\p{Script=${name}}$`, "u"),
}));

/* Names for the characters that most often matter in analysis. */
const NAMES: Record<number, string> = {
  0x00a0: "NO-BREAK SPACE",
  0x00ad: "SOFT HYPHEN",
  0x034f: "COMBINING GRAPHEME JOINER",
  0x061c: "ARABIC LETTER MARK",
  0x115f: "HANGUL CHOSEONG FILLER",
  0x1160: "HANGUL JUNGSEONG FILLER",
  0x1680: "OGHAM SPACE MARK",
  0x180e: "MONGOLIAN VOWEL SEPARATOR",
  0x2000: "EN QUAD",
  0x2001: "EM QUAD",
  0x2002: "EN SPACE",
  0x2003: "EM SPACE",
  0x2004: "THREE-PER-EM SPACE",
  0x2005: "FOUR-PER-EM SPACE",
  0x2006: "SIX-PER-EM SPACE",
  0x2007: "FIGURE SPACE",
  0x2008: "PUNCTUATION SPACE",
  0x2009: "THIN SPACE",
  0x200a: "HAIR SPACE",
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0x200e: "LEFT-TO-RIGHT MARK",
  0x200f: "RIGHT-TO-LEFT MARK",
  0x2028: "LINE SEPARATOR",
  0x2029: "PARAGRAPH SEPARATOR",
  0x202a: "LEFT-TO-RIGHT EMBEDDING",
  0x202b: "RIGHT-TO-LEFT EMBEDDING",
  0x202c: "POP DIRECTIONAL FORMATTING",
  0x202d: "LEFT-TO-RIGHT OVERRIDE",
  0x202e: "RIGHT-TO-LEFT OVERRIDE",
  0x202f: "NARROW NO-BREAK SPACE",
  0x205f: "MEDIUM MATHEMATICAL SPACE",
  0x2060: "WORD JOINER",
  0x2061: "FUNCTION APPLICATION",
  0x2062: "INVISIBLE TIMES",
  0x2063: "INVISIBLE SEPARATOR",
  0x2064: "INVISIBLE PLUS",
  0x2066: "LEFT-TO-RIGHT ISOLATE",
  0x2067: "RIGHT-TO-LEFT ISOLATE",
  0x2068: "FIRST STRONG ISOLATE",
  0x2069: "POP DIRECTIONAL ISOLATE",
  0x2800: "BRAILLE PATTERN BLANK",
  0x3000: "IDEOGRAPHIC SPACE",
  0x3164: "HANGUL FILLER",
  0xfeff: "ZERO WIDTH NO-BREAK SPACE",
  0xffa0: "HALFWIDTH HANGUL FILLER",
  0x17b4: "KHMER VOWEL INHERENT AQ",
  0x17b5: "KHMER VOWEL INHERENT AA",
};

const BIDI = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

const ZERO_WIDTH = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

const INVISIBLE_OTHER = new Set([
  0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x2061, 0x2062, 0x2063, 0x2064,
  0x2800, 0x3164, 0xffa0,
]);

/*
  Lookalikes mapped to the ASCII they imitate. A subset of the Unicode
  confusables list: Cyrillic, Greek, Latin variants, dashes, quotes and
  separators. Fullwidth forms are handled by range in asciiLookalike.
*/
const LOOKALIKE: Record<number, string> = {
  0x0430: "a", 0x0435: "e", 0x043e: "o", 0x0440: "p", 0x0441: "c", 0x0443: "y",
  0x0445: "x", 0x0455: "s", 0x0456: "i", 0x0458: "j", 0x04bb: "h", 0x0501: "d",
  0x04cf: "l", 0x0410: "A", 0x0412: "B", 0x0415: "E", 0x041a: "K", 0x041c: "M",
  0x041d: "H", 0x041e: "O", 0x0420: "P", 0x0421: "C", 0x0422: "T", 0x0425: "X",
  0x0405: "S", 0x0406: "I", 0x0408: "J",
  0x03bf: "o", 0x03b1: "a", 0x03bd: "v", 0x03c1: "p", 0x03b9: "i", 0x03ba: "k",
  0x03b5: "e", 0x03c5: "u", 0x03c7: "x",
  0x0391: "A", 0x0392: "B", 0x0395: "E", 0x0396: "Z", 0x0397: "H", 0x0399: "I",
  0x039a: "K", 0x039c: "M", 0x039d: "N", 0x039f: "O", 0x03a1: "P", 0x03a4: "T",
  0x03a5: "Y", 0x03a7: "X",
  0x0131: "i", 0x017f: "s", 0x0261: "g", 0x01c0: "l", 0x2113: "l", 0x2134: "o",
  0x2010: "-", 0x2011: "-", 0x2012: "-", 0x2013: "-", 0x2212: "-",
  0x2044: "/", 0x2215: "/", 0x2024: ".", 0xfe52: ".",
  0x2018: "'", 0x2019: "'", 0x02bc: "'", 0x201c: '"', 0x201d: '"',
  0x037e: ";", 0x2236: ":",
};

const FLAG_TITLES: Record<string, { title: string; severity: Severity }> = {
  bidi: { title: "Bidirectional control (reorders display)", severity: "high" },
  tag: { title: "Tag character (hidden ASCII)", severity: "high" },
  "zero-width": { title: "Zero-width character", severity: "medium" },
  invisible: { title: "Invisible format character", severity: "medium" },
  control: { title: "Control character", severity: "medium" },
  private: { title: "Private use area", severity: "medium" },
  unassigned: { title: "Unassigned code point", severity: "medium" },
  surrogate: { title: "Lone surrogate", severity: "medium" },
  lookalike: { title: "Lookalike of an ASCII character", severity: "medium" },
  "non-nfc": { title: "Composes with the next character (not NFC)", severity: "low" },
  compat: { title: "Compatibility form (changes under NFKC)", severity: "low" },
  space: { title: "Space variant", severity: "low" },
  "line-sep": { title: "Line or paragraph separator", severity: "low" },
  variation: { title: "Variation selector", severity: "low" },
  combining: { title: "Combining mark", severity: "low" },
};

const ESCAPE_KEYS = new Set([
  "bidi", "tag", "zero-width", "invisible", "control", "private",
  "unassigned", "surrogate", "line-sep", "space",
]);

const STRIP_KEYS = new Set(["bidi", "tag", "zero-width", "invisible", "control"]);

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/* ---------- Helpers ---------- */

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0").toUpperCase();
}

function hexCp(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function gcOf(ch: string): { code: string; label: string } {
  for (const t of GC_TESTS) {
    if (t.re.test(ch)) return { code: t.code, label: t.label };
  }
  return { code: "Cn", label: "Unassigned" };
}

function scriptOf(ch: string): string {
  for (const t of SCRIPT_TESTS) {
    if (t.re.test(ch)) return t.name;
  }
  return "Other";
}

function asciiLookalike(cp: number): string | null {
  const mapped = LOOKALIKE[cp] as string | undefined;
  if (mapped !== undefined) return mapped;
  if (cp >= 0xff01 && cp <= 0xff5e) return String.fromCharCode(cp - 0xfee0);
  return null;
}

function skeletonOf(s: string): string {
  let out = "";
  for (const ch of s) {
    const mapped = asciiLookalike(ch.codePointAt(0) ?? 0);
    out += mapped ?? ch;
  }
  return out;
}

function utf16Hex(cp: number): string {
  const unit = (u: number) => `${hex2((u >> 8) & 0xff)} ${hex2(u & 0xff)}`;
  if (cp >= 0xd800 && cp <= 0xdfff) return unit(cp);
  if (cp <= 0xffff) return unit(cp);
  const v = cp - 0x10000;
  return `${unit(0xd800 + (v >> 10))} ${unit(0xdc00 + (v & 0x3ff))}`;
}

function escapeCp(cp: number): string {
  return `\\u{${cp.toString(16).toUpperCase()}}`;
}

function flagsFor(ch: string, cp: number, gc: string, next: string | undefined): Flag[] {
  const flags: Flag[] = [];
  const name = NAMES[cp];
  if (BIDI.has(cp)) {
    flags.push({ key: "bidi", label: name ?? hexCp(cp) });
  }
  if (cp >= 0xe0000 && cp <= 0xe007f) {
    const hiddenAscii = cp >= 0xe0020 && cp <= 0xe007e ? String.fromCharCode(cp - 0xe0000) : "";
    flags.push({
      key: "tag",
      label: hiddenAscii ? `hidden ASCII "${hiddenAscii}"` : "tag, no ASCII equivalent",
    });
  }
  if (ZERO_WIDTH.has(cp)) flags.push({ key: "zero-width", label: name ?? hexCp(cp) });
  else if (INVISIBLE_OTHER.has(cp)) flags.push({ key: "invisible", label: name ?? hexCp(cp) });
  if (cp >= 0xfe00 && cp <= 0xfe0f) {
    flags.push({ key: "variation", label: `VARIATION SELECTOR-${cp - 0xfdff}` });
  } else if (cp >= 0xe0100 && cp <= 0xe01ef) {
    flags.push({ key: "variation", label: `VARIATION SELECTOR-${cp - 0xe00ef}` });
  }
  if (gc === "Cc" && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) {
    flags.push({ key: "control", label: hexCp(cp) });
  }
  if (cp === 0x2028 || cp === 0x2029) flags.push({ key: "line-sep", label: name ?? hexCp(cp) });
  if (gc === "Zs" && cp !== 0x20) flags.push({ key: "space", label: name ?? hexCp(cp) });
  if (gc === "Co") flags.push({ key: "private", label: hexCp(cp) });
  if (gc === "Cn") flags.push({ key: "unassigned", label: hexCp(cp) });
  if (gc === "Cs") flags.push({ key: "surrogate", label: hexCp(cp) });

  const look = asciiLookalike(cp);
  if (look !== null) {
    flags.push({ key: "lookalike", label: `looks like "${look}"` });
  } else {
    const k = ch.normalize("NFKC");
    if (k !== ch && gc !== "Cs") flags.push({ key: "compat", label: `NFKC gives "${k}"` });
  }
  if (gc === "Mn" || gc === "Mc" || gc === "Me") {
    flags.push({ key: "combining", label: gc });
  }
  if (next !== undefined && gc !== "Cs") {
    const pair = Array.from(ch + next);
    if (pair.length === 2 && Array.from((ch + next).normalize("NFC")).length === 1) {
      const composed = (ch + next).normalize("NFC").codePointAt(0) ?? 0;
      flags.push({ key: "non-nfc", label: `composes to ${hexCp(composed)} with next` });
    }
  }
  return flags;
}

function scriptsOfToken(s: string): string[] {
  const found: string[] = [];
  for (const ch of s) {
    const name = scriptOf(ch);
    if (name === "Common" || name === "Inherited" || name === "Other") continue;
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

function graphemeCount(s: string): number {
  type SegmenterCtor = new (
    locale?: string,
    options?: { granularity: "grapheme" },
  ) => { segment: (input: string) => Iterable<unknown> };
  const Seg = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Seg) return Array.from(s).length;
  return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(s)).length;
}

function analyzeText(raw: string): Analysis {
  const truncated = raw.length > MAX_CHARS;
  const text = truncated ? raw.slice(0, MAX_CHARS) : raw;
  const cps = Array.from(text);
  const encoder = new TextEncoder();
  const chars: CharInfo[] = [];
  let offset = 0;

  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i] ?? "";
    const cp = ch.codePointAt(0) ?? 0;
    const next = cps[i + 1];
    const { code: gc, label: gcLabel } = gcOf(ch);
    const isSurrogate = cp >= 0xd800 && cp <= 0xdfff;
    const utf8 = isSurrogate
      ? "n/a (lone surrogate)"
      : Array.from(encoder.encode(ch), hex2).join(" ");
    const flags = flagsFor(ch, cp, gc, next);
    const escaped = flags.some((f) => ESCAPE_KEYS.has(f.key));
    chars.push({
      index: offset,
      ch,
      cp,
      gc,
      gcLabel,
      script: scriptOf(ch),
      utf8,
      utf16: utf16Hex(cp),
      visible: escaped ? escapeCp(cp) : ch,
      flags,
    });
    offset += ch.length;
  }

  const totals = new Map<string, FlagTotal>();
  for (const c of chars) {
    for (const f of c.flags) {
      const meta = FLAG_TITLES[f.key];
      const existing = totals.get(f.key);
      if (existing) {
        existing.count += 1;
      } else {
        totals.set(f.key, {
          key: f.key,
          title: meta ? meta.title : f.key,
          severity: meta ? meta.severity : "low",
          count: 1,
          first: c.index,
          glyph: c.visible,
          sample: f.label,
        });
      }
    }
  }
  const flagTotals = Array.from(totals.values()).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
  );

  const nfc = text.normalize("NFC");
  const nfkc = text.normalize("NFKC");
  const stripped = chars
    .filter((c) => !c.flags.some((f) => STRIP_KEYS.has(f.key)))
    .map((c) => c.ch)
    .join("");
  const hidden = chars
    .filter((c) => c.cp >= 0xe0020 && c.cp <= 0xe007e)
    .map((c) => String.fromCharCode(c.cp - 0xe0000))
    .join("");

  const tokens: TokenInfo[] = [];
  for (const raw of stripped.split(/\s+/)) {
    if (raw === "") continue;
    const scripts = scriptsOfToken(raw);
    const sk = skeletonOf(raw);
    const hasLatin = scripts.includes("Latin");
    const hasConfusable = scripts.some((s) => s !== "Latin");
    if (hasLatin && scripts.length > 1) {
      const severe = hasLatin && scripts.some((s) => s === "Cyrillic" || s === "Greek" || s === "Armenian");
      tokens.push({
        token: raw,
        scripts,
        skeleton: sk,
        severity: severe ? "high" : "medium",
        reason: "mixed scripts in one word",
      });
    } else if (hasConfusable && sk !== raw && /^[\x00-\x7f]+$/.test(sk) && /[A-Za-z]/.test(sk)) {
      tokens.push({
        token: raw,
        scripts,
        skeleton: sk,
        severity: "high",
        reason: "non-Latin letters that imitate ASCII",
      });
    }
  }

  const scriptCounts = new Map<string, number>();
  for (const c of chars) scriptCounts.set(c.script, (scriptCounts.get(c.script) ?? 0) + 1);
  const scripts = Array.from(scriptCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    truncated,
    chars,
    codeUnits: text.length,
    utf8Bytes: encoder.encode(text).length,
    graphemes: graphemeCount(text),
    asciiCount: chars.filter((c) => c.cp < 0x80).length,
    nfc,
    nfkc,
    nfcDiffers: nfc !== text,
    nfkcDiffers: nfkc !== text,
    stripped,
    escaped: chars.map((c) => c.visible).join(""),
    skeleton: skeletonOf(stripped),
    hidden,
    tokens,
    flagTotals,
    scripts,
  };
}

/* ---------- Presentation ---------- */

const LABEL_CLASS = "mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";
const KICKER_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

function OutputBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="min-w-0">
      <p className={KICKER_CLASS}>{label}</p>
      <div
        data-testid={testId}
        className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
      >
        {value === "" ? <span className="text-[hsl(var(--brand-ash))]">(empty)</span> : value}
      </div>
    </div>
  );
}

/* ---------- Component ---------- */

export function UnicodeInspector() {
  const [text, setText] = useState(EXAMPLES[0]?.value ?? "");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [limit, setLimit] = useState(ROW_STEP);

  const analysis = useMemo(() => analyzeText(text), [text]);
  const flaggedCount = analysis.chars.filter((c) => c.flags.length > 0).length;
  const rows = flaggedOnly ? analysis.chars.filter((c) => c.flags.length > 0) : analysis.chars;
  const shown = rows.slice(0, limit);

  const summary =
    text === ""
      ? "Paste text to inspect it."
      : `${analysis.chars.length} code points, ${flaggedCount} flagged, ${analysis.flagTotals.length} flag kinds.`;

  return (
    <ToolShell slug="unicode-inspector">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Text">
          <label htmlFor="unicode-input" className={LABEL_CLASS}>
            Text to inspect
          </label>
          <textarea
            id="unicode-input"
            data-testid="input-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setLimit(ROW_STEP);
            }}
            rows={5}
            spellCheck={false}
            placeholder="Paste text. Invisible and lookalike characters are reported."
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={KICKER_CLASS}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setText(ex.value);
                  setLimit(ROW_STEP);
                }}
                className={CHIP_CLASS}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Input is read up to {MAX_CHARS.toLocaleString("en-US")} UTF-16 code units. Nothing leaves the page.
          </p>
          {analysis.truncated ? (
            <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
              Input truncated at {MAX_CHARS.toLocaleString("en-US")} UTF-16 code units.
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Summary">
          <dl data-testid="output-summary" className="space-y-2">
            {[
              ["Code points", analysis.chars.length.toLocaleString("en-US")],
              ["UTF-16 code units", analysis.codeUnits.toLocaleString("en-US")],
              ["UTF-8 bytes", analysis.utf8Bytes.toLocaleString("en-US")],
              ["Grapheme clusters", analysis.graphemes.toLocaleString("en-US")],
              ["ASCII", analysis.asciiCount.toLocaleString("en-US")],
              ["Non-ASCII", (analysis.chars.length - analysis.asciiCount).toLocaleString("en-US")],
              ["Flagged code points", flaggedCount.toLocaleString("en-US")],
              ["NFC form", analysis.nfcDiffers ? "differs from input" : "same as input"],
              ["NFKC form", analysis.nfkcDiffers ? "differs from input" : "same as input"],
            ].map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-wrap justify-between gap-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-1">
                <dt className={KICKER_CLASS}>{k}</dt>
                <dd className="min-w-0 break-words text-right font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {analysis.scripts.length > 0 ? (
            <div className="mt-4">
              <p className={KICKER_CLASS}>Scripts</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {analysis.scripts.map((s) => (
                  <li
                    key={s.name}
                    className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                  >
                    {s.name}
                    <span className="text-[hsl(var(--brand-bone))]">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Findings" className="lg:col-span-2">
          <div data-testid="output-findings" className="space-y-5">
            {analysis.flagTotals.length === 0 && analysis.tokens.length === 0 && analysis.hidden === "" ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                No invisible, bidirectional, lookalike or normalization flags.
              </p>
            ) : null}
            {analysis.hidden !== "" ? (
              <div className="rounded-lg border border-[hsl(var(--brand-danger)/0.6)] p-3">
                <p className={KICKER_CLASS}>Hidden ASCII in tag characters</p>
                <p className="mt-2 whitespace-pre-wrap break-all font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
                  {analysis.hidden}
                </p>
              </div>
            ) : null}
            {analysis.flagTotals.length > 0 ? (
              <ul className="space-y-2">
                {analysis.flagTotals.map((f) => (
                  <li
                    key={f.key}
                    className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[f.severity]}`}
                    >
                      {f.severity}
                    </span>
                    <span className="min-w-0 flex-1 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {f.title}
                    </span>
                    <span className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                      {f.count}x, first at index {f.first}: {f.glyph} {f.sample}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {analysis.tokens.length > 0 ? (
              <div>
                <p className={KICKER_CLASS}>Suspicious words</p>
                <ul className="mt-2 space-y-2">
                  {analysis.tokens.map((t, i) => (
                    <li
                      key={`${t.token}-${i}`}
                      className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[t.severity]}`}
                        >
                          {t.severity}
                        </span>
                        <span className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {escapeVisibleLite(t.token)}
                        </span>
                      </div>
                      <p className="mt-2 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {t.reason}. Scripts: {t.scripts.join(", ")}. Skeleton: {t.skeleton}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Normalized and cleaned" className="lg:col-span-2">
          <div data-testid="output-normalized" className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <OutputBlock label="NFC" value={escapeVisibleLite(analysis.nfc)} testId="output-nfc" />
            <OutputBlock label="NFKC" value={escapeVisibleLite(analysis.nfkc)} testId="output-nfkc" />
            <OutputBlock label="Invisibles escaped" value={analysis.escaped} testId="output-escaped" />
            <OutputBlock label="Invisibles removed" value={escapeVisibleLite(analysis.stripped)} testId="output-stripped" />
            <div className="md:col-span-2">
              <OutputBlock label="ASCII skeleton (lookalikes mapped)" value={escapeVisibleLite(analysis.skeleton)} testId="output-skeleton" />
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Code points" className="lg:col-span-2">
          <div className="space-y-4">
            <label className="inline-flex min-h-[44px] items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(e) => {
                  setFlaggedOnly(e.target.checked);
                  setLimit(ROW_STEP);
                }}
                className="h-4 w-4 accent-[hsl(var(--brand-signal))]"
              />
              Show flagged only ({flaggedCount})
            </label>
            {analysis.chars.length === 0 ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No code points.</p>
            ) : (
              <ol data-testid="output-codepoints" className="space-y-2">
                {shown.map((c) => (
                  <li
                    key={c.index}
                    className="grid min-w-0 grid-cols-[2.75rem_2.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.4)] p-2.5 sm:grid-cols-[3rem_3rem_7rem_minmax(0,1fr)]"
                  >
                    <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      #{c.index}
                    </span>
                    <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {c.gc === "Mn" || c.gc === "Mc" || c.gc === "Me" ? `\u25cc${c.visible}` : c.visible}
                    </span>
                    <div className="min-w-0 space-y-1 font-mono-tight text-xs">
                      <p className="break-all text-[hsl(var(--brand-bone))]">
                        {hexCp(c.cp)} <span className="text-[hsl(var(--brand-cyan))]">{c.gcLabel}</span>
                      </p>
                      <p className="text-[hsl(var(--brand-bone-dim))]">
                        {c.gc} | {c.script}
                      </p>
                      <p className="break-all text-[hsl(var(--brand-bone-dim))]">UTF-8: {c.utf8}</p>
                      <p className="break-all text-[hsl(var(--brand-bone-dim))]">UTF-16BE: {c.utf16}</p>
                      {c.flags.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5 pt-1">
                          {c.flags.map((f, j) => {
                            const meta = FLAG_TITLES[f.key];
                            const sev = meta ? meta.severity : "low";
                            return (
                              <li
                                key={`${f.key}-${j}`}
                                className={`min-w-0 break-words rounded-full border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.12em] ${SEVERITY_STYLE[sev]}`}
                              >
                                {f.label}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {rows.length > shown.length ? (
              <button type="button" onClick={() => setLimit((n) => n + ROW_STEP)} className={CHIP_CLASS}>
                Show {Math.min(ROW_STEP, rows.length - shown.length)} more of {rows.length}
              </button>
            ) : null}
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}

/* Escapes invisible and control characters for display without touching the rest. */
function escapeVisibleLite(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const hidden =
      BIDI.has(cp) ||
      ZERO_WIDTH.has(cp) ||
      INVISIBLE_OTHER.has(cp) ||
      (cp >= 0xe0000 && cp <= 0xe007f) ||
      (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) ||
      (cp >= 0x7f && cp <= 0x9f) ||
      cp === 0x2028 ||
      cp === 0x2029;
    out += hidden ? escapeCp(cp) : ch;
  }
  return out;
}
