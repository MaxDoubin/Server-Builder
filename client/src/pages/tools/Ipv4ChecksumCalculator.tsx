/**
 * Internet checksum calculator.
 *
 * Three modes over one piece of arithmetic (RFC 1071): an IPv4 header with
 * its checksum field zeroed, a TCP or UDP segment behind the IPv4
 * pseudo-header, and arbitrary bytes. Every mode shows the same working:
 * the 16-bit words, the running sum, each end-around carry fold, and the
 * final complement, because the point is to see why the number comes out
 * the way it does. All of the math lives in lib/toolkit so it can be
 * tested on its own; this file only renders it.
 */

import { useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  MAX_BYTES,
  MAX_LISTED_WORDS,
  analyzeGeneric,
  analyzeIpv4Header,
  analyzeTransport,
  hex16,
  parseHex,
  protocolName,
  toHexWords,
  transportFromPacket,
  type AnnotatedWord,
  type SumDetail,
  type TransportProtocol,
  type WordRole,
} from "@/lib/toolkit/ipv4-checksum-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

type Mode = "header" | "transport" | "generic";

const MODES: { id: Mode; label: string }[] = [
  { id: "header", label: "IPv4 header" },
  { id: "transport", label: "TCP / UDP" },
  { id: "generic", label: "Any bytes" },
];

const HEADER_EXAMPLES: { label: string; hex: string }[] = [
  { label: "Valid header", hex: "4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7" },
  { label: "Wrong checksum", hex: "4500 0073 0000 4000 4011 b862 c0a8 0001 c0a8 00c7" },
  { label: "With options", hex: "46c0 0020 0000 4000 0102 4200 c000 0201 e000 0016 9404 0000" },
  {
    label: "Whole UDP packet",
    hex: "4500 001e 0000 4000 4011 b77b c0a8 0101 c0a8 0102 1234 0035 000a 01b4 6869",
  },
];

const TRANSPORT_EXAMPLES: {
  label: string;
  source: string;
  destination: string;
  protocol: TransportProtocol;
  hex: string;
}[] = [
  {
    label: "TCP SYN",
    source: "10.0.0.1",
    destination: "10.0.0.2",
    protocol: 6,
    hex: "c350 0050 0000 0001 0000 0000 6002 ffff c082 0000 0204 05b4",
  },
  {
    label: "UDP with payload",
    source: "192.168.1.1",
    destination: "192.168.1.2",
    protocol: 17,
    hex: "1234 0035 000a 01b4 6869",
  },
  {
    label: "UDP, no checksum",
    source: "192.168.1.1",
    destination: "192.168.1.2",
    protocol: 17,
    hex: "1234 0035 000a 0000 6869",
  },
];

const GENERIC_EXAMPLES: { label: string; hex: string }[] = [
  { label: "RFC 1071 example", hex: "00 01 f2 03 f4 f5 f6 f7" },
  { label: "Odd length", hex: "ab cd ef" },
  { label: "ICMP echo request", hex: "0800 f7fe 0000 0001" },
];

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TEXTAREA =
  "mt-2 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const WARN_BOX =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const PRE =
  "min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]";

function h(value: number): string {
  return `0x${hex16(value)}`;
}

function wide(value: number): string {
  return `0x${value.toString(16)}`;
}

function bin16(value: number): string {
  return (value & 0xffff)
    .toString(2)
    .padStart(16, "0")
    .replace(/(.{4})(?=.)/g, "$1 ");
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/* ------------------------------------------------------------ pieces */

function Examples({ items, onPick }: { items: { label: string }[]; onPick: (index: number) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
        Try
      </span>
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onPick(index)}
          data-testid={`button-example-${slugify(item.label)}`}
          className={CHIP}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Status({ valid, children, testId }: { valid: boolean; children: React.ReactNode; testId: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${
        valid
          ? "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]"
      }`}
    >
      {children}
    </p>
  );
}

const ROLE_STYLE: Record<WordRole, string> = {
  pseudo: "text-[hsl(var(--brand-cyan))]",
  header: "text-[hsl(var(--brand-bone))]",
  checksum: "text-[hsl(var(--brand-amber))]",
  data: "text-[hsl(var(--brand-bone-dim))]",
  pad: "text-[hsl(var(--brand-ash))]",
};

function WordTable({ words }: { words: AnnotatedWord[] }) {
  const listed = words.slice(0, MAX_LISTED_WORDS);
  const hidden = words.length - listed.length;
  const th =
    "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
  return (
    <ToolPanel title={`16-bit words · ${words.length} ${pluralise(words.length, "word")}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-words">
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={th}>
                #
              </th>
              <th scope="col" className={th}>
                Offset
              </th>
              <th scope="col" className={th}>
                Word
              </th>
              <th scope="col" className={th}>
                Field
              </th>
              <th scope="col" className={`${th} text-right`}>
                Running sum
              </th>
            </tr>
          </thead>
          <tbody>
            {listed.map((word, i) => (
              <tr key={word.offset} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{i}</td>
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{word.offset}</td>
                <th scope="row" className={`py-2 pr-4 font-mono-tight text-sm font-normal ${ROLE_STYLE[word.role]}`}>
                  {hex16(word.value)}
                  {word.original !== undefined ? (
                    <span className="block text-[0.625rem] uppercase tracking-[0.14em] text-[hsl(var(--brand-ash))]">
                      was {hex16(word.original)}
                    </span>
                  ) : null}
                </th>
                <td className="py-2 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {word.label}
                </td>
                <td className="py-2 text-right font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                  {wide(word.running)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          The first {MAX_LISTED_WORDS} words are listed. The other {hidden.toLocaleString("en-US")} were summed
          the same way and are included in every total.
        </p>
      ) : null}
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        The running sum keeps every carry and folds once at the end, which RFC 1071 allows because
        ones' complement addition is associative.{" "}
        <span className="text-[hsl(var(--brand-cyan))]">Cyan</span> words are the pseudo-header and{" "}
        <span className="text-[hsl(var(--brand-amber))]">amber</span> is the checksum field, summed as zero.
      </p>
    </ToolPanel>
  );
}

function FoldPanel({ detail, verifyLabel, verifySum }: { detail: SumDetail; verifyLabel?: string; verifySum?: number }) {
  const lines = [
    `sum of ${detail.words.length} ${pluralise(detail.words.length, "word")}   ${wide(detail.total)}`,
    ...detail.folds.map(
      (step) => `fold ${wide(step.before)}   ${h(step.low)} + ${wide(step.carry)} = ${wide(step.after)}`,
    ),
    detail.folds.length === 0 ? "no carry above bit 15, nothing to fold" : null,
    "",
    `ones' complement sum   ${h(detail.folded)}   ${bin16(detail.folded)}`,
    `invert every bit       ${h(detail.checksum)}   ${bin16(detail.checksum)}`,
  ].filter((line): line is string => line !== null);

  return (
    <ToolPanel title="Fold and complement">
      <pre
        className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
        data-testid="text-fold-steps"
      >
        {lines.join("\n")}
      </pre>
      {verifyLabel && verifySum !== undefined ? (
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {verifyLabel} sums to <span className="text-[hsl(var(--brand-bone))]">{h(verifySum)}</span>.{" "}
          {verifySum === 0xffff
            ? "All ones is negative zero in ones' complement, which is what a correct checksum produces."
            : "A correct checksum would make that sum 0xffff, all ones."}
        </p>
      ) : null}
    </ToolPanel>
  );
}

function CopyRow({ value, label, testId }: { value: string; label: string; testId: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <pre className={PRE} data-testid={testId}>
        {value}
      </pre>
      <CopyButton value={value} label={label} testId={`button-copy-${testId}`} />
    </div>
  );
}

/* ------------------------------------------------------------- page */

export function Ipv4ChecksumCalculator() {
  const [mode, setMode] = useState<Mode>("header");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [headerText, setHeaderText] = useState(HEADER_EXAMPLES[0].hex);
  const [segmentText, setSegmentText] = useState(TRANSPORT_EXAMPLES[1].hex);
  const [source, setSource] = useState(TRANSPORT_EXAMPLES[1].source);
  const [destination, setDestination] = useState(TRANSPORT_EXAMPLES[1].destination);
  const [protocol, setProtocol] = useState<TransportProtocol>(TRANSPORT_EXAMPLES[1].protocol);
  const [lengthText, setLengthText] = useState("");
  const [genericText, setGenericText] = useState(GENERIC_EXAMPLES[0].hex);

  const header = useMemo(() => {
    const parsed = parseHex(headerText);
    if (!parsed.ok) return parsed;
    return analyzeIpv4Header(parsed.bytes);
  }, [headerText]);

  const packetSegment = useMemo(() => (header.ok ? transportFromPacket(header) : null), [header]);

  const lengthOverride = useMemo((): { ok: true; value: number | null } | { ok: false; error: string } => {
    const text = lengthText.trim();
    if (text === "") return { ok: true, value: null };
    if (!/^\d{1,5}$/.test(text) || Number(text) > 0xffff) {
      return { ok: false, error: "The length is a whole number of bytes from 0 to 65535, or blank to use the segment length." };
    }
    return { ok: true, value: Number(text) };
  }, [lengthText]);

  const transport = useMemo(() => {
    if (!lengthOverride.ok) return lengthOverride;
    const parsed = parseHex(segmentText);
    if (!parsed.ok) return parsed;
    return analyzeTransport({
      source,
      destination,
      protocol,
      segment: parsed.bytes,
      lengthOverride: lengthOverride.value,
    });
  }, [segmentText, source, destination, protocol, lengthOverride]);

  const generic = useMemo(() => {
    const parsed = parseHex(genericText);
    if (!parsed.ok) return parsed;
    return { ok: true as const, bytes: parsed.bytes, ...analyzeGeneric(parsed.bytes) };
  }, [genericText]);

  function switchMode(next: Mode) {
    setMode(next);
  }

  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = MODES.findIndex((m) => m.id === mode);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + MODES.length) % MODES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODES.length - 1;
    else return;
    event.preventDefault();
    switchMode(MODES[next].id);
    tabRefs.current[next]?.focus();
  }

  function openTransportFromPacket() {
    if (!packetSegment) return;
    setSource(packetSegment.source);
    setDestination(packetSegment.destination);
    setProtocol(packetSegment.protocol);
    setSegmentText(toHexWords(packetSegment.segment));
    setLengthText("");
    switchMode("transport");
  }

  return (
    <ToolShell slug="ipv4-checksum-calculator">
      <div className="space-y-6">
        <div role="tablist" aria-label="Checksum mode" onKeyDown={onTabKeyDown} className="flex flex-wrap gap-2">
          {MODES.map((m, index) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                id={`tab-${m.id}`}
                aria-selected={active}
                aria-controls={`panel-${m.id}`}
                tabIndex={active ? 0 : -1}
                data-testid={`tab-${m.id}`}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                onClick={() => switchMode(m.id)}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-6 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  active
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`} className="space-y-6">
          {mode === "header" ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ToolPanel title="IPv4 header">
                  <label htmlFor="checksum-header" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                    Paste the header in hex, from the first byte (usually 45). A whole packet works too.
                  </label>
                  <textarea
                    id="checksum-header"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={!header.ok}
                    aria-describedby={header.ok ? "checksum-header-hint" : "checksum-header-error"}
                    placeholder="4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7"
                    data-testid="input-header-hex"
                    className={TEXTAREA}
                  />
                  {header.ok ? (
                    <p id="checksum-header-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Spaces, colons, 0x prefixes and tcpdump -x offsets are ignored. Up to{" "}
                      {MAX_BYTES.toLocaleString("en-US")} bytes.
                    </p>
                  ) : (
                    <p id="checksum-header-error" role="alert" data-testid="text-header-error" className={ERROR_BOX}>
                      {header.error}
                    </p>
                  )}
                  <Examples items={HEADER_EXAMPLES} onPick={(i) => setHeaderText(HEADER_EXAMPLES[i].hex)} />
                </ToolPanel>

                {header.ok ? (
                  <ToolPanel title="Result">
                    <Status valid={header.valid} testId="text-header-status">
                      {header.valid
                        ? `Valid. The checksum field holds ${h(header.existing)}, which is what the header sums to.`
                        : `Does not match. The field holds ${h(header.existing)} but the header needs ${h(header.computed)}.`}
                    </Status>
                    <div className="mt-4">
                      <ToolResult label="Computed checksum" value={h(header.computed)} testId="text-checksum" />
                      <ToolResult label="In the header" value={h(header.existing)} />
                      <ToolResult label="Header length" value={`${header.headerLength} bytes (IHL ${header.ihl})`} />
                      <ToolResult label="Total length" value={`${header.totalLength} bytes`} />
                      <ToolResult label="Identification" value={h(header.identification)} />
                      <ToolResult
                        label="Flags, offset"
                        value={`${[header.dontFragment ? "DF" : null, header.moreFragments ? "MF" : null, header.reservedFlag ? "reserved" : null]
                          .filter(Boolean)
                          .join(" + ") || "none"}, offset ${header.fragmentOffset}`}
                      />
                      <ToolResult label="TTL" value={header.ttl} />
                      <ToolResult label="Protocol" value={`${header.protocol} (${protocolName(header.protocol)})`} />
                      <ToolResult label="Source" value={header.source} />
                      <ToolResult label="Destination" value={header.destination} />
                      <ToolResult
                        label="After TTL - 1"
                        value={header.afterTtlDecrement === null ? "TTL is already 0, nothing to decrement" : h(header.afterTtlDecrement)}
                      />
                    </div>
                    <h3 className={`mt-5 ${LABEL}`}>Header with the computed checksum</h3>
                    <CopyRow value={toHexWords(header.corrected)} label="Copy corrected header" testId="text-corrected-header" />
                    {header.warnings.length ? (
                      <ul className="mt-4 space-y-2">
                        {header.warnings.map((warning) => (
                          <li key={warning} className={WARN_BOX}>
                            {warning}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {packetSegment ? (
                      <button
                        type="button"
                        onClick={openTransportFromPacket}
                        data-testid="button-check-transport"
                        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                      >
                        Check the {packetSegment.protocol === 6 ? "TCP" : "UDP"} checksum too
                      </button>
                    ) : null}
                  </ToolPanel>
                ) : null}
              </div>
              {header.ok ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <WordTable words={header.words} />
                  <FoldPanel
                    detail={header.detail}
                    verifyLabel="The header as received, checksum included,"
                    verifySum={header.verifySum}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {mode === "transport" ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ToolPanel title="Pseudo-header and segment">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="checksum-source" className={LABEL}>
                        Source IPv4
                      </label>
                      <input
                        id="checksum-source"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        inputMode="decimal"
                        data-testid="input-source"
                        placeholder="192.0.2.10"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label htmlFor="checksum-destination" className={LABEL}>
                        Destination IPv4
                      </label>
                      <input
                        id="checksum-destination"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        inputMode="decimal"
                        data-testid="input-destination"
                        placeholder="198.51.100.20"
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <fieldset>
                      <legend className={LABEL}>Protocol</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {([6, 17] as TransportProtocol[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setProtocol(p)}
                            aria-pressed={protocol === p}
                            data-testid={`button-protocol-${p}`}
                            className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                              protocol === p
                                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                            }`}
                          >
                            {p === 6 ? "TCP · 6" : "UDP · 17"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor="checksum-length" className={LABEL}>
                        Length override
                      </label>
                      <input
                        id="checksum-length"
                        value={lengthText}
                        onChange={(e) => setLengthText(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        inputMode="numeric"
                        aria-invalid={!lengthOverride.ok}
                        aria-describedby="checksum-length-hint"
                        data-testid="input-length"
                        placeholder="blank: segment length"
                        className={INPUT}
                      />
                      <p id="checksum-length-hint" className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        Bytes. Leave blank unless you need a partial sum.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="checksum-segment" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                      {protocol === 6 ? "TCP" : "UDP"} header and payload in hex, starting at the source port
                    </label>
                    <textarea
                      id="checksum-segment"
                      value={segmentText}
                      onChange={(e) => setSegmentText(e.target.value)}
                      rows={5}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      aria-invalid={!transport.ok}
                      aria-describedby={transport.ok ? undefined : "checksum-transport-error"}
                      placeholder={protocol === 6 ? "c350 0050 0000 0001 ..." : "1234 0035 000a 0000 6869"}
                      data-testid="input-segment-hex"
                      className={TEXTAREA}
                    />
                  </div>
                  {!transport.ok ? (
                    <p id="checksum-transport-error" role="alert" data-testid="text-transport-error" className={ERROR_BOX}>
                      {transport.error}
                    </p>
                  ) : null}
                  <Examples
                    items={TRANSPORT_EXAMPLES}
                    onPick={(i) => {
                      const ex = TRANSPORT_EXAMPLES[i];
                      setSource(ex.source);
                      setDestination(ex.destination);
                      setProtocol(ex.protocol);
                      setSegmentText(ex.hex);
                      setLengthText("");
                    }}
                  />
                </ToolPanel>

                {transport.ok ? (
                  <ToolPanel title="Result">
                    {transport.udpNoChecksum ? (
                      <p
                        role="status"
                        aria-live="polite"
                        data-testid="text-transport-status"
                        className={WARN_BOX}
                      >
                        The checksum field is 0x0000. Over IPv4 that means the sender computed no UDP checksum, so
                        the receiver skips the check. The value it would have sent is {h(transport.transmitted)}.
                      </p>
                    ) : (
                      <Status valid={transport.valid} testId="text-transport-status">
                        {transport.valid
                          ? `Valid. The checksum field holds ${h(transport.existing)}, which is what the pseudo-header and segment sum to.`
                          : `Does not match. The field holds ${h(transport.existing)} but the segment needs ${h(transport.transmitted)}.`}
                      </Status>
                    )}
                    <div className="mt-4">
                      <ToolResult label="Computed checksum" value={h(transport.computed)} testId="text-checksum" />
                      {transport.transmitted !== transport.computed ? (
                        <ToolResult label="Sent on the wire" value={`${h(transport.transmitted)} (RFC 768: zero goes out as all ones)`} />
                      ) : null}
                      <ToolResult label="In the segment" value={h(transport.existing)} />
                      <ToolResult label="Checksum offset" value={`byte ${transport.checksumOffset} of the segment`} />
                      <ToolResult label="Pseudo-header length" value={`${transport.length} bytes`} />
                      <ToolResult label="Pseudo-header sum" value={h(transport.pseudoSum)} />
                    </div>
                    <h3 className={`mt-5 ${LABEL}`}>Pseudo-header (summed, never sent)</h3>
                    <CopyRow value={toHexWords(transport.pseudoHeader)} label="Copy pseudo-header" testId="text-pseudo-header" />
                    <h3 className={`mt-5 ${LABEL}`}>Segment with the computed checksum</h3>
                    <CopyRow value={toHexWords(transport.corrected)} label="Copy corrected segment" testId="text-corrected-segment" />
                    {transport.warnings.length ? (
                      <ul className="mt-4 space-y-2">
                        {transport.warnings.map((warning) => (
                          <li key={warning} className={WARN_BOX}>
                            {warning}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </ToolPanel>
                ) : null}
              </div>
              {transport.ok ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <WordTable words={transport.words} />
                  <FoldPanel
                    detail={transport.detail}
                    verifyLabel="The pseudo-header and segment as received, checksum included,"
                    verifySum={transport.verifySum}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {mode === "generic" ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ToolPanel title="Bytes">
                  <label htmlFor="checksum-generic" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                    Any bytes in hex. An odd count is padded with one zero byte on the right.
                  </label>
                  <textarea
                    id="checksum-generic"
                    value={genericText}
                    onChange={(e) => setGenericText(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-invalid={!generic.ok}
                    aria-describedby={generic.ok ? "checksum-generic-hint" : "checksum-generic-error"}
                    placeholder="00 01 f2 03 f4 f5 f6 f7"
                    data-testid="input-bytes-hex"
                    className={TEXTAREA}
                  />
                  {generic.ok ? (
                    <p id="checksum-generic-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Use this for ICMPv4, IGMP, or anything else that uses the Internet checksum with no pseudo-header.
                      Zero the checksum field first if the bytes contain one. Up to {MAX_BYTES.toLocaleString("en-US")} bytes.
                    </p>
                  ) : (
                    <p id="checksum-generic-error" role="alert" data-testid="text-generic-error" className={ERROR_BOX}>
                      {generic.error}
                    </p>
                  )}
                  <Examples items={GENERIC_EXAMPLES} onPick={(i) => setGenericText(GENERIC_EXAMPLES[i].hex)} />
                </ToolPanel>

                {generic.ok ? (
                  <ToolPanel title="Result">
                    <ToolResult label="Checksum" value={h(generic.detail.checksum)} testId="text-checksum" />
                    <ToolResult label="Ones' complement sum" value={h(generic.detail.folded)} />
                    <ToolResult label="Bytes" value={`${generic.bytes.length}${generic.detail.padded ? ", padded to even" : ""}`} />
                    <ToolResult label="Words" value={generic.detail.words.length} />
                    <ToolResult
                      label="Already verifies"
                      value={generic.selfVerifies ? "yes, sums to 0xffff" : "no"}
                      testId="text-self-verifies"
                    />
                    <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      If these bytes already contain a correct checksum, their sum is 0xffff and the computed value is
                      0x0000. That is how a receiver checks: it sums everything, checksum included, and looks for all ones.
                    </p>
                  </ToolPanel>
                ) : null}
              </div>
              {generic.ok ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <WordTable words={generic.words} />
                  <FoldPanel detail={generic.detail} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </ToolShell>
  );
}
