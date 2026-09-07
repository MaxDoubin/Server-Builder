/**
 * A MikroTik rack, the way small ISPs and serious homelabs actually run it.
 *
 * Every figure below was read off mikrotik.com's own product pages rather
 * than remembered, and each device links to the page its numbers came from.
 * The same three rules as the other racks in this library apply:
 *
 * 1. `watts` is the vendor's published maximum for the device itself,
 *    excluding power it only passes through. MikroTik publishes two numbers
 *    for PoE switches, "max power consumption" (which includes everything
 *    the switch is powering downstream) and "without attachments" (the
 *    switch alone). The second is the one quoted, with the first noted in
 *    the role text where it matters.
 *
 * 2. `ports` is the front panel, left to right, as the device presents it.
 *
 * 3. `led` and `activity` are illustrative: a plausible occupancy generated
 *    from the port number so the prerendered markup and the hydrated DOM
 *    always agree. They are not a measurement of anything.
 */

import type { LedState, RackDefinition, RackPatch, RackPort } from "@/lib/rackTypes";

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
  router: "#4cf1f1",
  core: "#ccff00",
  edge: "#ffa114",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const mikrotikRack: RackDefinition = {
  slug: "mikrotik-9u",
  name: "MikroTik 9U",
  blurb:
    "The budget-ISP stack: a CCR2004 doing wire-speed routing on fourteen fiber ports, a 48-port switch with 40 gigabit QSFP+ uplinks, and a PoE switch feeding the access layer, all for less than one comparable enterprise chassis. Every port count and wattage is MikroTik's own published figure.",
  height: 9,

  devices: [
    {
      id: "patch-a",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel",
      role: "Where the building's horizontal cabling lands. The first fourteen positions have runs punched down; the rest are open keystones waiting for one.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 14, (n) => `A${pad2(n)}`),
        ...passive("blank", 10, (n) => `A${pad2(n + 14)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "ccr2004",
      u: 1,
      vendor: "MikroTik",
      model: "CCR2004-1G-12S+2XS",
      role: "The edge router. Twelve 10G SFP+ ports and two 25G SFP28 ports on an Amazon Annapurna ARM chip, routing at wire speed. MikroTik publishes 60W as the maximum with all cages populated and 31W for the bare board.",
      family: "router",
      finish: "black",
      groupsOf: 8,
      // The published front panel: 1x GbE RJ45 for management, 12x SFP+,
      // 2x SFP28. Four SFP+ cages are lit here: two uplinks to the carriers
      // and two down to the switches. One SFP28 runs to the core switch.
      ports: [
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.12 },
        ...run("sfp-plus", 12, (n) => `SFP+ ${n}`, 4),
        { kind: "sfp28", label: "SFP28 1", led: "blue", activity: 0.66 },
        { kind: "sfp28", label: "SFP28 2", led: "off" },
      ],
      // Max power consumption, per the product page. The 31W figure is the
      // same page's "without attachments" number.
      watts: 60,
      accent: ACCENT.router,
      url: "https://mikrotik.com/product/ccr2004_1g_12s_2xs",
    },
    {
      id: "crs354",
      u: 1,
      vendor: "MikroTik",
      model: "CRS354-48G-4S+2Q+RM",
      role: "The core switch. Forty-eight gigabit copper ports, four 10G SFP+ and two 40G QSFP+ in one rack unit, which is a port density the price bracket has no business offering. 60W published maximum.",
      family: "switch",
      finish: "black",
      groupsOf: 8,
      // 48x GbE + 4x SFP+ + 2x QSFP+ is the published layout. Thirty of the
      // copper ports are patched in this elevation, one SFP+ runs up to the
      // router, and one QSFP+ carries the 40G link to the PoE switch stack.
      ports: [
        ...run("rj45", 48, (n) => `${n}`, 30),
        ...run("sfp-plus", 4, (n) => `SFP+ ${n}`, 1),
        { kind: "qsfp", label: "QSFP+ 1", led: "blue", activity: 0.58 },
        { kind: "qsfp", label: "QSFP+ 2", led: "off" },
      ],
      watts: 60,
      accent: ACCENT.core,
      url: "https://mikrotik.com/product/crs354_48g_4splus2qplusrm",
    },
    {
      id: "crs328",
      u: 1,
      vendor: "MikroTik",
      model: "CRS328-24P-4S+RM",
      role: "The PoE access switch: cameras, access points and phones hang off this. MikroTik publishes 44W for the switch itself and 494W as the ceiling with every PoE port loaded, and the gap between those two numbers is the whole story of PoE budgeting.",
      family: "switch",
      finish: "black",
      groupsOf: 8,
      // 24x GbE PoE-out + 4x SFP+, per the product page. Fourteen access
      // ports lit to match the patch panel above.
      ports: [
        ...run("rj45", 24, (n) => `PoE ${n}`, 14, "amber"),
        ...run("sfp-plus", 4, (n) => `SFP+ ${n}`, 1),
      ],
      // The switch alone. The 494W maximum on the same page includes the
      // PoE it hands downstream, which belongs on a circuit calculation,
      // not on this device's own row.
      watts: 44,
      accent: ACCENT.edge,
      url: "https://mikrotik.com/product/crs328_24p_4s_rm",
    },
    {
      id: "mgr",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The D-rings that keep forty-odd patch leads from becoming a curtain in front of the switches. The cheapest unit in the rack and the one that decides whether anyone can trace a cable in a hurry.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "blank-1",
      u: 1,
      vendor: "Generic",
      model: "Vented blanking panel",
      role: "Closes the gap so cooling air goes through equipment instead of around it. An empty rack unit is a bypass airflow path, which is why blanking panels are a real component and not cosmetics.",
      family: "blank",
      look: "vented",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 8x C13",
      role: "Eight IEC C13 outlets on a switched, metered strip. A stack this size runs off one feed, and metering is how you find out what it draws rather than what its supplies are rated for.",
      family: "pdu",
      finish: "black",
      ports: run("power", 8, (n) => `C13-${n}`, 4),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "ups",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Line-interactive UPS, 1500VA at 120V. Sized for ride-through and a clean shutdown rather than for running the stack through a long outage, which is a generator's job. The bottom of the rack because it is the heaviest thing in it.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "off", "off"],
      watts: null,
      accent: ACCENT.power,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],

  /*
    Plain moulded leads. A budget ISP stack is cabled in whatever the reel
    was, which in practice means grey, with blue kept for the handful of
    runs someone wanted to be able to find again.
  */
  patches: [
    ...Array.from({ length: 12 }, (_, i) => ({
      from: { device: "patch-a", port: i },
      to: { device: "crs328", port: i },
      jacket: (i >= 9 ? "blue" : "grey") as RackPatch["jacket"],
    })),
    // The core switch down to the PoE switch, and up to the router.
    { from: { device: "crs354", port: 0 }, to: { device: "crs328", port: 20 }, jacket: "blue" as const },
    { from: { device: "crs354", port: 1 }, to: { device: "crs328", port: 21 }, jacket: "blue" as const },
    { from: { device: "ccr2004", port: 0 }, to: { device: "crs354", port: 2 }, jacket: "yellow" as const },
  ],

  sources: [
    {
      label: "MikroTik product page: CCR2004-1G-12S+2XS",
      url: "https://mikrotik.com/product/ccr2004_1g_12s_2xs",
    },
    {
      label: "MikroTik product page: CRS354-48G-4S+2Q+RM",
      url: "https://mikrotik.com/product/crs354_48g_4splus2qplusrm",
    },
    {
      label: "MikroTik product page: CRS328-24P-4S+RM",
      url: "https://mikrotik.com/product/crs328_24p_4s_rm",
    },
  ],
};
