/**
 * Special-purpose IP address lookup.
 *
 * One address in, the IANA special-purpose registry entry it falls in out,
 * with the registry's own attribute columns rather than a paraphrase of
 * them. Every containing entry is reported, most specific first, because
 * the registry nests (192.0.0.9/32 sits inside 192.0.0.0/24, and the outer
 * entry alone would say the address is unusable). The parsing and the data
 * live in lib/toolkit so they can be tested without a browser.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ATTRIBUTE_INFO,
  ATTRIBUTE_KEYS,
  REGISTRY,
  attributeSentences,
  classify,
  formatIp,
  parseIp,
  sampleAddress,
  type Attr,
  type Block,
  type Family,
  type Match,
  type SpecialEntry,
} from "@/lib/toolkit/ip-address-classifier";

const EXAMPLES: string[] = [
  "100.64.12.7",
  "169.254.169.254",
  "192.0.0.9",
  "198.18.0.1",
  "203.0.113.50",
  "255.255.255.255",
  "224.0.0.251",
  "::ffff:127.0.0.1",
  "64:ff9b::192.0.2.33",
  "2001:0:4136:e378:8000:63bf:3fff:fdd2",
  "fd12:3456:789a:1::1",
  "fe80::1%eth0",
  "ff02::1:ff12:3456",
];

const REGISTRY_LABEL: Record<SpecialEntry["registry"], string> = {
  special: "IANA special-purpose registry",
  multicast: "IANA IPv4 multicast registry",
  "address-space": "IANA IPv6 address space registry",
};

const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
/** Uppercase label pills, as on the other tools. */
const PILL_LABEL = "text-[0.625rem] uppercase tracking-[0.18em]";
const PILL_IDLE =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const PILL_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";

const TH =
  "py-2 pr-3 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

function attrText(v: Attr): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "n/a";
}

/** A yes / no / n/a chip. The word carries the meaning; the color only repeats it. */
function AttrChip({ value }: { value: Attr }) {
  const tone =
    value === true
      ? "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]"
      : value === false
        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
        : "border-dashed border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]";
  return (
    <span
      className={`inline-flex min-w-[2.75rem] justify-center rounded-md border px-2 py-0.5 font-mono-tight text-xs ${tone}`}
    >
      {attrText(value)}
    </span>
  );
}

/** The registry is static, so each row's sample address is worked out once. */
const SAMPLES = new Map<string, string>();
function sampleFor(entry: SpecialEntry, block: Block): string {
  let text = SAMPLES.get(block.cidr);
  if (text === undefined) {
    text = formatIp(entry.family, sampleAddress(entry, block));
    SAMPLES.set(block.cidr, text);
  }
  return text;
}

function blockList(entry: SpecialEntry): string {
  return entry.blocks.map((b) => b.cidr).join(", ");
}

function RegistryTable({
  family,
  matches,
  primaryId,
  onPick,
}: {
  family: Family;
  matches: Match[];
  primaryId: string | null;
  onPick: (address: string) => void;
}) {
  const matched = new Set(matches.map((m) => m.entry.id));
  const { special, related } = REGISTRY[family];

  const row = (entry: SpecialEntry) => {
    const isPrimary = entry.id === primaryId;
    const isMatch = matched.has(entry.id);
    const tone = isPrimary
      ? "bg-[hsl(var(--brand-signal)/0.14)]"
      : isMatch
        ? "bg-[hsl(var(--brand-signal)/0.06)]"
        : "";
    return (
      <tr
        key={entry.id}
        data-testid={isMatch ? `row-match-${entry.id}` : undefined}
        className={`border-b border-[hsl(var(--brand-iron)/0.5)] align-top ${tone}`}
      >
        <td className="py-2 pr-3">
          <div className="flex flex-col items-start">
            {entry.blocks.map((b) => {
              const sample = sampleFor(entry, b);
              return (
                <button
                  key={b.cidr}
                  type="button"
                  onClick={() => onPick(sample)}
                  aria-label={`Look up ${sample}, an address in ${b.cidr}`}
                  className={`min-h-[24px] whitespace-nowrap rounded py-1 text-left font-mono-tight text-xs underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    isMatch ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {b.cidr}
                </button>
              );
            })}
          </div>
        </td>
        <th scope="row" className="py-2 pr-3 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
          {entry.name}
          {isMatch ? (
            <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))]">
              {isPrimary ? "match" : "contains"}
            </span>
          ) : null}
        </th>
        <td className="py-2 pr-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{entry.rfcs.join(", ")}</td>
        {ATTRIBUTE_KEYS.map((key) => (
          <td key={key} className="py-2 pr-3 text-center font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            {entry.registry === "special" ? attrText(entry.attrs[key]) : ""}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <caption className="sr-only">
          IANA IPv{family} special-purpose address registry, with matching rows marked
        </caption>
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))]">
            <th scope="col" className={TH}>
              Block
            </th>
            <th scope="col" className={TH}>
              Name
            </th>
            <th scope="col" className={TH}>
              RFC
            </th>
            {ATTRIBUTE_KEYS.map((key) => (
              <th key={key} scope="col" className={`${TH} text-center`}>
                <span aria-hidden>{ATTRIBUTE_INFO[key].short}</span>
                <span className="sr-only">{ATTRIBUTE_INFO[key].label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{special.map(row)}</tbody>
        <tbody>
          <tr>
            <th
              scope="rowgroup"
              colSpan={3 + ATTRIBUTE_KEYS.length}
              className="pb-2 pt-6 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
            >
              Related blocks from other IANA registries (no attribute columns)
            </th>
          </tr>
          {related.map(row)}
        </tbody>
      </table>
    </div>
  );
}

export function IpAddressClassifier() {
  const [raw, setRaw] = useState("169.254.169.254");
  const [tableOverride, setTableOverride] = useState<Family | null>(null);

  const parsed = useMemo(() => (raw.trim() === "" ? null : parseIp(raw)), [raw]);
  const result = useMemo(() => (parsed && parsed.ok ? classify(parsed.value) : null), [parsed]);
  const error = parsed && !parsed.ok ? parsed.error : null;

  const tableFamily: Family = tableOverride ?? result?.family ?? 4;
  const top = result ? (result.primary ?? result.related) : null;
  const primaryEntry = result?.primary?.entry ?? null;
  const sentences = primaryEntry ? attributeSentences(primaryEntry.attrs) : [];

  function load(value: string) {
    setRaw(value);
    setTableOverride(null);
  }

  const summary = result
    ? top
      ? `${result.canonical} is in ${top.block.cidr}, ${top.entry.name}.`
      : `${result.canonical}: ${result.fallback?.title ?? "no special-purpose entry"}.`
    : error
      ? "Not a valid address."
      : "Enter an address to classify it.";

  return (
    <ToolShell slug="ip-address-classifier">
      <div className="space-y-6">
        <ToolPanel title="Address">
          <label htmlFor="ipc-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            An IPv4 or IPv6 address. Brackets and an IPv6 zone ID (%eth0) are accepted.
          </label>
          <input
            id="ipc-input"
            value={raw}
            onChange={(e) => load(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={300}
            aria-invalid={error !== null}
            aria-describedby={error ? "ipc-error" : "ipc-hint"}
            placeholder="192.0.2.10 or 2001:db8::1"
            data-testid="input-ip"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {error ? (
            <p
              id="ipc-error"
              role="alert"
              data-testid="text-ip-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {error}
            </p>
          ) : (
            <p id="ipc-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Strict notation only. Shorthand that some parsers accept, such as 127.1, 0177.0.0.1 or a bare integer, is
              refused with the reason, because those forms are how address filters get bypassed.
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
                onClick={() => load(example)}
                data-testid={`button-example-${example.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className={`${PILL} break-all text-xs ${raw === example ? PILL_ON : PILL_IDLE}`}
              >
                {example}
              </button>
            ))}
          </div>
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="break-words font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Classification">
                <div
                  data-testid="text-classification"
                  className="font-display text-2xl font-medium leading-tight text-[hsl(var(--brand-bone))]"
                >
                  {top ? top.entry.name : result.fallback?.title}
                </div>
                {top ? (
                  <p className="mt-2 break-words font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                    {blockList(top.entry)} · {top.entry.rfcs.join(", ")}
                    {top.entry.deprecated ? " · deprecated" : ""}
                  </p>
                ) : null}
                <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {top ? top.entry.summary : result.fallback?.text}
                </p>
                {result.wellKnown ? (
                  <p
                    data-testid="text-well-known"
                    className="mt-3 rounded-lg border border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
                  >
                    <span className="text-[hsl(var(--brand-cyan))]">This exact address: </span>
                    {result.wellKnown}
                  </p>
                ) : null}

                <div className="mt-5">
                  <ToolResult label="Family" value={`IPv${result.family}`} />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5">
                    <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      {result.family === 6 ? "Canonical (RFC 5952)" : "Address"}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span data-testid="text-canonical" className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {result.canonical}
                      </span>
                      <CopyButton value={result.canonical} label="Copy the canonical address" />
                    </span>
                  </div>
                  {result.family === 6 ? <ToolResult label="Expanded" value={result.expanded} /> : null}
                  {result.details.map((d) => (
                    <ToolResult key={d.label} label={d.label} value={d.value} />
                  ))}
                  {top ? <ToolResult label="Source registry" value={REGISTRY_LABEL[top.entry.registry]} mono={false} /> : null}
                </div>
              </ToolPanel>

              <ToolPanel title="Registry attributes">
                {primaryEntry ? (
                  <>
                    <dl className="space-y-3" data-testid="list-attributes">
                      {ATTRIBUTE_KEYS.map((key) => (
                        <div key={key} className="flex items-start justify-between gap-4 border-b border-[hsl(var(--brand-iron)/0.5)] pb-3 last:border-b-0">
                          <div className="min-w-0">
                            <dt className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                              {ATTRIBUTE_INFO[key].label}
                            </dt>
                            <dd className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                              {ATTRIBUTE_INFO[key].definition}
                            </dd>
                          </div>
                          <AttrChip value={primaryEntry.attrs[key]} />
                        </div>
                      ))}
                    </dl>
                    {primaryEntry.footnote ? (
                      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        Registry note: {primaryEntry.footnote}
                      </p>
                    ) : null}
                    {sentences.length ? (
                      <ul className="mt-4 space-y-1.5" data-testid="list-attribute-sentences">
                        {sentences.map((s) => (
                          <li key={s} className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]">
                            {s}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        The registry gives this deprecated block no attributes, so nothing can be assumed about it.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {top
                      ? `${top.entry.name} comes from the ${REGISTRY_LABEL[top.entry.registry]}, which does not publish the source, destination, forwardable and reachability columns. The description on the left says how the block behaves.`
                      : "No special-purpose entry applies, so the registry has no attributes to report. An ordinary unicast address is valid as a source and a destination and may be forwarded and reached globally, subject to whoever routes it."}
                  </p>
                )}
              </ToolPanel>
            </div>

            {result.matches.length > 1 ? (
              <ToolPanel title="Every entry containing it">
                <ol className="space-y-2" data-testid="list-matches">
                  {result.matches.map((m, i) => (
                    <li key={m.entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-tight text-sm">
                      <span className="text-[hsl(var(--brand-ash))]">{i + 1}.</span>
                      <span className="text-[hsl(var(--brand-signal))]">{m.block.cidr}</span>
                      <span className="text-[hsl(var(--brand-bone))]">{m.entry.name}</span>
                      <span className="text-xs text-[hsl(var(--brand-ash))]">{REGISTRY_LABEL[m.entry.registry]}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  The most specific entry wins. An outer entry such as IETF Protocol Assignments describes the space
                  around the address, not the address itself.
                </p>
              </ToolPanel>
            ) : null}

            {result.embedded.length ? (
              <ToolPanel title="Embedded IPv4">
                <div data-testid="list-embedded">
                  {result.embedded.map((e) => (
                    <ToolResult
                      key={e.label}
                      label={e.label}
                      value={`${e.ipv4}${e.port !== null ? ` port ${e.port}` : ""} (${e.classifiedAs ?? "global unicast"})`}
                    />
                  ))}
                </div>
              </ToolPanel>
            ) : null}

            {result.notes.length ? (
              <ul className="space-y-2" data-testid="list-notes">
                {result.notes.map((n) => (
                  <li
                    key={n}
                    className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        <ToolPanel title="The registry">
          <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Registry to show">
            {([4, 6] as Family[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={tableFamily === f}
                onClick={() => setTableOverride(f)}
                data-testid={`button-table-ipv${f}`}
                className={`${PILL} ${PILL_LABEL} ${tableFamily === f ? PILL_ON : PILL_IDLE}`}
              >
                IPv{f}
              </button>
            ))}
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Select a block to look up an address inside it.
            </span>
          </div>
          <RegistryTable
            family={tableFamily}
            matches={result && result.family === tableFamily ? result.matches : []}
            primaryId={result && result.family === tableFamily ? (top?.entry.id ?? null) : null}
            onPick={load}
          />
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
