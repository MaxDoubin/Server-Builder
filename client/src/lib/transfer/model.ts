/**
 * The three ceilings, and the ramp.
 *
 * Nothing here is novel: it is the bandwidth-delay product, the window over
 * the round trip, and the Mathis bound, which have been the answer since the
 * nineties. What the site adds is saying which one is binding, because that
 * is the part that decides what you should go and change.
 */

import type { Analysis, Ceiling, Limit, Link, Transfer } from "./types";

/**
 * The Mathis constant.
 *
 * sqrt(3/2), from the steady-state sawtooth: a window that halves on loss and
 * grows by one segment per round trip averages this much of its peak. It is
 * often quoted as 1.22 and occasionally as 0.93 or 1.31 depending on which
 * paper and which ACK behaviour. The exact figure matters far less than the
 * 1/sqrt(p), which is the shape of the whole result: cutting loss by a factor
 * of a hundred only doubles throughput ten times over, not a hundred.
 */
export const MATHIS = Math.sqrt(1.5);

/** RFC 6928's initial window: ten segments, not the older two or four. */
export const INITIAL_CWND_SEGMENTS = 10;

/** Bandwidth-delay product in bytes. How much must be in flight to fill the pipe. */
export function bdpBytes(link: Link): number {
  return (link.bandwidth / 8) * (link.rtt / 1000);
}

/** What a window of this size can deliver over this round trip, in bits per second. */
export function windowLimit(link: Link): number {
  if (link.rtt <= 0) return Infinity;
  return (link.window * 8) / (link.rtt / 1000);
}

/**
 * The Mathis bound in bits per second, or null when the loss rate is zero.
 *
 * Null rather than Infinity, because "there is no loss ceiling" and "the loss
 * ceiling is unimaginably high" are different statements and the page says
 * different things about them.
 */
export function lossLimit(link: Link): number | null {
  if (link.loss <= 0) return null;
  if (link.rtt <= 0) return null;
  return ((link.mss * 8) / (link.rtt / 1000)) * (MATHIS / Math.sqrt(link.loss));
}

export function analyse(link: Link): Analysis {
  const bdp = bdpBytes(link);
  const byWindow = windowLimit(link);
  const byLoss = lossLimit(link);

  const candidates: [Ceiling, number][] = [
    ["link", link.bandwidth],
    ["window", byWindow],
  ];
  if (byLoss !== null) candidates.push(["loss", byLoss]);

  /*
    Ties go to the earlier entry, which puts "link" first. A stream that is
    exactly at the link rate is link limited: saying its window is the problem
    when the window is sized precisely right would send somebody to change the
    one thing that is already correct.
  */
  let binding: Ceiling = "link";
  let throughput = Infinity;
  for (const [name, value] of candidates) {
    if (value < throughput) {
      throughput = value;
      binding = name;
    }
  }

  return {
    bdp,
    linkLimit: link.bandwidth,
    windowLimit: byWindow,
    lossLimit: byLoss,
    throughput,
    binding,
    windowToFill: bdp,
    utilisation: throughput / link.bandwidth,
  };
}

/**
 * How long moving this many bytes actually takes.
 *
 * Three parts, and the middle one is the one people forget. A connection
 * opens, then spends several round trips with the window still opening, and
 * only then runs at the rate everybody quotes. For anything small, the ramp
 * is the entire transfer and the link rate is close to irrelevant: this is
 * why a faster line does nothing measurable for a page of small files.
 *
 * A round takes a full RTT unless the window is so large that pushing it onto
 * the wire takes longer, in which case the wire is the limit for that round.
 */
export function timeToTransfer(link: Link, bytes: number): Transfer {
  const { throughput } = analyse(link);
  const rttSeconds = link.rtt / 1000;
  const ceiling = Math.max(link.mss, Math.min(link.window, bdpBytes(link)));

  let inFlight = INITIAL_CWND_SEGMENTS * link.mss;
  let delivered = 0;
  let rounds = 0;
  let rampSeconds = 0;

  while (delivered < bytes && inFlight < ceiling) {
    const chunk = Math.min(inFlight, bytes - delivered);
    /* The wire time for this round's data, which can exceed a round trip. */
    rampSeconds += Math.max(rttSeconds, (chunk * 8) / link.bandwidth);
    delivered += chunk;
    rounds += 1;
    inFlight *= 2;
  }

  const remaining = Math.max(0, bytes - delivered);
  const steadySeconds = throughput > 0 ? (remaining * 8) / throughput : Infinity;

  return {
    /* One round trip to open the connection, before a byte of data moves. */
    seconds: rttSeconds + rampSeconds + steadySeconds,
    slowStartRounds: rounds,
    slowStartSeconds: rampSeconds,
    steadySeconds,
    finishedRamping: remaining === 0,
  };
}

/**
 * What is actually costing the time for a transfer of this size.
 *
 * The steady-state ceiling is the answer only once the transfer is long
 * enough to reach it. A transfer that spends more of its life connecting and
 * ramping than it does at the steady rate is limited by round trips, and no
 * ceiling explains it: sending the same bytes as one stream instead of many
 * short ones is the fix, and a faster line is not.
 */
export function bindingFor(link: Link, bytes: number): Limit {
  const transfer = timeToTransfer(link, bytes);
  const preamble = link.rtt / 1000 + transfer.slowStartSeconds;
  if (preamble > transfer.steadySeconds) return "ramp";
  return analyse(link).binding;
}

/** Bits per second as something a person reads, without inventing precision. */
export function rate(bps: number): string {
  if (!Number.isFinite(bps)) return "unbounded";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(bps >= 1e10 ? 0 : 2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(bps >= 1e7 ? 0 : 1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} kbps`;
  return `${Math.round(bps)} bps`;
}

/** Bytes as something a person reads. Binary prefixes, because windows are powers of two. */
export function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 10 * 1024 ** 2 ? 0 : 2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${Math.round(bytes)} B`;
}

/** Seconds as something a person reads. */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "never";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 90) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(seconds < 600 ? 1 : 0)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
