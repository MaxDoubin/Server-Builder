/**
 * Where every connector sits on a chassis in 3D.
 *
 * This is the three.js counterpart of portLayout.ts, and it exists for the
 * same reason: the cables have to land on the jacks. In the reference
 * renders every lead leaves its patch panel port, makes a tight service
 * loop out in front of the rack, and comes back into a switch port two
 * units below. A lead that lands a millimetre off its jack reads as wrong
 * immediately, and two copies of this arithmetic would drift the first time
 * a port pitch changed, so the chassis and the cable layer share one.
 *
 * Coordinates are in the device's own space, in meters: x from the middle
 * of the face and y from the middle of its own rack units. The z of the
 * face belongs to the rack, not the device, so it is passed in.
 */

import type { RackDefinition, RackDevice, RackPort } from "@/lib/rackTypes";
import { U } from "@/components/cinematic/rack3d/rackConfig";

/**
 * How deep each family of hardware actually is, in meters.
 *
 * The hero cabinet is 920mm deep because a datacenter cabinet is. These
 * racks are not: a UniFi 24 port switch is 285mm front to back, a keystone
 * patch panel is a plate barely 50mm deep, and a blanking panel is a sheet.
 * Drawing them all 920mm deep turned a shallow studio frame into a shipping
 * crate, which is the single thing that made the first 3D pass read wrong
 * from any angle but dead on.
 */
const FAMILY_DEPTH: Record<RackDevice["family"], number> = {
  switch: 0.3,
  router: 0.3,
  firewall: 0.3,
  patch: 0.055,
  blank: 0.022,
  pdu: 0.16,
  ups: 0.44,
  server: 0.62,
  storage: 0.58,
};

/** Front-to-back depth of one device. */
export function deviceDepth(device: RackDevice): number {
  return FAMILY_DEPTH[device.family] ?? 0.3;
}

/**
 * Frame depth: the deepest thing in it plus clearance for the cabling. A
 * rack of switches and patch panels is a shallow frame, and it should look
 * like one.
 */
export function rackDepth(rack: RackDefinition): number {
  const deepest = rack.devices.reduce((m, d) => Math.max(m, deviceDepth(d)), 0);
  return Math.max(0.34, deepest + 0.07);
}

/** Front plane of a rack of this depth, where faceplates and jacks live. */
export const faceZ = (depth: number): number => depth / 2;

export interface PortSlot {
  port: RackPort;
  /** Index into the device's own ports array. */
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * 0 for the top row of a stacked block, 1 for the bottom. The two rows of
   * a dense panel are mirrored: the top row's jacks take the plug latch
   * downward and the bottom row's take it up, which is why the two rows of
   * a 48 port switch are not the same picture twice.
   */
  row: number;
}

export interface ChassisLayout {
  /** RJ45, console and unpopulated keystone positions. */
  copper: PortSlot[];
  /** Optic cages: SFP and its faster relatives. */
  cages: PortSlot[];
  /** Every slot in the device's own port order, for cable lookup by index. */
  byIndex: Map<number, PortSlot>;
  /** Bounding box of the whole port block, for the recess behind it. */
  field: { x: number; y: number; w: number; h: number };
}

/** Connectors that are drawn as a cage rather than a copper jack. */
const CAGE_KINDS = new Set(["sfp", "sfp-plus", "sfp28", "qsfp"]);

/**
 * Connector sizes are absolute, because connectors are absolute.
 *
 * An 8P8C jack is 11.7mm wide whatever it is bolted to, and its panel
 * bezel takes that to about 13mm. Sizing jacks to fill the available width
 * gave a four port gateway four jacks the size of light switches while the
 * 48 port switch next to it had normal ones, which is the giveaway that a
 * render was laid out rather than measured.
 */
const JACK_W = 0.0132;
const JACK_H = 0.0152;
/** An SFP cage is 13.9mm across the mouth. */
const CAGE_W = 0.0139;

/**
 * A rack device's body is not 19 inches wide. The 482.6mm figure is the
 * width across the mounting ears; the chassis they are bolted to is
 * narrower, and Ubiquiti publish 442mm for the Pro series, which is the
 * usual figure. Drawing the body at the full rack width made every device
 * nine percent too wide and left the ears looking like they were welded to
 * a panel that already reached the posts.
 */
export const CHASSIS_WIDTH = 0.442;

/** Ganged modular jacks sit on a 0.6 inch pitch. That is not negotiable. */
export const JACK_PITCH = 0.01524;

/**
 * Lay a device's front panel out in 3D.
 *
 * Copper stacks two rows deep past eight ports, the way every dense panel
 * does, with the odd numbers on top. Cages sit to the right of the copper
 * field. Power inlets and USB are on the rear of real hardware and are
 * skipped here rather than drawn on a face they are not on.
 */
export function chassisLayout(device: RackDevice): ChassisLayout | null {
  const h = device.u * U;
  const declared = device.ports ?? [];
  const wanted = declared
    .map((port, index) => ({ port, index }))
    .filter(({ port }) => port.kind !== "power" && port.kind !== "usb");
  if (!wanted.length) return null;

  const copperSrc = wanted.filter(({ port }) => !CAGE_KINDS.has(port.kind));
  const cageSrc = wanted.filter(({ port }) => CAGE_KINDS.has(port.kind));

  /*
    Allocate the panel proportionally rather than reserving a fixed
    two-thirds for copper. The aggregation switch is nearly all optics: a
    fixed copper reservation pushed its thirty-two cages a full ten
    centimetres past the right hand rack post and out into the room. Count
    the columns each family actually needs, weight a cage as the wider part
    it is, and divide the face between them.
  */
  /*
    Stack into two rows only when one row will not fit.
    
    The rule was "eight or more ports stack", which is what a Catalyst
    does and not what a UniFi switch does: a Pro 24 puts all twenty four
    jacks in a single row across the panel, and that single row is one of
    the most recognisable things about the product. Twenty four jacks at
    the 0.6 inch pitch is 366mm, which fits inside a 442mm chassis; forty
    eight is 731mm, which does not, so a 48 port face stacks and a 24 port
    face does not. Physics decides, not a threshold.

    `singleRow` in the data still wins, for the handful of faces that
    refuse to stack whatever the arithmetic says.
  */
  const fitsOneRow = copperSrc.length * JACK_PITCH <= CHASSIS_WIDTH * 0.94;
  const rows = device.singleRow || fitsOneRow ? 1 : 2;
  const cols = Math.ceil(copperSrc.length / rows) || 0;
  const cageRows = cageSrc.length > 4 ? 2 : 1;
  const cageCols = Math.ceil(cageSrc.length / cageRows) || 0;

  /** A cage is roughly 1.6 copper jacks wide. */
  const CAGE_RATIO = 1.6;
  const avail = CHASSIS_WIDTH * 0.94;
  const weight = cols + cageCols * CAGE_RATIO;
  const pitch = weight ? avail / weight : 0;
  // A jack never grows past what the unit height allows, whatever the width
  // left over: a 4 port switch has 4 normal jacks, not 4 enormous ones.
  const cw = Math.min(pitch, JACK_PITCH);
  const jw = Math.min(cw * 0.88, h * 0.42, JACK_W);
  const jh = Math.min(h * 0.4, jw * 1.15, JACK_H);
  const copperSpan = cols * cw;
  const cagePitch = Math.min(pitch * CAGE_RATIO, CAGE_W / 0.88);
  /*
    Centre the whole block. On a dense 48 port face the jacks fill the panel
    and this changes nothing, but a 24 port switch does not need the full
    19 inches, and left-aligning its ports parked a third of the faceplate
    empty against the right hand rail, which no vendor ships.
  */
  const gap = cols && cageCols ? cw * 0.5 : 0;
  /*
    Real dense panels break their jacks into groups, a wider gap every six,
    eight or twelve, so a technician can count to port 37 at arm's length
    without reading a single label. `groupsOf` carries that from the
    datasheet and the elevation already honours it; the 3D face has to as
    well or the two drawings disagree about where port 13 is.
  */
  const group = device.groupsOf ?? 0;
  const groupGap = group ? cw * 0.34 : 0;
  const groupsBefore = (col: number) => (group ? Math.floor(col / group) * groupGap : 0);
  const copperSpread = copperSpan + (group ? Math.max(0, Math.ceil(cols / group) - 1) * groupGap : 0);
  const blockW = copperSpread + gap + cageCols * cagePitch;
  const startX = -blockW / 2;

  const copper: PortSlot[] = copperSrc.map(({ port, index }, i) => {
    const col = rows === 2 ? Math.floor(i / 2) : i;
    const row = rows === 2 ? i % 2 : 0;
    return {
      port,
      index,
      x: startX + col * cw + cw / 2 + groupsBefore(col),
      y: rows === 2 ? (row === 0 ? jh * 0.56 : -jh * 0.56) : 0,
      w: jw,
      h: jh,
      row,
    };
  });

  const cageStart = startX + copperSpread + gap;
  const cages: PortSlot[] = cageSrc.map(({ port, index }, i) => {
    const col = cageRows === 2 ? Math.floor(i / 2) : i;
    const row = cageRows === 2 ? i % 2 : 0;
    return {
      port,
      index,
      x: cageStart + col * cagePitch + cagePitch / 2,
      y: cageRows === 2 ? (row === 0 ? jh * 0.56 : -jh * 0.56) : 0,
      w: cagePitch * 0.88,
      h: (cageRows === 2 ? jh : jh * 1.1) * 0.82,
      row,
    };
  });

  const byIndex = new Map<number, PortSlot>();
  const all = [...copper, ...cages];
  for (const slot of all) byIndex.set(slot.index, slot);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const slot of all) {
    minX = Math.min(minX, slot.x - slot.w / 2);
    maxX = Math.max(maxX, slot.x + slot.w / 2);
    minY = Math.min(minY, slot.y - slot.h / 2);
    maxY = Math.max(maxY, slot.y + slot.h / 2);
  }
  const pad = jh * 0.16;
  const field = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };

  return { copper, cages, byIndex, field };
}
