import assert from "node:assert/strict";
import {
  auditHeaders,
  categorize,
  describeSeconds,
  effectiveReferrerPolicy,
  maskCookie,
  MAX_INPUT_CHARS,
  parseHsts,
  parseRawHeaders,
  parseSetCookie,
  parseSfDictionary,
  permissionRules,
  type HeaderAudit,
} from "../../client/src/lib/toolkit/security-headers-analyzer.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const audit = (text: string): HeaderAudit => {
  const r = auditHeaders(text);
  assert.ok(r.ok, `audit failed: ${!r.ok ? r.error : ""}`);
  return r.audit;
};
const sev = (a: HeaderAudit, id: string) => a.findings.find((f) => f.id === id)?.severity;
const has = (a: HeaderAudit, id: string) => a.findings.some((f) => f.id === id);

const STRONG = `HTTP/2 200
reporting-endpoints: csp="https://example.com/csp"
strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: script-src 'nonce-Q2hhbmdlTWVPblJlcXVlc3Q' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(self "https://maps.example")
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
set-cookie: __Host-sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax
`;

/* ------------------------------------------------------------- RFC 6797 */

test("HSTS grammar from RFC 6797 section 6", () => {
  // Section 6.2 examples.
  const a = parseHsts("max-age=31536000");
  assert.equal(a.ok, true);
  assert.equal(a.maxAge, 31536000n);
  assert.equal(a.includeSubDomains, false);
  const b = parseHsts("max-age=15768000 ; includeSubDomains");
  assert.equal(b.ok, true);
  assert.equal(b.includeSubDomains, true);
  // Directive names are case-insensitive and the value may be quoted.
  const c = parseHsts('MAX-AGE="31536000"; INCLUDESUBDOMAINS; Preload');
  assert.equal(c.ok, true);
  assert.equal(c.maxAge, 31536000n);
  assert.equal(c.preload, true);
  // Off-grammar headers are ignored whole.
  assert.equal(parseHsts("max-age=1; max-age=2").ok, false);
  assert.equal(parseHsts("includeSubDomains").ok, false);
  assert.equal(parseHsts("max-age=abc").ok, false);
  assert.equal(parseHsts("max-age=-1").ok, false);
  assert.equal(parseHsts("max-age=31536000 includeSubDomains").ok, false);
  assert.equal(parseHsts('max-age="31536000').ok, false);
  assert.equal(parseHsts("max-age=31536000,includeSubDomains").ok, false);
  // Unknown directives are ignored, not fatal.
  const d = parseHsts("max-age=600; foo=bar");
  assert.equal(d.ok, true);
  assert.deepEqual(d.unknown, ["foo"]);
  // Huge values stay exact.
  assert.equal(parseHsts("max-age=99999999999999999999").maxAge, 99999999999999999999n);
  assert.equal(parseHsts(";;max-age=5;;").ok, true);
});

test("describeSeconds", () => {
  assert.equal(describeSeconds(31536000n), "1 year");
  assert.equal(describeSeconds(63072000n), "2 years");
  assert.equal(describeSeconds(15768000n), "182.5 days");
  assert.equal(describeSeconds(86400n), "1 day");
  assert.equal(describeSeconds(300n), "5 minutes");
  assert.equal(describeSeconds(1n), "1 second");
  assert.equal(describeSeconds(0n), "0 seconds");
  assert.match(describeSeconds(10n ** 30n), /years/);
});

test("HSTS findings by threshold", () => {
  assert.equal(sev(audit("Strict-Transport-Security: max-age=0"), "hsts-zero"), "medium");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=300; includeSubDomains"), "hsts-short"), "medium");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=15768000; includeSubDomains"), "hsts-under-year"), "low");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=31536000; includeSubDomains"), "hsts-ok"), "pass");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=31536000"), "hsts-subdomains"), "low");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=31536000; preload"), "hsts-preload-unmet"), "medium");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"), "hsts-preload"), "info");
  assert.equal(sev(audit("Strict-Transport-Security: max-age=1; max-age=2"), "hsts-invalid"), "high");
  assert.equal(sev(audit("Server: x"), "hsts-missing"), "medium");
  const two = audit("Strict-Transport-Security: max-age=31536000; includeSubDomains\nStrict-Transport-Security: max-age=0");
  assert.equal(sev(two, "hsts-multiple"), "low");
  assert.equal(sev(two, "hsts-ok"), "pass", "RFC 6797 section 8.1: only the first header is processed");
});

/* ------------------------------------------------------------- RFC 8941 */

test("structured field dictionaries parse per RFC 8941", () => {
  const a = parseSfDictionary('en="Applepie", da=:w4ZibGV0w6ZydGU=:');
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.entries.get("en")!.item!.value, "Applepie");
    assert.equal(a.entries.get("da")!.item!.type, "bytes");
  }
  const b = parseSfDictionary("a=?0, b, c; foo=bar");
  assert.ok(b.ok);
  if (b.ok) {
    assert.equal(b.entries.get("b")!.item!.type, "boolean");
    assert.equal(b.entries.get("c")!.params.foo.value, "bar");
  }
  const c = parseSfDictionary("rating=1.5, feelings=(joy sadness)");
  assert.ok(c.ok);
  if (c.ok) assert.deepEqual(c.entries.get("feelings")!.inner!.map((x) => x.value), ["joy", "sadness"]);
  assert.equal(parseSfDictionary("a=1,").ok, false);
  assert.equal(parseSfDictionary("A=1").ok, false);
  assert.equal(parseSfDictionary("a=(1 2").ok, false);
  assert.equal(parseSfDictionary("geolocation 'none'; camera 'self'").ok, false);
  assert.equal(parseSfDictionary('a="\\x"').ok, false);
  // Later duplicates overwrite earlier ones.
  const d = parseSfDictionary("a=1, a=2");
  assert.ok(d.ok);
  if (d.ok) assert.equal(d.entries.get("a")!.item!.value, "2");
});

test("Permissions-Policy allowlists", () => {
  const parsed = parseSfDictionary('geolocation=(self "https://example.com"), camera=(), fullscreen=*, foo=(self), usb=none');
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const { rules, problems } = permissionRules(parsed.entries);
  const by = Object.fromEntries(rules.map((r) => [r.feature, r]));
  assert.deepEqual(by.geolocation.allow, ["self", '"https://example.com"']);
  assert.equal(by.camera.allow, "none");
  assert.equal(by.fullscreen.allow, "all");
  assert.equal(by.foo.known, false);
  assert.equal(by.usb.allow, "none");
  assert.equal(problems.length, 1);
  const a = audit("Permissions-Policy: geolocation 'none'");
  assert.equal(sev(a, "permissions-invalid"), "medium");
  assert.match(a.findings.find((f) => f.id === "permissions-invalid")!.detail, /Feature-Policy syntax/);
  assert.equal(sev(audit("Permissions-Policy: interest-cohort=()"), "permissions-floc"), "info");
  assert.equal(sev(audit("Permissions-Policy: camera=*"), "permissions-wide"), "info");
  assert.equal(sev(audit("Permissions-Policy: camera=(), microphone=()"), "permissions-ok"), "pass");
});

/* ------------------------------------------------------------- Referrer */

test("the last recognized Referrer-Policy token wins", () => {
  assert.equal(effectiveReferrerPolicy("no-referrer, strict-origin-when-cross-origin").policy, "strict-origin-when-cross-origin");
  assert.equal(effectiveReferrerPolicy("unsafe-url, made-up").policy, "unsafe-url");
  assert.deepEqual(effectiveReferrerPolicy("unsafe-url, made-up").ignored, ["made-up"]);
  assert.equal(effectiveReferrerPolicy("nope").policy, null);
  assert.equal(sev(audit("Referrer-Policy: unsafe-url"), "referrer-unsafe-url"), "medium");
  assert.equal(sev(audit("Referrer-Policy: no-referrer-when-downgrade"), "referrer-no-referrer-when-downgrade"), "low");
  assert.equal(sev(audit("Referrer-Policy: same-origin"), "referrer-same-origin"), "pass");
  assert.equal(sev(audit("Server: x"), "referrer-missing"), "info");
});

/* ------------------------------------------------- framing (HTML Standard) */

test("X-Frame-Options and frame-ancestors precedence", () => {
  assert.equal(sev(audit("X-Frame-Options: DENY"), "xfo-ok"), "pass");
  assert.equal(sev(audit("X-Frame-Options: sameorigin"), "xfo-ok"), "pass");
  assert.equal(sev(audit("X-Frame-Options: ALLOW-FROM https://a.example"), "xfo-allow-from"), "medium");
  assert.equal(sev(audit("X-Frame-Options: DENY, SAMEORIGIN"), "xfo-conflict"), "low");
  assert.equal(sev(audit("X-Frame-Options: DENY\nX-Frame-Options: SAMEORIGIN"), "xfo-conflict"), "low");
  assert.equal(sev(audit("X-Frame-Options: DENY, DENY"), "xfo-ok"), "pass");
  assert.equal(sev(audit("X-Frame-Options: yes"), "xfo-invalid"), "medium");
  assert.equal(sev(audit("Server: x"), "framing-missing"), "medium");
  const both = audit("Content-Security-Policy: frame-ancestors 'self'\nX-Frame-Options: DENY");
  assert.equal(sev(both, "framing-csp"), "pass");
  assert.ok(!has(both, "xfo-ok"));
  const broad = audit("Content-Security-Policy: frame-ancestors *\nX-Frame-Options: DENY");
  assert.equal(sev(broad, "framing-broad"), "medium");
  // A report-only frame-ancestors does not override X-Frame-Options.
  const ro = audit("Content-Security-Policy-Report-Only: frame-ancestors 'none'\nX-Frame-Options: DENY");
  assert.equal(sev(ro, "xfo-ok"), "pass");
});

/* ------------------------------------------------------ nosniff (Fetch) */

test("only the first X-Content-Type-Options value counts", () => {
  assert.equal(sev(audit("X-Content-Type-Options: nosniff"), "nosniff-ok"), "pass");
  assert.equal(sev(audit("X-Content-Type-Options: NoSniff, other"), "nosniff-ok"), "pass");
  assert.equal(sev(audit("X-Content-Type-Options: other, nosniff"), "nosniff-invalid"), "low");
  assert.equal(sev(audit("Server: x"), "nosniff-missing"), "low");
});

/* -------------------------------------------------------- cross-origin */

test("COOP, COEP and CORP values", () => {
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-origin"), "coop-ok"), "pass");
  assert.equal(sev(audit('Cross-Origin-Opener-Policy: same-origin-allow-popups; report-to="coop"'), "coop-ok"), "pass");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: unsafe-none"), "coop-unsafe-none"), "low");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-site"), "coop-invalid"), "low");
  assert.equal(sev(audit("Server: x"), "coop-missing"), "low");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-origin\nCross-Origin-Embedder-Policy: require-corp"), "isolated"), "pass");
  assert.equal(sev(audit("Cross-Origin-Embedder-Policy: require-cors"), "coep-invalid"), "low");
  assert.equal(sev(audit("Cross-Origin-Resource-Policy: same-site"), "corp-ok"), "pass");
  assert.equal(sev(audit("Cross-Origin-Resource-Policy: cross-origin"), "corp-cross"), "info");
  assert.equal(sev(audit("Cross-Origin-Resource-Policy: everyone"), "corp-invalid"), "low");
});

/* ------------------------------------------------------- RFC 6265bis */

test("cookie prefixes and SameSite rules", () => {
  const ok = parseSetCookie("__Host-id=1; Secure; Path=/; HttpOnly; SameSite=Strict");
  assert.equal(ok.prefix, "__Host-");
  assert.deepEqual(ok.rejected, []);
  assert.equal(parseSetCookie("__Host-id=1; Secure; Path=/; Domain=example.com").rejected.length, 1);
  assert.equal(parseSetCookie("__Host-id=1; Secure").rejected.length, 1);
  assert.equal(parseSetCookie("__Host-id=1; Path=/").rejected.length, 1);
  assert.equal(parseSetCookie("__secure-id=1").rejected.length, 1);
  assert.equal(parseSetCookie("id=1; SameSite=None").rejected.length, 1);
  assert.deepEqual(parseSetCookie("id=1; SameSite=None; Secure").rejected, []);
  assert.equal(parseSetCookie("id=1; Partitioned").rejected.length, 1);
  const p = parseSetCookie("id=1; Max-Age=3600; domain=.example.com; path=/app");
  assert.equal(p.persistent, true);
  assert.equal(p.domain, ".example.com");
  assert.equal(p.path, "/app");
  assert.equal(parseSetCookie("novalue").name, "");
  assert.equal(parseSetCookie("a=b=c; secure").secure, true);
});

test("cookie findings aggregate by problem", () => {
  const a = audit("Set-Cookie: sessionid=abc; Path=/\nSet-Cookie: theme=dark; Secure; SameSite=Lax\nSet-Cookie: x=1; SameSite=None");
  assert.equal(sev(a, "cookie-rejected"), "medium");
  assert.equal(sev(a, "cookie-secure"), "medium");
  assert.equal(sev(a, "cookie-httponly"), "medium", "sessionid looks like a session cookie");
  assert.equal(sev(a, "cookie-samesite"), "low");
  assert.equal(a.cookies.length, 3);
  assert.equal(sev(audit("Set-Cookie: theme=dark; Secure"), "cookie-httponly"), "low");
  assert.equal(sev(audit("Set-Cookie: a=1; Secure; HttpOnly; SameSite=Lax"), "cookie-ok"), "pass");
  assert.equal(maskCookie("sid=abcdef; Secure"), "sid=[6 chars hidden]; Secure");
  assert.equal(maskCookie("sid=; Secure"), "sid=; Secure");
});

/* ------------------------------------------------ legacy and leaks */

test("deprecated headers and information leaks", () => {
  const a = audit(`Server: nginx/1.18.0 (Ubuntu)
X-Powered-By: PHP/8.1.2
X-AspNet-Version: 4.0.30319
X-XSS-Protection: 1; mode=block
Expect-CT: max-age=86400, enforce
Public-Key-Pins: pin-sha256="abc"; max-age=10
X-Backend-Server: 10.0.4.17
X-Debug-Token: 1a2b3c
Feature-Policy: camera 'none'`);
  assert.equal(sev(a, "server-version"), "low");
  assert.equal(sev(a, "powered-by"), "low");
  assert.equal(sev(a, "leak-x-aspnet-version"), "low");
  assert.equal(sev(a, "xxss-on"), "low");
  assert.equal(sev(a, "expect-ct"), "info");
  assert.equal(sev(a, "hpkp"), "low");
  assert.equal(sev(a, "private-ip"), "low");
  assert.equal(sev(a, "debug-token"), "medium");
  assert.equal(sev(a, "feature-policy"), "info");
  const lines = a.suggestion.lines.map((l) => l.text);
  assert.ok(lines.includes("Server: nginx"));
  assert.ok(lines.includes("X-XSS-Protection: 0"));
  assert.deepEqual(
    a.suggestion.remove.map((r) => r.name),
    ["X-Powered-By", "X-AspNet-Version", "X-Debug-Token", "Expect-CT", "Public-Key-Pins"],
  );
  assert.equal(sev(audit("X-XSS-Protection: 0"), "xxss-zero"), "pass");
  assert.equal(sev(audit("Server: cloudflare"), "server-name"), "info");
  assert.equal(categorize("x-powered-by"), "leak");
  assert.equal(categorize("set-cookie"), "cookie");
  assert.equal(categorize("expect-ct"), "deprecated");
  assert.equal(categorize("strict-transport-security"), "security");
  assert.equal(categorize("date"), "other");
});

test("CORS checks", () => {
  assert.equal(sev(audit("Access-Control-Allow-Origin: null\nAccess-Control-Allow-Credentials: true"), "cors-null"), "medium");
  assert.equal(sev(audit("Access-Control-Allow-Origin: *"), "cors-star"), "info");
  assert.equal(sev(audit("Access-Control-Allow-Origin: https://app.example\nAccess-Control-Allow-Credentials: true"), "cors-credentials"), "info");
});

/* ---------------------------------------------------------- CSP glue */

test("CSP presence and strength come from the CSP analyzer", () => {
  assert.equal(sev(audit("Server: x"), "csp-missing"), "medium");
  assert.equal(sev(audit("Content-Security-Policy: default-src 'self' 'unsafe-inline'"), "csp-weak"), "medium");
  assert.equal(sev(audit("Content-Security-Policy: default-src 'self'"), "csp-allowlist"), "low");
  assert.equal(sev(audit("Content-Security-Policy-Report-Only: default-src 'self'"), "csp-report-only"), "low");
  const strong = audit(STRONG);
  assert.equal(sev(strong, "csp-strong"), "pass");
});

test("report-to names are checked against Reporting-Endpoints", () => {
  assert.equal(sev(audit("Content-Security-Policy: default-src 'self'; report-to csp"), "csp-no-endpoints"), "low");
  assert.equal(
    sev(audit('Content-Security-Policy: default-src \'self\'; report-to csp\nReporting-Endpoints: other="https://r.example/"'), "csp-endpoint-missing"),
    "low",
  );
  const ok = audit('Content-Security-Policy: default-src \'self\'; report-to csp\nReporting-Endpoints: csp="https://r.example/", x="https://x.example/"');
  assert.ok(!ok.findings.some((f) => f.id.startsWith("csp-no-endpoints") || f.id === "csp-endpoint-missing"));
  assert.equal(sev(audit("Content-Security-Policy: default-src 'self'; report-to csp\nReporting-Endpoints: csp=https://r"), "reporting-endpoint-unquoted"), "low");
  assert.equal(sev(audit('Content-Security-Policy: default-src \'self\'; report-to csp\nReporting-Endpoints: csp="https://r'), "reporting-endpoints-invalid"), "low");
  // A legacy Report-To header may define the group; that is not second-guessed.
  assert.ok(!has(audit('Content-Security-Policy: default-src \'self\'; report-to csp\nReport-To: {"group":"csp"}'), "csp-no-endpoints"));
});

/* ---------------------------------------------------------- whole audit */

test("a well-configured response has no high or medium findings and keeps its headers", () => {
  const a = audit(STRONG);
  const bad = a.findings.filter((f) => f.severity === "high" || f.severity === "medium");
  assert.deepEqual(bad, []);
  assert.ok(a.suggestion.lines.every((l) => l.status === "keep"), JSON.stringify(a.suggestion.lines, null, 1));
  assert.equal(a.suggestion.remove.length, 0);
  assert.ok(!a.suggestion.lines.some((l) => l.text.startsWith("X-Frame-Options")), "frame-ancestors covers framing");
});

test("an empty response gets a complete suggested block", () => {
  const a = audit("HTTP/1.1 200 OK\nDate: Thu, 29 Oct 2026 12:00:00 GMT\nContent-Type: text/html");
  const names = a.suggestion.lines.map((l) => l.text.split(":")[0]);
  assert.deepEqual(names, [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
  ]);
  assert.ok(a.suggestion.lines.every((l) => l.status === "add"));
  // The suggested values must themselves pass this audit.
  const again = audit(a.suggestion.lines.map((l) => l.text).join("\n"));
  const bad = again.findings.filter((f) => f.severity === "high" || f.severity === "medium");
  assert.deepEqual(bad.map((f) => f.id), []);
});

/* ------------------------------------------------------------ parsing */

test("curl -IL chains analyze the last response", () => {
  const r = parseRawHeaders(`HTTP/1.1 301 Moved Permanently
Location: https://example.com/
Server: nginx

HTTP/2 200
server: nginx
x-frame-options: DENY
`);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.response.status, "HTTP/2 200");
  assert.equal(r.response.statusCode, 200);
  assert.equal(r.response.earlierResponses, 1);
  assert.equal(r.response.headers.length, 2);
  assert.ok(has(audit("HTTP/1.1 301 Moved\nLocation: /\n\nHTTP/1.1 200 OK\nServer: x"), "earlier-responses"));
});

test("curl -v output keeps only response lines", () => {
  const r = parseRawHeaders(`* Connected to example.com
> GET / HTTP/2
> Host: example.com
> user-agent: curl/8.5.0
>
< HTTP/2 200
< content-type: text/html
< x-content-type-options: nosniff
<
* Connection left intact`);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.response.headers.map((h) => h.lower), ["content-type", "x-content-type-options"]);
  assert.equal(r.response.skipped, 0);
});

test("folded lines, pseudo-headers and junk lines", () => {
  const r = parseRawHeaders(":status: 200\nContent-Security-Policy: default-src 'self';\n  script-src 'none'\nthis is not a header\nX-A: 1");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.response.headers[0].value, "default-src 'self'; script-src 'none'");
  assert.equal(r.response.skipped, 1);
  assert.equal(r.response.headers.length, 2);
});

test("limits and junk never throw", () => {
  const empty = auditHeaders("");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, null);
  const junk = auditHeaders("just some words\nand more");
  assert.equal(junk.ok, false);
  if (!junk.ok) assert.match(junk.error!, /No header lines/);
  const huge = auditHeaders("a".repeat(MAX_INPUT_CHARS + 1));
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.match(huge.error!, /at most/);
  const many = auditHeaders(Array.from({ length: 3000 }, (_, i) => `X-H${i}: v`).join("\n"));
  assert.ok(many.ok);
  if (many.ok) assert.equal(many.audit.response.headers.length, 500);
  auditHeaders("Permissions-Policy: " + "(".repeat(5000));
  auditHeaders("Permissions-Policy: " + "a=1, ".repeat(5000) + "b=2");
  auditHeaders("Strict-Transport-Security: " + '"'.repeat(5000));
  auditHeaders("Set-Cookie: " + ";".repeat(5000));
  auditHeaders("Content-Security-Policy: " + "script-src * ".repeat(3000));
  auditHeaders("X-Frame-Options:\nReferrer-Policy:\nCross-Origin-Opener-Policy:\nPermissions-Policy:\nStrict-Transport-Security:");
});


/* ------------------------------------------- independent verifier cases */

test("verifier: RFC 6797 section 6.2 examples and boundaries", () => {
  // "max-age=0; includeSubDomains" has the same effect as max-age=0.
  const z = audit("Strict-Transport-Security: max-age=0; includeSubDomains");
  assert.equal(sev(z, "hsts-zero"), "medium");
  assert.ok(!has(z, "hsts-subdomains"));
  // LWS is allowed around "=" and ";" (RFC 2616 implied *LWS).
  assert.equal(parseHsts("max-age = 31536000 ;includeSubDomains").ok, true);
  assert.equal(parseHsts("max-age=1.5").ok, false);
  assert.equal(parseHsts("max-age=1e6").ok, false);
  assert.equal(parseHsts("").ok, false);
  assert.equal(parseHsts("max-age=\"\"").ok, false);
  // Boundaries: 15767999 is under six months, 15768000 is not; 31535999 under a year.
  assert.ok(has(audit("Strict-Transport-Security: max-age=15767999; includeSubDomains"), "hsts-short"));
  assert.ok(has(audit("Strict-Transport-Security: max-age=15768000; includeSubDomains"), "hsts-under-year"));
  assert.ok(has(audit("Strict-Transport-Security: max-age=31535999; includeSubDomains"), "hsts-under-year"));
  assert.ok(has(audit("Strict-Transport-Security: max-age=31536000; includeSubDomains"), "hsts-ok"));
  // A 400-digit max-age is exact and described without "Infinity" or a stray unit.
  const huge = describeSeconds(10n ** 400n);
  assert.ok(!/Infinity|NaN|very long time years/.test(huge), huge);
  assert.equal(sev(audit("Strict-Transport-Security:"), "hsts-invalid"), "high");
});

test("verifier: RFC 8941 dictionary edge cases", () => {
  // Section 3.2 example: inner list with parameters.
  const a = parseSfDictionary('a=(1 2), b=3, c=4;aa=bb, d=(5 6);valid');
  assert.ok(a.ok);
  if (a.ok) {
    assert.deepEqual(a.entries.get("a")!.inner!.map((x) => x.value), ["1", "2"]);
    assert.equal(a.entries.get("c")!.params.aa.value, "bb");
    assert.equal(a.entries.get("d")!.params.valid.type, "boolean");
  }
  assert.equal(parseSfDictionary("").ok, true);
  assert.equal(parseSfDictionary("a=1234567890123456").ok, false, "integers are at most 15 digits");
  assert.equal(parseSfDictionary("a=1234567890123.5").ok, false, "decimals have at most 12 integer digits");
  assert.equal(parseSfDictionary("a=1.").ok, false);
  assert.equal(parseSfDictionary("a=1.2345").ok, false);
  assert.equal(parseSfDictionary('a="é"').ok, false, "strings are printable ASCII");
  assert.equal(parseSfDictionary("a=:abc").ok, false);
  assert.equal(parseSfDictionary("a=?2").ok, false);
  assert.equal(parseSfDictionary("a=(1  2)").ok, true, "SP runs are allowed inside an inner list");
  assert.equal(parseSfDictionary("a=1 ,b=2").ok, true, "OWS around the comma");
  assert.equal(parseSfDictionary("a=1;b").ok, true);
});

test("verifier: X-Frame-Options follows the HTML Standard set rules, empty members included", () => {
  assert.equal(sev(audit("X-Frame-Options: SAMEORIGIN,"), "xfo-conflict"), "low");
  assert.equal(sev(audit("X-Frame-Options: foo, bar"), "xfo-conflict"), "medium");
  assert.equal(sev(audit("X-Frame-Options: ALLOWALL"), "xfo-allowall"), "medium");
  assert.equal(sev(audit("X-Frame-Options:"), "xfo-invalid"), "medium");
  // A report-only frame-ancestors does not override X-Frame-Options.
  const ro = audit("Content-Security-Policy-Report-Only: frame-ancestors 'none'\nX-Frame-Options: DENY");
  assert.ok(has(ro, "xfo-ok"));
  assert.ok(!has(ro, "framing-csp"));
  // Two enforced policies: a strict frame-ancestors wins over a permissive one.
  const two = audit("Content-Security-Policy: frame-ancestors *\nContent-Security-Policy: frame-ancestors 'self'");
  assert.ok(has(two, "framing-csp"));
  assert.ok(!has(two, "framing-broad"));
  assert.equal(sev(audit("Content-Security-Policy: frame-ancestors https:"), "framing-broad"), "medium");
});

test("verifier: COOP, COEP and CORP are case-sensitive structured tokens", () => {
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-origin;report-to=\"coop\""), "coop-ok"), "pass");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-origin ;report-to=\"coop\""), "coop-invalid"), "low");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: Same-Origin"), "coop-invalid"), "low");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: noopener-allow-popups"), "coop-ok"), "pass");
  assert.equal(sev(audit("Cross-Origin-Opener-Policy: same-origin\nCross-Origin-Opener-Policy: same-origin"), "coop-invalid"), "low");
  assert.equal(sev(audit("Cross-Origin-Resource-Policy: Same-Origin"), "corp-invalid"), "low");
  assert.equal(sev(audit("Cross-Origin-Resource-Policy: same-site"), "corp-ok"), "pass");
  const iso = audit("Cross-Origin-Opener-Policy: same-origin\nCross-Origin-Embedder-Policy: credentialless");
  assert.equal(sev(iso, "isolated"), "pass");
  assert.match(iso.findings.find((f) => f.id === "isolated")!.detail, /without credentials/);
});

test("verifier: RFC 6265bis cookie prefixes and SameSite=None", () => {
  assert.deepEqual(parseSetCookie("__Host-a=1; Secure; Path=/").rejected, []);
  assert.deepEqual(parseSetCookie("__host-a=1; secure; path=/").rejected, [], "prefix match is case-insensitive");
  assert.equal(parseSetCookie("__Host-a=1; Secure; Path=/; Domain=example.com").rejected.length, 1);
  assert.deepEqual(parseSetCookie("__Host-a=1; Secure; Path=/; Domain=").rejected, [], "an empty Domain is ignored");
  assert.equal(parseSetCookie("__Host-a=1; Secure").rejected.length, 1);
  assert.equal(parseSetCookie("__Host-a=1; Secure; Path=/app").rejected.length, 1);
  assert.equal(parseSetCookie("__Secure-a=1").rejected.length, 1);
  assert.equal(parseSetCookie("a=1; SameSite=None").rejected.length, 1);
  assert.deepEqual(parseSetCookie("a=1; SameSite=None; Secure").rejected, []);
  assert.equal(parseSetCookie("a=1; Partitioned").rejected.length, 1);
  assert.equal(parseSetCookie("nameless").name, "");
  const many = audit(Array.from({ length: 9 }, (_, i) => `Set-Cookie: __Secure-c${i}=1`).join("\n"));
  assert.match(many.findings.find((f) => f.id === "cookie-rejected")!.detail, /And 3 more/);
});

test("verifier: an empty or oversize CSP header is not called report-only", () => {
  const empty = audit("Content-Security-Policy:\nServer: x");
  assert.equal(sev(empty, "csp-empty"), "medium");
  assert.ok(!has(empty, "csp-report-only"));
  const big = audit("Content-Security-Policy: default-src " + "a.example ".repeat(11_000));
  assert.equal(sev(big, "csp-too-long"), "info");
  assert.ok(!has(big, "csp-report-only"));
  assert.ok(has(big, "framing-unknown"));
  assert.ok(!has(big, "framing-missing"));
  assert.ok(has(empty, "framing-missing"));
  assert.ok(has(audit("Content-Security-Policy-Report-Only: default-src 'self'"), "csp-report-only"));
});

test("verifier: suggestion handles version-only Server values and permissive frame-ancestors", () => {
  const a = audit("Server: 1.2.3");
  assert.ok(has(a, "server-version"));
  assert.ok(!a.suggestion.lines.some((l) => l.text.startsWith("Server:")));
  assert.ok(a.suggestion.remove.some((r) => r.name === "Server"));
  const b = audit("Server: Apache/2.4.41 (Ubuntu)");
  assert.ok(b.suggestion.lines.some((l) => l.text === "Server: Apache"));
  const c = audit(`Content-Security-Policy: script-src 'nonce-${"Q".repeat(22)}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors *`);
  const line = c.suggestion.lines.find((l) => l.text.startsWith("Content-Security-Policy:"))!;
  assert.equal(line.status, "change");
  assert.match(line.why, /frame-ancestors/);
});

test("verifier: nosniff uses only the first value (Fetch determine nosniff)", () => {
  assert.equal(sev(audit("X-Content-Type-Options: NoSniff"), "nosniff-ok"), "pass");
  assert.equal(sev(audit("X-Content-Type-Options: foo, nosniff"), "nosniff-invalid"), "low");
  assert.equal(sev(audit("X-Content-Type-Options: nosniff, foo"), "nosniff-ok"), "pass");
  assert.equal(sev(audit("X-Content-Type-Options: nosniff\nX-Content-Type-Options: nosniff"), "nosniff-ok"), "pass");
});

test("verifier: client hint features count as known Permissions-Policy features", () => {
  const a = audit("Permissions-Policy: ch-ua-platform=*, ch-dpr=(self), battery=()");
  assert.ok(!has(a, "permissions-unknown"));
  const b = audit("Permissions-Policy: camra=()");
  assert.ok(has(b, "permissions-unknown"));
});

test("verifier: adversarial header pastes never throw", () => {
  for (const input of [
    "\u0000",
    ":".repeat(10_000),
    "a:".repeat(50_000),
    "HTTP/1.1 200\n".repeat(5000),
    "Strict-Transport-Security: max-age=" + "9".repeat(150_000),
    "Permissions-Policy: " + "a=(".repeat(30_000),
    "Set-Cookie: " + ";".repeat(150_000),
    "< HTTP/2 200\n< " + "x".repeat(100_000),
    "Content-Security-Policy: " + "'".repeat(150_000),
    "😀: \ud800",
  ]) {
    const r = auditHeaders(input);
    if (r.ok) assert.ok(r.audit.findings.length < 200);
  }
});

console.log(`security-headers-analyzer: ${passed} tests passed`);
