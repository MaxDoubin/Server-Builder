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
      bays: { count: 8, occupied: 8, label: "compute sled slots" },
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
      bays: { count: 24, occupied: 24, label: "2.5 inch bays" },
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
      bays: { count: 24, occupied: 18, label: "2.5 inch bays" },
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
      id: "POWERVAULT_ME5",
      u: 2,
      vendor: "Dell",
      model: "PowerVault ME5024",
      role: "A storage array: the same twenty four upright bays as an R760 and no compute behind them. The servers above own the processing, this owns the disks, and separating the two is what lets you replace either without touching the other.",
      family: "storage",
      finish: "dark",
      bays: { count: 24, occupied: 24, label: "2.5 inch bays" },
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
    { label: "Dell: PowerVault ME5", url: "https://www.dell.com/en-us/shop/ipovw/powervault-me5" },
    {
      label: "Dell: PowerSwitch S series 25/100GbE",
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
  ],
};
