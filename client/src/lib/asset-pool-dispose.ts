/**
 * A three-free handle on the asset pool's cleanup.
 *
 * App.tsx disposes pooled GPU resources when the tab goes away, but
 * importing asset-pool directly to reach that one function linked the whole
 * of three into the entry chunk. Every visitor then downloaded 681KB of
 * WebGL before the landing page could run, including people on /contact,
 * which has no canvas on it at all.
 *
 * asset-pool registers its disposer here as it loads, which only happens
 * once something actually renders 3D. Until then the pools are empty and
 * disposing is correctly a no-op.
 */
let disposer: (() => void) | null = null;

export function registerPoolDisposer(fn: () => void) {
  disposer = fn;
}

export function disposePooledAssets() {
  disposer?.();
}
