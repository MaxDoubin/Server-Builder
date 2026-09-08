/**
 * An iterative DNS resolver you can watch work, and a world for it to work in.
 *
 * The thing `dig` will not show you is why a resolution failed at the level
 * where it failed. `dig +trace` gets close, and then stops being useful the
 * moment something is actually wrong: a lame delegation and a missing glue
 * record both look like a timeout, and a NODATA and an NXDOMAIN both look like
 * "no answer" unless you read the flags.
 *
 * So this models the servers rather than the answers. Each zone is held by
 * named servers with addresses, delegations are real NS records at the parent,
 * glue is present or absent as a fact about the parent zone, and a server that
 * was delegated a zone it does not hold says so. The trace then shows every
 * query, which server took it, and what came back.
 */

export type RRType = "A" | "AAAA" | "NS" | "CNAME" | "MX" | "TXT" | "SOA";

export interface ResourceRecord {
  /** Fully qualified, no trailing dot, lowercase. */
  name: string;
  type: RRType;
  ttl: number;
  /** An address, a hostname, or text, depending on type. */
  value: string;
}

export interface Zone {
  /** The zone apex, "" for the root. */
  origin: string;
  /** Hostnames of the servers the parent delegates to. */
  servers: string[];
  /**
   * Whether those servers actually hold the zone.
   *
   * False models a lame delegation: the parent points at a server that was
   * decommissioned, renamed, or never configured. It is a real and common
   * fault, and from the outside it is indistinguishable from a firewall.
   */
  loaded: boolean;
  records: ResourceRecord[];
}

export interface World {
  zones: Zone[];
  /**
   * Address of every nameserver host, by hostname.
   *
   * Separate from the zone records because a nameserver's address may live in
   * a zone the resolver cannot reach yet, which is the entire reason glue
   * exists. A hostname missing from here is a server with no address at all.
   *
   * A SIMPLIFICATION, STATED. For an out-of-bailiwick nameserver (one whose
   * own name is not inside the zone it serves) a real resolver runs a whole
   * separate resolution to find its address, and the trace would show it. Here
   * that lookup is assumed to have happened and its result is read from this
   * table. The cost is real and this page does not show it; the reason for the
   * shortcut is that the alternative is a recursive trace inside a trace, and
   * the fault this page exists to teach is the in-bailiwick one, where no
   * amount of extra resolution helps.
   */
  hosts: Record<string, string>;
  /**
   * Glue held at each parent, as `zone origin -> hostnames with glue`.
   *
   * Glue is a property of the parent zone, not of the child, which is why it
   * goes stale: the child renames a server and nobody updates the delegation.
   */
  glue: Record<string, string[]>;
}

export type Outcome =
  | "answer"
  | "nxdomain"
  | "nodata"
  | "lame"
  | "no-glue"
  | "loop"
  | "no-address"
  | "too-many-steps";

export interface Query {
  name: string;
  type: RRType;
  /** Hostname of the server asked. */
  server: string;
  serverIp: string;
  /** What the server said, in one line. */
  response: string;
  kind: "referral" | "answer" | "cname" | "nxdomain" | "nodata" | "lame" | "unreachable";
}

export interface Resolution {
  name: string;
  type: RRType;
  queries: Query[];
  /** The records that answered, empty unless outcome is "answer". */
  answer: ResourceRecord[];
  /** Every CNAME followed, in order. */
  chain: string[];
  outcome: Outcome;
  /** One sentence a person could put in a ticket. */
  summary: string;
}

/** Lowercase, strip a trailing dot. The root is the empty string. */
export const canon = (name: string): string =>
  name.trim().toLowerCase().replace(/\.$/, "");

/** Is `name` inside `origin`, where the root contains everything? */
export const inZone = (name: string, origin: string): boolean => {
  if (origin === "") return true;
  return name === origin || name.endsWith(`.${origin}`);
};

/** Labels in a name, root being zero. */
export const depth = (name: string): number => (name === "" ? 0 : name.split(".").length);
