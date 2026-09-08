/**
 * A glossary that is worth reading rather than worth having.
 *
 * "VLAN: a virtual LAN" is a line that helps nobody. It restates the acronym
 * and stops. Every entry here has to do the two things an expansion cannot:
 * say what the thing actually is in a sentence someone could use, and, where
 * there is one, name the thing people reliably get wrong about it.
 *
 * That second field is the whole point of the file. A VLAN is a broadcast
 * domain and not a security boundary. A URE figure is a warranty bound and
 * not a measured rate. A certificate proves custody of a domain and not the
 * honesty of whoever holds it. Those are the sentences that change what
 * somebody does, and none of them appear in an expansion.
 */

export type Field =
  | "networking"
  | "security"
  | "systems"
  | "storage"
  | "hardware"
  | "protocols"
  | "operations";

export interface Term {
  /** The term as it appears in writing, acronym or not. */
  term: string;
  /** What the letters stand for, when that is not obvious or not useful alone. */
  expansion?: string;
  field: Field;
  /** What it is, in the site's voice. Two or three sentences. */
  definition: string;
  /**
   * The thing people get wrong.
   *
   * Optional, because not every term has one, and inventing a misconception
   * to fill the field would be worse than leaving it out.
   */
  confusion?: string;
  /** Other terms worth reading next. Checked by CI to resolve. */
  see?: string[];
}

export const FIELD_LABEL: Record<Field, string> = {
  networking: "Networking",
  security: "Security",
  systems: "Systems",
  storage: "Storage",
  hardware: "Hardware",
  protocols: "Protocols",
  operations: "Operations",
};

/** Sort key: case-insensitive, so ARP and arp land together. */
export const sortKey = (term: Term): string => term.term.toLowerCase();

/**
 * The anchor for a term.
 *
 * Lower case, and anything that is not a letter or digit becomes a hyphen, so
 * "MAC address" is #mac-address and "802.1Q" is #802-1q. Checked by CI to be
 * unique, because two entries collapsing to the same anchor would make one of
 * them unlinkable and nothing would say so.
 */
export const slugFor = (term: Term): string =>
  term.term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
