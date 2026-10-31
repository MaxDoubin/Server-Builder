/**
 * Route summarizer.
 *
 * Two different questions get asked of a prefix list and they have
 * different answers. The exact aggregate merges only what can be merged
 * without changing the set of addresses, so it is always safe to advertise.
 * The single summary is the one prefix that covers everything, which is
 * shorter to advertise and may claim addresses nobody listed. This page
 * computes both and shows the difference, because the difference is where
 * traffic gets blackholed.
 */

import { Fragment, useMemo, useState } from "react";
import { pluralise } from "@/lib/plural";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_ALIGNMENT_ROWS,
  MAX_GAP_PREFIXES,
  MAX_INPUT_CHARS,
  MAX_PREFIXES,
  aggregate,
  alignmentSegments,
  formatCidr,
  formatIpv4,
  maskOf,
  parsePrefixList,
  redundantPrefixes,
  summarize,
  type BitKind,
  type Cidr,
} from "@/lib/toolkit/route-summarizer";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "Three of four", text: "10.1.1.0/24\n10.1.2.0/24\n10.1.3.0/24" },
  { label: "Four /24s", text: "10.1.0.0/24\n10.1.1.0/24\n10.1.2.0/24\n10.1.3.0/24" },
  { label: "Mixed sizes", text: "172.16.8.0/24\n172.16.9.0/24\n172.16.10.0/23\n172.16.12.0/22" },
  { label: "Misaligned pair", text: "10.1.1.0/24\n10.1.2.0/24" },
  { label: "Overlap and gap", text: "10.0.0.0/16\n10.0.128.0/17\n10.2.0.0/16" },
];

const MAX_PROBLEMS_SHOWN = 20;
const MAX_NOTICES_SHOWN = 10;

const BIT_STYLE: Record<BitKind, string> = {
  common: "text-[hsl(var(--brand-signal))]",
  network: "text-[hsl(var(--brand-bone))]",
  host: "text-[hsl(var(--brand-ash))]",
};

const INPUT_CLASS =
  "mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  if (p > 0 && p < 0.1) return "under 0.1%";
  // Rounding must not turn "almost all" into "all": 2 of 2^32 listed is not 100% extra.
  if (p < 100 && p >= 99.9) return "over 99.9%";
  return `${p.toFixed(p < 10 ? 1 : 0)}%`;
}

/** One row of the alignment view: the address in binary with a bar at the summary boundary. */
function BitRow({ value, common, own }: { value: number; common: number; own: number }) {
  const segments = alignmentSegments(value, common, own);
  // The bar goes after the last common bit, so every row shifts by the same
  // one character and the columns stay aligned.
  let placed = common === 0;
  return (
    <span className="whitespace-pre">
      {common === 0 ? (
        <span aria-hidden className="text-[hsl(var(--brand-amber))]">
          |
        </span>
      ) : null}
      {segments.map((seg, i) => {
        const bar = !placed && seg.kind === "common";
        if (bar) placed = true;
        return (
          <Fragment key={i}>
            <span className={BIT_STYLE[seg.kind]}>{seg.text}</span>
            {bar ? (
              <span aria-hidden className="text-[hsl(var(--brand-amber))]">
                |
              </span>
            ) : null}
          </Fragment>
        );
      })}
    </span>
  );
}

export function RouteSummarizer() {
  const [raw, setRaw] = useState(EXAMPLES[0].text);

  const parsed = useMemo(() => parsePrefixList(raw), [raw]);
  const result = useMemo(() => {
    if (parsed.prefixes.length === 0) return null;
    const summary = summarize(parsed.prefixes);
    if (!summary) return null;
    const aggregateList = aggregate(parsed.prefixes);
    const redundant = redundantPrefixes(parsed.prefixes);

    const seen = new Set<string>();
    const unique: Cidr[] = [];
    for (const p of [...parsed.prefixes].sort((a, b) => a.network - b.network || a.length - b.length)) {
      const key = formatCidr(p);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    return { summary, aggregateList, redundant, unique };
  }, [parsed]);

  const hostBitNotices = parsed.prefixes.filter((p) => p.hostBitsCleared);
  const pairNotices = parsed.prefixes.filter((p) => p.pairedMask !== null);
  const hasProblems = parsed.problems.length > 0 || parsed.tooLong || parsed.truncated;

  const statusText = parsed.tooLong
    ? "Nothing read."
    : result
      ? `${parsed.prefixes.length} ${pluralise(parsed.prefixes.length, "prefix", "prefixes")} read, ${result.aggregateList.length} after exact aggregation. Tightest single summary ${formatCidr(result.summary)}.`
      : raw.trim() === ""
        ? "Paste prefixes to summarize them."
        : "No valid prefixes yet.";

  const aggregateText = result ? result.aggregateList.map(formatCidr).join("\n") : "";
  const gapText = result ? result.summary.gapCidrs.map(formatCidr).join("\n") : "";

  return (
    <ToolShell slug="route-summarizer">
      <div className="space-y-6">
        <ToolPanel title="Prefixes">
          <label
            htmlFor="route-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            IPv4 prefixes, one per line or separated by commas. A bare address counts as a /32.
          </label>
          <textarea
            id="route-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={7}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={hasProblems}
            aria-describedby={hasProblems ? "route-problems" : "route-hint"}
            placeholder={"10.1.0.0/24\n10.1.1.0/24\n10.1.2.0/24"}
            data-testid="input-prefixes"
            className={INPUT_CLASS}
          />

          {hasProblems ? (
            <div
              id="route-problems"
              role="alert"
              data-testid="text-route-errors"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {parsed.tooLong ? (
                <p>
                  That paste is {commas(raw.length)} characters. The limit is {commas(MAX_INPUT_CHARS)}, so
                  nothing was read.
                </p>
              ) : null}
              {parsed.truncated ? (
                <p>
                  Only the first {commas(MAX_PREFIXES)} entries were read. The rest of the list was
                  skipped.
                </p>
              ) : null}
              {parsed.problems.length > 0 ? (
                <ul className="space-y-1">
                  {parsed.problems.slice(0, MAX_PROBLEMS_SHOWN).map((problem, i) => (
                    <li key={`${problem.line}-${i}`} className="break-all">
                      Line {problem.line}: "{problem.text}" {problem.message}
                    </li>
                  ))}
                  {parsed.problems.length > MAX_PROBLEMS_SHOWN ? (
                    <li>
                      And {parsed.problems.length - MAX_PROBLEMS_SHOWN} more{" "}
                      {pluralise(parsed.problems.length - MAX_PROBLEMS_SHOWN, "entry", "entries")} that
                      did not parse.
                    </li>
                  ) : null}
                </ul>
              ) : null}
              {parsed.problems.length > 0 ? (
                <p className="mt-2 text-[hsl(var(--brand-bone-dim))]">
                  Entries that did not parse are left out of the results below.
                </p>
              ) : null}
            </div>
          ) : (
            <p id="route-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Netmask forms work too (10.1.0.0/255.255.255.0 or 10.1.0.0 255.255.255.0), and anything
              after a # is a comment. Up to {commas(MAX_PREFIXES)} entries.
            </p>
          )}

          {pairNotices.length > 0 ? (
            <div
              data-testid="text-mask-pairs"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-iron))] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
            >
              <p>An address followed by a mask was read as one prefix, the way router configurations write it:</p>
              <ul className="mt-1 space-y-1">
                {pairNotices.slice(0, MAX_NOTICES_SHOWN).map((p, i) => (
                  <li key={`${p.line}-${i}`} className="break-all">
                    {p.source} ({p.pairedMask === "wildcard" ? "wildcard mask" : "netmask"}) is {formatCidr(p)}
                  </li>
                ))}
                {pairNotices.length > MAX_NOTICES_SHOWN ? (
                  <li>And {pairNotices.length - MAX_NOTICES_SHOWN} more.</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {hostBitNotices.length > 0 ? (
            <div
              data-testid="text-host-bits"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
            >
              <p>Host bits were set, so these were moved down to their network address:</p>
              <ul className="mt-1 space-y-1">
                {hostBitNotices.slice(0, MAX_NOTICES_SHOWN).map((p, i) => (
                  <li key={`${p.line}-${i}`} className="break-all">
                    {p.source} became {formatCidr(p)}
                  </li>
                ))}
                {hostBitNotices.length > MAX_NOTICES_SHOWN ? (
                  <li>And {hostBitNotices.length - MAX_NOTICES_SHOWN} more.</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.text)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP_CLASS}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-route-status"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {statusText}
        </p>

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Exact aggregate">
                <ToolResult
                  label="Entries read"
                  value={`${parsed.prefixes.length} ${pluralise(parsed.prefixes.length, "prefix", "prefixes")}`}
                />
                <ToolResult
                  label="Already covered"
                  value={
                    result.redundant.length === 0
                      ? "none"
                      : `${result.redundant.length} duplicate or nested ${pluralise(result.redundant.length, "entry", "entries")}`
                  }
                />
                <ToolResult
                  label="After aggregation"
                  value={`${result.aggregateList.length} ${pluralise(result.aggregateList.length, "prefix", "prefixes")}`}
                  testId="text-aggregate-count"
                />
                <ToolResult
                  label="Addresses covered"
                  value={commas(result.summary.covered)}
                />
                <pre
                  data-testid="text-aggregate"
                  className="mt-4 max-h-80 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
                >
                  {aggregateText}
                </pre>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    Same addresses, fewest prefixes
                  </span>
                  <CopyButton value={aggregateText} label="Copy the aggregated prefixes" testId="button-copy-aggregate" />
                </div>
              </ToolPanel>

              <ToolPanel title="Single summary route">
                <ToolResult label="Summary" value={formatCidr(result.summary)} testId="text-summary-route" />
                <ToolResult label="Netmask" value={formatIpv4(maskOf(result.summary.length))} />
                <ToolResult label="Addresses in summary" value={commas(result.summary.size)} />
                <ToolResult label="Addresses you listed" value={commas(result.summary.covered)} />
                <ToolResult
                  label="Extra addresses claimed"
                  value={
                    result.summary.extra === 0
                      ? "0"
                      : `${commas(result.summary.extra)} (${percent(result.summary.extra, result.summary.size)} of the summary)`
                  }
                  testId="text-extra"
                />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                    {formatCidr(result.summary)}
                  </pre>
                  <CopyButton value={formatCidr(result.summary)} label="Copy the summary route" testId="button-copy-summary" />
                </div>
                {result.summary.extra === 0 ? (
                  <p
                    data-testid="text-summary-verdict"
                    className="mt-4 rounded-lg border border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
                  >
                    Exact. The summary covers the listed addresses and nothing else, so advertising it
                    in place of the list attracts no traffic for addresses outside the list.
                  </p>
                ) : (
                  <p
                    data-testid="text-summary-verdict"
                    className="mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    <strong className="font-normal uppercase tracking-[0.2em]">Over-summarized: </strong>
                    a router advertising {formatCidr(result.summary)} attracts traffic for{" "}
                    {commas(result.summary.extra)} {pluralise(result.summary.extra, "address", "addresses")}{" "}
                    it was not given. If those addresses live somewhere else, they only reach the right
                    place while a more specific route for them stays up.
                  </p>
                )}
              </ToolPanel>
            </div>

            <ToolPanel title="Common bits">
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Every listed address agrees on its first {result.summary.length}{" "}
                {pluralise(result.summary.length, "bit")}, so that is the summary's prefix length. The bar
                marks the boundary.{" "}
                <span className="text-[hsl(var(--brand-signal))]">Shared bits</span>,{" "}
                <span className="text-[hsl(var(--brand-bone))]">the rest of each prefix</span> and{" "}
                <span className="text-[hsl(var(--brand-ash))]">host bits</span>.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-alignment">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th
                        scope="col"
                        className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        Prefix
                      </th>
                      <th
                        scope="col"
                        className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        Network address in binary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unique.slice(0, MAX_ALIGNMENT_ROWS).map((p) => (
                      <tr key={formatCidr(p)} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th
                          scope="row"
                          className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone-dim))]"
                        >
                          {formatCidr(p)}
                        </th>
                        <td className="py-2 font-mono-tight text-xs">
                          <BitRow value={p.network} common={result.summary.length} own={p.length} />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <th
                        scope="row"
                        className="whitespace-nowrap py-2 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]"
                      >
                        {formatCidr(result.summary)}
                        <span className="sr-only"> (summary)</span>
                      </th>
                      <td className="py-2 font-mono-tight text-xs">
                        <BitRow
                          value={result.summary.network}
                          common={result.summary.length}
                          own={result.summary.length}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {result.unique.length > MAX_ALIGNMENT_ROWS ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Showing the first {MAX_ALIGNMENT_ROWS} of {commas(result.unique.length)} distinct prefixes,
                  lowest first. The summary uses all of them.
                </p>
              ) : null}
            </ToolPanel>

            {result.summary.extra > 0 ? (
              <ToolPanel title="Addresses the summary adds">
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  These blocks are inside {formatCidr(result.summary)} but were not in the list. Check that
                  nothing else owns them before advertising the summary.
                </p>
                <pre
                  data-testid="text-gaps"
                  className="mt-4 max-h-80 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                >
                  {gapText}
                </pre>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {result.summary.gapCidrTotal > result.summary.gapCidrs.length
                      ? `First ${MAX_GAP_PREFIXES} of ${commas(result.summary.gapCidrTotal)} blocks`
                      : `${result.summary.gapCidrTotal} ${pluralise(result.summary.gapCidrTotal, "block")}`}
                  </span>
                  <CopyButton value={gapText} label="Copy the uncovered blocks" testId="button-copy-gaps" />
                </div>
              </ToolPanel>
            ) : null}
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
