/**
 * IPv4 notation converter.
 *
 * The address is one 32-bit integer, and every notation on this page is a
 * view of that integer. The interesting part is the parsing: inet_aton, the
 * URL Standard and strict inet_pton style parsers read the same string
 * differently, and the table shows all of them side by side so a mismatch
 * is visible instead of assumed away. Nothing here resolves a name or makes
 * a request; it is string arithmetic only.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_INPUT_CHARS,
  analyze,
  classify,
  describePart,
  toBinary,
  toDottedDecimal,
  toDottedHex,
  toDottedOctal,
  toHex,
  toInteger,
  toMappedIpv6,
  type ParseOutcome,
  type ParserRow,
  type Part,
} from "@/lib/toolkit/ip-address-converter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; text: string }[] = [
  { label: "192.168.0.1", text: "192.168.0.1" },
  { label: "127.1", text: "127.1" },
  { label: "0x7f.0.0.1", text: "0x7f.0.0.1" },
  { label: "0177.0.0.1", text: "0177.0.0.1" },
  { label: "2130706433", text: "2130706433" },
  { label: "010.0.0.1", text: "010.0.0.1" },
  { label: "Trailing dot", text: "127.0.0.1." },
  { label: "Binary", text: "11000000.10101000.00000000.00000001" },
];

const PARSERS: Record<ParserRow["id"], { name: string; who: string }> = {
  strict: {
    name: "Strict dotted decimal",
    who: "inet_pton, Python ipaddress since 3.9.5, Go net.ParseIP since 1.17",
  },
  inet_aton: {
    name: "inet_aton",
    who: "glibc and BSD libc, and the tools built on them",
  },
  whatwg: {
    name: "URL Standard host",
    who: "Browsers and the URL class in Node",
  },
  naive: {
    name: "Leading zeros as decimal",
    who: "Go before 1.17, and checks that split on dots and parse base 10",
  },
};

type Tone = "ok" | "warn" | "danger";

const TONE_STYLE: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
};

/** Clear and other word buttons, in the site's small-caps label style. */
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

/** Example inputs keep their exact case, since 0x7f and 0X7F are the point. */
const EXAMPLE_CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

/** A value with its own copy button, for a ToolResult row. */
function Copyable({ text, label, testId }: { text: string; label: string; testId?: string }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-2">
      <span data-testid={testId} className="break-all">
        {text}
      </span>
      <CopyButton value={text} label={`Copy the ${label}`} />
    </span>
  );
}

/** "127 × 2^24 + 1" for the parts a parser read. */
function formula(parts: Part[]): string {
  let shift = 32;
  const terms: string[] = [];
  for (const p of parts) {
    shift -= p.bits;
    if (shift === 0) terms.push(p.value.toString());
    else terms.push(`${p.value.toString()} × 2^${shift}`);
  }
  return terms.join(" + ");
}

function outcomeCell(outcome: ParseOutcome): { text: string; tone: Tone } {
  if (outcome.ok) return { text: toDottedDecimal(outcome.value), tone: "ok" };
  if (outcome.kind === "domain") return { text: "domain name", tone: "warn" };
  if (outcome.kind === "unmodeled") return { text: "not modeled", tone: "warn" };
  return { text: "rejected", tone: "danger" };
}

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-[hsl(var(--brand-signal))]",
  warn: "text-[hsl(var(--brand-amber))]",
  danger: "text-[hsl(var(--brand-danger))]",
};

export function IpAddressConverter() {
  const [raw, setRaw] = useState("0x7f.0.0.1");
  const analysis = useMemo(() => analyze(raw), [raw]);
  const ok = analysis.kind === "ok" ? analysis : null;
  const value = ok?.value ?? null;
  const special = value === null ? null : classify(value);

  const source = ok
    ? ok.rows.find((r) => r.id === ok.via)?.outcome ?? null
    : null;
  const sourceParts = source && source.ok ? source.parts : null;

  const distinct = ok
    ? Array.from(new Set(ok.rows.filter((r) => r.outcome.ok).map((r) => (r.outcome as { value: number }).value)))
    : [];

  // For binary input: what the real parsers make of the same string, when
  // they accept it and get a different address.
  const systemReading =
    ok && ok.via === "binary"
      ? ok.rows
          .filter((r) => r.id === "inet_aton" || r.id === "whatwg")
          .map((r) => (r.outcome.ok ? r.outcome.value : null))
          .find((v): v is number => v !== null && v !== value) ?? null
      : null;

  const statusText =
    analysis.kind === "empty"
      ? "Type an address to convert it."
      : analysis.kind === "error"
        ? "Nothing parsed."
        : value === null
          ? "No parser below reads this as an IPv4 address."
          : `${ok?.via === "binary" ? "Read as binary" : "Resolves to"} ${toDottedDecimal(value)}${special ? ` (${special.name})` : ""}.`;

  return (
    <ToolShell slug="ip-address-converter">
      <div className="space-y-6">
        <ToolPanel title="Address">
          <label
            htmlFor="ip-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            An IPv4 address in any notation: dotted decimal, one integer, hex, octal, short forms or
            binary.
          </label>
          <input
            id="ip-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            maxLength={MAX_INPUT_CHARS * 4}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={analysis.kind === "error"}
            aria-describedby={analysis.kind === "error" ? "ip-error" : "ip-hint"}
            placeholder="192.168.0.1, 0xC0A80001, 3232235521, 127.1"
            data-testid="input-address"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {analysis.kind === "error" ? (
            <p
              id="ip-error"
              role="alert"
              data-testid="text-ip-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {analysis.message}
            </p>
          ) : (
            <p id="ip-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Just the host part of a URL. This page does arithmetic on the string; it never looks the
              address up or connects to it.
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
                onClick={() => setRaw(example.text)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={EXAMPLE_CHIP_CLASS}
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
          data-testid="text-ip-status"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {statusText}
        </p>

        {ok ? (
          <>
            {ok.via === "binary" ? (
              <p className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.ok}`}>
                Read as binary because it is four groups of exactly eight 0s and 1s. No system parser reads
                binary, so the table below shows what they make of the same string instead.
                {systemReading !== null
                  ? ` inet_aton and browsers read each group as an octal number, because it starts with 0, and get ${toDottedDecimal(systemReading)}, a different address.`
                  : ""}
              </p>
            ) : null}
            {ok.conflict ? (
              <p
                data-testid="text-conflict"
                className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.danger}`}
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Parsers disagree: </strong>
                this one string reads as {distinct.map((v) => toDottedDecimal(v)).join(" or ")} depending on
                which parser sees it. A check that validates with one parser while the connection is made
                with another is checking a different address.
              </p>
            ) : ok.legacy ? (
              <p
                data-testid="text-legacy"
                className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE.warn}`}
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Legacy form: </strong>
                strict parsers reject this, but inet_aton or a browser accepts it
                {value !== null ? ` as ${toDottedDecimal(value)}` : ""}. A string comparison against{" "}
                {value !== null ? toDottedDecimal(value) : "the dotted form"} will not match it.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Conversions">
                {value === null ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    No parser produced an address, so there is nothing to convert. The table below says why
                    each one refused.
                  </p>
                ) : (
                  <>
                    <ToolResult
                      label="Dotted decimal"
                      value={<Copyable text={toDottedDecimal(value)} label="dotted decimal form" testId="text-dotted-decimal" />}
                    />
                    <ToolResult
                      label="32-bit integer"
                      value={<Copyable text={toInteger(value)} label="integer form" testId="text-integer" />}
                    />
                    <ToolResult
                      label="Hex"
                      value={<Copyable text={toHex(value)} label="hex form" testId="text-hex" />}
                    />
                    <ToolResult
                      label="Dotted hex"
                      value={<Copyable text={toDottedHex(value)} label="dotted hex form" testId="text-dotted-hex" />}
                    />
                    <ToolResult
                      label="Dotted octal"
                      value={<Copyable text={toDottedOctal(value)} label="dotted octal form" testId="text-dotted-octal" />}
                    />
                    <ToolResult
                      label="Binary"
                      value={<Copyable text={toBinary(value)} label="binary form" testId="text-binary" />}
                    />
                    <ToolResult
                      label="IPv4-mapped IPv6"
                      value={<Copyable text={toMappedIpv6(value)} label="IPv4-mapped IPv6 form" testId="text-mapped" />}
                    />
                    <ToolResult
                      label="Range"
                      value={special ? `${special.cidr}, ${special.rfc}` : "Not in a special-purpose block"}
                      testId="text-range"
                    />
                  </>
                )}
              </ToolPanel>

              <ToolPanel title="How it was read">
                {value === null ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    Nothing was read as an address.
                  </p>
                ) : ok.via === "binary" ? (
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    Four groups of eight bits, most significant first: {toBinary(value)} is{" "}
                    {toInteger(value)}.
                  </p>
                ) : sourceParts ? (
                  <>
                    <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      Read by {ok.via === "inet_aton" ? "inet_aton" : "the URL Standard parser"}.{" "}
                      {sourceParts.length === 4
                        ? "Four parts, one byte each."
                        : `${sourceParts.length} ${sourceParts.length === 1 ? "part" : "parts"}, so the last one fills the remaining ${sourceParts[sourceParts.length - 1].bits} bits.`}
                    </p>
                    <ul className="mt-3 space-y-1" data-testid="list-parts">
                      {sourceParts.map((p, i) => (
                        <li
                          key={i}
                          className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]"
                        >
                          {describePart(p)}
                        </li>
                      ))}
                    </ul>
                    <pre className="mt-4 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                      {formula(sourceParts)} = {toInteger(value)}
                    </pre>
                    {source && source.ok && source.note ? (
                      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {source.note}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {special ? (
                  <p
                    data-testid="text-special"
                    className={`mt-4 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${special.internal ? TONE_STYLE.warn : TONE_STYLE.ok}`}
                  >
                    {special.name} ({special.cidr}, {special.rfc}).
                    {special.detail ? ` ${special.detail}` : ""}
                    {special.internal
                      ? " A server that fetches URLs for users should refuse to connect here unless it was built to."
                      : ""}
                  </p>
                ) : null}
              </ToolPanel>
            </div>

            <ToolPanel title="How each parser reads it">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-parsers">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th
                        scope="col"
                        className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        Parser
                      </th>
                      <th
                        scope="col"
                        className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        Result
                      </th>
                      <th
                        scope="col"
                        className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        Why
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ok.rows.map((row) => {
                      const cell = outcomeCell(row.outcome);
                      const detail = row.outcome.ok
                        ? [
                            row.outcome.parts.map((p) => `${p.text} (${p.radix === 16 ? "hex" : p.radix === 8 ? "octal" : "decimal"})`).join(", "),
                            row.outcome.note,
                          ]
                            .filter(Boolean)
                            .join(". ")
                        : row.outcome.reason;
                      return (
                        <tr key={row.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                          <th scope="row" className="py-3 pr-4 font-normal">
                            <span className="block font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                              {PARSERS[row.id].name}
                            </span>
                            <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              {PARSERS[row.id].who}
                            </span>
                          </th>
                          <td
                            className={`whitespace-nowrap py-3 pr-4 font-mono-tight text-sm ${TONE_TEXT[cell.tone]}`}
                            data-testid={`text-parser-${row.id}`}
                          >
                            {cell.text}
                          </td>
                          <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {detail}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The safe pattern is to parse once, with the same parser the connecting code uses, and check
                the resulting integer against ranges. Comparing strings, or validating with a stricter
                parser than the one that connects, leaves room for exactly the disagreements above.
              </p>
            </ToolPanel>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
