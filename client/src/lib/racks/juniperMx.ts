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
    "An MX240 card chassis with the rest of the Juniper line arranged around it: an MX204 for compact edge, a QFX5120 leaf, EX4400 and EX4300 access, and an SRX1500 on the boundary. Every device is modelled here from Juniper's own photographs and hardware guides, and the SRX is drawn with the twelve copper ports it actually has rather than the sixteen interfaces its specification counts.",
  height: 24,

  devices: [
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
      id: "QFX5120_48Y",
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
      id: "EX4300_48T",
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
      id: "SRX1500",
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
