/**
 * A Dell compute and storage row, built entirely from hardware modelled here.
 *
 * The interesting thing about drawing these four together is that their
 * faces are all storage and no two are alike, which is exactly the trap the
 * first version of this library fell into: one carrier shape reused
 * everywhere, so a 1U, a 2U and a top load shelf all came out as the same
 * grid of rectangles.
 *
 * They are not the same. A 2.5 inch drive cannot stand on its edge in a 1U
 * opening, so the R660 is two rows of five landscape carriers and the R760
 * is twenty four on end in a single row. That is a different moulding, not a
 * different arrangement of the same one, and it is why the two models share
 * no geometry despite being the same generation. The R760xd2 is a third
 * thing again: twelve 3.5 inch carriers in four columns of three. And the
 * ME4084 is the honest one, because its eighty four drives are behind top
 * load drawers and none of them is visible from the front at all.
 *
 * Power is null throughout. Dell publish PSU options, a configurator, and a
 * power calculator that wants a full bill of materials; none of those is the
 * machine's own draw, and a populated R760 and an empty one are not close
 * to the same number.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

const activityFor = (n: number): number =>
  Math.round((((n * 43) % 67) / 66) * 100) / 100;

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
  fabric: "#0076ce",
  compute: "#00a1e0",
  dense: "#5f8bd6",
  storage: "#6b47c9",
  power: "#9234ea",
} as const;

export const dellRowRack: RackDefinition = {
  slug: "dell-row-24u",
  name: "Dell compute and storage 24U",
  blurb:
    "An eighty four bay PowerVault under three generations of PowerEdge, with a pair of S5248F-ON leaves on top of the rack. Every Dell box here is modelled from Dell's own service documentation, and their five fronts are five different mouldings: a 1U cannot stand a 2.5 inch drive on edge, so the R660 carries two rows of five while the R760 carries twenty four upright and the R760xd2 lays twelve large ones flat in a grid.",
  height: 24,

  devices: [
    {
      id: "S5248F_ON_A",
      u: 1,
      vendor: "Dell",
      model: "PowerSwitch S5248F-ON",
      role: "Top of rack. Forty eight 25 gigabit SFP28 down to the servers and four 100 gigabit QSFP28 up, with the open networking install environment rather than a fixed OS.",
      family: "switch",
      finish: "dark",
      accent: ACCENT.fabric,
      groupsOf: 6,
      ports: [
        ...run("sfp28", 48, (n) => `Eth1/1/${n}`, 19, "blue"),
        ...run("qsfp", 4, (n) => `Eth1/1/${n + 48}`, 2, "blue"),
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.04 },
        { kind: "console", label: "CON", led: "green" },
      ],
      watts: null,
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
    {
      id: "S5248F_ON_B",
      u: 1,
      vendor: "Dell",
      model: "PowerSwitch S5248F-ON",
      role: "The second top of rack switch. Servers in a row dual home to the pair, and the pair is the reason a switch reload is maintenance rather than an outage; one leaf on its own makes every server under it single homed to a box that has to be patched sometimes.",
      family: "switch",
      finish: "dark",
      accent: ACCENT.fabric,
      groupsOf: 6,
      ports: [
        ...run("sfp28", 48, (n) => `Eth1/1/${n}`, 19, "blue"),
        ...run("qsfp", 4, (n) => `Eth1/1/${n + 48}`, 2, "blue"),
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.04 },
        { kind: "console", label: "CON", led: "green" },
      ],
      watts: null,
      url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe",
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Fingers and a cover under the leaf pair, where every server's two uplinks converge. In a row rack the cabling is short and dense and there is no patch panel to organise it, so this is the only thing keeping the front of the switches readable.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.fabric,
    },
    {
      id: "R760_A",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760",
      role: "The general purpose compute node, and the one with room for the parts that do not fit in a 1U: two GPUs, four expansion risers, a RAID controller and a rear drive cage. Twenty four 2.5 inch carriers stood on their edge in one row across the face.",
      family: "server",
      finish: "dark",
      accent: ACCENT.compute,
      bays: { count: 24, occupied: 18, label: "2.5 inch NVMe", rows: 1 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r760-rack-server/spd/poweredge-r760",
    },
    {
      id: "R760_B",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760",
      role: "The second two socket node. Compute in a row rack comes in pairs and multiples for the same reason storage does: the unit of failure is the chassis, so the unit of design has to be more than one of them.",
      family: "server",
      finish: "dark",
      accent: ACCENT.compute,
      bays: { count: 24, occupied: 18, label: "2.5 inch NVMe", rows: 1 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r760-rack-server/spd/poweredge-r760",
    },
    {
      id: "R660_A",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "The 1U, and a different carrier entirely: a 2.5 inch drive will not stand upright in a 1U opening, so these are ten landscape carriers in two rows of five. Same generation as the R760 above and not one part in common on the face.",
      family: "server",
      finish: "dark",
      accent: ACCENT.compute,
      bays: { count: 10, occupied: 8, label: "2.5 inch NVMe", rows: 2 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r660-rack-server/spd/poweredge-r660",
    },
    {
      id: "R660_B",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "The second one unit node. Three of these across the row is the shape of a hypervisor cluster small enough to lose a member and keep quorum.",
      family: "server",
      finish: "dark",
      accent: ACCENT.compute,
      bays: { count: 10, occupied: 8, label: "2.5 inch NVMe", rows: 2 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r660-rack-server/spd/poweredge-r660",
    },
    {
      id: "R660_C",
      u: 1,
      vendor: "Dell",
      model: "PowerEdge R660",
      role: "The third, which is what makes the other two a cluster rather than a pair. Two nodes cannot agree which of them is still alive; three can.",
      family: "server",
      finish: "dark",
      accent: ACCENT.compute,
      bays: { count: 10, occupied: 8, label: "2.5 inch NVMe", rows: 2 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r660-rack-server/spd/poweredge-r660",
    },
    {
      id: "R760XD2",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760xd2",
      role: "The capacity node: twelve 3.5 inch carriers in four columns of three, with a mid bay behind them that the front callout tells a technician about. Fewer, larger, slower disks than the R760 above it, which is the whole point of the variant.",
      family: "server",
      finish: "dark",
      accent: ACCENT.dense,
      bays: { count: 12, occupied: 12, label: "3.5 inch SAS", rows: 3 },
      watts: null,
      url: "https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r760xd2-rack-server/spd/poweredge-r760xd2",
    },
    {
      id: "ME4084",
      u: 5,
      vendor: "Dell",
      model: "PowerVault ME4084",
      role: "Eighty four drives in five rack units, and you cannot see a single one of them. The disks are reached from above through top load drawers on rails, so the face is two drawer fronts and a pair of status ears, which is the one thing a shelf drawn as eighty four carriers does not look like.",
      family: "storage",
      finish: "dark",
      accent: ACCENT.storage,
      bays: { count: 84, occupied: 84, label: "3.5 inch SAS", drawers: 2 },
      watts: null,
      url: "https://www.dell.com/support/manuals/en-us/powervault-me4084/",
    },
    {
      id: "CABLE_MANAGER_LOW",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, below the storage and above the power. Everything under this point is a power cord rather than a data circuit, and they are worth keeping apart.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.fabric,
    },
    {
      id: "CONSOLE_SERVER",
      u: 1,
      vendor: "Generic",
      model: "16-port console server",
      role: "Out of band access to every iDRAC and to the switches above them, on its own network. A row rack is the one place where losing the management path costs you the whole row at once, because everything in it is reached the same way.",
      family: "server",
      ports: [...run("console", 16, (n) => `S${pad2(n)}`, 12), ...run("rj45", 1, () => "MGMT", 1)],
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "BLANK_ROW",
      u: 2,
      vendor: "Generic",
      model: "2U blanking panel",
      role: "Two units held for the next node and covered until it arrives. Covered rather than open: hot exhaust turns back through an empty unit and into the intake of whatever sits above it, which in a rack this dense is a server.",
      family: "blank",
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "ROW_PDU",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 8 outlets",
      role: "Eight metered outlets, and the thing this rack did not have. Eleven devices and a UPS with a handful of sockets on the back is not a rack anybody could actually plug in, and metering is how you find out what a row draws rather than what its supplies are rated for.",
      family: "pdu",
      ports: run("power", 8, (n) => `C13-${n}`, 7),
      finish: "dark",
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "SMT1500RM2U",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "A UPS at the bottom, sized to ride out a transfer rather than to carry this row. Five units of spinning disk and three servers are well past what a 1500VA line interactive unit holds for long, and the page says so rather than implying otherwise.",
      family: "ups",
      finish: "black",
      accent: ACCENT.power,
      display: "ups",
      watts: null,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],

  sources: [
    { label: "Dell PowerSwitch S5248F-ON", url: "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe" },
    { label: "Dell PowerEdge R760 installation and service manual", url: "https://www.dell.com/support/manuals/en-us/oth-r760/per760_ism_pub/" },
    { label: "Dell PowerEdge R760xd2 technical guide", url: "https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760xd2-technical-guide.pdf" },
    { label: "Dell PowerEdge R660 installation and service manual", url: "https://www.dell.com/support/manuals/en-us/poweredge-r660/r660_ism_pub/" },
    { label: "Dell PowerVault ME4084 owner's manual", url: "https://www.dell.com/support/manuals/en-us/powervault-me4084/" },
    { label: "APC Smart-UPS SMT1500RM2U", url: "https://www.apc.com/us/en/product/SMT1500RM2U/" },
  ],
};
