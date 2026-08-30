/**
 * The shape of a rack elevation.
 *
 * Vendor data files under `lib/racks/` build to this contract and nothing
 * else, so a rack can be authored from a datasheet without touching the
 * renderer, and the renderer can change without reopening the data.
 *
 * Two decisions in here are load-bearing:
 *
 * `watts` is nullable on purpose. Plenty of vendors publish a PoE budget or
 * a PSU rating and never publish the device's own consumption. Null renders
 * as "not published", which is true. A plausible-looking guess would not be,
 * and a rack elevation that fudges its power figures is worse than no rack
 * elevation at all.
 *
 * `activity` is optional and illustrative. It is a fraction from 0 to 1
 * describing a plausible occupancy, not a measurement, and data files derive
 * it from the port number so the prerendered HTML and the hydrated DOM agree.
 */

/** What an indicator is doing. Passive hardware has no indicators at all. */
export type LedState = "off" | "green" | "blue" | "amber" | "red";

/** A physical connector on a device's front panel. */
export interface RackPort {
  /**
   * The connector type, which is what decides how it is drawn. "blank" is an
   * unpopulated position: an empty hole in a patch panel is not the same
   * thing as a dark rj45, and drawing them alike would misreport the build.
   */
  kind:
    | "rj45"
    | "sfp"
    | "sfp-plus"
    | "sfp28"
    | "qsfp"
    | "power"
    | "usb"
    | "console"
    | "blank";
  /** What the panel silkscreen calls it. */
  label: string;
  /**
   * The port indicator. Omit it entirely for passive hardware: a keystone
   * patch panel has no LED to light, and drawing it dark would imply it does.
   */
  led?: LedState;
  /** Illustrative traffic, 0 to 1. Only meaningful on a port showing link. */
  activity?: number;
}

/** One piece of hardware occupying a contiguous run of rack units. */
export interface RackDevice {
  /** Stable key, unique within the rack. */
  id: string;
  /** Height in rack units. A 1U switch is 1; a blanking panel can be any. */
  u: number;
  vendor: string;
  model: string;
  /** One line on what this box is doing in this particular rack. */
  role: string;
  /** Drives the silhouette the renderer draws. */
  family: "router" | "switch" | "server" | "storage" | "firewall" | "pdu" | "ups" | "patch" | "blank";
  /** Front panel, left to right, as the device presents it. */
  ports?: RackPort[];
  /** Chassis indicators beyond the per-port ones, in the datasheet's order. */
  leds?: LedState[];
  /**
   * Front drive bays, for hardware whose face is storage rather than ports.
   * `occupied` is illustrative in the same way port activity is: a plausible
   * fit-out, stated as such, never a measurement.
   */
  bays?: { count: number; occupied: number; label: string };
  /**
   * How a passive filler panel presents: vent slots, a solid plate, the
   * D-rings of a cable manager, or a shelf. Only read for family "blank".
   */
  look?: "vented" | "solid" | "fingers" | "shelf";
  /**
   * The vendor's published maximum draw for the device itself, excluding
   * power it only passes through. Null where the vendor publishes none.
   */
  watts: number | null;
  /** Accent colour for this device's row. */
  accent?: string;
  /**
   * Chassis finish, taken from the vendor's product photography. This is
   * not decoration: a UniFi rack is visibly silver, a Catalyst 9300 is pale
   * grey with teal port throats, and MikroTik ships black. Drawing them all
   * the same dark grey was the single biggest inaccuracy in the first pass.
   */
  finish?: "silver" | "light" | "black" | "dark";
  /** Colour inside the port throat. Cisco's 9000 series is famously teal. */
  portTint?: string;
  /**
   * Ports per visual block. Real switch faceplates group their jacks with a
   * gap every 6, 8 or 12 so a technician can count to a port number without
   * reading every label, and the gap is load bearing when you are tracing a
   * cable at arm's length.
   */
  groupsOf?: number;
  /**
   * Force one row of ports. Dense panels stack into two rows with odd
   * numbers on top and even below, which is what nearly every 24 and 48
   * port switch does; a handful of low-density faces do not.
   */
  singleRow?: boolean;
  /** A screen on the faceplate, drawn as one. */
  display?: "unifi" | "ups" | "server";
  /** A modular uplink bay, drawn as a seam with its own module face. */
  moduleBay?: boolean;
  /** Optional short caption rendered beside the device. */
  label?: string;
  /** Link to this specific model's spec page, where one exists. */
  url?: string;
}

/** Where a figure came from. Every rack carries its own citations. */
export interface RackSource {
  label: string;
  url: string;
}

/** A complete rack elevation. */
export interface RackDefinition {
  /** URL segment for this rack. */
  slug: string;
  /** Display name. */
  name: string;
  /** A paragraph on what the build is and why it is put together this way. */
  blurb: string;
  /** Total rack units of the enclosure, which bounds the device positions. */
  height: number;
  /** Top to bottom. The renderer lays them out in array order. */
  devices: RackDevice[];
  /** The datasheets every number above was read off. */
  sources: RackSource[];
}
