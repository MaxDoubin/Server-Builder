/**
 * A storage rack: spinning disks, the network that feeds them, and power.
 *
 * Worth noting where the honest numbers land in this one. Synology is the
 * rare vendor that publishes real measured consumption rather than a supply
 * rating, and it publishes two figures: draw while the disks are spinning
 * and draw with them parked. Both are quoted below, because the gap between
 * them is the entire argument for disk hibernation on an archive tier.
 *
 * Dell and HPE, by contrast, publish chassis configurations and PSU
 * ratings, so their `watts` is null. That asymmetry is real and the page
 * shows it rather than papering over it with an invented average.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Illustrative traffic on a lit port, 0 to 1, deterministic per port. */
const activityFor = (n: number): number =>
  Math.round((((n * 37) % 61) / 60) * 100) / 100;

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
  net: "#ccff00",
  nas: "#4cf1f1",
  archive: "#ffa114",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const storageRack: RackDefinition = {
  slug: "storage-12u",
  name: "Storage 12U",
  blurb:
    "Where the bytes actually live: a 10 gigabit switch on top because storage is only as fast as the pipe to it, two Synology rack units for the hot tier, a 12-bay JBOD shelf for the archive, and a UPS that exists specifically so a power blink never lands in the middle of a write.",
  height: 12,

  devices: [
    {
      id: "crs309",
      u: 1,
      vendor: "MikroTik",
      model: "CRS309-1G-8S+IN",
      role: "Eight 10G SFP+ cages feeding the storage tier. A NAS with four bonded gigabit links tops out around 470 megabytes per second on paper and far less in practice; one 10G link removes the network from the conversation entirely. Published maximum 23W, or 17W without attachments.",
      family: "switch",
      finish: "black",
      groupsOf: 4,
      // 8x SFP+ plus 1x GbE management, per the product page.
      ports: [
        { kind: "rj45", label: "MGMT", led: "green", activity: 0.08 },
        ...run("sfp-plus", 8, (n) => `SFP+ ${n}`, 5, "blue"),
      ],
      watts: 23,
      accent: ACCENT.net,
      url: "https://mikrotik.com/product/crs309_1g_8s_in",
    },
    {
      id: "rs1221-hot",
      u: 2,
      vendor: "Synology",
      model: "RackStation RS1221+ (hot tier)",
      role: "Eight bays of SATA on a 2U chassis with four gigabit LAN ports and a PCIe slot, here carrying a 10G card to the switch above. Synology publishes 49.89W while the disks are working and 22.64W with them hibernating, which is an unusually honest pair of numbers for this industry.",
      family: "storage",
      finish: "dark",
      // 8x 3.5 inch SATA bays, all fitted on the hot tier.
      bays: { count: 8, occupied: 8, label: "3.5 inch SATA" },
      // 4x 1GbE RJ45, 2x USB 3.2 Gen 1, 1x eSATA expansion, per Synology.
      ports: [
        ...run("rj45", 4, (n) => `LAN ${n}`, 2),
        { kind: "usb", label: "USB 3.2 Gen 1", led: "off" },
        { kind: "usb", label: "USB 3.2 Gen 1", led: "off" },
      ],
      leds: ["green", "green", "off"],
      // Access power consumption, Synology's own published figure.
      watts: 50,
      accent: ACCENT.nas,
      url: "https://www.synology.com/en-global/products/RS1221+",
    },
    {
      id: "rs1221-cold",
      u: 2,
      vendor: "Synology",
      model: "RackStation RS1221+ (backup target)",
      role: "The second copy, and the reason this rack is a backup strategy rather than a single point of failure. Six of eight bays fitted, receiving snapshot replication from the hot tier. Same published figures: 49.89W working, 22.64W hibernating, and this one spends most of its life at the lower number.",
      family: "storage",
      finish: "dark",
      bays: { count: 8, occupied: 6, label: "3.5 inch SATA" },
      ports: [
        ...run("rj45", 4, (n) => `LAN ${n}`, 1),
        { kind: "usb", label: "USB 3.2 Gen 1", led: "off" },
        { kind: "usb", label: "USB 3.2 Gen 1", led: "off" },
      ],
      leds: ["green", "off", "off"],
      // Hibernation figure, because this box is idle most of the day. The
      // 49.89W access figure applies during the replication window.
      watts: 23,
      accent: ACCENT.nas,
      url: "https://www.synology.com/en-global/products/RS1221+",
    },
    {
      id: "jbod",
      u: 2,
      vendor: "Generic",
      model: "12-bay SAS JBOD expansion shelf",
      role: "Dumb capacity: twelve 3.5 inch bays with a SAS expander and no compute at all, cabled to the host above. A JBOD has no opinions about your data, which is exactly what you want under a filesystem like ZFS that insists on talking to the disks directly.",
      family: "storage",
      finish: "dark",
      bays: { count: 12, occupied: 9, label: "3.5 inch SAS" },
      leds: ["green", "off"],
      watts: null,
      accent: ACCENT.archive,
    },
    {
      id: "mgr",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Fibre patch leads bend badly and break quietly. This is where the SFP+ jumpers turn without exceeding their bend radius.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "blank-1",
      u: 1,
      vendor: "Generic",
      model: "Vented blanking panel",
      role: "Airflow discipline. Disk shelves run warm and a bypass path is the difference between 38 and 45 degrees on the top drive.",
      family: "blank",
      look: "vented",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Metered rack PDU, 8x C13",
      role: "Metering matters more here than anywhere else in the library, because the Synology figures are the only published draw in the rack and everything else has to be measured rather than looked up.",
      family: "pdu",
      finish: "black",
      ports: run("power", 8, (n) => `C13-${n}`, 5),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "ups",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "The single most important box in a storage rack. A two-second blink during a write can leave a filesystem inconsistent and a RAID array resyncing for hours; the UPS turns that into a non-event and, wired to the NAS over USB, triggers a clean shutdown if the outage outlasts the battery.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "off", "off"],
      watts: null,
      accent: ACCENT.power,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],

  sources: [
    {
      label: "MikroTik product page: CRS309-1G-8S+IN",
      url: "https://mikrotik.com/product/crs309_1g_8s_in",
    },
    {
      label: "Synology product page: RackStation RS1221+",
      url: "https://www.synology.com/en-global/products/RS1221+",
    },
    {
      label: "APC product page: Smart-UPS SMT1500RM2U",
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],
};
