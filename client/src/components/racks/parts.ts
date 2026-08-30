/**
 * The small parts, built once and instanced everywhere.
 *
 * A rack reads as real or as a diagram almost entirely on the strength of
 * things a few millimetres across: the shielded rim around an RJ45 opening,
 * the eight gold contacts inside it, the latch slot that tells you which way
 * up the jack is, the cross slot in a rack screw, the three holes in a wall
 * outlet. Draw a port as a black rectangle and no amount of lighting will
 * rescue it.
 *
 * The catch is that a 48 port switch has 48 of them and a rack has ten
 * switches, so every part here is built once in normalised space, cached at
 * module scope, and drawn through a single InstancedMesh per part with a
 * per-instance matrix. Five hundred fully modelled jacks cost one draw call
 * and one geometry.
 *
 * Normalised space: the part fills x and y in -0.5 to 0.5, its front face
 * sits on z = 0, and it extends backwards into negative z. Callers scale by
 * the real port size, so the same geometry serves an 11.7mm jack on a dense
 * switch and a wider one on a four port face.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Front face on z = 0, body behind it, which is how a panel part mounts. */
function faceForward(geom: THREE.BufferGeometry, depth: number): THREE.BufferGeometry {
  geom.translate(0, 0, -depth);
  return geom;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.035): THREE.BufferGeometry {
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  return faceForward(geom, depth);
}

/** The keyed opening an 8P8C plug goes into, latch slot pointing up or down. */
function rj45Opening(tabUp: boolean): THREE.Path {
  const p = new THREE.Path();
  const s = tabUp ? 1 : -1;
  // Body of the opening, then the narrow slot the plug's latch rides in.
  p.moveTo(-0.4, s * -0.38);
  p.lineTo(0.4, s * -0.38);
  p.lineTo(0.4, s * 0.1);
  p.lineTo(0.17, s * 0.1);
  p.lineTo(0.17, s * 0.4);
  p.lineTo(-0.17, s * 0.4);
  p.lineTo(-0.17, s * 0.1);
  p.lineTo(-0.4, s * 0.1);
  p.closePath();
  return p;
}

function outerRect(inset = 0): THREE.Shape {
  const s = new THREE.Shape();
  const a = 0.5 - inset;
  s.moveTo(-a, -a);
  s.lineTo(a, -a);
  s.lineTo(a, a);
  s.lineTo(-a, a);
  s.closePath();
  return s;
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = build();
    cache.set(key, g);
  }
  return g;
}

/** The shielded rim around a jack, with the latch slot the right way up. */
export function jackRim(tabUp: boolean): THREE.BufferGeometry {
  return cached(`rim${tabUp}`, () => {
    const shape = outerRect();
    shape.holes.push(rj45Opening(tabUp));
    return extrude(shape, 0.16, 0.03);
  });
}

/** An unpopulated keystone position: a plain rectangular hole, no contacts. */
export function blankRim(): THREE.BufferGeometry {
  return cached("blankrim", () => {
    const shape = outerRect();
    const hole = new THREE.Path();
    hole.moveTo(-0.36, -0.38);
    hole.lineTo(0.36, -0.38);
    hole.lineTo(0.36, 0.38);
    hole.lineTo(-0.36, 0.38);
    hole.closePath();
    shape.holes.push(hole);
    return extrude(shape, 0.12, 0.02);
  });
}

/**
 * The eight gold contacts, on the wall the plug's latch does not touch.
 * They sit at an angle so the plug's own contacts wipe as it seats, and
 * that angle is the one thing that makes a lit jack twinkle rather than
 * sit there as a flat gold smear.
 */
export function jackContacts(tabUp: boolean): THREE.BufferGeometry {
  return cached(`contacts${tabUp}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i += 1) {
      const strip = new THREE.BoxGeometry(0.048, 0.26, 0.022);
      strip.rotateX(tabUp ? -0.42 : 0.42);
      strip.translate(-0.245 + i * 0.07, tabUp ? -0.06 : 0.06, -0.3);
      parts.push(strip);
    }
    return mergeGeometries(parts, false) ?? parts[0];
  });
}

/** The dark space behind the opening, so a jack is a hole and not a plate. */
export function jackCavity(): THREE.BufferGeometry {
  // Front face just behind the rim, so no sliver of chassis shows through
  // the opening, and deep enough that the inside stays in shadow.
  return cached("cavity", () => faceForward(new THREE.BoxGeometry(0.86, 0.86, 0.5), 0.3));
}

/**
 * An SFP cage: a stamped steel box with a wide slot and the EMI fingers
 * across its mouth. Empty cages are the ones with the dust plug still in,
 * which is most of them in most racks.
 */
export function sfpCage(): THREE.BufferGeometry {
  return cached("sfp", () => {
    const shape = outerRect();
    const hole = new THREE.Path();
    hole.moveTo(-0.42, -0.3);
    hole.lineTo(0.42, -0.3);
    hole.lineTo(0.42, 0.3);
    hole.lineTo(-0.42, 0.3);
    hole.closePath();
    shape.holes.push(hole);
    return extrude(shape, 0.2, 0.03);
  });
}

/** A rack screw: a washered pan head with a cross slot in it. */
export function rackScrew(): THREE.BufferGeometry {
  return cached("screw", () => {
    const head = new THREE.CylinderGeometry(0.45, 0.5, 0.28, 12);
    head.rotateX(Math.PI / 2);
    const a = new THREE.BoxGeometry(0.62, 0.1, 0.1);
    a.translate(0, 0, 0.1);
    const b = new THREE.BoxGeometry(0.1, 0.62, 0.1);
    b.translate(0, 0, 0.1);
    const merged = mergeGeometries([head, a, b], false) ?? head;
    return faceForward(merged, 0.14);
  });
}

/** A NEMA 5-15R outlet: two blade slots and the D shaped ground below them. */
export function outlet(): THREE.BufferGeometry {
  return cached("outlet", () => {
    const shape = outerRect(0.02);
    const neutral = new THREE.Path();
    neutral.moveTo(-0.26, -0.02);
    neutral.lineTo(-0.14, -0.02);
    neutral.lineTo(-0.14, 0.34);
    neutral.lineTo(-0.26, 0.34);
    neutral.closePath();
    const hot = new THREE.Path();
    hot.moveTo(0.15, 0.02);
    hot.lineTo(0.25, 0.02);
    hot.lineTo(0.25, 0.34);
    hot.lineTo(0.15, 0.34);
    hot.closePath();
    const ground = new THREE.Path();
    ground.absarc(0, -0.22, 0.13, 0, Math.PI * 2, false);
    shape.holes.push(neutral, hot, ground);
    return extrude(shape, 0.24, 0.02);
  });
}

/** A wire fan guard: the ring plus its spokes, as stamped from one sheet. */
export function fanGuard(): THREE.BufferGeometry {
  return cached("fan", () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const r of [0.5, 0.34, 0.18]) {
      const ring = new THREE.TorusGeometry(r, 0.018, 5, 22);
      parts.push(ring);
    }
    for (let i = 0; i < 6; i += 1) {
      const spoke = new THREE.BoxGeometry(0.03, 1.0, 0.03);
      spoke.rotateZ((i * Math.PI) / 6);
      parts.push(spoke);
    }
    const merged = mergeGeometries(parts, false) ?? parts[0];
    return faceForward(merged, 0.02);
  });
}

/**
 * An RJ45 plug boot: the tapered body, the strain relief ribs and the
 * latch arm lying along its back. Drawn along +Z so it can be pointed at
 * whatever the cable's own direction of travel is.
 */
export function plugBoot(): THREE.BufferGeometry {
  return cached("boot", () => {
    const parts: THREE.BufferGeometry[] = [];
    // The moulded plug body, then the boot tapering back onto the jacket.
    const body = new THREE.BoxGeometry(1, 1.15, 1.5);
    body.translate(0, 0, -0.75);
    parts.push(body);
    const collar = new THREE.CylinderGeometry(0.52, 0.4, 1.1, 10);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0, -2.05);
    parts.push(collar);
    for (let i = 0; i < 3; i += 1) {
      const rib = new THREE.CylinderGeometry(0.5, 0.5, 0.11, 10);
      rib.rotateX(Math.PI / 2);
      rib.translate(0, 0, -1.75 - i * 0.28);
      parts.push(rib);
    }
    // The latch arm, angled back off the top of the plug body.
    const latch = new THREE.BoxGeometry(0.34, 0.12, 0.9);
    latch.rotateX(-0.18);
    latch.translate(0, 0.63, -0.95);
    parts.push(latch);
    return mergeGeometries(parts, false) ?? parts[0];
  });
}

/**
 * A chassis shell with chamfered edges.
 *
 * A box in three.js has perfectly sharp arrises, and nothing manufactured
 * does: a folded steel or extruded aluminium case has a radius on every
 * edge, and that radius is what catches the key light and draws the bright
 * line down the front of the box. Without it a rack of equipment reads as a
 * stack of untextured cubes no matter how good the lighting is.
 *
 * Built per size rather than normalised, because a chamfer that scales with
 * the box is not a chamfer.
 */
export function chassisShell(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `shell${w.toFixed(4)}x${h.toFixed(4)}x${d.toFixed(4)}`;
  return cached(key, () => {
    const r = Math.min(0.0018, h * 0.08);
    const shape = new THREE.Shape();
    const hw = w / 2 - r;
    const hh = h / 2 - r;
    shape.moveTo(-hw - r, -hh);
    shape.lineTo(-hw - r, hh);
    shape.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
    shape.lineTo(hw, hh + r);
    shape.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
    shape.lineTo(hw + r, -hh);
    shape.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
    shape.lineTo(-hw, -hh - r);
    shape.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);
    const body = d - r * 2;
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: body,
      bevelEnabled: true,
      bevelThickness: r,
      bevelSize: r,
      bevelSegments: 2,
      curveSegments: 2,
    });
    // Front chamfer on z = 0, body running back.
    geom.translate(0, 0, -body - r);
    geom.computeVertexNormals();
    return geom;
  });
}

/**
 * An SFP module seated in its cage.
 *
 * Empty cages everywhere is what an unbuilt rack looks like. A populated
 * uplink has a module in it, and the module is unmistakable: a body that
 * stands proud of the panel by most of its own length, the bail latch
 * folded down along its underside, and the duplex bore at the front where
 * the fibre goes. Any switch in this library with a lit optic gets one.
 */
export function sfpModule(): THREE.BufferGeometry {
  return cached("sfpmod", () => {
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.BoxGeometry(0.86, 0.62, 1.5);
    body.translate(0, 0, 0.5);
    parts.push(body);
    // The bail, hinged at the front and folded back under the body.
    const bail = new THREE.BoxGeometry(0.72, 0.07, 0.06);
    bail.translate(0, -0.36, 1.12);
    parts.push(bail);
    for (const sx of [-1, 1]) {
      const arm = new THREE.BoxGeometry(0.06, 0.07, 0.7);
      arm.translate(sx * 0.36, -0.34, 0.82);
      parts.push(arm);
    }
    return mergeGeometries(parts, false) ?? parts[0];
  });
}

/** The duplex bore in the module's face, so it is a socket and not a block. */
export function sfpBore(): THREE.BufferGeometry {
  return cached("sfpbore", () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const hole = new THREE.BoxGeometry(0.3, 0.34, 0.18);
      hole.translate(sx * 0.2, 0.02, 1.18);
      parts.push(hole);
    }
    return mergeGeometries(parts, false) ?? parts[0];
  });
}

/**
 * One D-ring off a horizontal cable manager.
 *
 * The manager was nine slabs standing off the panel, which is a comb, not
 * a manager. The real part is a row of open rings on short posts: bundles
 * drop into them from above and are retained without being clamped, and
 * the open side is what lets you add a lead later without unthreading the
 * whole rack.
 */
export function cableRing(): THREE.BufferGeometry {
  return cached("dring", () => {
    const ring = new THREE.TorusGeometry(0.42, 0.06, 6, 20, Math.PI * 1.45);
    ring.rotateZ(Math.PI * 0.28);
    ring.translate(0, 0, -0.5);
    const post = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    post.rotateX(Math.PI / 2);
    post.translate(0, 0, -0.25);
    return mergeGeometries([ring, post], false) ?? ring;
  });
}
