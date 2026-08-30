/**
 * A studio to reflect.
 *
 * This is the fix for the single worst problem in the first 3D pass: metal
 * rendered as a flat dead grey no matter how many lights were aimed at it.
 * That is not a lighting bug. A physically based metal surface has almost
 * no diffuse response; nearly everything you see on it is reflection, so a
 * metal object in a scene with nothing to reflect is correctly rendered as
 * black. Adding lights makes it a slightly brighter black.
 *
 * three ships a small procedural room, and running it through PMREM gives
 * an environment map with the soft area sources a product photographer
 * would actually use. No network fetch, no HDR asset, about a millisecond
 * once per scene, and anodised aluminium finally looks anodised.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function StudioEnvironment() {
  const { scene, gl } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);

  return null;
}
