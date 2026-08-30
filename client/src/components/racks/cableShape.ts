/**
 * The shape a patch lead takes, and the colours it comes in.
 *
 * Pulled out of RackCables3D so a rack built from vendor geometry can wear
 * the same cabling as one built from our own chassis. The shape is the part
 * worth sharing: it took several attempts to get right and it is the same
 * physics either way, whoever modelled the switch the lead plugs into.
 *
 * The first pass let every lead find its own way from A to B, and the
 * result was a bowl of spaghetti across the front of the rack. That is not
 * what a patched rack looks like, and it is not what a cable does either.
 *
 * A dressed bundle is four moves, and every lead in it makes the same four:
 * out of the jack along the plug's axis, a turn down into a service loop, a
 * run along the bottom of that loop to get under the far port, and back up
 * into it. Because every lead turns at the same standoff from the panel and
 * drops to the same belly, the vertical runs come out parallel and the
 * bundle reads as combed rather than as tangled. The variation is only in
 * how far out each one sits, and that is not arbitrary either: a long lead
 * has to cross the ones under it, so it is layered further out.
 *
 * The dip below both ports is a real service loop, not a sag. It is the
 * slack an installer leaves so a switch can be pulled forward on its rails
 * without unplugging forty cables.
 */

import * as THREE from "three";

/**
 * Jacket radius. Cat6A patch cord is about 6mm over the jacket; the UniFi
 * Etherlighting lead is a slim 2.5mm TPE. Drawn at its true 1.25mm radius
 * against a white chassis it disappeared into a scratch, so it renders at
 * the low end of what a booted patch lead actually measures instead.
 */
export const CABLE_RADIUS = { plain: 0.0029, etherlighting: 0.0019 } as const;

export const JACKET_HEX: Record<string, string> = {
  blue: "#2f6fd0",
  grey: "#8d949f",
  yellow: "#e3c02a",
  red: "#c8383d",
  green: "#3f9f57",
  // Slightly off white, so a white lead still reads against a white panel.
  white: "#e6eaef",
  // Fibre and DAC, which nobody sleeves in the copper colours.
  aqua: "#3fc9c1",
  violet: "#8f6fd6",
  orange: "#e08a3c",
};

/** Deterministic 0..1 from an integer, so a rack looks the same every load. */
export const jitter = (n: number): number => ((n * 2654435761) % 1000) / 1000;

/**
 * The path one lead takes between two jacks.
 *
 * `n` seeds the per-lead variation and `reach` is how far the lead travels
 * as a fraction of the rack, which decides how far out it stands off and
 * how deep its loop hangs.
 */
export function leadCurve(
  a: THREE.Vector3,
  b: THREE.Vector3,
  n: number,
  reach: number,
): THREE.CatmullRomCurve3 {
  const j = jitter(n + 1);
  const out = 0.019 + reach * 0.016 + j * 0.0018;
  const belly = Math.min(a.y, b.y) - 0.011 - reach * 0.013 - j * 0.002;
  const mid = (a.x + b.x) / 2;

  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(a.x, a.y, a.z + 0.019),
      new THREE.Vector3(a.x, a.y - 0.008, a.z + out * 0.75),
      new THREE.Vector3(a.x, (a.y + belly) / 2, a.z + out),
      new THREE.Vector3(a.x, belly, a.z + out),
      new THREE.Vector3(mid, belly - 0.0015, a.z + out),
      new THREE.Vector3(b.x, belly, b.z + out),
      new THREE.Vector3(b.x, (b.y + belly) / 2, b.z + out),
      new THREE.Vector3(b.x, b.y - 0.008, b.z + out * 0.75),
      new THREE.Vector3(b.x, b.y, b.z + 0.019),
      new THREE.Vector3(b.x, b.y, b.z),
    ],
    false,
    "catmullrom",
    0.5,
  );
}

/**
 * A power lead, which behaves nothing like a patch lead.
 *
 * It is thicker, it will not bend as tightly, and it runs down the side of
 * the rack rather than looping in front of the panel, because nobody dresses
 * C13 leads across the face of their switches. So it drops from the inlet,
 * runs to the side, and travels vertically to the outlet it lands in.
 */
export function powerCurve(
  a: THREE.Vector3,
  b: THREE.Vector3,
  side: number,
  n: number,
): THREE.CatmullRomCurve3 {
  const j = jitter(n + 7);
  const lane = side * (0.245 + j * 0.012);
  const out = 0.030 + j * 0.006;
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(a.x, a.y, a.z + 0.022),
      new THREE.Vector3(a.x + (lane - a.x) * 0.35, a.y - 0.012, a.z + out),
      new THREE.Vector3(lane, a.y - 0.030, a.z + out),
      new THREE.Vector3(lane, (a.y + b.y) / 2, a.z + out * 0.9),
      new THREE.Vector3(lane, b.y + 0.030, b.z + out),
      new THREE.Vector3(b.x + (lane - b.x) * 0.35, b.y + 0.012, b.z + out),
      new THREE.Vector3(b.x, b.y, b.z + 0.022),
      new THREE.Vector3(b.x, b.y, b.z),
    ],
    false,
    "catmullrom",
    0.5,
  );
}
