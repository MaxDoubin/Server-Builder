/**
 * RFC 2131, the arithmetic parts.
 *
 * Section 4.4.5: "T1 defaults to (0.5 * duration_of_lease). T2 defaults to
 * (0.875 * duration_of_lease)." A server may set either with options 58
 * and 59. At T1 the client sends DHCPREQUEST by unicast to the server that
 * granted the lease; at T2 it broadcasts DHCPREQUEST; when the lease expires
 * it "MUST immediately stop using" the address.
 *
 * Section 3.3: a lease time of 0xffffffff means infinite, and a client with
 * an infinite lease has no T1 or T2 to reach.
 *
 * The population result follows from the timers. A client that renewed at
 * T1 has a fresh lease of L, so between renewals its remaining time runs
 * from L down to L minus T1 and never lower. Across a room of clients that
 * renewed at different moments, remaining time is spread evenly over that
 * range. An outage of D seconds catches every client whose remaining time is
 * under D.
 *
 * The pool result is Little's law: things in the system equal arrival rate
 * times time in the system, and a device's time in the system is the whole
 * lease, because the server cannot see it leave.
 */

import type { Case, LeaseLength, Option, Setup, Timers } from "./types";

/** Option 51 all ones, which RFC 2131 defines as a lease that never ends. */
export const INFINITE_LEASE = 0xffffffff;

export const isInfinite = (lease: LeaseLength): boolean => lease === "infinite";

/** The lease in seconds, or Infinity. */
export const leaseSeconds = (setup: Setup): number => (isInfinite(setup.lease) ? Infinity : (setup.lease as number));

/** The three timers RFC 2131 gives a client, and the gap that decides outage tolerance. */
export function timers(setup: Setup): Timers {
  const L = leaseSeconds(setup);
  if (L === Infinity) return { t1: Infinity, t2: Infinity, expiry: Infinity, guaranteed: Infinity };
  const t1 = setup.t1 ?? Math.floor(L / 2);
  const t2 = setup.t2 ?? Math.floor((L * 7) / 8);
  return { t1, t2, expiry: L, guaranteed: L - t1 };
}

export const firstRenewalAt = (setup: Setup): number => timers(setup).t1;
export const broadcastsAt = (setup: Setup): number => timers(setup).t2;
export const expiresAt = (setup: Setup): number => timers(setup).expiry;

/**
 * The share of normally renewing clients whose lease runs out during an
 * outage of the given length. Zero until the outage exceeds the guaranteed
 * remaining time, then linear, then everyone.
 */
export function fractionLosing(setup: Setup): number {
  const t = timers(setup);
  if (t.expiry === Infinity || setup.outage <= t.guaranteed) return 0;
  return Math.min(1, (setup.outage - t.guaranteed) / t.t1);
}

/** Clients that lose their address, rounded to whole clients. */
export const clientsLost = (setup: Setup): number => Math.round(setup.clients * fractionLosing(setup));

/** The outage a room of normally renewing clients survives with nobody lost. */
export const survivesOutageUpTo = (setup: Setup): number => timers(setup).guaranteed;

/**
 * Addresses held at steady state by devices that appear at a rate and each
 * keep an address for a full lease. Infinite leases hold every address they
 * are ever given, so this has no steady state; Infinity says so.
 */
export function concurrentLeases(setup: Setup): number {
  if (setup.arrivalsPerHour === 0) return 0;
  const L = leaseSeconds(setup);
  return L === Infinity ? Infinity : Math.round((setup.arrivalsPerHour * L) / 3600);
}

/** Whether steady state demand exceeds the pool. */
export const poolUnderPressure = (setup: Setup): boolean =>
  setup.arrivalsPerHour > 0 && concurrentLeases(setup) > setup.pool;

/**
 * Seconds from an empty pool until no free address remains, or null if the
 * pool never fills. Before the first lease expires, the pool drains at the
 * arrival rate; if steady state demand fits, expiries keep pace and it never
 * empties.
 */
export function exhaustsAfter(setup: Setup): number | null {
  if (!poolUnderPressure(setup)) return null;
  return Math.round((setup.pool / setup.arrivalsPerHour) * 3600);
}

/** Addresses returning to the pool per day at steady state. Infinite leases return none. */
export function recoveredPerDay(setup: Setup): number {
  if (setup.arrivalsPerHour === 0 || isInfinite(setup.lease)) return 0;
  return setup.arrivalsPerHour * 24;
}

/**
 * Whether a device that was gone for a while is handed the same address on
 * return. It is, if its lease had not expired, or if it had and nothing else
 * needed the address in the meantime; servers prefer the previous binding.
 * It is not, when the lease expired on a pool under pressure.
 */
export function keepsAddress(setup: Setup): boolean {
  if (setup.away === 0) return true;
  const L = leaseSeconds(setup);
  if (setup.away <= L) return true;
  return !poolUnderPressure(setup);
}

export function holds(claim: Option["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "clients-lost":
      return clientsLost(setup) === claim.count;
    case "first-renewal-at":
      return firstRenewalAt(setup) === claim.seconds;
    case "broadcasts-at":
      return broadcastsAt(setup) === claim.seconds;
    case "expires-at":
      return expiresAt(setup) === claim.seconds;
    case "concurrent":
      return concurrentLeases(setup) === claim.count;
    case "exhausts-after":
      return exhaustsAfter(setup) === claim.seconds;
    case "recovered-per-day":
      return recoveredPerDay(setup) === claim.count;
    case "keeps-address":
      return keepsAddress(setup) === claim.value;
    case "nothing":
      return false;
  }
}

export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Seconds as a human reads them: 2400 s is 40 min, 3150 s is 52.5 min, 86400 s is 1 d. */
export function human(seconds: number): string {
  if (seconds === Infinity) return "never";
  if (seconds % 86400 === 0) return `${seconds / 86400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${seconds} s`;
}

/** The lease as dhclient.leases records it, which is the file people read afterwards. */
export function asLease(setup: Setup): string {
  const t = timers(setup);
  const lines = [
    "lease {",
    "  interface \"eth0\";",
    "  fixed-address 10.20.30.117;",
    `  option dhcp-lease-time ${isInfinite(setup.lease) ? INFINITE_LEASE : setup.lease};`,
  ];
  if (!isInfinite(setup.lease)) {
    lines.push(`  option dhcp-renewal-time ${t.t1};`);
    lines.push(`  option dhcp-rebinding-time ${t.t2};`);
  }
  lines.push("  option dhcp-server-identifier 10.20.30.1;", "}");
  return lines.join("\n");
}

/**
 * One client's lease as a timeline, with the outage laid over it, so the
 * reader can see whether the promise outlasts the silence.
 */
export function asTimeline(setup: Setup): string {
  const t = timers(setup);
  if (t.expiry === Infinity) {
    return ["0 s        granted, lease infinite", "           no T1, no T2, no expiry; the address is held for good"].join("\n");
  }
  const rows = [
    `0 s        granted, lease ${human(t.expiry)}`,
    `${String(t.t1).padEnd(10)} T1: unicast DHCPREQUEST to 10.20.30.1`,
    `${String(t.t2).padEnd(10)} T2: broadcast DHCPREQUEST to any server`,
    `${String(t.expiry).padEnd(10)} expiry: the address must be given up`,
  ];
  if (setup.outage > 0) {
    rows.push(
      `server dark for ${human(setup.outage)}; a client survives it with ${human(t.guaranteed)} to spare at best` +
        ` and ${fractionLosing(setup) === 0 ? "nobody" : `${Math.round(fractionLosing(setup) * 100)}% of the room`} loses an address`,
    );
  }
  return rows.join("\n");
}
