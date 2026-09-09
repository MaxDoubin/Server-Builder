/**
 * A shared cache, implemented as RFC 9111 describes one.
 *
 * Two functions decide everything and they are deliberately separate,
 * because they are the two independent omissions that cause this fault:
 *
 *   storable()  may a shared cache keep this response at all
 *   keyOf()     what will it look the response up by later
 *
 * A response can be perfectly correct about the first and silent about the
 * second, which is the common case: the origin says nothing about caching,
 * the CDN applies a default TTL, and the response is personal but names no
 * Vary header. Nothing is misconfigured. Something is missing.
 *
 * The leak is then derived rather than declared: replay the requests through
 * the cache, and any hit that returns a body belonging to somebody other
 * than the requester is one account's page served to another.
 */

import type { Case, Exchange, Refusal, Request, Response, Step } from "./types";

/* --------------------------------------------------------- Cache-Control */

/** Cache-Control as a set of directives, lowercased, with their values. */
export function directives(header: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) out.set(trimmed.toLowerCase(), "");
    else out.set(trimmed.slice(0, equals).trim().toLowerCase(), trimmed.slice(equals + 1).trim());
  }
  return out;
}

/** The lifetime a shared cache will use, which is not always max-age. */
export function freshness(response: Response): number | null {
  const found = directives(response.cacheControl);
  /*
    s-maxage exists only for shared caches and beats max-age when both are
    present, which is the directive people reach for when they want a CDN to
    hold something longer than a browser will. It also, on its own, makes a
    response with Authorization storable, which is rarely the intent.
  */
  const shared = found.get("s-maxage");
  if (shared !== undefined) return Number(shared);
  const age = found.get("max-age");
  if (age !== undefined) return Number(age);
  return null;
}

/**
 * Whether a shared cache may store this response.
 *
 * The order matters only for which reason gets reported, and the reason is
 * what the page shows, so it runs from the most emphatic instruction to the
 * least. no-store is a refusal. private is a refusal to a shared cache and
 * silence to a browser. Authorization in the request is a refusal unless the
 * response opts back in, which is the rule almost nobody knows.
 */
export function storable(exchange: Exchange): { ok: boolean; refusal?: Refusal } {
  const { request, response } = exchange;
  const found = directives(response.cacheControl);

  if (found.has("no-store")) return { ok: false, refusal: "no-store" };
  if (found.has("private")) return { ok: false, refusal: "private" };
  if (request.method !== "GET") return { ok: false, refusal: "not-a-get" };
  if (response.status !== 200) return { ok: false, refusal: "status" };

  /*
    RFC 9111 section 3.5. A shared cache must not store a response to a
    request with an Authorization header unless the response says public, or
    s-maxage, or must-revalidate. Note what is not on that list: max-age.
  */
  const authorized = Object.keys(request.headers).some((name) => name.toLowerCase() === "authorization");
  if (authorized && !found.has("public") && !found.has("s-maxage") && !found.has("must-revalidate")) {
    return { ok: false, refusal: "authorization" };
  }

  /*
    Something has to say how long. A response with no freshness information
    at all is heuristically cacheable, and a CDN with a default TTL will
    cache it, which is exactly how a personal page with no headers on it
    ends up stored. Modeled as storable, because that is what happens, and
    reported as no-freshness so the page can say the origin never asked for
    this.
  */
  if (freshness(response) === null && !found.has("public") && !found.has("must-revalidate")) {
    return { ok: true, refusal: "no-freshness" };
  }

  return { ok: true };
}

/* ------------------------------------------------------------- the key */

/** The header names a response makes part of the key. */
export const varyOn = (response: Response): string[] =>
  (response.vary ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

/**
 * The key a shared cache stores and looks up by.
 *
 * Method and URL, plus the value of each header the response named in Vary,
 * and nothing else. A missing Vary means a key that ignores the cookie, the
 * Authorization header, the language, and anything else that made the body
 * what it is.
 *
 * `Vary: *` never matches a later request, which is the standard's way of
 * saying do not reuse this.
 */
/*
  One simplification, stated rather than hidden. A real cache computes the
  lookup key using the Vary of the response it already holds, because it has
  to look something up before it has a new response to read. Here the key is
  computed from the response paired with the request, which is the same thing
  whenever every response on a path agrees about Vary. The gate asserts that
  every case does, so the simplification is never leaned on.
*/
export function keyOf(request: Request, response: Response): string {
  const names = varyOn(response);
  if (names.includes("*")) return `${request.method} ${request.path} · never reusable`;
  const header = (name: string) => {
    const match = Object.keys(request.headers).find((key) => key.toLowerCase() === name);
    return match ? request.headers[match] : "absent";
  };
  const parts = names.map((name) => `${name}=${header(name)}`);
  return [`${request.method} ${request.path}`, ...parts].join(" · ");
}

/* ------------------------------------------------------------- the replay */

const REFUSAL_TEXT: Record<Refusal, string> = {
  "no-store": "no-store, so nothing is kept",
  private: "private, which is an instruction to a shared cache and silence to a browser",
  authorization: "the request carried Authorization and the response did not opt back in",
  "not-a-get": "not a GET",
  status: "the status is not one a cache keeps by default",
  "no-freshness": "the origin said nothing about caching, so the default TTL applies",
};

/**
 * Every request in order, through one shared cache.
 *
 * A hit is decided by the key alone, which is the entire point: the cache
 * has no idea who is asking and was never told to care.
 */
export function replay(exchanges: Exchange[]): Step[] {
  const held = new Map<string, { belongsTo: string; body: string }>();
  const steps: Step[] = [];

  for (const exchange of exchanges) {
    const { request, response } = exchange;
    const key = keyOf(request, response);
    const existing = held.get(key);

    if (existing && !key.includes("never reusable")) {
      steps.push({
        request,
        key,
        outcome: "hit",
        served: existing.belongsTo,
        stored: true,
        because:
          existing.belongsTo === request.who
            ? "a hit on this account's own stored copy"
            : `a hit on the copy stored for ${existing.belongsTo}, because the key matched and the key is all a cache compares`,
      });
      continue;
    }

    const verdict = storable(exchange);
    if (verdict.ok) held.set(key, { belongsTo: response.belongsTo, body: response.body });
    steps.push({
      request,
      key,
      outcome: "miss",
      served: response.belongsTo,
      stored: verdict.ok,
      refusal: verdict.refusal,
      because: verdict.ok
        ? verdict.refusal
          ? `stored under this key: ${REFUSAL_TEXT[verdict.refusal]}`
          : "stored under this key"
        : `not stored: ${REFUSAL_TEXT[verdict.refusal!]}`,
    });
  }

  return steps;
}

/**
 * A response that is not anybody's in particular.
 *
 * Needed because without it the model calls every hit on a public page a
 * leak, which would make the whole surface say that caching is unsafe. A
 * pricing page with no Set-Cookie on it belongs to nobody, is meant to be
 * shared, and a hit on it is the cache doing its job.
 *
 * Found by a gate check: the fix on the Set-Cookie case is to strip the
 * header, and applying that repair left the case still reporting a leak,
 * because stripping the only personal thing about a response had nowhere to
 * be recorded.
 */
export const SHARED = "anyone";

/**
 * The steps where somebody received a body belonging to somebody else.
 *
 * A response belonging to SHARED is excluded: that is a public page, and
 * handing it to the next person is the point of a cache.
 */
export const leaks = (exchanges: Exchange[]): Step[] =>
  replay(exchanges).filter(
    (step) =>
      step.outcome === "hit" && step.served !== SHARED && step.served !== step.request.who,
  );

/**
 * The id of the first request that receives somebody else's data, or null.
 *
 * The first, because that is the one an incident report names. By id rather
 * than by account, since the same account may appear twice in a sequence and
 * often does: a second request from the account that populated the cache is
 * a hit on its own copy, which is the cache working.
 */
export function leakAt(exchanges: Exchange[]): string | null {
  const found = leaks(exchanges);
  return found.length > 0 ? found[0].request.id : null;
}

/**
 * The option that is right, found rather than declared.
 *
 * The same rule as every other surface here: the data carries the exchanges,
 * the model carries the reading, and CI requires exactly one option to match.
 */
export const correctOption = (item: Case) => {
  const at = leakAt(item.exchanges);
  return item.options.find((option) => option.leakAt === at);
};

/** How many of a case's requests were answered from storage. */
export const hits = (exchanges: Exchange[]): number =>
  replay(exchanges).filter((step) => step.outcome === "hit").length;

export const REFUSAL_LABEL = REFUSAL_TEXT;
