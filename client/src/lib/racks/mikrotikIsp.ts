/**
 * A 24U MikroTik ISP rack.
 *
 * Half the height of the enterprise racks on purpose. A 42U cabinet is a
 * data centre object, and a great deal of MikroTik is deployed in a wall
 * cabinet at the bottom of a tower or in the back of a shop. Drawing this
 * one at 42U would be the same mistake as drawing a UniFi studio frame as
 * a data centre cabinet.
 *
 * Three things in here exist nowhere else in the library, and they are
 * why it is worth drawing: a shelf with desktop units standing on it, a
 * tray with two half width devices side by side in one rack unit, and an
 * optical distribution frame where the fibre from outside terminates.
 *
 * Port counts are MikroTik's published figures, cited per device. Unlike
 * the enterprise vendors MikroTik do publish maximum power consumption,
 * so the figures here are real numbers rather than nulls.
 */

import type { LedState, RackDefinition, RackPatch, RackPort } from "@/lib/rackTypes";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const activityFor = (n: number): number => Math.round((((n * 29) % 53) / 52) * 100) / 100;

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

const passive = (kind: RackPort["kind"], count: number, label: (n: number) => string): RackPort[] =>
  Array.from({ length: count }, (_, i): RackPort => ({ kind, label: label(i + 1) }));

const ACCENT = {
  access: "#ffa114",
  core: "#4cf1f1",
  edge: "#ccff00",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const mikrotikIspRack: RackDefinition = {
  slug: "mikrotik-isp-24u",
  name: "MikroTik ISP 24U",
  blurb:
    "What a wireless ISP actually runs, and half the height of a data centre cabinet because that is how it is deployed. Three things in here are in no other rack in this library: a shelf of desktop units that have no rack ears at all, a tray with two half width devices side by side in one unit, and an optical distribution frame where the fibre from outside lands. MikroTik also publish real power consumption figures rather than supply ratings, so the numbers on this page are draw rather than capacity.",
  height: 24,

  devices: [
    {
      id: "PATCH_PANEL_A",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel A",
      role: "Where the building's copper lands. On a tower site this is where the runs from the sectors come in.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: passive("rj45", 24, (n) => `A${pad2(n)}`),
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CRS354_48G",
      u: 1,
      vendor: "MikroTik",
      model: "CRS354-48G-4S+2Q+RM",
      role: "The access switch: 48 gigabit copper ports in two rows, four 10G SFP+ and two 40G QSFP+. This is the box that makes MikroTik what it is, because nothing else at this port count is priced anywhere near it.",
      family: "switch",
      finish: "black",
      groupsOf: 6,
      ports: [
        ...run("rj45", 48, (n) => `ether${n}`, 40),
        ...run("sfp-plus", 4, (n) => `sfp-sfpplus${n}`, 2, "blue"),
        ...run("qsfp", 2, (n) => `qsfpplus${n}-1`, 1, "blue"),
      ],
      watts: 55,
      accent: ACCENT.access,
      url: "https://mikrotik.com/product/crs354_48g_4splus2qplusrm",
    },
    {
      id: "PATCH_PANEL_B",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel B",
      role: "The second field, sixteen punched down. On a growing site the open positions get used within the year.",
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
      id: "CRS326_24G",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24G-2S+RM",
      role: "Twenty four gigabit ports in a single row with two SFP+ uplinks, and a small display on the right. The single row is a MikroTik habit: at 24 ports it fits across the panel and it is easier to count along than a stacked pair.",
      family: "switch",
      finish: "black",
      groupsOf: 6,
      singleRow: true,
      display: "unifi",
      ports: [...run("rj45", 24, (n) => `ether${n}`, 16), ...run("sfp-plus", 2, (n) => `sfp-sfpplus${n}`, 1, "blue")],
      watts: 17,
      accent: ACCENT.access,
      url: "https://mikrotik.com/product/crs326_24g_2splus_rm",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "D-rings between the access switches and the core.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CRS518_16XS",
      u: 1,
      vendor: "MikroTik",
      model: "CRS518-16XS-2XQ-RM",
      role: "The core switch: sixteen 25G SFP28 and two 100G QSFP28, and no copper on it anywhere. A hundred gigabit in a box this size at this price is the reason MikroTik turns up in places you would not expect it.",
      family: "switch",
      finish: "black",
      ports: [...run("sfp28", 16, (n) => `sfp28-${n}`, 11, "blue"), ...run("qsfp", 2, (n) => `qsfp28-${n}-1`, 1, "blue")],
      watts: 95,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/crs518_16xs_2xq",
    },
    {
      id: "CCR2216_12XS",
      u: 1,
      vendor: "MikroTik",
      model: "CCR2216-1G-12XS-2XQ",
      role: "The core router: one gigabit copper for management, twelve 25G SFP28 and two 100G QSFP28. Everything the ISP carries passes through this, and the single copper port is there only so you can reach it when the fibre side is broken.",
      family: "router",
      finish: "black",
      display: "unifi",
      ports: [
        ...run("rj45", 1, () => "ether1", 1),
        ...run("sfp28", 12, (n) => `sfp28-${n}`, 8, "blue"),
        ...run("qsfp", 2, (n) => `qsfp28-${n}-1`, 1, "blue"),
      ],
      watts: 126,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/ccr2216_1g_12xs_2xq",
    },
    {
      id: "CCR2004_12S",
      u: 1,
      vendor: "MikroTik",
      model: "CCR2004-1G-12S+2XS",
      role: "The edge router, facing the upstream transit providers. Twelve SFP+ and two 25G, sized for a site that peers rather than one that only consumes.",
      family: "router",
      finish: "black",
      display: "ups",
      ports: [
        ...run("rj45", 1, () => "ether1", 1),
        ...run("sfp-plus", 12, (n) => `sfp-sfpplus${n}`, 7, "blue"),
        ...run("sfp28", 2, (n) => `sfp28-${n}`, 2, "blue"),
      ],
      watts: 55,
      accent: ACCENT.edge,
      url: "https://mikrotik.com/product/ccr2004_1g_12s_2xs",
    },
    {
      id: "NETPOWER_16P",
      u: 1,
      vendor: "MikroTik",
      model: "netPower 16P",
      role: "Sixteen PoE-out ports feeding the radios on the tower. A wireless ISP's switch is mostly a power supply that also happens to switch, and everything it powers is somewhere cold and wet.",
      family: "switch",
      finish: "black",
      groupsOf: 8,
      singleRow: true,
      ports: [...run("rj45", 16, (n) => `ether${n}`, 10, "amber"), ...run("sfp-plus", 2, (n) => `sfp-sfpplus${n}`, 1, "blue")],
      watts: 25,
      accent: ACCENT.access,
      url: "https://mikrotik.com/product/netpower_16p",
    },
    {
      id: "DESKTOP_SHELF",
      u: 1,
      vendor: "Generic",
      model: "Vented shelf with desktop units",
      role: "A shelf, and the most honest thing in this library. Plenty of MikroTik has no rack ears, so it stands on a tray with its own rubber feet: an RB5009 in black metal, a hEX in white plastic, and a PoE injector. Anyone who has run a small network has this shelf, and no vendor's marketing photography has ever included one.",
      family: "blank",
      look: "shelf",
      finish: "dark",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "HALF_TRAY",
      u: 1,
      vendor: "MikroTik",
      model: "Two CRS310-1G-5S-4S+IN in a 1U tray",
      role: "Two half width switches side by side in one rack unit, which nothing else in this library does. When a device is narrower than a rack you either waste the other half or you fit two, and MikroTik sell the tray that lets you fit two.",
      family: "switch",
      finish: "black",
      ports: [
        ...run("sfp", 5, (n) => `A-sfp${n}`, 3, "blue"),
        ...run("rj45", 1, () => "A-ether1", 1),
        ...run("sfp", 5, (n) => `B-sfp${n}`, 3, "blue"),
        ...run("rj45", 1, () => "B-ether1", 1),
      ],
      watts: 26,
      accent: ACCENT.edge,
      url: "https://mikrotik.com/product/crs310_1g_5s_4s_in",
    },
    {
      id: "FIBRE_ODF",
      u: 2,
      vendor: "Generic",
      model: "24-position optical distribution frame",
      role: "Where the fibre from outside terminates. Twenty four duplex LC couplers over a splice drawer: the cable from the street is spliced to pigtails inside the drawer, and everything downstream patches to the couplers rather than to the cable itself. Nobody patches to a buried cable twice.",
      family: "patch",
      finish: "dark",
      ports: passive("sfp", 24, (n) => `LC${pad2(n)}`),
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CABLE_MANAGER_LOW",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, keeping the fibre patch leads off the power cabling below.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CCR2116_12G",
      u: 1,
      vendor: "MikroTik",
      model: "CCR2116-12G-4S+",
      role: "Sixteen ARM cores and the highest throughput router here below the CCR2216 above it, in a white case rather than a black one. MikroTik ship both and which case a product comes in is a fact about the product, not a styling choice: get it wrong and a rack of their hardware looks like one product line when it is four.",
      family: "router",
      finish: "light",
      ports: [
        ...run("sfp-plus", 4, (n) => `sfp-sfpplus${n}`, 2, "blue"),
        ...run("rj45", 12, (n) => `ether${n}`, 8),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/ccr2116_12g_4splus",
    },
    {
      id: "CCR2004_16G",
      u: 1,
      vendor: "MikroTik",
      model: "CCR2004-16G-2S+",
      role: "The customer aggregation router: sixteen copper handoffs in two rows and two fibre uplinks, with two power supplies behind them. Two of its four status lamps are power, one per supply, which is the tell for a box you can lose a feed on and keep.",
      family: "router",
      finish: "light",
      ports: [
        ...run("sfp-plus", 2, (n) => `sfp-sfpplus${n}`, 2, "blue"),
        ...run("rj45", 16, (n) => `ether${n}`, 12),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/ccr2004_16g_2splus",
    },
    {
      id: "CRS326_24S",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24S+2Q+RM",
      role: "The densest fibre in the rack: twenty four 10G cages in two rows of twelve, grouped in fours the way MikroTik number them, with two 40G uplinks beside them.",
      family: "switch",
      finish: "light",
      ports: [
        ...run("sfp-plus", 24, (n) => `sfp-sfpplus${n}`, 16, "blue"),
        ...run("qsfp", 2, (n) => `qsfpplus${n}-1`, 1, "blue"),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/crs326_24s_2q_rm",
    },
    {
      id: "CRS317_16S",
      u: 1,
      vendor: "MikroTik",
      model: "CRS317-1G-16S+RM",
      role: "Sixteen 10G cages in four groups of four, and the only copper on it is the gigabit port you boot and manage it through. A switch whose sole copper is the way in is a different animal from one with a copper front, and the grouping is what makes that readable across a room.",
      family: "switch",
      finish: "light",
      ports: [
        ...run("sfp-plus", 16, (n) => `sfp-sfpplus${n}`, 11, "blue"),
        ...run("rj45", 1, () => "ether1 boot", 1),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/crs317_1g_16s_rm",
    },
    {
      id: "CRS312_8XG",
      u: 1,
      vendor: "MikroTik",
      model: "CRS312-4C+8XG-RM",
      role: "The only 10G copper in the rack, which is the whole reason it is here: everything else at this speed is fibre, and a 10GBASE-T handoff is the one thing none of them can do. Four of its ports are combo, so each is either a copper port or a cage and never both at once.",
      family: "switch",
      finish: "dark",
      ports: [
        ...run("rj45", 8, (n) => `ether${n}`, 5),
        ...run("sfp-plus", 4, (n) => `combo${n}`, 2, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://mikrotik.com/product/crs312_4c_8xg_rm",
    },
    {
      id: "CRS328_24P",
      u: 1,
      vendor: "MikroTik",
      model: "CRS328-24P-4S+RM",
      role: "Twenty four ports that carry power, from one 500W supply with roughly 450W of it reaching the ports in three groups with their own budget. That number is what decides how many access points a switch like this can actually run, and it is not the port count.",
      family: "switch",
      finish: "light",
      ports: [
        ...run("rj45", 24, (n) => `ether${n}`, 16),
        ...run("sfp-plus", 4, (n) => `sfp-sfpplus${n}`, 2, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://mikrotik.com/product/crs328_24p_4s_rm",
    },
    {
      id: "RB4011_IGS",
      u: 1,
      vendor: "MikroTik",
      model: "RB4011iGS+RM",
      role: "One rack unit of space with thirty millimetres of router in it. Every other box here is a 44mm chassis that fills its unit; this is a desktop board with a pair of ears in the box, and MikroTik say exactly that: the ears fasten it in a standard 1U rack space. It takes the unit and leaves daylight above and below, which the 3D model draws and no rack elevation ever shows.",
      family: "router",
      finish: "dark",
      ports: [
        ...run("sfp-plus", 1, () => "sfp-sfpplus1", 1, "blue"),
        ...run("rj45", 10, (n) => `ether${n}`, 3),
      ],
      watts: null,
      accent: ACCENT.passive,
      url: "https://mikrotik.com/product/rb4011igs_rm",
    },
    {
      id: "MIKROTIK_PDU",
      u: 1,
      vendor: "Generic",
      model: "8-outlet rack PDU",
      role: "Eight outlets in one rack unit. A rack this size does not need sixteen, and the units above it draw a few hundred watts between them rather than a few thousand.",
      family: "pdu",
      finish: "dark",
      ports: passive("power", 8, (n) => `${pad2(n)}`),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "MIKROTIK_UPS",
      u: 2,
      vendor: "Generic",
      model: "Rack UPS, 1500VA",
      role: "Ride-through for a site that may be at the bottom of a tower with one feed. Its draw depends entirely on the load it carries, so no single consumption figure would be honest here.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "green", "off"],
      watts: null,
      accent: ACCENT.power,
    },
  ],

  patches: [
    ...Array.from({ length: 24 }, (_, i) => ({
      from: { device: "PATCH_PANEL_A", port: i },
      to: { device: "CRS354_48G", port: i },
      jacket: (i >= 18 ? "yellow" : "blue") as RackPatch["jacket"],
    })),
    ...Array.from({ length: 16 }, (_, i) => ({
      from: { device: "PATCH_PANEL_B", port: i },
      to: { device: "CRS326_24G", port: i },
      jacket: "grey" as const,
    })),
  ],

  sources: [
    { label: "MikroTik: CRS354-48G-4S+2Q+RM", url: "https://mikrotik.com/product/crs354_48g_4splus2qplusrm" },
    { label: "MikroTik: CRS326-24G-2S+RM", url: "https://mikrotik.com/product/crs326_24g_2splus_rm" },
    { label: "MikroTik: CRS518-16XS-2XQ-RM", url: "https://mikrotik.com/product/crs518_16xs_2xq" },
    { label: "MikroTik: CCR2216-1G-12XS-2XQ", url: "https://mikrotik.com/product/ccr2216_1g_12xs_2xq" },
    { label: "MikroTik: CCR2004-1G-12S+2XS", url: "https://mikrotik.com/product/ccr2004_1g_12s_2xs" },
    { label: "MikroTik: netPower 16P", url: "https://mikrotik.com/product/netpower_16p" },
    { label: "MikroTik: CRS310-1G-5S-4S+IN", url: "https://mikrotik.com/product/crs310_1g_5s_4s_in" },
  ],
};
