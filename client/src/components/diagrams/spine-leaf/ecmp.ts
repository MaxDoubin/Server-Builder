/**
 * The forwarding decision the diagram animates, kept apart from the drawing
 * so it can be read (and checked) on its own.
 *
 * Two facts carry the whole figure:
 *
 *   1. A router hashes the header fields that identify a flow and uses the
 *      result to pick ONE of its equal-cost next hops. The same fields give
 *      the same hash, so every packet of a flow takes the same path. That is
 *      what keeps TCP segments in order, and it is also why one very large
 *      flow cannot be spread over several links.
 *
 *   2. The pick here is hash-threshold from RFC 2992: the key space is cut
 *      into one equal region per next hop and the key's region names the next
 *      hop. When a next hop goes away the regions are resized, so some flows
 *      that were never on the failed link move as well. RFC 2992 puts that
 *      disruption between a quarter and a half of the flows for this method,
 *      which is the behavior consistent hashing exists to reduce.
 *
 * Which fields a real switch hashes is configurable. The five-tuple used
 * here (addresses, protocol, ports) is the common choice, not a rule.
 */

export interface FiveTuple {
  /** IPv4 addresses as 32-bit unsigned integers. */
  srcIp: number;
  dstIp: number;
  /** IP protocol number: 6 is TCP, 17 is UDP. */
  proto: number;
  srcPort: number;
  dstPort: number;
}

/** RFC 2992 calls the hash result the key and uses a 16-bit one (CRC16). */
const KEY_SPACE = 0x10000;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mix(hash: number, byte: number): number {
  return Math.imul(hash ^ (byte & 0xff), FNV_PRIME);
}

/**
 * Hash a five-tuple down to a 16-bit key.
 *
 * FNV-1a rather than a real switch's CRC: RFC 2992 leaves the hash function
 * open, and all the figure needs is that equal inputs give equal keys and
 * that keys spread evenly.
 */
export function flowKey(t: FiveTuple): number {
  let h = FNV_OFFSET;
  for (let shift = 24; shift >= 0; shift -= 8) h = mix(h, t.srcIp >>> shift);
  for (let shift = 24; shift >= 0; shift -= 8) h = mix(h, t.dstIp >>> shift);
  h = mix(h, t.proto);
  h = mix(h, t.srcPort >>> 8);
  h = mix(h, t.srcPort);
  h = mix(h, t.dstPort >>> 8);
  h = mix(h, t.dstPort);
  // Fold 32 bits to 16 so the high half still counts.
  return ((h >>> 16) ^ h) & 0xffff;
}

/**
 * Hash-threshold next-hop selection (RFC 2992, section 2).
 *
 * `hopUp[i]` says whether next hop i is in the equal-cost set. Returns the
 * index of the chosen next hop, or -1 when the set is empty.
 */
export function pickNextHop(key: number, hopUp: readonly boolean[]): number {
  let live = 0;
  for (let i = 0; i < hopUp.length; i++) if (hopUp[i]) live++;
  if (live === 0) return -1;

  // regionsize = keyspace.size / #{nexthops}; region = key / regionsize
  const region = Math.min(live - 1, Math.floor(key / (KEY_SPACE / live)));

  let seen = 0;
  for (let i = 0; i < hopUp.length; i++) {
    if (!hopUp[i]) continue;
    if (seen === region) return i;
    seen++;
  }
  return -1;
}

/** Dotted-quad form of a 32-bit address, for the readout under the figure. */
export function formatIp(ip: number): string {
  return `${ip >>> 24}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`;
}
