import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * A field of identical, static boxes drawn in a single call.
 *
 * The rack detail meshes — vent slots, honeycomb perforations, patch-panel
 * ports, cage-nut holes — are all the same box repeated hundreds of times
 * with one shared material. Emitting them as individual `<mesh>` elements
 * costs one draw call each: the cage-nut holes alone were 504 calls per
 * rack for detail that is a few pixels wide on screen.
 *
 * Geometry and material are unchanged, so the render is identical; only
 * the submission cost differs.
 */
export function InstancedBoxes({
  positions,
  size,
  material,
  renderOrder,
}: {
  /** Local positions, one per box. */
  positions: Array<[number, number, number]>;
  /** Box dimensions, shared by every instance. */
  size: [number, number, number];
  material: THREE.Material;
  renderOrder?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = positions.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || count === 0) return;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = positions[i];
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Keep frustum culling accurate now that the instances have moved.
    mesh.computeBoundingSphere();
  }, [positions, count, dummy]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      material={material}
      renderOrder={renderOrder}
    >
      <boxGeometry args={size} />
    </instancedMesh>
  );
}
