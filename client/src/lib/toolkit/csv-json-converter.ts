/**
 * CSV and JSON conversion, without React.
 *
 * The CSV reader follows RFC 4180: fields are separated by a delimiter,
 * records by a line break, and a field that holds the delimiter, a double
 * quote or a line break is wrapped in double quotes with each inner quote
 * doubled. It reads CRLF, LF and a lone CR as line breaks, because real
 * files use all three, and it reports rather than rejects the common
 * departures from the RFC (a stray quote, text after a closing quote, a
 * quote that never closes), so a messy export still converts and the reader
 * is told exactly where it was messy.
 *
 * JSON input goes through the parser in json-formatter, which keeps every
 * number's source text. A 64-bit ID in the JSON therefore reaches the CSV
 * digit for digit instead of being rounded through a double first.
 *
 * Output JSON is written here rather than by JSON.stringify on an object,
 * because a JavaScript object reorders integer-like keys ("2024" would jump
 * ahead of "name") and treats a "__proto__" header as something other than
 * a key. Writing the text directly keeps the columns in file order.
 */

import { classifyNumber, formatJson, parseJson, type JsonNode } from "./json-formatter";

/** Longest input read at all. */
export const MAX_INPUT_CHARS = 5_000_000;

/** Distinct flattened columns kept when turning JSON into a table. */
export const MAX_COLUMNS = 1000;

/** Cells (rows times columns) written when turning JSON into a table. */
export const MAX_CELLS = 2_000_000;

/** Individual problems listed per kind. Totals are always counted in full. */
export const MAX_LISTED_ISSUES = 50;

/** Rows sampled when guessing the delimiter. */
export const DETECT_ROWS = 50;

export type Delimiter = "," | "\t" | ";" | "|";

export const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ",", label: "Comma" },
  { value: "\t", label: "Tab" },
  { value: ";", label: "Semicolon" },
  { value: "|", label: "Pipe" },
];

export function delimiterName(d: Delimiter): string {
  return DELIMITERS.find((x) => x.value === d)?.label.toLowerCase() ?? d;
}

export type Tone = "info" | "warn" | "danger";

export interface Issue {
  tone: Tone;
  text: string;
}

function clip(text: string, max = 32): string {
  const flat = text.replace(/\r\n|\r|\n/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/* -------------------------------------------------------------- CSV reader */

export interface CsvIssue {
  line: number;
  message: string;
  tone: Tone;
}

export interface CsvParse {
  rows: string[][];
  /** Line on which each row starts, 1-based. */
  lines: number[];
  issues: CsvIssue[];
  issueCount: number;
  bom: boolean;
  blankLines: number;
}

/** Line breaks between two offsets: CRLF, LF and a lone CR each count once. */
function countBreaks(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) count++;
    else if (c === 0x0d) {
      count++;
      if (i + 1 < to && text.charCodeAt(i + 1) === 0x0a) i++;
    }
  }
  return count;
}

/**
 * Read CSV text into rows of strings (RFC 4180 section 2).
 *
 * A field is quoted only when its first character is a double quote. Inside
 * one, "" is a literal quote and the delimiter and line breaks are data.
 * Blank lines are skipped and counted; a line holding only "" is a record
 * with one empty field and is kept.
 */
export function parseCsv(input: string, delimiter: string, maxRecords = Infinity): CsvParse {
  let text = input;
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const d = delimiter.charCodeAt(0);
  const n = text.length;
  const rows: string[][] = [];
  const lines: number[] = [];
  const issues: CsvIssue[] = [];
  let issueCount = 0;
  const note = (line: number, message: string, tone: Tone) => {
    issueCount++;
    if (issues.length < MAX_LISTED_ISSUES) issues.push({ line, message, tone });
  };

  let i = 0;
  let line = 1;
  let blankLines = 0;

  while (i < n && rows.length < maxRecords) {
    const row: string[] = [];
    const startLine = line;
    let quotedAny = false;

    for (;;) {
      let field: string;
      if (i < n && text.charCodeAt(i) === 0x22) {
        quotedAny = true;
        const openLine = line;
        i++;
        let value = "";
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q === -1) {
            value += text.slice(i);
            line += countBreaks(text, i, n);
            i = n;
            break;
          }
          line += countBreaks(text, i, q);
          value += text.slice(i, q);
          if (text.charCodeAt(q + 1) === 0x22) {
            value += '"';
            i = q + 2;
            continue;
          }
          i = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          note(
            openLine,
            `Line ${openLine}: a quoted field opens here and never closes, so everything after it was read into that one field.`,
            "danger",
          );
        } else if (i < n) {
          const c = text.charCodeAt(i);
          if (c !== d && c !== 0x0a && c !== 0x0d) {
            let k = i;
            while (k < n) {
              const ch = text.charCodeAt(k);
              if (ch === d || ch === 0x0a || ch === 0x0d) break;
              k++;
            }
            note(
              line,
              `Line ${line}: text after a closing quote (${clip(text.slice(i, k))}). RFC 4180 allows only a delimiter or a line break there; the text was kept as part of the field.`,
              "warn",
            );
            value += text.slice(i, k);
            i = k;
          }
        }
        field = value;
      } else {
        let k = i;
        let bare = false;
        while (k < n) {
          const ch = text.charCodeAt(k);
          if (ch === d || ch === 0x0a || ch === 0x0d) break;
          if (ch === 0x22) bare = true;
          k++;
        }
        field = text.slice(i, k);
        if (bare) {
          note(
            line,
            `Line ${line}: a double quote inside an unquoted field (${clip(field)}). RFC 4180 wants that field quoted, with the quote doubled; it was read as written.`,
            "warn",
          );
        }
        i = k;
      }
      row.push(field);
      if (i >= n) break;
      const c = text.charCodeAt(i);
      if (c === d) {
        i++;
        continue;
      }
      i++;
      if (c === 0x0d && text.charCodeAt(i) === 0x0a) i++;
      line++;
      break;
    }

    if (row.length === 1 && row[0] === "" && !quotedAny) {
      blankLines++;
      continue;
    }
    rows.push(row);
    lines.push(startLine);
  }

  return { rows, lines, issues, issueCount, bom, blankLines };
}

/**
 * Guess the delimiter by parsing the first rows with each candidate.
 *
 * The winner is the one that splits the most rows into the same number of
 * fields, with more than one field. Ties go to the wider split, then to the
 * order comma, tab, semicolon, pipe. Parsing (rather than counting
 * characters) means a comma inside a quoted field does not vote.
 */
export function detectDelimiter(input: string): { delimiter: Delimiter; reason: string } {
  const SAMPLE = 65536;
  const sample = input.slice(0, SAMPLE);
  const truncated = input.length > SAMPLE;
  let best: { d: Delimiter; modal: number; freq: number; total: number } | null = null;

  for (const { value: d } of DELIMITERS) {
    const parsed = parseCsv(sample, d, DETECT_ROWS + 1);
    let rows = parsed.rows;
    // A sample cut mid-file ends in a partial row, which should not vote.
    if (truncated && rows.length > 1 && rows.length <= DETECT_ROWS) rows = rows.slice(0, -1);
    if (rows.length > DETECT_ROWS) rows = rows.slice(0, DETECT_ROWS);
    if (rows.length === 0) continue;
    const tally = new Map<number, number>();
    for (const r of rows) tally.set(r.length, (tally.get(r.length) ?? 0) + 1);
    let modal = 0;
    let freq = 0;
    for (const [width, count] of tally) {
      if (count > freq || (count === freq && width > modal)) {
        modal = width;
        freq = count;
      }
    }
    if (modal < 2) continue;
    const better =
      best === null ||
      freq / rows.length > best.freq / best.total ||
      (freq / rows.length === best.freq / best.total && modal > best.modal);
    if (better) best = { d, modal, freq, total: rows.length };
  }

  if (!best) {
    return {
      delimiter: ",",
      reason: "No candidate split the rows into more than one column, so this is read as comma separated with a single column.",
    };
  }
  return {
    delimiter: best.d,
    reason: `Detected ${delimiterName(best.d)}: it splits ${best.freq} of the first ${plural(best.total, "row")} into ${best.modal} fields.`,
  };
}

/* ------------------------------------------------------------ cell typing */

export type ColumnType = "number" | "boolean" | "string" | "empty";

/** RFC 8259 section 6 number grammar. Anything else stays text. */
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const BOOLEAN = /^(?:true|false)$/i;

/**
 * Pick one type per column from its data cells, ignoring empty ones.
 *
 * Per column rather than per cell, so a ZIP code column holding 89101 and
 * 08540 stays text in every row instead of turning into numbers except where
 * a leading zero happens to block it. A number counts only in RFC 8259 form
 * and only when a double holds it exactly, so 007, 1,000, +5 and a 19-digit
 * ID all keep their column as text.
 */
export function inferColumnTypes(
  rows: string[][],
  width: number,
): { types: ColumnType[]; unsafeColumns: number[] } {
  const types: ColumnType[] = [];
  const unsafeColumns: number[] = [];
  for (let j = 0; j < width; j++) {
    let allNumber = true;
    let allBoolean = true;
    let any = false;
    let unsafe = false;
    for (const row of rows) {
      if (j >= row.length) continue;
      const v = row[j].trim();
      if (v === "") continue;
      any = true;
      if (allNumber) {
        if (!JSON_NUMBER.test(v)) allNumber = false;
        else if (classifyNumber(v)) {
          allNumber = false;
          unsafe = true;
        }
      }
      if (allBoolean && !BOOLEAN.test(v)) allBoolean = false;
      if (!allNumber && !allBoolean) break;
    }
    if (!any) types.push("empty");
    else if (allNumber) types.push("number");
    else if (allBoolean) types.push("boolean");
    else {
      types.push("string");
      if (unsafe) unsafeColumns.push(j);
    }
  }
  return { types, unsafeColumns };
}

/** One cell as JSON text. A missing cell (short row) is null. */
function cellJson(value: string | undefined, type: ColumnType | null): string {
  if (value === undefined) return "null";
  if (type === null || type === "string") return JSON.stringify(value);
  const t = value.trim();
  if (t === "" || type === "empty") return "null";
  if (type === "boolean") return t.toLowerCase() === "true" ? "true" : "false";
  return t;
}

/* ------------------------------------------------------- formula injection */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * True when a spreadsheet may read the cell as a formula. The trigger set is
 * OWASP's for CSV injection: = + - @, plus tab and carriage return. A plain
 * signed number such as -5 or +1.5 is exempt, since it parses as a number
 * and nothing more.
 */
export function isFormulaRisk(value: string): boolean {
  return FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value);
}

/** OWASP's mitigation: a leading apostrophe so the cell is read as text. */
export function neutralizeCell(value: string): string {
  return isFormulaRisk(value) ? `'${value}` : value;
}

export interface FormulaHit {
  where: string;
  value: string;
}

/* -------------------------------------------------------------- writers */

/**
 * One CSV field (RFC 4180 section 2, rules 6 and 7). Quoted when it holds
 * the delimiter, a quote or a line break, and also when it starts or ends
 * with a space, which the RFC treats as data but some readers trim.
 */
export function csvField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    /^ | $/.test(value)
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function writeCsv(
  header: string[] | null,
  rows: string[][],
  delimiter: string,
  lineEnding: string,
  neutralize: boolean,
): string {
  let width = header ? header.length : 0;
  for (const r of rows) if (r.length > width) width = r.length;
  const prep = (v: string) => csvField(neutralize ? neutralizeCell(v) : v, delimiter);
  let out = "";
  if (header) {
    const cells: string[] = [];
    for (let j = 0; j < width; j++) cells.push(prep(header[j] ?? ""));
    out += cells.join(delimiter) + lineEnding;
  }
  for (const r of rows) {
    const cells: string[] = [];
    for (let j = 0; j < width; j++) cells.push(prep(r[j] ?? ""));
    out += cells.join(delimiter) + lineEnding;
  }
  return out;
}

/**
 * A pipe in a GitHub Flavored Markdown cell must be written \|, and any
 * backslashes right before it doubled so they stay literal. Line breaks
 * become <br>, since a table row has to stay on one line.
 */
export function markdownCell(value: string): string {
  return value.replace(/(\\*)\|/g, (_m, slashes: string) => `${slashes}${slashes}\\|`).replace(/\r\n|\r|\n/g, "<br>");
}

export function writeMarkdown(header: string[], rows: string[][], rightAlign: boolean[] = []): string {
  let width = header.length;
  for (const r of rows) if (r.length > width) width = r.length;
  if (width === 0) return "";
  const line = (cells: string[]) => {
    const out: string[] = [];
    for (let j = 0; j < width; j++) out.push(markdownCell(cells[j] ?? ""));
    return `| ${out.join(" | ")} |`;
  };
  const rule: string[] = [];
  for (let j = 0; j < width; j++) rule.push(rightAlign[j] ? "---:" : "---");
  const parts = [line(header), `| ${rule.join(" | ")} |`];
  for (const r of rows) parts.push(line(r));
  return parts.join("\n");
}

/** Header names that are unique and never empty. */
export function columnNames(header: string[] | null, width: number): { names: string[]; notes: string[] } {
  const names: string[] = [];
  const used = new Set<string>();
  const notes: string[] = [];
  const dupes = new Map<string, number>();
  for (let j = 0; j < width; j++) {
    let base = header && j < header.length ? header[j] : "";
    if (base === "") {
      base = `column_${j + 1}`;
      if (header && j < header.length) notes.push(`Column ${j + 1} has an empty header, so it is called ${base}.`);
    } else if (used.has(base)) {
      dupes.set(base, (dupes.get(base) ?? 1) + 1);
    }
    let name = base;
    let k = 2;
    while (used.has(name)) name = `${base}_${k++}`;
    used.add(name);
    names.push(name);
  }
  for (const [name, count] of dupes) {
    notes.push(`The header "${clip(name)}" appears ${count} times; the later copies get _2, _3 and so on.`);
  }
  return { names, notes };
}

/* --------------------------------------------------------- conversions */

export type CsvShape = "objects" | "arrays" | "markdown";
export type JsonTarget = "csv" | "markdown";

export interface Preview {
  columns: string[];
  rows: string[][];
  types: ColumnType[] | null;
  /** Data rows in the whole result, not only the ones in the preview. */
  totalRows: number;
}

export interface ConversionOk {
  ok: true;
  output: string;
  preview: Preview;
  issues: Issue[];
  rows: number;
  columns: number;
  delimiter: Delimiter | null;
  delimiterReason: string | null;
  formulaCount: number;
  formulaHits: FormulaHit[];
}

export interface ConversionError {
  ok: false;
  message: string;
  line: number | null;
  column: number | null;
}

export type Conversion = ConversionOk | ConversionError;

export const PREVIEW_ROWS = 100;
export const PREVIEW_COLUMNS = 40;

function tooLong(input: string): ConversionError | null {
  if (input.length <= MAX_INPUT_CHARS) return null;
  return {
    ok: false,
    message: `The input is ${input.length.toLocaleString("en-US")} characters. This tool reads up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    line: null,
    column: null,
  };
}

function formulaSummary(count: number, exporting: boolean, neutralized: boolean): Issue | null {
  if (count === 0) return null;
  const cells = plural(count, "cell");
  if (!exporting) {
    return {
      tone: "warn",
      text: `${cells} ${count === 1 ? "starts" : "start"} with =, +, -, @, a tab or a carriage return. They are inert in JSON, but a spreadsheet that opens them again as CSV may run them as formulas.`,
    };
  }
  if (neutralized) {
    return {
      tone: "info",
      text: `${cells} that ${count === 1 ? "starts" : "start"} like a formula ${count === 1 ? "was" : "were"} prefixed with an apostrophe, so a spreadsheet reads ${count === 1 ? "it" : "them"} as text. The data changed: turn this off for a file meant for a program rather than a spreadsheet.`,
    };
  }
  return {
    tone: "danger",
    text: `${cells} ${count === 1 ? "starts" : "start"} with =, +, -, @, a tab or a carriage return. A spreadsheet that opens this CSV may evaluate ${count === 1 ? "it" : "them"} as ${count === 1 ? "a formula" : "formulas"}. Neutralize them before handing the file to someone who will open it in Excel, LibreOffice or Google Sheets.`,
  };
}

export interface CsvOptions {
  delimiter: Delimiter | "auto";
  header: boolean;
  inferTypes: boolean;
  shape: CsvShape;
}

/** CSV in, JSON (objects or arrays) or a Markdown table out. Never throws. */
export function convertCsv(input: string, opts: CsvOptions): Conversion {
  const long = tooLong(input);
  if (long) return long;

  const detected = opts.delimiter === "auto" ? detectDelimiter(input.replace(/^﻿/, "")) : null;
  const delimiter: Delimiter = detected ? detected.delimiter : (opts.delimiter as Delimiter);
  const parsed = parseCsv(input, delimiter);
  const issues: Issue[] = [];

  if (parsed.rows.length === 0) {
    return { ok: false, message: "No rows found. The input holds only blank lines.", line: null, column: null };
  }

  if (parsed.bom) issues.push({ tone: "info", text: "A UTF-8 byte order mark at the start was removed. Excel writes one; most other tools do not expect it." });
  for (const issue of parsed.issues) issues.push({ tone: issue.tone, text: issue.message });
  if (parsed.issueCount > parsed.issues.length) {
    issues.push({ tone: "warn", text: `${plural(parsed.issueCount - parsed.issues.length, "more quoting problem")} not listed.` });
  }
  if (parsed.blankLines > 0) issues.push({ tone: "info", text: `Skipped ${plural(parsed.blankLines, "blank line")}.` });

  const header = opts.header ? parsed.rows[0] : null;
  const data = opts.header ? parsed.rows.slice(1) : parsed.rows;
  const dataLines = opts.header ? parsed.lines.slice(1) : parsed.lines;

  let width = header ? header.length : 0;
  for (const r of data) if (r.length > width) width = r.length;

  // RFC 4180 section 2 rule 4: every record should have the same number of fields.
  const expected = header ? header.length : data.length ? data[0].length : 0;
  let ragged = 0;
  const raggedListed: string[] = [];
  data.forEach((r, k) => {
    if (r.length === expected) return;
    ragged++;
    if (raggedListed.length < 5) raggedListed.push(`line ${dataLines[k]} has ${r.length}`);
  });
  if (ragged > 0) {
    issues.push({
      tone: "warn",
      text: `${plural(ragged, "row")} ${ragged === 1 ? "has" : "have"} a different number of fields than the ${header ? "header" : "first row"} (${expected}): ${raggedListed.join(", ")}${ragged > raggedListed.length ? ", ..." : ""}. Missing fields become null${header && width > expected ? `, and fields past the header are named column_${expected + 1} onward` : ""}.`,
    });
  }

  const { names, notes } = columnNames(header, width);
  for (const text of notes) issues.push({ tone: "info", text });

  const typing = opts.inferTypes ? inferColumnTypes(data, width) : null;
  const types = typing ? typing.types : null;
  if (typing && typing.unsafeColumns.length) {
    issues.push({
      tone: "info",
      text: `${typing.unsafeColumns.map((j) => `"${clip(names[j])}"`).join(", ")} stayed text because ${typing.unsafeColumns.length === 1 ? "it holds" : "they hold"} numbers a double cannot hold exactly (past 2^53 - 1, or out of range). As text they survive digit for digit.`,
    });
  }

  let output: string;
  if (opts.shape === "markdown") {
    const head = header ? names.map((name, j) => (j < header.length ? header[j] : name)) : names.map((_, j) => `Column ${j + 1}`);
    output = writeMarkdown(head, data, types ? types.map((t) => t === "number") : []);
  } else if (opts.shape === "arrays") {
    const lines: string[] = [];
    if (header) lines.push(`  [${header.map((v) => JSON.stringify(v)).join(", ")}]`);
    for (const r of data) lines.push(`  [${r.map((v, j) => cellJson(v, types ? types[j] : null)).join(", ")}]`);
    output = lines.length ? `[\n${lines.join(",\n")}\n]` : "[]";
  } else {
    const keys = names.map((name) => JSON.stringify(name));
    const objects: string[] = [];
    for (const r of data) {
      if (width === 0) {
        objects.push("  {}");
        continue;
      }
      const members: string[] = [];
      for (let j = 0; j < width; j++) members.push(`    ${keys[j]}: ${cellJson(r[j], types ? types[j] : null)}`);
      objects.push(`  {\n${members.join(",\n")}\n  }`);
    }
    output = objects.length ? `[\n${objects.join(",\n")}\n]` : "[]";
  }

  let formulaCount = 0;
  const formulaHits: FormulaHit[] = [];
  const scan = (value: string, where: () => string) => {
    if (!isFormulaRisk(value)) return;
    formulaCount++;
    if (formulaHits.length < 10) formulaHits.push({ where: where(), value });
  };
  if (header) header.forEach((v, j) => scan(v, () => `header, column ${j + 1}`));
  data.forEach((r, k) => r.forEach((v, j) => scan(v, () => `line ${dataLines[k]}, ${clip(names[j] ?? `column ${j + 1}`, 48)}`)));
  const formulaIssue = formulaSummary(formulaCount, false, false);
  if (formulaIssue) issues.push(formulaIssue);

  return {
    ok: true,
    output,
    preview: {
      columns: names.slice(0, PREVIEW_COLUMNS),
      rows: data.slice(0, PREVIEW_ROWS).map((r) => r.slice(0, PREVIEW_COLUMNS)),
      types: types ? types.slice(0, PREVIEW_COLUMNS) : null,
      totalRows: data.length,
    },
    issues,
    rows: data.length,
    columns: width,
    delimiter,
    delimiterReason: detected ? detected.reason : null,
    formulaCount,
    formulaHits,
  };
}

export interface JsonOptions {
  target: JsonTarget;
  header: boolean;
  delimiter: Delimiter;
  lineEnding: "\r\n" | "\n";
  neutralize: boolean;
}

/** The text a scalar becomes in a cell. Containers come back as compact JSON. */
export function cellText(node: JsonNode): string {
  switch (node.kind) {
    case "string":
      return node.value;
    case "number":
      return node.raw;
    case "boolean":
      return node.value ? "true" : "false";
    case "null":
      return "";
    default:
      return formatJson(node, "", false);
  }
}

/**
 * Flatten one JSON value into dot-path columns: {"a":{"b":1}} becomes a.b,
 * and an array inside an object becomes a.0, a.1. An empty object or array
 * is kept as the text {} or [] so its presence is not lost.
 */
function flatten(node: JsonNode, prefix: string | null, set: (path: string, value: string) => void): void {
  if (node.kind === "object") {
    if (node.members.length === 0) {
      if (prefix !== null) set(prefix, "{}");
      return;
    }
    for (const m of node.members) flatten(m.value, prefix === null ? m.key : `${prefix}.${m.key}`, set);
    return;
  }
  if (node.kind === "array") {
    if (node.items.length === 0) {
      if (prefix !== null) set(prefix, "[]");
      return;
    }
    node.items.forEach((item, k) => flatten(item, prefix === null ? String(k) : `${prefix}.${k}`, set));
    return;
  }
  set(prefix ?? "value", cellText(node));
}

/** A JSON array (of objects, of arrays, or of scalars) in, CSV or a Markdown table out. Never throws. */
export function convertJson(input: string, opts: JsonOptions): Conversion {
  const long = tooLong(input);
  if (long) return long;

  const parsed = parseJson(input);
  if (!parsed.ok) {
    return { ok: false, message: parsed.error.message, line: parsed.error.line, column: parsed.error.column };
  }
  const issues: Issue[] = [];
  if (parsed.bom) issues.push({ tone: "info", text: "A byte order mark at the start was ignored." });

  const root = parsed.root;
  let elements: JsonNode[];
  if (root.kind === "array") elements = root.items;
  else if (root.kind === "object") {
    elements = [root];
    issues.push({ tone: "info", text: "The input is a single object, so it became a single row." });
  } else {
    return {
      ok: false,
      message: `The input is valid JSON, but it is a single ${root.kind}. A table needs an array of objects, an array of arrays, or one object.`,
      line: null,
      column: null,
    };
  }

  if (parsed.warnings.numberCount > 0) {
    issues.push({
      tone: "info",
      text: `${plural(parsed.warnings.numberCount, "number")} ${parsed.warnings.numberCount === 1 ? "is" : "are"} past what a double holds exactly. ${parsed.warnings.numberCount === 1 ? "It was" : "They were"} copied digit for digit, so the CSV keeps the exact value.`,
    });
  }

  let header: string[] | null;
  let rows: string[][];
  let columns: string[];

  const allArrays = elements.length > 0 && elements.every((e) => e.kind === "array");
  if (allArrays) {
    rows = elements.map((e) => (e.kind === "array" ? e.items.map(cellText) : []));
    let width = 0;
    for (const r of rows) if (r.length > width) width = r.length;
    const ragged = rows.filter((r) => r.length !== width).length;
    if (ragged > 0) {
      issues.push({
        tone: "warn",
        text: `${plural(ragged, "row")} ${ragged === 1 ? "is" : "are"} shorter than the longest (${width} items). ${ragged === 1 ? "It was" : "They were"} padded with empty cells.`,
      });
    }
    if (rows.length * width > MAX_CELLS) {
      const keep = Math.max(1, Math.floor(MAX_CELLS / Math.max(1, width)));
      issues.push({
        tone: "warn",
        text: `The table would hold ${(rows.length * width).toLocaleString("en-US")} cells. Only the first ${plural(keep, "row")} were converted, to stay under ${MAX_CELLS.toLocaleString("en-US")}.`,
      });
      rows = rows.slice(0, keep);
    }
    if (opts.header && rows.length > 0) {
      header = rows[0];
      rows = rows.slice(1);
    } else header = null;
    columns = [];
    for (let j = 0; j < width; j++) columns.push(header && j < header.length && header[j] !== "" ? header[j] : `Column ${j + 1}`);
    if (!opts.header && opts.target === "csv") header = null;
  } else {
    const index = new Map<string, number>();
    const dropped = new Set<string>();
    let collisions = 0;
    const collisionListed: string[] = [];
    let nonObjects = 0;
    const built: string[][] = [];
    elements.forEach((element, k) => {
      if (element.kind !== "object") nonObjects++;
      const cells: string[] = [];
      flatten(element, null, (path, value) => {
        let j = index.get(path);
        if (j === undefined) {
          if (index.size >= MAX_COLUMNS) {
            if (dropped.size < 100000) dropped.add(path);
            return;
          }
          j = index.size;
          index.set(path, j);
        }
        if (cells[j] !== undefined) {
          collisions++;
          if (collisionListed.length < 5) collisionListed.push(`row ${k + 1}, "${clip(path)}"`);
        }
        cells[j] = value;
      });
      built.push(cells);
    });
    columns = Array.from(index.keys());
    rows = built;
    if (nonObjects > 0) {
      issues.push({
        tone: "warn",
        text: `${plural(nonObjects, "item")} in the array ${nonObjects === 1 ? "is" : "are"} not an object. Scalars went into a column named value, and arrays into columns named by index.`,
      });
    }
    if (collisions > 0) {
      issues.push({
        tone: "warn",
        text: `${plural(collisions, "value")} landed on a column another value in the same row already filled (${collisionListed.join(", ")}${collisions > collisionListed.length ? ", ..." : ""}). That happens with a duplicate key, or with a key that contains a dot, such as "a.b" next to {"a":{"b":...}}. The later value was kept, as JSON.parse would keep it.`,
      });
    }
    if (dropped.size > 0) {
      issues.push({
        tone: "warn",
        text: `Flattening produced more than ${MAX_COLUMNS.toLocaleString("en-US")} columns. The first ${MAX_COLUMNS.toLocaleString("en-US")} were kept and ${plural(dropped.size, "other path")} dropped.`,
      });
    }
    if (rows.length * columns.length > MAX_CELLS) {
      const keep = Math.max(1, Math.floor(MAX_CELLS / Math.max(1, columns.length)));
      issues.push({
        tone: "warn",
        text: `The table would hold ${(rows.length * columns.length).toLocaleString("en-US")} cells. Only the first ${plural(keep, "row")} were converted, to stay under ${MAX_CELLS.toLocaleString("en-US")}.`,
      });
      rows = rows.slice(0, keep);
    }
    header = opts.header || opts.target === "markdown" ? columns : null;
    if (columns.length === 0 && elements.length > 0) {
      issues.push({ tone: "info", text: "Every object is empty, so there are no columns." });
    }
  }

  // Padding to the full width keeps every record the same length (RFC 4180 rule 4).
  const width = columns.length;
  rows = rows.map((r) => {
    const out: string[] = [];
    for (let j = 0; j < width; j++) out.push(r[j] ?? "");
    return out;
  });

  let formulaCount = 0;
  const formulaHits: FormulaHit[] = [];
  const scan = (value: string, where: () => string) => {
    if (!isFormulaRisk(value)) return;
    formulaCount++;
    if (formulaHits.length < 10) formulaHits.push({ where: where(), value });
  };
  if (header) header.forEach((v, j) => scan(v, () => `header, column ${j + 1}`));
  rows.forEach((r, k) => r.forEach((v, j) => scan(v, () => `row ${k + 1}, ${clip(columns[j] ?? `column ${j + 1}`, 48)}`)));

  const exporting = opts.target === "csv";
  const neutralize = exporting && opts.neutralize;
  let output: string;
  if (width === 0) output = "";
  else if (opts.target === "markdown") output = writeMarkdown(header ?? columns, rows);
  else output = writeCsv(header, rows, opts.delimiter, opts.lineEnding, neutralize);
  if (elements.length === 0) {
    issues.push({ tone: "info", text: "The array is empty, so there are no rows." });
  }
  const formulaIssue = formulaSummary(formulaCount, exporting, neutralize);
  if (formulaIssue) issues.push(formulaIssue);

  const show = (v: string) => (neutralize ? neutralizeCell(v) : v);
  return {
    ok: true,
    output,
    preview: {
      columns: columns.slice(0, PREVIEW_COLUMNS).map(show),
      rows: rows.slice(0, PREVIEW_ROWS).map((r) => r.slice(0, PREVIEW_COLUMNS).map(show)),
      types: null,
      totalRows: rows.length,
    },
    issues,
    rows: rows.length,
    columns: width,
    delimiter: exporting ? opts.delimiter : null,
    delimiterReason: null,
    formulaCount,
    formulaHits,
  };
}
