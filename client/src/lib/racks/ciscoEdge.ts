/**
 * A Cisco enterprise edge, built entirely from hardware modelled here.
 *
 * Every other rack in this library was authored from datasheets and drawn
 * as an elevation. This one is the same discipline pointed at a different
 * question: what can be built out of the products that have been modelled
 * one at a time from photographs, and does the set actually make a rack?
 *
 * It does, and this is the shape it makes. A WAN edge is a real position in
 * a network and it has a real order to it: the circuit lands on the ASR, the
 * services router does the heavy lifting behind it, the firewall sits
 * between that and the campus, and the access switches hang off the bottom.
 * Nothing here is filler and nothing is a stand in.
 *
 * On power, the same rule as every other Cisco rack here. Cisco publish
 * power supply ratings for these platforms rather than the platform's own
 * consumption, and a PSU rating is a ceiling on what the socket must
 * deliver, not a measurement of what the box draws. Quoting one as the other
 * would multiply the real figure several times over, so `watts` is null
 * throughout and the page says "not published", which is true.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const activityFor = (n: number): number =>
  Math.round((((n * 41) % 59) / 58) * 100) / 100;

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

/**
 * Cisco's port throats on the 9000 series are a distinctive teal, and the
 * routers are not: the 4000 series and the ASR use plain black housings.
 * Drawing the whole rack teal would be as wrong as drawing none of it.
 */
const TEAL = "#1c8f8f";

const ACCENT = {
  wan: "#00bceb",
  services: "#0d7bc4",
  security: "#e2231a",
  access: "#ccff00",
  spine: "#7d3fd6",
  power: "#9234ea",
} as const;

export const ciscoEdgeRack: RackDefinition = {
  slug: "cisco-edge-16u",
  name: "Cisco enterprise edge 16U",
  blurb:
    "A WAN edge and campus distribution stack, built only from hardware modelled here from photographs: an ASR 1001-X on the circuit, an ISR 4451-X behind it, a Firepower 2140 between that and the campus, a Nexus 9336C-FX2 spine, and two Catalyst access switches. Ten units in a sixteen unit frame, because an edge rack that starts full has nowhere to grow.",
  height: 16,

  devices: [
    {
      id: "ASR1001X",
      u: 1,
      vendor: "Cisco",
      model: "ASR 1001-X",
      role: "The WAN edge. Six built-in gigabit SFP and two 10 gigabit SFP+, with a NIM bay for whatever the carrier hands over, and the embedded services processor that makes this an aggregation router rather than a large switch.",
      family: "router",
      finish: "dark",
      accent: ACCENT.wan,
      singleRow: true,
      ports: [
        ...run("sfp-plus", 2, (n) => `TE0/0/${n - 1}`, 2),
        ...run("sfp", 6, (n) => `GE0/0/${n + 1}`, 3),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.05 },
        { kind: "usb", label: "USB" },
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/routers/asr-1001-x-router/index.html",
    },
    {
      id: "ISR4451X",
      u: 2,
      vendor: "Cisco",
      model: "ISR 4451-X",
      role: "The services router: two mirrored gigabit groups on the face, three NIM slots and two service module slots behind them. Two units rather than one because the service modules are what it is for, and they do not fit in a 1U.",
      family: "router",
      finish: "dark",
      accent: ACCENT.services,
      singleRow: true,
      ports: [
        ...run("rj45", 2, (n) => `GE0/0/${n - 1}`, 2),
        ...run("sfp", 2, (n) => `GE0/0/${n + 1}`, 1),
        { kind: "console", label: "CON", led: "green" },
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.04 },
        { kind: "usb", label: "USB" },
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/routers/4451-x-integrated-services-router-isr/index.html",
    },
    {
      id: "ISR4331",
      u: 1,
      vendor: "Cisco",
      model: "ISR 4331",
      role: "A second, smaller services router kept for the backup circuit and for out of band. Three gigabit ports, one of them a combo, two NIM slots and one service module slot.",
      family: "router",
      finish: "dark",
      accent: ACCENT.services,
      singleRow: true,
      ports: [
        { kind: "rj45", label: "GE0/0/0", led: "green", activity: 0.18 },
        { kind: "rj45", label: "GE0/0/1", led: "green", activity: 0.06 },
        { kind: "sfp", label: "GE0/0/2", led: "off" },
        { kind: "console", label: "CON", led: "green" },
        { kind: "usb", label: "USB" },
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/routers/4331-integrated-services-router-isr/index.html",
    },
    {
      id: "FIREPOWER_2140",
      u: 1,
      vendor: "Cisco",
      model: "Firepower 2140",
      role: "The boundary between the routers above and the campus below. Twelve gigabit copper and four 10 gigabit SFP+, with the SSD carriers on the face that hold the event store.",
      family: "firewall",
      finish: "dark",
      accent: ACCENT.security,
      groupsOf: 6,
      ports: [
        ...run("rj45", 12, (n) => `E1/${n}`, 7),
        ...run("sfp-plus", 4, (n) => `E1/${n + 12}`, 2),
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.03 },
        { kind: "console", label: "CON", led: "green" },
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/security/firepower-2100-series/index.html",
    },
    {
      id: "NEXUS_9336C",
      u: 1,
      vendor: "Cisco",
      model: "Nexus 9336C-FX2",
      role: "Thirty six 100 gigabit QSFP28 ports and almost nothing else, which is what a spine looks like. One rack unit of nothing but optics, feeding everything that needs more than ten gigabits.",
      family: "switch",
      finish: "dark",
      accent: ACCENT.spine,
      groupsOf: 6,
      portTint: TEAL,
      ports: [...run("qsfp", 36, (n) => `E1/${n}`, 14, "blue")],
      watts: null,
      url: "https://www.cisco.com/c/en/us/support/switches/nexus-9336c-fx2-switch/model.html",
    },
    {
      id: "C9300_48P",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9300-48P",
      role: "The main access switch: forty eight PoE+ ports for phones, access points and cameras, with an eight port 10 gigabit uplink module in the modular bay.",
      family: "switch",
      finish: "light",
      accent: ACCENT.access,
      groupsOf: 6,
      portTint: TEAL,
      moduleBay: true,
      ports: [
        ...run("rj45", 48, (n) => `Gi1/0/${n}`, 31),
        ...run("sfp-plus", 8, (n) => `Te1/1/${n}`, 2),
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/switches/catalyst-9300-series-switches/index.html",
    },
    {
      id: "C9200L_24T_4G",
      u: 1,
      vendor: "Cisco",
      model: "Catalyst 9200L-24T-4G",
      role: "A smaller data only switch for the room's own kit: twenty four copper ports with no PoE, and four fixed gigabit SFP uplinks rather than a module.",
      family: "switch",
      finish: "light",
      accent: ACCENT.access,
      groupsOf: 6,
      portTint: TEAL,
      ports: [
        ...run("rj45", 24, (n) => `Gi1/0/${n}`, 11),
        ...run("sfp", 4, (n) => `Gi1/1/${n}`, 2),
      ],
      watts: null,
      url: "https://www.cisco.com/c/en/us/products/switches/catalyst-9200-series-switches/index.html",
    },
    {
      id: "SMT1500RM2U",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Line interactive UPS at the bottom of the frame, sized to carry the routers and the firewall through a transfer rather than the whole rack indefinitely. The LCD reports load and runtime.",
      family: "ups",
      finish: "black",
      accent: ACCENT.power,
      display: "ups",
      watts: null,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],

  sources: [
    { label: "Cisco ASR 1001-X data sheet", url: "https://www.cisco.com/c/en/us/products/collateral/routers/asr-1000-series-aggregation-services-routers/datasheet-c78-731632.html" },
    { label: "Cisco 4000 Series ISR data sheet", url: "https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html" },
    { label: "Cisco Firepower 2100 Series data sheet", url: "https://www.cisco.com/c/en/us/products/collateral/security/firepower-2100-series/datasheet-c78-742473.html" },
    { label: "Cisco Nexus 9336C-FX2 data sheet", url: "https://www.cisco.com/c/en/us/support/switches/nexus-9336c-fx2-switch/model.html" },
    { label: "Cisco Catalyst 9300 Series data sheet", url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html" },
    { label: "Cisco Catalyst 9200 Series data sheet", url: "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9200-series-switches/nb-06-cat9200-ser-data-sheet-cte-en.html" },
    { label: "APC Smart-UPS SMT1500RM2U", url: "https://www.apc.com/us/en/product/SMT1500RM2U/" },
  ],
};
