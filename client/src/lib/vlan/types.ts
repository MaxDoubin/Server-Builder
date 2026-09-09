/**
 * The frame that arrived untagged, and the two VLANs nobody meant to bridge.
 *
 * A VLAN tag is four bytes that exist only on the wire between switches. On
 * either side of that wire the frame belongs to a VLAN because of a decision
 * the switch made, and the decision is made twice: once on the way in, from
 * the port's configuration, and once on the way out, from the port's
 * configuration at the other end. When those two configurations disagree, the
 * frame changes VLAN in transit, and nothing anywhere reports an error.
 *
 * That is the native VLAN mismatch, and it is the reason this page exists. A
 * trunk sends its native VLAN untagged, by design, so that a switch on the
 * other end with no VLAN configuration still gets traffic. If the two ends
 * name different natives, every frame in the first switch's native VLAN
 * arrives on the second switch in the second switch's native VLAN. Two
 * broadcast domains are joined together. Both configurations are individually
 * correct, both pass review, `show interfaces trunk` on either switch looks
 * exactly as intended, and the only symptom is that hosts in one VLAN can
 * reach hosts in another.
 *
 * The same untagged-native rule is what makes the double tagging attack work,
 * and it works only when the attacker's access VLAN is the trunk's native
 * VLAN, which is the argument for never using VLAN 1 for anything and for
 * choosing a native VLAN that carries no hosts.
 */

/** Whether a port carries one VLAN or many. */
export type PortMode = "access" | "trunk";

export interface Port {
  /** What the interface is called, as it would appear in a configuration. */
  name: string;
  mode: PortMode;
  /**
   * Access ports: the VLAN every frame arriving here is put into.
   *
   * Classification is by port, not by tag. An access port does not read the
   * 802.1Q header, which is exactly why a tag the attacker put there survives
   * to be read by the next switch.
   */
  accessVlan?: number;
  /**
   * Trunk ports: the VLAN that leaves untagged and that untagged arrivals join.
   *
   * The default is VLAN 1 on essentially every switch, which is why the
   * mismatch is usually between somebody's carefully chosen native and a
   * neighbour nobody changed.
   */
  nativeVlan?: number;
  /** Trunk ports: the VLANs permitted to cross. Anything else is dropped. */
  allowed?: number[];
  /** Shown beside the port when its configuration is somebody's decision. */
  note?: string;
}

/**
 * A frame on the wire.
 *
 * Tags outermost first, so an empty array is an untagged frame and two
 * entries is the double tagged frame an attacker sends. Modeled as a stack
 * because that is what it is: each switch pushes or pops at most one.
 */
export interface Frame {
  tags: number[];
  /** What the frame is, for the prose. Not used by the model. */
  label: string;
}

/** One switch the frame crosses, entering one port and leaving another. */
export interface Hop {
  /** The switch's hostname. */
  device: string;
  ingress: Port;
  egress: Port;
}

/** Why a frame stopped. */
export type Refusal =
  /** A tagged arrival on a trunk carrying a VLAN the trunk does not allow. */
  | "not-allowed-in"
  /** The frame's VLAN is not permitted out of the egress trunk. */
  | "not-allowed-out"
  /** The frame's VLAN is not the access port's VLAN, so it cannot leave here. */
  | "wrong-access-vlan"
  /** An untagged arrival on a trunk whose native VLAN is not itself allowed. */
  | "native-not-allowed";

export interface Step {
  /** Index into the path's hops. */
  at: number;
  device: string;
  /** The tags on the wire as the frame arrived. */
  arrived: number[];
  /** The VLAN this switch decided the frame belongs to. */
  internal: number;
  /** Whether that decision came from the port or from a tag. */
  decidedBy: "access port" | "tag" | "native VLAN";
  /** The tags on the wire as the frame left. */
  left: number[];
  /** Set when the frame did not leave. */
  refused?: Refusal;
}

export type Outcome =
  | {
      kind: "delivered";
      steps: Step[];
      /** The VLAN the frame is in when it reaches the far end. */
      vlan: number;
      /** Tags still on the wire at the far end, which should normally be none. */
      leftover: number[];
    }
  | { kind: "dropped"; steps: Step[]; at: number; reason: Refusal };

export interface Option {
  id: string;
  claim: string;
  /**
   * The machine-checkable part.
   *
   * A VLAN number, or "dropped". Exactly one option's value has to equal
   * what the model computes, which CI enforces rather than trusting a
   * declared answer key.
   */
  value: string;
}

export interface Path {
  slug: string;
  name: string;
  brief: string;
  hops: Hop[];
  frame: Frame;
  question: string;
  options: Option[];
  why: string;
  /** The belief this case is built to break. Unique across the set. */
  breaks: string;
}
