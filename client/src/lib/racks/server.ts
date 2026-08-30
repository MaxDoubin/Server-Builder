/**
 * A compute rack: two vendors' 2U servers, a top-of-rack switch, and power.
 *
 * This is the rack that teaches the power lesson hardest. Neither HPE nor
 * Dell publishes a device consumption figure for these servers, because
 * there genuinely is not one: a DL380 Gen10 with one low-power CPU and no
 * drives and the same chassis with two 205W CPUs, twenty-four SFF disks and
 * a GPU are the same model number and differ by an order of magnitude. What
 * they publish is the supply options you can fit. So `watts` is null on
 * every server here, and the metered PDU at the bottom is not decoration:
 * it is the only way anyone finds out what this rack actually draws.
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
  hpe: "#01a982",
  dell: "#0076ce",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const serverRack: RackDefinition = {
  slug: "compute-14u",
  name: "Compute 14U",
  blurb:
    "Two vendors of 2U server in one rack, which is what a real refresh cycle looks like rather than a vendor brochure. An HPE DL380 Gen10 and a Dell R730 under a 10 gigabit top-of-rack switch, with a metered PDU at the bottom because nobody publishes what any of this actually draws.",
  height: 14,

  devices: [
    {
      id: "tor",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24G-2S+RM (top of rack)",
      role: "The top-of-rack switch: every server's management and data ports land here, and two 10G SFP+ cages carry the aggregate up to the core. Passively cooled at a published 24W, which in a rack full of screaming server fans is a rounding error.",
      family: "switch",
      finish: "black",
      groupsOf: 8,
      ports: [
        ...run("rj45", 24, (n) => `${n}`, 11),
        { kind: "sfp-plus", label: "SFP+ 1", led: "blue", activity: 0.74 },
        { kind: "sfp-plus", label: "SFP+ 2", led: "blue", activity: 0.31 },
      ],
      watts: 24,
      accent: ACCENT.net,
      url: "https://mikrotik.com/product/CRS326-24G-2SplusRM",
    },
    {
      id: "mgr-1",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Server racks generate more cable than network racks do, because every box wants two power leads, a data link and a management link. This is where they get combed.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "dl380",
      u: 2,
      vendor: "HPE",
      model: "ProLiant DL380 Gen10, 8 SFF chassis",
      role: "The most widely deployed 2U server of its generation. This is the eight-bay small-form-factor chassis, which HPE documents as upgradeable to sixteen or twenty-four SFF bays with additional drive boxes. iLO 5 handles out-of-band management, so the box can be rebuilt from a browser with the operating system entirely gone.",
      family: "server",
      finish: "dark",
      display: "server",
      // 8 SFF hot-plug bays per the QuickSpecs base configuration, all fitted.
      bays: { count: 8, occupied: 8, label: "2.5 inch SFF hot-plug" },
      // Front panel beyond the bays: 2x USB and a display port are standard
      // on the 8 SFF configuration, plus the iLO management port.
      ports: [
        { kind: "usb", label: "USB 2.0", led: "off" },
        { kind: "usb", label: "USB 2.0", led: "off" },
        { kind: "rj45", label: "iLO 5 management", led: "green", activity: 0.06 },
      ],
      leds: ["green", "off", "off"],
      // HPE publishes supply options, not consumption. A DL380 with one
      // low-power CPU and no disks, and one with two 205W CPUs and 24
      // drives, are the same model and differ tenfold.
      watts: null,
      accent: ACCENT.hpe,
      url: "https://www.hpe.com/psnow/doc/a00008180enw.pdf",
    },
    {
      id: "r730",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R730, 8x 3.5 inch chassis",
      role: "The other half of the refresh, and the reason mixed-vendor racks exist: nobody replaces everything at once. Eight 3.5 inch bays for bulk capacity where the HPE above carries fast SFF disks, with iDRAC filling the same out-of-band role as iLO.",
      family: "server",
      finish: "dark",
      display: "server",
      bays: { count: 8, occupied: 7, label: "3.5 inch hot-plug" },
      ports: [
        { kind: "usb", label: "USB", led: "off" },
        { kind: "usb", label: "USB", led: "off" },
        { kind: "rj45", label: "iDRAC management", led: "green", activity: 0.05 },
      ],
      leds: ["green", "amber", "off"],
      watts: null,
      accent: ACCENT.dell,
      url: "https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf",
    },
    {
      id: "blank-1",
      u: 1,
      vendor: "Generic",
      model: "Vented blanking panel",
      role: "Between the servers and the growth space. Servers pull air front to back hard enough that an open rack unit genuinely steals cold air from the intake above it.",
      family: "blank",
      look: "vented",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "blank-2",
      u: 4,
      vendor: "Generic",
      model: "4U solid blanking panel",
      role: "Two more server slots, reserved and closed off. Leaving the space is deliberate: a rack filled to its last unit has nowhere to put the replacement during a migration, so the next refresh means downtime instead of a cutover.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Metered rack PDU, 12x C13 and 4x C19",
      role: "The instrument that answers the question the datasheets do not. C19 outlets for the servers' higher-current supplies and C13 for everything else, with per-outlet metering so a runaway box shows up as a number rather than as a tripped breaker at two in the morning.",
      family: "pdu",
      finish: "black",
      ports: [
        ...run("power", 12, (n) => `C13-${n}`, 7),
        ...run("power", 4, (n) => `C19-${n}`, 4),
      ],
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "ups",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Sized for ride-through and orderly shutdown rather than for running two servers indefinitely. Anything longer than a few minutes of full compute load is a generator's problem, and pretending otherwise is how people end up with a UPS that dies before the shutdown script finishes.",
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
      label: "HPE QuickSpecs: ProLiant DL380 Gen10 Server",
      url: "https://www.hpe.com/psnow/doc/a00008180enw.pdf",
    },
    {
      label: "Dell spec sheet: PowerEdge R730",
      url: "https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf",
    },
    {
      label: "MikroTik product page: CRS326-24G-2S+RM",
      url: "https://mikrotik.com/product/CRS326-24G-2SplusRM",
    },
    {
      label: "APC product page: Smart-UPS SMT1500RM2U",
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],
};
