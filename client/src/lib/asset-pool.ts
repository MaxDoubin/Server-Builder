import * as THREE from "three";
import { registerPoolDisposer } from "./asset-pool-dispose";

const geometryPool = new Map<string, THREE.BufferGeometry>();
const materialPool = new Map<string, THREE.Material>();

function stableKey(value: unknown): string {
  if (value instanceof THREE.Color) {
    return `color:${value.getHexString()}`;
  }
  if (value instanceof THREE.Texture) {
    return `texture:${value.uuid}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${key}:${stableKey((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return String(value);
}

function getGeometry<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
  const existing = geometryPool.get(key);
  if (existing) return existing as T;
  const created = factory();
  geometryPool.set(key, created);
  return created;
}

function getMaterial<T extends THREE.Material>(key: string, factory: () => T): T {
  const existing = materialPool.get(key);
  if (existing) return existing as T;
  const created = factory();
  materialPool.set(key, created);
  return created;
}

export function getBoxGeometry(args: [number, number, number]): THREE.BoxGeometry {
  const key = `box:${args.join("x")}`;
  return getGeometry(key, () => new THREE.BoxGeometry(...args));
}

export function getPlaneGeometry(args: [number, number]): THREE.PlaneGeometry {
  const key = `plane:${args.join("x")}`;
  return getGeometry(key, () => new THREE.PlaneGeometry(...args));
}

export function getCircleGeometry(args: [number, number]): THREE.CircleGeometry {
  const key = `circle:${args.join("x")}`;
  return getGeometry(key, () => new THREE.CircleGeometry(...args));
}

export function getSphereGeometry(args: [number, number, number, number?, number?, number?, number?]): THREE.SphereGeometry {
  const key = `sphere:${args.join("x")}`;
  return getGeometry(key, () => new THREE.SphereGeometry(...args));
}

export function getStandardMaterial(options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const key = `standard:${stableKey(options)}`;
  return getMaterial(key, () => new THREE.MeshStandardMaterial(options));
}

export function getPhysicalMaterial(options: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  const key = `physical:${stableKey(options)}`;
  return getMaterial(key, () => new THREE.MeshPhysicalMaterial(options));
}

export function getBasicMaterial(options: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  const key = `basic:${stableKey(options)}`;
  return getMaterial(key, () => new THREE.MeshBasicMaterial(options));
}

export function getCorePooledMaterials() {
  return Array.from(materialPool.values());
}

export function disposePooledAssets() {
  geometryPool.forEach((geometry) => geometry.dispose());
  materialPool.forEach((material) => material.dispose());
  geometryPool.clear();
  materialPool.clear();
}

// Hand the disposer to the three-free registry so App can trigger cleanup
// without importing this module (and therefore three) on every route.
registerPoolDisposer(disposePooledAssets);
