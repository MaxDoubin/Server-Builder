/**
 * The arithmetic behind the rack builder, with no React and no three.js in
 * it, so the rules can be reasoned about on their own.
 *
 * A rack is not a list of devices, it is a list of occupied units. That
 * distinction is the whole of this file. Treating it as a list means a 2U
 * device dropped between two 1U devices either overlaps one of them or
 * silently pushes it, and both are wrong: real hardware does not push, it
 * either fits in the gap or it does not go in. So placement asks a slot
 * question, "are these N units all free", and refuses when the answer is no.
 *
 * Positions are counted in units from the TOP of the frame, because that is
 * how an elevation is read and how the existing rack pages already index
 * theirs. The 3D scene converts to a height from the floor, once.
 */

/** One device as the catalogue describes it. Only what a build needs. */
export interface CatalogueDevice {
  slug: string;
  name: string;
  sku: string;
  short: string;
  group: string;
  mount: string;
  u?: number;
  yaw?: number;
  widthM?: number;
  depthM?: number;
  sizeM: [number, number, number];
  triangles: number;
  bytes: number;
  model: string;
  thumb: string;
  store: string;
}

export interface Catalogue {
  vendor: string;
  source: string;
  retrieved: string;
  credit: string;
  count: number;
  devices: CatalogueDevice[];
}

/** One device placed in a frame: which device, and where its top edge is. */
export interface Placement {
  /** Stable across re-orders, so React keys and selection survive a move. */
  id: number;
  slug: string;
  /** Units from the top of the frame to the device's top edge. */
  at: number;
}

/** The frame sizes worth offering. A 42U is a full cabinet; 6U is a shelf. */
export const FRAME_SIZES = [6, 9, 12, 18, 24, 42] as const;
export type FrameSize = (typeof FRAME_SIZES)[number];

export const DEFAULT_FRAME: FrameSize = 12;

/** A device with no published height is 1U, which is what 47 of the 51 are. */
export function unitsOf(d: CatalogueDevice): number {
  return Math.max(1, Math.round(d.u ?? 1));
}

/**
 * Which units a build occupies, as a boolean per unit from the top.
 *
 * Built fresh on every query rather than kept as state. A derived occupancy
 * map that can drift from the placements it describes is a bug waiting for
 * the first undo, and rebuilding 42 booleans costs nothing.
 */
export function occupancy(
  placements: Placement[],
  frame: number,
  byslug: Map<string, CatalogueDevice>,
  ignoreId?: number,
): boolean[] {
  const used = new Array<boolean>(frame).fill(false);
  for (const p of placements) {
    if (p.id === ignoreId) continue;
    const d = byslug.get(p.slug);
    if (!d) continue;
    for (let i = p.at; i < p.at + unitsOf(d); i += 1) {
      if (i >= 0 && i < frame) used[i] = true;
    }
  }
  return used;
}

/** Whether `height` units starting at `at` are all free and inside the frame. */
export function fits(used: boolean[], at: number, height: number): boolean {
  if (at < 0 || at + height > used.length) return false;
  for (let i = at; i < at + height; i += 1) if (used[i]) return false;
  return true;
}

/**
 * Where a newly picked device should land.
 *
 * Top down, because a rack fills from the top: patch panels and gateways go
 * up, the power distribution goes at the bottom, and somebody adding their
 * fourth switch expects it under the third rather than in whatever hole is
 * nearest the floor. Returns null when nothing of that height is free, which
 * the caller turns into a message rather than a silent no-op.
 */
export function firstFreeSlot(used: boolean[], height: number): number | null {
  for (let at = 0; at + height <= used.length; at += 1) {
    if (fits(used, at, height)) return at;
  }
  return null;
}

/** Total units a build occupies. */
export function unitsUsed(
  placements: Placement[],
  byslug: Map<string, CatalogueDevice>,
): number {
  return placements.reduce((n, p) => {
    const d = byslug.get(p.slug);
    return n + (d ? unitsOf(d) : 0);
  }, 0);
}

/** What the build costs a reader, in bytes and triangles, counting repeats. */
export function buildWeight(
  placements: Placement[],
  byslug: Map<string, CatalogueDevice>,
): { bytes: number; triangles: number; files: number } {
  /*
    Bytes are counted once per distinct file because the browser caches it,
    but triangles are counted per placement because two of the same switch
    are two of the same switch as far as the GPU is concerned. Reporting one
    number for both would be wrong in one direction or the other.
  */
  const seen = new Set<string>();
  let bytes = 0;
  let triangles = 0;
  for (const p of placements) {
    const d = byslug.get(p.slug);
    if (!d) continue;
    triangles += d.triangles;
    if (!seen.has(d.slug)) {
      seen.add(d.slug);
      bytes += d.bytes;
    }
  }
  return { bytes, triangles, files: seen.size };
}

/**
 * A build as a string short enough to live in a URL.
 *
 * `<frame>:<slug>@<at>,<slug>@<at>` and nothing cleverer. Base64 of JSON
 * would be shorter to write and impossible to read, and the point of a
 * shareable build is that somebody can look at the link and see what is in
 * it. Slugs are already URL safe, which is why they are used rather than
 * catalogue indices: an index would break the moment the catalogue is
 * regenerated in a different order, and a stale link that silently loads
 * the wrong hardware is worse than one that drops a device.
 */
export function encodeBuild(frame: number, placements: Placement[]): string {
  const parts = [...placements]
    .sort((a, b) => a.at - b.at)
    .map((p) => `${p.slug}@${p.at}`);
  return `${frame}:${parts.join(",")}`;
}

export function decodeBuild(
  text: string,
  known: Set<string>,
): { frame: FrameSize; placements: Placement[] } | null {
  const [head, rest] = text.split(":");
  const frame = Number(head);
  if (!FRAME_SIZES.includes(frame as FrameSize)) return null;

  const placements: Placement[] = [];
  let id = 1;
  for (const part of (rest ?? "").split(",")) {
    if (!part) continue;
    const [slug, atText] = part.split("@");
    const at = Number(atText);
    // Drop anything unrecognised rather than failing the whole link: a build
    // missing one device is still worth loading, and the catalogue does change.
    if (!known.has(slug) || !Number.isInteger(at) || at < 0 || at >= frame) continue;
    placements.push({ id: id++, slug, at });
  }
  return { frame: frame as FrameSize, placements };
}

/** Human bytes, to one decimal, because a palette row has no room for more. */
export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * A starting build, so an empty frame is not the first thing anyone sees.
 *
 * Chosen to be a small plausible stack rather than a showcase: a gateway, a
 * PoE switch, a patch panel and storage is what a real 12U looks like, and
 * it leaves obvious room to add to, which an impressive full rack would not.
 */
export const STARTER: Array<[string, number]> = [
  ["udm-se", 0],
  ["usw-pro-max-48-poe", 1],
  ["uacc-eth-sp-panel-24", 2],
  ["unvr-pro", 3],
];
