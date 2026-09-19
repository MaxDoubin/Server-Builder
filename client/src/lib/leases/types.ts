/**
 * The server was down for forty minutes and a third of the office fell off.
 *
 * A DHCP lease is a promise with a length, and a client that has one keeps
 * using its address until the promise runs out, server or no server. So a
 * DHCP outage does not take the network down. It takes down exactly the
 * clients whose leases happen to expire while the server is unreachable, and
 * how many that is follows from two numbers in the lease.
 *
 * RFC 2131 gives a client two timers inside every lease. At T1 it tries to
 * renew, by unicast, with the server that granted the lease. At T2 it gives
 * up on that server and broadcasts a request to any server. At the end of
 * the lease it must stop using the address. The defaults are T1 at half the
 * lease and T2 at seven eighths of it.
 *
 * While the server is up, every client renews at T1 and gets a fresh lease,
 * so at any instant a client has somewhere between half a lease and a whole
 * one remaining, spread evenly across the population. A server that
 * disappears for D seconds loses the clients whose remaining time was under
 * D. With a one hour lease that is nobody until the outage passes thirty
 * minutes, and everybody by the time it reaches sixty. Forty minutes is a
 * third.
 *
 * Which means the number that sets outage tolerance is not the lease length.
 * It is the lease length minus T1: the shortest remaining time a renewing
 * client can have. A server that hands out T1 explicitly can make that gap
 * almost the whole lease.
 *
 * The other half of the file is the pool. An address handed to a device is
 * unavailable for the whole lease, whether or not the device is still there,
 * because the server has no way to know. So a pool holds arrivals per hour
 * times lease hours addresses at steady state, and a coffee shop with a /24
 * and a twenty four hour lease is out of addresses by mid afternoon. The fix
 * is a shorter lease, not a bigger pool. Little's law, in a wiring closet.
 *
 * Nothing here models the retransmission schedule inside RENEWING and
 * REBINDING (RFC 2131 section 4.4.5), which clients implement differently.
 * The timers and the arithmetic on them are the surface.
 */

/** RFC 2131 uses the all-ones lease time to mean a lease that never ends. */
export type LeaseLength = number | "infinite";

export interface Setup {
  /** option 51, dhcp-lease-time, in seconds. */
  lease: LeaseLength;
  /** option 58, dhcp-renewal-time. null means the client's default of half the lease. */
  t1: number | null;
  /** option 59, dhcp-rebinding-time. null means the default of seven eighths. */
  t2: number | null;
  /** Clients holding leases and renewing normally when the outage starts. */
  clients: number;
  /** How long the server is unreachable, in seconds. 0 when there is no outage. */
  outage: number;
  /** Addresses in the dynamic pool. */
  pool: number;
  /** New devices appearing per hour, each taking an address it may never give back. */
  arrivalsPerHour: number;
  /** For the device that leaves and comes back: how long it was gone, in seconds. 0 if not that case. */
  away: number;
}

/** The lease's timers for one client, counted from the moment it was granted. */
export interface Timers {
  t1: number;
  t2: number;
  /** Infinity for an infinite lease. */
  expiry: number;
  /** expiry less t1: the least remaining time a normally renewing client ever has. */
  guaranteed: number;
}

/**
 * A claim about what happens on this network.
 *
 * The population claims are the surface. Everybody knows a lease has a
 * length; almost nobody has worked out what an outage of a given length
 * does to a room full of them.
 */
export type Claim =
  /** How many of the clients lose their address before the server returns. */
  | { about: "clients-lost"; count: number }
  /** Seconds after the grant at which a client first tries to renew. */
  | { about: "first-renewal-at"; seconds: number }
  /** Seconds after the grant at which a client stops unicasting and broadcasts. */
  | { about: "broadcasts-at"; seconds: number }
  /** Seconds after the grant at which the address must be given up. Infinity never holds. */
  | { about: "expires-at"; seconds: number }
  /** Addresses held at steady state by the transient population. */
  | { about: "concurrent"; count: number }
  /** Seconds until the pool has no free address, or null if it never runs out. */
  | { about: "exhausts-after"; seconds: number | null }
  /** Addresses that come back to the pool per day at steady state. */
  | { about: "recovered-per-day"; count: number }
  /** Whether the returning device is handed the address it had. */
  | { about: "keeps-address"; value: boolean }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
