/**
 * IPv4 subnet calculator.
 *
 * Every value is derived from two unsigned 32-bit integers: the address and
 * the mask. JavaScript's bitwise operators return a *signed* int32, so any
 * intermediate whose top bit can be set is passed through `>>> 0` before it
 * is compared, printed, or used in further arithmetic.
 */

import { Fragment, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ---------------------------------------------------------------- parsing */

// Leading zeros are rejected on purpose: inet_aton reads "010" as octal 8,
// so an address written that way means different things to different tools.
const OCTET = /^(0|[1-9][0-9]{0,2})$/;

function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = ((value << 8) | n) >>> 0;
  }
  return value >>> 0;
}

function ipToString(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function toBits(value: number): string {
  return (value >>> 0).toString(2).padStart(32, "0");
}

// `0xffffffff << 32` is `0xffffffff << 0` in JS, because the shift count is
// taken modulo 32. /0 therefore has to be special-cased.
function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function maskToPrefix(mask: number): number | null {
  const bits = toBits(mask);
  if (!/^1*0*$/.test(bits)) return null;
  const firstZero = bits.indexOf("0");
  return firstZero === -1 ? 32 : firstZero;
}

/* --------------------------------------------------- special-use registry */

interface RangeSpec {
  cidr: string;
  label: string;
  rfc: string;
}

const SPECIAL_USE: RangeSpec[] = [
  { cidr: "0.0.0.0/8", label: "This network", rfc: "RFC 1122" },
  { cidr: "10.0.0.0/8", label: "Private (RFC 1918)", rfc: "RFC 1918" },
  { cidr: "100.64.0.0/10", label: "Carrier-grade NAT", rfc: "RFC 6598" },
  { cidr: "127.0.0.0/8", label: "Loopback", rfc: "RFC 1122" },
  { cidr: "169.254.0.0/16", label: "Link-local (APIPA)", rfc: "RFC 3927" },
  { cidr: "172.16.0.0/12", label: "Private (RFC 1918)", rfc: "RFC 1918" },
  { cidr: "192.0.0.0/24", label: "IETF protocol assignments", rfc: "RFC 6890" },
  { cidr: "192.0.2.0/24", label: "Documentation (TEST-NET-1)", rfc: "RFC 5737" },
  { cidr: "192.88.99.0/24", label: "6to4 relay anycast (deprecated)", rfc: "RFC 7526" },
  { cidr: "192.168.0.0/16", label: "Private (RFC 1918)", rfc: "RFC 1918" },
  { cidr: "198.18.0.0/15", label: "Benchmarking", rfc: "RFC 2544" },
  { cidr: "198.51.100.0/24", label: "Documentation (TEST-NET-2)", rfc: "RFC 5737" },
  { cidr: "203.0.113.0/24", label: "Documentation (TEST-NET-3)", rfc: "RFC 5737" },
  { cidr: "224.0.0.0/4", label: "Multicast", rfc: "RFC 5771" },
  { cidr: "255.255.255.255/32", label: "Limited broadcast", rfc: "RFC 919" },
  { cidr: "240.0.0.0/4", label: "Reserved (former class E)", rfc: "RFC 1112" },
];

// Longest prefix first, so 192.0.2.0/24 wins over any shorter block it sits in.
const RANGES = SPECIAL_USE.map((spec) => {
  const [addr, len] = spec.cidr.split("/");
  const prefix = Number(len);
  const base = parseIpv4(addr) ?? 0;
  return { ...spec, prefix, base: (base & prefixToMask(prefix)) >>> 0 };
}).sort((a, b) => b.prefix - a.prefix);

function classifyRange(ip: number): { label: string; rfc: string; cidr: string } | null {
  for (const range of RANGES) {
    if (((ip & prefixToMask(range.prefix)) >>> 0) === range.base) {
      return { label: range.label, rfc: range.rfc, cidr: range.cidr };
    }
  }
  return null;
}

function classfulClass(ip: number): { letter: string; detail: string } {
  const first = (ip >>> 24) & 255;
  if (first <= 127) return { letter: "A", detail: "default mask /8" };
  if (first <= 191) return { letter: "B", detail: "default mask /16" };
  if (first <= 223) return { letter: "C", detail: "default mask /24" };
  if (first <= 239) return { letter: "D", detail: "multicast, no host mask" };
  return { letter: "E", detail: "reserved, not routable" };
}

/* ---------------------------------------------------------------- parsing */

type ParseOutcome =
  | { kind: "empty" }
  | { kind: "hint"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; ip: number; prefix: number };

function parseInput(raw: string): ParseOutcome {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  // Accepts "a.b.c.d/24", "a.b.c.d/255.255.255.0", and "a.b.c.d 255.255.255.0".
  const normalised = text.replace(/\s+/g, " ");
  let addrPart = normalised;
  let maskPart = "";

  const slash = normalised.indexOf("/");
  if (slash !== -1) {
    addrPart = normalised.slice(0, slash).trim();
    maskPart = normalised.slice(slash + 1).trim();
  } else {
    const spaced = normalised.split(" ");
    if (spaced.length === 2) {
      addrPart = spaced[0];
      maskPart = spaced[1];
    } else if (spaced.length > 2) {
      return { kind: "error", message: "Too many parts. Expected an address and one mask." };
    }
  }

  const ip = parseIpv4(addrPart);
  if (ip === null) {
    if (/^[0-9.]*$/.test(addrPart) && addrPart.split(".").length < 4) {
      return { kind: "hint", message: "Keep going: an IPv4 address needs four octets." };
    }
    return {
      kind: "error",
      message:
        "That is not a valid IPv4 address. Four octets, 0 to 255, no leading zeros (008 would be read as octal by some tools).",
    };
  }

  if (!maskPart) {
    return { kind: "hint", message: "Add a prefix, for example /26, or a dotted mask." };
  }

  if (maskPart.includes(".")) {
    const maskValue = parseIpv4(maskPart);
    if (maskValue === null) return { kind: "error", message: "The dotted mask is not a valid IPv4 value." };
    const prefix = maskToPrefix(maskValue);
    if (prefix === null) {
      return {
        kind: "error",
        message: `${ipToString(maskValue)} is not a contiguous mask. A netmask has to be a run of 1 bits followed by a run of 0 bits.`,
      };
    }
    return { kind: "ok", ip, prefix };
  }

  if (!/^\d{1,2}$/.test(maskPart)) {
    return { kind: "error", message: "The prefix length must be a whole number from 0 to 32." };
  }
  const prefix = Number(maskPart);
  if (prefix > 32) return { kind: "error", message: "The prefix length must be from 0 to 32." };
  return { kind: "ok", ip, prefix };
}

/* ------------------------------------------------------------ calculation */

interface Subnet {
  ip: number;
  prefix: number;
  mask: number;
  wildcard: number;
  network: number;
  broadcast: number | null;
  first: number;
  last: number;
  total: number;
  usable: number;
  note: string;
}

function calculate(ip: number, prefix: number): Subnet {
  const mask = prefixToMask(prefix);
  const wildcard = (~mask) >>> 0;
  const network = (ip & mask) >>> 0;
  const total = Math.pow(2, 32 - prefix);

  if (prefix === 32) {
    return {
      ip,
      prefix,
      mask,
      wildcard,
      network,
      broadcast: null,
      first: network,
      last: network,
      total: 1,
      usable: 1,
      note: "A /32 is a single address: a host route, a loopback, or one entry in an ACL. There is no network or broadcast address to give up.",
    };
  }

  if (prefix === 31) {
    // RFC 3021: on a point-to-point link both addresses are usable and there
    // is no broadcast address, because a link with two ends does not need one.
    return {
      ip,
      prefix,
      mask,
      wildcard,
      network,
      broadcast: null,
      first: network,
      last: (network + 1) >>> 0,
      total: 2,
      usable: 2,
      note: "RFC 3021: on a /31 point-to-point link both addresses are usable and there is no broadcast address. Older equipment may refuse to accept a /31 on an interface.",
    };
  }

  const broadcast = (network | wildcard) >>> 0;
  return {
    ip,
    prefix,
    mask,
    wildcard,
    network,
    broadcast,
    first: (network + 1) >>> 0,
    last: (broadcast - 1) >>> 0,
    total,
    usable: total - 2,
    note: "",
  };
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/* ------------------------------------------------------------------ view */

function BitRow({ label, value, prefix }: { label: string; value: number; prefix: number }) {
  const bits = toBits(value);
  return (
    <div>
      <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
        {label}
      </div>
      <div className="mt-1.5 overflow-x-auto pb-1">
        <div className="flex w-max items-center font-mono-tight text-[11px] leading-none" aria-hidden="true">
          {Array.from({ length: 32 }, (_, i) => (
            <Fragment key={i}>
              {i === prefix ? (
                <span className="mx-[3px] inline-block h-4 w-[2px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]" />
              ) : null}
              <span
                className={
                  i < prefix
                    ? "px-[0.5px] text-[hsl(var(--brand-signal))]"
                    : "px-[0.5px] text-[hsl(var(--brand-ash))]"
                }
              >
                {bits[i]}
              </span>
              {(i + 1) % 8 === 0 && i !== 31 && i + 1 !== prefix ? (
                <span className="px-[3px] text-[hsl(var(--brand-iron))]">.</span>
              ) : null}
            </Fragment>
          ))}
          {prefix === 32 ? (
            <span className="ml-[3px] inline-block h-4 w-[2px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]" />
          ) : null}
        </div>
      </div>
      <p className="sr-only">
        {label} in binary: {bits.slice(0, prefix) || "(none)"} network bits, then{" "}
        {bits.slice(prefix) || "(none)"} host bits.
      </p>
    </div>
  );
}

export function SubnetCalculator() {
  const [raw, setRaw] = useState("192.168.10.55/26");
  const outcome = useMemo(() => parseInput(raw), [raw]);
  const result = outcome.kind === "ok" ? calculate(outcome.ip, outcome.prefix) : null;

  const range = result ? classifyRange(result.ip) : null;
  const klass = result ? classfulClass(result.ip) : null;

  const summary = result
    ? [
        `Address        ${ipToString(result.ip)}/${result.prefix}`,
        `Network        ${ipToString(result.network)}/${result.prefix}`,
        `Netmask        ${ipToString(result.mask)}`,
        `Wildcard       ${ipToString(result.wildcard)}`,
        `Broadcast      ${result.broadcast === null ? "none" : ipToString(result.broadcast)}`,
        `First host     ${ipToString(result.first)}`,
        `Last host      ${ipToString(result.last)}`,
        `Total          ${formatCount(result.total)}`,
        `Usable hosts   ${formatCount(result.usable)}`,
      ].join("\n")
    : "";

  const errorId = "subnet-input-message";

  return (
    <ToolShell
      slug="subnet-calculator"
    >
      <div className="space-y-6">
        <ToolPanel title="Address">
          <label
            htmlFor="subnet-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            IPv4 address with a prefix length or a dotted mask
          </label>
          <input
            id="subnet-input"
            type="text"
            value={raw}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setRaw(event.target.value)}
            aria-invalid={outcome.kind === "error"}
            aria-describedby={outcome.kind === "error" || outcome.kind === "hint" ? errorId : undefined}
            placeholder="192.168.10.55/26"
            data-testid="input-subnet"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          {outcome.kind === "error" ? (
            <p
              id={errorId}
              role="alert"
              data-testid="text-subnet-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span>{outcome.message}</span>
            </p>
          ) : null}
          {outcome.kind === "hint" ? (
            <p id={errorId} className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              {outcome.message}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {["192.168.10.55/26", "10.0.0.0/8", "172.16.5.9 255.255.240.0", "10.1.1.1/31", "8.8.8.8/32"].map(
              (example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setRaw(example)}
                  className="inline-flex min-h-[28px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[10px] tracking-[0.12em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {example}
                </button>
              ),
            )}
          </div>
        </ToolPanel>

        {result ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <ToolPanel title="Range">
                <ToolResult
                  label="Network"
                  value={`${ipToString(result.network)}/${result.prefix}`}
                  testId="text-network"
                />
                <ToolResult
                  label="Broadcast"
                  value={result.broadcast === null ? "none" : ipToString(result.broadcast)}
                  testId="text-broadcast"
                />
                <ToolResult label="First usable" value={ipToString(result.first)} testId="text-first" />
                <ToolResult label="Last usable" value={ipToString(result.last)} testId="text-last" />
                <ToolResult label="Total addresses" value={formatCount(result.total)} />
                <ToolResult label="Usable hosts" value={formatCount(result.usable)} testId="text-usable" />
              </ToolPanel>

              <ToolPanel title="Mask">
                <ToolResult label="Prefix length" value={`/${result.prefix}`} />
                <ToolResult label="Subnet mask" value={ipToString(result.mask)} testId="text-mask" />
                <ToolResult label="Wildcard mask" value={ipToString(result.wildcard)} testId="text-wildcard" />
                <ToolResult label="Host bits" value={`${32 - result.prefix}`} />
                <ToolResult
                  label="Class"
                  value={klass ? `${klass.letter} · ${klass.detail}` : "-"}
                />
                <ToolResult
                  label="Scope"
                  value={range ? `${range.label} · ${range.cidr}` : "Public / globally routable"}
                  testId="text-scope"
                />
              </ToolPanel>
            </div>

            {result.note ? (
              <div className="rounded-2xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.06)] p-5">
                <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                  Edge case
                </div>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {result.note}
                </p>
              </div>
            ) : null}

            <ToolPanel title="Bits">
              <div className="space-y-5">
                <BitRow label="Address" value={result.ip} prefix={result.prefix} />
                <BitRow label="Netmask" value={result.mask} prefix={result.prefix} />
                <BitRow label="Network address" value={result.network} prefix={result.prefix} />
              </div>
              <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-signal))]">Lit bits</span> to the left of the
                marker are the network portion ({result.prefix}{" "}
                {result.prefix === 1 ? "bit" : "bits"}). Dim bits to the right are the host portion (
                {32 - result.prefix} {32 - result.prefix === 1 ? "bit" : "bits"}).
              </p>
            </ToolPanel>

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={summary} testId="button-copy-summary">
                <span>Copy summary</span>
              </CopyButton>
              {range ? (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {ipToString(result.ip)} sits inside {range.cidr}, reserved as {range.label.toLowerCase()} by{" "}
                  {range.rfc}.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
