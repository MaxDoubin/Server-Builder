/**
 * Service worker registration.
 *
 * The worker itself is client/public/sw.js, served from /sw.js so its scope
 * is the whole origin. Everything risky lives in that file; this module only
 * decides whether to register at all, and makes sure a development machine
 * can never end up behind one.
 *
 * Wiring: the coordinator calls registerServiceWorker() from main.tsx.
 */

/** Hosts that are never the real site. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

/**
 * A service worker on a dev host is actively harmful: it serves yesterday's
 * bundle over the dev server's fresh one and the symptom (edits that do not
 * appear) looks nothing like the cause. So dev does not register, and it
 * actively tears down anything a previous session left behind.
 */
function isDevEnvironment(): boolean {
  if (import.meta.env.DEV) return true;
  return isLocalHost(window.location.hostname);
}

async function unregisterAll(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Nothing to do. Not being able to unregister is not worth a console error
    // on every dev page load.
  }
}

/** At most one update check per hour per page. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Ask whether a newer worker has shipped, when the window comes back to the
 * foreground.
 *
 * This exists for the installed app specifically. A browser tab is navigated
 * and reloaded constantly, and the browser revalidates /sw.js on every
 * navigation, so a new worker is picked up within minutes. A standalone PWA
 * window is opened once and left alone for days: nothing navigates, and the
 * only other trigger is the browser's own fallback check, which runs at most
 * every 24 hours. So a fix could sit unshipped for a full day on exactly the
 * surface this file exists to support. Checking on foreground bounds that to
 * an hour, and the worker's skipWaiting means a new one takes over as soon as
 * it installs.
 *
 * Deliberately no reload on controllerchange to go with it. Nothing the
 * worker serves can be broken by a mid-session handover (a new worker starts
 * with empty caches and every miss goes to the network), so yanking the page
 * out from under someone reading an article would buy nothing.
 */
function watchForUpdates(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    const now = Date.now();
    if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = now;

    registration.update().catch(() => {
      // The check failed because the network is down, which the reader
      // already knows. It must never surface as an error.
    });
  });
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // The worker is fetched over the same scheme as the page, and browsers only
  // allow registration from a secure context. localhost counts as secure, but
  // it is excluded above anyway.
  if (!window.isSecureContext) return;

  if (isDevEnvironment()) {
    void unregisterAll();
    return;
  }

  const register = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(watchForUpdates)
      .catch(() => {
        // A failed registration means no offline support, which is a nicety.
        // It must never surface as an error to the reader.
      });
  };

  // Registration competes with the page's own asset fetches for bandwidth, so
  // wait until the load event has passed. If this module runs after load has
  // already fired, the listener would never run, hence the readyState check.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
