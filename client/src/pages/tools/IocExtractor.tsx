/**
 * Indicator of compromise extractor.
 *
 * Pasted text is scanned in this tab for URLs, domains, IPs, email
 * addresses, file hashes, CVE IDs and Bitcoin addresses, live or defanged.
 * The logic lives in lib/toolkit/ioc-extractor.ts so it can be tested on its
 * own; this file is controls and tables. Extraction runs on a deferred copy
 * of the text so typing stays responsive on a large paste, and an export is
 * a Blob URL that is revoked when replaced and on unmount.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  IOC_TYPES,
  MAX_DISTINCT,
  MAX_INPUT_CHARS,
  allTypes,
  extractIocs,
  renderValue,
  toCsv,
  toJson,
  toPlainLists,
  type Indicator,
  type IocType,
  type OutputMode,
} from "@/lib/toolkit/ioc-extractor";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]" : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"}`;

const chipClass =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const toggleClass = (on: boolean) =>
  `flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 font-mono-tight text-xs leading-relaxed transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${on ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]" : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))]"}`;

/* ------------------------------------------------------------------ data */

/** Rows drawn per type. Copy and export always carry every row. */
const ROW_CAP = 500;

/** Characters of the export shown in the preview box. */
const PREVIEW_CHARS = 6000;

type ExportFormat = "csv" | "json" | "plain";

const FORMATS: { id: ExportFormat; label: string; ext: string; mime: string }[] = [
  { id: "csv", label: "CSV", ext: "csv", mime: "text/csv;charset=utf-8" },
  { id: "json", label: "JSON", ext: "json", mime: "application/json" },
  { id: "plain", label: "Plain lists", ext: "txt", mime: "text/plain;charset=utf-8" },
];

/*
  Documentation addresses only (RFC 5737, RFC 3849, RFC 2606 names). The
  hashes are those of the EICAR antivirus test file, and the Bitcoin
  addresses are the genesis block address and the BIP 173 test vector.
*/
const SAMPLE = [
  "Incident 4471, initial access summary.",
  "Phishing mail from billing[@]example[.]net linked to hxxps://login-portal.example[.]com/verify?id=7.",
  "Stage two came from hxxp://198.51.100[.]23:8080/drop/a.bin and beaconed to 203.0.113.9 every 60s.",
  "Same host again: 203.0.113.9. IPv6 fallback 2001:db8::bad:1 and update-check.example.org.",
  "EICAR test file hashes: MD5 44d88612fea8a8f36de82e1278abb02f",
  "SHA-1 3395856ce81f2b7382dee72602f798b642f14140",
  "SHA-256 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
  "Exploited CVE-2021-44228. Ransom note lists 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "and bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4.",
  "Attachments seen: invoice.zip, setup.py, report.pdf.",
].join("\n");

/* ------------------------------------------------------------------ view */

function TypeTable({ type, rows, mode }: { type: IocType; rows: Indicator[]; mode: OutputMode }) {
  const info = IOC_TYPES.find((t) => t.id === type);
  const heading = info?.heading ?? type;
  const all = useMemo(() => rows.map((r) => renderValue(r, mode)).join("\n"), [rows, mode]);
  const shown = rows.slice(0, ROW_CAP);
  return (
    <ToolPanel title={`${heading} (${rows.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={TH}>
                Indicator
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Count
              </th>
              <th scope="col" className={`${TH} text-right`}>
                First line
              </th>
              <th scope="col" className={`${TH} pr-0`}>
                In source
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.value} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top last:border-b-0">
                <td className="max-w-[420px] break-all py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {renderValue(row, mode)}
                  {row.detail ? (
                    <span className="mt-1 block font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{row.detail}</span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone))]">
                  {row.count}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-bone-dim))]">
                  {row.firstLine}
                </td>
                <td
                  className={`py-2.5 font-mono-tight text-xs uppercase tracking-[0.18em] ${row.writtenDefanged ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"}`}
                >
                  {row.writtenDefanged ? "defanged" : "live"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
          {rows.length > ROW_CAP ? `First ${ROW_CAP} of ${rows.length} shown; copy and export include all` : `${rows.length} distinct`}
        </span>
        <CopyButton value={all} label={`Copy every ${heading.toLowerCase()} value, one per line`} testId={`button-copy-${type}`} />
      </div>
    </ToolPanel>
  );
}

export function IocExtractor() {
  const [text, setText] = useState("");
  const [types, setTypes] = useState<Record<IocType, boolean>>(() => allTypes());
  const [includeHosts, setIncludeHosts] = useState(true);
  const [keepAmbiguous, setKeepAmbiguous] = useState(false);
  const [mode, setMode] = useState<OutputMode>("defanged");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadUrl = useRef<string | null>(null);

  // A Blob URL holds its bytes until revoked, so the last one goes when the page does.
  useEffect(
    () => () => {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  const deferred = useDeferredValue(text);
  const result = useMemo(
    () => extractIocs(deferred, { types, includeHosts, keepAmbiguous }),
    [deferred, types, includeHosts, keepAmbiguous],
  );
  const stale = deferred !== text;
  const ok = result.ok ? result : null;

  const exportText = useMemo(() => {
    if (!ok || ok.indicators.length === 0) return "";
    if (format === "csv") return toCsv(ok.indicators, mode);
    if (format === "json") return toJson(ok.indicators, mode);
    return toPlainLists(ok.indicators, mode);
  }, [ok, format, mode]);

  const formatInfo = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
  const activeTypes = IOC_TYPES.filter((t) => types[t.id]).length;

  function toggleType(id: IocType) {
    setTypes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function download() {
    if (exportText === "") return;
    try {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      const url = URL.createObjectURL(new Blob([exportText], { type: formatInfo.mime }));
      downloadUrl.current = url;
      const a = document.createElement("a");
      a.href = url;
      a.download = `indicators-${mode}.${formatInfo.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDownloadError(null);
    } catch {
      setDownloadError("This browser would not create the file. Copy the text above instead.");
    }
  }

  let summary: string;
  if (!result.ok) summary = "Nothing extracted.";
  else if (text.trim() === "") summary = "Paste text to extract indicators.";
  else if (result.indicators.length === 0) summary = "No indicators found in this text.";
  else {
    const kinds = IOC_TYPES.filter((t) => result.byType[t.id].length > 0).length;
    summary = `${result.indicators.length} distinct ${pluralise(result.indicators.length, "indicator")}, ${result.occurrences} ${pluralise(result.occurrences, "occurrence")}, ${kinds} ${pluralise(kinds, "type")}, ${result.lines} ${pluralise(result.lines, "line")}.`;
  }

  const preview = exportText.length > PREVIEW_CHARS ? `${exportText.slice(0, PREVIEW_CHARS)}\n...` : exportText;

  return (
    <ToolShell slug="ioc-extractor">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ToolPanel title="Text">
            <label htmlFor="ioc-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Paste a report, an email, or log lines. Defanged forms are read too.
            </label>
            <textarea
              id="ioc-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={!result.ok}
              aria-describedby={!result.ok ? "ioc-error" : "ioc-hint"}
              placeholder="Beacon to hxxps://cdn[.]example[.]com/a.php from 198.51.100[.]23"
              data-testid="input-text"
              className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            {!result.ok ? (
              <p id="ioc-error" role="alert" data-testid="text-ioc-error" className={`mt-3 ${ERROR_BOX}`}>
                {result.error}
              </p>
            ) : (
              <p id="ioc-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {text.length.toLocaleString("en-US")} of {MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Reads
                hxxp, hxxps, fxp, [.], (.), {"{.}"}, [dot], \., [@], [at], [:] and [://]. Domains are ASCII or punycode
                (xn--) names whose last label is a delegated TLD.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setText(SAMPLE)} data-testid="button-example" className={chipClass}>
                Load a sample report
              </button>
              {text ? (
                <button type="button" onClick={() => setText("")} data-testid="button-clear" className={chipClass}>
                  Clear
                </button>
              ) : null}
            </div>
          </ToolPanel>

          <ToolPanel title="Options">
            <div className={LABEL} id="ioc-types-label">
              Indicator types ({activeTypes} of {IOC_TYPES.length})
            </div>
            <div role="group" aria-labelledby="ioc-types-label" className="mt-3 flex flex-wrap gap-2">
              {IOC_TYPES.map((t) => {
                const n = ok ? ok.byType[t.id].length : 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    aria-pressed={types[t.id]}
                    data-testid={`button-type-${t.id}`}
                    className={pillClass(types[t.id])}
                  >
                    {t.label}
                    {types[t.id] && n > 0 ? <span className="tabular-nums text-[hsl(var(--brand-bone))]">{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setTypes(allTypes(true))} data-testid="button-types-all" className={chipClass}>
                All
              </button>
              <button type="button" onClick={() => setTypes(allTypes(false))} data-testid="button-types-none" className={chipClass}>
                None
              </button>
            </div>

            <div className="mt-6 space-y-2">
              <label className={toggleClass(includeHosts)}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={includeHosts}
                  onChange={(e) => setIncludeHosts(e.target.checked)}
                  data-testid="checkbox-include-hosts"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {includeHosts ? "[x]" : "[ ]"}
                </span>
                Also list the host of every URL and the domain of every email address
              </label>
              <label className={toggleClass(keepAmbiguous)}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={keepAmbiguous}
                  onChange={(e) => setKeepAmbiguous(e.target.checked)}
                  data-testid="checkbox-keep-ambiguous"
                />
                <span aria-hidden className="text-[hsl(var(--brand-signal))]">
                  {keepAmbiguous ? "[x]" : "[ ]"}
                </span>
                Keep live names that end in a file extension TLD (setup.py, invoice.zip)
              </label>
            </div>

            <div className={`mt-6 ${LABEL}`} id="ioc-mode-label">
              Show values
            </div>
            <div role="group" aria-labelledby="ioc-mode-label" className="mt-3 flex flex-wrap gap-2">
              {(["defanged", "refanged"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  data-testid={`button-mode-${m}`}
                  className={pillClass(mode === m)}
                >
                  {m === "defanged" ? "Defanged" : "Refanged (live)"}
                </button>
              ))}
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {mode === "defanged"
                ? "Safe to paste into a ticket or chat: hxxp, [.] on every dot, [@], and [:] in IPv6. Hashes, CVE IDs and wallet addresses are unchanged."
                : "Live values, for a blocklist, a SIEM query or a lookup tool. Do not paste these where they can be clicked."}
            </p>
          </ToolPanel>
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {stale ? "Reading..." : summary}
        </p>

        {ok && (ok.skippedFileNameCount > 0 || ok.badChecksums > 0 || ok.truncated) ? (
          <div className="space-y-2" data-testid="list-notices">
            {ok.skippedFileNameCount > 0 ? (
              <p className={WARN_BOX}>
                Skipped {ok.skippedFileNameCount} live {pluralise(ok.skippedFileNameCount, "name")} ending in a TLD that is
                also a common file extension: {ok.skippedFileNames.join(", ")}
                {ok.skippedFileNameCount > ok.skippedFileNames.length ? " and more" : ""}. Names written defanged, or inside a
                URL or email address, are always kept. Tick the option above to list these as domains.
              </p>
            ) : null}
            {ok.badChecksums > 0 ? (
              <p className={WARN_BOX}>
                {ok.badChecksums} {pluralise(ok.badChecksums, "string")} shaped like a Bitcoin address failed the checksum and{" "}
                {ok.badChecksums === 1 ? "was" : "were"} left out. A real address never fails it, so this is usually a typo or
                a truncated copy.
              </p>
            ) : null}
            {ok.truncated ? (
              <p className={WARN_BOX}>
                Stopped adding new indicators at {MAX_DISTINCT.toLocaleString("en-US")} distinct values. Counts for those already
                found are complete; split the input to see the rest.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-6" data-testid="output-iocs">
          {ok
            ? IOC_TYPES.filter((t) => ok.byType[t.id].length > 0).map((t) => (
                <TypeTable key={t.id} type={t.id} rows={ok.byType[t.id]} mode={mode} />
              ))
            : null}
        </div>

        {exportText !== "" ? (
          <ToolPanel title="Export">
            <div role="group" aria-label="Export format" className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  data-testid={`button-format-${f.id}`}
                  className={pillClass(format === f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <pre
              data-testid="text-export"
              aria-label={`${formatInfo.label} export preview`}
              className="mt-4 max-h-80 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
            >
              {preview}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={exportText} label={`Copy the ${formatInfo.label} export`} testId="button-copy-export">
                <span>Copy all</span>
              </CopyButton>
              <button
                type="button"
                onClick={download}
                data-testid="button-download"
                className="inline-flex min-h-[28px] items-center gap-1.5 rounded-md border border-[hsl(var(--brand-iron))] px-2.5 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>↓</span> Download .{formatInfo.ext}
              </button>
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                {mode === "defanged" ? "Defanged values" : "Live values"}
              </span>
            </div>
            {format === "csv" ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                RFC 4180 quoting with CRLF line ends. A field that starts with =, +, - or @ gets a leading apostrophe so a
                spreadsheet does not run it as a formula.
              </p>
            ) : null}
            {downloadError ? (
              <p role="alert" className={`mt-3 ${ERROR_BOX}`}>
                {downloadError}
              </p>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
