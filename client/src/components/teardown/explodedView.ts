/**
 * The exploded-view layer on the teardown: what it is, and its off switch.
 *
 * The teardown already moves Dell's parts. What an engineering exploded
 * view adds on top is the drafting: a dashed center line from where each
 * part sat to where it has gone, and a leader line with a name on the parts
 * worth naming. Without those a pulled-apart machine is a cloud of sheet
 * metal; with them it is a drawing that can be read.
 *
 * Everything the layer does hangs off the one constant below.
 */

import * as THREE from "three";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import type { TeardownPart } from "./teardownParts";

/**
 * THE SWITCH. False removes the whole layer from /teardown: no center
 * lines, no callouts, no scroll scrubbing, no sticky viewer. The page goes
 * back to the slider and the play button, exactly as it was.
 */
export const EXPLODED_VIEW_ENABLED = true;

/**
 * Which parts get a name without being asked, and on which devices.
 *
 * Thirty three labels at once is a wall of text over the thing it is
 * describing, so only the parts a reader would look for are called out
 * unprompted, and fewer of them where the canvas is small or the device is
 * weak. Rank 1 shows everywhere, rank 2 from the middle tier up, rank 3 on
 * the high tier only. Any part at all still gets its callout when it is
 * picked in the list.
 *
 * The keys are the labels in teardownParts, which are Dell's own names for
 * these assemblies in the R760 Installation and Service Manual.
 */
const CALLOUT_RANK: Record<string, 1 | 2 | 3> = {
  "System cover": 1,
  "Drive carriers": 1,
  "Cooling fans": 1,
  "Processors and heatsinks": 1,
  Memory: 1,
  "Power supplies": 1,
  "PERC controller": 2,
  "GPU 1": 2,
  "Air shroud": 2,
  "System board": 2,
  "Front bezel": 3,
  "BOSS-N1 module": 3,
  "OCP card": 3,
  "Drive backplane": 3,
};

const MAX_RANK: Record<DeviceTier, number> = { low: 1, mid: 2, high: 3 };

/** Whether a part is named unprompted on this class of device. */
export function isCalledOut(label: string, tier: DeviceTier): boolean {
  const rank = CALLOUT_RANK[label];
  return rank !== undefined && rank <= MAX_RANK[tier];
}

/** One part, as the callout layer needs it: where it sits and where it goes. */
export interface CalloutSeed {
  label: string;
  wave: number;
  /** Center of the part when assembled, in the space the model is drawn in. */
  home: THREE.Vector3;
  /** Its full travel at progress 1, in the same space. */
  travel: THREE.Vector3;
}

/**
 * Measure where each moving part is and which way it leaves.
 *
 * The teardown offsets a part inside its parent, and Dell's parent is
 * turned half a circle against the scene, so a part's travel has to be
 * carried through the parent's transform before a line drawn in scene space
 * will follow it. Getting that wrong does not fail, it draws center lines
 * pointing the opposite way to the parts.
 *
 * Runs once per model load. It allocates freely for that reason; nothing
 * here is called from the frame loop.
 */
export function measureCallouts(
  scene: THREE.Object3D,
  tracked: readonly { node: THREE.Object3D; home: THREE.Vector3; offset: THREE.Vector3; part: TeardownPart }[],
): { seeds: CalloutSeed[]; center: THREE.Vector3 } {
  // The same scene object survives a remount, possibly mid explode, so put
  // every part home before measuring anything.
  for (const t of tracked) t.node.position.copy(t.home);
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const basis = new THREE.Matrix3();
  const seeds = tracked.map((t) => {
    box.setFromObject(t.node);
    const home = box.getCenter(new THREE.Vector3());
    const travel = t.offset.clone();
    if (t.node.parent) travel.applyMatrix3(basis.setFromMatrix4(t.node.parent.matrixWorld));
    return { label: t.part.label, wave: t.part.wave, home, travel };
  });

  const center = box.setFromObject(scene).getCenter(new THREE.Vector3());
  return { seeds, center };
}
