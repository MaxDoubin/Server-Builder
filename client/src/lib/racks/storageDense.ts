/**
 * A 42U high density storage rack.
 *
 * The opposite problem to every other rack in this library. Those are
 * covered in ports, carriers and indicators; a high density shelf loads
 * from the top, so its front is two flat drawer faces with a pull handle
 * and a light bar and nothing else at all. Eighty four drives behind it
 * and you cannot see one of them.
 *
 * That is the thing worth drawing. This rack reads as almost blank next
 * to a rack of switches, and it holds more spinning storage than
 * everything else in the library put together.
 *
 * Two exceptions sit at the ends: a controller head, which is an ordinary
 * 2U server front because that is what it is, and a tape library, which
 * has the only window in any of these racks.
 *
 * `watts` is null throughout. The ME4084's published 2200W is its two
 * power supplies' rating at 200-240 VAC, not what a populated shelf
 * draws, and quoting a supply rating as consumption would overstate it by
 * most of a kilowatt.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

const activityFor = (n: number): number => Math.round((((n * 23) % 43) / 42) * 100) / 100;

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
  head: "#ccff00",
  shelf: "#7c9cff",
  archive: "#ffa114",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const storageDenseRack: RackDefinition = {
  slug: "storage-dense-42u",
  name: "Dense Storage 42U",
  blurb:
    "The blankest rack in this library and the one that holds the most. A high density shelf loads from the top, so its whole front is two drawer faces with a pull handle and a light bar: eighty four drives behind each one and not a single carrier visible. Next to a rack of switches it looks like nothing is happening. Two things break the pattern, at either end: a controller head, which is an ordinary server front, and a tape library, which has the only window in any of these racks.",
  height: 42,

  devices: [
    {
      id: "SAS_FABRIC",
      u: 1,
      vendor: "Generic",
      model: "16-port storage fabric switch",
      role: "Sixteen high speed ports connecting the controller head to everything below it. In a storage rack the fabric is short and fat: few ports, all of them fast, none of them going further than the rack itself.",
      family: "switch",
      finish: "dark",
      ports: run("qsfp", 16, (n) => `P${n}`, 11, "blue"),
      watts: null,
      accent: ACCENT.fabric,
    },
    {
      id: "CABLE_MANAGER_TOP",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "D-rings between the fabric and the head. Storage cabling is short, thick and unforgiving about bend radius, which makes the manager matter more here than in a switch rack.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "CONTROLLER_HEAD",
      u: 2,
      vendor: "Generic",
      model: "Dual controller storage head",
      role: "The brain, and the only conventional server front in the rack: twenty four small form factor bays with two controller modules beside them. Two controllers rather than one is the whole design; either can serve every disk in the rack, so replacing one is a maintenance task rather than an outage.",
      family: "storage",
      finish: "dark",
      bays: { count: 24, occupied: 20, label: "2.5 inch bays", rows: 1 },
      watts: null,
      accent: ACCENT.head,
    },
    {
      id: "ME4084_A",
      u: 5,
      vendor: "Dell",
      model: "PowerVault ME4084 expansion enclosure",
      role: "Five rack units, eighty four 3.5 inch drives, and a front you can read in one glance because there is nothing on it. Two drawers pull up and out on rails and the disks are fitted from above. The published 2200W is the rating of its two supplies at 200 to 240 volts, not what a populated shelf draws.",
      family: "storage",
      finish: "dark",
      bays: { count: 84, occupied: 84, label: "3.5 inch bays in two top load drawers", drawers: 2 },
      watts: null,
      accent: ACCENT.shelf,
      url: "https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/5u84-enclosure-chassis",
    },
    {
      id: "ME4084_B",
      u: 5,
      vendor: "Dell",
      model: "PowerVault ME4084 expansion enclosure",
      role: "The second shelf, partly populated. Buying the enclosure and filling it over time is the normal way to do this: the chassis, the supplies and the rack space are the fixed cost, and drives get cheaper every year you wait.",
      family: "storage",
      finish: "dark",
      bays: { count: 84, occupied: 66, label: "3.5 inch bays in two top load drawers", drawers: 2 },
      watts: null,
      accent: ACCENT.shelf,
      url: "https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/5u84-enclosure-chassis",
    },
    {
      id: "DS460_C",
      u: 4,
      vendor: "Generic",
      model: "4U 60-bay top load enclosure",
      role: "A shorter shelf with three drawers instead of two. Sixty drives in four rack units rather than eighty four in five: slightly less dense, and it fits sites whose floor loading will not take the taller one. A full shelf of this size weighs as much as a person and a half.",
      family: "storage",
      finish: "dark",
      bays: { count: 60, occupied: 42, label: "3.5 inch bays in three top load drawers", drawers: 3 },
      watts: null,
      accent: ACCENT.shelf,
    },
    {
      id: "FLASH_SHELF",
      u: 2,
      vendor: "Generic",
      model: "24-bay all-flash shelf",
      role: "The fast tier. Twenty four solid state drives in front loading carriers, because flash is small enough that density is not the constraint and you want to be able to swap one without opening a drawer. Everything above it is capacity; this is latency.",
      family: "storage",
      finish: "dark",
      bays: { count: 24, occupied: 24, label: "2.5 inch flash bays", rows: 1 },
      watts: null,
      accent: ACCENT.head,
    },
    {
      id: "TAPE_LIBRARY",
      u: 4,
      vendor: "Generic",
      model: "LTO tape library, 20 cartridge slots",
      role: "The only window in any rack in this library, and it is there so an operator can watch the robot pick a cartridge. Tape is slow, cheap, and the only medium here that is offline when it is not being written to, which is precisely what makes it the last line against something that encrypts everything it can reach.",
      family: "storage",
      finish: "black",
      display: "server",
      bays: { count: 20, occupied: 14, label: "LTO cartridge slots" },
      watts: null,
      accent: ACCENT.archive,
    },
    {
      id: "CABLE_MANAGER_LOW",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "The second manager, keeping the shelf interconnects off the power feeds below.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "ME484",
      u: 5,
      vendor: "Dell",
      model: "PowerVault ME484 expansion enclosure",
      role: "Eighty four bays in five rack units and nothing on the front but two drawer faces, because the disks come out upwards on rails. This one is a pure JBOD rather than an array: no controllers of its own, hanging off the ME4084s twenty units up, of which each will take three.",
      family: "storage",
      finish: "dark",
      bays: { count: 84, occupied: 76, label: "3.5 inch bays in two top load drawers", drawers: 2 },
      watts: null,
      accent: ACCENT.shelf,
      url: "https://i.dell.com/sites/csdocuments/product_docs/en/powervault-me484-jbod-spec-sheet.pdf",
    },
    {
      id: "POWERSTORE_500T",
      u: 2,
      vendor: "Dell",
      model: "PowerStore 500T",
      role: "The flash tier the shelves cannot be. Everything else here is SAS capacity reached over a fabric; this is twenty five NVMe in a two unit enclosure with two active nodes, and the one array in the rack where the drives cost more than the box around them. Drawn with the bezel off, next to a DD3300 that keeps its, because one of each shows more than two grey fronts.",
      family: "storage",
      finish: "dark",
      bays: { count: 25, occupied: 25, label: "NVMe bays" },
      watts: null,
      accent: ACCENT.head,
      url: "https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/dell-powerstore-gen2-spec-sheet.pdf",
    },
    {
      id: "R760XD2",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R760xd2",
      role: "The server that drives the tape library, which until now had nothing driving it. A library with no host is an orphan: something has to stage backups to disk and stream them out, and that job is a two unit box full of spinning disk rather than a thin one full of cores. Twelve carriers on the front and sixteen more inside.",
      family: "server",
      finish: "dark",
      bays: { count: 12, occupied: 12, label: "3.5 inch front bays, 28 total", rows: 3 },
      watts: null,
      accent: ACCENT.archive,
      url: "https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760xd2-technical-guide.pdf",
    },
    {
      id: "DD3300",
      u: 2,
      vendor: "Dell",
      model: "PowerProtect DD3300",
      role: "The piece that makes the tape library part of a chain rather than an orphan. Without a deduplicating target the rack holds disk and it holds tape and nothing connects them: this takes the daily full that is almost entirely the same as yesterday's and stores the difference, which is what turns the library into the copy that leaves the building instead of the only copy there is.",
      family: "storage",
      finish: "dark",
      bays: { count: 12, occupied: 12, label: "3.5 inch bays behind the bezel" },
      watts: null,
      accent: ACCENT.archive,
      url: "https://www.dell.com/support/manuals/en-us/dd-os-8.0/dd_p_8.0_spec_guide/dd3300-system-specifications",
    },
    {
      id: "STORAGE_PDU",
      u: 2,
      vendor: "Generic",
      model: "Switched rack PDU, 16 outlets",
      role: "Fourteen of sixteen outlets in use. Every shelf here has two supplies and each wants a separate feed, so a storage rack runs out of outlets long before it runs out of rack units.",
      family: "pdu",
      finish: "dark",
      display: "ups",
      ports: Array.from({ length: 16 }, (_, i): RackPort => ({ kind: "power", label: String(i + 1).padStart(2, "0") })),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "STORAGE_UPS",
      u: 4,
      vendor: "Generic",
      model: "Rack UPS with external battery tray",
      role: "Ride-through matters more here than anywhere. A switch that loses power comes back; an array that loses power mid-write comes back and then has to work out what it was doing. Its draw depends on the load it carries, so no single figure would be honest.",
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
      label: "Dell owner's manual: PowerVault ME4 series 5U84 enclosure chassis",
      url: "https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/5u84-enclosure-chassis",
    },
    {
      label: "Dell: PowerVault ME4084 expansion",
      url: "https://www.dell.com/en-us/shop/ipovw/powervault-me484-expansion",
    },
  ],
};
