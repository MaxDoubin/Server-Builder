/**
 * A Juniper campus rack, built on the EX4300 line.
 *
 * Same rules as every other rack in this library. One Juniper-specific note
 * on power: like Cisco, Juniper publishes power supply ratings for the
 * EX4300 (350W, 715W and 1100W AC options) rather than the switch's own
 * consumption, so `watts` is null on the switches. A PSU rating is a
 * ceiling on what the socket must be able to deliver, not a measurement of
 * what the box draws, and quoting one as the other would triple the number.
 *
 * The EX4300's headline feature is that 40GbE is built in rather than
 * modular: four QSFP+ ports on every unit, used either as uplinks or as
 * Virtual Chassis interconnects, which is what makes a stack of these
 * behave as one switch with one configuration.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Two-digit label for a patch field position, so A01 sorts next to A02. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const activityFor = (n: number): number =>
  Math.round((((n * 37) % 61) / 60) * 100) / 100;

/** A run of identical ports, the first `patched` of them showing link. */
function run(
  kind: RackPort["kind"],
  count: number,
  label: (n: number) => string,
  patched: number,
  linkColour: LedState = "green",
): RackPort[] {
  return Array.from({ length: count }, (_, i): RackPort => {
    const n = i + 1;
    return n <= patched
      ? { kind, label: label(n), led: linkColour, activity: activityFor(n) }
      : { kind, label: label(n), led: "off" };
  });
}

/** Ports on a passive panel: no `led` at all, because there is none to light. */
function passive(
  kind: RackPort["kind"],
  count: number,
  label: (n: number) => string,
): RackPort[] {
  return Array.from({ length: count }, (_, i): RackPort => ({
    kind,
    label: label(i + 1),
  }));
}

const ACCENT = {
  member: "#00a8e0",
  primary: "#ccff00",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const juniperRack: RackDefinition = {
  slug: "juniper-ex4300-12u",
  name: "Juniper EX4300 12U",
  blurb:
    "A Virtual Chassis campus stack: three EX4300s cabled together through their built-in 40 gigabit QSFP+ ports so they run as one logical switch with one configuration file. 144 access ports, one management IP, and a failure domain you can reason about. Every port count is Juniper's published figure.",
  height: 12,

  devices: [
    {
      id: "patch-a",
      u: 1,
      vendor: "Generic",
      model: "48-port keystone patch panel",
      role: "Two rack units of horizontal cabling condensed into one 48-position field, feeding the primary member below. Forty runs are punched down and eight positions are open.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 40, (n) => `A${pad2(n)}`),
        ...passive("blank", 8, (n) => `A${pad2(n + 40)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "ex4300-vc0",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T (Virtual Chassis member 0, primary)",
      role: "The primary member: it holds the configuration, runs the routing engine for the whole stack, and every other member takes its state from here. 48 built-in 10/100/1000BASE-T access ports and four built-in 40GbE QSFP+ ports, of which two are cabled into the Virtual Chassis ring and two go uplink.",
      family: "switch",
      finish: "dark",
      groupsOf: 6,
      // 48x 10/100/1000BASE-T plus 4x QSFP+ is the published built-in
      // layout for the EX4300-48T. Two QSFP+ carry the VC ring, one is the
      // uplink to the core, one is spare.
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 40),
        { kind: "qsfp", label: "VCP 0", led: "blue", activity: 0.71 },
        { kind: "qsfp", label: "VCP 1", led: "blue", activity: 0.64 },
        { kind: "qsfp", label: "et-0/1/2 uplink", led: "green", activity: 0.55 },
        { kind: "qsfp", label: "et-0/1/3", led: "off" },
      ],
      // Juniper publishes 350W, 715W and 1100W AC supply options for this
      // line, not the switch's own draw. A supply rating is not a
      // consumption figure, so nothing is quoted here.
      watts: null,
      leds: ["green", "green", "off"],
      accent: ACCENT.primary,
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-line-of-ethernet-switches-datasheet.html",
    },
    {
      id: "ex4300-vc1",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T (Virtual Chassis member 1)",
      role: "A member, not a peer: it has no configuration of its own. Its ports appear to the network engineer as ge-1/0/x on the primary, which is the whole point of Virtual Chassis. Pull it out and the stack keeps forwarding.",
      family: "switch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 48, (n) => `ge-1/0/${n - 1}`, 31),
        { kind: "qsfp", label: "VCP 0", led: "blue", activity: 0.71 },
        { kind: "qsfp", label: "VCP 1", led: "blue", activity: 0.48 },
        { kind: "qsfp", label: "et-1/1/2", led: "off" },
        { kind: "qsfp", label: "et-1/1/3", led: "off" },
      ],
      watts: null,
      leds: ["green", "off", "off"],
      accent: ACCENT.member,
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-line-of-ethernet-switches-datasheet.html",
    },
    {
      id: "ex4300-vc2",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T (Virtual Chassis member 2)",
      role: "The third member, closing the VC ring back to member 0. A ring rather than a chain matters: any single cable or member can fail and the remaining switches still have a path to the primary.",
      family: "switch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 48, (n) => `ge-2/0/${n - 1}`, 22),
        { kind: "qsfp", label: "VCP 0", led: "blue", activity: 0.48 },
        { kind: "qsfp", label: "VCP 1", led: "blue", activity: 0.64 },
        { kind: "qsfp", label: "et-2/1/2", led: "off" },
        { kind: "qsfp", label: "et-2/1/3", led: "off" },
      ],
      watts: null,
      leds: ["green", "off", "off"],
      accent: ACCENT.member,
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-line-of-ethernet-switches-datasheet.html",
    },
    {
      id: "mgr-1",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Between the patch field and the stack, where 144 access ports worth of patch leads have to turn a corner without becoming a mat.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "patch-b",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel",
      role: "The second floor's runs, feeding members 1 and 2. Sixteen terminated, eight open for growth.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 16, (n) => `B${pad2(n)}`),
        ...passive("blank", 8, (n) => `B${pad2(n + 16)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "blank-1",
      u: 2,
      vendor: "Generic",
      model: "2U vented blanking panel",
      role: "Growth space for a fourth member, closed off so cooling air goes through the stack rather than around it.",
      family: "blank",
      look: "vented",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 12x C13",
      role: "Twelve IEC C13 outlets on a switched, metered strip. With three switches each able to take a 1100W supply, per-outlet metering is how you find out what the stack actually draws rather than what its supplies are rated for.",
      family: "pdu",
      finish: "black",
      ports: run("power", 12, (n) => `C13-${n}`, 6),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "ups",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Line-interactive UPS, 1500VA at 120V. Sized for ride-through and clean shutdown, not for running a three-switch stack through a long outage; that is a generator's job.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "off", "off"],
      watts: null,
      accent: ACCENT.power,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
    {
      id: "blank-2",
      u: 1,
      vendor: "Generic",
      model: "1U blanking panel",
      role: "The bottom of the rack, closed off below the UPS. One unit, not two: everything above it already accounts for eleven of the frame's twelve, and a rack whose contents add up to more than it is tall is a drawing of a rack that cannot be built.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
  ],

  sources: [
    {
      label: "Juniper datasheet: EX4300 line of Ethernet switches",
      url: "https://www.juniper.net/us/en/products/switches/ex-series/ex4300-line-of-ethernet-switches-datasheet.html",
    },
    {
      label: "Juniper: EX4300 system overview and hardware guide",
      url: "https://www.juniper.net/documentation/us/en/hardware/ex4300/topics/topic-map/ex4300-system-overview.html",
    },
    {
      label: "APC product page: Smart-UPS SMT1500RM2U",
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],
};
