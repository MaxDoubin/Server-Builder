/**
 * A 42U Dell compute rack.
 *
 * The one shape the rest of the library does not have. Every chassis
 * drawn so far stacks horizontally: Cisco's 9404R slides its line cards
 * in flat, the UCS 5108 lays its blades in two rows, Juniper's EX9204
 * does the same. The PowerEdge MX7000 stands its eight compute sleds on
 * end, and a wall of vertical sleds looks nothing like a stack of
 * horizontal ones from any angle.
 *
 * The drive bays are the other difference worth drawing. Cisco's C240
 * puts its carriers in a three by eight grid; a 2U PowerEdge stands
 * twenty four 2.5 inch drives upright in a single row across the whole
 * front, because a 2U opening is tall enough to take a drive on its edge
 * and that is the densest way to do it.
 *
 * `watts` is null throughout. Dell publish power supply ratings per
 * configuration, not what a given build draws, and a 1400W supply is not
 * a 1400W server.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

const activityFor = (n: number): number => Math.round((((n * 31) % 47) / 46) * 100) / 100;

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

const ACCENT = {
  fabric: "#4cf1f1",
  modular: "#ccff00",
  compute: "#4ef08a",
  storage: "#7c9cff",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const dellComputeRack: RackDefinition = {
  slug: "dell-compute-42u",
  name: "Dell Compute 42U",
  blurb:
    "A compute rack, and the only one in this library whose chassis stands its sleds on end. Every other modular box here stacks horizontally; the PowerEdge MX7000 fits eight compute sleds vertically across a 7U enclosure, which looks nothing like a stack of line cards from any angle. The rack servers below it show the other Dell habit: a 2U front is twenty four 2.5 inch drives stood upright in one row, not a grid, because a 2U opening is tall enough to take a drive on its edge.",
  height: 42,

  devices: [
    {
      id: "S5248F_A",
      u: 1,
      vendor: "Dell",
      model: "PowerSwitch S5248F-ON (top of rack A)",
      role: "Top of rack, and all fibre: 48 SFP28 at 25G to the servers below, four 100G QSFP28 to the spine. In a compute rack the switch is the first thing installed and the last thing anyone thinks about until it fails.",
      family: "switch",
      finish: "dark",
      ports: [...run("sfp28", 48, (n) => `Eth1/1/${n}`, 34, "blue"), ...run("qsfp", 4, (n) => `Eth1/1/${n + 48}`, 2, "blue")],
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
    {
      id: "S5248F_B",
      u: 1,
      vendor: "Dell",
      model: "PowerSwitch S5248F-ON (top of rack B)",
      role: "The paired switch. Every server below is dual homed across the two, so losing one switch costs bandwidth and not a service. A single top of rack switch is a single point of failure for an entire rack of compute.",
      family: "switch",
      finish: "dark",
      ports: [...run("sfp28", 48, (n) => `Eth1/1/${n}`, 32, "blue"), ...run("qsfp", 4, (n) => `Eth1/1/${n + 48}`, 2, "blue")],
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "D-rings between the switches and the compute. Every server below has at least two leads coming out of it, and this is what stops that being a curtain.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "MX7000",
      u: 7,
      vendor: "Dell",
      model: "PowerEdge MX7000 modular enclosure",
      role: "Seven rack units holding eight compute sleds stood on end, or four double width ones, with the management module and six supplies along the bottom. Vertical sleds are the whole point: they let a chassis be wider than it is tall without wasting the depth, and they are the reason this looks like nothing else in the library.",
      family: "server",
      finish: "dark",
      bays: { count: 8, occupied: 8, label: "compute sled slots", rows: 1 },
      watts: null,
      accent: ACCENT.modular,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-mx7000",
    },
    {
      id: "R760_A",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760",
      role: "Two rack units, twenty four 2.5 inch drives standing upright in a single row. Fully populated: this is the node that holds the data rather than the one that processes it.",
      family: "server",
      finish: "dark",
      bays: { count: 24, occupied: 24, label: "2.5 inch bays", rows: 1 },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r760",
    },
    {
      id: "R760_B",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760",
      role: "The second node, eighteen of twenty four bays filled. The six empty carriers are not an oversight: you buy the chassis once and the drives as you need them, and the blanks keep the airflow going through the disks rather than round them.",
      family: "server",
      finish: "dark",
      bays: { count: 24, occupied: 18, label: "2.5 inch bays", rows: 1 },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r760",
    },
    {
      id: "R660_A",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "One rack unit, ten drives laid flat rather than upright, because a 1U opening is not tall enough to stand a 2.5 inch drive on its edge. The same family as the R760 and a visibly different front for that one reason.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 10, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r660",
    },
    {
      id: "R660_B",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "The second 1U node. Three of these plus the two 2U nodes is a quorum that survives losing any one machine, which is the smallest cluster worth building.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 10, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r660",
    },
    {
      id: "R660_C",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "The third node, six of ten bays filled. Boot and scratch only: its storage lives on the shelf below, which is what lets it be replaced without moving any data.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 6, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r660",
    },
    {
      id: "R960",
      u: 4,
      vendor: "Dell",
      model: "PowerEdge R960",
      role: "Four sockets, and the reason the chassis is four rack units rather than two. Dell publish up to four 4th Generation Xeon Scalable processors at up to sixty cores each, which is more processor and far more memory than fits under a 2U lid. The height buys a second row of drives rather than a taller one, because a 2.5 inch carrier is the size it is however tall the opening is: thirty two bays in two rows of sixteen.",
      family: "server",
      finish: "dark",
      bays: { count: 32, occupied: 26, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/new-poweredge-r960-rack-server/spd/poweredge-r960/pe_r960_16718_vi_vp",
    },
    {
      id: "XE9680",
      u: 6,
      vendor: "Dell",
      model: "PowerEdge XE9680",
      role: "Eight accelerators under one lid, in six rack units. Dell list it with eight NVIDIA HGX H100 or H200, eight AMD Instinct MI300X or eight Intel Gaudi3, alongside two Xeon Scalable processors. It is the densest thing in this rack and the plainest to look at, and those are the same fact: everything on the front above the drive row is intake, because that much silicon under one lid has to be fed air by the wall. There is nowhere for a front panel to go, which is why a server weighing up to 251 pounds is marked with a control cluster the size of a phone.",
      family: "server",
      finish: "dark",
      bays: { count: 8, occupied: 6, label: "2.5 inch NVMe bays", rows: 1 },
      intake: 5,
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-xe9680-rack-server/spd/poweredge-xe9680/pe_xe9680_tm_vi_vp",
    },
    {
      id: "POWERVAULT_ME5",
      u: 2,
      vendor: "Dell",
      model: "PowerVault ME5024",
      role: "A storage array: the same twenty four upright bays as an R760 and no compute behind them. The servers above own the processing, this owns the disks, and separating the two is what lets you replace either without touching the other.",
      family: "storage",
      finish: "dark",
      bays: { count: 24, occupied: 24, label: "2.5 inch bays", rows: 1 },
      watts: null,
      accent: ACCENT.storage,
      url: "https://www.dell.com/en-us/shop/ipovw/powervault-me5",
    },
    {
      id: "CABLE_MANAGER_LOW",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, keeping the storage cabling off the power feeds below it.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "N3248TE_ON",
      u: 1,
      vendor: "Dell",
      model: "PowerSwitch N3248TE-ON",
      role: "The management switch, which this rack had no equivalent of. Two S5248F leaves at the top carry data and nothing carried management, but eight servers and an MX7000 all present an iDRAC or an OME port and those have to land somewhere. Forty eight gigabit copper is what that somewhere looks like, and it is a different shape from the all fibre leaves because management is still copper almost everywhere.",
      family: "switch",
      finish: "dark",
      ports: [
        ...run("rj45", 48, (n) => `Gi1/0/${n}`, 30),
        ...run("sfp-plus", 4, (n) => `Te1/0/${n}`, 2, "blue"),
        ...run("qsfp", 2, (n) => `Hu1/0/${n}`, 1, "blue"),
      ],
      watts: null,
      accent: ACCENT.fabric,
      url: "https://www.delltechnologies.com/asset/en-us/products/networking/technical-support/dell-powerswitch-n3248te-on-spec-sheet.pdf",
    },
    {
      id: "R6615",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R6615",
      role: "Single socket AMD in one rack unit, and the one server here wearing its bezel. Bare, it and the Intel R660s fifteen units up are near enough identical, which is true and useless to look at; plenty of racks run some machines with a bezel and some without, usually because somebody pulled a drive and never put the cover back. The mix is the honest picture.",
      family: "server",
      finish: "dark",
      bays: { count: 10, occupied: 8, label: "2.5 inch bays" },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r6615-spec-sheet.pdf",
    },
    {
      id: "R7615",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R7615",
      role: "Single socket AMD in two rack units, behind the LCD bezel Dell photograph it in. The status panel is the point of paying for one: a service tag, a health state and a fault code readable from the cold aisle without opening anything or logging into anything.",
      family: "server",
      finish: "dark",
      bays: { count: 24, occupied: 24, label: "2.5 inch bays", rows: 1 },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7615-spec-sheet.pdf",
    },
    {
      id: "R7625",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R7625",
      role: "The other thing two rack units of front can be. The R760s at the top hold twenty four small carriers standing on edge; this holds twelve large ones lying flat in three rows of four, and the choice between them is capacity against spindle count rather than a styling difference.",
      family: "server",
      finish: "dark",
      bays: { count: 12, occupied: 12, label: "3.5 inch bays", rows: 3 },
      watts: null,
      accent: ACCENT.compute,
      url: "https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7625-spec-sheet.pdf",
    },
    {
      id: "DELL_PDU",
      u: 2,
      vendor: "Generic",
      model: "Switched rack PDU, 16 outlets",
      role: "Sixteen switched outlets, and a compute rack uses most of them: every server here has two supplies and both want a different feed.",
      family: "pdu",
      finish: "dark",
      display: "ups",
      ports: Array.from({ length: 16 }, (_, i): RackPort => ({ kind: "power", label: String(i + 1).padStart(2, "0") })),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "DELL_UPS",
      u: 4,
      vendor: "Generic",
      model: "Rack UPS with external battery tray",
      role: "Four rack units of ride-through. Its draw depends entirely on the load it carries, so no single consumption figure would be honest here.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "green", "off"],
      watts: null,
      accent: ACCENT.power,
    },
  ],

  sources: [
    {
      label: "Dell: PowerEdge MX7000 modular chassis (7U, eight single-width sled slots)",
      url: "https://www.dell.com/en-us/shop/ipovw/poweredge-mx7000",
    },
    { label: "Dell: PowerEdge R760", url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r760" },
    { label: "Dell: PowerEdge R660", url: "https://www.dell.com/en-us/shop/ipovw/poweredge-r660" },
    {
      label: "Dell: PowerEdge R960 (4U, four socket, up to 32 front bays)",
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/new-poweredge-r960-rack-server/spd/poweredge-r960/pe_r960_16718_vi_vp",
    },
    {
      label: "Dell: PowerEdge XE9680 (6U, eight accelerators)",
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-xe9680-rack-server/spd/poweredge-xe9680/pe_xe9680_tm_vi_vp",
    },
    { label: "Dell: PowerVault ME5", url: "https://www.dell.com/en-us/shop/ipovw/powervault-me5" },
    {
      label: "Dell: PowerSwitch S series 25/100GbE",
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
  ],
};
