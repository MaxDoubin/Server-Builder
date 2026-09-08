/**
 * Walking one packet down one path.
 *
 * The rules, in the order a router applies them:
 *
 *   1. If the packet fits the next link, forward it.
 *   2. If it does not and DF is clear, fragment it and forward the pieces.
 *   3. If it does not and DF is set, drop it and send ICMP type 3 code 4
 *      back towards the sender, carrying the MTU it could have taken.
 *   4. That ICMP then has to travel back through every hop it already
 *      crossed. If any of them drops ICMP, the sender never hears it.
 *
 * Rule four is the whole reason this page exists. Rules one to three are in
 * every textbook and produce a clean error. Rule four produces silence.
 */

import type { Fate, Hop, Path, Probe } from "./types";

/** The IPv4 header is 20 bytes with no options, and this model uses none. */
export const IP_HEADER = 20;
/** A TCP header with no options. The MSS a stack advertises is MTU minus both. */
export const TCP_HEADER = 20;
/** ICMP echo: 8 bytes of header, and ping's default 56 bytes of payload. */
export const PING_DEFAULT = IP_HEADER + 8 + 56;

/** The smallest MTU on the path, which is the path MTU by definition. */
export const pathMtu = (path: Path): number =>
  Math.min(path.senderMtu, ...path.hops.map((hop) => hop.mtu));

/** Which hop imposes the path MTU. Ties go to the first, which is where a trace stops. */
export function narrowest(path: Path): number {
  let index = 0;
  for (let i = 1; i < path.hops.length; i += 1) {
    if (path.hops[i].mtu < path.hops[index].mtu) index = i;
  }
  return index;
}

/**
 * Send one packet and see what becomes of it.
 *
 * Returns where it got to and why it stopped, including which hop swallowed
 * the ICMP when one did: that hop is the fault, not the one that dropped the
 * packet. The hop that dropped the packet was doing its job correctly.
 */
export function send(path: Path, probe: Probe): Fate {
  for (let index = 0; index < path.hops.length; index += 1) {
    const hop = path.hops[index];
    if (probe.size <= hop.mtu) continue;

    if (!probe.df) {
      /* Fragments carry a fresh IP header each, so the payload is what splits. */
      const perFragment = hop.mtu - IP_HEADER;
      const payload = probe.size - IP_HEADER;
      return { kind: "fragmented", at: index, into: Math.ceil(payload / perFragment), hops: index };
    }

    /*
      The ICMP travels back the way the packet came, so the search runs from
      the hop that generated it towards the sender, and the first blocker it
      meets is where the diagnosis dies.

      The direction matters when more than one hop blocks ICMP. A firewall
      beyond the drop point never sees this message at all: it only affects
      what the far end can learn about the reverse direction. Walking the
      array forwards would have blamed it, and blamed the wrong device.
    */
    for (let back = index; back >= 0; back -= 1) {
      if (path.hops[back].blocksIcmp) {
        return { kind: "blackholed", at: index, needs: hop.mtu, swallowedAt: back };
      }
    }
    return { kind: "rejected", at: index, needs: hop.mtu, heard: true };
  }
  return { kind: "delivered", hops: path.hops.length };
}

/**
 * The largest packet that gets all the way through with DF set.
 *
 * Equal to the path MTU, and computed by walking rather than by taking the
 * minimum, so that a bug in send() shows up here as a disagreement rather
 * than being hidden by two functions sharing an assumption.
 */
export function largestThatFits(path: Path): number {
  let best = 0;
  for (let size = IP_HEADER; size <= path.senderMtu; size += 1) {
    if (send(path, { size, df: true }).kind === "delivered") best = size;
  }
  return best;
}

/** The MSS a TCP stack on this path should end up using. */
export const mssFor = (mtu: number): number => mtu - IP_HEADER - TCP_HEADER;

/** True when a default ping crosses a path that large packets cannot. */
export const pingLies = (path: Path): boolean =>
  send(path, { size: PING_DEFAULT, df: false }).kind === "delivered" &&
  send(path, { size: path.senderMtu, df: true }).kind === "blackholed";
