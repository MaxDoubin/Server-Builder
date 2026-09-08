/**
 * The page that showed somebody else's name, and why the session code is fine.
 *
 * This is the one on this site with the worst consequences and the most
 * misleading symptom. A user reloads a dashboard and sees another account's
 * data. Every instinct says session handling: a token mixed up, a thread
 * local reused, a global that should not be. So that is where everybody
 * looks, and it is all correct, because the application never ran. A shared
 * cache answered from storage, and it answered correctly according to the
 * only thing it was told to key on.
 *
 * A cache is a lookup table. What it stores is decided by the response
 * headers and what it looks up by is the request's method and URL plus
 * exactly those request headers the response named in Vary. Nothing else.
 * Not the cookie, unless Vary says Cookie. Not the Authorization header,
 * unless Vary says Authorization. The cache does not know what a user is,
 * and it is not supposed to.
 *
 * So the fault is almost never in the cache. It is a response that said it
 * could be stored, or did not say it could not, and did not name the header
 * that made it personal. Both halves are omissions, which is why this gets
 * to production: nothing is misconfigured, something is missing, and the
 * page works perfectly for the first person to ask for it.
 *
 * The rules here are RFC 9111 as a shared cache applies them, which differ
 * from a browser's in the ways that matter most: private is a real
 * instruction to a CDN and no instruction at all to the browser it is
 * private to, s-maxage exists only for shared caches, and a request carrying
 * Authorization must not be stored by one unless the response explicitly
 * allows it.
 */

/** One request as it left the client. */
export interface Request {
  /**
   * Which request this is, in order.
   *
   * An option names a request by this rather than by account, because the
   * same account can ask twice and "the request from acct-8812" would then
   * be two different answers wearing one name.
   */
  id: string;
  /** Which account, or which anonymous visitor, is asking. */
  who: string;
  method: "GET" | "POST";
  path: string;
  /**
   * Headers as sent. Only the ones a cache might key on are modelled, plus
   * Authorization, which changes whether a shared cache may store at all.
   */
  headers: Record<string, string>;
}

/** One response as it left the origin. */
export interface Response {
  status: number;
  /**
   * Cache-Control verbatim, parsed by the model rather than interpreted
   * here, because the whole subject is what these directives actually mean
   * to a shared cache as opposed to what people think they mean.
   */
  cacheControl: string;
  /** Vary verbatim, or absent, which is the usual bug. */
  vary?: string;
  /** A Set-Cookie the response carries, which is its own kind of leak. */
  setCookie?: string;
  /** Whose data the body contains, so a leak is nameable. */
  belongsTo: string;
  /** What the body is, for the prose. */
  body: string;
}

/** A request and what the origin said, in the order they happened. */
export interface Exchange {
  request: Request;
  response: Response;
}

/** Why a shared cache may not store a response. */
export type Refusal =
  | "no-store"
  | "private"
  | "authorization"
  | "not-a-get"
  | "no-freshness"
  | "status";

/** What happened to one request as it passed through the cache. */
export interface Step {
  request: Request;
  /** The key the cache computed, which is the crux of every case. */
  key: string;
  outcome: "miss" | "hit";
  /**
   * On a hit, whose data came back. On a miss, whose data went in.
   *
   * When this is not the requester, the cache has served one account's page
   * to another, and it has done so correctly.
   */
  served: string;
  /** On a miss, whether the response was stored, and why not when it was not. */
  stored: boolean;
  refusal?: Refusal;
  /** What the cache did, as a sentence, for the page. */
  because: string;
}

export interface Option {
  id: string;
  claim: string;
  /**
   * The id of the request this option says receives somebody else's data, or
   * null for "nothing leaks". Exactly one has to match what the model
   * computes, and no two options may name the same one, because on this
   * surface the answer is a request and two options naming one request are
   * the same answer written twice.
   */
  leakAt: string | null;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  exchanges: Exchange[];
  question: string;
  options: Option[];
  why: string;
  /** The one header or directive that would have prevented it. */
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
