/**
 * A UniFi rack as somebody would actually build and patch one.
 *
 * The devices are Ubiquiti's own models, so the hardware needs no
 * describing. What does need describing is where the ports are, because a
 * glTF export knows nothing about ports: it is a bag of triangles with a
 * front panel somewhere on it, and no amount of measuring the bounding box
 * will find the eighth RJ45 from the left.
 *
 * So each device carries a port strip, which is where its jacks sit as
 * fractions of the panel. Those are read off the rendered front elevation
 * of each model rather than off a datasheet, and they are deliberately
 * approximate: a lead that leaves its jack two millimetres off centre is
 * indistinguishable from one that does not, and the service loop is what
 * the eye actually reads.
 *
 * The patching is a real design rather than a decoration. Access ports on
 * the two PoE switches come down to the surge panels, the switches uplink
 * to the aggregation switch on fibre, the aggregation switch feeds the
 * gateway, and the two storage boxes take a copper pair each. That is why
 * the fibre is aqua and the uplinks are the only leads crossing more than
 * two units: a rack where every cable is the same colour and the same
 * length is a rack nobody has ever had to fault find in.
 */

/** Where a device's jacks are, as fractions of its own panel. */
export interface PortStrip {
  /** Left and right edge of the port field, 0 at the panel's left. */
  x: [number, number];
  /** Centre of each row, 0.5 at the panel's middle, measured downward. */
  rows: number[];
  /** Jacks per row. */
  cols: number;
}

export interface WiredDevice {
  /** Catalogue slug, or `usp-pdu-pro` for the one built by hand. */
  slug: string;
  /**
   * Ours rather than Ubiquiti's, which changes two things: where the file
   * is served from, and which way is up. Our generators work Z-up, the
   * CAD convention, and glTF is Y-up. Ubiquiti's exports carry the quarter
   * turn on their root node already; ours do not.
   */
  own?: boolean;
  /** Top edge of the device, in rack units from the top of the rack. */
  at: number;
  u: number;
  label: string;
  /** Copper jacks. */
  ports?: PortStrip;
  /** Cages, kept separate because fibre gets its own colour and radius. */
  optics?: PortStrip;
  /** Where its power inlet sits, as a fraction of the panel width. */
  inlet?: number;
}

export interface WiredPatch {
  /** `deviceIndex:portIndex`, counted left to right then row by row. */
  from: [number, number];
  to: [number, number];
  jacket: string;
  /** Optics leads are thinner and take the fibre colours. */
  fibre?: boolean;
}

/**
 * Fourteen units, sized to what is in it rather than to a round number.
 * At sixteen the build left three empty units above the distribution unit,
 * and a void at the bottom of a rack reads as a rack somebody gave up on
 * rather than as headroom.
 */
export const WIRED_RACK_UNITS = 14;

export const WIRED_DEVICES: WiredDevice[] = [
  {
    slug: "udm-se",
    at: 0,
    u: 1,
    label: "Dream Machine SE",
    ports: { x: [0.735, 0.895], rows: [0.40, 0.60], cols: 4 },
    optics: { x: [0.925, 0.965], rows: [0.40, 0.60], cols: 1 },
    inlet: 0.93,
  },
  {
    slug: "usw-pro-aggregation",
    at: 1,
    u: 1,
    label: "Pro Aggregation",
    optics: { x: [0.155, 0.905], rows: [0.38, 0.62], cols: 14 },
    inlet: 0.95,
  },
  {
    slug: "uacc-eth-sp-panel-24",
    at: 2,
    u: 1,
    label: "Surge panel A",
    ports: { x: [0.045, 0.955], rows: [0.5], cols: 24 },
  },
  {
    slug: "usw-pro-max-48-poe",
    at: 3,
    u: 1,
    label: "Pro Max 48 PoE",
    ports: { x: [0.035, 0.735], rows: [0.38, 0.62], cols: 24 },
    optics: { x: [0.775, 0.955], rows: [0.38, 0.62], cols: 4 },
    inlet: 0.95,
  },
  {
    slug: "uacc-eth-sp-panel-24",
    at: 4,
    u: 1,
    label: "Surge panel B",
    ports: { x: [0.045, 0.955], rows: [0.5], cols: 24 },
  },
  {
    slug: "usw-pro-24-poe",
    at: 5,
    u: 1,
    label: "Pro 24 PoE",
    ports: { x: [0.415, 0.805], rows: [0.38, 0.62], cols: 12 },
    optics: { x: [0.845, 0.955], rows: [0.38, 0.62], cols: 2 },
    inlet: 0.95,
  },
  {
    slug: "uxg-enterprise",
    at: 6,
    u: 1,
    label: "Enterprise Gateway",
    ports: { x: [0.62, 0.80], rows: [0.5], cols: 4 },
    optics: { x: [0.835, 0.95], rows: [0.5], cols: 2 },
    inlet: 0.94,
  },
  {
    slug: "unvr-pro",
    at: 7,
    u: 2,
    label: "Network Video Recorder Pro",
    ports: { x: [0.90, 0.95], rows: [0.78], cols: 1 },
    inlet: 0.95,
  },
  {
    slug: "unas-pro",
    at: 9,
    u: 2,
    label: "Network Attached Storage Pro",
    ports: { x: [0.90, 0.95], rows: [0.78], cols: 1 },
    inlet: 0.95,
  },
  {
    slug: "usp-pdu-pro",
    own: true,
    at: 12,
    u: 2,
    label: "Power Distribution Pro",
    // Its outlets are the sockets everything else lands in, so they are
    // described as a port strip even though nothing patches to them.
    ports: { x: [0.135, 0.845], rows: [0.31], cols: 12 },
  },
];

/** Index of the PDU, which every power lead runs to. */
export const PDU_INDEX = WIRED_DEVICES.findIndex((d) => d.slug === "usp-pdu-pro");

/**
 * The patching.
 *
 * Access ports go down to a surge panel, which is where the leads to the
 * rest of the building terminate. The two switches uplink on fibre to the
 * aggregation switch, and the gateway hangs off that. Nothing is patched
 * for the sake of filling a port: an unused port on a real switch stays
 * unused, and a rack with every jack occupied looks staged.
 */
function buildPatches(): WiredPatch[] {
  const out: WiredPatch[] = [];
  const COPPER = ["blue", "blue", "grey", "blue", "white", "grey", "blue", "green"];

  // Pro Max 48 to surge panel A above it, and to B below.
  for (let i = 0; i < 18; i += 1) {
    out.push({
      from: [3, i],
      to: [i < 9 ? 2 : 4, i < 9 ? i + 3 : i + 1],
      jacket: COPPER[i % COPPER.length],
    });
  }
  // Pro 24 to surge panel B, which sits directly above it.
  for (let i = 0; i < 11; i += 1) {
    out.push({ from: [5, i], to: [4, i + 12], jacket: COPPER[(i + 3) % COPPER.length] });
  }
  // Two red leads, because every rack has a couple of cables somebody was
  // told never to unplug.
  out.push({ from: [3, 22], to: [2, 0], jacket: "red" });
  out.push({ from: [5, 21], to: [4, 0], jacket: "red" });

  // Storage takes copper straight to the nearest switch rather than to a
  // panel, which is what you would actually do for a box in the same rack.
  out.push({ from: [7, 0], to: [5, 19], jacket: "yellow" });
  out.push({ from: [8, 0], to: [5, 20], jacket: "yellow" });

  // Uplinks. Aggregation is the only device everything else reaches, so
  // these are the long leads, and they are fibre.
  out.push({ from: [3, 100], to: [1, 2], jacket: "aqua", fibre: true });
  out.push({ from: [3, 101], to: [1, 3], jacket: "aqua", fibre: true });
  out.push({ from: [5, 100], to: [1, 6], jacket: "aqua", fibre: true });
  out.push({ from: [0, 100], to: [1, 0], jacket: "violet", fibre: true });
  out.push({ from: [6, 100], to: [1, 10], jacket: "violet", fibre: true });
  return out;
}

export const WIRED_PATCHES: WiredPatch[] = buildPatches();

/**
 * Port index 100 and up means an optics cage rather than a copper jack.
 * One numbering space keeps a patch a pair of integers, and the offset is
 * large enough that no real switch will ever collide with it.
 */
export const OPTIC_BASE = 100;
