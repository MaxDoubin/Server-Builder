/**
 * The glibc search algorithm, transcribed.
 *
 * From resolv/res_query.c, __res_context_search, in prose:
 *
 *   If the name ends in a dot, it is fully qualified. Strip the dot, query
 *   it, and do not touch the search list.
 *
 *   Otherwise count the dots. If there are at least ndots of them, query
 *   the name as written first. If that fails, and RES_DNSRCH is set (it is,
 *   by default), append each search domain in turn.
 *
 *   If there are fewer than ndots, append each search domain in turn first,
 *   and query the name as written last, because it has not been tried yet.
 *
 * Every attempt is one name; getaddrinfo with AF_UNSPEC sends A and AAAA for
 * it, so an attempt is two queries unless the program asked for one family.
 * The walk stops at the first name that answers. NXDOMAIN and NODATA both
 * mean "keep going".
 *
 * glibc 2.25 and earlier truncated the search list to six domains
 * (MAXDNSRCH) and 256 characters. 2.26 removed both limits.
 */

import type { Attempt, Case, Option, Setup } from "./types";

/** Search domains beyond this were silently ignored before glibc 2.26. */
export const MAXDNSRCH_BEFORE_2_26 = 6;

/** The largest value resolv.conf(5) allows for ndots. */
export const NDOTS_MAX = 15;

/** Dots in the name as the resolver counts them: a trailing dot is not one. */
export const dots = (name: string): number => {
  const bare = name.endsWith(".") ? name.slice(0, -1) : name;
  return (bare.match(/\./g) ?? []).length;
};

/** A name ending in a dot is fully qualified and skips the search list. */
export const isAbsolute = (name: string): boolean => name.endsWith(".");

/** The search list the resolver actually uses, after the version cap. */
export const effectiveSearch = (setup: Setup): string[] =>
  setup.glibc === "2.25" ? setup.search.slice(0, MAXDNSRCH_BEFORE_2_26) : setup.search;

/**
 * Every fully qualified name the resolver would try, in order, if nothing
 * ever answered. Trailing dots removed, because that is what goes on the wire.
 */
export function candidates(setup: Setup): string[] {
  const bare = setup.name.endsWith(".") ? setup.name.slice(0, -1) : setup.name;
  if (isAbsolute(setup.name)) return [bare];
  const suffixed = effectiveSearch(setup).map((domain) => `${bare}.${domain}`);
  return dots(setup.name) >= setup.ndots ? [bare, ...suffixed] : [...suffixed, bare];
}

/** Whether the search list is consulted for this name at all. */
export const searchApplied = (setup: Setup): boolean =>
  !isAbsolute(setup.name) && effectiveSearch(setup).length > 0;

/**
 * What one name gets back.
 *
 * A record wins. Failing that, a wildcard zone that the name sits beneath
 * wins, at any depth, which is RFC 4592 and the reason a search domain with
 * a wildcard in it is dangerous. Otherwise NXDOMAIN.
 */
export function lookup(setup: Setup, fqdn: string): Attempt {
  if (fqdn in setup.records) return { fqdn, outcome: "answer", address: setup.records[fqdn] };
  for (const [zone, address] of Object.entries(setup.wildcards)) {
    if (fqdn !== zone && fqdn.endsWith(`.${zone}`)) return { fqdn, outcome: "wildcard", address };
  }
  return { fqdn, outcome: "nxdomain", address: null };
}

/** The names actually sent, in order, stopping at the first that answers. */
export function attempts(setup: Setup): Attempt[] {
  const out: Attempt[] = [];
  for (const fqdn of candidates(setup)) {
    const attempt = lookup(setup, fqdn);
    out.push(attempt);
    if (attempt.outcome !== "nxdomain") break;
  }
  return out;
}

/** Total DNS queries on the wire for one resolution. */
export const queries = (setup: Setup): number => attempts(setup).length * setup.families;

/** How many of those queries were answered NXDOMAIN. */
export const nxdomains = (setup: Setup): number =>
  attempts(setup).filter((a) => a.outcome === "nxdomain").length * setup.families;

/** The first name that goes on the wire. */
export const firstTried = (setup: Setup): string => candidates(setup)[0];

/** The name that answered, or null if the resolver ran out of names. */
export function resolvesTo(setup: Setup): string | null {
  const last = attempts(setup).at(-1);
  return last && last.outcome !== "nxdomain" ? last.fqdn : null;
}

/** The address the program is handed, or null for a failed lookup. */
export function address(setup: Setup): string | null {
  const last = attempts(setup).at(-1);
  return last && last.outcome !== "nxdomain" ? last.address : null;
}

/** Whether the answer came from a wildcard rather than a real record. */
export const wentToWildcard = (setup: Setup): boolean =>
  attempts(setup).at(-1)?.outcome === "wildcard";

/** NXDOMAIN responses per second this one process draws from the resolver. */
export const nxdomainPerSecond = (setup: Setup): number =>
  setup.connectionsPerSecond * nxdomains(setup);

/** Which way the resolver went, for the page and the article. */
export function order(setup: Setup): "absolute only" | "absolute first" | "search first" {
  if (isAbsolute(setup.name)) return "absolute only";
  return dots(setup.name) >= setup.ndots ? "absolute first" : "search first";
}

export function holds(claim: Option["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "queries":
      return queries(setup) === claim.count;
    case "nxdomain":
      return nxdomains(setup) === claim.count;
    case "attempts":
      return attempts(setup).length === claim.count;
    case "first-tried":
      return firstTried(setup) === claim.name;
    case "resolves-to":
      return resolvesTo(setup) === claim.name;
    case "address":
      return address(setup) === claim.address;
    case "search-applied":
      return searchApplied(setup) === claim.value;
    case "nxdomain-per-second":
      return nxdomainPerSecond(setup) === claim.perSecond;
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

/** resolv.conf as the case's machine has it. */
export function asResolvConf(setup: Setup): string {
  const lines: string[] = [];
  if (setup.search.length) lines.push(`search ${setup.search.join(" ")}`);
  lines.push("nameserver 10.96.0.10");
  if (setup.ndots !== 1) lines.push(`options ndots:${setup.ndots}`);
  return lines.join("\n");
}

/**
 * The queries on the wire, one line each, the way `tcpdump -n port 53` or
 * `strace -e sendmmsg` would show them once you have decoded the labels.
 */
export function asTrace(setup: Setup): string {
  const types = setup.families === 2 ? ["A", "AAAA"] : ["A"];
  const width = Math.max(...candidates(setup).map((c) => c.length), 8);
  const lines: string[] = [];
  for (const attempt of attempts(setup)) {
    for (const type of types) {
      const rcode =
        attempt.outcome === "nxdomain"
          ? "NXDOMAIN"
          : type === "AAAA"
            ? "NOERROR  (no AAAA)"
            : `NOERROR  ${attempt.address}${attempt.outcome === "wildcard" ? "  (wildcard)" : ""}`;
      lines.push(`${type.padEnd(5)} ${attempt.fqdn.padEnd(width)}  ${rcode}`);
    }
  }
  return lines.join("\n");
}
