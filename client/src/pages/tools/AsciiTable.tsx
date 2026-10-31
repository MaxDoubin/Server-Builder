/**
 * Interactive ASCII table.
 *
 * All the data and the search live in lib/toolkit/ascii-table.ts. This file
 * is the view: a table and a 4 x 32 chart of the same rows, a detail panel
 * for the selected code that shows its bits, and a copy on row click. The
 * chart exists because the reason ASCII looks the way it does is only
 * visible in that layout: bits 6 and 5 pick one of four columns of 32, so a
 * control, its punctuation, its capital and its small letter sit side by
 * side.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_QUERY_LENGTH,
  codePointLabel,
  columnSiblings,
  copyValue,
  glyphOf,
  htmlFormOf,
  isAsciiLetter,
  matchedCodes,
  mojibake,
  rowsFor,
  searchCodes,
  toBinary,
  toHex,
  toOctal,
  utf8Bytes,
  type Charset,
  type CodeRow,
  type CopyFormat,
} from "@/lib/toolkit/ascii-table";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
/** Example chips show literal queries such as "\\n" and "&amp;", so they keep their case. */
const EXAMPLE_CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const CHART_TH = "whitespace-nowrap px-2 py-2 text-center font-mono-tight text-xs font-normal text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TH =
  "whitespace-nowrap px-2 py-2 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD = "whitespace-nowrap px-2 py-1.5 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";

function toggleClass(on: boolean): string {
  return on
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]";
}

const CHARSETS: { value: Charset; label: string }[] = [
  { value: "ascii", label: "ASCII 0 to 127" },
  { value: "latin1", label: "+ Latin-1" },
  { value: "cp1252", label: "+ Windows-1252" },
];

const COPY_FORMATS: { value: CopyFormat; label: string }[] = [
  { value: "char", label: "Character" },
  { value: "decimal", label: "Decimal" },
  { value: "hex", label: "Hex (0x41)" },
  { value: "binary", label: "Binary" },
  { value: "html", label: "HTML reference" },
  { value: "escape", label: "C escape" },
];

const EXAMPLES = ["A", "65", "0x1B", "^M", "\\n", "%20", "&amp;", "tab", "1000001"];

/** What bits 6 and 5 select, for the lower and the upper half. */
const COLUMN_LOW = ["control characters", "space, digits and punctuation", "@, capitals and [\\]^_", "`, small letters, {|}~ and DEL"];
const COLUMN_HIGH_LATIN1 = ["C1 control characters", "no-break space and symbols", "accented capitals and the multiplication sign", "accented small letters and the division sign"];
const COLUMN_HIGH_1252 = ["Windows-1252 punctuation and letters", "no-break space and symbols", "accented capitals and the multiplication sign", "accented small letters and the division sign"];

/** Copy with the same fallback the shared CopyButton uses, for browsers that refuse the async clipboard. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }
}

/** Short label for a row in prose: the glyph, or the abbreviation. */
function shortLabel(row: CodeRow): string {
  return glyphOf(row) ?? row.abbr ?? row.name;
}

/** The glyph cell: the character, or its abbreviation in a pill when there is nothing visible. */
function Glyph({ row, large = false }: { row: CodeRow; large?: boolean }) {
  const glyph = glyphOf(row);
  if (glyph !== null) {
    return (
      <span className={`font-mono-tight text-[hsl(var(--brand-bone))] ${large ? "text-4xl" : "text-base"}`}>{glyph}</span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded border border-[hsl(var(--brand-cyan)/0.5)] px-1.5 font-mono-tight uppercase tracking-[0.08em] text-[hsl(var(--brand-cyan))] ${
        large ? "py-1 text-xl" : "text-[0.6875rem]"
      }`}
    >
      {row.abbr ?? "?"}
    </span>
  );
}

export function AsciiTable() {
  const [charset, setCharset] = useState<Charset>("ascii");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<CopyFormat>("char");
  const [view, setView] = useState<"table" | "chart">("table");
  const [selected, setSelected] = useState(65);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    },
    [],
  );

  const rows = useMemo(() => rowsFor(charset), [charset]);
  const search = useMemo(() => searchCodes(query, charset), [query, charset]);
  const active = query === " " || query.trim() !== "";
  const matched = useMemo(() => (active ? matchedCodes(search) : null), [active, search]);
  const visible = useMemo(() => (matched ? rows.filter((r) => matched.has(r.code)) : rows), [rows, matched]);
  const row = rows[selected] ?? rows[65];
  const formatLabel = COPY_FORMATS.find((f) => f.value === format)?.label.toLowerCase() ?? "character";

  async function activate(target: CodeRow) {
    setSelected(target.code);
    const value = copyValue(target, format);
    const ok = await writeClipboard(value);
    const what = `${shortLabel(target)} (${target.code}, 0x${toHex(target.code)})`;
    setStatus(
      ok
        ? format === "char" && target.control
          ? `Copied ${what} as the raw control character. Many apps strip or act on it; copy as hex or C escape for a visible form.`
          : `Copied ${what} as ${formatLabel}: ${value}`
        : `Could not reach the clipboard. ${what} is selected above.`,
    );
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(""), 4000);
  }

  function chooseCharset(next: Charset) {
    setCharset(next);
    if (next === "ascii" && selected > 127) setSelected(65);
  }

  /* ---------------------------------------------------------- details */

  const upper = row.code >= 128;
  const column = (row.code >> 5) & 3;
  const columnText = upper
    ? (charset === "cp1252" ? COLUMN_HIGH_1252 : COLUMN_HIGH_LATIN1)[column]
    : COLUMN_LOW[column];
  const siblings = columnSiblings(row.code).map((c) => rows[c]).filter((r): r is CodeRow => r !== undefined);
  const cp = row.codePoint;
  const bytes = cp !== null ? utf8Bytes(cp) : null;
  const garbled = cp !== null ? mojibake(cp) : null;
  const bits = row.code.toString(2).padStart(8, "0").split("");

  let caseLine: string | null = null;
  if (isAsciiLetter(row.code)) {
    const other = String.fromCharCode(row.code ^ 0x20);
    caseLine = `Flip bit 5 (XOR 0x20) and ${String.fromCharCode(row.code)} becomes ${other}. Upper and lower case differ by exactly 32.`;
  } else if (row.code >= 48 && row.code <= 57) {
    caseLine = `The low four bits are the digit's value: 0x${toHex(row.code)} AND 0x0F = ${row.code & 0x0f}.`;
  } else if (!upper && row.code >= 32 && row.code < 127 && column !== 1) {
    caseLine = `Bit 5 is not a case bit here: XOR 0x20 turns ${String.fromCharCode(row.code)} into ${String.fromCharCode(row.code ^ 0x20)}.`;
  }
  let ctrlLine: string | null = null;
  if (!upper && row.code < 32) {
    ctrlLine = `Typed as Ctrl+${String.fromCharCode(row.code | 0x40)}: Ctrl keeps only the low five bits of the key's code.`;
  } else if (!upper && row.code >= 64 && row.code < 127) {
    const target = rows[row.code & 0x1f];
    ctrlLine = `Ctrl+${String.fromCharCode(row.code & ~0x20)} sends ${row.code & 0x1f} (${target.abbr}): clear bits 6 and 5 and what is left is a control.`;
  }

  return (
    <ToolShell slug="ascii-table">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Find">
            <label htmlFor="ascii-search" className={LABEL}>
              Character, number in any base, escape or name
            </label>
            <input
              id="ascii-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={MAX_QUERY_LENGTH + 1}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={search.error !== null}
              aria-describedby={search.error ? "ascii-search-error" : "ascii-search-hint"}
              placeholder="A, 65, 0x41, 101o, ^A, \n, &amp;, line feed"
              data-testid="input-ascii-search"
              className={INPUT}
            />
            {search.error ? (
              <p
                id="ascii-search-error"
                role="alert"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {search.error}
              </p>
            ) : (
              <p id="ascii-search-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                A bare number is read in every base it is valid in. Prefixes such as 0x, 0o, 0b, \x, U+, %, &amp;# and
                caret notation pin it down.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuery(example)}
                  data-testid={`button-example-${example}`}
                  className={`${EXAMPLE_CHIP} ${FOCUS}`}
                >
                  {example}
                </button>
              ))}
              {query ? (
                <button type="button" onClick={() => setQuery("")} data-testid="button-clear" className={`${CHIP} ${FOCUS}`}>
                  Clear
                </button>
              ) : null}
            </div>

            {search.interpretations.length > 0 ? (
              <div className="mt-5">
                <h3 className={LABEL}>Read as</h3>
                <ul className="mt-2 space-y-1" data-testid="list-interpretations">
                  {search.interpretations.map((i) => {
                    const target = rows[i.code];
                    if (!target) return null;
                    return (
                      <li key={i.code}>
                        <button
                          type="button"
                          onClick={() => setSelected(i.code)}
                          className={`flex min-h-[32px] w-full flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 text-left font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-signal)/0.08)] ${FOCUS}`}
                        >
                          <span className="text-[hsl(var(--brand-ash))]">{i.via.join(", ")}:</span>
                          <span className="text-[hsl(var(--brand-signal))]">
                            {i.code} (0x{toHex(i.code)})
                          </span>
                          <span className="text-[hsl(var(--brand-bone))]">{shortLabel(target)}</span>
                          <span>{target.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {search.outOfRange.length > 0 ? (
              <ul className="mt-3 space-y-1" data-testid="list-out-of-range">
                {search.outOfRange.map((line) => (
                  <li key={line} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-6">
              <span className={LABEL}>Range</span>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Character set">
                {CHARSETS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => chooseCharset(c.value)}
                    aria-pressed={charset === c.value}
                    data-testid={`button-charset-${c.value}`}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.16em] transition-colors ${FOCUS} ${toggleClass(
                      charset === c.value,
                    )}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {charset === "ascii"
                  ? "Seven bits, 128 codes. The upper half depends on which 8-bit set you mean."
                  : charset === "latin1"
                    ? "ISO-8859-1: C1 controls at 128 to 159. Rows that Windows-1252 redefines are marked."
                    : "Windows-1252: printable characters at 128 to 159, five bytes undefined. Marked rows differ from Latin-1."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ascii-copy-format" className={LABEL}>
                  A click copies
                </label>
                <select
                  id="ascii-copy-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as CopyFormat)}
                  data-testid="select-copy-format"
                  className={`${INPUT} min-h-[44px]`}
                >
                  {COPY_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className={LABEL}>View</span>
                <div className="mt-2 flex gap-2" role="group" aria-label="View">
                  {(
                    [
                      { value: "table", label: "Table" },
                      { value: "chart", label: "4 x 32 chart" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setView(v.value)}
                      aria-pressed={view === v.value}
                      data-testid={`button-view-${v.value}`}
                      className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.16em] transition-colors ${FOCUS} ${toggleClass(
                        view === v.value,
                      )}`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title="Selected">
            <div className="flex items-center gap-4" data-testid="text-selected">
              <div className="flex h-20 min-w-[5rem] items-center justify-center rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-3">
                <Glyph row={row} large />
              </div>
              <div className="min-w-0">
                <div className="font-display text-lg leading-tight text-[hsl(var(--brand-bone))]">{row.name}</div>
                <div className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  byte {row.code}
                  {cp !== null ? ` · ${codePointLabel(cp)}` : " · no code point"}
                  {row.differsInCp1252 ? " · differs between Latin-1 and Windows-1252" : ""}
                </div>
              </div>
            </div>

            <div className="mt-5" aria-label={`Bits of ${row.code}: ${toBinary(row.code)}`} role="img">
              <div className="grid grid-cols-8 gap-1" aria-hidden>
                {bits.map((bit, i) => {
                  const position = 7 - i;
                  const isColumn = position === 6 || position === 5;
                  const isCase = position === 5 && isAsciiLetter(row.code);
                  return (
                    <div key={position} className="text-center">
                      <div
                        className={`flex h-9 items-center justify-center rounded-md border font-mono-tight text-sm ${
                          isCase
                            ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                            : isColumn
                              ? "border-[hsl(var(--brand-cyan)/0.6)] text-[hsl(var(--brand-cyan))]"
                              : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]"
                        }`}
                      >
                        {bit}
                      </div>
                      <div className="mt-1 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">b{position}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              <li className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {upper ? "Bit 7 is set, so this is outside 7-bit ASCII. " : ""}Bits 6 and 5 are{" "}
                <span className="text-[hsl(var(--brand-cyan))]">{bits[1]}{bits[2]}</span>: the column of {columnText}.
              </li>
              {caseLine ? (
                <li className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{caseLine}</li>
              ) : null}
              {ctrlLine ? (
                <li className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{ctrlLine}</li>
              ) : null}
            </ul>

            <div className="mt-4">
              <h3 className={LABEL}>Same low five bits, one per column</h3>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {siblings.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setSelected(s.code)}
                    aria-label={`Select ${s.code}, ${s.name}`}
                    aria-pressed={s.code === row.code}
                    className={`flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border p-1 transition-colors ${FOCUS} ${toggleClass(
                      s.code === row.code,
                    )}`}
                  >
                    <Glyph row={s} />
                    <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">{s.code}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <ToolResult label="Decimal" value={row.code} testId="text-selected-decimal" />
              <ToolResult label="Hex" value={`0x${toHex(row.code)}`} testId="text-selected-hex" />
              <ToolResult label="Octal" value={`0${toOctal(row.code)}`} />
              <ToolResult label="Binary" value={toBinary(row.code)} />
              {row.caret ? <ToolResult label="Caret notation" value={row.caret} /> : null}
              {row.cEscape ? <ToolResult label="C escape" value={row.cEscape} /> : null}
              <ToolResult
                label="HTML"
                value={[...row.entities.map((e) => `&${e};`), row.numericRef].join("  ")}
              />
              <ToolResult label="Percent-encoded byte" value={`%${toHex(row.code)}`} />
              {bytes && upper ? (
                <ToolResult label="UTF-8 bytes" value={bytes.map((b) => toHex(b)).join(" ")} />
              ) : null}
              {garbled ? <ToolResult label="UTF-8 misread as Windows-1252" value={garbled} /> : null}
            </div>
            {row.htmlNote || row.note ? (
              <ul className="mt-3 space-y-1.5">
                {[row.note, row.htmlNote].filter(Boolean).map((line) => (
                  <li key={line as string} className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title={view === "table" ? "Table" : "Chart"}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-row-count">
              {matched
                ? `${visible.length} of ${rows.length} codes match.`
                : `${rows.length} codes. Click any row to copy it as ${formatLabel}.`}
            </p>
            <p role="status" aria-live="polite" className="min-h-[1rem] font-mono-tight text-xs text-[hsl(var(--brand-signal))]" data-testid="text-copy-status">
              {status}
            </p>
          </div>

          {view === "table" ? (
            visible.length === 0 ? (
              <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">No code matches that search.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse" data-testid="table-ascii">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>Char</th>
                      <th scope="col" className={TH}>Dec</th>
                      <th scope="col" className={TH}>Hex</th>
                      <th scope="col" className={TH}>Oct</th>
                      <th scope="col" className={TH}>Binary</th>
                      <th scope="col" className={TH}>Name</th>
                      <th scope="col" className={TH}>Caret</th>
                      <th scope="col" className={TH}>C</th>
                      <th scope="col" className={TH}>HTML</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const isSelected = r.code === row.code;
                      return (
                        <tr
                          key={r.code}
                          onClick={() => void activate(r)}
                          className={`cursor-pointer border-b border-[hsl(var(--brand-iron)/0.4)] transition-colors ${
                            isSelected ? "bg-[hsl(var(--brand-signal)/0.1)]" : "hover:bg-[hsl(var(--brand-signal)/0.05)]"
                          }`}
                        >
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void activate(r);
                              }}
                              aria-label={`Copy ${r.code}, ${r.name}, as ${formatLabel}`}
                              className={`inline-flex min-h-[32px] min-w-[48px] items-center justify-center rounded-md border border-[hsl(var(--brand-iron)/0.6)] px-1 ${FOCUS}`}
                            >
                              <Glyph row={r} />
                            </button>
                          </td>
                          <td className={`${TD} text-[hsl(var(--brand-bone))]`}>{r.code}</td>
                          <td className={TD}>{toHex(r.code)}</td>
                          <td className={TD}>{toOctal(r.code)}</td>
                          <td className={TD}>{toBinary(r.code)}</td>
                          <td className="min-w-[14rem] px-2 py-1.5 font-mono-tight text-xs leading-snug text-[hsl(var(--brand-bone-dim))]">
                            {r.abbr && r.abbr !== "n/a" ? (
                              <span className="mr-1.5 text-[hsl(var(--brand-cyan))]">{r.abbr}</span>
                            ) : null}
                            {r.name}
                            {r.codePoint !== null && r.codePoint !== r.code ? (
                              <span className="ml-1.5 text-[hsl(var(--brand-ash))]">{codePointLabel(r.codePoint)}</span>
                            ) : null}
                            {r.differsInCp1252 ? (
                              <span className="ml-1.5 rounded border border-[hsl(var(--brand-amber)/0.5)] px-1 text-[0.625rem] uppercase tracking-[0.12em] text-[hsl(var(--brand-amber))]">
                                {charset === "cp1252" ? "not Latin-1" : "not 1252"}
                              </span>
                            ) : null}
                          </td>
                          <td className={TD}>{r.caret ?? ""}</td>
                          <td className={TD}>{r.cEscape ?? ""}</td>
                          <td className={TD}>
                            {htmlFormOf(r)}
                            {r.htmlNote && r.control ? (
                              <span className="ml-1 text-[hsl(var(--brand-amber))]" title={r.htmlNote}>
                                *
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="mt-4 space-y-8">
              {(charset === "ascii" ? [0] : [0, 128]).map((offset) => (
                <div key={offset} className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-separate border-spacing-1" data-testid={`chart-${offset}`}>
                    <caption className={`${LABEL} pb-2 text-left`}>
                      {offset === 0 ? "0 to 127" : "128 to 255"}: rows share bits 4 to 0, columns are bits 6 and 5
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className={CHART_TH}>
                          <span className="sr-only">Low five bits</span>
                        </th>
                        {[0, 1, 2, 3].map((c) => (
                          <th key={c} scope="col" className={CHART_TH}>
                            <span className="text-[hsl(var(--brand-cyan))]">{c.toString(2).padStart(2, "0")}</span>{" "}
                            <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                              {(offset === 0 ? COLUMN_LOW : charset === "cp1252" ? COLUMN_HIGH_1252 : COLUMN_HIGH_LATIN1)[c].split(",")[0]}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 32 }, (_, low) => (
                        <tr key={low}>
                          <th scope="row" className="pr-2 text-right font-mono-tight text-[0.625rem] font-normal text-[hsl(var(--brand-ash))]">
                            {low.toString(2).padStart(5, "0")}
                          </th>
                          {[0, 1, 2, 3].map((c) => {
                            const r = rows[offset + c * 32 + low];
                            const dim = matched !== null && !matched.has(r.code);
                            const isSelected = r.code === row.code;
                            return (
                              <td key={c}>
                                <button
                                  type="button"
                                  onClick={() => void activate(r)}
                                  aria-label={`Copy ${r.code}, ${r.name}, as ${formatLabel}`}
                                  className={`flex min-h-[32px] w-full items-center justify-between gap-2 rounded-md border px-2 transition-colors ${FOCUS} ${
                                    isSelected
                                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)]"
                                      : "border-[hsl(var(--brand-iron)/0.6)] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                                  } ${dim ? "opacity-30" : ""}`}
                                >
                                  <Glyph row={r} />
                                  <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">{r.code}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            * A numeric reference to this control is a parse error in HTML, or, for 0, is replaced with U+FFFD.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
