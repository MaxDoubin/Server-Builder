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

/**
 * The nine ports a fabric interconnect in this rack actually uses.
 *
 * Server ports take the low numbers and uplinks the high ones, which is
 * convention rather than a rule: four to the blade chassis I/O modules,
 * three to the rack servers under it, and two north to the spine. Ports 33
 * to 36 are the unified ones, and they are dark because nothing in this
 * rack speaks Fibre Channel; on a 6536 those four are the only ports that
 * could.
 */
function fabricPorts(): RackPort[] {
  const linked = new Set([1, 2, 3, 4, 5, 6, 7, 31, 32]);
  return Array.from({ length: 36 }, (_, i): RackPort => {
    const n = i + 1;
    const label = n > 32 ? `Eth1/${n} unified` : `Eth1/${n}`;
    return linked.has(n)
      ? { kind: "qsfp", label, led: "blue", activity: activityFor(n) }
      : { kind: "qsfp", label, led: "off" };
  });
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

const blank = (id: string, u: number, role: string, look: RackDevice["look"] = "solid"): RackDevice => ({
  id,
  u,
  vendor: "Generic",
  // Solid and vented are different products for different problems, and
  // the name has to say which one this is.
  model: look === "vented" ? `${u}U vented blanking panel` : `${u}U blanking panel`,
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
    {
      id: "SECURE_FW_3120",
      u: 1,
      vendor: "Cisco",
      model: "Secure Firewall 3120",
      role: "The current generation of the box above it. A 2140 and a 3120 in one rack is usually not redundancy, it is a migration: two generations of the same job running side by side while policy moves across, which is what most firewall replacements actually look like from the front.",
      family: "firewall",
      finish: "light",
      ports: [
        ...run("rj45", 8, (n) => `Ethernet1/${n}`, 5),
        ...run("sfp-plus", 8, (n) => `Ethernet1/${8 + n}`, 3, "blue"),
      ],
      watts: null,
      accent: ACCENT.edge,
      url: "https://www.cisco.com/c/en/us/products/collateral/security/firewalls/secure-firewall-3100-series-ds.html",
    },
    {
      id: "UCS_5108",
      u: 6,
      vendor: "Cisco",
      model: "UCS 5108 blade server chassis",
      role: "Six rack units carrying eight half-width blade servers over four hot-swappable supplies, all reachable from the front. A blade chassis is the densest compute in the rack and the least like anything else in it: no network ports on the front at all, just servers and power. The ports are round the back, on two fabric extenders, and they go to the pair of fabric interconnects three units down rather than to any switch in this rack.",
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
    {
      id: "UCS_6536_A",
      u: 1,
      vendor: "Cisco",
      model: "UCS 6536 Fabric Interconnect",
      role: "The half of the blade chassis that is not in the blade chassis. A UCS 5108 has a passive midplane and no embedded switch, and Cisco's datasheet says it has no need for independent management, so its I/O bays take fabric extenders and every blade's uplink terminates out here where UCS Manager runs. Those bays will also take a 6324, a fabric interconnect small enough to sit inside the chassis, which is the one configuration that needs nothing outside it. 36 QSFP28 in one rack unit, of which ports 33 to 36 are unified and can be Fibre Channel instead.",
      family: "switch",
      finish: "dark",
      ports: fabricPorts(),
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.html",
    },
    {
      id: "UCS_6536_B",
      u: 1,
      vendor: "Cisco",
      model: "UCS 6536 Fabric Interconnect",
      role: "The second of the pair, and identical to the first in every respect including the faceplate. The two are joined by their L1 and L2 ports, directly and to nothing else, and that link is how they elect which one is primary. Deploying one is possible and means the domain has a single point of failure that takes every blade with it.",
      family: "switch",
      finish: "dark",
      ports: fabricPorts(),
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.html",
    },
    {
      id: "UCS_C225",
      u: 1,
      vendor: "Cisco",
      model: "UCS C225 M8 rack server",
      role: "Single socket AMD compute beside the Intel C220s, and the only server in the rack you cannot see into: the same ten small form factor bays, behind a hinged perforated bezel rather than on show. Which vendors hide their drives is most of what separates two rack photographs.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 6, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c225-m8-rack-server-ds.html",
    },
    {
      id: "UCS_C245",
      u: 2,
      vendor: "Cisco",
      model: "UCS C245 M8 rack server",
      role: "Dual socket AMD in two rack units, with twenty four bays in a single row of carriers standing on edge. The C240 four units up also holds twenty four and looks nothing like it, which is what a real 2U front does rather than a tidy grid.",
      family: "server",
      finish: "dark",
      bays: { count: 24, occupied: 20, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c245-m8-rack-server-ds.html",
    },
    {
      id: "C9800_40",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9800-40 Wireless Controller",
      role: "The wireless control plane, which a rack full of Catalyst access switches otherwise does not have. It terminates up to 2,000 access points, and it is one rack unit: the 9800-80 is the 2RU one, and assuming a controller must be 2U is a common way to lose a unit on paper.",
      family: "switch",
      finish: "light",
      ports: [
        ...run("rj45", 2, (n) => (n === 1 ? "SP service" : "RP redundancy"), 1),
        ...run("sfp-plus", 4, (n) => `TenGigabitEthernet0/0/${n - 1}`, 2, "blue"),
      ],
      watts: null,
      accent: ACCENT.access,
      url: "https://www.cisco.com/c/en/us/td/docs/wireless/controller/9800/9800-40/installation-guide/b-wlc-ig-9800-40/overview.html",
    },
    {
      id: "C8300_CONSOLE",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 8300-1N1S-4T2X with a 16 port async module",
      role: "The console server, and the least glamorous box in the rack. With a 16 port async module in the NIM bay it reaches the serial port of every switch, firewall and PDU here, which is what you need on the day the network you would normally manage them over is the thing that has broken.",
      family: "router",
      finish: "light",
      ports: [
        ...run("rj45", 4, (n) => `GigabitEthernet0/0/${n - 1}`, 2),
        ...run("sfp-plus", 2, (n) => `TenGigabitEthernet0/0/${3 + n}`, 1, "blue"),
        ...passive("console", 16, (n) => `line 0/1/${n - 1}`),
      ],
      watts: null,
      accent: ACCENT.passive,
      url: "https://www.cisco.com/c/en/us/products/collateral/routers/catalyst-8300-series-edge-platforms/datasheet-c78-744088.html",
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
