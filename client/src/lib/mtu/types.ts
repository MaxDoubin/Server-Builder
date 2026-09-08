/**
 * Ping works and the transfer hangs.
 *
 * This is the fault that survives every test somebody thinks to run, because
 * every test somebody thinks to run sends small packets. A default ping is
 * 84 bytes on the wire. It crosses a path with a 1400 byte link in it
 * without noticing, the DNS lookups are fine, SSH connects, and then the
 * first large response stops dead and never comes back.
 *
 * The mechanism has three parts and you need all three to see it. A router
 * that cannot forward a packet larger than its next link's MTU must drop it
 * when Don't Fragment is set, and send back an ICMP type 3 code 4 saying so
 * with the size it could have taken. The sender is supposed to hear that and
 * lower its idea of the path MTU. When something in between drops that ICMP,
 * usually a firewall configured by somebody who decided ICMP was dangerous,
 * the sender never hears it, keeps sending the same oversized packet, and
 * the connection hangs rather than fails.
 *
 * That last part is what makes it so expensive to diagnose. There is no
 * error. Nothing logs anything. The link is up, the route is right, the
 * handshake succeeded, and the data is gone.
 */

export interface Hop {
  /** What the hop is called in a traceroute. */
  name: string;
  /** MTU of the link leaving this hop, in bytes. */
  mtu: number;
  /**
   * True when this hop drops the ICMP fragmentation-needed messages that
   * pass back through it. The blackhole maker.
   */
  blocksIcmp?: boolean;
  /** Shown in the topology, for the hops that are somebody's decision. */
  note?: string;
}

export interface Path {
  slug: string;
  name: string;
  hops: Hop[];
  /** MTU the sender starts with, which is its own interface's. */
  senderMtu: number;
}

/** What happened to one packet on one path. */
export type Fate =
  | { kind: "delivered"; hops: number }
  | { kind: "fragmented"; at: number; into: number; hops: number }
  | { kind: "rejected"; at: number; needs: number; heard: true }
  | { kind: "blackholed"; at: number; needs: number; swallowedAt: number };

export interface Probe {
  /** Total IP packet size in bytes, headers included. */
  size: number;
  /** Don't Fragment set. Every modern TCP stack sets it; ping does not by default. */
  df: boolean;
}
