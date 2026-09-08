/**
 * Carrying one frame across a path of switches, deciding its VLAN twice per
 * switch.
 *
 * The rules, and there are only four of them:
 *
 *   Arriving on an access port, the frame joins that port's VLAN. The port
 *   does not read the tag. Anything already in the 802.1Q header stays there
 *   as far as this switch is concerned, which is the whole mechanism behind
 *   double tagging.
 *
 *   Arriving on a trunk with a tag, the frame joins the VLAN in the tag and
 *   the switch pops it. Arriving on a trunk with no tag, it joins the native
 *   VLAN.
 *
 *   Leaving on a trunk, the switch pushes a tag, unless the frame's VLAN is
 *   the native one, in which case it pushes nothing.
 *
 *   Leaving on an access port, the switch pushes nothing, and the frame only
 *   leaves at all if its VLAN is that port's VLAN.
 *
 * Every fault on this page comes out of the third rule meeting the second one
 * at the other end of a cable.
 */

import type { Frame, Outcome, Path, Port, Step } from "./types";

/** The VLAN an access port puts arrivals into, or 0 if the port is misconfigured. */
export const accessVlanOf = (port: Port): number => port.accessVlan ?? 0;

/** A trunk's native VLAN. Defaults to 1, because that is what switches do. */
export const nativeVlanOf = (port: Port): number => port.nativeVlan ?? 1;

/** The VLANs a trunk permits. An absent list means all of them. */
export const allows = (port: Port, vlan: number): boolean =>
  port.allowed === undefined || port.allowed.includes(vlan);

/**
 * Carry the frame across the path.
 *
 * Returns every step, so the page can show the tags on each wire and the VLAN
 * inside each switch rather than only the answer. The tags on the wire are
 * the part people never see and the reason the fault is invisible: on both
 * switches the configuration is what somebody intended, and the disagreement
 * exists only in the four bytes between them.
 */
export function carry(path: Path, frame: Frame = path.frame): Outcome {
  const steps: Step[] = [];
  let wire = [...frame.tags];

  for (let at = 0; at < path.hops.length; at += 1) {
    const hop = path.hops[at];
    let internal: number;
    let decidedBy: Step["decidedBy"];
    let payload: number[];

    if (hop.ingress.mode === "access") {
      internal = accessVlanOf(hop.ingress);
      decidedBy = "access port";
      /* Not touched: the port classifies by port and never looks at the tag. */
      payload = [...wire];
    } else if (wire.length > 0) {
      internal = wire[0];
      decidedBy = "tag";
      payload = wire.slice(1);
      if (!allows(hop.ingress, internal)) {
        steps.push({ at, device: hop.device, arrived: [...wire], internal, decidedBy, left: [], refused: "not-allowed-in" });
        return { kind: "dropped", steps, at, reason: "not-allowed-in" };
      }
    } else {
      internal = nativeVlanOf(hop.ingress);
      decidedBy = "native VLAN";
      payload = [];
      if (!allows(hop.ingress, internal)) {
        steps.push({ at, device: hop.device, arrived: [...wire], internal, decidedBy, left: [], refused: "native-not-allowed" });
        return { kind: "dropped", steps, at, reason: "native-not-allowed" };
      }
    }

    const arrived = [...wire];

    if (hop.egress.mode === "access") {
      if (internal !== accessVlanOf(hop.egress)) {
        steps.push({ at, device: hop.device, arrived, internal, decidedBy, left: [], refused: "wrong-access-vlan" });
        return { kind: "dropped", steps, at, reason: "wrong-access-vlan" };
      }
      wire = payload;
    } else {
      if (!allows(hop.egress, internal)) {
        steps.push({ at, device: hop.device, arrived, internal, decidedBy, left: [], refused: "not-allowed-out" });
        return { kind: "dropped", steps, at, reason: "not-allowed-out" };
      }
      /* The one rule the whole page turns on: the native VLAN leaves bare. */
      wire = internal === nativeVlanOf(hop.egress) ? payload : [internal, ...payload];
    }

    steps.push({ at, device: hop.device, arrived, internal, decidedBy, left: [...wire] });
  }

  const last = steps[steps.length - 1];
  return { kind: "delivered", steps, vlan: last.internal, leftover: [...wire] };
}

/** The canonical answer to a path's question, as a string CI can compare. */
export function canonical(path: Path): string {
  const outcome = carry(path);
  return outcome.kind === "dropped" ? "dropped" : String(outcome.vlan);
}

/**
 * The option that is right, found rather than declared.
 *
 * No path carries an answer key. The correct option is the one whose value
 * matches what the model computes, and CI requires exactly one to match.
 */
export const correctOption = (path: Path) =>
  path.options.find((option) => option.value === canonical(path));

/**
 * Trunk links whose two ends disagree about the native VLAN.
 *
 * Returned as the index of the hop whose egress disagrees with the next hop's
 * ingress, because that is where the frame changes VLAN. Nothing on either
 * switch reports this: each end is doing exactly what it was told.
 */
export function nativeMismatches(path: Path): number[] {
  const out: number[] = [];
  for (let at = 0; at < path.hops.length - 1; at += 1) {
    const sending = path.hops[at].egress;
    const receiving = path.hops[at + 1].ingress;
    if (sending.mode !== "trunk" || receiving.mode !== "trunk") continue;
    if (nativeVlanOf(sending) !== nativeVlanOf(receiving)) out.push(at);
  }
  return out;
}

/**
 * Whether the frame ends up in a VLAN it did not start in.
 *
 * Computed by comparing the first and last steps rather than by looking for a
 * mismatch, so that a model that produced a VLAN change for some other reason
 * would still be caught by it.
 */
export function changedVlan(path: Path): boolean {
  const outcome = carry(path);
  if (outcome.steps.length < 2) return false;
  return outcome.steps[0].internal !== outcome.steps[outcome.steps.length - 1].internal;
}

/**
 * Access ports whose VLAN is the native VLAN of a trunk on the same path.
 *
 * The precondition for double tagging, and the reason the advice is to make
 * the native VLAN one that carries no hosts at all.
 */
export function nativeCarriesHosts(path: Path): Port[] {
  const natives = new Set<number>();
  for (const hop of path.hops) {
    for (const port of [hop.ingress, hop.egress]) {
      if (port.mode === "trunk") natives.add(nativeVlanOf(port));
    }
  }
  const out: Port[] = [];
  for (const hop of path.hops) {
    for (const port of [hop.ingress, hop.egress]) {
      if (port.mode === "access" && natives.has(accessVlanOf(port))) out.push(port);
    }
  }
  return out;
}

/** How a tag list reads on the wire. */
export const onWire = (tags: number[]): string =>
  tags.length === 0 ? "untagged" : tags.map((tag) => `tag ${tag}`).join(", then ");

export const REFUSAL_TEXT: Record<string, string> = {
  "not-allowed-in": "the trunk does not allow that VLAN in",
  "not-allowed-out": "the trunk does not allow that VLAN out",
  "wrong-access-vlan": "the access port is in a different VLAN",
  "native-not-allowed": "the trunk's own native VLAN is not in its allowed list",
};
