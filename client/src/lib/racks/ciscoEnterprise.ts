/**
 * A full 42U Cisco enterprise rack, from access layer to compute.
 *
 * The Catalyst closet elsewhere in this library is a wiring closet: one
 * router, two switches and a UPS. This is the other end of the same
 * catalogue, and the point of drawing it is that Cisco's range is not one
 * shape repeated. In here there is a six rack unit modular chassis whose
 * line cards slide in horizontally, a six rack unit blade chassis with no
 * ports on its face at all, switches with no copper on them anywhere, and
 * servers whose entire front is drive carriers.
 *
 * Every rack unit height is Cisco's published figure, cited per device.
 * The 9404R is 6RU and the UCS 5108 is 6RU with eight half-width bays over
 * four front-accessible supplies; neither is an estimate.
 *
 * One rule runs through all of it: Cisco publish power supply ratings and
 * PoE budgets, not what a device draws. A 715W supply is not a 715W
 * switch, so `watts` is null on every powered device here, which renders
 * as "not published", which is true.
 */

import type { LedState, RackDefinition, RackDevice, RackPatch, RackPort } from "@/lib/rackTypes";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const activityFor = (n: number): number => Math.round((((n * 37) % 61) / 60) * 100) / 100;

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

function passive(kind: RackPort["kind"], count: number, label: (n: number) => string): RackPort[] {
  return Array.from({ length: count }, (_, i): RackPort => ({ kind, label: label(i + 1) }));
}

const ACCENT = {
  access: "#ffa114",
  core: "#ccff00",
  spine: "#4cf1f1",
  edge: "#7c9cff",
  compute: "#4ef08a",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

const blank = (id: string, u: number, role: string, look: RackDevice["look"] = "vented"): RackDevice => ({
  id,
  u,
  vendor: "Generic",
  model: u === 1 ? "Vented blanking panel" : `${u}U vented blanking panel`,
  role,
  family: "blank",
  look,
  watts: null,
  accent: ACCENT.passive,
});

export const ciscoEnterpriseRack: RackDefinition = {
  slug: "cisco-enterprise-42u",
  name: "Cisco Enterprise 42U",
  blurb:
    "A full height Cisco rack, drawn to show how little of the range looks alike. A modular chassis whose line cards slide in horizontally, a blade chassis with no ports on its face, core and spine switches with no copper anywhere on them, and rack servers that are nothing but drive carriers. The wiring closet elsewhere in this library is the same vendor and a completely different object.",
  height: 42,

  devices: [
    {
      id: "PATCH_PANEL_A",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel A",
      role: "Positions A01 to A24, cross-connected to the 9300 below. In a tidy rack the panel position and the wall jack number match, which is the whole trick to tracing a drop in seconds.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: passive("rj45", 24, (n) => `A${pad2(n)}`),
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "C9300_48P",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9300-48P with C9300-NM-8X uplink module",
      role: "The access switch: 48 PoE+ ports for desks, phones, cameras and access points, in the two rows a dense copper panel uses, with the modular bay at the far right carrying eight 10G SFP+ uplinks. The beacon and UID button sit at the far left, then the status LEDs, then the console. That block is on every switch in the family and it is how you identify one across a room.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      groupsOf: 6,
      moduleBay: true,
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 48, (n) => `${n}`, 40, "amber"),
        ...run("sfp-plus", 8, (n) => `TE${n}`, 4, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html",
    },
    {
      id: "PATCH_PANEL_B",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel B",
      role: "Positions B01 to B24 for the second tray. Fourteen are punched down; the open keystones are capacity for the next reshuffle, which is cheaper to buy now than to retrofit later.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 14, (n) => `B${pad2(n)}`),
        ...passive("blank", 10, (n) => `B${pad2(n + 14)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "C9300_24P",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9300-24P with C9300-NM-4G uplink module",
      role: "The overflow switch: 24 PoE+ ports in a single row, with four gigabit SFP uplinks in the module bay. Half the port count of its neighbour and the same everything else, which is how a rack grows without a forklift.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      groupsOf: 6,
      singleRow: true,
      moduleBay: true,
      ports: [
        { kind: "console", label: "CON", led: "off" },
        ...run("rj45", 24, (n) => `${n}`, 14, "amber"),
        ...run("sfp", 4, (n) => `G${n}`, 1),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "One rack unit of D-rings between the access switches and the core. The difference between this rack and a bad one is mostly this panel.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "C9500_48Y4C",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9500-48Y4C",
      role: "The core, and there is no copper on it anywhere: 48 SFP28 cages at 25G and four QSFP28 at 100G. Everything in this rack that matters converges here over fibre, and the absence of a single RJ45 is the fastest way to tell a core switch from an access switch at a glance.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      ports: [
        ...run("sfp28", 48, (n) => `Y${n}`, 34, "blue"),
        ...run("qsfp", 4, (n) => `C${n}`, 2, "blue"),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9500-series-switches/nb-06-cat9500-ser-data-sheet-cte-en.html",
    },
    {
      id: "NEXUS_9336C",
      u: 1,
      vendor: "Cisco",
      model: "Nexus 9336C-FX2",
      role: "The spine: 36 QSFP28 cages, every one of them 100G, in a black chassis rather than Catalyst grey. Nexus is the data centre line and it is meant to look like a different company's product, which is a real thing to learn from a rack.",
      family: "switch",
      finish: "black",
      ports: run("qsfp", 36, (n) => `E1/${n}`, 22, "blue"),
      watts: null,
      accent: ACCENT.spine,
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/nexus-9000-series-switches/datasheet-c78-742284.html",
    },
    {
      id: "CABLE_MANAGER_MID",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, below the spine, keeping the fibre runs off the copper ones. Fibre has a real minimum bend radius and a manager is how you respect it.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "C9404R",
      cards: true,
      u: 6,
      vendor: "Cisco",
      model: "Catalyst 9404R modular chassis",
      role: "Six rack units of modular switch: four horizontal slots, the middle two reserved for supervisor engines and the outer two for line cards, over a power bay with its own supplies and fans. This is the shape that makes a rack read as Cisco. When a line card dies you pull one card, not one switch.",
      family: "switch",
      finish: "light",
      portTint: "#1c6f6a",
      groupsOf: 6,
      ports: [
        ...run("rj45", 24, (n) => `1/${n}`, 16, "amber"),
        ...run("sfp-plus", 4, (n) => `SUP${n}`, 2, "blue"),
        ...run("rj45", 24, (n) => `4/${n}`, 16, "amber"),
      ],
      watts: null,
      accent: ACCENT.core,
      url: "https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9400/hardware/install/b_c9400_hig/b_c9400_hig_chapter_0110.html",
    },
    {
      id: "ASR_1001X",
      u: 1,
      vendor: "Cisco",
      model: "ASR 1001-X",
      role: "The WAN aggregation router. Six SFP ports and built-in gigabit copper, sized for a campus handoff rather than a branch office.",
      family: "router",
      finish: "light",
      portTint: "#1c6f6a",
      ports: [...run("sfp", 6, (n) => `G0/0/${n - 1}`, 3), ...run("rj45", 2, (n) => `MGMT${n}`, 1)],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/asr-1000-series-aggregation-services-routers/datasheet-c78-731640.html",
    },
    {
      id: "ISR_4451X",
      u: 2,
      vendor: "Cisco",
      model: "ISR 4451-X",
      role: "The branch router: onboard gigabit copper and SFP across the top, and four NIM bays along the bottom for whatever the carrier hands over. Two are populated and two are blanked, which is what a router looks like a year after it was specified.",
      family: "router",
      finish: "light",
      portTint: "#1c6f6a",
      ports: [
        ...run("rj45", 4, (n) => `GE0/0/${n - 1}`, 2),
        ...run("sfp", 4, (n) => `SFP${n}`, 2),
        ...run("rj45", 8, (n) => `NIM${n}`, 4),
      ],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html",
    },
    {
      id: "FIREPOWER_2140",
      u: 1,
      vendor: "Cisco",
      model: "Firepower 2140",
      role: "The firewall, between the routers and everything else. Twelve copper interfaces and four SFP+, in the same near-black as the Nexus rather than Catalyst grey.",
      family: "firewall",
      finish: "black",
      ports: [...run("rj45", 12, (n) => `E1/${n}`, 6), ...run("sfp-plus", 4, (n) => `E1/${n + 12}`, 2, "blue")],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/security/firepower-2100-series/datasheet-c78-742473.html",
    },
    blank("BLANK_MID", 1, "Closes the gap so cooling air goes through equipment instead of around it."),
    {
      id: "BLANK_MID",
      u: 1,
      vendor: "Generic",
      model: "1U blanking panel",
      role: "One unit between the firewall and the blade chassis, closing the gap so the chassis breathes room air rather than the exhaust of the box above it.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "UCS_5108",
      u: 6,
      vendor: "Cisco",
      model: "UCS 5108 blade server chassis",
      role: "Six rack units carrying eight half-width blade servers over four hot-swappable supplies, all reachable from the front. A blade chassis is the densest compute in the rack and the least like anything else in it: no network ports on the front at all, just servers and power.",
      family: "server",
      finish: "dark",
      bays: { count: 8, occupied: 8, label: "half-width blade bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-5100-series-blade-server-chassis/data_sheet_c78-526830.html",
    },
    {
      id: "UCS_C240",
      u: 2,
      vendor: "Cisco",
      model: "UCS C240 rack server",
      role: "Two rack units of storage-dense compute: twenty four small form factor bays in a three by eight grid, with the control panel and KVM on the right. Where a blade gives you density, this gives you spindles.",
      family: "server",
      finish: "dark",
      bays: { count: 24, occupied: 18, label: "2.5 inch bays", rows: 3 },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/servers-unified-computing/ucs-c240-m7-rack-server/index.html",
    },
    {
      id: "UCS_C220_A",
      u: 1,
      vendor: "Cisco",
      model: "UCS C220 rack server",
      role: "One rack unit, ten small form factor bays in a single row. The general purpose workhorse: virtualisation hosts, controllers, anything that needs cores rather than disks.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 8, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/servers-unified-computing/ucs-c220-m7-rack-server/index.html",
    },
    {
      id: "UCS_C220_B",
      u: 1,
      vendor: "Cisco",
      model: "UCS C220 rack server",
      role: "The second node. Two identical servers rather than one large one is how a cluster survives losing a server, and it is the cheapest redundancy in the rack.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 8, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/servers-unified-computing/ucs-c220-m7-rack-server/index.html",
    },
    blank("BLANK_LOWER", 2, "Reserved space for the next compute node, covered until it arrives."),
    {
      id: "BLANK_LOWER",
      u: 2,
      vendor: "Generic",
      model: "2U blanking panel",
      role: "Two units under the rack servers. The compute block above breathes hard, and every open unit beside it is a short circuit back to its own intake.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "BLANK_BASE",
      u: 5,
      vendor: "Generic",
      model: "5U blanking panel",
      role: "An open rack unit is not neutral. Hot exhaust from behind the rack turns straight through the gap and into the intake of whatever sits above it, so the machine breathes its own waste heat. Solid is the point: a vented panel is a different product for a different problem.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CISCO_PDU",
      u: 2,
      vendor: "Generic",
      model: "Switched rack PDU, 16 outlets",
      role: "Mains distribution with per-outlet switching. Being able to power cycle one outlet remotely is the difference between a five minute fix and a drive to site.",
      family: "pdu",
      finish: "black",
      display: "ups",
      ports: passive("power", 16, (n) => `${pad2(n)}`),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "CISCO_UPS",
      u: 4,
      vendor: "Generic",
      model: "Rack UPS with external battery tray",
      role: "Four rack units of ride-through: the electronics above, the battery tray below with its own handle, because the battery is the part that gets replaced. Its draw depends entirely on the load it carries, so no single consumption figure would be honest here.",
      family: "ups",
      finish: "black",
      display: "ups",
      leds: ["green", "green", "off"],
      watts: null,
      accent: ACCENT.power,
    },
    blank("BLANK_BASE", 5, "Five rack units at the bottom left open. Air enters here, and a rack filled to the floor starves itself.", "vented"),
  ],

  /*
    Patch leads. Blue for ordinary data, yellow for the voice VLAN. The
    9300's port array starts with its console, so copper port n is index n.
  */
  patches: [
    ...Array.from({ length: 24 }, (_, i) => ({
      from: { device: "PATCH_PANEL_A", port: i },
      to: { device: "C9300_48P", port: i + 1 },
      jacket: (i >= 18 ? "yellow" : "blue") as RackPatch["jacket"],
    })),
    ...Array.from({ length: 14 }, (_, i) => ({
      from: { device: "PATCH_PANEL_B", port: i },
      to: { device: "C9300_24P", port: i + 1 },
      jacket: "grey" as const,
    })),
  ],

  sources: [
    {
      label: "Cisco datasheet: Catalyst 9300 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html",
    },
    {
      label: "Cisco datasheet: Catalyst 9500 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9500-series-switches/nb-06-cat9500-ser-data-sheet-cte-en.html",
    },
    {
      label: "Cisco hardware guide: Catalyst 9400 chassis specifications (9404R is 6RU)",
      url: "https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9400/hardware/install/b_c9400_hig/b_c9400_hig_chapter_0110.html",
    },
    {
      label: "Cisco hardware guide: Catalyst 9300 product overview (front panel layout)",
      url: "https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/hardware/install/b_c9300_hig/Product-overview.html",
    },
    {
      label: "Cisco datasheet: Nexus 9300-FX2 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/switches/nexus-9000-series-switches/datasheet-c78-742284.html",
    },
    {
      label: "Cisco datasheet: UCS 5100 Series Blade Server Chassis (5108 is 6RU)",
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-5100-series-blade-server-chassis/data_sheet_c78-526830.html",
    },
    {
      label: "Cisco datasheet: ASR 1000 Series Aggregation Services Routers",
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/asr-1000-series-aggregation-services-routers/datasheet-c78-731640.html",
    },
    {
      label: "Cisco datasheet: Firepower 2100 Series",
      url: "https://www.cisco.com/c/en/us/products/collateral/security/firepower-2100-series/datasheet-c78-742473.html",
    },
  ],
};
