/**
 * IPv6 prefix calculator.
 *
 * The address is one 128-bit BigInt and every view (expanded, compressed,
 * prefix range, nibble map, classification) is derived from it, so the
 * representations cannot drift apart. Parsing, RFC 5952 formatting and the
 * IANA registry lookup live in lib/toolkit/ipv6-calculator so they can be
 * unit tested without React.
 */

import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import { CopyButton } from "@/components/ui/copy-button";
import {
  SUBDIVIDE_LIST_LIMIT,
  classify,
  compress,
  expand,
  formatBig,
  isIpv4Mapped,
  looksLikeEui64,
  parsePrefixed,
  prefixInfo,
  reversePointer,
  reverseZones,
  subdivide,
  toNibbles,
} from "@/lib/toolkit/ipv6-calculator";
import { macFromInterfaceId, macString } from "@/lib/toolkit/eui64-generator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; value: string }[] = [
  { label: "A /56", value: "2001:db8:abcd:12::1/56" },
  { label: "Link-local", value: "fe80::21a:2bff:fe3c:4d5e%eth0/64" },
  { label: "ULA", value: "fd12:3456:789a:1::10/64" },
  { label: "Multicast", value: "ff02::1:ff3c:4d5e" },
  { label: "IPv4-mapped", value: "::ffff:192.0.2.1" },
  { label: "Teredo", value: "2001:0:4136:e378:8000:63bf:3fff:fdd2" },
  { label: "6to4", value: "2002:c000:204::1/48" },
];

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

/** Blocks whose low 64 bits are not an interface identifier, so an ff:fe there means nothing. */
const NO_INTERFACE_ID = new Set([
  "::/128",
  "::1/128",
  "::ffff:0:0/96",
  "::/96",
  "64:ff9b::/96",
  "2001::/32",
  "ff00::/8",
  "outside every allocated block",
]);

/** The first of /48, /56, /64 longer than the prefix, which is what people usually split into. */
function defaultSplit(prefix: number): number {
  for (const target of [48, 56, 64]) if (target > prefix) return target;
  return Math.min(128, prefix + 1);
}

function plural(n: bigint, one: string, many: string): string {
  return n === 1n ? one : many;
}

/** The 32 hex digits of a value, lit up to the prefix boundary. */
function NibbleRow({ label, value, prefix }: { label: string; value: bigint; prefix: number }) {
  const nibbles = toNibbles(value).split("");
  const whole = Math.floor(prefix / 4);
  const spare = prefix % 4;
  return (
    <div>
      <div className={LABEL_CLASS}>{label}</div>
      <div className="mt-1.5 overflow-x-auto pb-1">
        <div className="flex w-max items-center font-mono-tight text-sm leading-none" aria-hidden="true">
          {nibbles.map((n, i) => (
            <Fragment key={i}>
              {i === whole && spare === 0 ? (
                <span className="mx-[3px] inline-block h-4 w-[2px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]" />
              ) : i > 0 && i % 4 === 0 ? (
                <span className="px-[2px] text-[hsl(var(--brand-ash))]">:</span>
              ) : null}
              <span
                className={
                  i < whole
                    ? "px-[1px] text-[hsl(var(--brand-signal))]"
                    : i === whole && spare !== 0
                      ? "rounded-sm bg-[hsl(var(--brand-amber)/0.14)] px-[1px] text-[hsl(var(--brand-amber))]"
                      : "px-[1px] text-[hsl(var(--brand-ash))]"
                }
              >
                {n}
              </span>
            </Fragment>
          ))}
          {prefix === 128 ? (
            <span className="ml-[3px] inline-block h-4 w-[2px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]" />
          ) : null}
        </div>
      </div>
      <p className="sr-only">
        {label}: the first {whole} hex {whole === 1 ? "digit is" : "digits are"} prefix
        {spare ? `, plus the top ${spare} ${spare === 1 ? "bit" : "bits"} of the next digit` : ""}.
      </p>
    </div>
  );
}

export function Ipv6Calculator() {
  const [raw, setRaw] = useState("2001:db8:abcd:12::1/56");
  const [chosenSplit, setChosenSplit] = useState<number | null>(null);

  const parsed = useMemo(() => (raw.trim() === "" ? null : parsePrefixed(raw, 128)), [raw]);
  const ok = parsed && parsed.ok ? parsed : null;

  const info = useMemo(() => (ok ? prefixInfo(ok.value, ok.prefix) : null), [ok]);
  const kind = useMemo(() => (ok ? classify(ok.value) : null), [ok]);

  const prefix = ok?.prefix ?? 128;
  const split =
    chosenSplit !== null && chosenSplit > prefix && chosenSplit <= 128 ? chosenSplit : defaultSplit(prefix);
  const subdivision = useMemo(
    () => (ok && info && prefix < 128 ? subdivide(info.network, prefix, split) : null),
    [ok, info, prefix, split],
  );

  const zones = useMemo(() => (ok && info ? reverseZones(info.network, ok.prefix) : []), [ok, info]);

  // The low 64 bits are an interface identifier in unicast space, except in
  // blocks whose low bits carry something else (an IPv4 address, Teredo's
  // obfuscated client, a multicast group ID) or are unallocated.
  const eui =
    ok && kind && !NO_INTERFACE_ID.has(kind.block) && looksLikeEui64(ok.value)
      ? macFromInterfaceId(ok.value & ((1n << 64n) - 1n))
      : null;

  const summary =
    ok && info && kind
      ? [
          `Address        ${compress(ok.value)}${ok.zone ? `%${ok.zone}` : ""}/${ok.prefix}`,
          `Expanded       ${expand(ok.value)}`,
          `Network        ${compress(info.network)}/${ok.prefix}`,
          `First          ${compress(info.network)}`,
          `Last           ${compress(info.last)}`,
          `Addresses      ${formatBig(info.total)} (2^${128 - ok.prefix})`,
          `/64 subnets    ${info.count64 === null ? "none (longer than /64)" : formatBig(info.count64)}`,
          `Type           ${kind.label} (${kind.block}, ${kind.rfc})`,
        ].join("\n")
      : "";

  const errorId = "ipv6-input-message";
  const hint =
    ok && !ok.prefixGiven
      ? "No prefix length given, so this is treated as a single address (/128). Add one, such as /64 or /48, to see the block it sits in."
      : null;

  return (
    <ToolShell slug="ipv6-calculator">
      <div className="space-y-6">
        <ToolPanel title="Address">
          <label
            htmlFor="ipv6-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            IPv6 address with a prefix length
          </label>
          <input
            id="ipv6-input"
            type="text"
            value={raw}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setRaw(event.target.value)}
            aria-invalid={parsed !== null && !parsed.ok}
            aria-describedby={errorId}
            placeholder="2001:db8:abcd:12::1/56"
            data-testid="input-ipv6"
            className={INPUT_CLASS}
          />

          {parsed && !parsed.ok ? (
            <p
              id={errorId}
              role="alert"
              data-testid="text-ipv6-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{parsed.message}</span>
            </p>
          ) : (
            <p id={errorId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {hint ??
                "Any RFC 4291 text form works: full, shortened with ::, or with a dotted IPv4 tail. Square brackets and a zone such as %eth0 are accepted too."}
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
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        {ok && info && kind ? (
          <div className="space-y-6" data-testid="output-ipv6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ToolPanel title="Forms">
                <ToolResult label="Compressed (RFC 5952)" value={compress(ok.value)} testId="text-compressed" />
                {isIpv4Mapped(ok.value) ? (
                  <ToolResult label="Compressed, hex only" value={compress(ok.value, true)} />
                ) : null}
                <ToolResult label="Expanded" value={expand(ok.value)} testId="text-expanded" />
                {ok.zone ? <ToolResult label="Zone" value={`%${ok.zone}`} /> : null}
                <ToolResult label="Reverse DNS name" value={reversePointer(ok.value)} testId="text-ptr" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <CopyButton value={compress(ok.value)} label="Copy compressed address" testId="button-copy-compressed">
                    <span>Copy compressed</span>
                  </CopyButton>
                  <CopyButton value={expand(ok.value)} label="Copy expanded address" testId="button-copy-expanded">
                    <span>Copy expanded</span>
                  </CopyButton>
                </div>
              </ToolPanel>

              <ToolPanel title="Prefix">
                <ToolResult label="Network" value={`${compress(info.network)}/${ok.prefix}`} testId="text-network" />
                <ToolResult label="First address" value={compress(info.network)} testId="text-first" />
                <ToolResult label="Last address" value={compress(info.last)} testId="text-last" />
                <ToolResult label="Prefix / host bits" value={`${ok.prefix} / ${128 - ok.prefix}`} />
                <ToolResult
                  label="Addresses"
                  value={
                    <>
                      {formatBig(info.total)}
                      <span className="text-[hsl(var(--brand-ash))]"> · 2^{128 - ok.prefix}</span>
                    </>
                  }
                  testId="text-total"
                />
                <ToolResult
                  label="/64 subnets"
                  value={
                    info.count64 === null
                      ? `none, a /${ok.prefix} is part of ${compress(info.network & (((1n << 64n) - 1n) << 64n))}/64`
                      : `${formatBig(info.count64)} ${plural(info.count64, "subnet", "subnets")}`
                  }
                  testId="text-subnets64"
                />
                {info.count56 !== null && ok.prefix < 56 ? (
                  <ToolResult label="/56 blocks" value={formatBig(info.count56)} />
                ) : null}
                {info.count48 !== null && ok.prefix < 48 ? (
                  <ToolResult label="/48 sites" value={formatBig(info.count48)} />
                ) : null}
              </ToolPanel>
            </div>

            {info.hostBitsSet && ok.prefixGiven ? (
              <div className="rounded-2xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.06)] p-5">
                <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                  Host bits set
                </div>
                <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {compress(ok.value)} has bits set after the first {ok.prefix}, so it is an address inside the
                  block rather than the block itself. The network is {compress(info.network)}/{ok.prefix}. That
                  is the normal way to write an interface address, where the length says which addresses are
                  on the link. A route, prefix list or access list entry should use the network form, and
                  some tools reject a prefix with host bits set.
                </p>
              </div>
            ) : null}

            <ToolPanel title="Address type">
              <p className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]" data-testid="text-type">
                {kind.label}
              </p>
              <p className="mt-1 break-words font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                {kind.block} · {kind.rfc}
              </p>
              <p className="mt-3 max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {kind.detail}
              </p>
              {kind.fields.length ? (
                <div className="mt-4">
                  {kind.fields.map((field) => (
                    <ToolResult key={field.label} label={field.label} value={field.value} />
                  ))}
                </div>
              ) : null}
              {kind.notes.map((note) => (
                <p
                  key={note}
                  className="mt-4 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                >
                  {note}
                </p>
              ))}
              {eui && eui.mac ? (
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  The interface ID has <code className="text-[hsl(var(--brand-cyan))]">ff:fe</code> in the
                  middle, the mark of modified EUI-64. If that is how it was formed, it came from MAC address{" "}
                  <code className="text-[hsl(var(--brand-cyan))]">{macString(eui.mac)}</code>. The{" "}
                  <Link
                    href="/tools/eui64-generator"
                    className="text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))]"
                  >
                    EUI-64 generator
                  </Link>{" "}
                  shows the conversion step by step.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Prefix boundary">
              <div className="space-y-5">
                <NibbleRow label="Address" value={ok.value} prefix={ok.prefix} />
                <NibbleRow label="Network" value={info.network} prefix={ok.prefix} />
              </div>
              <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-signal))]">Lit digits</span> are the prefix. Each hex
                digit is 4 bits, so a prefix length that is a multiple of 4 ends cleanly between two digits.
                {ok.prefix % 4 !== 0 ? (
                  <>
                    {" "}
                    /{ok.prefix} does not: the{" "}
                    <span className="text-[hsl(var(--brand-amber))]">highlighted digit</span> is split, with its
                    top {ok.prefix % 4} {ok.prefix % 4 === 1 ? "bit" : "bits"} in the prefix.
                  </>
                ) : null}
              </p>
              <div className="mt-5">
                <div className={LABEL_CLASS}>
                  Reverse DNS {zones.length === 1 ? "zone" : `zones (${zones.length}, not nibble aligned)`}
                </div>
                <ul className="mt-2 space-y-1" data-testid="list-reverse-zones">
                  {zones.map((zone) => (
                    <li key={zone} className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                      {zone}
                    </li>
                  ))}
                </ul>
              </div>
            </ToolPanel>

            {subdivision ? (
              <ToolPanel title="Subdivide">
                <label htmlFor="ipv6-split" className={LABEL_CLASS}>
                  Split /{ok.prefix} into
                </label>
                <select
                  id="ipv6-split"
                  value={split}
                  onChange={(event) => setChosenSplit(Number(event.target.value))}
                  data-testid="select-split"
                  className={`${INPUT_CLASS} sm:max-w-[240px]`}
                >
                  {Array.from({ length: 128 - ok.prefix }, (_, i) => ok.prefix + 1 + i).map((p) => (
                    <option key={p} value={p}>
                      /{p} ({formatBig(1n << BigInt(p - ok.prefix))} blocks)
                    </option>
                  ))}
                </select>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {formatBig(subdivision.count)} {plural(subdivision.count, "block", "blocks")} of /{split}
                  {subdivision.lastSubnet !== null
                    ? `. The first ${SUBDIVIDE_LIST_LIMIT} and the last are listed.`
                    : "."}
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-subnets">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th
                          scope="col"
                          className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          #
                        </th>
                        <th
                          scope="col"
                          className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                        >
                          Subnet
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {subdivision.first.map((net, i) => (
                        <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                          <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{i}</td>
                          <td className="py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {compress(net)}/{split}
                          </td>
                        </tr>
                      ))}
                      {subdivision.lastSubnet !== null ? (
                        <>
                          {subdivision.count - BigInt(subdivision.first.length) > 1n ? (
                            <tr className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                              <td colSpan={2} className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                                {formatBig(subdivision.count - BigInt(subdivision.first.length) - 1n)} more not shown
                              </td>
                            </tr>
                          ) : null}
                          <tr>
                            <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                              {formatBig(subdivision.count - 1n)}
                            </td>
                            <td className="py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {compress(subdivision.lastSubnet)}/{split}
                            </td>
                          </tr>
                        </>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </ToolPanel>
            ) : null}

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={summary} testId="button-copy-summary">
                <span>Copy summary</span>
              </CopyButton>
            </div>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
