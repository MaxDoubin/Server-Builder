/**
 * A Juniper provider edge, built entirely from hardware modelled here.
 *
 * The MX240 is the reason this rack exists and the reason it is 24U. It is
 * not a large switch, it is a card cage: five rack units of slots, and what
 * it does depends entirely on what is in them. Everything else here is
 * arranged around that, the way a real provider edge is.
 *
 * One correction worth carrying from the modelling work into the data. The
 * SRX1500 is widely described as having sixteen gigabit ports, and it has
 * twelve. The specification counts the four SFP cages alongside the twelve
 * RJ45, which is a fair way to count interfaces and a misleading way to
 * count sockets. Both the hardware guide and the studio photograph show
 * twelve copper, four SFP and four SFP+, and that is what is drawn.
 *
 * Power is null throughout for the same reason as the other Juniper rack.
 * Juniper publish power supply options rather than platform consumption, and
 * a 1100W PSU on a switch that idles under 100W is a ceiling, not a figure.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

const activityFor = (n: number): number =>
  Math.round((((n * 29) % 53) / 52) * 100) / 100;

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
  chassis: "#84b135",
  edge: "#0f7dc2",
  fabric: "#00a8e0",
  access: "#ccff00",
  security: "#e2231a",
  power: "#9234ea",
} as const;

export const juniperMxRack: RackDefinition = {
  slug: "juniper-mx-24u",
  name: "Juniper provider edge 24U",
  blurb:
    "An MX240 card chassis with the rest of the Juniper line arranged around it: an MX204 for compact edge, a QFX5120 leaf pair, EX4400 and a two member EX4300 virtual chassis for access, and an SRX1500 cluster on the boundary. Everything here that carries a Juniper badge is modelled from Juniper's own photographs and hardware guides, and the SRX is drawn with the twelve copper ports it actually has rather than the sixteen interfaces its specification counts.",
  height: 24,

  devices: [
    {
      id: "PATCH_PANEL_A",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel A",
      role: "Where the building's copper lands before it reaches a switch. A patch panel is the seam between cabling somebody installed once and equipment that gets swapped, and the reason you can replace the switch below it without touching a single permanent run.",
      family: "patch",
      ports: run("rj45", 24, (n) => `A${pad2(n)}`, 18),
      finish: "dark",
      watts: null,
      accent: ACCENT.access,
    },
    {
      id: "EX4400_48P",
      u: 1,
      vendor: "Juniper",
      model: "EX4400-48P",
      role: "Access with power over Ethernet, and a four cage SFP+ extension module fitted on the front rather than the rear, which is what the photograph of this SKU actually shows.",
      family: "switch",
      finish: "light",
      accent: ACCENT.access,
      groupsOf: 6,
      moduleBay: true,
      ports: [
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 29),
        ...run("sfp-plus", 4, (n) => `et-0/1/${n - 1}`, 2),
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/ex4400/",
    },
    {
      id: "PATCH_PANEL_B",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel B",
      role: "The second panel, feeding the virtual chassis below it. Two panels rather than one because the runs they terminate come from two different parts of the building.",
      family: "patch",
      ports: run("rj45", 24, (n) => `B${pad2(n)}`, 14),
      finish: "dark",
      watts: null,
      accent: ACCENT.access,
    },
    {
      id: "EX4300_48T_A",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T",
      role: "Data only access, and the platform whose headline feature is that 40 gigabit is built in rather than modular: four QSFP+ on every unit, used as uplinks or as Virtual Chassis interconnects.",
      family: "switch",
      finish: "light",
      accent: ACCENT.access,
      groupsOf: 6,
      ports: [
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 24),
        ...run("qsfp", 4, (n) => `et-0/1/${n - 1}`, 2, "blue"),
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/ex4300/",
    },
    {
      id: "EX4300_48T_B",
      u: 1,
      vendor: "Juniper",
      model: "EX4300-48T",
      role: "The second member of the virtual chassis. Two switches with one control plane and one configuration: the 40 gigabit ports on both are doing the interconnect rather than carrying uplinks, which is the trade a virtual chassis asks for.",
      family: "switch",
      finish: "light",
      accent: ACCENT.access,
      groupsOf: 6,
      ports: [
        ...run("rj45", 48, (n) => `ge-0/0/${n - 1}`, 24),
        ...run("qsfp", 4, (n) => `et-0/1/${n - 1}`, 2, "blue"),
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/ex4300/",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Fingers and a cover, under the access layer where forty eight jumpers leave at once. Without one the panel above becomes unreadable within a year, and unreadable is how a patch gets pulled on the wrong port.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.access,
    },
    {
      id: "QFX5120_48Y_A",
      u: 1,
      vendor: "Juniper",
      model: "QFX5120-48Y",
      role: "The leaf: forty eight 25 gigabit SFP28 down to servers, eight 100 gigabit QSFP28 up to the spine. The port pitch on this one was measured off Juniper's own transparent product render rather than estimated, which is how the cage openings came out within a tenth of a millimetre of the MSA.",
      family: "switch",
      finish: "light",
      accent: ACCENT.fabric,
      groupsOf: 6,
      ports: [
        ...run("sfp28", 48, (n) => `et-0/0/${n - 1}`, 22, "blue"),
        ...run("qsfp", 8, (n) => `et-0/0/${n + 47}`, 4, "blue"),
      ],
      watts: null,
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch.html",
    },
    {
      id: "QFX5120_48Y_B",
      u: 1,
      vendor: "Juniper",
      model: "QFX5120-48Y",
      role: "The second leaf. Servers dual home to the pair and the pair is what makes a leaf failure survivable, so a single leaf in a rack diagram is either a lab or an accident.",
      family: "switch",
      finish: "light",
      accent: ACCENT.fabric,
      groupsOf: 6,
      ports: [
        ...run("sfp28", 48, (n) => `et-0/0/${n - 1}`, 22, "blue"),
        ...run("qsfp", 8, (n) => `et-0/0/${n + 47}`, 4, "blue"),
      ],
      watts: null,
      url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch.html",
    },
    {
      id: "CABLE_MANAGER_MID",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, keeping the fibre off the copper above it. Fibre has a real minimum bend radius and a manager is how you respect it.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.access,
    },
    {
      id: "MX240",
      u: 5,
      vendor: "Juniper",
      model: "MX240",
      role: "The chassis, and the reason for the frame. Five units of card cage: routing engines and switch control boards in the middle, line cards above and below, and a fan tray moving air across all of it. What it is depends on what is in the slots.",
      family: "router",
      finish: "dark",
      accent: ACCENT.chassis,
      cards: true,
      ports: [
        ...run("sfp-plus", 4, (n) => `xe-0/0/${n - 1}`, 4, "green"),
        ...run("sfp-plus", 4, (n) => `xe-1/0/${n - 1}`, 3, "green"),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.05 },
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/mx240/",
    },
    {
      id: "MX204",
      u: 1,
      vendor: "Juniper",
      model: "MX204",
      role: "The compact edge router: four 100 gigabit QSFP28 and eight 10 gigabit SFP+ in a single unit, doing in 1U what used to need a chassis. Its face is almost entirely perforation, because the whole platform is a thermal problem in a small box.",
      family: "router",
      finish: "dark",
      accent: ACCENT.edge,
      groupsOf: 4,
      ports: [
        ...run("qsfp", 4, (n) => `et-0/0/${n - 1}`, 3, "blue"),
        ...run("sfp-plus", 8, (n) => `xe-0/1/${n - 1}`, 5),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.04 },
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/mx204/",
    },
    {
      id: "SRX1500_A",
      u: 1,
      vendor: "Juniper",
      model: "SRX1500",
      role: "The services gateway on the boundary. Twelve gigabit copper, four SFP and four SFP+, which is the twelve sockets the panel has rather than the sixteen interfaces the specification counts.",
      family: "firewall",
      finish: "dark",
      accent: ACCENT.security,
      groupsOf: 6,
      ports: [
        ...run("rj45", 12, (n) => `ge-0/0/${n - 1}`, 6),
        ...run("sfp", 4, (n) => `ge-0/0/${n + 11}`, 2),
        ...run("sfp-plus", 4, (n) => `xe-0/0/${n + 15}`, 2),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.03 },
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/srx1500/",
    },
    {
      id: "SRX1500_B",
      u: 1,
      vendor: "Juniper",
      model: "SRX1500",
      role: "The second node of the cluster. Two SRX joined by a control link and a fabric link behave as one firewall with one session table, which is the only way a stateful device survives losing itself: a session that fails over has to be remembered by the node that picks it up.",
      family: "firewall",
      finish: "dark",
      accent: ACCENT.security,
      groupsOf: 6,
      ports: [
        ...run("rj45", 12, (n) => `ge-0/0/${n - 1}`, 6),
        ...run("sfp", 4, (n) => `ge-0/0/${n + 11}`, 2),
        ...run("sfp-plus", 4, (n) => `xe-0/0/${n + 15}`, 2),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.03 },
      ],
      watts: null,
      url: "https://www.juniper.net/documentation/us/en/hardware/srx1500/",
    },
    {
      id: "CONSOLE_SERVER",
      u: 1,
      vendor: "Generic",
      model: "16-port console server",
      role: "Out of band access. Sixteen serial ports, one to each device's console, on its own network so a misconfigured routing engine can still be reached without a drive to site. The panel nobody thinks about until the day it is the only thing working.",
      family: "server",
      ports: [...run("console", 16, (n) => `S${pad2(n)}`, 11), ...run("rj45", 1, () => "MGMT", 1)],
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "CABLE_MANAGER_LOW",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The last manager, above the power. Everything below this point is a cord rather than a circuit, and they are worth keeping apart.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.access,
    },
    {
      id: "BLANK_MX",
      u: 2,
      vendor: "Generic",
      model: "2U blanking panel",
      role: "Two units, kept for the next line card chassis and covered until it arrives. Covered rather than open: an empty unit is a path for hot exhaust to turn back through the front of the cabinet and into the intake above it.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "MX_PDU",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 8 outlets",
      role: "Eight metered outlets, and the thing this rack did not have. A UPS has a handful of sockets on the back and a rack has more devices than that, so without a strip the drawing was of a rack nobody could plug in.",
      family: "pdu",
      ports: run("power", 8, (n) => `C13-${n}`, 6),
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "SMT1500RM2U",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "The UPS, sized for the control plane rather than the whole rack: enough to hold the routing engines and the management network through a transfer.",
      family: "ups",
      finish: "black",
      accent: ACCENT.power,
      display: "ups",
      watts: null,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],

  sources: [
    { label: "Juniper MX240 hardware guide", url: "https://www.juniper.net/documentation/us/en/hardware/mx240/" },
    { label: "Juniper MX204 hardware guide", url: "https://www.juniper.net/documentation/us/en/hardware/mx204/" },
    { label: "Juniper QFX5120 product page", url: "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch.html" },
    { label: "Juniper EX4400 hardware guide", url: "https://www.juniper.net/documentation/us/en/hardware/ex4400/" },
    { label: "Juniper EX4300 hardware guide", url: "https://www.juniper.net/documentation/us/en/hardware/ex4300/" },
    { label: "Juniper SRX1500 hardware guide", url: "https://www.juniper.net/documentation/us/en/hardware/srx1500/" },
    { label: "APC Smart-UPS SMT1500RM2U", url: "https://www.apc.com/us/en/product/SMT1500RM2U/" },
  ],
};
