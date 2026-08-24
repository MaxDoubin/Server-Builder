/**
 * Installs the in-browser API interceptor.
 *
 * The site deploys as static files with no backend, so `/api/*` calls are
 * served locally (see local-api.ts). That backend reuses server/storage and
 * pulls in zod with it, roughly 180KB, and it used to load on import from
 * main.tsx. Every visitor paid for it, including readers of the blog and the
 * contact page, which never call the API at all.
 *
 * So this module holds only the interceptor. It is tiny, it installs
 * synchronously before anything can fetch, and it imports the backend on the
 * first `/api/` request. Pages that make no API call never fetch it.
 */

let installed = false;

export function installLocalApi() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    try {
      let url: string;
      let method = (init?.method || "GET").toUpperCase();
      let requestForBody: Request | null = null;

      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
        method = (init?.method || input.method || "GET").toUpperCase();
        requestForBody = input;
      }

      const parsed = new URL(url, window.location.origin);

      if (parsed.pathname.startsWith("/api/")) {
        let body: unknown = undefined;
        if (init?.body != null) {
          try {
            body =
              typeof init.body === "string" ? JSON.parse(init.body) : init.body;
          } catch {
            body = init.body;
          }
        } else if (requestForBody) {
          try {
            body = await requestForBody.clone().json();
          } catch {
            body = undefined;
          }
        }
        const { respond } = await import("./local-api");
        return respond(method, parsed.pathname, body);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[local-api] interceptor error, falling back to network", err);
    }
    return originalFetch(input as never, init);
  };
}

installLocalApi();

export {};
