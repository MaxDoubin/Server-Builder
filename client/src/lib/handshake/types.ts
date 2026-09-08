/**
 * Protocol handshakes, step by step, with a control for breaking them.
 *
 * The packet captures elsewhere on this site give you a trace of a thing that
 * worked. This is the other half: the sequence itself, and what happens when
 * one step of it does not arrive. That is where the interesting knowledge is,
 * because every one of these has a failure that produces a symptom nobody
 * would connect to the step that caused it.
 *
 * A SYN that gets no reply and a SYN that gets a RST look identical to a user
 * and mean opposite things about the firewall. A DHCP client with no address
 * and a DHCP client with the wrong gateway are the same DORA exchange with one
 * different actor. A TLS handshake that fails at the certificate and one that
 * fails at the cipher list both say "cannot establish a secure connection".
 */

export type Party = "client" | "server" | "other";

export interface Step {
  /** 1-based, so a break can name a step the way a person would. */
  n: number;
  from: Party;
  to: Party;
  /** The message name, as the protocol calls it. */
  label: string;
  /** One sentence on what this step is for. */
  detail: string;
  /** The fields worth naming, as they would appear. */
  carries: string[];
  /**
   * True when this message continues the previous one's flight.
   *
   * Real protocols do send two messages in a row in the same direction: a TLS
   * 1.3 server sends its ServerHello and then its whole certificate flight
   * without waiting. A rule that forbade that would be wrong, and a rule that
   * allowed it silently would stop catching a direction copied from the line
   * above, which is the easiest mistake to make writing these out. So it has
   * to be declared.
   */
  sameFlight?: true;
}

export interface Break {
  id: string;
  label: string;
  /** The step number at which the exchange stops. */
  stopsAt: number;
  /** What the person in front of the screen sees. */
  symptom: string;
  /** Who can fix it. */
  owner: "client" | "server" | "network" | "whoever owns the other device";
  explain: string[];
}

export interface Handshake {
  slug: string;
  title: string;
  tagline: string;
  /** Column headings. */
  client: string;
  server: string;
  brief: string[];
  steps: Step[];
  breaks: Break[];
  notes: string[];
}

export const PARTY_LABEL: Record<Party, string> = {
  client: "client",
  server: "server",
  other: "a third party",
};
