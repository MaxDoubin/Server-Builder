/**
 * Markdown table generator: parse CSV, TSV or a GFM table into a grid, and
 * write the grid back out as a GitHub Flavored Markdown table or HTML.
 *
 * CSV follows RFC 4180 (quoted fields, "" for a literal quote, line breaks
 * inside quotes), leniently: a space before an opening quote is allowed and
 * text after a closing quote is kept. Markdown tables follow the GFM spec's
 * tables extension as cmark-gfm implements it: a header row, a delimiter
 * row with the same number of cells, and body rows padded or cut to fit. A
 * pipe preceded by a backslash never splits a cell, and that one backslash
 * is removed (cmark-gfm's unescape_pipes), which writing a pipe as \| undoes.
 * Output avoids the backslash-before-pipe forms that renderers can read as a
 * cell boundary; see escapeCell.
 */

export type Align = "none" | "left" | "center" | "right";

export interface Table {
  header: string[];
  rows: string[][];
  align: Align[];
}

export type Format = "auto" | "csv" | "semicolon" | "tsv" | "markdown";
export type ConcreteFormat = Exclude<Format, "auto">;

export const MAX_ROWS = 200;
export const MAX_COLS = 20;
export const MAX_IMPORT_CHARS = 1000000;

export const FORMAT_LABELS: Record<ConcreteFormat, string> = {
  csv: "CSV, comma separated",
  semicolon: "CSV, semicolon separated",
  tsv: "TSV, tab separated",
  markdown: "Markdown table",
};

/* ---------- delimited text ---------- */

export type DelimitedResult =
  | { ok: true; records: string[][]; strayText: number }
  | { ok: false; message: string };

/**
 * RFC 4180 records. Lines may end in CRLF, LF or CR. A completely empty line
 * is skipped rather than read as a record with one empty field. Line breaks
 * inside a quoted field are kept as LF.
 */
export function parseDelimited(input: string, delimiter: string): DelimitedResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let quoteLine = 0;
  let line = 1;
  let strayText = 0;

  const endField = () => {
    record.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRecord = () => {
    const blank = record.length === 0 && field === "" && !wasQuoted;
    endField();
    if (!blank) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else if (ch === "\r") {
        field += "\n";
        if (text[i + 1] === "\n") i++;
        line++;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !wasQuoted && /^[ \t]*$/.test(field)) {
      // An opening quote. Spaces before it are dropped, a common slip in
      // hand-written CSV such as: name, "Smith, J".
      quoted = true;
      wasQuoted = true;
      quoteLine = line;
      field = "";
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      endRecord();
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line++;
      continue;
    }
    if (wasQuoted && ch !== " " && ch !== "\t") strayText++;
    field += ch;
  }
  if (quoted) {
    return { ok: false, message: `The quoted field that starts on line ${quoteLine} is never closed. Add the closing double quote.` };
  }
  if (field !== "" || record.length > 0 || wasQuoted) endRecord();
  return { ok: true, records, strayText };
}

/* ---------- GFM tables ---------- */

/**
 * The cells of one table row. Leading and trailing pipes are optional, cells
 * are trimmed, and \| is a literal pipe that does not split.
 */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && s[s.length - 2] !== "\\") s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

const DELIM_CELL = /^:?-+:?$/;

/**
 * Lines that begin another block and so end a table: a block quote (the
 * spec's own example), an ATX heading, a code fence or a thematic break.
 */
const BLOCK_START = /^ {0,3}(?:>|#{1,6}(?:[ \t]|$)|```|~~~|(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$)/;

/** A delimiter row: cells of hyphens with optional colons. A pipe is required, so a lone --- stays a heading underline. */
export function isDelimiterRow(line: string): boolean {
  if (!line.includes("|")) return false;
  if (/^ {4,}|^\t/.test(line)) return false;
  return splitRow(line).every((cell) => DELIM_CELL.test(cell));
}

export function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

export interface MarkdownTableFound {
  table: Table;
  /** 1-based line numbers of the header row and the last row read. */
  firstLine: number;
  lastLine: number;
  /** Cells past the header's width, which GFM ignores. */
  droppedCells: number;
  /** Rows shorter than the header, which GFM pads with empty cells. */
  paddedRows: number;
  /** Non-blank lines after the table that were not read. */
  trailingLines: number;
}

/** The first GFM table in the text, or null when there is none. */
export function parseMarkdownTable(input: string): MarkdownTableFound | null {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() === "" || /^ {4,}|^\t/.test(lines[i])) continue;
    if (!isDelimiterRow(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const delim = splitRow(lines[i + 1]);
    if (header.length !== delim.length) continue;
    const width = header.length;
    const rows: string[][] = [];
    let droppedCells = 0;
    let paddedRows = 0;
    let j = i + 2;
    for (; j < lines.length && lines[j].trim() !== "" && !BLOCK_START.test(lines[j]); j++) {
      let cells = splitRow(lines[j]);
      if (cells.length > width) {
        droppedCells += cells.length - width;
        cells = cells.slice(0, width);
      } else if (cells.length < width) {
        paddedRows++;
        cells = cells.concat(Array(width - cells.length).fill(""));
      }
      rows.push(cells);
    }
    const trailingLines = lines.slice(j).filter((l) => l.trim() !== "").length;
    return {
      table: { header, rows, align: delim.map(alignOf) },
      firstLine: i + 1,
      lastLine: j,
      droppedCells,
      paddedRows,
      trailingLines,
    };
  }
  return null;
}

/* ---------- detection and import ---------- */

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === ch && !quoted) n++;
  }
  return n;
}

/** Guess the format from the text: a GFM table first, then the separator on the first non-empty line. */
export function detectFormat(text: string): ConcreteFormat {
  if (parseMarkdownTable(text)) return "markdown";
  const first = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== "") ?? "";
  const tabs = countOutsideQuotes(first, "\t");
  const commas = countOutsideQuotes(first, ",");
  const semis = countOutsideQuotes(first, ";");
  if (tabs > 0 && tabs >= commas && tabs >= semis) return "tsv";
  if (semis > commas) return "semicolon";
  return "csv";
}

export type ImportResult =
  | { ok: true; table: Table; format: ConcreteFormat; notes: string[] }
  | { ok: false; message: string };

const BR_SOURCE = "<br>";

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Fit rows to a common width, within the editor's limits, and report what was cut. */
function fit(header: string[], rows: string[][], align: Align[], notes: string[]): Table {
  let width = header.length;
  for (const row of rows) width = Math.max(width, row.length);
  if (width > MAX_COLS) {
    notes.push(`The data has ${width} columns. Only the first ${MAX_COLS} were loaded.`);
    width = MAX_COLS;
  }
  if (rows.length > MAX_ROWS) {
    notes.push(`The data has ${rows.length.toLocaleString("en-US")} body rows. Only the first ${MAX_ROWS} were loaded.`);
  }
  const pad = (cells: string[]) =>
    cells.length >= width ? cells.slice(0, width) : cells.concat(Array(width - cells.length).fill(""));
  return {
    header: pad(header),
    rows: rows.slice(0, MAX_ROWS).map(pad),
    align: Array.from({ length: width }, (_, i) => align[i] ?? "none"),
  };
}

/** Parse pasted text into a table for the editor. Never throws. */
export function importTable(text: string, format: Format, firstRowIsHeader: boolean): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) {
    return {
      ok: false,
      message: `The pasted text is ${text.length.toLocaleString("en-US")} characters. The limit is ${MAX_IMPORT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  if (text.trim() === "") return { ok: false, message: "Paste some CSV, TSV or a Markdown table first." };
  const chosen: ConcreteFormat = format === "auto" ? detectFormat(text) : format;
  const notes: string[] = [];

  if (chosen === "markdown") {
    const found = parseMarkdownTable(text);
    if (!found) {
      return {
        ok: false,
        message:
          "No Markdown table found. A table needs a header row followed by a delimiter row such as | --- | :-: | with the same number of cells.",
      };
    }
    if (found.firstLine > 1) notes.push(`The table starts on line ${found.firstLine}; the text before it was skipped.`);
    if (found.trailingLines > 0) {
      notes.push(
        `The table ends after line ${found.lastLine}; ${plural(found.trailingLines, "line after it was", "lines after it were")} skipped.`,
      );
    }
    if (found.droppedCells > 0) {
      notes.push(
        `${plural(found.droppedCells, "cell past the header's width was", "cells past the header's width were")} dropped, as GFM ignores them.`,
      );
    }
    if (found.paddedRows > 0) {
      notes.push(`${plural(found.paddedRows, "row was", "rows were")} shorter than the header and got empty cells, as GFM does.`);
    }
    return { ok: true, table: fit(found.table.header, found.table.rows, found.table.align, notes), format: chosen, notes };
  }

  const delimiter = chosen === "tsv" ? "\t" : chosen === "semicolon" ? ";" : ",";
  const parsed = parseDelimited(text, delimiter);
  if (!parsed.ok) return parsed;
  if (parsed.records.length === 0) return { ok: false, message: "No rows found in the pasted text." };
  if (parsed.strayText > 0) {
    notes.push("Some fields had text after their closing quote. RFC 4180 does not allow that; the text was kept.");
  }
  let breaks = 0;
  const records = parsed.records.map((record) =>
    record.map((cell) => {
      if (!cell.includes("\n")) return cell;
      breaks += cell.split("\n").length - 1;
      return cell.replace(/\n/g, BR_SOURCE);
    }),
  );
  if (breaks > 0) {
    notes.push(`${plural(breaks, "line break", "line breaks")} inside fields became <br>, since a Markdown table cell must stay on one line.`);
  }
  const header = firstRowIsHeader ? records[0] : [];
  const rows = firstRowIsHeader ? records.slice(1) : records;
  return { ok: true, table: fit(header, rows, [], notes), format: chosen, notes };
}

/* ---------- output ---------- */

/** Width in code points. East Asian wide characters, emoji and combining marks are counted as one. */
export function codePointLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    // A low surrogate continues the code point its high surrogate began.
    if (c < 0xdc00 || c > 0xdfff || i === 0 || s.charCodeAt(i - 1) < 0xd800 || s.charCodeAt(i - 1) > 0xdbff) n++;
  }
  return n;
}

/**
 * One cell as Markdown source: trimmed, line breaks as <br>, every pipe that
 * would split the row written as \|.
 *
 * A pipe that already has an odd number of backslashes before it is an
 * escaped pipe in the source, so it is left alone. Doubling the backslash
 * would give \\|, which marked reads as a literal backslash followed by a
 * cell boundary, because it counts the backslashes in the run: the row
 * splits there. With an even number of backslashes before the pipe (a
 * literal backslash, then a pipe) one more is added, so the run is odd and
 * the pipe stays escaped.
 */
export function escapeCell(s: string): string {
  const flat = s.trim().replace(/\r\n|\r|\n/g, BR_SOURCE);
  let out = "";
  let run = 0;
  for (const ch of flat) {
    out += ch === "|" && run % 2 === 0 ? "\\|" : ch;
    run = ch === "\\" ? run + 1 : 0;
  }
  return out;
}

function delimiterCell(align: Align, width: number): string {
  switch (align) {
    case "left":
      return ":" + "-".repeat(width - 1);
    case "right":
      return "-".repeat(width - 1) + ":";
    case "center":
      return ":" + "-".repeat(width - 2) + ":";
    default:
      return "-".repeat(width);
  }
}

function padCell(s: string, width: number, align: Align): string {
  const extra = width - codePointLength(s);
  if (extra <= 0) return s;
  if (align === "right") return " ".repeat(extra) + s;
  if (align === "center") {
    const left = Math.floor(extra / 2);
    return " ".repeat(left) + s + " ".repeat(extra - left);
  }
  return s + " ".repeat(extra);
}

/** A GFM table. Padded aligns the pipes in a fixed-width font, counting code points. */
export function toMarkdown(table: Table, padded: boolean): string {
  const cols = table.header.length;
  if (cols === 0) return "";
  const header = table.header.map(escapeCell);
  const rows = table.rows.map((row) => Array.from({ length: cols }, (_, i) => escapeCell(row[i] ?? "")));
  const align = Array.from({ length: cols }, (_, i) => table.align[i] ?? "none");
  // Three is the narrowest a delimiter cell can be with a colon at each end.
  const widths = Array.from({ length: cols }, (_, i) => {
    if (!padded) return 3;
    let w = Math.max(3, codePointLength(header[i]));
    for (const row of rows) w = Math.max(w, codePointLength(row[i]));
    return w;
  });
  const line = (cells: string[]) =>
    "| " + cells.map((cell, i) => (padded ? padCell(cell, widths[i], align[i]) : cell)).join(" | ") + " |";
  const out = [line(header), "| " + align.map((a, i) => delimiterCell(a, widths[i])).join(" | ") + " |"];
  for (const row of rows) out.push(line(row));
  // An empty cell in compact mode leaves "|  |", which is still one cell.
  return out.join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Cell text as HTML: escaped, with <br> (and real line breaks) kept as line breaks. */
function htmlCell(s: string): string {
  return s
    .trim()
    .split(/<br\s*\/?>|\r\n|\r|\n/i)
    .map(escapeHtml)
    .join("<br>");
}

/**
 * An HTML table. GFM's own renderer writes alignment as an align attribute,
 * which GitHub keeps when it sanitizes a README; a style attribute is the
 * modern form for a page you control.
 */
export function toHtml(table: Table, alignAs: "attribute" | "style"): string {
  const cols = table.header.length;
  if (cols === 0) return "";
  const attr = (i: number) => {
    const a = table.align[i] ?? "none";
    if (a === "none") return "";
    return alignAs === "attribute" ? ` align="${a}"` : ` style="text-align: ${a}"`;
  };
  const out = ["<table>", "  <thead>", "    <tr>"];
  for (let i = 0; i < cols; i++) out.push(`      <th${attr(i)}>${htmlCell(table.header[i] ?? "")}</th>`);
  out.push("    </tr>", "  </thead>");
  if (table.rows.length > 0) {
    out.push("  <tbody>");
    for (const row of table.rows) {
      out.push("    <tr>");
      for (let i = 0; i < cols; i++) out.push(`      <td${attr(i)}>${htmlCell(row[i] ?? "")}</td>`);
      out.push("    </tr>");
    }
    out.push("  </tbody>");
  }
  out.push("</table>");
  return out.join("\n");
}

const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}/u;
const ZERO_WIDTH = /[\p{Mn}\p{Me}\u200B-\u200F\u2060\uFE0F]/u;

/** Whether any cell holds characters a fixed-width font does not draw one column wide. */
export function widthWarnings(table: Table): { wide: boolean; zeroWidth: boolean } {
  let wide = false;
  let zeroWidth = false;
  const check = (s: string) => {
    if (!wide && WIDE.test(s)) wide = true;
    if (!zeroWidth && ZERO_WIDTH.test(s)) zeroWidth = true;
  };
  table.header.forEach(check);
  for (const row of table.rows) row.forEach(check);
  return { wide, zeroWidth };
}

/* ---------- editing ---------- */

export function emptyTable(cols: number, rows: number): Table {
  return {
    header: Array(cols).fill(""),
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
    align: Array(cols).fill("none"),
  };
}

export function addRow(table: Table): Table {
  if (table.rows.length >= MAX_ROWS) return table;
  return { ...table, rows: [...table.rows, Array(table.header.length).fill("")] };
}

export function removeRow(table: Table, index: number): Table {
  return { ...table, rows: table.rows.filter((_, i) => i !== index) };
}

export function addColumn(table: Table): Table {
  if (table.header.length >= MAX_COLS) return table;
  return {
    header: [...table.header, ""],
    rows: table.rows.map((row) => [...row, ""]),
    align: [...table.align, "none"],
  };
}

export function removeColumn(table: Table, index: number): Table {
  if (table.header.length <= 1) return table;
  const drop = <T,>(cells: T[]) => cells.filter((_, i) => i !== index);
  return { header: drop(table.header), rows: table.rows.map(drop), align: drop(table.align) };
}

/** Set one cell. Row -1 is the header. */
export function setCell(table: Table, row: number, col: number, value: string): Table {
  if (row < 0) return { ...table, header: table.header.map((c, i) => (i === col ? value : c)) };
  return {
    ...table,
    rows: table.rows.map((r, ri) => (ri === row ? r.map((c, i) => (i === col ? value : c)) : r)),
  };
}

export function setAlign(table: Table, col: number, align: Align): Table {
  return { ...table, align: table.align.map((a, i) => (i === col ? align : a)) };
}
