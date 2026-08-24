/**
 * CIDR block visualiser.
 *
 * Splitting a prefix is halving: each extra bit in the mask doubles the
 * number of blocks and halves the size of each one. The stacked bars make
 * that literal, one row per prefix length, so a /24 sitting inside a /22
 * sitting inside a /20 is something you can see rather than something you
 * have to hold in your head.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- uint32 kit */

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

// `x << 32` is `x << 0` in JS, so /0 has to be handled separately.
function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function octetOf(value: number, index: number): number {
  return (value >>> (24 - index * 8)) & 255;
}

/** Index of the octet a prefix boundary falls inside, 0 to 3. */
function boundaryOctet(prefix: number): number {
  if (prefix === 0) return 0;
  return prefix % 8 === 0 ? prefix / 8 - 1 : Math.floor(prefix / 8);
}

function commas(value: number): string {
  return value.toLocaleString("en-US");
}

function usableIn(prefix: number): number {
  if (prefix === 32) return 1;
  // RFC 3021: a /31 point-to-point link uses both of its addresses.
  if (prefix === 31) return 2;
  return Math.pow(2, 32 - prefix) - 2;
}

/* ------------------------------------------------------------ parse input */

type Parsed =
  | { kind: "ok"; base: number; prefix: number; wasRounded: boolean }
  | { kind: "hint"; message: string }
  | { kind: "error"; message: string };

function parseCidr(raw: string): Parsed {
  const text = raw.trim();
  if (!text) return { kind: "hint", message: "Enter a block, for example 10.20.0.0/16." };
  const slash = text.indexOf("/");
  if (slash === -1) return { kind: "hint", message: "Add a prefix length, for example /16." };

  const addr = parseIpv4(text.slice(0, slash).trim());
  if (addr === null) {
    return {
      kind: "error",
      message: "That is not a valid IPv4 address. Four octets, 0 to 255, no leading zeros.",
    };
  }
  const lenText = text.slice(slash + 1).trim();
  if (!/^\d{1,2}$/.test(lenText) || Number(lenText) > 32) {
    return { kind: "error", message: "The prefix length must be a whole number from 0 to 32." };
  }
  const prefix = Number(lenText);
  const base = (addr & prefixToMask(prefix)) >>> 0;
  return { kind: "ok", base, prefix, wasRounded: base !== addr };
}

/* ------------------------------------------------------------ rendering */

// Deeper rows would be sub-pixel on a phone, and 64 list rows is already
// more than anyone reads. Both caps are stated in the UI rather than hidden.
const MAX_LEVELS = 6;
const MAX_LISTED = 64;

interface Selection {
  prefix: number;
  network: number;
}

export function CidrVisualizer() {
  const [raw, setRaw] = useState("192.168.8.0/22");
  const [requestedSplit, setRequestedSplit] = useState(24);
  const [selected, setSelected] = useState<Selection | null>(null);

  const parsed = useMemo(() => parseCidr(raw), [raw]);
  const basePrefix = parsed.kind === "ok" ? parsed.prefix : 0;
  const baseAddr = parsed.kind === "ok" ? parsed.base : 0;

  const split = Math.min(32, Math.max(requestedSplit, basePrefix));
  const depth = split - basePrefix;
  const totalBlocks = Math.pow(2, depth);
  const blockSize = Math.pow(2, 32 - split);

  const levels = useMemo(() => {
    if (parsed.kind !== "ok") return [];
    const shown = Math.min(depth, MAX_LEVELS);
    const rows: { prefix: number; count: number }[] = [];
    for (let step = 0; step <= shown; step += 1) {
      rows.push({ prefix: basePrefix + step, count: Math.pow(2, step) });
    }
    return rows;
  }, [parsed.kind, basePrefix, depth]);

  const listed = useMemo(() => {
    if (parsed.kind !== "ok") return [];
    const count = Math.min(totalBlocks, MAX_LISTED);
    const rows: { index: number; network: number; last: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const network = (baseAddr + i * blockSize) >>> 0;
      rows.push({ index: i + 1, network, last: (network + blockSize - 1) >>> 0 });
    }
    return rows;
  }, [parsed.kind, baseAddr, blockSize, totalBlocks]);

  const selectedDetail = useMemo(() => {
    if (!selected || parsed.kind !== "ok") return null;
    const size = Math.pow(2, 32 - selected.prefix);
    const last = (selected.network + size - 1) >>> 0;
    return {
      cidr: `${ipToString(selected.network)}/${selected.prefix}`,
      mask: ipToString(prefixToMask(selected.prefix)),
      first: ipToString(selected.network),
      last: ipToString(last),
      size,
      usable: usableIn(selected.prefix),
      contains: Math.pow(2, split - selected.prefix),
    };
  }, [selected, parsed.kind, split]);

  const messageId = "cidr-input-message";

  return (
    <ToolShell
      slug="cidr-visualizer"
      notes={
        <>
          <p>
            CIDR replaced the old class A, B, and C boundaries in 1993 (RFC 1518 and RFC 1519) with a
            single idea: a prefix length says how many leading bits are fixed, and everything after
            them is free. That makes address space a binary tree. Adding one bit to the mask splits a
            block cleanly into two halves, adding two bits gives four quarters, and no block can ever
            straddle a boundary, which is why 192.168.8.0/22 is legal and 192.168.9.0/22 is not.
          </p>
          <p>
            The same property running in reverse is route aggregation. Two adjacent blocks of the
            same size that share every bit except the last one of the prefix can be advertised as a
            single shorter prefix. That is why an ISP hands out 203.0.113.0/24 rather than 256
            scattered host routes, and why the global routing table is roughly a million entries
            instead of billions.
          </p>
          <p>
            Reading a block boundary by hand is easier than it looks. Find the octet the prefix ends
            in, subtract the mask value in that octet from 256, and you have the step between
            networks: a /26 has 192 in the fourth octet, so blocks appear every 64 addresses. The
            same trick tells you at a glance whether an address belongs to a block, which is the
            question an ACL or a firewall rule is really asking.
          </p>
          <p>
            The diagram stops after {MAX_LEVELS} levels and the list stops at {MAX_LISTED} blocks.
            Deeper splits are still counted correctly, they are just not drawn, because a /8 divided
            into /24s is 65,536 rectangles and none of them would be a pixel wide.
          </p>
        </>
      }
    >
      <div className="space-y-6">
        <ToolPanel title="Block">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="cidr-base"
                className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
              >
                Parent block in CIDR notation
              </label>
              <input
                id="cidr-base"
                type="text"
                value={raw}
                spellCheck={false}
                autoComplete="off"
                data-testid="input-cidr"
                onChange={(event) => {
                  setRaw(event.target.value);
                  setSelected(null);
                }}
                aria-invalid={parsed.kind === "error"}
                aria-describedby={parsed.kind === "ok" ? undefined : messageId}
                placeholder="192.168.8.0/22"
                className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cidr-split"
                className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
              >
                Split into
              </label>
              <select
                id="cidr-split"
                value={split}
                data-testid="select-split"
                disabled={parsed.kind !== "ok"}
                onChange={(event) => {
                  setRequestedSplit(Number(event.target.value));
                  setSelected(null);
                }}
                className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none disabled:opacity-50"
              >
                {parsed.kind === "ok"
                  ? Array.from({ length: 32 - basePrefix + 1 }, (_, i) => basePrefix + i).map((p) => (
                      <option key={p} value={p}>
                        /{p} · {commas(Math.pow(2, p - basePrefix))}{" "}
                        {Math.pow(2, p - basePrefix) === 1 ? "block" : "blocks"}
                      </option>
                    ))
                  : null}
              </select>
            </div>
          </div>

          {parsed.kind === "error" ? (
            <p
              id={messageId}
              role="alert"
              data-testid="text-cidr-error"
              className="mt-4 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span>{parsed.message}</span>
            </p>
          ) : null}
          {parsed.kind === "hint" ? (
            <p id={messageId} className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              {parsed.message}
            </p>
          ) : null}
          {parsed.kind === "ok" && parsed.wasRounded ? (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Host bits were set in that address, so it has been masked down to its own network
              address, {ipToString(parsed.base)}/{parsed.prefix}.
            </p>
          ) : null}
        </ToolPanel>

        {parsed.kind === "ok" ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <ToolPanel title="Parent">
                <ToolResult label="Block" value={`${ipToString(baseAddr)}/${basePrefix}`} testId="text-parent" />
                <ToolResult label="Mask" value={ipToString(prefixToMask(basePrefix))} />
                <ToolResult
                  label="Range"
                  value={`${ipToString(baseAddr)} - ${ipToString((baseAddr + Math.pow(2, 32 - basePrefix) - 1) >>> 0)}`}
                />
                <ToolResult label="Addresses" value={commas(Math.pow(2, 32 - basePrefix))} />
              </ToolPanel>

              <ToolPanel title="After the split">
                <ToolResult label="Child prefix" value={`/${split}`} />
                <ToolResult label="Blocks produced" value={commas(totalBlocks)} testId="text-block-count" />
                <ToolResult label="Addresses each" value={commas(blockSize)} />
                <ToolResult label="Usable hosts each" value={commas(usableIn(split))} />
              </ToolPanel>
            </div>

            <ToolPanel title="Nesting">
              {depth === 0 ? (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                  The split prefix equals the parent prefix, so there is nothing to divide yet. Pick a
                  longer prefix above.
                </p>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {levels.map((level) => {
                      const size = Math.pow(2, 32 - level.prefix);
                      const octet = boundaryOctet(level.prefix);
                      const showLabels = level.count <= 16;
                      return (
                        <div key={level.prefix}>
                          <div className="mb-1 flex items-baseline justify-between gap-3">
                            <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                              /{level.prefix}
                            </span>
                            <span className="font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                              {commas(level.count)} × {commas(size)} addresses
                            </span>
                          </div>
                          <div className="flex w-full gap-[2px]">
                            {Array.from({ length: level.count }, (_, i) => {
                              const network = (baseAddr + i * size) >>> 0;
                              const isSelected =
                                selected?.prefix === level.prefix && selected?.network === network;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  data-testid={`button-block-${level.prefix}-${i}`}
                                  onClick={() => setSelected({ prefix: level.prefix, network })}
                                  aria-pressed={isSelected}
                                  aria-label={`${ipToString(network)} slash ${level.prefix}`}
                                  title={`${ipToString(network)}/${level.prefix}`}
                                  className={`min-h-[30px] min-w-0 flex-1 overflow-hidden rounded-[3px] border font-mono-tight text-[9px] leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))] ${
                                    isSelected
                                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.35)] text-[hsl(var(--brand-bone))]"
                                      : i % 2 === 0
                                        ? "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-carbon))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                                  }`}
                                >
                                  {showLabels ? octetOf(network, octet) : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    Each row is the row above it cut in half. The number inside a block is octet{" "}
                    {boundaryOctet(split) + 1} of its network address, which is the octet the boundary
                    falls in. Labels are dropped once a row passes 16 blocks.
                    {depth > MAX_LEVELS
                      ? ` The split goes ${depth} levels deep; only the first ${MAX_LEVELS} are drawn.`
                      : ""}
                  </p>
                </>
              )}
            </ToolPanel>

            {selectedDetail ? (
              <ToolPanel title="Selected block">
                <div className="grid gap-x-8 md:grid-cols-2">
                  <div>
                    <ToolResult label="Block" value={selectedDetail.cidr} testId="text-selected" />
                    <ToolResult label="Mask" value={selectedDetail.mask} />
                    <ToolResult
                      label="Range"
                      value={`${selectedDetail.first} - ${selectedDetail.last}`}
                    />
                  </div>
                  <div>
                    <ToolResult label="Addresses" value={commas(selectedDetail.size)} />
                    <ToolResult label="Usable hosts" value={commas(selectedDetail.usable)} />
                    <ToolResult
                      label={`Contains /${split}`}
                      value={`${commas(selectedDetail.contains)} ${selectedDetail.contains === 1 ? "block" : "blocks"}`}
                    />
                  </div>
                </div>
              </ToolPanel>
            ) : null}

            {depth > 0 ? (
              <ToolPanel title={`Blocks at /${split}`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <caption className="sr-only">
                      Every /{split} block inside {ipToString(baseAddr)}/{basePrefix}
                    </caption>
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        {["#", "Network", "Range", "Usable"].map((head) => (
                          <th
                            key={head}
                            scope="col"
                            className="py-2 pr-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listed.map((row) => {
                        const isSelected =
                          selected?.prefix === split && selected?.network === row.network;
                        return (
                          <tr
                            key={row.index}
                            className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                              isSelected ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""
                            }`}
                          >
                            <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                              {row.index}
                            </td>
                            <td className="py-1 pr-4">
                              <button
                                type="button"
                                onClick={() => setSelected({ prefix: split, network: row.network })}
                                className="min-h-[28px] py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone))] underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:decoration-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                              >
                                {ipToString(row.network)}/{split}
                              </button>
                            </td>
                            <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                              {ipToString(row.network)} - {ipToString(row.last)}
                            </td>
                            <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                              {commas(usableIn(split))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalBlocks > MAX_LISTED ? (
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    Showing the first {MAX_LISTED} of {commas(totalBlocks)} blocks. The rest continue
                    at the same {commas(blockSize)} address step all the way to{" "}
                    {ipToString((baseAddr + Math.pow(2, 32 - basePrefix) - 1) >>> 0)}.
                  </p>
                ) : null}
              </ToolPanel>
            ) : null}
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
