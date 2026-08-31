/**
 * One Draco decoder and one Basis transcoder, shared by every scene.
 *
 * This exists because of a bug that only appeared on pages loading more than
 * one model, which is why it survived the page that loads exactly one.
 *
 * Each scene used to configure its GLTFLoader inline, and the configure
 * callback runs per model, so `new KTX2Loader()` ran per model too. A
 * KTX2Loader is not a lightweight object: it owns a pool of Web Workers, and
 * each worker fetches and instantiates the 500KB Basis transcoder before it
 * can decode a single texture. One of those is fine. Ten of them, which is
 * what the wired rack asked for, is ten worker pools and ten wasm
 * instantiations competing for a worker budget the browser caps, and the
 * result is not a clean failure: loading climbs to eighty or ninety percent
 * and stops there forever, with the placeholder geometry left standing.
 *
 * The teardown page looked fine throughout, and that was the misleading part.
 * It loads one model, so it made one pool, so it never hit the ceiling. A
 * page working is not evidence the code behind it is right; it can just mean
 * that page never asked the hard question.
 *
 * three.js is explicit that a KTX2Loader is meant to be created once and
 * reused across loads, so the fix is to do that: build both decoders lazily
 * on first use, hand the same pair to every loader after that, and never
 * dispose them, because the pages that want them are the pages that will
 * want them again when somebody adds another device.
 */

import type { WebGLRenderer } from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

let draco: DRACOLoader | null = null;
let ktx2: KTX2Loader | null = null;

/**
 * Configure a GLTFLoader with the shared decoders.
 *
 * Both decoder paths are served from this site rather than a CDN, which is
 * the same reason the environment map is procedural: a page that renders
 * vendor hardware should not also be quietly calling out to Google to do it.
 *
 * `detectSupport` needs a renderer and is idempotent, but it is only worth
 * calling once, on the instance that will do every transcode.
 */
export function configureGltf(loader: GLTFLoader, gl: WebGLRenderer): void {
  if (!draco) {
    draco = new DRACOLoader().setDecoderPath("/draco/");
  }
  if (!ktx2) {
    ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
  }
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);
  loader.setMeshoptDecoder(MeshoptDecoder);
}
