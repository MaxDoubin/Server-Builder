/**
 * IPv4 range to CIDR, and back.
 *
 * Forward: an inclusive start and end address become the fewest CIDR blocks
 * that cover exactly that range. Reverse: a pasted list of blocks becomes
 * sorted ranges with overlaps and neighbors merged, plus the minimal block
 * list for the merged set. The arithmetic is in lib/toolkit/ip-range-to-cidr
 * so it can be tested on its own; this file only parses fields and renders.
 */

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_AGGREGATED,
  MAX_ENTRIES,
  MAX_LIST_CHARS,
  blockToString,
  formatCount,
  ipToString,
  parseCidrList,
  parseIpv4,
  rangeSize,
  rangeToCidrs,
  summarizeMerge,
} from "@/lib/toolkit/ip-range-to-cidr";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/** Rows drawn in the merged-ranges table and lines drawn in the list. Copy includes everything. */
const MAX_ROWS = 200;

const RANGE_EXAMPLES: { start: string; end: string }[] = [
  { start: "192.0.2.10", end: "192.0.2.100" },
  { start: "10.0.0.0", end: "10.255.255.255" },
  { start: "172.16.0.0", end: "172.31.255.255" },
  { start: "192.0.2.0", end: "192.0.2.130" },
  { start: "0.0.0.1", end: "255.255.255.254" },
];

const LIST_EXAMPLE = [
  "# Two adjacent /24s, a /23, and a /25 inside it",
  "10.0.0.0/24",
  "10.0.1.0/24",
  "10.0.2.0/23",
  "10.0.3.128/25",
  "# Two halves of one /24",
  "192.0.2.0/25",
  "192.0.2.128/25",
  "# A bare address and a range",
  "198.51.100.7",
  "198.51.100.20 - 198.51.100.30",
  "# Host bits set, read as 203.0.113.0/24",
  "203.0.113.5/24",
].join("\n");

const FIELD_LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function Message({ id, tone, children }: { id: string; tone: "error" | "hint"; children: ReactNode }) {
  return tone === "error" ? (
    <p
      id={id}
      role="alert"
      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
    >
      {children}
    </p>
  ) : (
    <p id={id} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
      {children}
    </p>
  );
}

function ListBlock({ lines, testId, label }: { lines: string[]; testId: string; label: string }) {
  const shown = lines.length > MAX_ROWS ? lines.slice(0, MAX_ROWS) : lines;
  return (
    <>
      <pre
        data-testid={testId}
        tabIndex={0}
        aria-label={label}
        className="mt-4 max-h-[22rem] overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
      >
        {shown.join("\n")}
      </pre>
      {lines.length > MAX_ROWS ? (
        <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
          Showing the first {MAX_ROWS} of {formatCount(lines.length)} lines. Copy includes all of them.
        </p>
      ) : null}
    </>
  );
}

export function IpRangeToCidr() {
  const [startDraft, setStartDraft] = useState("192.0.2.10");
  const [endDraft, setEndDraft] = useState("192.0.2.100");
  const [listDraft, setListDraft] = useState(LIST_EXAMPLE);

  /* ------------------------------------------------------ range to CIDR */

  const start = useMemo(() => parseIpv4(startDraft, "start address"), [startDraft]);
  const end = useMemo(() => parseIpv4(endDraft, "end address"), [endDraft]);
  const reversed = start.ok && end.ok && start.value > end.value;

  const blocks = useMemo(
    () => (start.ok && end.ok && !reversed ? rangeToCidrs(start.value, end.value) : null),
    [start, end, reversed],
  );
  const blockLines = useMemo(() => (blocks ? blocks.map(blockToString) : []), [blocks]);
  const total = start.ok && end.ok && !reversed ? end.value - start.value + 1 : 0;

  function swap() {
    setStartDraft(endDraft);
    setEndDraft(startDraft);
  }

  /* ---------------------------------------------------- list to ranges */

  // A long paste can take a few hundred milliseconds to parse and merge. The
  // deferred copy lets the textarea and the range fields stay responsive
  // while that work catches up.
  const listText = useDeferredValue(listDraft);
  const parsedList = useMemo(() => parseCidrList(listText), [listText]);
  const merge = useMemo(() => summarizeMerge(parsedList.entries), [parsedList]);
  const mergedLines = useMemo(
    () =>
      merge.merged.map((r) =>
        r.start === r.end ? ipToString(r.start) : `${ipToString(r.start)} - ${ipToString(r.end)}`,
      ),
    [merge],
  );
  const aggregatedLines = useMemo(() => merge.aggregated.map(blockToString), [merge]);
  const mergedCopy = useMemo(() => mergedLines.join("\n"), [mergedLines]);
  const aggregatedCopy = useMemo(() => aggregatedLines.join("\n"), [aggregatedLines]);
  const aggregatedCapped = merge.aggregatedTotal > merge.aggregated.length;
  const overlap = merge.inputAddresses - merge.uniqueAddresses;
  const listEmpty = listDraft.trim() === "";

  return (
    <ToolShell slug="ip-range-to-cidr">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Range to CIDR">
            <label htmlFor="range-start" className={FIELD_LABEL}>
              Start address
            </label>
            <input
              id="range-start"
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="decimal"
              aria-invalid={!start.ok && startDraft.trim() !== ""}
              aria-describedby="range-start-message"
              placeholder="192.0.2.10"
              data-testid="input-start"
              className={FIELD_INPUT}
            />
            {!start.ok ? (
              <Message id="range-start-message" tone={startDraft.trim() === "" ? "hint" : "error"}>
                {start.error}
              </Message>
            ) : (
              <Message id="range-start-message" tone="hint">
                First address in the range, included.
              </Message>
            )}

            <div className="mt-5">
              <label htmlFor="range-end" className={FIELD_LABEL}>
                End address
              </label>
              <input
                id="range-end"
                value={endDraft}
                onChange={(e) => setEndDraft(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="decimal"
                aria-invalid={(!end.ok && endDraft.trim() !== "") || reversed}
                aria-describedby="range-end-message"
                placeholder="192.0.2.100"
                data-testid="input-end"
                className={FIELD_INPUT}
              />
              {!end.ok ? (
                <Message id="range-end-message" tone={endDraft.trim() === "" ? "hint" : "error"}>
                  {end.error}
                </Message>
              ) : reversed ? (
                <Message id="range-end-message" tone="error">
                  The end address comes before the start address. A range runs from the lower address to the
                  higher one.
                </Message>
              ) : (
                <Message id="range-end-message" tone="hint">
                  Last address in the range, also included.
                </Message>
              )}
            </div>

            {reversed ? (
              <button
                type="button"
                onClick={swap}
                data-testid="button-swap"
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>⇅</span> Swap start and end
              </button>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {RANGE_EXAMPLES.map((ex) => (
                <button
                  key={`${ex.start}-${ex.end}`}
                  type="button"
                  onClick={() => {
                    setStartDraft(ex.start);
                    setEndDraft(ex.end);
                  }}
                  className="inline-flex min-h-[28px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[0.625rem] tracking-[0.12em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {ex.start} to {ex.end}
                </button>
              ))}
            </div>
          </ToolPanel>

          <ToolPanel title="CIDR blocks">
            {blocks ? (
              <>
                <ToolResult
                  label="Blocks"
                  value={`${blocks.length} ${pluralise(blocks.length, "block")}`}
                  testId="text-block-count"
                />
                <ToolResult
                  label="Total addresses"
                  value={formatCount(total)}
                  testId="text-total"
                />
                <ToolResult
                  label="Single block?"
                  value={blocks.length === 1 ? `yes, ${blockLines[0]}` : "no"}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    One per line
                  </span>
                  <CopyButton
                    value={blockLines.join("\n")}
                    label="Copy CIDR blocks"
                    testId="button-copy-blocks"
                  />
                </div>
                <ListBlock lines={blockLines} testId="list-cidr-blocks" label="CIDR blocks for the range" />
              </>
            ) : (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Enter a valid start and end address to see the blocks.
              </p>
            )}
          </ToolPanel>
        </div>

        {blocks ? (
          <ToolPanel title="Blocks in detail">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-blocks">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Block
                    </th>
                    <th scope="col" className={TH}>
                      First
                    </th>
                    <th scope="col" className={TH}>
                      Last
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Addresses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.network} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <th
                        scope="row"
                        className="py-2 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                      >
                        {blockToString(b)}
                      </th>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {ipToString(b.first)}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {ipToString(b.last)}
                      </td>
                      <td className="py-2 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {formatCount(b.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th
                      scope="row"
                      colSpan={3}
                      className="py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                    >
                      Total
                    </th>
                    <td className="py-2 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {formatCount(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ToolPanel>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="CIDR list to ranges">
            <label htmlFor="cidr-list" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Paste CIDR blocks, one or more per line
            </label>
            <textarea
              id="cidr-list"
              value={listDraft}
              onChange={(e) => setListDraft(e.target.value)}
              rows={12}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={parsedList.errorCount > 0}
              aria-describedby="cidr-list-hint"
              placeholder={"10.0.0.0/24\n10.0.1.0/24\n192.0.2.0/25"}
              data-testid="input-cidr-list"
              className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <p id="cidr-list-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Separate blocks with spaces, commas, semicolons or new lines. A bare address counts as a /32, a
              range written start - end goes on a line of its own, and # starts a comment. Up to{" "}
              {formatCount(MAX_ENTRIES)} entries and {formatCount(MAX_LIST_CHARS)} characters.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setListDraft(LIST_EXAMPLE)}
                data-testid="button-list-example"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Example list
              </button>
              {!listEmpty ? (
                <button
                  type="button"
                  onClick={() => setListDraft("")}
                  data-testid="button-list-clear"
                  className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {parsedList.errorCount > 0 ? (
              <div
                role="alert"
                data-testid="list-errors"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3"
              >
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                  {parsedList.errorCount} {pluralise(parsedList.errorCount, "entry", "entries")} skipped:
                </p>
                <ul className="mt-2 space-y-1">
                  {parsedList.errors.map((e, i) => (
                    <li
                      key={`${e.line}-${i}`}
                      className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      {e.line > 0 ? `Line ${e.line}` : "Input"}
                      {e.text ? `, "${e.text}"` : ""}: {e.message}
                    </li>
                  ))}
                  {parsedList.errorCount > parsedList.errors.length ? (
                    <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {formatCount(parsedList.errorCount - parsedList.errors.length)} more.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {parsedList.warningCount > 0 ? (
              <div
                data-testid="list-warnings"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3"
              >
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  {parsedList.warningCount} {pluralise(parsedList.warningCount, "entry", "entries")} read as a
                  different block:
                </p>
                <ul className="mt-2 space-y-1">
                  {parsedList.warnings.map((w, i) => (
                    <li
                      key={`${w.line}-${i}`}
                      className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      Line {w.line}, "{w.text}": {w.message}
                    </li>
                  ))}
                  {parsedList.warningCount > parsedList.warnings.length ? (
                    <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {formatCount(parsedList.warningCount - parsedList.warnings.length)} more.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {parsedList.truncated ? (
              <p className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                The list holds more than {formatCount(MAX_ENTRIES)} entries. Only the first{" "}
                {formatCount(MAX_ENTRIES)} were read; merge the rest separately.
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Merged">
            {merge.merged.length > 0 ? (
              <>
                <ToolResult
                  label="Entries read"
                  value={formatCount(parsedList.entries.length)}
                  testId="text-entries"
                />
                <ToolResult
                  label="Merged ranges"
                  value={formatCount(merge.merged.length)}
                  testId="text-merged-count"
                />
                <ToolResult
                  label="Distinct addresses"
                  value={formatCount(merge.uniqueAddresses)}
                  testId="text-unique"
                />
                <ToolResult label="Sum of entry sizes" value={formatCount(merge.inputAddresses)} />
                <ToolResult
                  label="Removed as overlap"
                  value={overlap === 0 ? "none" : formatCount(overlap)}
                  testId="text-overlap"
                />
                <ToolResult
                  label="Minimal CIDR list"
                  value={`${formatCount(merge.aggregatedTotal)} ${pluralise(merge.aggregatedTotal, "block")}`}
                  testId="text-aggregated-count"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Minimal CIDR list
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton
                      value={mergedCopy}
                      label="Copy merged ranges"
                      testId="button-copy-ranges"
                    >
                      <span>Ranges</span>
                    </CopyButton>
                    <CopyButton
                      value={aggregatedCopy}
                      label="Copy minimal CIDR list"
                      testId="button-copy-aggregated"
                    >
                      <span>CIDR</span>
                    </CopyButton>
                  </div>
                </div>
                <ListBlock lines={aggregatedLines} testId="list-aggregated" label="Minimal CIDR list for the merged set" />
                {aggregatedCapped ? (
                  <p className="mt-2 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    The full list is {formatCount(merge.aggregatedTotal)} blocks. Only the first{" "}
                    {formatCount(MAX_AGGREGATED)} are kept, so the CIDR copy stops there; the merged ranges are
                    complete.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {listEmpty ? "Paste a list of blocks to merge them." : "No valid entries to merge yet."}
              </p>
            )}
          </ToolPanel>
        </div>

        {merge.merged.length > 0 ? (
          <ToolPanel title="Merged ranges">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-merged">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Start
                    </th>
                    <th scope="col" className={TH}>
                      End
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Addresses
                    </th>
                    <th scope="col" className={TH}>
                      <span className="pl-4">As CIDR</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merge.merged.slice(0, MAX_ROWS).map((r) => {
                    const cover = rangeToCidrs(r.start, r.end).map(blockToString);
                    return (
                      <tr key={r.start} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th
                          scope="row"
                          className="py-2 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                        >
                          {ipToString(r.start)}
                        </th>
                        <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {ipToString(r.end)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                          {formatCount(rangeSize(r))}
                        </td>
                        <td className="py-2 pl-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                          {cover.join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {merge.merged.length > MAX_ROWS ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Showing the first {MAX_ROWS} of {formatCount(merge.merged.length)} ranges. The copy buttons above
                include all of them.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
