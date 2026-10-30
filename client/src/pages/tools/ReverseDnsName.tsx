/**
 * Reverse DNS names, both ways.
 *
 * An address becomes its in-addr.arpa or ip6.arpa owner name, and a reverse
 * name becomes the address or prefix it stands for. The delegation panel
 * shows which zone a block's PTR records live in, and for an IPv4 block
 * smaller than a /24 it writes out the RFC 2317 CNAME arrangement that makes
 * delegating it possible at all. Nothing is looked up: the dig commands are
 * for the reader to run.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import { familyBits, formatIp, networkOf } from "@/lib/toolkit/ip-address-classifier";
import {
  CLASSLESS_MIN,
  classlessZoneFiles,
  delegationFor,
  digCommands,
  parseNameservers,
  parseReverseInput,
  ptrName,
  standardZones,
  zoneName,
  type LabelStyle,
} from "@/lib/toolkit/reverse-dns-name";

const EXAMPLES: string[] = [
  "192.0.2.65",
  "198.51.100.130/26",
  "2001:db8::1",
  "4321:0:1:2:3:4:567:89ab",
  "1.2.0.192.in-addr.arpa",
  "65.64/26.2.0.192.in-addr.arpa",
  "8.b.d.0.1.0.0.2.ip6.arpa",
];

const QUICK_PREFIXES: Record<4 | 6, number[]> = {
  4: [8, 16, 24, 25, 26, 27, 28, 29],
  6: [32, 48, 56, 62, 64],
};

const INPUT =
  "w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const PILL =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const PILL_IDLE =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const PILL_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

/** A copyable block of text, wrapped so long names scroll inside it rather than the page. */
function CodeBlock({ text, label, testId, tall = false }: { text: string; label: string; testId?: string; tall?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <pre
        data-testid={testId}
        className={`min-w-0 flex-1 overflow-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))] ${
          tall ? "max-h-72" : ""
        }`}
      >
        {text}
      </pre>
      <CopyButton value={text} label={label} />
    </div>
  );
}

export function ReverseDnsName() {
  const [raw, setRaw] = useState("192.0.2.65");
  // null means "follow the input": a typed /prefix, the zone's own length, or the default.
  const [prefixDraft, setPrefixDraft] = useState<string | null>(null);
  const [style, setStyle] = useState<LabelStyle>("/");
  const [nsText, setNsText] = useState("ns1.customer.example, ns2.customer.example");

  const parsed = useMemo(() => (raw.trim() === "" ? null : parseReverseInput(raw)), [raw]);
  const input = parsed && parsed.ok ? parsed.value : null;
  const error = parsed && !parsed.ok ? parsed.error : null;

  const view = useMemo(() => {
    if (!input) return null;
    const { family, value } = input;
    const bits = familyBits(family);
    const isAddress = input.kind === "address" || input.prefix === bits;
    const derivedPrefix =
      input.kind === "address"
        ? (input.prefix ?? (family === 4 ? 24 : 64))
        : (input.classless?.prefix ?? input.prefix);
    const notes: string[] = [];

    let zone = "";
    if (!isAddress && input.kind === "ptr") {
      zone = input.classless ? input.name.replace(/\.$/, "") : zoneName(family, value, input.prefix);
      notes.push(
        `This name is a zone, not a single address. It covers ${formatIp(family, value)}/${input.prefix}, and the PTR records for that block sit beneath it.`,
      );
    }
    if (input.kind === "ptr" && input.classless && isAddress) {
      notes.push(
        `${input.name} is the RFC 2317 target name. A resolver asking for ${ptrName(4, value)} finds a CNAME in the /24 zone pointing here, and the PTR record is answered from the delegated child zone.`,
      );
    }
    if (input.kind === "ptr" && input.note) notes.push(input.note);
    if (input.kind === "address" && input.zoneId) {
      notes.push(`The zone ID %${input.zoneId} identifies an interface on this host. It has no meaning in DNS and is ignored.`);
    }
    if (family === 6 && value >> 32n === 0xffffn) {
      const v4 = value & 0xffffffffn;
      notes.push(
        `This is an IPv4-mapped address. On the wire the host is ${formatIp(4, v4)}, whose reverse name is ${ptrName(4, v4)}. Software that logs the mapped form will query ip6.arpa and usually find nothing.`,
      );
    }
    return {
      family,
      value,
      bits,
      isAddress,
      derivedPrefix,
      zone,
      ptr: isAddress ? ptrName(family, value) : zone,
      addressText: formatIp(family, value),
      notes,
      zones: standardZones(family, value),
      dig: digCommands(family, value, isAddress, zone),
    };
  }, [input]);

  // The prefix field: either what the reader typed, or the value derived from the input.
  const prefixText = prefixDraft ?? (view ? String(view.derivedPrefix) : "");
  let prefixError: string | null = null;
  let prefix: number | null = null;
  if (view) {
    if (!/^\d{1,3}$/.test(prefixText.trim())) {
      prefixError = `Enter a prefix length from 0 to ${view.bits}.`;
    } else if (Number(prefixText) > view.bits) {
      prefixError = `An IPv${view.family} prefix length is 0 to ${view.bits}.`;
    } else {
      prefix = Number(prefixText);
    }
  }

  const delegation = useMemo(
    () => (view && prefix !== null ? delegationFor(view.family, view.value, prefix, style) : null),
    [view, prefix, style],
  );

  const classless = delegation?.classless ?? null;
  const nameservers = useMemo(() => parseNameservers(nsText), [nsText]);

  // The host used in the worked example: the typed address, or for a zone
  // the first address after the network address when the block has one.
  const classlessHost = useMemo(() => {
    const c = delegation?.classless;
    if (!view || !c) return null;
    return view.isAddress ? Number(view.value & 0xffn) : c.start + (c.end - c.start > 1 ? 1 : 0);
  }, [view, delegation]);

  const zoneFiles = useMemo(() => {
    if (!delegation?.classless || classlessHost === null || !nameservers.ok) return null;
    return classlessZoneFiles(delegation.classless, classlessHost, nameservers.value);
  }, [delegation, classlessHost, nameservers]);

  function load(value: string) {
    setRaw(value);
    setPrefixDraft(null);
  }

  const summary = view
    ? view.isAddress
      ? `${view.addressText} ↔ ${view.ptr}`
      : `${view.zone} covers ${formatIp(view.family, view.value)}/${input?.kind === "ptr" ? input.prefix : view.derivedPrefix}`
    : error
      ? "Nothing to convert."
      : "Enter an address or a reverse name.";

  return (
    <ToolShell slug="reverse-dns-name">
      <div className="space-y-6">
        <ToolPanel title="Address or reverse name">
          <label htmlFor="rdns-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            An IPv4 or IPv6 address (optionally with /prefix), or a name ending in in-addr.arpa or ip6.arpa.
          </label>
          <input
            id="rdns-input"
            value={raw}
            onChange={(e) => load(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={300}
            aria-invalid={error !== null}
            aria-describedby={error ? "rdns-error" : "rdns-hint"}
            placeholder="192.0.2.65 or 65.2.0.192.in-addr.arpa"
            data-testid="input-reverse"
            className={`mt-3 ${INPUT}`}
          />
          {error ? (
            <p id="rdns-error" role="alert" data-testid="text-reverse-error" className={`mt-3 ${ERROR_BOX}`}>
              {error}
            </p>
          ) : (
            <p id="rdns-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The direction is detected from what you type. RFC 2317 names such as 65.64/26.2.0.192.in-addr.arpa are
              read too.
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
          className="break-all font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        {view ? (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title={view.isAddress ? "PTR name" : "Zone name"}>
                <CodeBlock text={view.ptr} label="Copy the reverse name" testId="text-ptr-name" />
                <div className="mt-4">
                  <ToolResult
                    label={view.isAddress ? "Address" : "First address"}
                    value={view.addressText}
                    testId="text-address"
                  />
                  {!view.isAddress && input?.kind === "ptr" ? (
                    <ToolResult label="Covers" value={`${view.addressText}/${input.prefix}`} />
                  ) : null}
                  <ToolResult label="Family" value={`IPv${view.family}`} />
                  <ToolResult
                    label="Labels before the suffix"
                    value={String(view.ptr.split(".").length - 2)}
                  />
                </div>
                {view.notes.length ? (
                  <ul className="mt-4 space-y-2" data-testid="list-reverse-notes">
                    {view.notes.map((n) => (
                      <li
                        key={n}
                        className="break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                      >
                        {n}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ToolPanel>

              <ToolPanel title="Look it up">
                <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {view.isAddress
                    ? "dig -x builds the reverse name for you and asks for its PTR record. +trace walks the delegation from the root, which shows who actually runs the zone."
                    : "A zone has no PTR record of its own. Ask who serves it instead."}
                </p>
                <div className="space-y-2" data-testid="list-dig">
                  {view.dig.map((cmd) => (
                    <CodeBlock key={cmd} text={cmd} label={`Copy ${cmd}`} />
                  ))}
                </div>
              </ToolPanel>
            </div>

            <ToolPanel title="Standard delegation points">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-left" data-testid="table-zones">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH}>
                        Block
                      </th>
                      <th scope="col" className={TH}>
                        Reverse zone
                      </th>
                      <th scope="col" className={`${TH} pr-0 text-right`}>
                        Labels
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.zones.map((z) => (
                      <tr
                        key={z.prefix}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                          prefix === z.prefix ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""
                        }`}
                      >
                        <th
                          scope="row"
                          className="whitespace-nowrap py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                        >
                          {formatIp(view.family, networkOf(view.family, view.value, z.prefix))}/{z.prefix}
                        </th>
                        <td className="break-all py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                          {z.zone}
                        </td>
                        <td className="py-2.5 text-right font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                          {z.labels}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {view.family === 4
                  ? "A zone cut can only fall between labels, and each in-addr.arpa label is one octet, so IPv4 reverse zones are delegated at /8, /16 and /24."
                  : "Each ip6.arpa label is one 4-bit nibble, so IPv6 reverse zones can be cut at any multiple of 4. A /48 site is 12 labels deep and a /64 subnet is 16."}
              </p>
            </ToolPanel>

            <ToolPanel title="Delegating a block">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="rdns-prefix" className={LABEL}>
                    Prefix length
                  </label>
                  <input
                    id="rdns-prefix"
                    value={prefixText}
                    onChange={(e) => setPrefixDraft(e.target.value)}
                    inputMode="numeric"
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={3}
                    aria-invalid={prefixError !== null}
                    aria-describedby={prefixError ? "rdns-prefix-error" : undefined}
                    data-testid="input-prefix"
                    className={`mt-2 w-28 ${INPUT}`}
                  />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Common prefix lengths">
                  {QUICK_PREFIXES[view.family === 4 ? 4 : 6].map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={prefix === p}
                      onClick={() => setPrefixDraft(String(p))}
                      data-testid={`button-prefix-${p}`}
                      className={`${PILL} text-xs ${prefix === p ? PILL_ON : PILL_IDLE}`}
                    >
                      /{p}
                    </button>
                  ))}
                </div>
              </div>
              {prefixError ? (
                <p id="rdns-prefix-error" role="alert" className={`mt-3 ${ERROR_BOX}`}>
                  {prefixError}
                </p>
              ) : null}

              {delegation && delegation.kind !== "classless" ? (
                <div className="mt-5" data-testid="text-delegation">
                  <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {delegation.kind === "exact"
                      ? `${delegation.networkText} ends on a label boundary, so it is delegated as one zone.`
                      : `${delegation.networkText} does not end on a ${view.family === 4 ? "octet" : "nibble"} boundary, so it is delegated as ${delegation.zoneCount} separate zones at /${delegation.boundary}.`}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {delegation.zones.map((z) => (
                      <li key={z} className="break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                        {z}
                      </li>
                    ))}
                  </ul>
                  {delegation.zoneCount > delegation.zones.length ? (
                    <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {delegation.zoneCount - delegation.zones.length} more, continuing in the same pattern (the
                      first {delegation.zones.length} are listed).
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <CodeBlock text={`dig NS ${delegation.zones[0]}`} label="Copy the dig NS command" />
                  </div>
                </div>
              ) : null}

              {classless && delegation ? (
                <div className="mt-5 space-y-5" data-testid="text-delegation">
                  <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {delegation.networkText} is smaller than a /24. Its PTR names all live in{" "}
                    <code className="text-[hsl(var(--brand-cyan))]">{classless.parentZone}</code>, and a zone
                    cut cannot split one octet label, so the /24 holder keeps that zone and uses RFC 2317: one CNAME per
                    address pointing into a child zone,{" "}
                    <code className="break-all text-[hsl(var(--brand-cyan))]">{classless.childZone}</code>,
                    which is delegated to the customer with NS records.
                  </p>

                  <ol className="space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <li>
                      1. Query: PTR{" "}
                      <span className="break-all text-[hsl(var(--brand-bone))]">
                        {classlessHost}.{classless.parentZone}
                      </span>
                    </li>
                    <li>2. The /24 zone answers with a CNAME into {classless.childZone}.</li>
                    <li>3. The resolver follows the NS delegation and gets the PTR from the customer's servers.</li>
                  </ol>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <span className={LABEL} id="rdns-style-label">
                        Child label style
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="rdns-style-label">
                        {(["/", "-"] as LabelStyle[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={style === s}
                            onClick={() => setStyle(s)}
                            data-testid={`button-style-${s === "/" ? "slash" : "dash"}`}
                            className={`${PILL} text-xs ${style === s ? PILL_ON : PILL_IDLE}`}
                          >
                            {classless.start}
                            {s}
                            {classless.prefix}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="rdns-ns" className={LABEL}>
                        Customer name servers
                      </label>
                      <input
                        id="rdns-ns"
                        value={nsText}
                        onChange={(e) => setNsText(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="off"
                        maxLength={600}
                        aria-invalid={!nameservers.ok}
                        aria-describedby={!nameservers.ok ? "rdns-ns-error" : undefined}
                        data-testid="input-nameservers"
                        className={`mt-2 ${INPUT}`}
                      />
                    </div>
                  </div>
                  {!nameservers.ok ? (
                    <p id="rdns-ns-error" role="alert" className={ERROR_BOX}>
                      {nameservers.error}
                    </p>
                  ) : null}

                  {zoneFiles ? (
                    <>
                      <div>
                        <h3 className={`${LABEL} mb-2 break-words`}>In the parent zone ({classless.parentZone})</h3>
                        <CodeBlock text={zoneFiles.parent} label="Copy the parent zone records" testId="text-parent-zone" tall />
                      </div>
                      <div>
                        <h3 className={`${LABEL} mb-2 break-words`}>Or, in BIND, the CNAME run in one line</h3>
                        <CodeBlock text={zoneFiles.generate} label="Copy the $GENERATE line" />
                      </div>
                      <div>
                        <h3 className={`${LABEL} mb-2 break-words`}>In the child zone ({classless.childZone})</h3>
                        <CodeBlock text={zoneFiles.child} label="Copy the child zone records" testId="text-child-zone" />
                      </div>
                      <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        RFC 2317 does not fix the child label. Its own examples use the slash form; a dash is common
                        because some provisioning tools reject a slash in a name. Blocks from /{CLASSLESS_MIN} to /32 are
                        handled here.
                      </p>
                    </>
                  ) : null}
                </div>
              ) : null}
            </ToolPanel>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
