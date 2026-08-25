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
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
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
