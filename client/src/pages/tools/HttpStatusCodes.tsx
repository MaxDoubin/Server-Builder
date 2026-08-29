/**
 * HTTP status code reference.
 *
 * Only codes that are actually in the IANA HTTP Status Code Registry are
 * listed. Vendor inventions (Cloudflare's 52x, nginx's 499) are deliberately
 * absent from the list and called out in the notes instead, because putting
 * them in the table is how they end up in someone's API.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

interface Status {
  code: number;
  name: string;
  meaning: string;
  when: string;
  tag?: string;
}

const STATUSES: Status[] = [
  // 1xx
  {
    code: 100,
    name: "Continue",
    meaning: "The request headers are fine, go ahead and send the body.",
    when: "Automatically, in response to a client that sent Expect: 100-continue before uploading something large. Your framework handles this.",
  },
  {
    code: 101,
    name: "Switching Protocols",
    meaning: "The server agrees to change protocol on this connection.",
    when: "Completing a WebSocket handshake, or any other Upgrade the server accepts.",
  },
  {
    code: 102,
    name: "Processing",
    meaning: "The request was received and is still being worked on.",
    when: "Rarely. A WebDAV method that will take a long time, to stop the client timing out.",
    tag: "WebDAV",
  },
  {
    code: 103,
    name: "Early Hints",
    meaning: "Here are Link headers you can start fetching while the real response is assembled.",
    when: "You know the stylesheet and font URLs before the page itself is ready, and you want the browser preloading during your own server think time.",
  },

  // 2xx
  {
    code: 200,
    name: "OK",
    meaning: "The request succeeded and the body is the result.",
    when: "The default success. GET returning a resource, POST returning a result that is not a new resource.",
  },
  {
    code: 201,
    name: "Created",
    meaning: "A new resource now exists because of this request.",
    when: "POST or PUT that created something. Send a Location header pointing at it, otherwise the client has to guess the URL.",
  },
  {
    code: 202,
    name: "Accepted",
    meaning: "The request was accepted but has not been carried out yet.",
    when: "You queued a job. Give the client a status URL, because 202 promises nothing about the outcome.",
  },
  {
    code: 203,
    name: "Non-Authoritative Information",
    meaning: "This is a 200 that something in the middle modified on the way through.",
    when: "You are a transforming proxy and you changed the payload or headers. Almost never from an origin server.",
  },
  {
    code: 204,
    name: "No Content",
    meaning: "Success, and there is deliberately no body.",
    when: "DELETE that worked, PUT with nothing useful to return, a form submission where the page should not change. A 204 must not have a body.",
  },
  {
    code: 205,
    name: "Reset Content",
    meaning: "Success, and the client should reset the view that sent this.",
    when: "A form that should clear itself after submitting. Rare outside of forms.",
  },
  {
    code: 206,
    name: "Partial Content",
    meaning: "Here is the byte range you asked for, not the whole thing.",
    when: "Answering a Range request: resumable downloads, video seeking. Include Content-Range.",
  },
  {
    code: 207,
    name: "Multi-Status",
    meaning: "The body is an XML document with a separate status per resource.",
    when: "A WebDAV operation over several resources where some succeeded and some did not.",
    tag: "WebDAV",
  },
  {
    code: 208,
    name: "Already Reported",
    meaning: "This member was already enumerated earlier in the same response.",
    when: "Inside a 207 body, to avoid repeating a binding you already listed.",
    tag: "WebDAV",
  },
  {
    code: 226,
    name: "IM Used",
    meaning: "The response is the result of applying instance manipulations to the resource.",
    when: "Delta encoding, from RFC 3229. Essentially unused in the wild.",
  },

  // 3xx
  {
    code: 300,
    name: "Multiple Choices",
    meaning: "There is more than one representation and the client should pick.",
    when: "Almost never. There is no standard machine-readable format for the list, which is why it never caught on.",
  },
  {
    code: 301,
    name: "Moved Permanently",
    meaning: "This URL is retired, use the new one from now on.",
    when: "A permanent URL change: a rename, a domain move, adding or removing a trailing slash. Clients and search engines are allowed to cache this forever.",
  },
  {
    code: 302,
    name: "Found",
    meaning: "The resource is temporarily somewhere else.",
    when: "Rarely on purpose now. Historically every client rewrote POST to GET on a 302 even though the spec did not permit it, so 303 and 307 exist to say which behaviour you meant.",
  },
  {
    code: 303,
    name: "See Other",
    meaning: "Go and GET this other URL instead.",
    when: "After a successful POST, to send the browser to a result page. This is the Post/Redirect/Get pattern that stops a refresh resubmitting the form.",
  },
  {
    code: 304,
    name: "Not Modified",
    meaning: "Your cached copy is still current.",
    when: "Answering a conditional GET whose If-None-Match or If-Modified-Since still holds. A 304 carries no body, which is the whole point.",
  },
  {
    code: 305,
    name: "Use Proxy",
    meaning: "The resource must be fetched through the proxy named in the response.",
    when: "Never. Deprecated for security reasons: it let a server redirect a client through a host of the server's choosing.",
    tag: "Deprecated",
  },
  {
    code: 306,
    name: "(Unused)",
    meaning: "Reserved. It briefly meant Switch Proxy in a draft and was never standardised.",
    when: "Never. The number is reserved so it cannot be reused.",
    tag: "Reserved",
  },
  {
    code: 307,
    name: "Temporary Redirect",
    meaning: "Temporarily elsewhere, and keep the method and body exactly as they were.",
    when: "A temporary move where a POST must stay a POST. This is the modern, unambiguous 302.",
  },
  {
    code: 308,
    name: "Permanent Redirect",
    meaning: "Permanently elsewhere, and keep the method and body exactly as they were.",
    when: "A permanent move that must not turn a POST into a GET. The modern, unambiguous 301.",
  },

  // 4xx
  {
    code: 400,
    name: "Bad Request",
    meaning: "The request itself is malformed and the server will not try to interpret it.",
    when: "Broken JSON, an impossible header, a missing required parameter. Not for a well formed request you simply disagree with.",
  },
  {
    code: 401,
    name: "Unauthorized",
    meaning: "You are not authenticated. The name is wrong and always has been.",
    when: "There are no credentials, or the credentials are invalid or expired. You must send a WWW-Authenticate header saying how to authenticate.",
  },
  {
    code: 402,
    name: "Payment Required",
    meaning: "Reserved for future use.",
    when: "Nothing standard, though several APIs use it for a failed charge or an exhausted quota. Fine as a convention, not as a promise.",
  },
  {
    code: 403,
    name: "Forbidden",
    meaning: "The server understood you and refuses. Authenticating differently will not change that.",
    when: "A known user without the right permission, an IP block, a disabled account. Some servers use 404 instead to avoid confirming that a resource exists.",
  },
  {
    code: 404,
    name: "Not Found",
    meaning: "There is nothing at this URL, and the server will not say whether there ever was.",
    when: "The default for an unknown path. Also a legitimate way to hide the existence of something from a user who is not allowed to see it.",
  },
  {
    code: 405,
    name: "Method Not Allowed",
    meaning: "The URL exists but not with that verb.",
    when: "A DELETE against a read-only collection. You must include an Allow header listing the methods that do work.",
  },
  {
    code: 406,
    name: "Not Acceptable",
    meaning: "Nothing you can produce satisfies the client's Accept headers.",
    when: "Genuinely rare. Serving your default representation anyway is usually kinder than refusing.",
  },
  {
    code: 407,
    name: "Proxy Authentication Required",
    meaning: "401, but the proxy is the one asking.",
    when: "You are a proxy that needs credentials. Send Proxy-Authenticate.",
  },
  {
    code: 408,
    name: "Request Timeout",
    meaning: "The client did not finish sending the request in time.",
    when: "An idle connection the server wants to close. Some servers send it as a warning shot before closing a keep-alive socket.",
  },
  {
    code: 409,
    name: "Conflict",
    meaning: "The request cannot be applied to the current state of the resource.",
    when: "An edit based on a stale version, a duplicate on a unique field, a delete blocked by a dependency. Explain what conflicts, otherwise the client cannot resolve it.",
  },
  {
    code: 410,
    name: "Gone",
    meaning: "It was here, it was deliberately removed, and it is not coming back.",
    when: "A deleted account, a retired API version, content taken down on purpose. It tells crawlers to drop the URL rather than keep retrying.",
  },
  {
    code: 411,
    name: "Length Required",
    meaning: "You must send Content-Length.",
    when: "You refuse chunked or unbounded bodies on this endpoint.",
  },
  {
    code: 412,
    name: "Precondition Failed",
    meaning: "A condition you attached to the request was not true.",
    when: "If-Match or If-Unmodified-Since did not hold. This is how optimistic concurrency reports a lost update.",
  },
  {
    code: 413,
    name: "Content Too Large",
    meaning: "The request body is bigger than the server will accept.",
    when: "An upload over your limit. RFC 9110 renamed this from Payload Too Large; both names refer to the same code.",
  },
  {
    code: 414,
    name: "URI Too Long",
    meaning: "The request line exceeds what the server will parse.",
    when: "Usually a GET that should have been a POST, or a redirect loop appending query parameters.",
  },
  {
    code: 415,
    name: "Unsupported Media Type",
    meaning: "The body's Content-Type is not one this endpoint accepts.",
    when: "XML sent to a JSON-only endpoint, or a missing Content-Type on a request that needs one.",
  },
  {
    code: 416,
    name: "Range Not Satisfiable",
    meaning: "The requested byte range does not exist in this resource.",
    when: "A resumed download whose file changed size underneath it.",
  },
  {
    code: 417,
    name: "Expectation Failed",
    meaning: "The Expect header asked for something the server cannot meet.",
    when: "Essentially only in response to an Expect value the server does not understand.",
  },
  {
    code: 418,
    name: "I'm a Teapot",
    meaning: "From RFC 2324, the April Fools' coffee pot protocol. IANA reserves the number so it cannot be assigned.",
    when: "Never in a real API. It is in the registry only as a reservation, and returning it from a production service is a joke your on-call will not enjoy.",
    tag: "Reserved",
  },
  {
    code: 421,
    name: "Misdirected Request",
    meaning: "This server cannot produce a response for the authority in the request.",
    when: "HTTP/2 connection coalescing sent a request for a hostname this connection is not authoritative for. The client should retry on a fresh connection.",
  },
  {
    code: 422,
    name: "Unprocessable Content",
    meaning: "The syntax is fine, the content is not.",
    when: "Valid JSON with a field that fails a business rule: an end date before the start date, an email that is well formed but already taken.",
  },
  {
    code: 423,
    name: "Locked",
    meaning: "The resource is locked.",
    when: "WebDAV, against a resource holding a lock another principal owns.",
    tag: "WebDAV",
  },
  {
    code: 424,
    name: "Failed Dependency",
    meaning: "This action failed because an action it depended on failed.",
    when: "Inside a WebDAV multi-operation request where an earlier member failed.",
    tag: "WebDAV",
  },
  {
    code: 425,
    name: "Too Early",
    meaning: "The server will not risk processing a request that may be a replay.",
    when: "The request arrived in TLS 1.3 early data and is not safe to replay. The client retries after the handshake completes.",
  },
  {
    code: 426,
    name: "Upgrade Required",
    meaning: "Talk to me over a different protocol.",
    when: "You require TLS or a newer HTTP version. Send an Upgrade header saying which.",
  },
  {
    code: 428,
    name: "Precondition Required",
    meaning: "The request must be conditional.",
    when: "You want to force clients to send If-Match so two concurrent edits cannot silently overwrite each other.",
  },
  {
    code: 429,
    name: "Too Many Requests",
    meaning: "The client is over its rate limit.",
    when: "Rate limiting or quota exhaustion. Send Retry-After, otherwise a well behaved client has no way to back off correctly.",
  },
  {
    code: 431,
    name: "Request Header Fields Too Large",
    meaning: "The headers, or one of them, exceed what the server will parse.",
    when: "Usually a cookie that has grown without bound, or an oversized Authorization header.",
  },
  {
    code: 451,
    name: "Unavailable For Legal Reasons",
    meaning: "Access is denied because of a legal demand.",
    when: "A court order, a takedown, a geographic block required by law. The number is a reference to Fahrenheit 451.",
  },

  // 5xx
  {
    code: 500,
    name: "Internal Server Error",
    meaning: "Something broke on the server and it has nothing more specific to say.",
    when: "An unhandled exception. It should be the code you never deliberately choose, because a 500 that could have been a 400 sends someone debugging the wrong system.",
  },
  {
    code: 501,
    name: "Not Implemented",
    meaning: "The server does not support the functionality required to fulfil this method at all.",
    when: "An unrecognised HTTP method. Not for an endpoint you have not written yet: that is a 404 or a 405.",
  },
  {
    code: 502,
    name: "Bad Gateway",
    meaning: "A proxy got an invalid response from the server behind it.",
    when: "Emitted by the proxy, not by you. In practice: the app crashed, the socket closed, or the upstream returned garbage.",
  },
  {
    code: 503,
    name: "Service Unavailable",
    meaning: "The server is temporarily unable to handle the request.",
    when: "Maintenance, overload, a dependency that is down. Always send Retry-After. This is the code load balancers and health checks are built around.",
  },
  {
    code: 504,
    name: "Gateway Timeout",
    meaning: "A proxy gave up waiting for the server behind it.",
    when: "Emitted by the proxy when the upstream did not answer in time. Distinct from 502: the upstream is alive but slow.",
  },
  {
    code: 505,
    name: "HTTP Version Not Supported",
    meaning: "The major version in the request line is not supported.",
    when: "Almost never, and usually against a malformed or hostile request line.",
  },
  {
    code: 506,
    name: "Variant Also Negotiates",
    meaning: "Content negotiation is misconfigured and points at itself.",
    when: "Only from a server implementing transparent content negotiation, RFC 2295, which is experimental.",
  },
  {
    code: 507,
    name: "Insufficient Storage",
    meaning: "The server cannot store what is needed to complete the request.",
    when: "A WebDAV write with no space left for it.",
    tag: "WebDAV",
  },
  {
    code: 508,
    name: "Loop Detected",
    meaning: "The operation loops back on itself.",
    when: "A WebDAV depth-infinity traversal that found a cycle.",
    tag: "WebDAV",
  },
  {
    code: 510,
    name: "Not Extended",
    meaning: "The request needs further extensions to be handled.",
    when: "From the experimental extension framework in RFC 2774. The registry now marks it obsoleted, so treat it as historical.",
    tag: "Obsoleted",
  },
  {
    code: 511,
    name: "Network Authentication Required",
    meaning: "You need to authenticate with the network, not with the site.",
    when: "A captive portal telling a client why its request did not reach the internet. Intercepting proxies use it so software can detect a portal instead of misreading the login page as the response.",
  },
];

const CLASSES: { key: string; label: string; blurb: string }[] = [
  {
    key: "1",
    label: "1xx Informational",
    blurb: "The request was received, the process continues. Interim responses, sent before the real one.",
  },
  {
    key: "2",
    label: "2xx Success",
    blurb: "The request was received, understood, and accepted.",
  },
  {
    key: "3",
    label: "3xx Redirection",
    blurb: "Further action is needed. The distinctions here are about caching and about whether the method survives.",
  },
  {
    key: "4",
    label: "4xx Client Error",
    blurb: "The request is at fault. Repeating it unchanged will fail the same way.",
  },
  {
    key: "5",
    label: "5xx Server Error",
    blurb: "The server is at fault. The same request might succeed later.",
  },
];

const CONFUSED: { title: string; body: string }[] = [
  {
    title: "401 vs 403",
    body: "401 means the server does not know who you are: no credentials, bad credentials, or an expired token. It is a request for authentication and it must carry a WWW-Authenticate header. 403 means the server knows exactly who you are and the answer is still no. The rule of thumb: if logging in again could fix it, 401. If it could not, 403. Sending 401 for an authenticated user who lacks a permission is the common mistake, and it sends clients into a pointless re-login loop.",
  },
  {
    title: "301 vs 302 vs 307 vs 308",
    body: "Two questions decide this. Is the move permanent, and must the method survive? 301 is permanent, 302 is temporary, and both were historically rewritten to GET by every browser regardless of what the spec said. 307 and 308 exist to remove that ambiguity: they are the temporary and permanent forms that require the method and body to be preserved. So a POST redirected with 307 arrives as a POST, and the same POST redirected with 302 usually arrives as a GET with the body dropped. If you want that GET behaviour on purpose, say so with 303. And be careful with 301 and 308: browsers cache them aggressively, sometimes indefinitely, so a permanent redirect published by mistake is very hard to take back.",
  },
  {
    title: "200 with an error in the body",
    body: "Returning 200 with {\"success\": false} is the most common HTTP antipattern in internal APIs. It breaks everything that reads the status line rather than the body: retry logic, circuit breakers, load balancer health checks, CDN caching rules, error dashboards, and the alert that should have paged someone. Your monitoring will show a perfectly healthy service that is failing every request. The status code is the part of the response that the whole infrastructure between you and the client can act on, so spend it correctly and put the detail in the body, ideally as an RFC 9457 problem document.",
  },
  {
    title: "404 vs 410",
    body: "404 says there is nothing here, without committing to whether there ever was or ever will be. 410 says this existed, it was removed deliberately, and it is not coming back. The practical difference is what a crawler or a client cache does next: a 404 is worth retrying occasionally, a 410 is a signal to drop the URL permanently. Use 410 when you retire an API version or delete content on purpose, and 404 for everything else, including the cases where you would rather not admit a resource exists.",
  },
  {
    title: "422 vs 400",
    body: "400 is for a request the server cannot parse: broken JSON, a malformed header, a missing required parameter. 422 is for a request that parsed perfectly and is still wrong: the field types are right, the values are not, an end date precedes a start date, an email is well formed but already registered. The distinction matters because it tells the client whether to fix its serialisation or fix the user's input. It is worth noting that 422 came from WebDAV and some teams reject it for a plain JSON API, and 400 with a detailed body is a defensible choice. What is not defensible is using them interchangeably in the same service.",
  },
];

export function HttpStatusCodes() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return STATUSES;
    return STATUSES.filter((s) =>
      `${s.code} ${s.name} ${s.meaning} ${s.when} ${s.tag ?? ""}`.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <ToolShell
      slug="http-status-codes"
    >
      <div className="mb-8">
        <label
          htmlFor="status-search"
          className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
        >
          Search
        </label>
        <input
          id="status-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="404, gateway, rate limit, redirect..."
          data-testid="input-search"
          className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
        />
        <p
          className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
          role="status"
          data-testid="text-result-count"
        >
          {filtered.length} of {STATUSES.length} codes
        </p>
      </div>

      {filtered.length === 0 ? (
        <ToolPanel>
          <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            Nothing matches "{query}". Every code here is a registered one, so a search for a
            vendor code such as 499 or 520 will come back empty on purpose.
          </p>
        </ToolPanel>
      ) : null}

      <div className="space-y-6">
        {CLASSES.map((cls) => {
          const rows = filtered.filter((s) => String(s.code).startsWith(cls.key));
          if (rows.length === 0) return null;
          return (
            <ToolPanel key={cls.key} title={cls.label}>
              <p className="-mt-2 mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {cls.blurb}
              </p>
              <ul className="space-y-0">
                {rows.map((s) => (
                  <li
                    key={s.code}
                    data-testid={`status-${s.code}`}
                    className="grid gap-x-4 gap-y-1 border-t border-[hsl(var(--brand-iron)/0.6)] py-4 sm:grid-cols-[4.5rem_1fr]"
                  >
                    <div className="font-mono-tight text-lg leading-none text-[hsl(var(--brand-signal))]">
                      {s.code}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                        {s.name}
                        {s.tag ? (
                          <span className="ml-2 rounded-full border border-[hsl(var(--brand-iron))] px-2 py-0.5 align-middle font-mono-tight text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            {s.tag}
                          </span>
                        ) : null}
                      </h3>
                      <p className="mt-1 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {s.meaning}
                      </p>
                      <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        <span className="uppercase tracking-[0.2em]">Send it: </span>
                        {s.when}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </ToolPanel>
          );
        })}
      </div>

      <ToolPanel title="Commonly confused" className="mt-6">
        <div className="space-y-6">
          {CONFUSED.map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-base font-medium text-[hsl(var(--brand-bone))]">
                {item.title}
              </h3>
              <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </ToolPanel>
    </ToolShell>
  );
}
