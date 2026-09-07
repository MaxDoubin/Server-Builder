/**
 * A Cisco access closet, the rack behind most office wall jacks on earth.
 *
 * Every port count below was read off Cisco's own datasheets, and each
 * device links to the datasheet its numbers came from. The same three rules
 * as the other racks in this library apply, with one Cisco-specific note on
 * power: Cisco publishes power supply ratings (715W AC, 125W AC) and PoE
 * budgets, not the switch's own draw, so `watts` is null on every powered
 * device here. Null renders as "not published", which is true; quoting a
 * PSU rating as consumption would overstate the draw several times over.
 *
 * One drawing convention worth stating: the ISR router's network ports are
 * physically on its rear, and in a network rack it is mounted with that side
 * facing the patching, so this elevation shows every device from its port
 * side. That is how network closets are actually documented.
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

export const ciscoRack: RackDefinition = {
  slug: "catalyst-12u",
  name: "Cisco Catalyst 12U",
  blurb:
    "An enterprise access closet as Cisco ships it: an ISR at the top for the WAN, a 48-port PoE+ Catalyst 9300 feeding the desks, a 9200L for the quiet corners, and every switch port mirrored by a patch panel position above it. This is the rack behind most office wall jacks in the world.",
  height: 12,

  devices: [
    {
      id: "patch-a",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel A",
      role: "Positions A01 to A24, cross-connected to the top row of the 9300 below. In a tidy closet the patch panel position number and the wall jack number match, which is the whole trick to tracing a drop in seconds.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: passive("rj45", 24, (n) => `A${pad2(n)}`),
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "c9300-48p",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9300-48P with C9300-NM-8X uplink module",
      role: "The access switch doing the heavy lifting: 48 PoE+ ports for desks, phones, cameras and access points, with the modular bay carrying an 8-port 10G SFP+ uplink module. The datasheet's default 715W power supply leaves a 437W PoE budget, and dividing that by loaded access points is a real capacity exercise.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      groupsOf: 6,
      moduleBay: true,
      // 48x 1G PoE+ copper plus the NM-8X module's 8x 10G SFP+ is the
      // published layout for this configuration; the RJ45 console lives on
      // the switch face. Thirty-four access ports lit, two uplinks in use.
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 48, (n) => `${n}`, 34, "amber"),
        ...run("sfp-plus", 8, (n) => `TE${n}`, 2, "blue"),
      ],
      // Cisco publishes the PSU rating (715W) and the PoE budget (437W),
      // not the switch's own consumption, so this stays null rather than
      // quoting a supply rating as a draw.
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html",
    },
    {
      id: "patch-b",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel B",
      role: "Positions B01 to B24 for the second cable tray. Ten runs are punched down; the open keystones are capacity for the next office reshuffle, which is cheaper to buy now than to retrofit later.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 10, (n) => `B${pad2(n)}`),
        ...passive("blank", 14, (n) => `B${pad2(n + 10)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "c9200l",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9200L-24T-4G",
      role: "The overflow switch: 24 non-PoE data ports with four fixed gigabit SFP uplinks, for the printers, lab machines and wall clocks that neither need power nor justify a 9300 port. The L means the uplinks are fixed rather than modular, which is the price cut.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      groupsOf: 6,
      // 24x 1G data plus 4x 1G fixed SFP uplinks is the published layout.
      ports: [
        ...run("rj45", 24, (n) => `${n}`, 9),
        ...run("sfp", 4, (n) => `G${n}`, 1),
      ],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9200-series-switches/nb-06-cat9200-ser-data-sheet-cte-en.html",
    },
    {
      id: "mgr",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "One rack unit of D-rings between the switches and the router, so the patch leads run in combed bundles instead of a curtain. The difference between this closet and a bad one is mostly this panel.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "isr4331",
      u: 1,
      vendor: "Cisco",
      model: "ISR 4331",
      role: "The WAN edge. Three gigabit copper ports and two SFP-based gigabit ports onboard, with NIM slots for whatever the carrier hands over. Shown from its port side, the side that faces the patching. Cisco publishes the 250W supply rating, not the router's own draw.",
      family: "router",
      finish: "light",
      portTint: "#1c6f6a",
      // The datasheet's onboard layout for the 4331 column: 3x 10/100/1000
      // copper and 2x SFP-based GE, plus the console. Combo pairs share, so
      // not every physical position runs at once.
      ports: [
        { kind: "console", label: "CON", led: "off" },
        { kind: "rj45", label: "GE0/0/0", led: "green", activity: 0.51 },
        { kind: "rj45", label: "GE0/0/1", led: "green", activity: 0.2 },
        { kind: "rj45", label: "GE0/0/2", led: "off" },
        { kind: "sfp", label: "SFP 1", led: "off" },
        { kind: "sfp", label: "SFP 2", led: "off" },
      ],
      watts: null,
      accent: ACCENT.router,
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html",
    },
    {
      id: "blank-1",
      u: 1,
      vendor: "Generic",
      model: "Vented blanking panel",
      role: "Closes the gap so cooling air goes through equipment instead of around it.",
      family: "blank",
      look: "vented",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "blank-2",
      u: 2,
      vendor: "Generic",
      model: "2U solid blanking panel",
      role: "Reserved space for the next switch, covered until it arrives.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 8x C13",
      role: "Eight metered outlets, above the UPS and below everything that draws from it. This rack had a UPS and nothing to distribute it: four switches and a router against the handful of sockets on the back of a 2U line-interactive unit is not a wiring plan, and metering is how you learn what a closet actually pulls rather than what its supplies are rated for.",
      family: "pdu",
      finish: "black",
      ports: run("power", 8, (n) => `C13-${n}`, 5),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "smt1500",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Line-interactive UPS, 1500VA at 120V, feeding six NEMA 5-15R outlets on its rear. The front is the status display. Its draw from the wall depends entirely on the load it carries, so no single consumption figure would be honest here.",
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
    Patch leads, colour coded the way an enterprise closet actually is:
    blue for ordinary data drops, yellow for the voice VLAN, red for the
    carrier handoff so nobody unplugs the WAN while chasing a desk port.
    Ordinary moulded boots, not Etherlighting, which is a UniFi part.

    The 9300's port array starts with its console, so copper port n is
    index n in that array.
  */
  patches: [
    ...Array.from({ length: 24 }, (_, i) => ({
      from: { device: "patch-a", port: i },
      to: { device: "c9300-48p", port: i + 1 },
      jacket: (i >= 18 ? "yellow" : "blue") as RackPatch["jacket"],
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      from: { device: "patch-b", port: i },
      to: { device: "c9200l", port: i },
      jacket: "grey" as const,
    })),
    // The carrier drop into the router, and the router into the core.
    { from: { device: "isr4331", port: 1 }, to: { device: "patch-a", port: 12 }, jacket: "red" as const },
    { from: { device: "isr4331", port: 2 }, to: { device: "c9300-48p", port: 21 }, jacket: "red" as const },
  ],

  sources: [
    {
      label: "Cisco datasheet: Catalyst 9300 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html",
    },
    {
      label: "Cisco datasheet: Catalyst 9200 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9200-series-switches/nb-06-cat9200-ser-data-sheet-cte-en.html",
    },
    {
      label: "Cisco datasheet: 4000 Series Integrated Services Routers",
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html",
    },
    {
      label: "APC product page: Smart-UPS SMT1500RM2U",
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],
};
