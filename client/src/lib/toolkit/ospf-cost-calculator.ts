/**
 * OSPF interface cost arithmetic.
 *
 * RFC 2328 does not say how a cost is chosen. It says the interface output
 * cost is what the router advertises for that link in its router-LSA, that
 * it must be greater than zero (Appendix C.3), and that the router-LSA
 * metric field is 16 bits wide (Appendix A.4.2). The reference bandwidth
 * formula is the default metric in the OSPF MIB (RFC 4750, ospfIfMetricValue:
 * 10^8 / ifSpeed), and most implementations follow it:
 *
 *     cost = reference bandwidth / interface bandwidth
 *
 * This tool follows Cisco IOS: the fraction is dropped (a T1 is 64, not 65),
 * then the cost is floored at 1 and capped at 65535. FRRouting rounds to the
 * nearest integer instead; frrCost below models that for the FRR output.
 * Bandwidth is held as whole kilobits per
 * second in a BigInt, because that is the unit the IOS `bandwidth` command
 * takes and because the division then stays exact at every size.
 *
 * Pure functions only: no React, no DOM.
 */

/** The Cisco IOS default and the OSPF MIB default: 100 Mbps, which is 10^8 bps. */
export const DEFAULT_REFERENCE_MBPS = 100;
/**
 * FRRouting documents 100 Mbps, but ospfd initializes ref_bandwidth to
 * OSPF_DEFAULT_REF_BANDWIDTH (100000) and divides it by interface bandwidth in
 * Mbps, so out of the box a 1 Gbps link costs 100 (lib/libospf.h,
 * ospfd/ospf_interface.c; FRR issue 15455).
 */
export const FRR_BUILTIN_REFERENCE_MBPS = 100000;
/** The range `auto-cost reference-bandwidth` accepts on IOS and FRR, in Mbps. */
export const MIN_REFERENCE_MBPS = 1;
export const MAX_REFERENCE_MBPS = 4294967;
/** RFC 2328 A.4.2: the router-LSA link metric is a 16-bit field. */
export const MAX_INTERFACE_COST = 65535;
/** The IOS `router ospf` process id range. */
export const MAX_PROCESS_ID = 65535;
/** Upper bound on a link this tool will take, so the numbers stay readable. */
export const MAX_BANDWIDTH_KBPS = 10_000_000_000n; // 10 Tbps
/** Hops per path. Enough for any realistic intra-area path. */
export const MAX_HOPS = 12;
/** Longest interface name kept in generated configuration. */
export const MAX_NAME_LENGTH = 40;

export type BandwidthUnit = "kbps" | "Mbps" | "Gbps";

/** Power of ten that turns one unit into kilobits per second. */
const UNIT_EXPONENT: Record<BandwidthUnit, number> = { kbps: 0, Mbps: 3, Gbps: 6 };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LinkPreset {
  id: string;
  label: string;
  kbps: bigint;
}

/** Speeds people actually meet, from legacy WAN to current data center optics. */
export const LINK_PRESETS: LinkPreset[] = [
  { id: "56k", label: "56 kbps", kbps: 56n },
  { id: "64k", label: "64 kbps (DS0)", kbps: 64n },
  { id: "t1", label: "T1, 1.544 Mbps", kbps: 1544n },
  { id: "e1", label: "E1, 2.048 Mbps", kbps: 2048n },
  { id: "10m", label: "Ethernet, 10 Mbps", kbps: 10_000n },
  { id: "100m", label: "FastEthernet, 100 Mbps", kbps: 100_000n },
  { id: "1g", label: "1 Gbps", kbps: 1_000_000n },
  { id: "2500m", label: "2.5 Gbps", kbps: 2_500_000n },
  { id: "10g", label: "10 Gbps", kbps: 10_000_000n },
  { id: "25g", label: "25 Gbps", kbps: 25_000_000n },
  { id: "40g", label: "40 Gbps", kbps: 40_000_000n },
  { id: "100g", label: "100 Gbps", kbps: 100_000_000n },
  { id: "400g", label: "400 Gbps", kbps: 400_000_000n },
];

export function presetById(id: string): LinkPreset | undefined {
  return LINK_PRESETS.find((p) => p.id === id);
}

/** Thousands separators and spaces are common in pasted numbers, so they are dropped. */
function cleanNumber(text: string): string {
  return text.trim().replace(/[\s,_]/g, "");
}

/**
 * Parse a speed in the given unit into whole kilobits per second. The decimal
 * is handled as digits rather than as a float, so 1.544 Mbps is exactly 1544
 * kbps and never 1543.9999.
 */
export function parseBandwidthKbps(text: string, unit: BandwidthUnit): Parsed<bigint> {
  const cleaned = cleanNumber(text);
  if (cleaned === "") return { ok: false, error: "Enter a link speed." };
  if (/^-\d|^-\.\d/.test(cleaned)) return { ok: false, error: "A link speed cannot be negative." };
  const match = /^(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) {
    return { ok: false, error: `"${text.trim().slice(0, 24)}" is not a number. Use digits and at most one decimal point.` };
  }
  const whole = match[1] || "0";
  const frac = match[2] ?? "";
  if (whole.length + frac.length > 24) {
    return { ok: false, error: "That number is too long. This tool stops at 10 Tbps." };
  }
  const exponent: number | undefined = UNIT_EXPONENT[unit];
  if (exponent === undefined) return { ok: false, error: "Pick a unit: kbps, Mbps or Gbps." };
  const digits = BigInt(whole + frac);
  const shift = exponent - frac.length;
  let kbps: bigint;
  if (shift >= 0) {
    kbps = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    if (digits % divisor !== 0n) {
      return {
        ok: false,
        error: "IOS counts bandwidth in whole kilobits per second, so this speed has a fraction of a kilobit left over.",
      };
    }
    kbps = digits / divisor;
  }
  if (kbps === 0n) {
    return { ok: false, error: "A link needs some bandwidth. Zero would make the cost infinite." };
  }
  if (kbps > MAX_BANDWIDTH_KBPS) {
    return { ok: false, error: "This tool stops at 10 Tbps per link." };
  }
  return { ok: true, value: kbps };
}

/** The reference is a whole number of Mbps from 1 to 4294967 on IOS and FRR. */
export function parseReferenceMbps(text: string): Parsed<number> {
  const cleaned = cleanNumber(text).replace(/^0+(?=\d)/, "");
  if (cleaned === "") return { ok: false, error: "Enter a reference bandwidth in Mbps." };
  if (!/^\d+$/.test(cleaned)) {
    return {
      ok: false,
      error: "The reference bandwidth is a whole number of Mbps, for example 100000 for 100 Gbps.",
    };
  }
  if (cleaned.length > 10) {
    return { ok: false, error: `The largest reference IOS and FRR accept is ${MAX_REFERENCE_MBPS.toLocaleString("en-US")} Mbps.` };
  }
  const value = Number(cleaned);
  if (value < MIN_REFERENCE_MBPS) {
    return { ok: false, error: "The reference bandwidth must be at least 1 Mbps." };
  }
  if (value > MAX_REFERENCE_MBPS) {
    return { ok: false, error: `The largest reference IOS and FRR accept is ${MAX_REFERENCE_MBPS.toLocaleString("en-US")} Mbps.` };
  }
  return { ok: true, value };
}

export function parseProcessId(text: string): Parsed<number> {
  const cleaned = text.trim();
  if (!/^\d{1,5}$/.test(cleaned)) {
    return { ok: false, error: `An IOS OSPF process id is a whole number from 1 to ${MAX_PROCESS_ID}.` };
  }
  const value = Number(cleaned);
  if (value < 1 || value > MAX_PROCESS_ID) {
    return { ok: false, error: `An IOS OSPF process id is a whole number from 1 to ${MAX_PROCESS_ID}.` };
  }
  return { ok: true, value };
}

export interface CostResult {
  /** The cost a router advertises: truncated, then floored at 1 and capped at 65535. */
  cost: number;
  /** The truncated quotient before the floor and the cap. */
  raw: bigint;
  /** The quotient as a decimal, for showing what was thrown away. */
  quotient: number;
  /** The division came out even, so nothing was truncated. */
  exact: boolean;
  /** The quotient was below 1, so the cost was raised to 1. */
  floored: boolean;
  /** The quotient was above 65535, so the cost was capped. */
  capped: boolean;
}

/** A reference that is not a finite number of at least 1 Mbps is treated as 1, so BigInt never throws. */
function referenceKbps(referenceMbps: number): bigint {
  const whole = Number.isFinite(referenceMbps) && referenceMbps >= 1 ? Math.trunc(referenceMbps) : 1;
  return BigInt(Math.min(whole, MAX_REFERENCE_MBPS)) * 1000n;
}

/** Cisco-style cost: reference / bandwidth, fraction dropped, clamped to 1..65535. */
export function ospfCost(referenceMbps: number, bandwidthKbps: bigint): CostResult {
  const refKbps = referenceKbps(referenceMbps);
  const bw = bandwidthKbps > 0n ? bandwidthKbps : 1n;
  const raw = refKbps / bw; // BigInt division truncates toward zero
  const floored = raw < 1n;
  const capped = raw > BigInt(MAX_INTERFACE_COST);
  const cost = floored ? 1 : capped ? MAX_INTERFACE_COST : Number(raw);
  return {
    cost,
    raw,
    quotient: Number(refKbps) / Number(bw),
    exact: refKbps % bw === 0n,
    floored,
    capped,
  };
}

/**
 * FRRouting ospfd cost: (uint32_t)(refbw / bw + 0.5), then clamped to
 * 1..65535 (ospf_if_get_output_cost in ospfd/ospf_interface.c). That rounds
 * half up, so 2.5 becomes 3 where IOS gives 2. Done here in integers as
 * floor((2 * ref + bw) / (2 * bw)), which matches the C double arithmetic
 * for every reference and bandwidth this tool accepts.
 */
export function frrCost(referenceMbps: number, bandwidthKbps: bigint): number {
  const refKbps = referenceKbps(referenceMbps);
  const bw = bandwidthKbps > 0n ? bandwidthKbps : 1n;
  const rounded = (2n * refKbps + bw) / (2n * bw);
  if (rounded < 1n) return 1;
  if (rounded > BigInt(MAX_INTERFACE_COST)) return MAX_INTERFACE_COST;
  return Number(rounded);
}

/** "1.544 Mbps", "10 Gbps", "56 kbps". Exact, never rounded. */
export function formatBandwidth(kbps: bigint): string {
  const units: [bigint, string][] = [
    [1_000_000_000n, "Tbps"],
    [1_000_000n, "Gbps"],
    [1_000n, "Mbps"],
  ];
  for (const [size, name] of units) {
    if (kbps >= size) {
      const whole = kbps / size;
      const rest = kbps % size;
      if (rest === 0n) return `${whole.toString()} ${name}`;
      const width = size.toString().length - 1;
      const frac = rest.toString().padStart(width, "0").replace(/0+$/, "");
      return `${whole.toString()}.${frac} ${name}`;
    }
  }
  return `${kbps.toString()} kbps`;
}

export interface PathSummary {
  total: number;
  costs: CostResult[];
  /** Slowest link on the path, which bounds its throughput. */
  bottleneckKbps: bigint | null;
}

export function pathSummary(referenceMbps: number, hops: bigint[]): PathSummary {
  const costs = hops.map((kbps) => ospfCost(referenceMbps, kbps));
  const total = costs.reduce((sum, c) => sum + c.cost, 0);
  let bottleneck: bigint | null = null;
  for (const kbps of hops) if (bottleneck === null || kbps < bottleneck) bottleneck = kbps;
  return { total, costs, bottleneckKbps: bottleneck };
}

export type Winner = "A" | "B" | "tie" | "none";

/** Lower total wins. Equal totals are installed side by side as equal-cost multipath. */
export function compareTotals(a: number | null, b: number | null): Winner {
  if (a === null || b === null) return "none";
  if (a === b) return "tie";
  return a < b ? "A" : "B";
}

/**
 * The smallest power of ten, in Mbps, at or above the fastest link. No link
 * is then faster than the reference, so none is floored to 1, and the
 * fastest costs between 1 and 10. Never below the 100 Mbps default and never
 * above what the command accepts.
 */
export function suggestReferenceMbps(fastestKbps: bigint): number {
  // Capped at 1,000,000 Mbps, the largest power of ten the command takes, so
  // a link above 1 Tbps can still be faster than the suggestion.
  let ref = 100n;
  while (ref * 1000n < fastestKbps && ref * 10n <= BigInt(MAX_REFERENCE_MBPS)) ref *= 10n;
  return Number(ref);
}

export interface Collapse {
  cost: number;
  speeds: bigint[];
}

/** Groups of different speeds that land on the same cost, which OSPF then cannot tell apart. */
export function findCollapses(referenceMbps: number, speeds: bigint[]): Collapse[] {
  const distinct = Array.from(new Set(speeds.map((s) => s.toString()))).map((s) => BigInt(s));
  const byCost = new Map<number, bigint[]>();
  for (const kbps of distinct) {
    const { cost } = ospfCost(referenceMbps, kbps);
    const group = byCost.get(cost) ?? [];
    group.push(kbps);
    byCost.set(cost, group);
  }
  const out: Collapse[] = [];
  byCost.forEach((group, cost) => {
    if (group.length > 1) out.push({ cost, speeds: group.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)) });
  });
  return out.sort((x, y) => x.cost - y.cost);
}

/**
 * Interface names are copied into configuration, so control characters go
 * and whitespace collapses. An empty name gets a placeholder that is obviously
 * one, rather than a real interface name the reader might paste unchanged.
 */
export function cleanInterfaceName(name: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned === "" ? fallback : cleaned.slice(0, MAX_NAME_LENGTH);
}

export interface ConfigHop {
  path: "A" | "B";
  /** 1-based position along the path. */
  index: number;
  name: string;
  kbps: bigint;
  cost: number;
}

export interface ConfigOptions {
  referenceMbps: number;
  /** IOS only. FRR's default instance takes no id. */
  processId: number;
  /** Write `ip ospf cost` on each interface instead of leaving it to the formula. */
  pin: boolean;
  hops: ConfigHop[];
}

function hopComment(hop: ConfigHop, referenceMbps: number): string {
  return `! Path ${hop.path}, hop ${hop.index}: ${formatBandwidth(hop.kbps)}, cost ${hop.cost} at ${referenceMbps.toLocaleString("en-US")} Mbps`;
}

function header(referenceMbps: number, dialect: "ios" | "frr"): string[] {
  const lines = ["! Same reference on every OSPF router in the domain, or costs disagree."];
  if (dialect === "ios" && referenceMbps === DEFAULT_REFERENCE_MBPS) {
    lines.push("! 100 Mbps is the IOS default. This line restores it.");
  }
  if (dialect === "frr") {
    lines.push("! FRR's ospfd starts at 100000 Mbps, not the documented 100, so set it explicitly.");
  }
  return lines;
}

/** Cisco IOS and IOS XE. `auto-cost reference-bandwidth` takes Mbps. */
export function iosConfig(o: ConfigOptions): string {
  const lines = [...header(o.referenceMbps, "ios"), `router ospf ${o.processId}`, ` auto-cost reference-bandwidth ${o.referenceMbps}`, "!"];
  for (const hop of o.hops) {
    lines.push(hopComment(hop, o.referenceMbps));
    if (o.pin) {
      lines.push(`interface ${hop.name}`, ` ip ospf cost ${hop.cost}`, "!");
    }
  }
  if (!o.pin && o.hops.length) lines.push("! Costs above follow from each interface's bandwidth value.");
  return lines.join("\n");
}

/**
 * FRRouting ospfd through vtysh. Same command and unit as IOS, but FRR
 * rounds where IOS truncates and holds interface bandwidth in whole Mbps, so
 * each hop says when FRR's own cost differs from the one on the page.
 */
export function frrConfig(o: ConfigOptions): string {
  const lines = [
    ...header(o.referenceMbps, "frr"),
    "router ospf",
    ` auto-cost reference-bandwidth ${o.referenceMbps}`,
    "exit",
    "!",
  ];
  for (const hop of o.hops) {
    lines.push(hopComment(hop, o.referenceMbps));
    const own = frrCost(o.referenceMbps, hop.kbps);
    if (hop.kbps % 1000n !== 0n) {
      lines.push(
        o.pin
          ? "!   FRR holds interface bandwidth in whole Mbps, so this link is pinned."
          : "!   FRR holds interface bandwidth in whole Mbps and cannot express this speed. Pin it.",
      );
    } else if (own !== hop.cost) {
      lines.push(
        o.pin
          ? `!   FRR rounds and would give ${own}. The pinned ${hop.cost} matches IOS.`
          : `!   FRR rounds to the nearest integer, so it gives this interface ${own}, not ${hop.cost}.`,
      );
    }
    if (o.pin) {
      lines.push(`interface ${hop.name}`, ` ip ospf cost ${hop.cost}`, "exit", "!");
    }
  }
  if (!o.pin && o.hops.length) {
    lines.push("! Costs above follow from each interface's bandwidth setting or, without one, its reported link speed.");
  }
  return lines.join("\n");
}
