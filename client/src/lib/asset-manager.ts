import * as THREE from "three";
import { logError, logWarning } from "@/lib/error-log";

interface StreamingCanvasOptions {
  lowResolution: number;
  highResolution: number;
  repeat: number;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

const scheduleIdle = (callback: () => void) => {
  if (typeof window === "undefined") return;
  // Feature-detect with typeof rather than `in`: lib.dom declares
  // requestIdleCallback as a required Window method, so an `in` test narrows
  // the fallback branch to never. Safari before 16.4 genuinely lacks the API,
  // so that branch has to stay reachable.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 500 });
  } else {
    window.setTimeout(callback, 120);
  }
};

const createFallbackTexture = (repeat: number) => {
  const data = new Uint8Array([255, 0, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
};

export function createStreamingCanvasTexture({
  lowResolution,
  highResolution,
  repeat,
  draw,
}: StreamingCanvasOptions): THREE.Texture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    logError("Streaming texture unavailable. Falling back to placeholder texture.");
    return createFallbackTexture(repeat);
  }

  const render = (size: number) => {
    try {
      canvas.width = size;
      canvas.height = size;
      draw(ctx, size);
    } catch (error) {
      logError("Streaming texture draw failed. Using placeholder texture.", error);
      throw error;
    }
  };

  try {
    render(lowResolution);
  } catch (error) {
    return createFallbackTexture(repeat);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);

  scheduleIdle(() => {
    try {
      render(highResolution);
      texture.needsUpdate = true;
    } catch (error) {
      logError("High-resolution texture upgrade failed. Keeping low-resolution texture.", error);
    }
  });

  return texture;
}

export function precompileSceneMaterials(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
) {
  try {
    renderer.compile(scene, camera);
  } catch (error) {
    logWarning("Scene material precompile failed. Continuing without precompilation.", error);
  }
}
