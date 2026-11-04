/**
 * BGP community decoder.
 *
 * Takes a pasted list of communities in whatever form a router, a looking
 * glass or a packet capture printed them, works out which of the three
 * attributes each one belongs to, and shows every equivalent spelling with
 * the wire bytes. The parsing lives in lib/toolkit so it can be tested
 * without a browser; this file only lays it out.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  decodeCommunities,
  MAX_COMMUNITIES,
  MAX_COMMUNITY_INPUT,
  WELL_KNOWN,
  type CommunityKind,
  type CommunityResult,
  type DecodedCommunity,
  type Tone,
} from "@/lib/toolkit/bgp-community-decoder";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Well-known",
    text: "no-export\n65535:666\n4294967042\ngraceful-shutdown\n0xFFFFFF04",
  },
  {
    label: "Standard",
    text: "64500:120\n64512:666\n0:64501\n4227137636\n23456:10",
  },
  {
    label: "Large",
    text: "4200000000:1:2\n64496:100:0\nlarge:65551:7:3",
  },
  {
    label: "Extended",
    text: "rt:65000:100\ntarget:192.0.2.1:7\nsoo:4200000000:1\nrt:65000L:5\n0x4300000000000002",
  },
];

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  info: "border-[hsl(var(--brand-cyan)/0.4)] bg-[hsl(var(--brand-cyan)/0.06)] text-[hsl(var(--brand-bone-dim))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

const KIND_STYLE: Record<CommunityKind, string> = {
  standard: "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]",
  extended: "border-[hsl(var(--brand-cyan)/0.6)] text-[hsl(var(--brand-cyan))]",
  large: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
};

const KIND_LABEL: Record<CommunityKind, string> = {
  standard: "Standard, RFC 1997",
  extended: "Extended, RFC 4360",
  large: "Large, RFC 8092",
};

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Shortens a very long unreadable entry for display; the error says how long it was. */
function clipForDisplay(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function CommunityCard({ value, index }: { value: DecodedCommunity; index: number }) {
  const enteredDifferently = value.input.toLowerCase() !== value.canonical.toLowerCase();
  return (
    <li
      data-testid={`card-community-${index}`}
      className="min-w-0 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${KIND_STYLE[value.kind]}`}
        >
          {KIND_LABEL[value.kind]}
        </span>
        {value.name ? (
          <span className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">{value.name}</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          data-testid={`text-canonical-${index}`}
          className="min-w-0 flex-1 break-all font-mono-tight text-base text-[hsl(var(--brand-bone))]"
        >
          {value.canonical}
        </code>
        <CopyButton value={value.canonical} label={`Copy ${value.canonical}`} />
      </div>
      {enteredDifferently ? (
        <p className="mt-1 break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
          Entered as {value.input}
        </p>
      ) : null}

      <div className="mt-3">
        {value.fields.map((f) => (
          <ToolResult key={f.label} label={f.label} value={f.value} />
        ))}
        <ToolResult label="Wire bytes" value={value.bytes} />
      </div>

      {value.flags.length ? (
        <ul className="mt-3 space-y-2">
          {value.flags.map((flag, i) => (
            <li
              key={i}
              className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[flag.tone]}`}
            >
              {flag.text}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ErrorCard({ result, index }: { result: Extract<CommunityResult, { ok: false }>; index: number }) {
  return (
    <li
      data-testid={`card-error-${index}`}
      className="min-w-0 rounded-2xl border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-5"
    >
      <code className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
        {clipForDisplay(result.input)}
      </code>
      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">{result.error}</p>
    </li>
  );
}

export function BgpCommunityDecoder() {
  const [raw, setRaw] = useState(EXAMPLES[0].text);

  // Decoding hundreds of entries and drawing a card for each can take a
  // frame or two, so the cards follow the text a beat behind the typing.
  const deferred = useDeferredValue(raw);
  const batch = useMemo(() => decodeCommunities(deferred), [deferred]);
  const decoded = batch.results.filter((r): r is Extract<CommunityResult, { ok: true }> => r.ok);
  const failed = batch.results.length - decoded.length;

  const counts = { standard: 0, extended: 0, large: 0 };
  for (const r of decoded) counts[r.value.kind] += 1;

  const summary =
    batch.results.length === 0
      ? "Paste one or more communities to decode them."
      : [
          `${decoded.length} decoded`,
          counts.standard ? `${counts.standard} standard` : null,
          counts.extended ? `${counts.extended} extended` : null,
          counts.large ? `${counts.large} large` : null,
          failed ? `${failed} not recognized` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  // Tab separated, four columns on every row so it pastes into a
  // spreadsheet cleanly: canonical form, name or kind, 32-bit integer (blank
  // for extended and large), wire bytes.
  const plainText = decoded
    .map((r) => {
      const v = r.value;
      const integer = v.fields.find((f) => f.label.startsWith("32-bit integer"))?.value ?? "";
      return [v.canonical, v.name ?? v.kind, integer, v.bytes].join("\t");
    })
    .join("\n");

  const notices: string[] = [];
  if (batch.clipped) {
    notices.push(`Only the first ${MAX_COMMUNITY_INPUT.toLocaleString()} characters were read.`);
  }
  if (batch.dropped > 0) {
    notices.push(
      `Decoded the first ${MAX_COMMUNITIES} entries. ${batch.dropped.toLocaleString()} more ${pluralise(batch.dropped, "was", "were")} left out.`,
    );
  }

  return (
    <ToolShell slug="bgp-community-decoder">
      <div className="space-y-6">
        <ToolPanel title="Communities">
          <label
            htmlFor="community-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            One per line, or separated by commas or spaces.
          </label>
          <textarea
            id="community-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="community-hint"
            placeholder={"65535:65281\n4294967041\n64496:1:2\nrt:64496:100"}
            data-testid="input-communities"
            className="mt-3 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p id="community-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Standard as <code>ASN:value</code>, a 32-bit integer, hex or a name such as{" "}
            <code>no-export</code>. Large as <code>ASN:data1:data2</code>. Extended as{" "}
            <code>rt:ASN:value</code>, <code>soo:192.0.2.1:7</code> or 16 hex digits. Up to{" "}
            {MAX_COMMUNITIES} entries.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setRaw(example.text)}
                data-testid={`button-example-${slugOf(example.label)}`}
                className={CHIP}
              >
                {example.label}
              </button>
            ))}
            {raw ? (
              <button type="button" onClick={() => setRaw("")} data-testid="button-clear" className={CHIP}>
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            data-testid="text-summary"
            className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
          >
            {summary}
          </p>
          {plainText ? (
            <CopyButton
              value={plainText}
              label="Copy all decoded communities as tab separated text"
              testId="button-copy-all"
            >
              <span>Copy all</span>
            </CopyButton>
          ) : null}
        </div>

        {notices.length ? (
          <p
            role="alert"
            className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
          >
            {notices.join(" ")}
          </p>
        ) : null}

        {batch.results.length ? (
          <ul data-testid="list-communities" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {batch.results.map((result, i) =>
              result.ok ? (
                <CommunityCard key={`${i}-${result.input}`} value={result.value} index={i} />
              ) : (
                <ErrorCard key={`${i}-${result.input}`} result={result} index={i} />
              ),
            )}
          </ul>
        ) : null}

        <ToolPanel title="Well-known communities">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={TH}>
                    ASN:value
                  </th>
                  <th scope="col" className={TH}>
                    Integer
                  </th>
                  <th scope="col" className={TH}>
                    Hex
                  </th>
                  <th scope="col" className={TH}>
                    Defined in
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Decode</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {WELL_KNOWN.map((w) => {
                  const pair = `${Math.floor(w.value / 65536)}:${w.value % 65536}`;
                  return (
                    <tr key={w.name} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-middle">
                      <th
                        scope="row"
                        className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                      >
                        {w.name}
                      </th>
                      <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{pair}</td>
                      <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {w.value}
                      </td>
                      <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        0x{w.value.toString(16).toUpperCase()}
                      </td>
                      <td className="py-2.5 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{w.source}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setRaw(pair)}
                          aria-label={`Decode ${w.name}`}
                          data-testid={`button-load-${slugOf(w.name)}`}
                          className="inline-flex min-h-[32px] items-center rounded-md border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                        >
                          Decode
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            RFC 1997 reserves 0:0 to 0:65535 and 65535:0 to 65535:65535. The IANA well-known
            communities registry lists other values in the 65535 block that are not shown here.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
