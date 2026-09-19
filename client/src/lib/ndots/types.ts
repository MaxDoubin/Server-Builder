/**
 * Ten queries for one name.
 *
 * A program asks for `api.stripe.com` and the stub resolver sends ten DNS
 * queries, eight of them for names that do not exist. Nothing is broken. The
 * resolver is doing exactly what resolv.conf told it to, and what it was told
 * is written in two lines that almost nobody reads:
 *
 *   search prod.svc.cluster.local svc.cluster.local cluster.local ec2.internal
 *   options ndots:5
 *
 * resolv.conf(5): "Resolver queries having fewer than ndots dots (default is
 * 1) in them will be attempted using each component of the search path in
 * turn until a match is found." `api.stripe.com` has two dots. Two is fewer
 * than five. So the resolver tries it under every search domain first, and
 * asks for the name as written only after all of those have come back
 * NXDOMAIN. Each attempt is two queries, A and AAAA, because getaddrinfo asks
 * for both. Four search domains plus the name itself is five attempts, and
 * five attempts is ten queries, for a name that would have resolved on the
 * first try.
 *
 * The other side of the rule is what makes it hard to remove. Inside a
 * Kubernetes cluster, `db.billing` is a service in another namespace, and
 * `db.billing.svc.cluster.local` is its full name. With ndots at 1, `db.billing`
 * has one dot, one is not fewer than one, so the resolver tries `db.billing`
 * as an absolute name first, gets NXDOMAIN, and only then walks the search
 * list. ndots:5 exists so that every name a cluster hands out is tried with
 * the search list first. It is the right setting for the names inside and
 * the wrong setting for every name outside, and the same file cannot say
 * both.
 *
 * Two escapes are exact. A trailing dot makes a name fully qualified and the
 * search list is never consulted: `api.stripe.com.` is one attempt. And a
 * program that asks for IPv4 only halves everything, because the AAAA half
 * of each attempt is not sent.
 *
 * Two limits are historical. glibc up to 2.25 used at most six search
 * domains and 256 characters of them; from 2.26 the list is unlimited. And
 * ndots is capped at 15.
 *
 * The failure that is worse than slow is a search domain with a wildcard
 * record in it. `api.stripe.com.internal.example.com` matches
 * `*.internal.example.com`, the resolver gets an answer on that attempt, and
 * the connection goes to whatever the wildcard points at. Nothing reports
 * an error, because nothing failed.
 *
 * This models the glibc stub resolver, which is what almost every Linux
 * program uses. musl, systemd-resolved and browsers with their own resolvers
 * differ in detail and are out of scope here.
 */

/** What the program asked for, and what resolv.conf said to do with it. */
export interface Setup {
  /** The name exactly as the program passed it, trailing dot included if any. */
  name: string;
  /** options ndots:n, 1 by default and capped at 15. */
  ndots: number;
  /** The search list, in the order resolv.conf gives it. */
  search: string[];
  /**
   * 2 when the program calls getaddrinfo with AF_UNSPEC, which sends A and
   * AAAA for every attempt. 1 when it asks for one family only.
   */
  families: 1 | 2;
  /** Which glibc, because 2.25 and earlier use at most six search domains. */
  glibc: "2.25" | "2.26+";
  /** Names that have records, mapped to the address they answer with. No trailing dots. */
  records: Record<string, string>;
  /**
   * Zones with a wildcard record. Any name beneath one of these, at any
   * depth, gets the wildcard's address unless a closer name exists.
   */
  wildcards: Record<string, string>;
  /** New connections per second this one process opens, or 0 when it does not matter. */
  connectionsPerSecond: number;
}

/** One name the resolver tried, and what came back. */
export interface Attempt {
  /** The fully qualified name that was sent, no trailing dot. */
  fqdn: string;
  outcome: "nxdomain" | "answer" | "wildcard";
  /** The address that answered, for the two outcomes that answer. */
  address: string | null;
}

/**
 * A claim about what the resolver does with this name.
 *
 * The count claims are the surface. Everybody knows a name has to be looked
 * up; almost nobody knows how many times.
 */
export type Claim =
  /** Total DNS queries sent for one resolution, both families counted. */
  | { about: "queries"; count: number }
  /** How many of those came back NXDOMAIN. */
  | { about: "nxdomain"; count: number }
  /** How many distinct names were tried before the resolver stopped. */
  | { about: "attempts"; count: number }
  /** The first fully qualified name sent, no trailing dot. */
  | { about: "first-tried"; name: string }
  /** The name that finally answered, or null when nothing did. */
  | { about: "resolves-to"; name: string | null }
  /** The address the program is handed. */
  | { about: "address"; address: string | null }
  /** Whether the search list was consulted at all. */
  | { about: "search-applied"; value: boolean }
  /** NXDOMAIN responses per second, for the case that is about load. */
  | { about: "nxdomain-per-second"; perSecond: number }
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
