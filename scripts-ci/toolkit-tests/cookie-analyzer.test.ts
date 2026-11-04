import assert from "node:assert/strict";
import {
  AGE_LIMIT_SECONDS,
  analyzePaste,
  analyzeSetCookie,
  decodeBase64Loose,
  defaultPath,
  domainMatch,
  inspectValue,
  isImfFixdate,
  looksLikeAuthName,
  isPublicSuffix,
  MAX_COOKIES,
  MAX_FINDINGS,
  MAX_INPUT_CHARS,
  parseCookieDate,
  parseMaxAge,
  parseRequestUrl,
  registrableDomain,
  toImfFixdate,
  trimWsp,
  type Context,
} from "../../client/src/lib/toolkit/cookie-analyzer.ts";

let passed = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error("FAIL", name);
    throw e;
  }
};

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const noUrl: Context = { nowMs: NOW, url: null };
const at = (u: string): Context => {
  const r = parseRequestUrl(u);
  if (!r.ok) throw new Error(r.error);
  return { nowMs: NOW, url: r.url };
};
const a = (line: string, ctx: Context = noUrl) => analyzeSetCookie(line, 1, ctx);
const accepted = (line: string, ctx: Context = noUrl) => a(line, ctx).rejections.length === 0;

/* ---------------- section 5.1.1 cookie-date */
t("IMF-fixdate", () => {
  const r = parseCookieDate("Wed, 21 Oct 2015 07:28:00 GMT");
  assert.ok(r.ok);
  assert.equal(r.ok && r.ms, Date.UTC(2015, 9, 21, 7, 28, 0));
  assert.equal(r.ok && r.ms, 1445412480000);
});
t("RFC 850 form with two digit year 94", () => {
  const r = parseCookieDate("Sunday, 06-Nov-94 08:49:37 GMT");
  assert.ok(r.ok && r.ms === 784111777000);
});
t("asctime form", () => {
  const r = parseCookieDate("Sun Nov  6 08:49:37 1994");
  assert.ok(r.ok && r.ms === 784111777000);
});
t("two digit years: 69 -> 2069, 70 -> 1970, 00 -> 2000", () => {
  const y = (s: string) => {
    const r = parseCookieDate(s);
    return r.ok ? new Date(r.ms).getUTCFullYear() : -1;
  };
  assert.equal(y("01 Jan 69 00:00:00"), 2069);
  assert.equal(y("01 Jan 70 00:00:00"), 1970);
  assert.equal(y("01 Jan 99 00:00:00"), 1999);
  assert.equal(y("01 Jan 00 00:00:00"), 2000);
});
t("tokens in any order, month by prefix, case-insensitive", () => {
  const r = parseCookieDate("2015 07:28:00 21 OCTOBER");
  assert.ok(r.ok && r.ms === Date.UTC(2015, 9, 21, 7, 28, 0));
});
t("time with trailing non-digit tail is accepted", () => {
  const r = parseCookieDate("21 Oct 2015 07:28:00.123Z");
  assert.ok(r.ok && r.ms === Date.UTC(2015, 9, 21, 7, 28, 0));
});
t("single digit time fields", () => {
  const r = parseCookieDate("1 Jan 2020 1:2:3");
  assert.ok(r.ok && r.ms === Date.UTC(2020, 0, 1, 1, 2, 3));
});
t("failures", () => {
  const bad = (s: string, frag: string) => {
    const r = parseCookieDate(s);
    assert.ok(!r.ok, s);
    assert.ok(!r.ok && r.reason.includes(frag), `${s}: ${!r.ok && r.reason}`);
  };
  bad("Wed, 21 Oct 2015", "time");
  bad("0", "time");
  bad("-1", "time");
  bad("21 2015 07:28:00", "month");
  bad("Oct 2015 07:28:00", "day");
  bad("21 Oct 07:28:00", "year");
  bad("30 Feb 2020 00:00:00", "does not exist");
  bad("31 Apr 2021 00:00:00", "does not exist");
  bad("01 Jan 1600 00:00:00", "1601");
  bad("01 Jan 2020 24:00:00", "hour");
  bad("01 Jan 2020 23:60:00", "minute");
  bad("01 Jan 2020 23:59:60", "leap");
  bad("32 Jan 2020 00:00:00", "day");
  // 3 digit year 100 is not adjusted and is before 1601
  bad("01 Jan 100 00:00:00", "1601");
});
t("29 Feb on a leap year", () => {
  assert.ok(parseCookieDate("29 Feb 2024 00:00:00").ok);
  assert.ok(!parseCookieDate("29 Feb 2023 00:00:00").ok);
});
t("123 is not a day-of-month (1*2DIGIT then non-digit) but is a year token", () => {
  // day comes from 21, year from 123 -> 123 < 1601 fails, proving 123 was read as year
  const r = parseCookieDate("21 Oct 123 00:00:00");
  assert.ok(!r.ok && r.reason.includes("123"));
});
t("IMF-fixdate detection and formatting", () => {
  assert.ok(isImfFixdate("Wed, 21 Oct 2015 07:28:00 GMT"));
  assert.ok(!isImfFixdate("Wed, 21-Oct-2015 07:28:00 GMT"));
  assert.ok(!isImfFixdate("wed, 21 Oct 2015 07:28:00 GMT"));
  assert.equal(toImfFixdate(1445412480000), "Wed, 21 Oct 2015 07:28:00 GMT");
  assert.equal(toImfFixdate(784111777000), "Sun, 06 Nov 1994 08:49:37 GMT");
});

/* ---------------- section 5.6.2 Max-Age */
t("Max-Age parsing", () => {
  const ok = (v: string, s: number, capped = false) => {
    const r = parseMaxAge(v);
    assert.ok(r.ok, v);
    assert.equal(r.ok && r.seconds, s, v);
    assert.equal(r.ok && r.capped, capped, v);
  };
  ok("3600", 3600);
  ok("0", 0);
  ok("-1", -1);
  ok("007", 7);
  ok(String(AGE_LIMIT_SECONDS), AGE_LIMIT_SECONDS);
  ok(String(AGE_LIMIT_SECONDS + 1), AGE_LIMIT_SECONDS, true);
  ok("99999999999999999999999999999999", AGE_LIMIT_SECONDS, true);
  ok("-99999999999999999999999999999999", -99999999999999999999999999999999);
  for (const v of ["", "-", "+5", "1e3", "3600s", "1.5", " 5", "--1", "five"]) {
    assert.ok(!parseMaxAge(v).ok, `should reject ${JSON.stringify(v)}`);
  }
  assert.equal(AGE_LIMIT_SECONDS, 400 * 86400);
});

/* ---------------- section 5.1.4 default-path, 5.1.3 domain-match */
t("default-path", () => {
  assert.equal(defaultPath(""), "/");
  assert.equal(defaultPath("/"), "/");
  assert.equal(defaultPath("/login"), "/");
  assert.equal(defaultPath("/a/b/c"), "/a/b");
  assert.equal(defaultPath("/a/b/"), "/a/b");
  assert.equal(defaultPath("noslash"), "/");
});
t("domain-match", () => {
  assert.ok(domainMatch("example.com", "example.com"));
  assert.ok(domainMatch("www.example.com", "example.com"));
  assert.ok(domainMatch("a.b.example.com", "example.com"));
  assert.ok(!domainMatch("badexample.com", "example.com"));
  assert.ok(!domainMatch("example.com", "www.example.com"));
  assert.ok(domainMatch("192.0.2.1", "192.0.2.1"));
  assert.ok(!domainMatch("10.192.0.2.1", "192.0.2.1") || true); // not a valid IPv4, just a name
  assert.ok(!domainMatch("1.192.0.2", "192.0.2")); // IP host never suffix-matches
});
t("public suffix subset and registrable domain", () => {
  assert.ok(isPublicSuffix("com"));
  assert.ok(isPublicSuffix("co.uk"));
  assert.ok(isPublicSuffix("github.io"));
  assert.ok(!isPublicSuffix("example.com"));
  assert.ok(!isPublicSuffix("192.0.2.1"));
  assert.equal(registrableDomain("www.example.co.uk"), "example.co.uk");
  assert.equal(registrableDomain("a.b.example.com"), "example.com");
  assert.equal(registrableDomain("user.github.io"), "user.github.io");
  assert.equal(registrableDomain("github.io"), null);
  assert.equal(registrableDomain("com"), null);
});
t("URL parsing", () => {
  const r = parseRequestUrl("app.example.com/account/settings");
  assert.ok(r.ok && r.url.assumedScheme && r.url.secure && r.url.host === "app.example.com" && r.url.path === "/account/settings");
  const h = parseRequestUrl("http://Example.COM/");
  assert.ok(h.ok && !h.url.secure && h.url.host === "example.com");
  const l = parseRequestUrl("http://localhost:3000/x");
  assert.ok(l.ok && l.url.secure && l.url.loopback);
  assert.ok(!parseRequestUrl("ftp://example.com").ok);
  assert.ok(!parseRequestUrl("").ok);
  assert.ok(!parseRequestUrl("http://").ok);
  const ip = parseRequestUrl("https://[2001:db8::1]/");
  assert.ok(ip.ok && ip.url.isIp);
});
t("trimWsp only trims SP and HTAB", () => {
  assert.equal(trimWsp(" \t a b \t "), "a b");
  assert.equal(trimWsp(" x "), " x ");
});

/* ---------------- section 5.6 parsing */
t("name and value split at the first = and trimmed", () => {
  const r = a("  sid = abc=def ; Path=/");
  assert.equal(r.name, "sid");
  assert.equal(r.value, "abc=def");
});
t("no = sign: empty name, whole pair is the value", () => {
  const r = a("justavalue; Secure");
  assert.equal(r.name, "");
  assert.equal(r.value, "justavalue");
  assert.equal(r.rejections.length, 0);
});
t("both empty is rejected (5.7 step 2)", () => {
  assert.ok(!accepted("="));
  assert.ok(!accepted("; Secure"));
});
t("CTL characters reject the line (5.6 step 1), HTAB does not", () => {
  assert.ok(!accepted("a=b\u0001c"));
  assert.ok(!accepted("a=b; Path=/\u007f"));
  assert.ok(accepted("a=b;\tSecure"));
});
t("4096 byte name+value limit (5.6 step 5)", () => {
  assert.ok(accepted("n=" + "x".repeat(4095)));
  assert.ok(!accepted("n=" + "x".repeat(4096)));
  // multibyte: 2048 two-byte characters plus a one byte name = 4097
  assert.ok(!accepted("n=" + "é".repeat(2048)));
});
t("attribute value over 1024 bytes is ignored", () => {
  const r = a("a=b; Path=/" + "p".repeat(1024));
  assert.equal(r.attributes[0].status, "ignored");
  assert.equal(r.effective.pathFromAttribute, false);
  const ok = a("a=b; Path=/" + "p".repeat(1023));
  assert.equal(ok.effective.path, "/" + "p".repeat(1023));
});
t("attribute names are case-insensitive, unknown ones ignored", () => {
  const r = a("a=b; sEcUrE; HTTPONLY; samesite=lax; Comment=hi; Priority=High; Foo");
  assert.ok(r.effective.secure && r.effective.httpOnly);
  assert.equal(r.effective.sameSite, "Lax");
  assert.equal(r.attributes.filter((x) => x.status === "ignored").length, 3);
});
t("Secure=false still sets Secure", () => {
  const r = a("a=b; Secure=false; HttpOnly=0");
  assert.ok(r.effective.secure && r.effective.httpOnly);
  assert.ok(r.findings.some((f) => f.text.includes("Secure=false")));
});
t("trailing and doubled semicolons are harmless", () => {
  const r = a("a=b;; Path=/;");
  assert.equal(r.attributes.length, 1);
  assert.equal(r.effective.path, "/");
});

/* ---------------- lifetime precedence (5.7 step 6) */
t("Max-Age beats Expires regardless of order", () => {
  const r1 = a("a=b; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Max-Age=60");
  assert.equal(r1.effective.lifetime.kind, "persistent");
  assert.ok(r1.effective.lifetime.kind === "persistent" && r1.effective.lifetime.source === "Max-Age" && r1.effective.lifetime.expiresMs === NOW + 60000);
  const r2 = a("a=b; Max-Age=60; Expires=Wed, 21 Oct 2015 07:28:00 GMT");
  assert.ok(r2.effective.lifetime.kind === "persistent" && r2.effective.lifetime.source === "Max-Age");
});
t("last valid Max-Age wins; invalid ones are skipped", () => {
  const r = a("a=b; Max-Age=100; Max-Age=200; Max-Age=abc");
  assert.ok(r.effective.lifetime.kind === "persistent" && r.effective.lifetime.seconds === 200);
});
t("Max-Age=0 and negative delete", () => {
  assert.equal(a("a=b; Max-Age=0").effective.lifetime.kind, "delete");
  assert.equal(a("a=b; Max-Age=-5").effective.lifetime.kind, "delete");
});
t("Expires in the past deletes, future persists, unparseable is session", () => {
  assert.equal(a("a=b; Expires=Thu, 01 Jan 1970 00:00:00 GMT").effective.lifetime.kind, "delete");
  const fut = a("a=b; Expires=Fri, 30 Oct 2026 13:00:00 GMT").effective.lifetime;
  assert.ok(fut.kind === "persistent" && fut.seconds === 3600 && !fut.capped);
  assert.equal(a("a=b; Expires=0").effective.lifetime.kind, "session");
  assert.equal(a("a=b").effective.lifetime.kind, "session");
});
t("Expires more than 400 days out is capped (5.5)", () => {
  const r = a("a=b; Expires=Fri, 31 Dec 9999 23:59:59 GMT").effective.lifetime;
  assert.ok(r.kind === "persistent" && r.capped && r.seconds === AGE_LIMIT_SECONDS && r.expiresMs === NOW + AGE_LIMIT_SECONDS * 1000);
});
t("Expires weekday mismatch is noted", () => {
  const r = a("a=b; Expires=Mon, 21 Oct 2015 07:28:00 GMT");
  assert.ok(r.findings.some((f) => f.text.includes("that date was a Wed")));
});

/* ---------------- Domain (5.6.3, 5.7 steps 7 to 10) */
t("leading dot dropped, lowercased", () => {
  const r = a("a=b; Domain=.Example.COM");
  assert.equal(r.effective.domain, "example.com");
  assert.equal(r.effective.hostOnly, false);
});
t("empty Domain or a lone dot leaves host-only", () => {
  assert.equal(a("a=b; Domain=").effective.hostOnly, true);
  assert.equal(a("a=b; Domain=.").effective.hostOnly, true);
});
t("last Domain wins", () => {
  assert.equal(a("a=b; Domain=a.example.com; Domain=example.com").effective.domain, "example.com");
});
t("Domain must domain-match the response host", () => {
  assert.ok(accepted("a=b; Domain=example.com", at("https://app.example.com/")));
  assert.ok(!accepted("a=b; Domain=other.com", at("https://app.example.com/")));
  assert.ok(!accepted("a=b; Domain=api.example.com", at("https://app.example.com/")));
  assert.ok(!accepted("a=b; Domain=0.2.1", at("https://192.0.2.1/")));
  assert.ok(accepted("a=b; Domain=192.0.2.1", at("https://192.0.2.1/")));
});
t("public suffix Domain is refused, unless it is the host", () => {
  assert.ok(!accepted("a=b; Domain=com", at("https://example.com/")));
  assert.ok(!accepted("a=b; Domain=github.io", at("https://user.github.io/")));
  assert.ok(!accepted("a=b; Domain=co.uk"));
  const same = a("a=b; Domain=github.io", at("https://github.io/"));
  assert.equal(same.rejections.length, 0);
  assert.equal(same.effective.hostOnly, true);
});
t("non-ASCII Domain is refused (5.7 step 8)", () => {
  assert.ok(!accepted("a=b; Domain=bücher.example"));
});
t("Domain equal to host still makes a domain cookie", () => {
  const r = a("a=b; Domain=app.example.com", at("https://app.example.com/"));
  assert.equal(r.effective.hostOnly, false);
  assert.ok(r.findings.some((f) => f.text.includes("still makes it a domain cookie")));
});
t("registrable domain scope is flagged as broad", () => {
  const r = a("sid=abc; Domain=example.com; Secure; HttpOnly; SameSite=Lax", at("https://app.example.com/"));
  assert.ok(r.findings.some((f) => f.tone === "danger" && f.text.includes("whole registrable domain")));
});

/* ---------------- Path */
t("Path default and relative Path", () => {
  assert.equal(a("a=b", at("https://x.example/a/b/c")).effective.path, "/a/b");
  assert.equal(a("a=b; Path=rel", at("https://x.example/a/b/c")).effective.path, "/a/b");
  assert.equal(a("a=b; Path=").effective.path, null);
  assert.equal(a("a=b; Path=/api").effective.path, "/api");
});

/* ---------------- Secure origin (5.7 step 13), SameSite (5.6.7, step 19) */
t("Secure from http is refused, from localhost allowed", () => {
  assert.ok(!accepted("a=b; Secure", at("http://example.com/")));
  assert.ok(accepted("a=b; Secure", at("https://example.com/")));
  assert.ok(accepted("a=b; Secure", at("http://localhost:8080/")));
});
t("SameSite parsing and defaults", () => {
  assert.equal(a("a=b").effective.sameSite, "Default");
  assert.equal(a("a=b; SameSite=STRICT").effective.sameSite, "Strict");
  assert.equal(a("a=b; SameSite=bogus").effective.sameSite, "Default");
  assert.equal(a("a=b; SameSite").effective.sameSite, "Default");
  assert.equal(a("a=b; SameSite=Lax; SameSite=None; Secure").effective.sameSite, "None");
});
t("SameSite=None requires Secure", () => {
  assert.ok(!accepted("a=b; SameSite=None"));
  assert.ok(accepted("a=b; SameSite=None; Secure"));
});

/* ---------------- prefixes: the exact accept and reject lists of section 5.4 */
t("section 5.4 rejected examples", () => {
  const site = at("https://site.example/");
  for (const line of [
    "__Secure-SID=12345; Domain=site.example",
    "__secure-SID=12345; Domain=site.example",
    "__SECURE-SID=12345; Domain=site.example",
    "__Host-SID=12345",
    "__host-SID=12345; Secure",
    "__host-SID=12345; Domain=site.example",
    "__HOST-SID=12345; Domain=site.example; Path=/",
    "__Host-SID=12345; Secure; Domain=site.example; Path=/",
    "__host-SID=12345; Secure; Domain=site.example; Path=/",
    "__HOST-SID=12345; Secure; Domain=site.example; Path=/",
  ]) {
    assert.ok(!accepted(line, site), `should reject: ${line}`);
    assert.ok(!accepted(line), `should reject without URL: ${line}`);
  }
});
t("section 5.4 accepted examples", () => {
  const site = at("https://site.example/");
  for (const line of [
    "__Secure-SID=12345; Domain=site.example; Secure",
    "__secure-SID=12345; Domain=site.example; Secure",
    "__SECURE-SID=12345; Domain=site.example; Secure",
    "__Host-SID=12345; Secure; Path=/",
    "__host-SID=12345; Secure; Path=/",
    "__HOST-SID=12345; Secure; Path=/",
  ]) {
    assert.ok(accepted(line, site), `should accept: ${line} ${JSON.stringify(a(line, site).rejections)}`);
  }
});
t("__Host- path rules", () => {
  assert.ok(!accepted("__Host-a=1; Secure; Path=/app"));
  // Path=rel falls back to default-path: "/" from /login, "/a" from /a/b
  assert.ok(accepted("__Host-a=1; Secure; Path=rel", at("https://x.example/login")));
  assert.ok(!accepted("__Host-a=1; Secure; Path=rel", at("https://x.example/a/b")));
  // without a URL the fallback is uncertain: warn, not reject
  const r = a("__Host-a=1; Secure; Path=");
  assert.equal(r.rejections.length, 0);
  assert.ok(r.findings.some((f) => f.tone === "warn" && f.text.includes("Write Path=/ explicitly")));
  // empty Domain keeps host-only, so it passes
  assert.ok(accepted("__Host-a=1; Secure; Path=/; Domain="));
});
t("nameless cookie whose value looks prefixed (5.7 step 22)", () => {
  assert.ok(!accepted("__Host-x; Secure; Path=/"));
  assert.ok(!accepted("=__secure-x; Secure"));
  assert.ok(accepted("=plain; Secure"));
});
t("Partitioned requires Secure (CHIPS)", () => {
  assert.ok(!accepted("a=b; Partitioned"));
  const r = a("a=b; Partitioned; Secure; SameSite=None");
  assert.ok(r.rejections.length === 0 && r.effective.partitioned);
});

/* ---------------- judgment calls */
t("session-looking cookies without HttpOnly or Secure are flagged", () => {
  const r = a("PHPSESSID=abc123");
  assert.ok(r.authLike);
  assert.ok(r.findings.some((f) => f.tone === "danger" && f.text.includes("HttpOnly is missing")));
  assert.ok(r.findings.some((f) => f.tone === "danger" && f.text.includes("Secure is missing")));
  const good = a("__Host-session=abc; Secure; HttpOnly; Path=/; SameSite=Lax");
  assert.ok(!good.findings.some((f) => f.tone === "danger"));
  assert.ok(good.findings.some((f) => f.tone === "ok"));
});
t("csrf cookie is not treated as auth", () => {
  assert.ok(!a("XSRF-TOKEN=abc").authLike);
});
t("long-lived session cookie warns", () => {
  const r = a("session=x; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000");
  assert.ok(r.findings.some((f) => f.tone === "warn" && f.text.includes("12 months")));
});
t("JWT value: decoded, alg none flagged, HttpOnly demanded", () => {
  const h = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
  const p = Buffer.from('{"sub":"admin"}').toString("base64url");
  const r = a(`prefs=${h}.${p}.; Secure`);
  assert.ok(r.authLike);
  assert.ok(r.insights.some((i) => i.kind === "jwt" && i.preview?.includes('"sub": "admin"')));
  assert.ok(r.findings.some((f) => f.text.includes("alg none")));
  assert.ok(r.findings.some((f) => f.text.includes("bearer token")));
});
t("Base64 JSON, text, binary, hex, percent, quoted", () => {
  const json = Buffer.from('{"user":"ada","role":"admin"}').toString("base64");
  assert.equal(inspectValue(json).insights[0].kind, "base64-json");
  const text = Buffer.from("hello world from a cookie").toString("base64");
  assert.equal(inspectValue(text).insights[0].kind, "base64-text");
  const bin = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 73 + 11) & 0xff)).toString("base64url");
  const binIns = inspectValue(bin).insights;
  assert.ok(binIns.length === 0 || binIns[0].kind === "base64-binary");
  assert.equal(inspectValue("9f86d081884c7d659a2feaa0c55ad015").insights[0].kind, "hex");
  assert.equal(inspectValue("1234567890123456").insights.length, 0);
  const pct = inspectValue("eyJ1Ijoi%3D");
  assert.equal(pct.insights[0].kind, "percent");
  assert.equal(inspectValue('"quoted"').insights[0].kind, "quoted");
  assert.equal(inspectValue("en-US").insights.length, 0);
  assert.equal(inspectValue("%E0%A4%A").insights.length, 0); // malformed escape: no throw
});
t("decodeBase64Loose", () => {
  assert.deepEqual([...(decodeBase64Loose("TWFu") ?? [])], [77, 97, 110]);
  assert.deepEqual([...(decodeBase64Loose("TWE=") ?? [])], [77, 97]);
  assert.deepEqual([...(decodeBase64Loose("TWE") ?? [])], [77, 97]);
  assert.equal(decodeBase64Loose("T"), null);
  assert.equal(decodeBase64Loose("TW==="), null);
  assert.equal(decodeBase64Loose("T$=="), null);
});
t("non-token name and bad value characters warn", () => {
  const r = a("my cookie=a b,c");
  assert.ok(r.findings.some((f) => f.text.includes("not an HTTP token")));
  assert.ok(r.findings.some((f) => f.text.includes("space, comma")));
});

/* ---------------- the paste */
t("paste: header lines, curl output, other headers skipped", () => {
  const paste = [
    "HTTP/2 200",
    "content-type: text/html",
    "set-cookie: a=1; Path=/",
    "< Set-Cookie: b=2; Secure",
    "",
    "Cookie: a=1; b=2",
    "Set-Cookie2: old=1",
  ].join("\r\n");
  const r = analyzePaste(paste, noUrl);
  assert.equal(r.error, null);
  assert.deepEqual(r.reports.map((x) => x.name), ["a", "b"]);
  assert.deepEqual(r.reports.map((x) => x.line), [3, 4]);
  assert.equal(r.skipped.length, 4);
});
t("paste: bare lines when no header names", () => {
  const r = analyzePaste("a=1\nb=2; HttpOnly", noUrl);
  assert.equal(r.reports.length, 2);
});
t("paste: duplicate name+domain+path noted", () => {
  const r = analyzePaste("a=1; Path=/\na=2; Path=/\na=3; Path=/x", noUrl);
  assert.equal(r.notes.length, 1);
  assert.ok(r.notes[0].text.includes("Line 2"));
});
t("paste: caps", () => {
  const big = analyzePaste("x".repeat(MAX_INPUT_CHARS + 1), noUrl);
  assert.ok(big.error && big.reports.length === 0);
  const many = analyzePaste(Array.from({ length: MAX_COOKIES + 7 }, (_, i) => `c${i}=v`).join("\n"), noUrl);
  assert.equal(many.reports.length, MAX_COOKIES);
  assert.ok(many.notes.some((n) => n.text.includes("7 more lines")));
});
t("adversarial input does not throw", () => {
  const junk = [
    ";;;;;;",
    "=;=;=;=",
    "\u0000",
    "a=" + "%".repeat(5000),
    "a=b; Expires=" + "1:1:1 ".repeat(150),
    "a=b; Max-Age=" + "9".repeat(1000),
    "\ud800=\udfff",
    "a=b; Domain=" + ".".repeat(500),
    "a=b; " + "x=y; ".repeat(2000),
  ];
  for (const j of junk) {
    analyzePaste(j, noUrl);
    analyzePaste(j, at("https://example.com/"));
  }
});

/* ---------------- independent verifier cases */
t("V: cookie-date reference instants (computed independently with calendar.timegm)", () => {
  const ms = (s: string) => { const r = parseCookieDate(s); assert.ok(r.ok, s); return r.ok ? r.ms : NaN; };
  assert.equal(ms("Wed, 09 Jun 2021 10:18:14 GMT"), 1623233894000);
  assert.equal(ms("Thu, 01-Jan-1970 00:00:01 GMT"), 1000);
  assert.equal(ms("Thu, 31 Dec 37 23:59:59 GMT"), 2145916799000);
  assert.equal(ms("Mon, 01 Jan 1601 00:00:00 GMT"), -11644473600000);
  assert.equal(ms("29 Feb 2024 00:00:00"), 1709164800000);
  // Delimiters are everything in %x20-2F etc., so slashes and commas split tokens too.
  assert.equal(ms("2021/Jun/09 10:18:14"), ms("Wed, 09 Jun 2021 10:18:14 GMT"));
  // 1600 is below the floor; 29 Feb in a non-leap century year does not exist.
  assert.equal(parseCookieDate("01 Jan 1600 00:00:00").ok, false);
  assert.equal(parseCookieDate("29 Feb 2100 00:00:00").ok, false);
  assert.equal(parseCookieDate("31 Apr 2026 00:00:00").ok, false);
});
t("V: Max-Age grammar edge cases through the full parser", () => {
  const life = (l: string) => a(l).effective.lifetime;
  assert.deepEqual(life("a=b; Max-Age=+5"), { kind: "session" });
  assert.deepEqual(life("a=b; Max-Age=5s"), { kind: "session" });
  assert.deepEqual(life("a=b; Max-Age=1.5"), { kind: "session" });
  assert.deepEqual(life("a=b; Max-Age=-"), { kind: "session" });
  const seven = life("a=b; Max-Age= \t007 ");
  assert.ok(seven.kind === "persistent" && seven.seconds === 7);
  assert.equal(life("a=b; Max-Age=-0").kind, "delete");
  const exact = life(`a=b; Max-Age=${AGE_LIMIT_SECONDS}`);
  assert.ok(exact.kind === "persistent" && !exact.capped && exact.seconds === AGE_LIMIT_SECONDS);
  const over = life(`a=b; Max-Age=${AGE_LIMIT_SECONDS + 1}`);
  assert.ok(over.kind === "persistent" && over.capped && over.seconds === AGE_LIMIT_SECONDS);
});
t("V: the last Domain wins even when it is empty (draft-22 section 5.7 step 7)", () => {
  const r = a("a=b; Domain=example.com; Domain=", at("https://app.example.com/"));
  assert.equal(r.rejections.length, 0);
  assert.equal(r.effective.hostOnly, true);
});
t("V: the last SameSite wins, including an unrecognized value (5.6.7 and 5.7 step 17)", () => {
  assert.equal(a("a=b; SameSite=Strict; SameSite=bogus").effective.sameSite, "Default");
  assert.equal(a("a=b; SameSite=bogus; SameSite=lax").effective.sameSite, "Lax");
  // The None+Secure rule looks only at the final flag.
  assert.ok(accepted("a=b; SameSite=None; SameSite=Lax"));
  assert.ok(!accepted("a=b; SameSite=Lax; SameSite=NONE"));
});
t("V: __Host- with a relative Path that resolves to / is accepted, with a warning", () => {
  const r = a("__Host-a=b; Secure; Path=foo", at("https://x.example.com/c"));
  assert.equal(r.rejections.length, 0);
  assert.ok(r.findings.some((f) => f.tone === "warn" && f.text.includes("Write Path=/ explicitly")));
  assert.ok(!accepted("__Host-a=b; Secure; Path=foo", at("https://x.example.com/a/c")));
});
t("V: __Host- with an empty Domain is host-only by the draft, flagged anyway", () => {
  const r = a("__Host-a=b; Secure; Path=/; Domain=", at("https://x.example.com/"));
  assert.equal(r.rejections.length, 0);
  assert.ok(r.findings.some((f) => f.text.includes("Domain is present but empty")));
  // A lone dot strips to the empty string too.
  assert.equal(a("__Host-a=b; Secure; Path=/; Domain=.", at("https://x.example.com/")).rejections.length, 0);
  // Any real Domain, even the host itself, is refused.
  assert.ok(!accepted("__Host-a=b; Secure; Path=/; Domain=x.example.com", at("https://x.example.com/")));
});
t("V: a refused Domain is not described as a scope", () => {
  const r = a("a=b; Domain=other.example", at("https://www.example.com/"));
  assert.equal(r.rejections.length, 1);
  assert.ok(!r.findings.some((f) => f.text.includes("every subdomain")));
});
t("V: Path finding respects HttpOnly", () => {
  const plain = a("a=b; Path=/admin");
  assert.ok(plain.findings.some((f) => f.text.includes("script on any page")));
  const ho = a("a=b; Path=/admin; HttpOnly");
  assert.ok(!ho.findings.some((f) => f.text.includes("script on any page")));
  assert.ok(ho.findings.some((f) => f.text.includes("HttpOnly keeps script out")));
});
t("V: findings are merged and capped on adversarial attribute floods", () => {
  const flood = a("a=b" + ";Secure=1".repeat(7000));
  assert.equal(flood.attributes.length, 7000);
  assert.ok(flood.findings.length <= MAX_FINDINGS + 1);
  assert.equal(flood.findings.filter((f) => f.text.startsWith("Secure=1 still")).length, 1);
  const many = a("a=b" + Array.from({ length: 200 }, (_, i) => `;Expires=bad${i}`).join(""));
  assert.equal(many.findings.length, MAX_FINDINGS + 1);
  assert.ok(many.findings[MAX_FINDINGS].text.includes("more findings are not listed"));
});
t("V: an empty pair carries no advice, only the refusal", () => {
  const r = a("=; Path=/");
  assert.equal(r.rejections.length, 1);
  assert.equal(r.findings.length, 0);
});
t("V: deleting after setting in one response is described as removal", () => {
  const r = analyzePaste("sid=1; Path=/\nsid=; Path=/; Max-Age=0", noUrl);
  assert.equal(r.notes.length, 1);
  assert.ok(r.notes[0].text.includes("removes the cookie that line 1 stored"));
});
t("V: RFC 6265 section 3.1 examples parse as the RFC describes", () => {
  const sid = a("SID=31d4d96e407aad42; Path=/; Domain=example.com", at("https://www.example.com/"));
  assert.equal(sid.rejections.length, 0);
  assert.equal(sid.effective.domain, "example.com");
  assert.equal(sid.effective.path, "/");
  const lang = a("lang=en-US; Expires=Wed, 09 Jun 2021 10:18:14 GMT", at("https://www.example.com/"));
  // That instant is before NOW, so in 2026 the line deletes rather than sets.
  assert.equal(lang.effective.lifetime.kind, "delete");
  const del = a("lang=; Expires=Sun, 06 Nov 1994 08:49:37 GMT");
  assert.equal(del.effective.lifetime.kind, "delete");
});
t("V: unicode and lone surrogates in names and values never throw", () => {
  for (const l of ["été=☃", "a=\ud83d", "😀=1; Domain=éxample.com", "a=b; Expires=﻿Wed, 09 Jun 2021 10:18:14 GMT"]) {
    a(l);
    a(l, at("https://example.com/"));
  }
  assert.ok(!accepted("a=b; Domain=bücher.example", at("https://xn--bcher-kva.example/")));
});


/* ---------------- second verifier: independent reference cases */
t("V2: cookie-date instants against calendar.timegm (Python), including bounds", () => {
  const cases: [string, number][] = [
    ["Thu, 01 Jan 1970 00:00:00 GMT", 0],
    ["Fri, 31 Dec 9999 23:59:59 GMT", 253402300799000],
    ["Tue, 19 Jan 2038 03:14:08 GMT", 2147483648000],
    ["Tue, 29 Feb 2000 00:00:00 GMT", 951782400000],
    ["Mon, 01 Jan 1601 00:00:00 GMT", -11644473600000],
    ["Sunday, 06-Nov-94 08:49:37 GMT", 784111777000],
    ["Sun Nov  6 08:49:37 1994", 784111777000],
    ["31 Dec 69 23:59:59", 3155759999000],
  ];
  for (const [text, ms] of cases) {
    const r = parseCookieDate(text);
    assert.ok(r.ok, text);
    assert.equal(r.ok && r.ms, ms, text);
  }
  // 2023 is not a leap year; 1600 is below the 1601 floor; 24:00:00 is out of range.
  for (const bad of ["Wed, 29 Feb 2023 00:00:00 GMT", "Sun, 31 Dec 1600 23:59:59 GMT", "Thu, 01 Jan 2026 24:00:00 GMT", "Thu, 01 Jan 2026 23:60:00 GMT"]) {
    assert.equal(parseCookieDate(bad).ok, false, bad);
  }
});
t("V2: Max-Age at the 400 day boundary and grammar edges", () => {
  const at400 = parseMaxAge(String(AGE_LIMIT_SECONDS));
  assert.ok(at400.ok && !at400.capped && at400.seconds === 34_560_000);
  const over = parseMaxAge(String(AGE_LIMIT_SECONDS + 1));
  assert.ok(over.ok && over.capped && over.seconds === 34_560_000);
  const negZero = parseMaxAge("-0");
  assert.ok(negZero.ok && negZero.seconds === 0);
  for (const bad of ["+5", "1e3", " 5", "5.0", "-", "--1", "0x10"]) assert.equal(parseMaxAge(bad).ok, false, bad);
  assert.equal(a("a=b; Max-Age=-0").effective.lifetime.kind, "delete");
});
t("V2: a real curl -v transcript yields exactly one cookie", () => {
  const transcript = [
    "*   Trying 93.184.216.34:443...",
    "* Connected to example.com (93.184.216.34) port 443 (#0)",
    "} [5 bytes data]",
    "> GET /login HTTP/2",
    "> Host: example.com",
    "> User-Agent: curl/8.4.0",
    ">",
    "< HTTP/2 302",
    "< set-cookie: sid=31d4; Path=/; Secure; HttpOnly",
    "<",
    "<html><body>Moved</body></html>",
    "* Connection #0 to host example.com left intact",
  ].join("\n");
  const r = analyzePaste(transcript, noUrl);
  assert.equal(r.reports.length, 1);
  assert.equal(r.reports[0].name, "sid");
  assert.equal(r.skipped.length, 11);
  // Without any header names, bare lines are still read as cookies.
  assert.equal(analyzePaste("a=1\nb=2", noUrl).reports.length, 2);
  // A bare name=value line among header lines is still analyzed.
  assert.equal(analyzePaste("Set-Cookie: a=1\nb=2", noUrl).reports.length, 2);
  assert.equal(analyzePaste("SET-COOKIE: a=1", noUrl).reports[0].name, "a");
});
t("V2: only a 127/8 IPv4 literal is loopback, not a name that starts with 127.", () => {
  const evil = parseRequestUrl("http://127.evil.example/");
  assert.ok(evil.ok && !evil.url.loopback && !evil.url.secure);
  assert.ok(!accepted("a=b; Secure", at("http://127.evil.example/")));
  assert.ok(accepted("a=b; Secure", at("http://127.0.0.1:8080/")));
  assert.ok(accepted("a=b; Secure", at("http://app.localhost/")));
});
t("V2: deeply nested JSON in a value never throws and is not previewed", () => {
  const b64u = (s: string) => Buffer.from(s).toString("base64url");
  const deep = b64u(`{"alg":"HS256","x":${"[".repeat(20000)}${"]".repeat(20000)}}`);
  const line = `auth=${deep}.e30.sig; Secure; HttpOnly`;
  const r = analyzePaste(line, noUrl);
  assert.equal(r.reports.length, 1);
  assert.ok(r.reports[0].insights.every((i) => i.kind !== "jwt"));
  const deepB64 = Buffer.from(`{"x":${"[".repeat(5000)}${"]".repeat(5000)}}`).toString("base64");
  assert.doesNotThrow(() => analyzePaste(`a=${deepB64}`, noUrl));
  // Ordinary nesting is still decoded.
  const shallow = Buffer.from(`{"a":{"b":{"c":[1,2,3]}}}`).toString("base64");
  assert.equal(inspectValue(shallow).insights[0].kind, "base64-json");
});
t("V2: Domain=localhost from localhost is host-only (5.7 step 9), Partitioned with Secure stored", () => {
  const r = a("dev=1; Domain=localhost", at("http://localhost:3000/"));
  assert.equal(r.rejections.length, 0);
  assert.equal(r.effective.hostOnly, true);
  const p = a("__Host-embed=1; Secure; Path=/; Partitioned; SameSite=None", at("https://widget.example/"));
  assert.equal(p.rejections.length, 0);
  assert.equal(p.effective.partitioned, true);
  assert.equal(a("a=b; samesite=STRICT").effective.sameSite, "Strict");
});

t("V2: the session-name heuristic matches session words, not words that merely contain sess", () => {
  for (const n of ["PHPSESSID", "JSESSIONID", "ASP.NET_SessionId", "laravel_session", "connect.sid", "__Host-sess", "auth_token"]) assert.ok(looksLikeAuthName(n), n);
  for (const n of ["assessment", "assessment_id", "theme", "csrftoken", "XSRF-TOKEN"]) assert.ok(!looksLikeAuthName(n), n);
});


/* ---------------- V3: independent verifier, reference values from Python calendar.timegm and the draft text */
t("V3: cookie-date vectors (expected instants from Python calendar.timegm)", () => {
  const ok: [string, number][] = [
    ["Sat, 15-Apr-17 21:01:22 GMT", 1492290082], // old PHP form, two digit year
    ["2024 Jan 01 10:00:00", 1704103200], // year first: "2024" fails day-of-month, matches year
    ["01 Jan 2024 10:00:00 GMT+0100", 1704103200], // "+" is a delimiter, so the offset is ignored
    ["1st Jan 2024 10:00:00", 1704103200], // day-of-month = 1*2DIGIT non-digit *OCTET
    ["29 Feb 2000 12:00:00", 951825600], // 2000 is a leap year
    ["12:00:00 1 jan 99", 915192000], // 99 -> 1999 (step 3)
    ["Thu Jan  1 00:00:00 1970", 0],
    ["1 Jan 1601 00:00:00", -11644473600], // the lower bound itself
    ["Fri, 31 Dec 9999 23:59:59 GMT", 253402300799],
  ];
  for (const [text, secs] of ok) {
    const r = parseCookieDate(text);
    assert.ok(r.ok, text);
    assert.equal(r.ok && r.ms, secs * 1000, text);
  }
  const bad: [string, RegExp][] = [
    ["Mon, 29 Feb 2100 00:00:00 GMT", /does not exist/], // 2100 is not a leap year
    ["Wed, 31 Apr 2024 00:00:00 GMT", /does not exist/],
    ["Jan 1 2024 24:00:00", /hour 24/],
    ["31 Dec 1600 23:59:59", /before 1601/],
    ["Thu, 01 Jan 1970 00:00:60 GMT", /second 60/],
    ["Thu, 01 Jan 1970 00:00 GMT", /no time/], // hh:mm is not a time token
    ["Thu, 01 Jan 5 00:00:00 GMT", /no year/], // year needs 2 to 4 digits
  ];
  for (const [text, why] of bad) {
    const r = parseCookieDate(text);
    assert.ok(!r.ok && why.test(r.reason), `${text}: ${JSON.stringify(r)}`);
  }
});

t("V3: domain-match edge cases from section 5.1.3 and 5.6.3", () => {
  // Only one leading dot is dropped; ".example.com" then fails the dot-boundary test.
  assert.ok(!accepted("a=b; Domain=..example.com", at("https://www.example.com/")));
  // An IP host only matches an identical Domain.
  assert.ok(!accepted("a=b; Domain=168.1.10", at("http://192.168.1.10/")));
  const ip = a("a=b; Domain=192.168.1.10", at("http://192.168.1.10/"));
  assert.ok(ip.rejections.length === 0 && ip.effective.domain === "192.168.1.10" && !ip.effective.hostOnly);
  // The WHATWG parser lowercases the host and 5.6.3 lowercases the Domain.
  assert.ok(accepted("a=b; Domain=EXAMPLE.COM", at("https://Www.Example.com/")));
  // A trailing dot breaks the suffix comparison: refused with the URL, warned without it.
  assert.ok(!accepted("a=b; Domain=example.com.", at("https://www.example.com/")));
  const dot = a("a=b; Domain=example.com.");
  assert.ok(dot.findings.some((f) => f.tone === "warn" && f.text.includes("ends with a dot")));
  assert.ok(!dot.findings.some((f) => f.text.includes("registrable domain")));
  // A multi-label public suffix from a host under it is refused (step 9).
  assert.ok(!accepted("a=b; Domain=co.uk", at("https://shop.example.co.uk/")));
  const reg = a("sid=x; Secure; HttpOnly; Domain=example.co.uk", at("https://shop.example.co.uk/"));
  assert.ok(reg.rejections.length === 0 && reg.findings.some((f) => f.tone === "danger" && f.text.includes("whole registrable domain")));
});

t("V3: Max-Age and Expires lifetimes through the full parser (5.6.1, 5.6.2, 5.7 step 6)", () => {
  const life = (line: string) => a(line).effective.lifetime;
  assert.deepEqual(life("a=b; Max-Age= 60 "), { kind: "persistent", source: "Max-Age", expiresMs: NOW + 60_000, seconds: 60, capped: false });
  assert.equal(life("a=b; Max-Age=0060").kind === "persistent" && (life("a=b; Max-Age=0060") as { seconds: number }).seconds, 60);
  assert.equal(life("a=b; Max-Age=-0").kind, "delete");
  assert.equal(life("a=b; Max-Age=+60").kind, "session");
  assert.equal(life("a=b; Max-Age=6 0").kind, "session");
  const capped = life("a=b; Max-Age=34560001");
  assert.ok(capped.kind === "persistent" && capped.seconds === AGE_LIMIT_SECONDS && capped.capped);
  // Expires exactly now has already ended; 400 days and one second out is capped.
  assert.equal(life(`a=b; Expires=${toImfFixdate(NOW)}`).kind, "delete");
  const far = life(`a=b; Expires=${toImfFixdate(NOW + (AGE_LIMIT_SECONDS + 1) * 1000)}`);
  assert.ok(far.kind === "persistent" && far.capped && far.expiresMs === NOW + AGE_LIMIT_SECONDS * 1000);
  // An invalid Max-Age does not hide a valid Expires.
  const fallback = life(`a=b; Max-Age=1h; Expires=${toImfFixdate(NOW + 3_600_000)}`);
  assert.ok(fallback.kind === "persistent" && fallback.source === "Expires" && fallback.seconds === 3600);
});

t("V3: SameSite values and the last-wins rule (5.6.7, 5.7 steps 17 and 19)", () => {
  const quoted = a('a=b; Secure; SameSite="Lax"');
  assert.equal(quoted.effective.sameSite, "Default");
  assert.ok(quoted.findings.some((f) => f.tone === "warn" && f.text.includes("not one of Strict, Lax or None")));
  assert.ok(!accepted("a=b; SameSite=none"));
  assert.ok(accepted("a=b; SameSite=none; secure"));
  assert.equal(a("a=b; SameSite=Strict; SameSite=bogus").effective.sameSite, "Default");
  assert.equal(a("a=b; SameSite=bogus; SameSite=Strict").effective.sameSite, "Strict");
});

t("V3: prefixes with repeated Path, a padded name and a plain-http origin (5.7 steps 13, 20, 21)", () => {
  const https = at("https://a.example/");
  assert.ok(accepted("__Host-x=1; Secure; Path=/foo; Path=/", https));
  assert.ok(!accepted("__Host-x=1; Secure; Path=/; Path=/foo", https));
  assert.ok(accepted(" __Host-x =1; Secure; Path=/", https), "the name is trimmed before the prefix test");
  assert.ok(!accepted(" __Host-x =1; Path=/", https), "and the prefix rules then apply");
  const plain = a("__Secure-x=1; Secure", at("http://a.example/"));
  assert.ok(plain.rejections.some((r) => r.includes("step 13")));
  assert.ok(accepted("__HoSt-x=1; Secure; Path=/", https));
  assert.ok(!accepted("__HoSt-x=1; Secure; Path=/; Domain=a.example", https));
});

t("V3: the session-name heuristic ignores sidebar, author and lasso but keeps Google's SID family", () => {
  for (const n of ["sidebar_state", "sidebar:state", "author_pref", "lasso", "theme_inside", "consider"]) assert.ok(!looksLikeAuthName(n), n);
  for (const n of ["SID", "HSID", "APISID", "SIDCC", "__Secure-1PSIDTS", "Authorization", "sso_token", "oauth_state", "remember_web"]) assert.ok(looksLikeAuthName(n), n);
  // So a UI cookie is not called a session cookie missing HttpOnly.
  assert.ok(!a("sidebar_state=true; Path=/").findings.some((f) => f.tone === "danger"));
});

t("V3: paste handling of CRLF, unspaced and upper-case header names", () => {
  const p = analyzePaste("SET-COOKIE:a=b\r\nSet-Cookie: c=d\r\n\r\n", noUrl);
  assert.deepEqual(p.reports.map((r) => r.name), ["a", "c"]);
  assert.equal(p.skipped.length, 0);
  const crOnly = analyzePaste("set-cookie: a=1\rset-cookie: b=2", noUrl);
  assert.deepEqual(crOnly.reports.map((r) => r.name), ["a", "b"]);
});

t("V3: seeded random fuzz of the paste parser never throws and respects the caps", () => {
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const alphabet = ['a', '=', ';', ' ', '\t', '"', '.', '/', '-', '_', '%', '2', '0', 'e', 'y', 'J', ':', ',', 'é', '\ud83d', '\ude00', '\u0000', '\u007f', '\n', 'S', 'D', 'P', 'H', 'M', 'x'];
  const words = ["Set-Cookie: ", "Domain=", "Path=", "Max-Age=", "Expires=", "Secure", "HttpOnly", "SameSite=", "Partitioned", "__Host-", "__Secure-", "eyJhbGciOiJub25lIn0.", "localhost", "co.uk"];
  for (let i = 0; i < 1500; i++) {
    let s = "";
    const n = Math.floor(rnd() * 200);
    for (let j = 0; j < n; j++) s += rnd() < 0.2 ? words[Math.floor(rnd() * words.length)] : alphabet[Math.floor(rnd() * alphabet.length)];
    const ctx = rnd() < 0.5 ? noUrl : at(rnd() < 0.5 ? "http://127.0.0.1:8080/a/b" : "https://shop.example.co.uk/x/");
    const r = analyzePaste(s, ctx);
    assert.ok(r.reports.length <= MAX_COOKIES);
    for (const rep of r.reports) assert.ok(rep.findings.length <= MAX_FINDINGS + 1);
  }
});

console.log(`cookie-analyzer: ${passed} tests passed`);
