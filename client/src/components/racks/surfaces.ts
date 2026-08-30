/**
 * Surface microstructure.
 *
 * Everything in the rack was rendering with one uniform roughness, and a
 * perfectly uniform surface is the last thing that reads as computer
 * generated after the shapes are right. Real powder coat has an orange
 * peel to it, real anodised aluminium has a directional grain from the
 * extrusion, and both break up a highlight into something that moves as
 * you orbit rather than sitting still as a flat patch.
 *
 * This is a roughness map, not a colour map, so it costs nothing in
 * saturation or contrast and cannot make a white frame look dirty. One
 * small tiled texture is shared by every material in the scene.
 */

import * as THREE from "three";

let grainTex: THREE.Texture | null | undefined;

/** Fine directional grain, tiled. Null on the server, where there is no DOM. */
export function surfaceGrain(): THREE.Texture | null {
  if (grainTex !== undefined) return grainTex;
  if (typeof document === "undefined") {
    grainTex = null;
    return null;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    grainTex = null;
    return null;
  }

  const img = ctx.createImageData(size, size);
  /*
    Two scales of noise: a fine one across the grain direction for the
    brushing, and a broad one for the orange peel. Deterministic, so the
    same rack renders identically every load and a screenshot diff means
    something changed.
  */
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = Math.sin(x * 2.399 + y * 0.13) * 0.5 + Math.sin(x * 7.13) * 0.5;
      const broad = Math.sin(x * 0.11 + y * 0.09) * Math.cos(y * 0.07 - x * 0.05);
      /*
        A narrow band around one roughness value. The first pass swung it
        from 130 to 206 over a 73mm tile, which on black powder coat came
        out looking like woven carbon fibre rather than like paint.
      */
      const v = 182 + fine * 5 + broad * 9;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 3);
  tex.anisotropy = 4;
  grainTex = tex;
  return tex;
}
