/**
 * A MikroTik Cloud Router Switch stack, built entirely from hardware
 * modelled here.
 *
 * Five CRS switches in a row is a good test of whether the modelling was
 * done honestly, because MikroTik's whole product line looks alike from a
 * distance: the same black anodised extrusion, the same white silkscreen,
 * the same one rack unit. Drawn carelessly they come out as one switch
 * repeated five times.
 *
 * They are not the same. The CRS354 is a 48 port copper switch with optics
 * as an afterthought; the CRS326-24S is the mirror image, twenty four SFP+
 * cages in two rows and no copper at all; the CRS317 is sixteen cages in
 * four groups with a single management port; the CRS312 is eight 10 gigabit
 * copper ports, which is a rare and specific thing; and the CRS326-24G is
 * the cheap workhorse. Five different faces, five different port pitches,
 * and each one measured from its own photograph.
 *
 * MikroTik are unusual in publishing an actual maximum power consumption for
 * every product rather than a PSU rating, so unlike the Cisco, Juniper and
 * Dell racks in this library, these figures are real device draws taken from
 * the product pages. The PDU below them is the exception: Ubiquiti publish
 * no consumption figure for it, so that one is null.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

const activityFor = (n: number): number =>
  Math.round((((n * 31) % 47) / 46) * 100) / 100;

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

const ACCENT = {
  copper: "#ccff00",
  optics: "#00bceb",
  dense: "#39c07c",
  tenGig: "#e08a3c",
  power: "#9234ea",
} as const;

export const mikrotikCrsRack: RackDefinition = {
  slug: "mikrotik-crs-12u",
  name: "MikroTik CRS stack 12U",
  blurb:
    "Five Cloud Router Switches that look identical from across a room and share no geometry at all: a 48 port copper CRS354, an all optics CRS326-24S, a sixteen cage CRS317, an eight port 10 gigabit copper CRS312, and the CRS326-24G workhorse. Each one measured from its own photograph. MikroTik publish real maximum consumption figures rather than power supply ratings, so unusually for this library the watts here are the devices' own draw.",
  height: 12,

  devices: [
    {
      id: "PATCH_PANEL",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel",
      role: "Where the copper lands before it reaches a switch. The stack below is nearly all fibre, so the one panel here is the whole copper footprint of the rack, which is itself the point of a MikroTik stack built this way.",
      family: "patch",
      ports: run("rj45", 24, (n) => `A${pad2(n)}`, 15),
      finish: "dark",
      watts: null,
      accent: ACCENT.copper,
    },
    {
      id: "CRS354_48G",
      u: 1,
      vendor: "MikroTik",
      model: "CRS354-48G-4S+2Q+RM",
      role: "The copper workhorse: forty eight gigabit RJ45 with four SFP+ and two QSFP+ at the right hand end for uplinks. Optics are the afterthought on this one, which is exactly the opposite of the switch below it.",
      family: "switch",
      finish: "black",
      accent: ACCENT.copper,
      groupsOf: 8,
      ports: [
        ...run("rj45", 48, (n) => `ether${n}`, 26),
        ...run("sfp-plus", 4, (n) => `sfp-sfpplus${n}`, 2),
        ...run("qsfp", 2, (n) => `qsfpplus${n}`, 1, "blue"),
      ],
      watts: 55,
      url: "https://mikrotik.com/product/crs354_48g_4splus2qplus_rm",
    },
    {
      id: "CRS326_24G_2S",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24G-2S+RM",
      role: "The cheap one, and the one most of these racks are actually built on: twenty four gigabit copper ports and two SFP+ uplinks, in a chassis narrow enough that MikroTik publish no photograph of it with rack ears fitted.",
      family: "switch",
      finish: "black",
      accent: ACCENT.copper,
      groupsOf: 8,
      ports: [
        ...run("rj45", 24, (n) => `ether${n}`, 15),
        ...run("sfp-plus", 2, (n) => `sfp-sfpplus${n}`, 2, "blue"),
      ],
      watts: 27,
      url: "https://mikrotik.com/product/CRS326-24G-2SplusRM",
    },
    {
      id: "CABLE_MANAGER",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Fingers and a cover between the copper switches and the fibre ones. Fibre has a real minimum bend radius and a manager is how you respect it, which matters more here than in a copper rack because a kinked patch lead fails quietly rather than not at all.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.optics,
    },
    {
      id: "CRS317_16S",
      u: 1,
      vendor: "MikroTik",
      model: "CRS317-1G-16S+RM",
      role: "Sixteen SFP+ cages in four groups of four, and a single gigabit copper port that exists only so you can reach the thing to configure it. The staircase vent bands either side of the cages are the detail that identifies this panel.",
      family: "switch",
      finish: "black",
      accent: ACCENT.optics,
      groupsOf: 4,
      ports: [
        ...run("sfp-plus", 16, (n) => `sfp-sfpplus${n}`, 9, "blue"),
        { kind: "rj45", label: "ether1", led: "green", activity: 0.03 },
      ],
      watts: 44,
      url: "https://mikrotik.com/product/crs317_1g_16s_rm",
    },
    {
      id: "CRS326_24S_2Q",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24S+2Q+RM",
      role: "The mirror image: twenty four SFP+ cages in two rows and not one copper port on the face, with two QSFP+ for the uplink. An aggregation switch that assumes everything arriving is already fibre or DAC.",
      family: "switch",
      finish: "black",
      accent: ACCENT.optics,
      groupsOf: 6,
      ports: [
        ...run("sfp-plus", 24, (n) => `sfp-sfpplus${n}`, 13, "blue"),
        ...run("qsfp", 2, (n) => `qsfpplus${n}`, 2, "blue"),
      ],
      watts: 60,
      url: "https://mikrotik.com/product/crs326_24s_2q_rm",
    },
    {
      id: "CRS312_4C_8XG",
      u: 1,
      vendor: "MikroTik",
      model: "CRS312-4C+8XG-RM",
      role: "Eight 10 gigabit ports over copper, which is a rare thing to find in a switch this size, plus four combo positions that take either an SFP+ or another 10GBASE-T. For the machines already wired with Cat6A that are not worth refitting with optics.",
      family: "switch",
      finish: "black",
      accent: ACCENT.tenGig,
      groupsOf: 4,
      singleRow: true,
      ports: [
        ...run("rj45", 8, (n) => `ether${n}`, 5),
        ...run("sfp-plus", 4, (n) => `combo${n}`, 2, "blue"),
      ],
      watts: 42,
      url: "https://mikrotik.com/product/crs312_4c_8xg_rm",
    },
    {
      id: "BLANK_CRS",
      u: 1,
      vendor: "Generic",
      model: "1U blanking panel",
      role: "One unit between the switches and the power, covered rather than open so the air through the cabinet stays front to back.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "USP_PDU_PRO",
      u: 2,
      vendor: "Ubiquiti",
      model: "USP-PDU-Pro",
      role: "The distribution unit, and the one device here whose consumption is not published: Ubiquiti quote its capacity and its outlet count and never what the unit itself draws, so the figure is null rather than guessed. Built from their dimensioned elevation because they publish no 3D model for it either.",
      family: "pdu",
      finish: "black",
      accent: ACCENT.power,
      groupsOf: 4,
      ports: [
        ...run("power", 16, (n) => `Outlet ${n}`, 7, "blue"),
        ...run("usb", 4, (n) => `USB-C ${n}`, 1, "blue"),
        { kind: "rj45", label: "Mgmt 100M", led: "green", activity: 0.03 },
        ...run("rj45", 3, (n) => `GbE ${n}`, 1),
      ],
      /*
        Ubiquiti publish "Max. Power Consumption: 125V AC 1,875W", which is
        the outlet capacity of the bar rather than what the PDU costs to run.
        The self consumption figure is not published anywhere, so this is
        null rather than a number that means something else.
      */
      watts: null,
      url: "https://store.ui.com/us/en/products/usp-pdu-pro",
    },
    {
      id: "CRS_UPS",
      u: 2,
      vendor: "Generic",
      model: "Rack UPS, 1500VA",
      role: "The thing this rack did not have. A metered PDU tells you what the stack draws and does nothing at all when the draw stops: without a UPS behind it, every switch here goes down on a flicker and comes back up in whatever order it feels like.",
      family: "ups",
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
  ],

  sources: [
    { label: "MikroTik CRS354-48G-4S+2Q+RM", url: "https://mikrotik.com/product/crs354_48g_4splus2qplus_rm" },
    { label: "MikroTik CRS326-24S+2Q+RM", url: "https://mikrotik.com/product/crs326_24s_2q_rm" },
    { label: "MikroTik CRS317-1G-16S+RM", url: "https://mikrotik.com/product/crs317_1g_16s_rm" },
    { label: "MikroTik CRS312-4C+8XG-RM", url: "https://mikrotik.com/product/crs312_4c_8xg_rm" },
    { label: "MikroTik CRS326-24G-2S+RM", url: "https://mikrotik.com/product/CRS326-24G-2SplusRM" },
    { label: "Ubiquiti USP-PDU-Pro", url: "https://store.ui.com/us/en/products/usp-pdu-pro" },
  ],
};
