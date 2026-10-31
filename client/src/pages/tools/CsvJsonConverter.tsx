/**
 * CSV and JSON converter.
 *
 * The reading and writing live in lib/toolkit/csv-json-converter: an RFC 4180
 * CSV reader that reports where a file departs from the RFC instead of
 * failing on it, delimiter detection by trial parsing, per-column type
 * inference, dot-path flattening for nested JSON, and the CSV injection
 * check. This file holds the two directions' inputs and options and shows
 * the result as text and as a table.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  DELIMITERS,
  MAX_INPUT_CHARS,
  PREVIEW_COLUMNS,
  PREVIEW_ROWS,
  convertCsv,
  convertJson,
  delimiterName,
  type CsvShape,
  type Delimiter,
  type JsonTarget,
  type Tone,
} from "@/lib/toolkit/csv-json-converter";
import { utf8Length } from "@/lib/toolkit/json-formatter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ACTION_CLASS = `inline-flex min-h-[28px] items-center rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;

const segmentClass = (on: boolean) =>
  `inline-flex min-h-[40px] items-center justify-center rounded-lg border px-3 py-1 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors ${FOCUS} ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
  }`;

const toggleClass = (on: boolean) =>
  `flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 font-mono-tight text-xs leading-relaxed transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))]"
  }`;

const TONE_STYLE: Record<Tone, string> = {
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const TONE_ORDER: Record<Tone, number> = { danger: 0, warn: 1, info: 2 };

/* ------------------------------------------------------------- constants */

type Direction = "csv" | "json";

/** Characters of output drawn on the page. Copy and download carry all of it. */
const OUTPUT_PREVIEW_CHARS = 200_000;

/** Characters of one cell drawn in the preview table. */
const CELL_PREVIEW_CHARS = 160;

/** Files larger than this are refused before being read. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const CSV_EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Inventory",
    value: `asset,host,ip,role,notes,port,patched
0041,web-01,10.0.1.10,frontend,"nginx, behind the load balancer",443,true
0042,web-02,10.0.1.11,frontend,"marked ""temporary"" in 2019",443,false
0043,db-01,10.0.2.20,database,"primary
replica on db-02",5432,true
0044,jump-01,10.0.0.5,bastion,=cmd|' /C calc'!A0,22,TRUE
`,
  },
  {
    label: "Semicolons",
    value: `date;amount;account;reference
2026-10-01;1234,56;rent;"INV-0091; October"
2026-10-03;89,90;power;AUTO
2026-10-07;12;coffee;
`,
  },
  {
    label: "Tabs",
    value: "user\tuid\tgid\thome\tshell\nroot\t0\t0\t/root\t/bin/bash\nwww-data\t33\t33\t/var/www\t/usr/sbin/nologin\nmax\t1000\t1000\t/home/max\t/bin/zsh\n",
  },
];

const JSON_EXAMPLES: { label: string; value: string }[] = [
  {
    label: "Nested objects",
    value: `[
  {"id": 1793836720485339137, "user": {"login": "ada", "roles": ["admin", "deploy"]}, "active": true, "last_login": null},
  {"id": 1793836720485339138, "user": {"login": "grace", "roles": ["read"]}, "active": false, "note": "=HYPERLINK(\\"http://example.com\\",\\"open\\")"},
  {"id": 1793836720485339139, "user": {"login": "linus, t", "roles": []}, "active": true, "meta": {}}
]`,
  },
  {
    label: "Array of arrays",
    value: `[
  ["host", "port", "proto"],
  ["web-01", 443, "tcp"],
  ["dns-01", 53, "udp"],
  ["db-01", 5432, "tcp"]
]`,
  },
];

const CSV_SHAPES: { value: CsvShape; label: string }[] = [
  { value: "objects", label: "Objects" },
  { value: "arrays", label: "Arrays" },
  { value: "markdown", label: "Markdown" },
];

const JSON_TARGETS: { value: JsonTarget; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "markdown", label: "Markdown" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n.toLocaleString("en-US")} ${pluralise(n, "byte")}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Make invisible characters in a preview cell visible without changing the data. */
function showCell(value: string): string {
  const clipped = value.length > CELL_PREVIEW_CHARS ? `${value.slice(0, CELL_PREVIEW_CHARS)}...` : value;
  return clipped.replace(/\t/g, "→").replace(/\r\n|\r|\n/g, "↵");
}

/* ------------------------------------------------------------------ view */

export function CsvJsonConverter() {
  const [direction, setDirection] = useState<Direction>("csv");
  const [csvText, setCsvText] = useState(CSV_EXAMPLES[0].value);
  const [jsonText, setJsonText] = useState(JSON_EXAMPLES[0].value);

  const [csvDelimiter, setCsvDelimiter] = useState<Delimiter | "auto">("auto");
  const [csvHeader, setCsvHeader] = useState(true);
  const [inferTypes, setInferTypes] = useState(true);
  const [shape, setShape] = useState<CsvShape>("objects");

  const [target, setTarget] = useState<JsonTarget>("csv");
  const [jsonHeader, setJsonHeader] = useState(true);
  const [outDelimiter, setOutDelimiter] = useState<Delimiter>(",");
  const [lineEnding, setLineEnding] = useState<"\r\n" | "\n">("\r\n");
  const [neutralize, setNeutralize] = useState(false);

  const [fileNote, setFileNote] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  const text = direction === "csv" ? csvText : jsonText;
  const setText = direction === "csv" ? setCsvText : setJsonText;
  const deferred = useDeferredValue(text);
  const deferredDirection = useDeferredValue(direction);

  const result = useMemo(() => {
    if (deferred.trim() === "") return null;
    if (deferredDirection === "csv") {
      return convertCsv(deferred, { delimiter: csvDelimiter, header: csvHeader, inferTypes, shape });
    }
    return convertJson(deferred, { target, header: jsonHeader, delimiter: outDelimiter, lineEnding, neutralize });
  }, [deferred, deferredDirection, csvDelimiter, csvHeader, inferTypes, shape, target, jsonHeader, outDelimiter, lineEnding, neutralize]);

  const ok = result && result.ok ? result : null;
  const failed = result && !result.ok ? result : null;
  const issues = useMemo(
    () => (ok ? ok.issues.slice().sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]) : []),
    [ok],
  );

  const outputKind: "json" | "csv" | "markdown" =
    deferredDirection === "csv" ? (shape === "markdown" ? "markdown" : "json") : target === "markdown" ? "markdown" : "csv";

  function download() {
    if (!ok || ok.output === "") return;
    const meta =
      outputKind === "json"
        ? { type: "application/json", name: "converted.json" }
        : outputKind === "csv"
          ? { type: outDelimiter === "\t" ? "text/tab-separated-values" : "text/csv", name: outDelimiter === "\t" ? "converted.tsv" : "converted.csv" }
          : { type: "text/markdown", name: "table.md" };
    try {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(new Blob([ok.output], { type: `${meta.type};charset=utf-8` }));
      downloadUrl.current = url;
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDownloadError(null);
    } catch {
      setDownloadError("This browser would not create the file. Copy the text instead.");
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(`${file.name} is ${formatBytes(file.size)}. Files up to ${formatBytes(MAX_FILE_BYTES)} are read.`);
      return;
    }
    try {
      const content = await file.text();
      if (!alive.current) return;
      setFileNote(`Read ${file.name} (${formatBytes(file.size)}) from your disk. It was not uploaded.`);
      setText(content);
    } catch {
      if (alive.current) setFileNote(`${file.name} could not be read.`);
    }
  }

  function sendBack() {
    if (!ok) return;
    if (direction === "csv" && outputKind === "json") {
      setJsonText(ok.output);
      setDirection("json");
    } else if (direction === "json" && outputKind === "csv") {
      setCsvText(ok.output);
      setCsvDelimiter("auto");
      setDirection("csv");
    }
    setFileNote(null);
  }

  let summary: string;
  if (!result) summary = direction === "csv" ? "Paste CSV to convert it." : "Paste a JSON array to convert it.";
  else if (failed) {
    summary = failed.line !== null ? `Not valid JSON: line ${failed.line}, column ${failed.column}.` : "Nothing converted.";
  } else if (ok) {
    const parts = [`${ok.rows.toLocaleString("en-US")} ${pluralise(ok.rows, "row")}`, `${ok.columns.toLocaleString("en-US")} ${pluralise(ok.columns, "column")}`];
    if (ok.delimiterReason && ok.delimiter) parts.push(`${delimiterName(ok.delimiter)} detected`);
    if (ok.formulaCount) parts.push(`${ok.formulaCount} formula-like ${pluralise(ok.formulaCount, "cell")}`);
    summary = `Converted. ${parts.join(", ")}.`;
  } else summary = "";

  const examples = direction === "csv" ? CSV_EXAMPLES : JSON_EXAMPLES;
  const shownOutput = ok && ok.output.length > OUTPUT_PREVIEW_CHARS ? ok.output.slice(0, OUTPUT_PREVIEW_CHARS) : ok?.output ?? "";
  const canSendBack = ok !== null && ok.output !== "" && outputKind !== "markdown" && deferredDirection === direction;

  return (
    <ToolShell slug="csv-json-converter">
      <div className="space-y-6">
        <ToolPanel title="Direction">
          <div role="group" aria-label="Conversion direction" className="grid grid-cols-2 gap-2 sm:max-w-md">
            {(
              [
                { value: "csv", label: "CSV to JSON" },
                { value: "json", label: "JSON to CSV" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setDirection(option.value);
                  setFileNote(null);
                }}
                aria-pressed={direction === option.value}
                data-testid={`button-direction-${option.value}`}
                className={segmentClass(direction === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        <ToolPanel title="Input">
          <label htmlFor="csv-json-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            {direction === "csv" ? "Paste CSV or TSV" : "Paste a JSON array of objects or of arrays"}
          </label>
          <textarea
            id="csv-json-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={failed !== null}
            aria-describedby="csv-json-hint"
            placeholder={direction === "csv" ? "host,ip,port\nweb-01,10.0.1.10,443" : '[{"host": "web-01", "port": 443}]'}
            data-testid="input-csv-json"
            className={`${FIELD_CLASS} mt-3 resize-y text-xs leading-relaxed`}
          />
          <p id="csv-json-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {direction === "csv"
              ? "Quoted fields, doubled quotes, embedded delimiters and line breaks, and CRLF, LF or CR line endings are read per RFC 4180."
              : "Nested objects flatten to dot paths (user.login, roles.0). Numbers are copied digit for digit."}{" "}
            Up to {MAX_INPUT_CHARS.toLocaleString("en-US")} characters.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setText(example.value);
                  setFileNote(null);
                  if (direction === "csv") setCsvDelimiter("auto");
                }}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
            {text ? (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setFileNote(null);
                }}
                data-testid="button-clear"
                className={CHIP_CLASS}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-5">
            <label htmlFor="csv-json-file" className={LABEL_CLASS}>
              Or open a file
            </label>
            <input
              id="csv-json-file"
              type="file"
              accept={direction === "csv" ? ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" : ".json,application/json,text/plain"}
              onChange={onFile}
              data-testid="input-csv-json-file"
              className="mt-2 block w-full min-h-[40px] font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))] file:mr-4 file:min-h-[40px] file:rounded-full file:border-0 file:bg-[hsl(var(--brand-iron))] file:px-4 file:font-mono-tight file:text-[0.625rem] file:uppercase file:text-[hsl(var(--brand-bone))]"
            />
            {fileNote ? (
              <p className="mt-2 break-words font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-file-note">
                {fileNote}
              </p>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Options">
          {direction === "csv" ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="csv-delimiter" className={LABEL_CLASS}>
                  Delimiter
                </label>
                <select
                  id="csv-delimiter"
                  value={csvDelimiter}
                  onChange={(event) => setCsvDelimiter(event.target.value as Delimiter | "auto")}
                  data-testid="select-csv-delimiter"
                  className={`${FIELD_CLASS} mt-3 text-sm`}
                >
                  <option value="auto">Detect automatically</option>
                  {DELIMITERS.map((d) => (
                    <option key={d.label} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {ok && ok.delimiterReason ? (
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]" data-testid="text-delimiter-reason">
                    {ok.delimiterReason}
                  </p>
                ) : null}
              </div>
              <div>
                <div id="csv-shape-label" className={LABEL_CLASS}>
                  Output
                </div>
                <div role="group" aria-labelledby="csv-shape-label" className="mt-3 grid grid-cols-3 gap-2">
                  {CSV_SHAPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setShape(option.value)}
                      aria-pressed={shape === option.value}
                      data-testid={`button-shape-${option.value}`}
                      className={segmentClass(shape === option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className={toggleClass(csvHeader)}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={csvHeader}
                  onChange={(event) => setCsvHeader(event.target.checked)}
                  data-testid="checkbox-csv-header"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {csvHeader ? "[x]" : "[ ]"}
                </span>
                First row is a header (its fields become the keys)
              </label>
              <label className={toggleClass(inferTypes)}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={inferTypes}
                  onChange={(event) => setInferTypes(event.target.checked)}
                  data-testid="checkbox-infer-types"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {inferTypes ? "[x]" : "[ ]"}
                </span>
                Infer numbers and booleans per column (empty cells become null)
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <div id="json-target-label" className={LABEL_CLASS}>
                  Output
                </div>
                <div role="group" aria-labelledby="json-target-label" className="mt-3 grid grid-cols-2 gap-2">
                  {JSON_TARGETS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTarget(option.value)}
                      aria-pressed={target === option.value}
                      data-testid={`button-target-${option.value}`}
                      className={segmentClass(target === option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {target === "csv" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="json-delimiter" className={LABEL_CLASS}>
                      Delimiter
                    </label>
                    <select
                      id="json-delimiter"
                      value={outDelimiter}
                      onChange={(event) => setOutDelimiter(event.target.value as Delimiter)}
                      data-testid="select-json-delimiter"
                      className={`${FIELD_CLASS} mt-3 text-sm`}
                    >
                      {DELIMITERS.map((d) => (
                        <option key={d.label} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div id="json-eol-label" className={LABEL_CLASS}>
                      Line ending
                    </div>
                    <div role="group" aria-labelledby="json-eol-label" className="mt-3 grid grid-cols-2 gap-2">
                      {(
                        [
                          { value: "\r\n", label: "CRLF" },
                          { value: "\n", label: "LF" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setLineEnding(option.value)}
                          aria-pressed={lineEnding === option.value}
                          data-testid={`button-eol-${option.label.toLowerCase()}`}
                          className={segmentClass(lineEnding === option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))] md:pt-6">
                  GitHub Flavored Markdown. Pipes in cells are escaped and line breaks become {"<br>"}.
                </p>
              )}
              <label className={toggleClass(jsonHeader)}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={jsonHeader}
                  onChange={(event) => setJsonHeader(event.target.checked)}
                  data-testid="checkbox-json-header"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {jsonHeader ? "[x]" : "[ ]"}
                </span>
                Header row (column names for objects; for an array of arrays, the first array)
              </label>
              {target === "csv" ? (
                <label className={toggleClass(neutralize)}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={neutralize}
                    onChange={(event) => setNeutralize(event.target.checked)}
                    data-testid="checkbox-neutralize"
                  />
                  <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                    {neutralize ? "[x]" : "[ ]"}
                  </span>
                  Neutralize formulas: prefix cells that start with = + - @ tab or CR with an apostrophe
                </label>
              ) : null}
            </div>
          )}
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {failed ? (
          <div
            role="alert"
            data-testid="text-convert-error"
            className="rounded-2xl border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-5"
          >
            {failed.line !== null ? (
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
                Line {failed.line}, column {failed.column}
              </div>
            ) : null}
            <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
              {failed.message}
            </p>
          </div>
        ) : null}

        {ok ? (
          <>
            {issues.length ? (
              <ToolPanel title="Notes on this input">
                <ul className="space-y-2" data-testid="list-issues">
                  {issues.map((issue, i) => (
                    <li
                      key={i}
                      className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[issue.tone]}`}
                    >
                      {issue.text}
                    </li>
                  ))}
                </ul>
                {ok.formulaHits.length ? (
                  <div className="mt-4">
                    <div className={LABEL_CLASS}>Formula-like cells</div>
                    <ul className="mt-2 space-y-1" data-testid="list-formula-cells">
                      {ok.formulaHits.map((hit, i) => (
                        <li key={i} className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          <span className="text-[hsl(var(--brand-ash))]">{hit.where}: </span>
                          <code className="text-[hsl(var(--brand-amber))]">{showCell(hit.value)}</code>
                        </li>
                      ))}
                    </ul>
                    {ok.formulaCount > ok.formulaHits.length ? (
                      <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        The first {ok.formulaHits.length} of {ok.formulaCount.toLocaleString("en-US")} are listed.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </ToolPanel>
            ) : null}

            <ToolPanel title={outputKind === "json" ? "JSON" : outputKind === "csv" ? "CSV" : "Markdown"}>
              {ok.output === "" ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">There is nothing to write.</p>
              ) : (
                <pre
                  data-testid="output-csv-json"
                  className="max-h-[32rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
                >
                  {shownOutput}
                </pre>
              )}
              {ok.output.length > OUTPUT_PREVIEW_CHARS ? (
                <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Showing the first {OUTPUT_PREVIEW_CHARS.toLocaleString("en-US")} of {ok.output.length.toLocaleString("en-US")}{" "}
                  characters. Copy and download take the whole text.
                </p>
              ) : null}
              {ok.output !== "" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CopyButton value={ok.output} label="Copy the converted output" testId="button-copy-output">
                    <span>Copy</span>
                  </CopyButton>
                  <button type="button" onClick={download} data-testid="button-download" className={ACTION_CLASS}>
                    Download
                  </button>
                  {canSendBack ? (
                    <button type="button" onClick={sendBack} data-testid="button-send-back" className={ACTION_CLASS}>
                      {outputKind === "json" ? "Use as JSON input" : "Use as CSV input"}
                    </button>
                  ) : null}
                  {downloadError ? (
                    <span className="font-mono-tight text-xs text-[hsl(var(--brand-danger))]">{downloadError}</span>
                  ) : null}
                </div>
              ) : null}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <ToolPanel title="Shape">
                <ToolResult label="Rows" value={ok.rows.toLocaleString("en-US")} testId="text-rows" />
                <ToolResult label="Columns" value={ok.columns.toLocaleString("en-US")} testId="text-columns" />
                {ok.delimiter ? <ToolResult label="Delimiter" value={delimiterName(ok.delimiter)} testId="text-delimiter" /> : null}
                <ToolResult label="Output size" value={formatBytes(utf8Length(ok.output))} />
              </ToolPanel>
              <ToolPanel title="Preview" className="md:col-span-2">
                {ok.preview.columns.length === 0 ? (
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No columns to show.</p>
                ) : (
                  <>
                    <div className="max-h-[28rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))]">
                      <table className="w-full min-w-max border-collapse text-left" data-testid="table-preview">
                        <thead className="sticky top-0 bg-[hsl(var(--brand-graphite))]">
                          <tr className="border-b border-[hsl(var(--brand-iron))]">
                            <th
                              scope="col"
                              className="px-3 py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
                            >
                              #
                            </th>
                            {ok.preview.columns.map((column, j) => (
                              <th key={j} scope="col" className="px-3 py-2 align-bottom">
                                <span className="block max-w-[16rem] break-words font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]">
                                  {showCell(column)}
                                </span>
                                {ok.preview.types ? (
                                  <span className="block font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                                    {ok.preview.types[j]}
                                  </span>
                                ) : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ok.preview.rows.map((row, k) => (
                            <tr key={k} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                              <td className="px-3 py-1.5 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{k + 1}</td>
                              {ok.preview.columns.map((_, j) => (
                                <td
                                  key={j}
                                  className="max-w-[16rem] break-words px-3 py-1.5 font-mono-tight text-xs text-[hsl(var(--brand-bone))]"
                                >
                                  {j < row.length ? showCell(row[j]) : ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      {ok.preview.totalRows > PREVIEW_ROWS
                        ? `The first ${PREVIEW_ROWS} of ${ok.preview.totalRows.toLocaleString("en-US")} rows. `
                        : ""}
                      {ok.columns > PREVIEW_COLUMNS ? `The first ${PREVIEW_COLUMNS} of ${ok.columns.toLocaleString("en-US")} columns. ` : ""}
                      Tabs show as {"→"} and line breaks inside a cell as {"↵"}.
                    </p>
                  </>
                )}
              </ToolPanel>
            </div>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
