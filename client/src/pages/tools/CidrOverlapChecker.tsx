/**
 * CIDR overlap checker.
 *
 * Paste a list of IPv4 and IPv6 blocks and see which of them overlap, which
 * sit inside which, and which blocks hold a given address. Two CIDR blocks
 * are disjoint, identical or nested and never overlap partially, so the
 * result is a list of pairs rather than a diagram. The arithmetic is in
 * lib/toolkit/cidr-overlap-checker so it can be tested on its own; this file
 * only reads the fields and renders.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_ENTRIES,
  MAX_INPUT_CHARS,
  analyze,
  blockText,
  blocksHolding,
  formatCount,
  formatSize,
  parseBlocks,
  type Block,
  type Overlap,
} from "@/lib/toolkit/cidr-overlap-checker";
import { formatIp, parseIp } from "@/lib/toolkit/ip-address-classifier";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/** Rows drawn in the blocks table. The counts and the copy text include everything. */
const MAX_ROWS = 200;

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "VPC plan",
    text: [
      "# Production VPC",
      "10.0.0.0/16",
      "# Staging, carved from the same space by mistake",
      "10.0.128.0/17",
      "# Peered office network",
      "10.1.0.0/16",
      "# Shared services, written with a host address",
      "10.1.200.5/24",
      "# Another peer",
      "192.168.10.0/24",
    ].join("\n"),
  },
  { label: "Two blocks", text: "192.168.0.0/16\n192.168.1.0/24" },
  {
    label: "IPv6 plan",
    text: ["2001:db8::/32", "2001:db8:1::/48", "2001:db8:1:2::/64", "2001:db9::/32", "fd00::/8"].join("\n"),
  },
  { label: "With mistakes", text: ["10.0.0.0/33", "10.0.0.0/8", "10.256.0.0/16", "172.16.0.0/12", "172.16.0.0/255.240.0.0"].join("\n") },
];

const FIELD_LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL = `inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] ${FOCUS}`;
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD = "py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";
const SCROLLER = `overflow-x-auto rounded-lg ${FOCUS}`;

/** "1 address", "256 addresses", for counts too large for a Number. */
function addresses(count: bigint): string {
  return `${formatSize(count)} ${count === 1n ? "address" : "addresses"}`;
}

function where(block: Block): string {
  return `${blockText(block)} (line ${block.line})`;
}

function describe(o: Overlap): string {
  const verb = o.relation === "identical" ? "is identical to" : "is inside";
  return `${where(o.inner)} ${verb} ${where(o.outer)}, ${addresses(o.shared)} shared`;
}

export function CidrOverlapChecker() {
  const [listDraft, setListDraft] = useState(EXAMPLES[0].text);
  const [lookupDraft, setLookupDraft] = useState("10.1.200.77");

  // A long paste is parsed and swept in one go. The deferred copy keeps the
  // textarea responsive while that catches up.
  const listText = useDeferredValue(listDraft);
  const parsed = useMemo(() => parseBlocks(listText), [listText]);
  const analysis = useMemo(() => analyze(parsed.blocks), [parsed]);
  const listEmpty = listDraft.trim() === "";

  const pairsCopy = useMemo(
    () => analysis.overlaps.map(describe).join("\n"),
    [analysis],
  );

  const lookup = useMemo(() => parseIp(lookupDraft), [lookupDraft]);
  const holding = useMemo(
    () => (lookup.ok ? blocksHolding(parsed.blocks, lookup.value.family, lookup.value.value) : []),
    [lookup, parsed],
  );
  const lookupEmpty = lookupDraft.trim() === "";

  const total = parsed.blocks.length;
  const verdict =
    total === 0
      ? listEmpty
        ? "Paste a list of blocks to check them."
        : "No valid blocks to check yet."
      : analysis.overlapPairs === 0
        ? `No overlaps. All ${formatCount(BigInt(total))} ${pluralise(total, "block")} ${total === 1 ? "is" : "are"} separate.`
        : `${formatCount(BigInt(analysis.overlapPairs))} overlapping ${pluralise(analysis.overlapPairs, "pair")}: ${formatCount(BigInt(analysis.insidePairs))} nested, ${formatCount(BigInt(analysis.identicalPairs))} identical.`;

  const stat = (label: string, family: "v4" | "v6", testId: string) => {
    const s = analysis[family];
    if (s.blocks === 0) return null;
    // Two short rows rather than one sentence: ToolResult breaks anywhere, so a
    // long value wraps mid-word on a phone.
    return (
      <>
        <ToolResult label={`${label} blocks`} testId={testId} value={formatCount(BigInt(s.blocks))} />
        <ToolResult
          label={`${label} addresses covered`}
          testId={`${testId}-covered`}
          value={formatSize(s.covered)}
        />
      </>
    );
  };

  return (
    <ToolShell slug="cidr-overlap-checker">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Blocks">
            <label htmlFor="overlap-list" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Paste CIDR blocks, IPv4 or IPv6, one or more per line
            </label>
            <textarea
              id="overlap-list"
              value={listDraft}
              onChange={(e) => setListDraft(e.target.value)}
              rows={12}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={parsed.problemCount > 0}
              aria-describedby="overlap-list-hint"
              placeholder={"10.0.0.0/16\n10.0.128.0/17\n2001:db8::/32"}
              data-testid="input-block-list"
              className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <p id="overlap-list-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Separate blocks with spaces, commas, semicolons or new lines. A bare address counts as a /32 or a
              /128, and # starts a comment. Up to {formatCount(BigInt(MAX_ENTRIES))} blocks and{" "}
              {formatCount(BigInt(MAX_INPUT_CHARS))} characters.
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Example lists">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setListDraft(example.text)}
                  data-testid={`button-example-${example.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={PILL}
                >
                  {example.label}
                </button>
              ))}
              {!listEmpty ? (
                <button type="button" onClick={() => setListDraft("")} data-testid="button-clear" className={PILL}>
                  Clear
                </button>
              ) : null}
            </div>

            {parsed.problemCount > 0 ? (
              <div
                role="alert"
                data-testid="list-problems"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3"
              >
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                  {parsed.problemCount} {pluralise(parsed.problemCount, "entry", "entries")} skipped:
                </p>
                <ul className="mt-2 space-y-1">
                  {parsed.problems.map((p, i) => (
                    <li
                      key={`${p.line}-${i}`}
                      className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      {p.line > 0 ? `Line ${p.line}` : "Input"}
                      {p.text ? `, "${p.text}"` : ""}: {p.message}
                    </li>
                  ))}
                  {parsed.problemCount > parsed.problems.length ? (
                    <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {formatCount(BigInt(parsed.problemCount - parsed.problems.length))} more.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {parsed.noteCount > 0 ? (
              <div
                data-testid="list-notes"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3"
              >
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  {parsed.noteCount} {pluralise(parsed.noteCount, "entry", "entries")} read as a different block:
                </p>
                <ul className="mt-2 space-y-1">
                  {parsed.notes.map((p, i) => (
                    <li
                      key={`${p.line}-${i}`}
                      className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      Line {p.line}, "{p.text}": {p.message}
                    </li>
                  ))}
                  {parsed.noteCount > parsed.notes.length ? (
                    <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {formatCount(BigInt(parsed.noteCount - parsed.notes.length))} more.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {parsed.truncated ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
              >
                The list holds more than {formatCount(BigInt(MAX_ENTRIES))} blocks. Only the first{" "}
                {formatCount(BigInt(MAX_ENTRIES))} were read; check the rest separately.
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Result">
            <p
              role="status"
              aria-live="polite"
              data-testid="text-verdict"
              className={`font-display text-lg leading-snug ${
                total > 0 && analysis.overlapPairs === 0
                  ? "text-[hsl(var(--brand-signal))]"
                  : "text-[hsl(var(--brand-bone))]"
              }`}
            >
              {verdict}
            </p>
            {total > 0 ? (
              <div className="mt-4">
                <ToolResult label="Blocks read" value={formatCount(BigInt(total))} testId="text-total" />
                {stat("IPv4", "v4", "text-v4")}
                {stat("IPv6", "v6", "text-v6")}
                <ToolResult
                  label="Overlapping pairs"
                  value={analysis.overlapPairs === 0 ? "none" : formatCount(BigInt(analysis.overlapPairs))}
                  testId="text-pairs"
                />
                <ToolResult
                  label="Nested pairs"
                  value={analysis.insidePairs === 0 ? "none" : formatCount(BigInt(analysis.insidePairs))}
                  testId="text-nested"
                />
                <ToolResult
                  label="Identical pairs"
                  value={analysis.identicalPairs === 0 ? "none" : formatCount(BigInt(analysis.identicalPairs))}
                  testId="text-identical"
                />
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Covered counts each address once, so a block inside another adds nothing. IPv4 and IPv6 blocks
                  are never compared with each other.
                </p>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        {analysis.overlapPairs > 0 ? (
          <ToolPanel title="Overlapping pairs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {analysis.overlaps.length < analysis.overlapPairs
                  ? `Showing the first ${formatCount(BigInt(analysis.overlaps.length))} of ${formatCount(BigInt(analysis.overlapPairs))} pairs, in address order.`
                  : "Every pair, in address order."}
              </p>
              <CopyButton value={pairsCopy} label="Copy the overlapping pairs" testId="button-copy-pairs">
                <span>Copy pairs</span>
              </CopyButton>
            </div>
            <div className={SCROLLER} tabIndex={0} role="region" aria-label="Overlapping pairs table">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-pairs">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Block
                    </th>
                    <th scope="col" className={TH}>
                      Relation
                    </th>
                    <th scope="col" className={TH}>
                      Other block
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Shared addresses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.overlaps.map((o, i) => (
                    <tr key={`${o.outer.index}-${o.inner.index}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <th scope="row" className={`${TD} font-normal`}>
                        {where(o.inner)}
                      </th>
                      <td
                        className={`py-2 pr-4 font-mono-tight text-sm ${
                          o.relation === "identical" ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-bone-dim))]"
                        }`}
                      >
                        {o.relation === "identical" ? "is identical to" : "is inside"}
                      </td>
                      <td className={TD}>{where(o.outer)}</td>
                      <td className="py-2 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {formatSize(o.shared)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolPanel>
        ) : null}

        <ToolPanel title="Which blocks hold an address">
          <label htmlFor="overlap-lookup" className={FIELD_LABEL}>
            Address
          </label>
          <input
            id="overlap-lookup"
            value={lookupDraft}
            onChange={(e) => setLookupDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!lookup.ok && !lookupEmpty}
            aria-describedby="overlap-lookup-message"
            placeholder="10.1.200.77"
            data-testid="input-address"
            className={FIELD_INPUT}
          />
          <p
            id="overlap-lookup-message"
            role={!lookup.ok && !lookupEmpty ? "alert" : undefined}
            data-testid="text-lookup-message"
            className={`mt-2 font-mono-tight text-xs leading-relaxed ${
              !lookup.ok && !lookupEmpty ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-ash))]"
            }`}
          >
            {!lookup.ok
              ? lookupEmpty
                ? "Enter one IPv4 or IPv6 address to see which of the blocks above hold it."
                : lookup.error
              : total === 0
                ? "There are no valid blocks to look in yet."
                : holding.length === 0
                  ? `No block holds ${formatIp(lookup.value.family, lookup.value.value)}.`
                  : `${formatIp(lookup.value.family, lookup.value.value)} is in ${holding.length} ${pluralise(holding.length, "block")}. The first is the most specific, the one a longest prefix match would pick.`}
          </p>
          {holding.length > 0 ? (
            <div className={`mt-4 ${SCROLLER}`} tabIndex={0} role="region" aria-label="Blocks that hold the address">
              <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-holding">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Block
                    </th>
                    <th scope="col" className={TH}>
                      Line
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Addresses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holding.map((b, i) => (
                    <tr key={b.index} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <th scope="row" className={`${TD} font-normal`}>
                        {blockText(b)}
                        {i === 0 ? (
                          <span className="ml-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                            most specific
                          </span>
                        ) : null}
                      </th>
                      <td className={TD}>{b.line}</td>
                      <td className="py-2 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {formatSize(b.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ToolPanel>

        {total > 0 ? (
          <ToolPanel title="Blocks as read">
            <div className={SCROLLER} tabIndex={0} role="region" aria-label="Blocks as read">
              <table className="w-full min-w-[720px] border-collapse text-left" data-testid="table-blocks">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      Line
                    </th>
                    <th scope="col" className={TH}>
                      Block
                    </th>
                    <th scope="col" className={TH}>
                      First address
                    </th>
                    <th scope="col" className={TH}>
                      Last address
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Addresses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.blocks.slice(0, MAX_ROWS).map((b) => (
                    <tr key={b.index} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <td className={`${TD} text-[hsl(var(--brand-bone-dim))]`}>{b.line}</td>
                      <th scope="row" className={`${TD} font-normal`}>
                        {blockText(b)}
                        {b.hostBitsCleared ? (
                          <span className="ml-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-amber))]">
                            from {b.text}
                          </span>
                        ) : null}
                      </th>
                      <td className={`${TD} break-all`}>{formatIp(b.family, b.network)}</td>
                      <td className={`${TD} break-all`}>{formatIp(b.family, b.last)}</td>
                      <td className="py-2 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {formatSize(b.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > MAX_ROWS ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Showing the first {MAX_ROWS} of {formatCount(BigInt(total))} blocks. The counts above include all of them.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
