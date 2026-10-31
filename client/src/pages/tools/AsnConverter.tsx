/**
 * AS number converter.
 *
 * Converts between the RFC 5396 notations, classifies each number against
 * the IANA special-purpose ranges, and shows what a 4-octet ASN looks like
 * to a BGP speaker that only understands 2-octet ones. One entry gets the
 * full breakdown; a pasted list gets a table, and any row can be opened in
 * the breakdown. All of the arithmetic is in lib/toolkit/asn-converter.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  AS_TRANS,
  convertBatch,
  MAX_BATCH,
  MAX_INPUT_CHARS,
  wireView,
  type AsnInfo,
  type AsnKind,
} from "@/lib/toolkit/asn-converter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "4-byte", text: "4200000001" },
  { label: "asdot", text: "1.10" },
  { label: "Private", text: "64512\n65534\n4200000000\n4294967294" },
  { label: "AS path", text: "64496 64511 65536 {64500,1.15} 23456" },
  { label: "Edge cases", text: "0\n23456\n65535\n65552\n4294967295\nAS-EXAMPLE\n1.65536" },
];

const KIND_STYLE: Record<AsnKind, string> = {
  public: "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]",
  private: "border-[hsl(var(--brand-cyan)/0.6)] text-[hsl(var(--brand-cyan))]",
  documentation: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  "as-trans": "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  reserved: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
};

const KIND_NAME: Record<AsnKind, string> = {
  public: "public",
  private: "private",
  documentation: "documentation",
  "as-trans": "AS_TRANS",
  reserved: "reserved",
};

/** Rows drawn in the table. The copy buttons always cover every entry. */
const TABLE_ROWS = 500;

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Shortens a very long unreadable entry for display; the error says how long it was. */
function clipForDisplay(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function KindBadge({ kind }: { kind: AsnKind }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${KIND_STYLE[kind]}`}
    >
      {KIND_NAME[kind]}
    </span>
  );
}

function csvCell(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function Breakdown({ info, input, note }: { info: AsnInfo; input: string; note: string | null }) {
  const wire = wireView(info.value);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ToolPanel title="Notation">
        <ToolResult label="Entered" value={input} />
        <ToolResult label="asplain" value={info.asplain} testId="text-asplain" />
        <ToolResult label="asdot" value={info.asdot} testId="text-asdot" />
        <ToolResult label="asdot+" value={info.asdotPlus} />
        <ToolResult label="Hex, 4 octets" value={`0x${info.hex}`} />
        <ToolResult
          label="Size"
          value={info.bits === 16 ? "16-bit, fits a 2-octet field" : "32-bit, needs 4-octet support"}
          testId="text-bits"
        />
        {note ? (
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">{note}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton value={info.asplain} label={`Copy asplain ${info.asplain}`}>
            <span>asplain</span>
          </CopyButton>
          <CopyButton value={info.asdot} label={`Copy asdot ${info.asdot}`}>
            <span>asdot</span>
          </CopyButton>
        </div>
      </ToolPanel>

      <ToolPanel title="Classification">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={info.kind} />
          <span data-testid="text-class" className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
            {info.label}
          </span>
        </div>
        <div className="mt-3">
          <ToolResult label="Range" value={info.range} />
          <ToolResult label="Defined in" value={info.source ?? "Ordinary RIR assignment space"} />
        </div>
        <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{info.detail}</p>
      </ToolPanel>

      <ToolPanel title="On the wire, RFC 6793" className="lg:col-span-2">
        <ToolResult
          label="OPEN, My Autonomous System (2 octets)"
          value={`${wire.myAsField} (${wire.myAsHex})`}
          testId="text-open-myas"
        />
        <ToolResult
          label="Capability 65 in OPEN"
          value={wire.capabilityHex}
          testId="text-capability"
        />
        <ToolResult
          label="AS_PATH seen by a 2-octet-only peer"
          value={wire.needsAsTrans ? `${AS_TRANS} (AS_TRANS), real number in AS4_PATH` : `${info.value}, unchanged`}
        />
        <ToolResult label="AS-path regex, asdot" value={wire.regexAsdot} />
        <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {wire.needsAsTrans
            ? `This number does not fit the 2-octet My Autonomous System field, so the OPEN carries ${AS_TRANS} there and the full value in the capability bytes above, shown as its own optional parameter: type 2, length 6, then capability code 0x41, length 4 and the ASN. A peer that advertises the same capability uses 4-octet AS_PATH segments and never sees ${AS_TRANS}. A peer that does not is an OLD speaker: every hop with a 4-octet ASN reaches it as ${AS_TRANS}, and the true path rides along in the optional transitive AS4_PATH attribute (type 17) for a NEW speaker further on to rebuild.`
            : `This number fits the 2-octet field, so the OPEN carries it directly and it crosses OLD and NEW speakers unchanged. A NEW speaker still advertises capability 65 with the same value padded to four octets, and uses 4-octet AS_PATH segments with any peer that advertises the capability back.`}
          {info.bits === 32
            ? " In asdot the dot is a regular expression metacharacter, so an AS-path filter written in asdot has to escape it, as shown."
            : ""}
        </p>
      </ToolPanel>
    </div>
  );
}

export function AsnConverter() {
  const [raw, setRaw] = useState(EXAMPLES[0].text);
  const [selected, setSelected] = useState(0);

  // A pasted list of a couple of thousand numbers redraws a large table, so
  // the table follows the text a beat behind the typing.
  const deferred = useDeferredValue(raw);
  const batch = useMemo(() => convertBatch(deferred), [deferred]);
  const rows = batch.rows;
  const valid = rows.filter((r) => r.info !== null);

  // Fall back to the first readable row when the selection no longer points
  // at one, for example after the list was edited.
  const current = rows[selected]?.info ? rows[selected] : valid[0] ?? null;

  const counts = new Map<AsnKind, number>();
  for (const r of valid) counts.set(r.info!.kind, (counts.get(r.info!.kind) ?? 0) + 1);
  const invalid = rows.length - valid.length;

  const summary =
    rows.length === 0
      ? "Enter an AS number, or paste a list."
      : [
          `${rows.length} ${pluralise(rows.length, "entry", "entries")}`,
          ...(["public", "private", "documentation", "as-trans", "reserved"] as AsnKind[])
            .filter((k) => counts.get(k))
            .map((k) => `${counts.get(k)} ${KIND_NAME[k]}`),
          invalid ? `${invalid} not readable` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const asplainList = valid.map((r) => r.info!.asplain).join("\n");
  const asdotList = valid.map((r) => r.info!.asdot).join("\n");
  const csv = [
    "input,asplain,asdot,asdot_plus,bits,class,source",
    ...rows.map((r) =>
      r.info
        ? [r.parsed.input, r.info.asplain, r.info.asdot, r.info.asdotPlus, String(r.info.bits), r.info.label, r.info.source ?? ""]
            .map(csvCell)
            .join(",")
        : [r.parsed.input, "", "", "", "", r.parsed.ok ? "" : `error: ${r.parsed.error}`, ""].map(csvCell).join(","),
    ),
  ].join("\n");

  const notices: string[] = [];
  if (batch.clipped) notices.push(`Only the first ${MAX_INPUT_CHARS.toLocaleString()} characters were read.`);
  if (batch.dropped > 0) {
    notices.push(
      `Converted the first ${MAX_BATCH.toLocaleString()} entries. ${batch.dropped.toLocaleString()} more ${pluralise(batch.dropped, "was", "were")} left out.`,
    );
  }

  const firstError = rows.length === 1 && !rows[0].parsed.ok ? rows[0].parsed.error : null;

  return (
    <ToolShell slug="asn-converter">
      <div className="space-y-6">
        <ToolPanel title="AS numbers">
          <label htmlFor="asn-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            One AS number, or a list separated by lines, commas or spaces.
          </label>
          <textarea
            id="asn-input"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setSelected(0);
            }}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={firstError !== null}
            aria-describedby={firstError ? "asn-error" : "asn-hint"}
            placeholder={"64512\nAS4200000001\n1.10"}
            data-testid="input-asn"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {firstError ? (
            <p
              id="asn-error"
              role="alert"
              data-testid="text-asn-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {firstError}
            </p>
          ) : (
            <p id="asn-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              asplain (<code>4200000001</code>), asdot (<code>64086.59905</code>) or hex (
              <code>0xFA56EA01</code>), with or without an AS prefix. A pasted AS_PATH works, braces and
              all. Up to {MAX_BATCH.toLocaleString()} entries.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setRaw(example.text);
                  setSelected(0);
                }}
                data-testid={`button-example-${slugOf(example.label)}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button
                type="button"
                onClick={() => {
                  setRaw("");
                  setSelected(0);
                }}
                data-testid="button-clear"
                className={CHIP}
              >
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {notices.length ? (
          <p
            role="alert"
            className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
          >
            {notices.join(" ")}
          </p>
        ) : null}

        {current?.info && current.parsed.ok ? (
          <div data-testid="panel-breakdown">
            <Breakdown info={current.info} input={current.parsed.input} note={current.parsed.note} />
          </div>
        ) : null}

        {rows.length > 1 ? (
          <ToolPanel title="All entries">
            <div className="mb-4 flex flex-wrap gap-2">
              <CopyButton value={asplainList} label="Copy every entry as asplain" testId="button-copy-asplain">
                <span>All as asplain</span>
              </CopyButton>
              <CopyButton value={asdotList} label="Copy every entry as asdot" testId="button-copy-asdot">
                <span>All as asdot</span>
              </CopyButton>
              <CopyButton value={csv} label="Copy the table as CSV" testId="button-copy-csv">
                <span>CSV</span>
              </CopyButton>
            </div>
            <div className="overflow-x-auto">
              <table data-testid="table-asns" className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Entered
                    </th>
                    <th scope="col" className={TH}>
                      asplain
                    </th>
                    <th scope="col" className={TH}>
                      asdot
                    </th>
                    <th scope="col" className={TH}>
                      Bits
                    </th>
                    <th scope="col" className={TH}>
                      Class
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, TABLE_ROWS).map((row) => {
                    const isCurrent = current === row;
                    return (
                      <tr
                        key={`${row.index}-${row.parsed.input}`}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${
                          isCurrent ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""
                        }`}
                      >
                        <th
                          scope="row"
                          className="max-w-[180px] break-all py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone-dim))]"
                        >
                          {clipForDisplay(row.parsed.input)}
                        </th>
                        {row.info ? (
                          <>
                            <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {row.info.asplain}
                            </td>
                            <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {row.info.asdot}
                            </td>
                            <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                              {row.info.bits}
                            </td>
                            <td className="py-2.5 pr-4">
                              <KindBadge kind={row.info.kind} />
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => setSelected(row.index)}
                                aria-pressed={isCurrent}
                                aria-label={`Show details for ${clipForDisplay(row.parsed.input)}`}
                                data-testid={`button-details-${row.index}`}
                                className="inline-flex min-h-[32px] items-center rounded-md border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                              >
                                {isCurrent ? "Shown" : "Details"}
                              </button>
                            </td>
                          </>
                        ) : (
                          <td
                            colSpan={5}
                            className="py-2.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                          >
                            {row.parsed.ok ? "" : row.parsed.error}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > TABLE_ROWS ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Showing the first {TABLE_ROWS} of {rows.length.toLocaleString()} rows. The copy buttons
                above include all of them.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
