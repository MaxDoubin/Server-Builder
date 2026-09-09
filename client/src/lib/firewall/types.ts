/**
 * A packet filter you can watch think.
 *
 * The thing that actually confuses people about firewalls is not the syntax,
 * it is that evaluation stops at the first match. A rule that looks correct
 * does nothing because a broader rule three lines above already accepted the
 * packet, and no interface anywhere shows you that. `iptables -L -v` shows
 * counters, which tell you a rule fired but not which packet or why the one
 * you care about went elsewhere.
 *
 * So the output here is not a verdict, it is a trace: every rule the packet
 * was tested against, and for the ones that did not match, the first field
 * that ruled them out. The verdict falls out of the end of it.
 */

export type Protocol = "tcp" | "udp" | "icmp";

/** Connection tracking state, as conntrack reports it. */
export type CtState = "NEW" | "ESTABLISHED" | "RELATED" | "INVALID";

export type Action = "ACCEPT" | "DROP" | "REJECT";

export interface Packet {
  proto: Protocol;
  src: string;
  dst: string;
  /** Absent for icmp. */
  sport?: number;
  dport?: number;
  state: CtState;
  /** Inbound interface, as -i matches it. */
  iface: string;
}

/** A port, or an inclusive range written `low:high`. */
export interface PortSpec {
  low: number;
  high: number;
}

export interface Rule {
  /** 1-based, as the reader sees it in the textarea. */
  line: number;
  /** The source text, kept so the trace can point at it. */
  text: string;
  chain: string;
  action: Action;
  proto?: Protocol;
  /** CIDR, always normalized to address/prefix. */
  src?: string;
  dst?: string;
  sport?: PortSpec;
  dport?: PortSpec;
  /** Any of these states matches. */
  ctstate?: CtState[];
  iface?: string;
  /** Negated fields, by the option that carried the `!`. */
  negated: Set<string>;
}

export interface Ruleset {
  rules: Rule[];
  /** Chain name to default policy. */
  policy: Record<string, Action>;
}

export interface ParseError {
  line: number;
  text: string;
  message: string;
}

export interface Step {
  rule: Rule;
  matched: boolean;
  /** For a miss, the option that ruled it out: "-p", "--dport", "-s". */
  failedOn?: string;
  /** Human sentence for the miss, e.g. "packet is tcp, rule wants udp". */
  because?: string;
}

export interface Trace {
  chain: string;
  steps: Step[];
  /** The rule that decided it, or null when the policy did. */
  decidedBy: Rule | null;
  /**
   * The rules below the match, which never ran.
   *
   * Carried because this is where the fix usually is. A reader who added a
   * rule and cannot see why it does nothing is looking at this list.
   */
  notReached: Rule[];
  verdict: Action;
}

export const isParseError = (value: unknown): value is ParseError[] =>
  Array.isArray(value) && value.every((item) => item && typeof item === "object" && "line" in item);
