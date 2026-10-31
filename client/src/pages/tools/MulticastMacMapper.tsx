/**
 * Multicast MAC mapper.
 *
 * One input that accepts an IPv4 group, an IPv6 group or a MAC address and
 * works out which it is. Forward, it shows the destination MAC a switch
 * will see (RFC 1112 for IPv4, RFC 2464 for IPv6) and, for IPv4, the 32
 * groups that land on that same MAC. Backward, it lists the groups a MAC
 * could have come from. All of the arithmetic lives in
 * lib/toolkit/multicast-mac-mapper so it can be tested against the RFCs.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_INPUT_LENGTH,
  bigIntToGroups,
  formatMac,
  macToCandidates,
  mapInput,
  toBits,
  type MacBytes,
  type MapResult,
  type V4Collision,
  type V6Candidate,
} from "@/lib/toolkit/multicast-mac-mapper";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* --------------------------------------------------------------- examples */

const EXAMPLES: { label: string; value: string }[] = [
  { label: "OSPF", value: "224.0.0.5" },
  { label: "mDNS", value: "224.0.0.251" },
  { label: "SSDP", value: "239.255.255.250" },
  { label: "Flooded", value: "239.128.0.5" },
  { label: "ff02::1", value: "ff02::1" },
  { label: "Solicited-node", value: "ff02::1:ff28:9c5a" },
  { label: "IPv4 MAC", value: "01:00:5e:7f:ff:fa" },
  { label: "IPv6 MAC", value: "33:33:00:00:00:fb" },
  { label: "STP", value: "01:80:c2:00:00:00" },
];

const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

/* ------------------------------------------------------------------ parts */

function MacFormats({ mac, testId }: { mac: MacBytes; testId?: string }) {
  const colon = formatMac(mac);
  return (
    <>
      <ToolResult
        label="MAC"
        testId={testId}
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-[hsl(var(--brand-signal))]">{colon}</span>
            <CopyButton value={colon} label={`Copy ${colon}`} />
          </span>
        }
      />
      <ToolResult label="Windows style" value={formatMac(mac, "hyphen")} />
      <ToolResult label="Cisco style" value={formatMac(mac, "cisco")} />
    </>
  );
}

/** One bit, colored by the role it plays in the mapping. */
type Role = "fixed" | "lost" | "copied";

const ROLE_CLASS: Record<Role, string> = {
  fixed: "text-[hsl(var(--brand-ash))]",
  lost: "text-[hsl(var(--brand-amber))] underline decoration-dotted underline-offset-4",
  copied: "text-[hsl(var(--brand-signal))]",
};

/** Bits grouped in octets, each bit colored by role. */
function BitRow({ bits, roleAt, pad }: { bits: string; roleAt: (i: number) => Role; pad: number }) {
  const out: ReactNode[] = [];
  if (pad > 0) out.push(<span key="pad">{" ".repeat(pad)}</span>);
  for (let i = 0; i < bits.length; i += 1) {
    if (i > 0 && i % 8 === 0) out.push(<span key={`s${i}`}> </span>);
    out.push(
      <span key={i} className={ROLE_CLASS[roleAt(i)]}>
        {bits[i]}
      </span>,
    );
  }
  return <>{out}</>;
}

function V4Diagram({ value, mac, lostBits }: { value: number; mac: MacBytes; lostBits: number }) {
  const ipBits = toBits(value, 32);
  const macBits = mac.map((b) => b.toString(2).padStart(8, "0")).join("");
  // 48 bits and five separators against 32 bits and three: pad the IPv4 row
  // by the difference so the copied 23 bits line up on the right.
  const pad = 48 + 5 - (32 + 3);
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4">
        <div
          className="min-w-max whitespace-pre font-mono-tight text-xs leading-loose text-[hsl(var(--brand-bone))]"
          role="img"
          aria-label={`The IPv4 group's low 23 bits are copied into the low 23 bits of the MAC. The 5 bits after the 1110 prefix, here ${toBits(lostBits, 5)}, are dropped.`}
        >
          <div>
            <span className="inline-block w-14 text-[hsl(var(--brand-ash))]">IPv4</span>
            <BitRow bits={ipBits} pad={pad} roleAt={(i) => (i < 4 ? "fixed" : i < 9 ? "lost" : "copied")} />
          </div>
          <div>
            <span className="inline-block w-14 text-[hsl(var(--brand-ash))]">MAC</span>
            <BitRow bits={macBits} pad={0} roleAt={(i) => (i < 25 ? "fixed" : "copied")} />
          </div>
        </div>
      </div>
      <ul className="mt-3 space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        <li>
          <span className={ROLE_CLASS.copied}>Green</span>: the low 23 bits, copied unchanged.
        </li>
        <li>
          <span className={ROLE_CLASS.lost}>Amber, dotted</span>: the 5 bits that do not fit. Here they
          are {toBits(lostBits, 5)}, member {lostBits + 1} of 32.
        </li>
        <li>
          <span className={ROLE_CLASS.fixed}>Gray</span>: the 1110 prefix every IPv4 group has, and in
          the MAC the fixed 01:00:5e plus one bit that is always 0.
        </li>
      </ul>
    </div>
  );
}

function V6Diagram({ value, mac }: { value: bigint; mac: MacBytes }) {
  const groups = bigIntToGroups(value).map((g) => g.toString(16).padStart(4, "0"));
  const macHex = mac.map((b) => b.toString(16).padStart(2, "0"));
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4">
        <div
          className="min-w-max whitespace-pre font-mono-tight text-xs leading-loose"
          role="img"
          aria-label="The last 32 bits of the IPv6 group become the last four octets of the MAC, after 33:33."
        >
          <div>
            <span className="inline-block w-14 text-[hsl(var(--brand-ash))]">IPv6</span>
            {groups.map((g, i) => (
              <span key={i}>
                {i > 0 ? <span className="text-[hsl(var(--brand-ash))]">:</span> : null}
                <span className={i < 6 ? ROLE_CLASS.lost : ROLE_CLASS.copied}>{g}</span>
              </span>
            ))}
          </div>
          <div>
            <span className="inline-block w-14 text-[hsl(var(--brand-ash))]">MAC</span>
            {macHex.map((h, i) => (
              <span key={i}>
                {i > 0 ? <span className="text-[hsl(var(--brand-ash))]">:</span> : null}
                <span className={i < 2 ? ROLE_CLASS.fixed : ROLE_CLASS.copied}>{h}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        <span className={ROLE_CLASS.copied}>Green</span>: the low 32 bits, copied.{" "}
        <span className={ROLE_CLASS.lost}>Amber, dotted</span>: 96 bits, flags and scope included, that never reach
        the wire. <span className={ROLE_CLASS.fixed}>Gray</span>: the fixed 33:33 prefix.
      </p>
    </div>
  );
}

function V4List({
  items,
  current,
  onPick,
  testId,
}: {
  items: V4Collision[];
  current: string | null;
  onPick: (address: string) => void;
  testId: string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid={testId}>
      {items.map((c) => {
        const active = c.address === current;
        return (
          <li key={c.address}>
            <button
              type="button"
              onClick={() => onPick(c.address)}
              aria-current={active ? "true" : undefined}
              className={`flex min-h-[44px] w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                active
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                  : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
              }`}
            >
              <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.address}</span>
              {c.name ? (
                <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {c.name}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function V6List({ items, onPick, testId }: { items: V6Candidate[]; onPick: (a: string) => void; testId: string }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid={testId}>
      {items.map((c) => (
        <li key={c.address}>
          <button
            type="button"
            onClick={() => onPick(c.address)}
            className="flex min-h-[44px] w-full flex-col items-start gap-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3 text-left transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
          >
            <span className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.address}</span>
            <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {c.name ?? "No registered name"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Callout({ tone, children, testId }: { tone: "warn" | "info"; children: ReactNode; testId?: string }) {
  const style =
    tone === "warn"
      ? "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]"
      : "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-bone-dim))]";
  return (
    <p data-testid={testId} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${style}`}>
      {children}
    </p>
  );
}

/* ----------------------------------------------------------------- result */

function Result({ result, onPick }: { result: MapResult; onPick: (value: string) => void }) {
  if (result.kind === "ipv4") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Mapping">
            <ToolResult label="Group" value={result.address} testId="text-group" />
            <MacFormats mac={result.mac} testId="text-mac" />
            <ToolResult label="Well-known as" value={result.name ?? "No registered name"} mono={false} />
            <ToolResult label="Block" value={result.block} mono={false} />
            <ToolResult label="Shares this MAC" value="32 groups" />
          </ToolPanel>
          <ToolPanel title="Bit by bit">
            <V4Diagram value={result.value} mac={result.mac} lostBits={result.lostBits} />
          </ToolPanel>
        </div>

        {result.sharesControlBlockMac && !result.inControlBlock ? (
          <Callout tone="warn" testId="text-flood-warning">
            <strong className="font-normal uppercase tracking-[0.2em]">Caution: </strong>
            this group uses {formatMac(result.mac)}, the same MAC as a 224.0.0.0/24 control group. RFC 4541 tells
            IGMP snooping switches to send 224.0.0.0/24 traffic out of every port, because many hosts never send IGMP
            joins for those groups. A switch that filters by MAC address therefore floods every 01:00:5e:00:00:xx
            frame, so traffic for this group is flooded like broadcast, even with snooping on. Avoid groups of the form
            x.0.0.y and x.128.0.y.
          </Callout>
        ) : null}

        <ToolPanel title="The 32 groups that share this MAC">
          <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Same low 23 bits, every combination of the 5 dropped bits. A host that joins any one of these accepts
            frames for all 32 in its network card and discards the rest in software.
          </p>
          <V4List items={result.collisions} current={result.address} onPick={onPick} testId="list-collisions" />
        </ToolPanel>
      </div>
    );
  }

  if (result.kind === "ipv6") {
    const siblings = (() => {
      const r = macToCandidates(result.mac);
      return r.kind === "mac" ? r.ipv6Candidates.filter((c) => c.address !== result.address) : [];
    })();
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Mapping">
            <ToolResult label="Group" value={result.address} testId="text-group" />
            <MacFormats mac={result.mac} testId="text-mac" />
            <ToolResult label="Well-known as" value={result.name ?? "No registered name"} mono={false} />
            <ToolResult
              label="Scope"
              value={`${result.scope.toString(16)}: ${result.scopeName}`}
              testId="text-scope"
            />
            <ToolResult label="Flags" value={result.flags.toString(2).padStart(4, "0")} />
            <ul className="mt-3 space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {result.flagNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            {result.zoneIgnored ? (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The zone %{result.zoneIgnored} picks the interface to send on. It is not part of the address and does
                not change the MAC.
              </p>
            ) : null}
          </ToolPanel>
          <ToolPanel title="Bit by bit">
            <V6Diagram value={result.value} mac={result.mac} />
          </ToolPanel>
        </div>
        <ToolPanel title="Other groups on this MAC">
          <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            All 2^88 multicast groups with the same low 32 bits use {formatMac(result.mac)}. A few of them, the same
            low 32 bits in common scopes with no flags set:
          </p>
          <V6List items={siblings} onPick={onPick} testId="list-siblings" />
        </ToolPanel>
      </div>
    );
  }

  if (result.kind === "ipv6-unicast") {
    return (
      <ToolPanel title="Not a multicast group">
        <Callout tone="info">
          {result.address} is a unicast address, so it has no multicast MAC of its own. IPv6 multicast is ff00::/8.
          Neighbor discovery for this address uses its solicited-node group instead: ff02::1:ff followed by the
          address's last 24 bits.
        </Callout>
        <div className="mt-4">
          <ToolResult label="Unicast address" value={result.address} />
          <ToolResult label="Solicited-node group" value={result.solicited} testId="text-group" />
          <MacFormats mac={result.mac} testId="text-mac" />
        </div>
        <button type="button" onClick={() => onPick(result.solicited)} className={`${CHIP} mt-4`}>
          Map {result.solicited}
        </button>
      </ToolPanel>
    );
  }

  if (result.kind === "mac") {
    return (
      <div className="space-y-6">
        <ToolPanel title="MAC address">
          <MacFormats mac={result.mac} testId="text-mac" />
          <ToolResult
            label="I/G bit"
            value={result.multicast ? "1: group (multicast)" : "0: individual (unicast)"}
            testId="text-ig-bit"
          />
          {result.l2Name ? <ToolResult label="Well-known as" value={result.l2Name} mono={false} /> : null}
          <p
            className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
            data-testid="text-mac-summary"
          >
            {result.summary}
          </p>
        </ToolPanel>
        {result.ipv4Candidates.length ? (
          <ToolPanel title="IPv4 groups that map here">
            <V4List items={result.ipv4Candidates} current={null} onPick={onPick} testId="list-candidates" />
          </ToolPanel>
        ) : null}
        {result.ipv6Candidates.length ? (
          <ToolPanel title="Likely IPv6 groups">
            <V6List items={result.ipv6Candidates} onPick={onPick} testId="list-candidates" />
          </ToolPanel>
        ) : null}
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------- page */

export function MulticastMacMapper() {
  const [raw, setRaw] = useState("224.0.0.5");
  const result = useMemo(() => mapInput(raw), [raw]);

  const summary =
    result.kind === "ipv4"
      ? `${result.address} maps to ${formatMac(result.mac)}, shared with 31 other groups.`
      : result.kind === "ipv6"
        ? `${result.address} maps to ${formatMac(result.mac)}.`
        : result.kind === "ipv6-unicast"
          ? `Unicast address. Its solicited-node group ${result.solicited} maps to ${formatMac(result.mac)}.`
          : result.kind === "mac"
            ? result.family === "ipv4"
              ? `${formatMac(result.mac)} could carry any of 32 IPv4 groups.`
              : result.family === "ipv6"
                ? `${formatMac(result.mac)} carries the low 32 bits of an IPv6 group.`
                : `${formatMac(result.mac)} is not an IP multicast MAC.`
            : result.kind === "error"
              ? "Nothing mapped."
              : "Enter an address to map it.";

  return (
    <ToolShell slug="multicast-mac-mapper">
      <div className="space-y-6">
        <ToolPanel title="Address">
          <label htmlFor="mcast-input" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            IPv4 group, IPv6 group, or MAC address
          </label>
          <input
            id="mcast-input"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            maxLength={MAX_INPUT_LENGTH * 2}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={result.kind === "error"}
            aria-describedby={result.kind === "error" ? "mcast-error" : "mcast-hint"}
            placeholder="224.0.0.251, ff02::fb or 01:00:5e:00:00:fb"
            data-testid="input-address"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {result.kind === "error" ? (
            <p
              id="mcast-error"
              role="alert"
              data-testid="text-address-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {result.message}
            </p>
          ) : (
            <p id="mcast-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The type is detected from the text. MACs can be written with colons, hyphens, Cisco dots or no
              separators.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={LABEL}>Try</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.value}
                type="button"
                onClick={() => setRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
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

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        <div data-testid="output-mapping">
          <Result result={result} onPick={setRaw} />
        </div>
      </div>
    </ToolShell>
  );
}
