/**
 * Markdown table generator.
 *
 * The grid is the single source of truth: one header row, body rows and a
 * per-column alignment. Pasted CSV, TSV or an existing Markdown table is
 * parsed into it, and both outputs (GFM Markdown and HTML) are derived from
 * it, so they cannot disagree. Parsing and formatting live in
 * lib/toolkit/markdown-table-generator so they can be unit tested.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  FORMAT_LABELS,
  MAX_COLS,
  MAX_IMPORT_CHARS,
  MAX_ROWS,
  addColumn,
  addRow,
  detectFormat,
  emptyTable,
  importTable,
  removeColumn,
  removeRow,
  setAlign,
  setCell,
  toHtml,
  toMarkdown,
  widthWarnings,
  type Align,
  type Format,
  type Table,
} from "@/lib/toolkit/markdown-table-generator";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_CLASS =
  "mt-1.5 min-h-[40px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CELL_CLASS =
  "min-h-[36px] w-full min-w-[8rem] rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-2.5 py-1.5 font-mono-tight text-xs text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const HEADER_CELL_CLASS = `${CELL_CLASS} font-medium`;
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY_CLASS =
  "inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.12)] px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ICON_BUTTON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-30";
const TOGGLE_CLASS =
  "flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const CHECKBOX_CLASS = "h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]";
const PRE_WRAP_CLASS = "overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]";
const PRE_CLASS = "w-max min-w-full p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";

const ALIGN_OPTIONS: { value: Align; label: string }[] = [
  { value: "none", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: "auto", label: "Detect automatically" },
  { value: "csv", label: FORMAT_LABELS.csv },
  { value: "semicolon", label: FORMAT_LABELS.semicolon },
  { value: "tsv", label: FORMAT_LABELS.tsv },
  { value: "markdown", label: FORMAT_LABELS.markdown },
];

const INITIAL: Table = {
  header: ["Service", "Port", "Protocol"],
  rows: [
    ["SSH", "22", "TCP"],
    ["DNS", "53", "UDP, TCP"],
    ["HTTPS", "443", "TCP"],
    ["Syslog", "514", "UDP"],
  ],
  align: ["left", "right", "center"],
};

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "CSV",
    text: 'host,role,ip,notes\nweb-01,frontend,192.0.2.10,"nginx, behind the load balancer"\ndb-01,database,192.0.2.20,"replica of db-00 | read only"\nbastion,jump host,198.51.100.5,"key auth only,\nno passwords"\n',
  },
  {
    label: "Spreadsheet paste",
    text: "Port\tState\tService\n22/tcp\topen\tssh\n80/tcp\tclosed\thttp\n443/tcp\topen\thttps\n3389/tcp\tfiltered\tms-wbt-server\n",
  },
  {
    label: "Messy Markdown",
    text: "Status codes worth knowing:\n\nCode|Meaning|Retry?\n:--|---|:-:\n200|OK|n/a\n429|Too Many Requests|after Retry-After\n503|Service Unavailable|yes\n\nThat is all.\n",
  },
];

function Toggle({
  checked,
  onChange,
  label,
  testId,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <label className={`${TOGGLE_CLASS} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
        className={CHECKBOX_CLASS}
      />
      {label}
    </label>
  );
}

/** One body row. Memoized so typing in one cell does not re-render every other row. */
const GridRow = memo(function GridRow({
  cells,
  rowIndex,
  onCell,
  onRemove,
}: {
  cells: string[];
  rowIndex: number;
  onCell: (row: number, col: number, value: string) => void;
  onRemove: (row: number) => void;
}) {
  return (
    <tr>
      {cells.map((cell, col) => (
        <td key={col} className="p-1">
          <input
            type="text"
            value={cell}
            onChange={(event) => onCell(rowIndex, col, event.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={`Row ${rowIndex + 1}, column ${col + 1}`}
            data-testid={`input-cell-${rowIndex}-${col}`}
            className={CELL_CLASS}
          />
        </td>
      ))}
      <td className="p-1">
        <button
          type="button"
          onClick={() => onRemove(rowIndex)}
          aria-label={`Remove row ${rowIndex + 1}`}
          data-testid={`button-remove-row-${rowIndex}`}
          className={ICON_BUTTON_CLASS}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
});

type ImportMessage = { kind: "error"; text: string } | { kind: "ok"; text: string; notes: string[] } | null;

export function MarkdownTableGenerator() {
  const [table, setTable] = useState<Table>(INITIAL);
  const [padded, setPadded] = useState(true);
  const [alignAs, setAlignAs] = useState<"attribute" | "style">("attribute");
  const [importText, setImportText] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [headerRow, setHeaderRow] = useState(true);
  const [message, setMessage] = useState<ImportMessage>(null);

  const markdown = useMemo(() => toMarkdown(table, padded), [table, padded]);
  const html = useMemo(() => toHtml(table, alignAs), [table, alignAs]);
  const warnings = useMemo(() => widthWarnings(table), [table]);
  // Detection scans the whole paste, so it is memoized (cell edits re-render
  // this page) and skipped for text over the import limit, which Load refuses.
  const effectiveFormat = useMemo(() => {
    if (format !== "auto") return format;
    if (importText.length > MAX_IMPORT_CHARS || importText.trim() === "") return null;
    return detectFormat(importText);
  }, [format, importText]);

  const onCell = useCallback((row: number, col: number, value: string) => {
    setTable((current) => setCell(current, row, col, value));
  }, []);
  const onRemoveRow = useCallback((row: number) => {
    setTable((current) => removeRow(current, row));
  }, []);

  function load(text: string, chosen: Format, header: boolean) {
    const result = importTable(text, chosen, header);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.message });
      return;
    }
    setTable(result.table);
    const rows = result.table.rows.length;
    const cols = result.table.header.length;
    setMessage({
      kind: "ok",
      text: `Loaded ${rows} ${rows === 1 ? "row" : "rows"} and ${cols} ${cols === 1 ? "column" : "columns"} as ${FORMAT_LABELS[result.format]}.`,
      notes: result.notes,
    });
  }

  function loadExample(text: string) {
    setImportText(text);
    setFormat("auto");
    setHeaderRow(true);
    load(text, "auto", true);
  }

  const cols = table.header.length;
  const rowCount = table.rows.length;

  return (
    <ToolShell slug="markdown-table-generator">
      <div className="space-y-6">
        <ToolPanel title="Load data">
          <label htmlFor="mdt-import" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Paste CSV, TSV or a Markdown table
          </label>
          <textarea
            id="mdt-import"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={6}
            wrap="off"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="mdt-import-message"
            placeholder={"name,port\nssh,22"}
            data-testid="input-markdown-import"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <div className="min-w-0">
              <label htmlFor="mdt-format" className={LABEL_CLASS}>
                Format
              </label>
              <select
                id="mdt-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as Format)}
                data-testid="select-format"
                className={FIELD_CLASS}
              >
                {FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Toggle
              checked={headerRow}
              onChange={setHeaderRow}
              label="First row is the header"
              testId="checkbox-header-row"
              disabled={effectiveFormat === "markdown"}
            />
            <button
              type="button"
              onClick={() => load(importText, format, headerRow)}
              data-testid="button-load"
              className={PRIMARY_CLASS}
            >
              Load into the grid
            </button>
          </div>

          <div id="mdt-import-message" className="mt-3">
            {message?.kind === "error" ? (
              <p
                role="alert"
                data-testid="text-import-error"
                className="flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                <span aria-hidden="true">✕</span>
                <span className="min-w-0 break-words">{message.text}</span>
              </p>
            ) : message?.kind === "ok" ? (
              <div role="status" data-testid="text-import-status">
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">{message.text}</p>
                {message.notes.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    {message.notes.map((note) => (
                      <li key={note} className="break-words">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {effectiveFormat && format === "auto"
                  ? `Looks like ${FORMAT_LABELS[effectiveFormat]}. Loading replaces the grid below.`
                  : "CSV follows RFC 4180, so quoted fields may hold commas, quotes and line breaks. Loading replaces the grid below."}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => loadExample(example.text)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        <ToolPanel title="Table">
          {/* relative: the sr-only header below is absolutely positioned and would
              otherwise escape this scroller and widen the whole page. */}
          <div className="relative overflow-x-auto pb-1">
            <table className="w-max min-w-full border-separate border-spacing-0" data-testid="table-grid">
              <thead>
                <tr>
                  {table.align.map((align, col) => (
                    <th key={col} scope="col" className="p-1 text-left font-normal">
                      <div className="flex items-center gap-1">
                        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {col + 1}
                        </span>
                        <select
                          value={align}
                          onChange={(event) => setTable((current) => setAlign(current, col, event.target.value as Align))}
                          aria-label={`Alignment of column ${col + 1}`}
                          data-testid={`select-align-${col}`}
                          className="min-h-[32px] min-w-0 flex-1 rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-1.5 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                        >
                          {ALIGN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setTable((current) => removeColumn(current, col))}
                          disabled={cols <= 1}
                          aria-label={`Remove column ${col + 1}`}
                          data-testid={`button-remove-col-${col}`}
                          className={ICON_BUTTON_CLASS}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th scope="col" className="p-1">
                    <span className="sr-only">Row actions</span>
                  </th>
                </tr>
                <tr>
                  {table.header.map((cell, col) => (
                    <td key={col} className="p-1">
                      <input
                        type="text"
                        value={cell}
                        onChange={(event) => onCell(-1, col, event.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={`Header ${col + 1}`}
                        aria-label={`Header, column ${col + 1}`}
                        data-testid={`input-header-${col}`}
                        className={HEADER_CELL_CLASS}
                      />
                    </td>
                  ))}
                  <td className="p-1" />
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <GridRow key={rowIndex} cells={row} rowIndex={rowIndex} onCell={onCell} onRemove={onRemoveRow} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTable((current) => addRow(current))}
              disabled={rowCount >= MAX_ROWS}
              data-testid="button-add-row"
              className={CHIP_CLASS}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add row
            </button>
            <button
              type="button"
              onClick={() => setTable((current) => addColumn(current))}
              disabled={cols >= MAX_COLS}
              data-testid="button-add-column"
              className={CHIP_CLASS}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add column
            </button>
            <button
              type="button"
              onClick={() =>
                setTable((current) => ({
                  ...emptyTable(current.header.length, current.rows.length),
                  align: current.align,
                }))
              }
              data-testid="button-clear"
              className={CHIP_CLASS}
            >
              Clear cells
            </button>
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]" data-testid="text-grid-size">
              {rowCount} {rowCount === 1 ? "row" : "rows"} by {cols} {cols === 1 ? "column" : "columns"}, up to{" "}
              {MAX_ROWS} by {MAX_COLS}
            </span>
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ToolPanel title="GitHub Flavored Markdown">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Toggle checked={padded} onChange={setPadded} label="Pad columns to line up" testId="checkbox-padded" />
              <CopyButton value={markdown} label="Copy Markdown table" testId="button-copy-markdown">
                <span>Copy Markdown</span>
              </CopyButton>
            </div>
            <div className={`mt-3 ${PRE_WRAP_CLASS}`}>
              <pre className={PRE_CLASS} data-testid="output-markdown">
                {markdown}
              </pre>
            </div>
            {padded && (warnings.wide || warnings.zeroWidth) ? (
              <p
                className="mt-3 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                data-testid="text-width-warning"
              >
                {warnings.wide
                  ? "Some cells hold East Asian wide characters or emoji, which most fixed-width fonts draw two columns wide. Padding counts code points, so those rows will not line up in an editor. "
                  : ""}
                {warnings.zeroWidth
                  ? "Some cells hold combining marks or zero-width characters, which take no column of their own, so their padding looks too wide. "
                  : ""}
                The rendered table is not affected.
              </p>
            ) : null}
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Cell text is written as Markdown source, so emphasis, code spans and links inside a cell still work.
              Every pipe is escaped as <code className="text-[hsl(var(--brand-cyan))]">\|</code> unless you already
              wrote it that way, and line breaks become <code className="text-[hsl(var(--brand-cyan))]">&lt;br&gt;</code>.
            </p>
          </ToolPanel>

          <ToolPanel title="HTML">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <label htmlFor="mdt-align-as" className={LABEL_CLASS}>
                  Alignment written as
                </label>
                <select
                  id="mdt-align-as"
                  value={alignAs}
                  onChange={(event) => setAlignAs(event.target.value as "attribute" | "style")}
                  data-testid="select-align-as"
                  className={FIELD_CLASS}
                >
                  <option value="attribute">align attribute, as GFM renders it</option>
                  <option value="style">style attribute, text-align</option>
                </select>
              </div>
              <CopyButton value={html} label="Copy HTML table" testId="button-copy-html">
                <span>Copy HTML</span>
              </CopyButton>
            </div>
            <div className={`mt-3 max-h-[480px] overflow-y-auto ${PRE_WRAP_CLASS}`}>
              <pre className={PRE_CLASS} data-testid="output-html">
                {html}
              </pre>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Cell text is treated as plain text and escaped, so Markdown inside a cell is not rendered here. Only{" "}
              <code className="text-[hsl(var(--brand-cyan))]">&lt;br&gt;</code> is kept, as a line break.
            </p>
          </ToolPanel>
        </div>
      </div>
    </ToolShell>
  );
}
