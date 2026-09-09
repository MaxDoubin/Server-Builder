/**
 * Six sequences of requests through one shared cache.
 *
 * Nothing here declares whether anything leaks. Each case is three requests
 * and what the origin answered; the model replays them through a cache built
 * to RFC 9111 and works out which request, if any, receives a body belonging
 * to somebody else. The correct option is whichever names that request.
 *
 * Three requests rather than two, deliberately. Two is enough to show a
 * collision and not enough to show the more useful thing, which is a request
 * that does not collide and the reason why. In four of these six the third
 * request is the informative one: a second request from the account that
 * populated the cache is a hit on its own copy and is the cache working, and
 * a request that misses because of an unrelated header shows what the key
 * actually contains.
 *
 * Account identifiers rather than names throughout, because that is what an
 * access log has in it, and because the exercise is about keys.
 */

import { SHARED } from "../model";
import type { Case } from "../types";

/** A signed-in request, as a browser sends one. */
const signedIn = (id: string, who: string, path: string, extra: Record<string, string> = {}) => ({
  id,
  who,
  method: "GET" as const,
  path,
  headers: { Cookie: `session=${who}-7f21a`, "Accept-Encoding": "gzip, br", ...extra },
});

const anonymous = (id: string, who: string, path: string, extra: Record<string, string> = {}) => ({
  id,
  who,
  method: "GET" as const,
  path,
  headers: { "Accept-Encoding": "gzip, br", ...extra },
});

/** The dashboard body, so the difference between two of them is legible. */
const dashboard = (who: string) => ({
  status: 200,
  cacheControl: "",
  belongsTo: who,
  body: `the dashboard, with ${who}'s name and balance on it`,
});

export const CASES: Case[] = [
  {
    slug: "no-headers-at-all",
    name: "The origin said nothing",
    brief:
      "A dashboard behind a CDN. The route was added last week and nobody set cache headers on it, because nobody thought of it as a cacheable route. The CDN applies a five minute default TTL to anything that does not say otherwise. Two accounts load it ten seconds apart, and then the first one reloads.",
    exchanges: [
      { request: signedIn("r1", "acct-8812", "/dashboard"), response: dashboard("acct-8812") },
      { request: signedIn("r2", "acct-4471", "/dashboard"), response: dashboard("acct-4471") },
      { request: signedIn("r3", "acct-8812", "/dashboard"), response: dashboard("acct-8812") },
    ],
    question: "Which request receives somebody else's dashboard?",
    options: [
      { id: "a", claim: "The first. It is the request that populated the cache, so it is the one that went wrong.", leakAt: "r1" },
      { id: "b", claim: "The second. With no Vary, the key is the method and the path, and the cookie is not part of it.", leakAt: "r2" },
      { id: "c", claim: "The third, because by then the entry has been overwritten by the second account.", leakAt: "r3" },
      { id: "d", claim: "None of them. A response with no Cache-Control is not cacheable, so nothing was stored.", leakAt: null },
    ],
    why:
      "A cache keys on the method, the URL, and exactly those request headers the response named in Vary. This response named none, so the key is GET /dashboard and the cookie is not in it. The second request matched and the cache answered with what it had, correctly. The third request matches too, and gets acct-8812's own dashboard back, which is the cache doing its job and is why nobody notices from the inside. Nothing here is misconfigured: the origin never said the response could be cached and never said it could not, and a CDN with a default TTL treats silence as permission. Both halves are omissions, which is why it reaches production, and why the page is perfect for the first person to load it.",
    fix:
      "Cache-Control: private, no-store on anything with a session in it, set once at the framework level rather than per route, so a route added next week is safe without anybody remembering. If the page genuinely should be cached per user then Vary: Cookie makes the key personal, at the cost of an entry per session, which is usually the wrong trade and is worth knowing you are making.",
    breaks: "that two requests carrying different session cookies cannot be answered with the same response",
  },
  {
    slug: "private-is-not-no-store",
    name: "It says private",
    brief:
      "The settings page, and somebody has been through and added Cache-Control: private. A reviewer signed it off on the grounds that private means it will not be shared. Three requests from two accounts.",
    exchanges: [
      {
        request: signedIn("r1", "acct-8812", "/account/settings"),
        response: {
          status: 200,
          cacheControl: "private, max-age=600",
          belongsTo: "acct-8812",
          body: "the settings page, with acct-8812's email and phone number on it",
        },
      },
      {
        request: signedIn("r2", "acct-4471", "/account/settings"),
        response: {
          status: 200,
          cacheControl: "private, max-age=600",
          belongsTo: "acct-4471",
          body: "the settings page, with acct-4471's email and phone number on it",
        },
      },
      {
        request: signedIn("r3", "acct-8812", "/account/settings"),
        response: {
          status: 200,
          cacheControl: "private, max-age=600",
          belongsTo: "acct-8812",
          body: "the settings page, with acct-8812's email and phone number on it",
        },
      },
    ],
    question: "Which request receives somebody else's settings page?",
    options: [
      { id: "a", claim: "The second, because max-age=600 stored it for ten minutes and private is advisory.", leakAt: "r2" },
      { id: "b", claim: "The third, because the entry it hits was populated by the other account.", leakAt: "r3" },
      { id: "c", claim: "None of them. private is a direct instruction that a shared cache must not store this, so there is never anything to hit.", leakAt: null },
      { id: "d", claim: "The first, since it is the request whose response entered storage.", leakAt: "r1" },
    ],
    why:
      "private is the right answer and it is worth being precise about why, because the reasoning people use to justify it is wrong. It does not mean the response is confidential, and it does not mean it will not be sent to the wrong person. It means one thing: a shared cache must not store this. A browser cache may, happily, which is the point of the name and why private with max-age is a sensible pair. Note also what the third request shows: nothing is stored at all here, so every request reaches the origin. That is the cost of correctness on this route, and it is the right cost. The value of this case is that it is indistinguishable from the first one by looking at the page: the fault there was not a missing private on that route, it was a permissive default.",
    fix:
      "Nothing to fix, which is the finding. What is worth doing is checking whether private is applied by the framework or by hand on each route, because the second is a fault waiting for a new route to be added.",
    breaks: "that a case with nothing wrong in it is a case not worth reading",
  },
  {
    slug: "vary-on-the-wrong-header",
    name: "There is a Vary, and it is the wrong one",
    brief:
      "A per-account API response. Somebody was told to add a Vary header and added the one that was already there for compression. It shipped through review because a Vary header was present and the diff looked right. Three callers, the second of them on an older client that only accepts gzip.",
    exchanges: [
      {
        request: signedIn("r1", "acct-8812", "/api/me"),
        response: {
          status: 200,
          cacheControl: "max-age=60",
          vary: "Accept-Encoding",
          belongsTo: "acct-8812",
          body: "acct-8812's profile as JSON, including their email",
        },
      },
      {
        request: signedIn("r2", "acct-4471", "/api/me", { "Accept-Encoding": "gzip" }),
        response: {
          status: 200,
          cacheControl: "max-age=60",
          vary: "Accept-Encoding",
          belongsTo: "acct-4471",
          body: "acct-4471's profile as JSON, including their email",
        },
      },
      {
        request: signedIn("r3", "acct-1290", "/api/me"),
        response: {
          status: 200,
          cacheControl: "max-age=60",
          vary: "Accept-Encoding",
          belongsTo: "acct-1290",
          body: "acct-1290's profile as JSON, including their email",
        },
      },
    ],
    question: "Which request receives somebody else's profile?",
    options: [
      { id: "a", claim: "The third. Vary: Accept-Encoding puts the encoding in the key, and the third caller sends the same encodings as the first, so the keys are identical.", leakAt: "r3" },
      { id: "b", claim: "The second, because it is the first request to arrive after the cache was populated.", leakAt: "r2" },
      { id: "c", claim: "None of them. A Vary header is present, so a request header is part of the key and the callers differ.", leakAt: null },
      { id: "d", claim: "The first, since it is the request whose response was stored.", leakAt: "r1" },
    ],
    why:
      "Vary names which request headers are part of the key, and it is only ever as useful as the header it names. Accept-Encoding is the one nearly every response carries, because compression really does change the bytes, and here it is worth nothing. The second caller escapes, and the reason is worth sitting with: it sends a different Accept-Encoding, so it gets a different key and its own entry. Not because anything protected it, but because it happens to run an older client. The third caller sends what the first sent, and gets the first caller's profile. A reviewer sees a Vary header and stops reading. The question is never whether Vary is set, it is whether the header it names is the one that made the body personal.",
    fix:
      "Vary: Cookie, Accept-Encoding if the response must be cacheable at all, or Cache-Control: private if it must not. And in review, read what Vary names rather than that it exists.",
    breaks: "that a Vary header makes a response safe to cache",
  },
  {
    slug: "authorization-and-s-maxage",
    name: "s-maxage let it in",
    brief:
      "An internal API behind a bearer token rather than a cookie. It ran for a year with max-age=30 and nothing ever went wrong. Then somebody wanted the CDN to hold responses longer than browsers do, and reached for s-maxage, which is the correct directive for exactly that. The first request below is from before the change.",
    exchanges: [
      {
        request: anonymous("r1", "svc-billing", "/api/v2/entitlements", { Authorization: "Bearer billing-2f9c" }),
        response: {
          status: 200,
          cacheControl: "max-age=30",
          belongsTo: "svc-billing",
          body: "the entitlements the billing service is allowed to see",
        },
      },
      {
        request: anonymous("r2", "svc-billing", "/api/v2/entitlements", { Authorization: "Bearer billing-2f9c" }),
        response: {
          status: 200,
          cacheControl: "max-age=30, s-maxage=3600",
          belongsTo: "svc-billing",
          body: "the entitlements the billing service is allowed to see",
        },
      },
      {
        request: anonymous("r3", "svc-support", "/api/v2/entitlements", { Authorization: "Bearer support-91ab" }),
        response: {
          status: 200,
          cacheControl: "max-age=30, s-maxage=3600",
          belongsTo: "svc-support",
          body: "the entitlements the support service may see, which is a narrower set",
        },
      },
    ],
    question: "Which request receives the other service's entitlements?",
    options: [
      { id: "a", claim: "The second, because s-maxage=3600 caused a stale entry to be served.", leakAt: "r2" },
      { id: "b", claim: "The first, because a request with Authorization is stored by default and it populated the entry.", leakAt: "r1" },
      { id: "c", claim: "None of them. A shared cache never stores a response to a request carrying Authorization.", leakAt: null },
      { id: "d", claim: "The third. s-maxage is one of the three directives that opt a shared cache back in, and with no Vary the token is not in the key.", leakAt: "r3" },
    ],
    why:
      "There is a rule that was protecting this and almost nobody knows it: a shared cache must not store a response to a request carrying Authorization. It has exactly three exceptions, and they are public, must-revalidate and s-maxage. Not max-age. So the first request, from before the change, is not stored, and the endpoint was safe for a year by a mechanism nobody had chosen. Adding s-maxage to make the CDN hold responses longer also switched that off, and the response has no Vary, so the token is not in the key. The directive did exactly what it says. The problem is that what it says includes something nobody reading it expects, and the effect shows up only when a second caller with a different token arrives, which may be months later.",
    fix:
      "Cache-Control: private for anything scoped to a caller. If a shared cache really must hold it, Vary: Authorization puts the token in the key, at the cost of an entry per token and a cache key derived from a credential, which is worth thinking about before doing. The stronger shape is a route that does not vary by caller at all, with per-caller filtering done somewhere the cache cannot see.",
    breaks: "that a bearer token in the Authorization header keeps a response out of a shared cache",
  },
  {
    slug: "the-set-cookie-that-was-stored",
    name: "The response carried a Set-Cookie",
    brief:
      "A pricing page. Genuinely public, correctly marked cacheable, byte for byte identical for everybody. It also sets an analytics cookie on first visit, which is an identifier the analytics vendor issues per visitor. Three visitors arrive in a minute.",
    exchanges: [
      {
        request: anonymous("r1", "visitor-1", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          setCookie: "aid=visitor-1-d41d8; Path=/; Max-Age=31536000",
          belongsTo: "visitor-1",
          body: "the pricing page, identical for everybody, and a Set-Cookie naming this visitor",
        },
      },
      {
        request: anonymous("r2", "visitor-2", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          setCookie: "aid=visitor-2-9b1c4; Path=/; Max-Age=31536000",
          belongsTo: "visitor-2",
          body: "the pricing page, identical for everybody, and a Set-Cookie naming this visitor",
        },
      },
      {
        request: anonymous("r3", "visitor-3", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          setCookie: "aid=visitor-3-5e88f; Path=/; Max-Age=31536000",
          belongsTo: "visitor-3",
          body: "the pricing page, identical for everybody, and a Set-Cookie naming this visitor",
        },
      },
    ],
    question: "Which request is the first to receive a response belonging to somebody else?",
    options: [
      { id: "a", claim: "The first, because it is the one whose response went into storage.", leakAt: "r1" },
      { id: "b", claim: "The second. The body is identical and the Set-Cookie is not, and what gets stored and replayed is the whole response, headers included.", leakAt: "r2" },
      { id: "c", claim: "The third, because a shared cache serves the first request from the origin and only starts replaying after that.", leakAt: "r3" },
      { id: "d", claim: "None of them. A response carrying Set-Cookie is never stored by a shared cache.", leakAt: null },
    ],
    why:
      "The trap is that the page really is public and really is identical, so every argument for caching it is sound. What gets stored is the response, and a Set-Cookie is part of a response. So the second visitor is handed the first visitor's identifier, the third gets it too, and every visitor for five minutes shares one identity. Nothing personal was in the body, and the analytics data is now wrong in a way that looks like a traffic pattern rather than a bug. There is no rule that prevents this. HTTP/1.0 said a shared cache must not store a response with Set-Cookie; RFC 9111 does not, precisely because the useful cases exist and the caller is expected to know.",
    fix:
      "Set the cookie somewhere the cache does not replay: client side from the analytics script, or from an uncached endpoint the page calls. If it has to come from a cached response, strip Set-Cookie at the CDN for that route, which most of them do in one line and which is worth applying as a blanket rule to every cached path.",
    breaks: "that a response with a byte-identical body is safe to share",
  },
  {
    slug: "vary-cookie-and-a-cookie-everybody-has",
    name: "Vary: Cookie, and a cookie everybody has",
    brief:
      "A reporting page cached per user with Vary: Cookie, which is the textbook answer and which works. Then a consent banner was added, setting a cookie of its own before anybody signs in. Three requests reach the page from the marketing site, before signing in. The third visitor has also picked a dark theme.",
    exchanges: [
      {
        request: {
          id: "r1",
          who: "acct-8812",
          method: "GET" as const,
          path: "/reports/monthly",
          headers: { Cookie: "consent=all", "Accept-Encoding": "gzip, br" },
        },
        response: {
          status: 200,
          cacheControl: "max-age=120",
          vary: "Cookie",
          belongsTo: "acct-8812",
          body: "the monthly report for acct-8812's organization",
        },
      },
      {
        request: {
          id: "r2",
          who: "acct-4471",
          method: "GET" as const,
          path: "/reports/monthly",
          headers: { Cookie: "consent=all", "Accept-Encoding": "gzip, br" },
        },
        response: {
          status: 200,
          cacheControl: "max-age=120",
          vary: "Cookie",
          belongsTo: "acct-4471",
          body: "the monthly report for acct-4471's organization",
        },
      },
      {
        request: {
          id: "r3",
          who: "acct-1290",
          method: "GET" as const,
          path: "/reports/monthly",
          headers: { Cookie: "consent=all; theme=dark", "Accept-Encoding": "gzip, br" },
        },
        response: {
          status: 200,
          cacheControl: "max-age=120",
          vary: "Cookie",
          belongsTo: "acct-1290",
          body: "the monthly report for acct-1290's organization",
        },
      },
    ],
    question: "Which request receives another organization's report?",
    options: [
      { id: "a", claim: "The first, because its response is the one sitting in storage.", leakAt: "r1" },
      { id: "b", claim: "None of them. Vary: Cookie puts the cookie in the key, which is precisely the mechanism for this.", leakAt: null },
      { id: "c", claim: "The second. Vary: Cookie keys on the whole header as one string, and both requests send the same one: consent=all, with no session in it.", leakAt: "r2" },
      { id: "d", claim: "The third, because by then two entries exist and the cache picks the older one.", leakAt: "r3" },
    ],
    why:
      "Vary: Cookie keys on the value of the Cookie header, all of it, as one opaque string. It does not key on a cookie, and there is no way in HTTP to say vary on the session and ignore everything else. So the mechanism works exactly as specified and protects nothing here, because these requests genuinely send the same Cookie header: the session is absent from all of them, the page being reached before signing in, and the only cookie present is the consent one everybody has the same value for. The third request is the other half of the same lesson: it misses, and gets its own report, because it happens to carry an unrelated theme cookie. Nothing protected it either. The bug arrived with the consent banner, in a change that touched no caching code and no reporting code.",
    fix:
      "Do not use the cookie jar as a cache key. Mark the route private, or move the identity into the URL so the key carries it, or have the CDN normalize the Cookie header down to the one cookie that matters before computing the key. The last keeps the cache useful and has to be written down somewhere, because the next cookie somebody adds will not know about it.",
    breaks: "that Vary: Cookie keys on the session rather than on every cookie at once",
  },
  {
    slug: "the-cache-doing-its-job",
    name: "Three visitors, one copy, nothing wrong",
    brief:
      "The same pricing page, after the analytics cookie was moved into the client-side script. Public, cacheable, byte for byte identical, and with no Set-Cookie on it. Three visitors arrive in a minute. Worth reading carefully, because it is indistinguishable from the Set-Cookie case by looking at the body.",
    exchanges: [
      {
        request: anonymous("r1", "visitor-1", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          belongsTo: SHARED,
          body: "the pricing page, identical for everybody, with no Set-Cookie on it",
        },
      },
      {
        request: anonymous("r2", "visitor-2", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          belongsTo: SHARED,
          body: "the pricing page, identical for everybody, with no Set-Cookie on it",
        },
      },
      {
        request: anonymous("r3", "visitor-3", "/pricing"),
        response: {
          status: 200,
          cacheControl: "public, max-age=300",
          belongsTo: SHARED,
          body: "the pricing page, identical for everybody, with no Set-Cookie on it",
        },
      },
    ],
    question: "Which request receives a response belonging to somebody else?",
    options: [
      { id: "a", claim: "The second, because it is served from an entry another visitor's request created.", leakAt: "r2" },
      { id: "b", claim: "None of them. The response belongs to nobody in particular, so handing the same one to everybody is what the cache is for.", leakAt: null },
      { id: "c", claim: "The third, because two visitors have now been served the same bytes and the third compounds it.", leakAt: "r3" },
      { id: "d", claim: "The first, because public, max-age=300 permitted storage of a response that would be replayed.", leakAt: "r1" },
    ],
    why:
      "Two of the three requests are answered from storage and neither is a leak, which is the point of having this case in the set. A shared response is only a problem when something in it belongs to one person, and here nothing does: not the body, which is identical, and not the headers, since the Set-Cookie is gone. Every argument that condemned the earlier case applies here word for word and reaches the opposite conclusion, because the thing that mattered was one header and not the caching. Being able to tell these two apart is the whole skill, and the difference is not visible in the page, the URL, the Cache-Control or the hit rate. It is visible in the response headers, which is where nobody looks.",
    fix:
      "Nothing. Two of three requests never reached the origin and that is the return on caching a public page. What is worth keeping is the rule that got here: strip Set-Cookie at the CDN on every cached path, so this stays true when somebody adds a header next quarter.",
    breaks: "that being served another visitor's cached response is by itself a fault",
  },
];
