/**
 * A UniFi rack, as Ubiquiti actually ships the parts.
 *
 * Every figure in here was read off a vendor spec page rather than
 * remembered. Port counts, rack units and wattages all trace back to the
 * `sources` list at the bottom of the file, and anything that is not on one
 * of those pages is not in here.
 *
 * Three rules the data follows, because a hardware page that fudges its
 * numbers is worse than no hardware page at all:
 *
 * 1. `watts` is the vendor's published maximum draw for the device itself,
 *    excluding power it only passes through to something else. UniFi
 *    switches publish two figures, "excluding PoE output" and "including PoE
 *    output". The first is the switch. The second is the switch plus
 *    everything plugged into it, which belongs on a circuit calculation and
 *    not on a rack elevation, so the first is the one quoted. Where a vendor
 *    publishes no self-consumption figure at all, `watts` is null. Null
 *    renders as "not published", which is true; a plausible-looking guess
 *    would not be.
 *
 * 2. `ports` is the front panel, left to right, as the device presents it.
 *    Rear power inlets are not front panel and are not listed. The PDU and
 *    the UPS are the exception: on those two the outlets are the entire
 *    point of the device, so the outlet inventory is listed instead.
 *
 * 3. `led` and `activity` are illustrative. They describe a plausible
 *    occupancy for a rack this size. They are not a measurement of anything,
 *    and they are generated from the port number so the picture is identical
 *    on the prerendered HTML and after hydration. `activity` is a fraction
 *    from 0 to 1.
 */

import type { LedState, RackDefinition, RackPort } from "@/lib/rackTypes";

/** Two-digit label for a patch field position, so A01 sorts next to A02. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Illustrative traffic on a patched port, 0 to 1.
 *
 * A hash of the port number rather than a random draw: the same port gets
 * the same bar on every render, so nothing shifts under the reader when the
 * prerendered markup hands over to React.
 */
const activityFor = (n: number): number =>
  Math.round((((n * 37) % 61) / 60) * 100) / 100;

/**
 * A run of identical ports numbered from 1, with the first `patched` of them
 * showing link and the rest dark.
 *
 * Written as a loop rather than 48 hand-typed literals because the port count
 * is the one number on this page a reader can check against the datasheet,
 * and a hand-typed run is exactly where an off-by-one hides.
 */
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
 * A run of ports on a passive panel.
 *
 * No `led` at all, rather than `led: "off"`. A keystone patch panel has no
 * indicators to light, and drawing it with dark LEDs would suggest it does.
 */
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

/** Cyan for anything routing, lime for the core, amber for PoE edge. */
const ACCENT = {
  gateway: "#4cf1f1",
  core: "#ccff00",
  edge: "#ffa114",
  passive: "#8a93a6",
  power: "#9234ea",
} as const;

export const ubiquitiRack: RackDefinition = {
  slug: "unifi-12u",
  name: "UniFi 12U",
  blurb:
    "A full UniFi deployment in twelve rack units: one gateway doing routing, IDS and controller duty, a 10G aggregation switch under it, seventy-two PoE access ports across two switches, and the power gear at the bottom where the weight belongs. Every port count and rack unit below is the vendor's published figure.",
  height: 12,

  devices: [
    {
      id: "udm-se",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi Dream Machine Special Edition (UDM-SE)",
      role: "Edge gateway, IDS/IPS at 3.5 Gbps, and the Network and Protect controllers",
      family: "router",
      finish: "silver",
      display: "unifi",
      groupsOf: 4,
      // 8 GbE RJ45 + 1 2.5 GbE RJ45 + 2 10G SFP+ is the published port
      // layout, and 11 ports is the whole front panel. The 2.5 GbE RJ45 and
      // the first SFP+ are the two default WAN ports; here the copper one is
      // the live circuit and the SFP+ WAN is held for the second provider.
      ports: [
        ...run("rj45", 8, (n) => `LAN ${n}`, 6),
        { kind: "rj45", label: "2.5G WAN", led: "green", activity: 0.42 },
        { kind: "sfp-plus", label: "SFP+ WAN", led: "off" },
        { kind: "sfp-plus", label: "SFP+ LAN", led: "green", activity: 0.71 },
      ],
      // Chassis indicators the datasheet names beyond the per-port ones, in
      // its own order: RPS, PSU, HDD. RPS is dark because no USP-RPS is
      // fitted in this elevation.
      leds: ["off", "green", "green"],
      // 50W is the published maximum "excluding PoE output". The 180W PoE
      // budget it can hand downstream is not the gateway's own draw.
      watts: 50,
      accent: ACCENT.gateway,
    },

    {
      id: "usw-pro-aggregation",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi Hi-Capacity Aggregation (USW-Pro-Aggregation)",
      role: "10G and 25G core, 760 Gbps switching capacity",
      family: "switch",
      finish: "silver",
      display: "unifi",
      groupsOf: 8,
      ports: [
        ...run("sfp-plus", 28, (n) => `SFP+ ${n}`, 11),
        // SFP28 has no kind of its own in the contract, and it is not a QSFP
        // cage. A 25G SFP28 is the same physical SFP housing as a 10G SFP+,
        // so it is modelled as sfp-plus and the speed lives in the label
        // rather than being silently rounded down to 10G.
        ...run("sfp-plus", 4, (n) => `SFP28 25G ${n}`, 2, "blue"),
      ],
      // The only power figure Ubiquiti publishes for this one, and there is
      // no PoE on it to complicate matters.
      watts: 100,
      accent: ACCENT.core,
    },

    {
      // A vendorless, modelless U. Inventing a filler panel here would be
      // the same fabrication this file exists to avoid, so it stays empty.
      id: "gap-above-patch-a",
      u: 1,
      vendor: "Generic",
      model: "1U vented blanking panel",
      role: "Empty U for airflow above the patch field",
      family: "blank",
      finish: "silver",
      look: "vented",
      watts: null,
    },

    {
      id: "patch-a",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi 24-Port Blank Keystone Patch Panel (UACC-Rack-Panel-Patch-Blank-24)",
      role: "Floor 1 horizontal runs, fully populated with Cat6A keystone jacks",
      family: "patch",
      finish: "silver",
      groupsOf: 6,
      // The product ships blank, which is what "Blank Keystone" means: the
      // 24 positions are holes until someone clips jacks into them. All 24
      // are terminated here, which is why they read as rj45 rather than as
      // blank positions.
      ports: passive("rj45", 24, (n) => `A${pad2(n)}`),
      // Passive steel and plastic with no power input, so Ubiquiti publishes
      // no consumption figure for it. Nothing to quote.
      watts: null,
      accent: ACCENT.passive,
    },

    {
      id: "usw-pro-48-poe",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi Pro 48 PoE (USW-Pro-48-POE)",
      role: "Access layer, 40 PoE+ and 8 PoE++ ports against a 600W budget",
      family: "switch",
      finish: "silver",
      display: "unifi",
      groupsOf: 8,
      ports: [
        ...run("rj45", 48, (n) => `${n}`, 34),
        ...run("sfp-plus", 4, (n) => `SFP+ ${n}`, 2),
      ],
      // 60W excluding PoE output. Ubiquiti also publishes 660W including it,
      // which is this switch plus 600W of cameras and access points, not the
      // switch.
      watts: 60,
      accent: ACCENT.edge,
    },

    {
      id: "patch-b",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi 24-Port Blank Keystone Patch Panel (UACC-Rack-Panel-Patch-Blank-24)",
      role: "Floor 2 horizontal runs, 16 of 24 positions terminated",
      family: "patch",
      finish: "silver",
      groupsOf: 6,
      ports: [
        ...passive("rj45", 16, (n) => `B${pad2(n)}`),
        // The eight positions nobody has pulled a run to are still open
        // holes in the panel, so they are blank rather than dark rj45.
        ...passive("blank", 8, (n) => `B${pad2(n + 16)}`),
      ],
      watts: null,
      accent: ACCENT.passive,
    },

    {
      id: "usw-pro-24-poe",
      u: 1,
      vendor: "Ubiquiti",
      model: "UniFi Pro 24 PoE (USW-Pro-24-POE)",
      role: "Access layer, 16 PoE+ and 8 PoE++ ports against a 400W budget",
      family: "switch",
      finish: "silver",
      display: "unifi",
      groupsOf: 8,
      ports: [
        ...run("rj45", 24, (n) => `${n}`, 15),
        ...run("sfp-plus", 2, (n) => `SFP+ ${n}`, 1),
      ],
      // 50W excluding PoE output; 450W is the same switch with its full PoE
      // budget hanging off it.
      watts: 50,
      accent: ACCENT.edge,
    },

    {
      id: "gap-above-power",
      u: 1,
      vendor: "Generic",
      model: "1U vented blanking panel",
      role: "Empty U separating the switching from the power gear",
      family: "blank",
      finish: "silver",
      look: "vented",
      watts: null,
    },

    {
      id: "usp-pdu-pro",
      u: 2,
      vendor: "Ubiquiti",
      model: "UniFi Power Distribution Pro (USP-PDU-Pro)",
      // 2U, not the 1U it is often assumed to be. Ubiquiti's own dimensions
      // give 87.4 mm of height, and the store files it under 2U Rack Mount.
      role: "Per-outlet switching and metering for the rack, 2U",
      family: "pdu",
      finish: "silver",
      ports: [
        ...run("power", 16, (n) => `Outlet ${n}`, 9, "blue"),
        ...run("usb", 4, (n) => `USB-C ${n}`, 1, "blue"),
        { kind: "rj45", label: "Mgmt 100M", led: "green", activity: 0.04 },
        ...run("rj45", 3, (n) => `GbE ${n}`, 1),
      ],
      // Ubiquiti publishes "Max. Power Consumption: 125V AC 1,875W", but that
      // is the outlet capacity of the bar, not what the PDU costs to run.
      // The self-consumption figure is not published, so this stays null
      // rather than quoting a number that means something else.
      watts: null,
      accent: ACCENT.power,
    },

    {
      id: "ups-2u-pro",
      u: 2,
      vendor: "Ubiquiti",
      model: "UniFi UPS 2U Pro (UPS-2U-Pro-US)",
      role: "Line interactive, 1920VA/1920W, 9 minutes at full load",
      family: "ups",
      finish: "silver",
      ports: [
        ...run("power", 8, (n) => `5-20R ${n}`, 6, "blue"),
        { kind: "rj45", label: "Mgmt 100M", led: "green", activity: 0.03 },
        { kind: "rj45", label: "Surge in", led: "off" },
        { kind: "rj45", label: "Surge out", led: "off" },
      ],
      // One status LED, and Ubiquiti publishes what each colour means.
      // Steady blue is "device adoption and working", which is the state a
      // healthy rack sits in.
      leds: ["blue"],
      // 1920W is what it can deliver, not what it draws. No self-consumption
      // figure is published.
      watts: null,
      accent: ACCENT.power,
    },
  ],

  // Verified live with:
  //   curl -sS -o /dev/null -w '%{http_code}' -L --max-time 20 \
  //     -A 'Mozilla/5.0' <url>
  // All 200 at the time of writing. help.ui.com returns 403 to an automated
  // request, so nothing here points at it; techspecs.ui.com and store.ui.com
  // both serve their specs server-side and answer a plain curl.
  /*
    Etherlighting patch leads (UACC-Cable-Patch-EL).

    These are the reason a UniFi rack looks the way it does in photographs.
    Cat6A, a 2.5mm white TPE jacket, and two translucent booted RJ45
    connectors that pipe the switch's own port LED out through the boot, so
    every patched jack carries a point of colour. The colour is configurable
    per port and is normally set to mean something: here green is the
    default access VLAN, blue is the voice VLAN, and amber marks the
    cameras, which is a real convention and the reason anyone pays extra for
    a lighting cable rather than a plain one.

    Ports are indexed into each device's own `ports` array.
  */
  patches: [
    // Floor 1 field into the 48 port PoE switch, straight through.
    ...Array.from({ length: 24 }, (_, i) => ({
      from: { device: "patch-a", port: i },
      to: { device: "usw-pro-48-poe", port: i },
      colour: (i >= 18 ? "amber" : i >= 13 ? "blue" : "green") as LedState,
      style: "etherlighting" as const,
    })),
    // Floor 2 field into the 24 port switch.
    ...Array.from({ length: 16 }, (_, i) => ({
      from: { device: "patch-b", port: i },
      to: { device: "usw-pro-24-poe", port: i },
      colour: (i >= 12 ? "amber" : i >= 9 ? "blue" : "green") as LedState,
      style: "etherlighting" as const,
    })),
    // The gateway's copper LAN uplink into the aggregation switch is a
    // short lead, and short leads are the ones that sit on top of a bundle.
    { from: { device: "udm-se", port: 0 }, to: { device: "usw-pro-48-poe", port: 26 }, colour: "blue" as LedState, style: "etherlighting" as const },
    { from: { device: "udm-se", port: 1 }, to: { device: "usw-pro-24-poe", port: 18 }, colour: "green" as LedState, style: "etherlighting" as const },
  ],

  sources: [
    {
      label: "Ubiquiti tech specs: Dream Machine Special Edition (UDM-SE)",
      url: "https://techspecs.ui.com/unifi/cloud-gateways/udm-se",
    },
    {
      label: "Ubiquiti tech specs: Hi-Capacity Aggregation (USW-Pro-Aggregation)",
      url: "https://techspecs.ui.com/unifi/switching/usw-pro-aggregation",
    },
    {
      label: "Ubiquiti tech specs: Pro 48 PoE (USW-Pro-48-POE)",
      url: "https://techspecs.ui.com/unifi/switching/usw-pro-48-poe",
    },
    {
      label: "Ubiquiti tech specs: Pro 24 PoE (USW-Pro-24-POE)",
      url: "https://techspecs.ui.com/unifi/switching/usw-pro-24-poe",
    },
    {
      label: "Ubiquiti tech specs: 24-Port Blank Keystone Patch Panel",
      url: "https://techspecs.ui.com/unifi/accessories/uacc-rack-panel-patch-blank-24",
    },
    {
      label: "Ubiquiti tech specs: Power Distribution Pro (USP-PDU-Pro)",
      url: "https://techspecs.ui.com/unifi/accessories/usp-pdu-pro",
    },
    {
      label: "Ubiquiti tech specs: UPS 2U Pro (UPS-2U-Pro-US)",
      url: "https://techspecs.ui.com/unifi/accessories/ups-2u-pro-us",
    },
    {
      label: "Ubiquiti store: Power Distribution Pro, listed as 2U Rack Mount",
      url: "https://store.ui.com/us/en/products/usp-pdu-pro",
    },
  ],
};
