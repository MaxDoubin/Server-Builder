import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Recovering from a lazy chunk that will not load.
 *
 * Chunk loading is fragile right after a deploy: the browser can be holding
 * an HTML document that names hashed chunk paths the bundler has already
 * replaced, and the first dynamic import fails. On a phone, one dropped
 * request does the same thing with no deploy involved.
 *
 * A RETRY CANNOT FIX IT IN CHROMIUM. A native dynamic import is not an
 * ordinary fetch. The browser keeps a module map keyed by specifier, a
 * failure is recorded in it, and every later `import()` of the same
 * specifier is handed the same rejected promise without going near the
 * network. Measured: two imports of a URL that 404'd once made one request.
 *
 * A FRESH SPECIFIER DOES NOT FIX IT EITHER. This used to re-import the failed
 * URL with `?retry=N` appended, which is a new key in the module map and a
 * real request, and the request worked. The module it returned did not:
 * every lazy loader picks a named export (`m.CinematicCerts`) and hands React
 * `{ default: ... }`, and the raw chunk has no default export. React got
 * `undefined` for a component, threw error #306, and the reader got the error
 * screen for a chunk that had just downloaded fine.
 *
 * So retries call the loader itself. In a browser that does not cache the
 * failure that is a real second request; in one that does, it fails fast and
 * we move on to the cure.
 *
 * THE CURE IS A RELOAD. Either the network blipped, and a reload gets the
 * chunk, or this page is a list of files a deploy has since replaced, and a
 * reload fetches a current document. It is guarded, because an automatic
 * reload that can loop is worse than any error page.
 *
 * The guard is "was this document itself produced by a recovery reload, and
 * is the reader still where it landed". Both earlier guards were wrong:
 *
 * - A once-per-session flag, set on the first reload and never cleared. A tab
 *   that recovered from one deploy went straight to the error screen on the
 *   next, and this site deploys several times a day.
 * - A 30 second window. A request on a stalled connection can take longer
 *   than that to fail, so the window had expired by the time the reloaded
 *   document failed again, and it reloaded again, indefinitely.
 *
 * Asking about the document instead of the clock has neither problem. A
 * reload lands on the same URL it left, so a recovered document that fails
 * before the reader navigates gets the error screen, however long the
 * failure took. Once the reader has moved to another page in the app, a
 * failure there is a new one and gets its own reload.
 */
const RECOVERY_KEY = "chunk-recovery-reload";

/** Path and query, without the hash: an in-page anchor is not a navigation. */
function currentPage(): string {
  return `${location.pathname}${location.search}`;
}

/**
 * The page this document was loaded at, if a recovery reload loaded it.
 * Read once and cleared, so a manual reload is a fresh start.
 */
const recoveredAt: string | null = (() => {
  try {
    const page = sessionStorage.getItem(RECOVERY_KEY);
    sessionStorage.removeItem(RECOVERY_KEY);
    return page;
  } catch {
    return null;
  }
})();

let reloadStarted = false;
const abandonListeners = new Set<() => void>();

/**
 * Run `listener` if a reload this document started is abandoned. Pressing
 * Back while a slow reload is still loading cancels it, and this document
 * carries on at the previous entry instead of being replaced. Returns an
 * unsubscribe function.
 */
export function onReloadAbandoned(listener: () => void): () => void {
  abandonListeners.add(listener);
  return () => {
    abandonListeners.delete(listener);
  };
}

function watchForAbandonedReload() {
  const abandon = (event: Event) => {
    if (event.type === "pageshow" && !(event as PageTransitionEvent).persisted) {
      return;
    }
    window.removeEventListener("popstate", abandon);
    window.removeEventListener("pageshow", abandon);
    reloadStarted = false;
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      /* Nothing stored, nothing to clear. */
    }
    for (const listener of Array.from(abandonListeners)) listener();
  };
  window.addEventListener("popstate", abandon);
  window.addEventListener("pageshow", abandon);
}

/** "Failed to fetch dynamically imported module" and its cousins. */
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_ERROR.test(message);
}

/**
 * Reload to get a current document, unless this document came from a
 * recovery reload and the reader has not left the page it landed on.
 * Returns whether it reloaded.
 */
export function reloadForFreshDocument(): boolean {
  // Two acts failing together both land here; one reload is enough.
  if (reloadStarted) return true;
  try {
    if (recoveredAt === currentPage()) return false;
    sessionStorage.setItem(RECOVERY_KEY, currentPage());
  } catch {
    /* No storage means no guard, and no guard means no automatic reload. */
    return false;
  }
  reloadStarted = true;
  watchForAbandonedReload();
  location.reload();
  return true;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  retries = 3,
  delayMs = 250,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * Math.pow(2, attempt)),
        );
      }
    }

    /*
      Out of retries. If the reload is refused, the error screen appears,
      which is where a failure that survives a reload belongs.
    */
    if (reloadForFreshDocument()) {
      /*
        Normally never settles; the reload takes the page out from under it.
        If the reload is abandoned, fail so the route is not left waiting on
        a loader that will never answer.
      */
      await new Promise<void>((resolve) => {
        const stop = onReloadAbandoned(() => {
          stop();
          resolve();
        });
      });
    }

    throw lastError;
  });
}
