/**
 * Route prefetching on hover and focus.
 *
 * Every route except "/" is a React.lazy chunk, so the first click on a nav
 * link shows the routing skeleton while the chunk downloads. A pointer
 * usually rests on a link for a couple of hundred milliseconds before the
 * click lands, which is enough to have the chunk in memory by the time the
 * router asks for it. Focus is wired alongside hover so keyboard tabbing
 * through the nav gets the same head start.
 *
 * Wiring: the coordinator spreads these handlers onto the nav links in
 * CinematicNav (and anywhere else a route link is rendered), for example
 *   <Link href={link.href} {...prefetchHandlers(link.href)}>
 *
 * The import specifiers below MUST stay character-identical to the ones in
 * App.tsx. Rollup keys chunks by the resolved module, so a mismatched
 * specifier would silently emit a second copy of the page instead of warming
 * the chunk the router is going to load.
 *
 * Adding a route: add its entry to EXACT_ROUTES or PREFIX_ROUTES here at the
 * same time as the lazy() in App.tsx, or hovering it simply does nothing.
 */

import { useMemo } from "react";

type ImportThunk = () => Promise<unknown>;

interface RouteChunk {
  load: ImportThunk;
  /**
   * True for a route whose chunk is large enough that speculatively pulling
   * it is a real cost. /game drags in three.js and react-three-fiber, roughly
   * 800KB. Worth prefetching on a fast link, rude on a metered one.
   */
  heavy?: boolean;
}

/** Matched when the path is exactly this. */
const EXACT_ROUTES: Record<string, RouteChunk> = {
  // "/" is CinematicHome, a static import in App.tsx. Already in the entry
  // chunk, so there is nothing to fetch.
  "/blog": { load: () => import("@/pages/cinematic/CinematicBlog") },
  "/topics": { load: () => import("@/pages/cinematic/CinematicTopics") },
  "/roadmap": { load: () => import("@/pages/cinematic/CinematicRoadmap") },
  "/projects": { load: () => import("@/pages/cinematic/CinematicProjects") },
  "/contact": { load: () => import("@/pages/cinematic/CinematicContact") },
  "/game": { load: () => import("@/pages/cinematic/CinematicGame"), heavy: true },
  "/legacy": { load: () => import("@/pages/Home") },
  "/legacy/blog": { load: () => import("@/pages/Blog") },
  "/legacy/projects": { load: () => import("@/pages/Projects") },
  "/legacy/contact": { load: () => import("@/pages/Contact") },
  "/legacy/game": { load: () => import("@/pages/GamePage"), heavy: true },
  "/noc": { load: () => import("@/pages/noc-dashboard") },
  "/network": { load: () => import("@/pages/network-dashboard") },
  "/floor": { load: () => import("@/pages/floor-dashboard") },
  "/incidents": { load: () => import("@/pages/incidents-dashboard") },
  "/build": { load: () => import("@/pages/build-dashboard") },
};

/**
 * Matched when the path starts with this. Longest prefix wins, so
 * "/legacy/blog/x" resolves to the legacy post page rather than the
 * cinematic one. Every key ends in a slash so "/blogroll" cannot match
 * "/blog/".
 */
const PREFIX_ROUTES: Record<string, RouteChunk> = {
  "/blog/": { load: () => import("@/pages/cinematic/CinematicBlogPost") },
  "/topics/": { load: () => import("@/pages/cinematic/CinematicTag") },
  "/legacy/blog/": { load: () => import("@/pages/BlogPost") },
};

/**
 * Chunk keys already requested. Module level, so it survives every remount
 * and a reader sweeping the pointer back and forth across the nav triggers
 * one import per route, not one per hover.
 */
const requested = new Set<string>();

function normalisePath(href: string): string {
  const withoutHash = href.split("#")[0].split("?")[0];
  if (!withoutHash || !withoutHash.startsWith("/")) return "";
  // "/blog/" and "/blog" are the same route to the router.
  if (withoutHash.length > 1 && withoutHash.endsWith("/")) {
    return withoutHash.slice(0, -1);
  }
  return withoutHash;
}

function resolveRoute(path: string): { key: string; chunk: RouteChunk } | null {
  const exact = EXACT_ROUTES[path];
  if (exact) return { key: path, chunk: exact };

  let bestKey = "";
  for (const key of Object.keys(PREFIX_ROUTES)) {
    if (path.startsWith(key) && key.length > bestKey.length) bestKey = key;
  }
  if (bestKey) return { key: bestKey, chunk: PREFIX_ROUTES[bestKey] };

  return null;
}

/**
 * Do not spend someone else's data plan on a guess. saveData is an explicit
 * "I am paying for this" signal, and a 2g/3g effectiveType means the
 * speculative fetch would compete with the assets the current page still
 * needs. Both are Chromium-only; elsewhere this is simply true.
 */
function connectionAllowsPrefetch(heavy: boolean): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;

  const effectiveType = connection.effectiveType;
  if (effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g") {
    return false;
  }
  if (heavy && effectiveType !== "4g") return false;
  return true;
}

/**
 * Start loading the chunk behind `href`, at most once per route.
 * Unknown paths, external links and pure anchors are no-ops.
 */
export function prefetchRoute(href: string): void {
  if (typeof window === "undefined") return;

  const path = normalisePath(href);
  if (!path) return;

  const resolved = resolveRoute(path);
  if (!resolved) return;
  if (requested.has(resolved.key)) return;
  if (!connectionAllowsPrefetch(Boolean(resolved.chunk.heavy))) return;

  requested.add(resolved.key);
  void resolved.chunk.load().catch(() => {
    // A failed prefetch must stay invisible: the router will try the same
    // import again on navigation, with App.tsx's retry wrapper behind it.
    // Drop the key so a later hover can have another go.
    requested.delete(resolved.key);
  });
}

export interface PrefetchHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
}

/**
 * Handlers to spread onto a link. Plain function rather than a hook so it can
 * be called inside a .map() over nav links without breaking the rules of
 * hooks.
 */
export function prefetchHandlers(href: string): PrefetchHandlers {
  return {
    onMouseEnter: () => prefetchRoute(href),
    onFocus: () => prefetchRoute(href),
  };
}

/**
 * Hook form, for a component that renders a single fixed link and wants the
 * handler identity to stay stable across renders (so a memoised child is not
 * re-rendered by new function props on every parent render).
 */
export function usePrefetchOnHover(href: string): PrefetchHandlers {
  return useMemo(() => prefetchHandlers(href), [href]);
}
