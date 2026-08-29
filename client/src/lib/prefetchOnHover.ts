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
 * Wiring: App.tsx calls installLinkPrefetching() once, which delegates from
 * the document and covers every internal link on the site. The per-link
 * prefetchHandlers below remain for a caller that wants explicit control,
 * but nothing has to use them.
 *
 * The import specifiers below MUST stay character-identical to the ones in
 * App.tsx. Rollup keys chunks by the resolved module, so a mismatched
 * specifier would silently emit a second copy of the page instead of warming
 * the chunk the router is going to load.
 *
 * Adding a route: add its entry to EXACT_ROUTES or PREFIX_ROUTES here at the
 * same time as the lazy() in App.tsx, or hovering it simply does nothing.
 *
 * That instruction was not enough on its own. Thirty-seven routes were added
 * after this file was written and none of them were registered, so hover
 * prefetching quietly covered nineteen routes out of fifty-six, including no
 * tool page at all. scripts-ci/check-prefetch-map.mjs now fails the build on
 * a lazy route with no entry here, so the drift cannot repeat silently.
 */

import { useMemo } from "react";

type ImportThunk = () => Promise<unknown>;

interface RouteChunk {
  load: ImportThunk;
  /**
   * Chunk for a path one segment deeper than this prefix, where the two
   * depths are different pages. /study/ccna is the exam page and
   * /study/ccna/ip-connectivity is one of its domains, so a prefix alone
   * cannot tell them apart.
   */
  deeper?: RouteChunk;
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
  "/data": { load: () => import("@/pages/cinematic/CinematicData") },
  "/study": { load: () => import("@/pages/cinematic/CinematicStudy") },
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
  "/archive": { load: () => import("@/pages/cinematic/CinematicArchive") },
  "/ask": { load: () => import("@/pages/cinematic/CinematicAsk") },
  "/certifications": { load: () => import("@/pages/cinematic/CinematicCerts") },
  "/changelog": { load: () => import("@/pages/cinematic/CinematicChangelog") },
  "/coding-camps": { load: () => import("@/pages/cinematic/CinematicCamps") },
  "/colophon": { load: () => import("@/pages/cinematic/CinematicColophon") },
  "/cyber-club": { load: () => import("@/pages/cinematic/CinematicCyberClub") },
  "/cyber-club/kit": { load: () => import("@/pages/cinematic/CinematicClubKit") },
  "/faq": { load: () => import("@/pages/cinematic/CinematicFaq") },
  "/flashcards": { load: () => import("@/pages/cinematic/CinematicFlashcards") },
  "/links": { load: () => import("@/pages/cinematic/CinematicLinks") },
  "/ncl": { load: () => import("@/pages/cinematic/CinematicNcl") },
  "/now": { load: () => import("@/pages/cinematic/CinematicNow") },
  "/paths": { load: () => import("@/pages/cinematic/CinematicPaths") },
  "/resume": { load: () => import("@/pages/cinematic/CinematicResume") },
  "/study-timer": { load: () => import("@/pages/cinematic/CinematicStudyTimer") },
  "/subscribe": { load: () => import("@/pages/cinematic/CinematicSubscribe") },
  "/timeline": { load: () => import("@/pages/cinematic/CinematicTimeline") },
  "/tools": { load: () => import("@/pages/cinematic/CinematicTools") },
  "/tools/base-converter": { load: () => import("@/pages/tools/BaseConverter") },
  "/tools/chmod-calculator": { load: () => import("@/pages/tools/ChmodCalculator") },
  "/tools/cidr-visualizer": { load: () => import("@/pages/tools/CidrVisualizer") },
  "/tools/classical-ciphers": { load: () => import("@/pages/tools/ClassicalCiphers") },
  "/tools/cron-explainer": { load: () => import("@/pages/tools/CronExplainer") },
  "/tools/dns-records": { load: () => import("@/pages/tools/DnsRecords") },
  "/tools/encoder-decoder": { load: () => import("@/pages/tools/EncoderDecoder") },
  "/tools/hash-identifier": { load: () => import("@/pages/tools/HashIdentifier") },
  "/tools/http-status-codes": { load: () => import("@/pages/tools/HttpStatusCodes") },
  "/tools/mac-lookup": { load: () => import("@/pages/tools/MacLookup") },
  "/tools/packet-headers": { load: () => import("@/pages/tools/PacketHeaders") },
  "/tools/port-reference": { load: () => import("@/pages/tools/PortReference") },
  "/tools/rack-budget": { load: () => import("@/pages/tools/RackBudget") },
  "/tools/regex-tester": { load: () => import("@/pages/tools/RegexTester") },
  "/tools/subnet-calculator": { load: () => import("@/pages/tools/SubnetCalculator") },
  "/tools/vlsm-practice": { load: () => import("@/pages/tools/VlsmPractice") },
  "/tools/wireshark-filters": { load: () => import("@/pages/tools/WiresharkFilters") },
  "/uses": { load: () => import("@/pages/cinematic/CinematicUses") },
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
  // One segment is a certification, two is one of its exam domains.
  "/study/": {
    load: () => import("@/pages/cinematic/CinematicStudyExam"),
    deeper: { load: () => import("@/pages/cinematic/CinematicStudyDomain") },
  },
  "/topics/": { load: () => import("@/pages/cinematic/CinematicTag") },
  "/ncl/": { load: () => import("@/pages/cinematic/CinematicNclGuide") },
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
  if (bestKey) {
    const chunk = PREFIX_ROUTES[bestKey];
    // "/study/ccna" has one segment after the prefix, "/study/ccna/ip-x" has two.
    const rest = path.slice(bestKey.length);
    if (chunk.deeper && rest.includes("/")) {
      return { key: `${bestKey}*/`, chunk: chunk.deeper };
    }
    return { key: bestKey, chunk };
  }

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

/**
 * Prefetch any internal link the pointer or keyboard lands on, anywhere.
 *
 * The per-link handlers below required every link in the codebase to opt in,
 * and only the two nav components ever did. Tool cards, post cards, footer
 * links, related posts, topic hubs and reading paths all had a registered
 * route and no way to trigger it, so hovering them did nothing.
 *
 * One delegated listener covers every link that exists now and every link
 * added later, with no per-call-site wiring to forget. Call once at startup.
 *
 * pointerover covers mouse and pen. focusin covers keyboard tabbing. Touch
 * gets touchstart, which lands roughly a tenth of a second before the click
 * and is the only warning a tap gives.
 */
export function installLinkPrefetching(): () => void {
  if (typeof document === "undefined") return () => {};

  const onCandidate = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    // Leave anything the router will not handle to the browser: other
    // origins, new tabs, downloads, and mailto or tel schemes.
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;
    if (anchor.origin !== window.location.origin) return;

    prefetchRoute(anchor.pathname + anchor.search + anchor.hash);
  };

  document.addEventListener("pointerover", onCandidate, { passive: true });
  document.addEventListener("focusin", onCandidate, { passive: true });
  document.addEventListener("touchstart", onCandidate, { passive: true });

  return () => {
    document.removeEventListener("pointerover", onCandidate);
    document.removeEventListener("focusin", onCandidate);
    document.removeEventListener("touchstart", onCandidate);
  };
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
