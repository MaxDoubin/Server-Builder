/**
 * A homelab rack: mixed vendors, secondhand compute, and one honest UPS.
 *
 * This is the rack most people actually build first, so it follows the same
 * rules as the single-vendor racks in this library: every port count and
 * wattage is the vendor's published figure with a link to where it was read,
 * and anything the vendor does not publish is null rather than guessed. The
 * R730 is the canonical eBay homelab server and Dell's spec sheet for it is
 * cited below; Dell publishes chassis configurations and supply ratings,
 * not idle draw, so its `watts` stays null.
 *
 * `led`, `activity` and bay occupancy are illustrative: a plausible fit-out
 * generated deterministically, so the prerendered markup and the hydrated
 * DOM agree. They are not measurements.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Two-digit label for a patch field position, so A01 sorts next to A02. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

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

/** Ports on a passive panel: no `led` at all, because there is none to light. */
function passive(
  kind: RackPort["kind"],
  count: number,
  label: (n: number) => string,
): RackPort[] {
  return Array.from({ length: count }, (_, i): RackPort => ({
    kind,
    label: label(i + 1),
  }));
}

const ACCENT = {
  switch: "#ccff00",
  compute: "#4cf1f1",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const homelabRack: RackDefinition = {
  slug: "homelab-10u",
  name: "Homelab 10U",
  blurb:
    "The rack most people build first: a patch panel because future you deserves one, a quiet MikroTik switch, a secondhand Dell R730 that costs less than a games console and virtualizes everything, a shelf for the machine that refuses to be rack-shaped, and a UPS so a two-second blink does not eat the ZFS pool.",
  height: 10,

  devices: [
    {
      id: "patch-a",
      u: 1,
      vendor: "Generic",
      model: "24-port keystone patch panel",
      role: "Eight runs terminated, sixteen keystones open. A patch panel in a homelab feels like overkill until the first time a cable needs re-terminating at midnight, at which point it becomes the best thirty dollars in the rack.",
      family: "patch",
      finish: "dark",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 8, (n) => `A${pad2(n)}`),
        ...passive("blank", 16, (n) => `A${pad2(n + 8)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "crs326",
      u: 1,
      vendor: "MikroTik",
      model: "CRS326-24G-2S+RM",
      role: "The lab switch: 24 gigabit copper ports and two 10G SFP+ cages, passively cooled, at a published maximum of 24W. Silence is a real spec when the rack lives in a bedroom closet, and this switch has no fans to fail.",
      family: "switch",
      finish: "black",
      groupsOf: 8,
      // 24x GbE plus 2x SFP+, per the product page. One SFP+ carries 10G
      // to the R730 below; eight copper ports match the patch field above.
      ports: [
        ...run("rj45", 24, (n) => `${n}`, 8),
        { kind: "sfp-plus", label: "SFP+ 1", led: "blue", activity: 0.62 },
        { kind: "sfp-plus", label: "SFP+ 2", led: "off" },
      ],
      watts: 24,
      accent: ACCENT.switch,
      url: "https://mikrotik.com/product/CRS326-24G-2SplusRM",
    },
    {
      id: "shelf",
      u: 1,
      vendor: "Generic",
      model: "Cantilever rack shelf",
      role: "For the hardware that refuses to be rack-shaped. Here it holds a mini PC running the firewall, which is how most homelabs actually route: a small box on a shelf doing more work than its size suggests.",
      family: "blank",
      look: "shelf",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "r730",
      u: 2,
      vendor: "Dell",
      model: "PowerEdge R730, 8x 3.5 inch chassis",
      role: "The homelab workhorse: a two-socket 2U server that sold by the hundred thousand and now costs less used than a mid-range graphics card. This one is the eight-bay 3.5 inch chassis from Dell's spec sheet, running a hypervisor with six bays populated for the ZFS pool. Dell publishes supply ratings for it, not draw, so the honest wattage figure is the one on your own meter.",
      family: "server",
      finish: "dark",
      display: "server",
      // The 8x 3.5 inch hot-plug chassis is one of the factory
      // configurations on Dell's spec sheet. Six sleds fitted here for a
      // six-wide RAIDZ2, two bays open for the inevitable expansion.
      bays: { count: 8, occupied: 6, label: "3.5 inch hot-plug" },
      leds: ["green", "off"],
      watts: null,
      accent: ACCENT.compute,
      url: "https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf",
    },
    {
      id: "mgr",
      u: 1,
      vendor: "Generic",
      model: "Horizontal cable manager",
      role: "Keeps the patch leads combed. In a ten-unit rack the temptation is to skip this and stretch cables diagonally; six months later every photo of the rack is an apology.",
      family: "blank",
      look: "fingers",
      watts: null,
      accent: ACCENT.passive,
    },
    {
      id: "pdu",
      u: 1,
      vendor: "Generic",
      model: "Switched rack PDU, 8x C13",
      role: "Eight switched outlets, which is the upgrade every homelab makes second and should have made first. The UPS below has four sockets on its back and this rack already has five things that want one, so before the strip went in something was running off an extension lead on the floor.",
      family: "pdu",
      finish: "black",
      ports: run("power", 8, (n) => `C13-${n}`, 5),
      watts: null,
      accent: ACCENT.power,
    },
    {
      id: "smt1500",
      u: 2,
      vendor: "APC",
      model: "Smart-UPS SMT1500RM2U",
      role: "Line-interactive UPS, 1500VA at 120V, six NEMA 5-15R outlets on the rear. Its job here is not riding out an outage, it is surviving the two-second blink that would otherwise interrupt a ZFS write and force a scrub. Draw depends on load, so no single figure is quoted.",
      family: "ups",
      finish: "dark",
      display: "ups",
      leds: ["green", "off", "off"],
      watts: null,
      accent: ACCENT.power,
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
    {
      id: "blank-2",
      u: 1,
      vendor: "Generic",
      model: "Solid blanking panel",
      role: "The bottom unit, closed off. Heavy things live low in a rack, and the UPS above is the heaviest thing here.",
      family: "blank",
      look: "solid",
      watts: null,
      accent: ACCENT.passive,
    },
  ],

  sources: [
    {
      label: "MikroTik product page: CRS326-24G-2S+RM",
      url: "https://mikrotik.com/product/CRS326-24G-2SplusRM",
    },
    {
      label: "Dell spec sheet: PowerEdge R730",
      url: "https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf",
    },
    {
      label: "APC product page: Smart-UPS SMT1500RM2U",
      url: "https://www.apc.com/us/en/product/SMT1500RM2U/",
    },
  ],
};
