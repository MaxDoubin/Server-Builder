import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AMBIGUOUS_TLDS,
  DEFAULT_STYLE,
  MAX_INPUT_CHARS,
  TLDS,
  TLD_LIST_VERSION,
  checkDomain,
  defangIndicator,
  findNetworkIndicators,
  firstDifferentLine,
  formatIPv6,
  normalizeDefanged,
  parseIPv4,
  parseIPv6,
  parseUrl,
  refangAll,
  transform,
  type DefangStyle,
} from "../../client/src/lib/toolkit/defang-refang.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const S = (over: Partial<DefangStyle> = {}): DefangStyle => ({ ...DEFAULT_STYLE, ...over });
const defang = (text: string, over: Partial<DefangStyle> = {}, scope: "strict" | "everything" = "strict", keepAmbiguous = false) => {
  const r = transform(text, { direction: "defang", scope, style: S(over), keepAmbiguous });
  assert.ok(r.ok);
  return r.output;
};
const refang = (text: string, scope: "strict" | "everything" = "strict") => {
  const r = transform(text, { direction: "refang", scope, style: DEFAULT_STYLE });
  assert.ok(r.ok);
  return r.output;
};

/* TLD data */
t("tld list sane", () => {
  assert.ok(TLDS.size > 1400, `size ${TLDS.size}`);
  for (const tld of ["com", "net", "org", "io", "uk", "zip", "mov", "xn--p1ai", "museum"]) assert.ok(TLDS.has(tld), tld);
  for (const ext of ["pdf", "exe", "txt", "js", "docx", "dll", "png", "json"]) assert.ok(!TLDS.has(ext), ext);
  for (const a of ["zip", "mov", "py", "sh", "md", "one"]) assert.ok(AMBIGUOUS_TLDS.has(a), a);
  assert.ok(!AMBIGUOUS_TLDS.has("com"));
  assert.equal(AMBIGUOUS_TLDS.size, 15);
});

/* parsers */
t("ipv4 strict", () => {
  assert.deepEqual(parseIPv4("192.0.2.1"), [192, 0, 2, 1]);
  assert.deepEqual(parseIPv4("255.255.255.255"), [255, 255, 255, 255]);
  assert.deepEqual(parseIPv4("0.0.0.0"), [0, 0, 0, 0]);
  assert.equal(parseIPv4("256.1.1.1"), null);
  assert.equal(parseIPv4("010.1.1.1"), null);
  assert.equal(parseIPv4("1.2.3"), null);
  assert.equal(parseIPv4("1.2.3.4.5"), null);
  assert.equal(parseIPv4("1..3.4"), null);
});

t("ipv6 RFC 4291 and RFC 5952", () => {
  const f = (s: string) => {
    const v = parseIPv6(s);
    return v === null ? null : formatIPv6(v);
  };
  // RFC 5952 section 4 examples
  assert.equal(f("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1");
  assert.equal(f("2001:0db8:0:0:0:0:2:1"), "2001:db8::2:1");
  assert.equal(f("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1");
  assert.equal(f("2001:DB8::1"), "2001:db8::1");
  assert.equal(f("::1"), "::1");
  assert.equal(f("::"), "::");
  assert.equal(f("::ffff:192.0.2.128"), "::ffff:192.0.2.128");
  assert.equal(f("1:2:3:4:5:6:7:8"), "1:2:3:4:5:6:7:8");
  assert.equal(f("1:2:3:4:5:6:7"), null);
  assert.equal(f("1::2::3"), null);
  assert.equal(f("12345::1"), null);
  assert.equal(f("1:2:3:4:5:6:7:8:9"), null);
  assert.equal(f("::1.2.3.256"), null);
  assert.equal(parseIPv6("2001:db8::1"), 0x20010db8000000000000000000000001n);
});

t("domain check", () => {
  assert.deepEqual(checkDomain("Example.COM"), { ok: true, name: "example.com", tld: "com", ambiguous: false });
  assert.equal(checkDomain("report.pdf").ok, false);
  assert.equal(checkDomain("node.js").ok, false);
  assert.equal(checkDomain("e.g").ok, false);
  assert.equal(checkDomain("localhost").ok, false);
  assert.equal(checkDomain("-bad.com").ok, false);
  assert.equal(checkDomain(`${"a".repeat(64)}.com`).ok, false);
  assert.equal(checkDomain(`${"a".repeat(63)}.com`).ok, true);
  const amb = checkDomain("setup.py");
  assert.ok(amb.ok && amb.ambiguous);
  assert.equal(checkDomain("example.com.").ok, true);
  assert.equal(checkDomain("xn--80ak6aa92e.xn--p1ai").ok, true);
});

t("url parse", () => {
  const p = parseUrl("https://user:pw@Evil.Example.com:8443/a/B.php?x=1#f");
  assert.ok(p);
  assert.equal(p.scheme, "https");
  assert.equal(p.userinfo, "user:pw");
  assert.equal(p.host, "Evil.Example.com");
  assert.equal(p.hostKind, "domain");
  assert.equal(p.hostValue, "evil.example.com");
  assert.equal(p.rest, ":8443/a/B.php?x=1#f");
  const v6 = parseUrl("http://[2001:DB8::1]:80/x");
  assert.ok(v6);
  assert.equal(v6.hostKind, "ipv6");
  assert.equal(v6.hostValue, "2001:db8::1");
  assert.equal(parseUrl("http://"), null);
  assert.equal(parseUrl("gopher://example.com/"), null);
  assert.equal(parseUrl("http://[zz::1]/"), null);
  assert.equal(parseUrl("http://example.com:99x/"), null);
  assert.equal(parseUrl("http://intranet/")?.hostKind, "name");
  assert.equal(parseUrl("http://192.0.2.7/")?.hostKind, "ipv4");
});

/* normalization */
t("normalize all styles", () => {
  const cases: [string, string][] = [
    ["evil[.]com", "evil.com"],
    ["evil(.)com", "evil.com"],
    ["evil{.}com", "evil.com"],
    ["evil[dot]com", "evil.com"],
    ["evil[DOT]com", "evil.com"],
    ["evil(dot)com", "evil.com"],
    ["evil\\.com", "evil.com"],
    ["a[@]b.com", "a@b.com"],
    ["a[at]b.com", "a@b.com"],
    ["a(at)b.com", "a@b.com"],
    ["hxxp://x.com", "http://x.com"],
    ["hxxps://x.com", "https://x.com"],
    ["hXXps://x.com", "https://x.com"],
    ["HXXP://X.COM", "HTTP://X.COM"],
    ["hxxp[:]//x.com", "http://x.com"],
    ["hxxps[://]x.com", "https://x.com"],
    ["fxp://x.com", "ftp://x.com"],
    ["http:[//]x.com", "http://x.com"],
    ["2001[:]db8[:][:]1", "2001:db8::1"],
    ["the word hxxp alone", "the word hxxp alone"],
    ["meet at noon", "meet at noon"],
  ];
  for (const [input, want] of cases) assert.equal(refangAll(input), want, input);
  const n = normalizeDefanged("go to evil[.]com now");
  assert.equal(n.text, "go to evil.com now");
  const a = n.text.indexOf("evil.com");
  assert.equal(n.starts[a], 6);
  assert.equal(n.ends[a + "evil.com".length - 1], 16);
  assert.equal(n.replacements, 1);
});

/* matcher */
t("find indicators", () => {
  const text = [
    "Payload at hxxps://cdn[.]evil-example[.]com/a/b.php?id=7, beacon to 198.51.100[.]23:8443.",
    "Mail from bad.actor[@]example[.]net and ops@example.org. IPv6 2001:db8::bad:1 and fe80::1%eth0.",
    "Files: report.pdf, setup.py, invoice.zip and evil[.]zip. Version 1.2.3.4.5 and v1.2.3.4 skip.",
    "Times 12:30:45, MAC 00:1a:2b:3c:4d:5e, std::vector and e.g. this.",
  ].join("\n");
  const r = findNetworkIndicators(text);
  const got = r.matches.map((m) => `${m.type}:${m.value}${m.defanged ? "*" : ""}`);
  assert.deepEqual(got, [
    "url:https://cdn.evil-example.com/a/b.php?id=7*",
    "ipv4:198.51.100.23*",
    "email:bad.actor@example.net*",
    "email:ops@example.org",
    "ipv6:2001:db8::bad:1",
    "ipv6:fe80::1",
    "domain:evil.zip*",
  ]);
  assert.deepEqual(r.skippedFileNames, ["setup.py", "invoice.zip"]);
  assert.equal(r.skippedFileNameCount, 2);
  const urlMatch = r.matches[0];
  assert.equal(urlMatch.raw, "hxxps://cdn[.]evil-example[.]com/a/b.php?id=7");
  assert.deepEqual(urlMatch.host, { type: "domain", value: "cdn.evil-example.com" });
  const keep = findNetworkIndicators(text, { keepAmbiguous: true });
  assert.ok(keep.matches.some((m) => m.value === "setup.py"));
});

t("url trailing punctuation and parens", () => {
  const r = findNetworkIndicators("see (http://example.com/a_(b)) and http://example.com/x.");
  assert.deepEqual(
    r.matches.map((m) => m.value),
    ["http://example.com/a_(b)", "http://example.com/x"],
  );
});

t("nested url", () => {
  const r = findNetworkIndicators("https://redirect.example.com/?u=http://evil.example.net/p&x=1");
  assert.equal(r.matches.length, 2);
  assert.equal(r.matches[1].nested, true);
  assert.equal(r.matches[1].value, "http://evil.example.net/p");
});

t("authority pre-check matches full parse", () => {
  const vals = (s: string) => findNetworkIndicators(s).matches.filter((m) => m.type === "url").map((m) => m.value);
  // The trim reaches into the authority only when the whole path is trimmable.
  assert.deepEqual(vals("go http://a.example.com:80!? now"), ["http://a.example.com:80"]);
  assert.deepEqual(vals("go http://a.example.com? now"), ["http://a.example.com"]);
  assert.deepEqual(vals("go (http://a.example.com) now"), ["http://a.example.com"]);
  assert.deepEqual(vals("http://[2001:db8::1]:8080/x"), ["http://[2001:db8::1]:8080/x"]);
  assert.deepEqual(vals("http://[zz::1]/x http:// http://[::1 http://:80/ http://a.com:8o/"), []);
  // A backslash ends the body, leaving a single-label name such as an intranet host.
  assert.deepEqual(vals("http://a b.com http://exa\\mple.com/"), ["http://a", "http://exa"]);
  assert.deepEqual(vals("hxxps://u[@]evil[.]example[.]com[:]8443/a"), ["https://u@evil.example.com:8443/a"]);
});

t("ipv6 needs a digit", () => {
  const vals = (s: string) => findNetworkIndicators(s).matches.map((m) => `${m.type}:${m.value}`);
  assert.deepEqual(vals("call abc::def and a::b, then fe80::1 and ff02::fb"), ["ipv6:fe80::1", "ipv6:ff02::fb"]);
});

t("ipv4 boundaries", () => {
  const vals = (s: string) => findNetworkIndicators(s).matches.map((m) => m.value);
  assert.deepEqual(vals("10.0.0.0/8 and 192.0.2.1:80"), ["10.0.0.0", "192.0.2.1"]);
  assert.deepEqual(vals("1.2.3.4.nip.io"), ["1.2.3.4.nip.io"]);
  assert.deepEqual(vals("ver 999.1.1.1 and 010.1.1.1"), []);
  assert.deepEqual(vals("end of sentence 203.0.113.9."), ["203.0.113.9"]);
});

/* defang */
t("defang indicator styles", () => {
  assert.equal(defangIndicator("domain", "evil.example.com", S()), "evil[.]example[.]com");
  assert.equal(defangIndicator("domain", "evil.example.com", S({ dotScope: "last" })), "evil.example[.]com");
  assert.equal(defangIndicator("domain", "evil.com", S({ dot: "[dot]" })), "evil[dot]com");
  assert.equal(defangIndicator("domain", "evil.com", S({ dot: "(.)" })), "evil(.)com");
  assert.equal(defangIndicator("ipv4", "192.0.2.1", S()), "192[.]0[.]2[.]1");
  assert.equal(defangIndicator("ipv4", "192.0.2.1", S({ dotScope: "last" })), "192.0.2[.]1");
  assert.equal(defangIndicator("ipv6", "2001:db8::1", S()), "2001[:]db8[:][:]1");
  assert.equal(defangIndicator("ipv6", "2001:db8::1", S({ ipv6Colon: false })), "2001:db8::1");
  assert.equal(defangIndicator("email", "a.b@evil.com", S()), "a.b[@]evil[.]com");
  assert.equal(defangIndicator("email", "a.b@evil.com", S({ at: "[at]" })), "a.b[at]evil[.]com");
  assert.equal(defangIndicator("email", "a.b@evil.com", S({ at: "keep" })), "a.b@evil[.]com");
  assert.equal(defangIndicator("url", "https://evil.com/a.php", S()), "hxxps://evil[.]com/a.php");
  assert.equal(defangIndicator("url", "HTTP://evil.com/", S()), "HXXP://evil[.]com/");
  assert.equal(defangIndicator("url", "http://evil.com/", S({ scheme: "hXXp" })), "hXXp://evil[.]com/");
  assert.equal(defangIndicator("url", "http://evil.com/", S({ urlColon: "[:]" })), "hxxp[:]//evil[.]com/");
  assert.equal(defangIndicator("url", "http://evil.com/", S({ urlColon: "[://]" })), "hxxp[://]evil[.]com/");
  assert.equal(defangIndicator("url", "http://evil.com/", S({ scheme: "keep" })), "http://evil[.]com/");
  assert.equal(defangIndicator("url", "ftp://files.evil.com/x", S()), "fxp://files[.]evil[.]com/x");
  assert.equal(defangIndicator("url", "http://u@evil.com/", S()), "hxxp://u[@]evil[.]com/");
  assert.equal(defangIndicator("url", "http://[2001:db8::1]/", S()), "hxxp://[2001[:]db8[:][:]1]/");
  assert.equal(
    defangIndicator("url", "https://r.example.com/?u=http://evil.example.net/", S()),
    "hxxps://r[.]example[.]com/?u=hxxp://evil[.]example[.]net/",
  );
  assert.equal(
    defangIndicator("url", "https://r.example.com/?a=1&u=https://u@evil.example.net:8443/p&v=http://[2001:db8::1]/", S({ dotScope: "last" })),
    "hxxps://r.example[.]com/?a=1&u=hxxps://u[@]evil.example[.]net:8443/p&v=hxxp://[2001[:]db8[:][:]1]/",
  );
});

t("strict mode leaves prose alone", () => {
  const input = "Hello. The file is report.pdf, version 2.1, e.g. this. Block evil.example.com now.";
  assert.equal(defang(input), "Hello. The file is report.pdf, version 2.1, e.g. this. Block evil[.]example[.]com now.");
});

t("everything mode touches every inner dot", () => {
  const input = "Hello. report.pdf v2.1 db01.corp user@host http://intranet/x";
  assert.equal(defang(input, {}, "everything"), "Hello. report[.]pdf v2[.]1 db01[.]corp user[@]host hxxp://intranet/x");
});

t("idempotent and style conversion", () => {
  const once = defang("visit evil.example.com and 192.0.2.1");
  assert.equal(defang(once), once);
  assert.equal(defang("evil(dot)example(dot)com"), "evil[.]example[.]com");
  assert.equal(defang("hxxp://evil[.]com", { urlColon: "[:]" }), "hxxp[:]//evil[.]com");
});

t("refang strict vs everything", () => {
  assert.equal(refang("hxxps://evil[.]com/x and evil(dot)net and a[@]b[.]org"), "https://evil.com/x and evil.net and a@b.org");
  assert.equal(refang("The regex (.) matches any char; ask (at) the desk."), "The regex (.) matches any char; ask (at) the desk.");
  assert.equal(refang("The regex (.) matches", "everything"), "The regex . matches");
  assert.equal(refang("evil[.]zip"), "evil.zip");
});

t("line by line, surrounding text kept", () => {
  const input = "first line\n  indent 192.0.2.5;\r\nlast evil.com";
  assert.equal(defang(input), "first line\n  indent 192[.]0[.]2[.]5;\r\nlast evil[.]com");
  const r = transform(input, { direction: "defang", scope: "strict", style: DEFAULT_STYLE });
  assert.ok(r.ok);
  assert.equal(r.lines, 3);
  assert.equal(r.changeCount, 2);
  assert.deepEqual(r.changes.map((c) => [c.line, c.kind]), [[2, "ipv4"], [3, "domain"]]);
});

t("lossless round trip", () => {
  const input = [
    "Seen: https://login.example.com/Auth?next=http://x.example.net/ and HTTP://UPPER.EXAMPLE.ORG/",
    "mail j.doe+tag@example.co.uk, v6 [2001:db8::42]:443, ip 203.0.113.77, name setup.py, 1.2.3",
    "already hxxp://evil[.]com and plain prose. The end.",
  ].join("\n");
  const styles: Partial<DefangStyle>[] = [
    {},
    { scheme: "hXXp", dot: "[dot]", urlColon: "[:]", at: "[at]" },
    { scheme: "keep", dot: "(.)", dotScope: "last", urlColon: "[://]", at: "keep", ipv6Colon: false },
  ];
  for (const style of styles) {
    for (const scope of ["strict", "everything"] as const) {
      const out = defang(input, style, scope);
      assert.equal(firstDifferentLine(refangAll(out), refangAll(input)), null, `${JSON.stringify(style)} ${scope}`);
    }
  }
});

/* adversarial and limits */
t("empty and huge", () => {
  const r = transform("", { direction: "defang", scope: "strict", style: DEFAULT_STYLE });
  assert.ok(r.ok && r.output === "" && r.changeCount === 0);
  const big = transform("a".repeat(MAX_INPUT_CHARS + 1), { direction: "defang", scope: "strict", style: DEFAULT_STYLE });
  assert.equal(big.ok, false);
});

t("linear time on adversarial runs", () => {
  const cases = [
    "a".repeat(400_000),
    "a.".repeat(200_000),
    ":".repeat(400_000),
    "1.".repeat(200_000),
    "[".repeat(400_000),
    "@".repeat(200_000) + "a",
    "http://".repeat(50_000),
    "a@".repeat(200_000),
    "hxxp".repeat(100_000),
    `${"http://[".repeat(500).slice(0, 4000)} `.repeat(240),
    `${"ws://a.com?".repeat(400).slice(0, 4000)} `.repeat(240),
    `${"https://x.com/?u=http://y.com/".repeat(140).slice(0, 4000)} `.repeat(240),
  ];
  for (const c of cases) {
    // CPU time, not wall time: other processes on a busy machine would otherwise fail this.
    const u0 = process.cpuUsage();
    transform(c, { direction: "defang", scope: "everything", style: DEFAULT_STYLE });
    transform(c, { direction: "refang", scope: "strict", style: DEFAULT_STYLE });
    const u = process.cpuUsage(u0);
    const ms = (u.user + u.system) / 1000;
    assert.ok(ms < 3000, `${c.slice(0, 12)} took ${ms}ms of CPU`);
  }
});

t("first different line", () => {
  assert.equal(firstDifferentLine("a\nb", "a\nb"), null);
  assert.equal(firstDifferentLine("a\nb", "a\nc"), 2);
  assert.equal(firstDifferentLine("a", "a\n"), 2);
});

/* neighbors, ranges, and the IANA list */
t("non-ascii letters glued to a candidate", () => {
  const vals = (s: string) => findNetworkIndicators(s).matches.map((m) => `${m.type}:${m.value}`);
  // The ASCII remainder of an internationalized name is a different host.
  assert.deepEqual(vals("b\u00fccher.de and caf\u00e9.fr and host\u00e9.example.org"), []);
  assert.deepEqual(vals("na\u00efve@example.com"), ["domain:example.com"]);
  assert.deepEqual(vals("\u00fc.evil.com"), []);
  // Han, Kana and Hangul run into the text beside them without spaces.
  assert.deepEqual(vals("\u5730\u5740198.51.100.1\u3002"), ["ipv4:198.51.100.1"]);
  assert.deepEqual(vals("\u65e5\u672c\u8a9eevil.com\u3067"), ["domain:evil.com"]);
  assert.deepEqual(vals("\ud55c\uad6dmail@example.org\uc5d0\uc11c"), ["email:mail@example.org", "domain:example.org"].slice(0, 1));
  // A letter outside the BMP is one code point, not two surrogate halves.
  assert.deepEqual(vals("\ud835\udc9cevil.com"), []);
  // Typographic punctuation is not a letter, so it ends the indicator cleanly.
  assert.deepEqual(vals("\u201cevil.com\u201d and evil.org\u2019s"), ["domain:evil.com", "domain:evil.org"]);
  const r = transform("b\u00fccher.de and x.example.com", { direction: "defang", scope: "strict", style: DEFAULT_STYLE });
  assert.ok(r.ok);
  assert.equal(r.output, "b\u00fccher.de and x[.]example[.]com");
});

t("email addresses compare case-insensitively", () => {
  const m = findNetworkIndicators("Bob.Smith@Example.COM").matches[0];
  assert.equal(m.value, "bob.smith@example.com");
  // The text as written is kept when converting.
  assert.equal(defang("Bob.Smith@Example.COM"), "Bob.Smith[@]Example[.]COM");
});

t("address ranges read as two addresses", () => {
  const vals = (s: string) => findNetworkIndicators(s).matches.map((m) => `${m.type}:${m.value}@${m.start}`);
  assert.deepEqual(vals("198.51.100.1-198.51.100.20"), ["ipv4:198.51.100.1@0", "ipv4:198.51.100.20@13"]);
  assert.deepEqual(vals("range 10.0.0.1-10.0.0.9, ok"), ["ipv4:10.0.0.1@6", "ipv4:10.0.0.9@15"]);
  assert.equal(defang("scan 198.51.100.1-198.51.100.20 now"), "scan 198[.]51[.]100[.]1-198[.]51[.]100[.]20 now");
  // A valid host name that contains an address is still one domain.
  assert.deepEqual(vals("ip-1.2.3.4.nip.io"), ["domain:ip-1.2.3.4.nip.io@0"]);
  assert.deepEqual(vals("a-b.c-d"), []);
});

t("embedded TLD list equals the IANA file when it is on disk", () => {
  let text: string;
  try {
    text = readFileSync(new URL("./fixtures/iana-tlds.txt", import.meta.url).pathname, "utf8");
  } catch {
    return;
  }
  const iana = text.split("\n").filter((l) => l !== "" && !l.startsWith("#")).map((l) => l.trim().toLowerCase());
  assert.deepEqual(iana.filter((x) => !TLDS.has(x)), []);
  assert.deepEqual([...TLDS].filter((x) => !iana.includes(x)), []);
  assert.ok(text.startsWith(`# Version ${TLD_LIST_VERSION}`), "version comment matches the file");
});


/* ===== Independent verifier additions ===== */

t("verifier: a scheme after an underscore defangs and refangs (was lost with a plain word boundary)", () => {
  assert.equal(defang("see _https://evil.example.com/p now"), "see _hxxps://evil[.]example[.]com/p now");
  assert.equal(refang("see _hxxps://evil[.]example[.]com/p now"), "see _https://evil.example.com/p now");
  assert.equal(refangAll("_hxxp://a[.]b"), "_http://a.b");
  assert.equal(refangAll("x_hXXps[:]//a"), "x_https://a");
  // a scheme glued to letters, digits or + . - is not a scheme, and stays as written
  assert.equal(refangAll("xhxxp://a hxxp-hxxp://a 1hxxp://a"), "xhxxp://a hxxp-hxxp://a 1hxxp://a");
  // and the word on its own, with no colon after it, is prose
  assert.equal(refangAll("the hxxp scheme and fxp"), "the hxxp scheme and fxp");
});

t("verifier: the colon before a port is refanged after a bare host (was left as [:])", () => {
  assert.equal(refang("evil[.]com[:]8080 and 198[.]51[.]100[.]23[:]443."), "evil.com:8080 and 198.51.100.23:443.");
  assert.equal(refang("c2: 198[.]51[.]100[.]23(:)8443, x[.]example[.]org{:}80/path"), "c2: 198.51.100.23:8443, x.example.org:80/path");
  // not a port: six digits, letters after the digits, a following name
  assert.equal(refang("evil[.]com[:]123456"), "evil.com[:]123456");
  assert.equal(refang("evil[.]com[:]80abc"), "evil.com[:]80abc");
  assert.equal(refang("evil[.]com[:]80.b[.]org"), "evil.com[:]80.b.org");
  // URLs already handled it, and refang is idempotent
  assert.equal(refang("hxxp://evil[.]com[:]8080/x"), "http://evil.com:8080/x");
  assert.equal(refang(refang("evil[.]com[:]8080")), "evil.com:8080");
  // defanging leaves the port alone and still refangs to the same text
  assert.equal(defang("evil.com:8080 198.51.100.23:443"), "evil[.]com:8080 198[.]51[.]100[.]23:443");
});

t("verifier: URL user names are defanged too (http://paypal.com@evil.example/)", () => {
  assert.equal(defang("http://paypal.com@evil.example/x"), "hxxp://paypal[.]com[@]evil[.]example/x");
  assert.equal(defang("http://u.s:p.w@h.example.com:81/"), "hxxp://u[.]s:p[.]w[@]h[.]example[.]com:81/");
  assert.equal(defang("http://a.example/r?next=http://paypal.com@evil.example/"), "hxxp://a[.]example/r?next=hxxp://paypal[.]com[@]evil[.]example/");
  assert.equal(defang("http://paypal.com@evil.example/", { dot: "(.)", at: "[at]" }), "hxxp://paypal(.)com[at]evil(.)example/");
  assert.equal(refang("hxxp://paypal[.]com[@]evil[.]example/x"), "http://paypal.com@evil.example/x");
  assert.equal(refangAll(defang("http://paypal.com@evil.example/x")), "http://paypal.com@evil.example/x");
});

t("verifier: everything mode also breaks dots and @ inside URLs and email local parts", () => {
  assert.equal(
    defang("http://x.example/a.php?b=c.d&mail=e@f.com", {}, "everything"),
    "hxxp://x[.]example/a[.]php?b=c[.]d&mail=e[@]f[.]com",
  );
  assert.equal(defang("first.last@example.com", {}, "everything"), "first[.]last[@]example[.]com");
  // strict mode keeps the path readable
  assert.equal(defang("http://x.example/a.php?b=c.d", {}, "strict"), "hxxp://x[.]example/a.php?b=c.d");
  // never double wraps an @ that is already defanged
  assert.equal(defang("hxxp://u[@]h[.]example/", {}, "everything"), "hxxp://u[@]h[.]example/");
  assert.ok(!defang("http://paypal.com@evil.example/", {}, "everything").includes("[["));
  // still reversible
  const input = "http://x.example/a.php?b=c.d&mail=e@f.com first.last@example.com";
  assert.equal(refangAll(defang(input, {}, "everything")), input);
});

t("verifier: documented examples of every default style", () => {
  assert.equal(defang("https://login.example.com/reset?u=admin"), "hxxps://login[.]example[.]com/reset?u=admin");
  assert.equal(defang("http://198.51.100.23:8080/a.bin"), "hxxp://198[.]51[.]100[.]23:8080/a.bin");
  assert.equal(defang("billing@example.org"), "billing[@]example[.]org");
  assert.equal(defang("2001:db8::bad:1"), "2001[:]db8[:][:]bad[:]1");
  assert.equal(defang("cdn.example.net"), "cdn[.]example[.]net");
  assert.equal(defang("ftp://f.example.com/x"), "fxp://f[.]example[.]com/x");
  assert.equal(defang("http://[2001:db8::1]:8080/p"), "hxxp://[2001[:]db8[:][:]1]:8080/p");
  assert.equal(defang("a.example.com", { dot: "[dot]" }), "a[dot]example[dot]com");
  assert.equal(defang("a.example.com", { dot: "(.)" }), "a(.)example(.)com");
  assert.equal(defang("a.b.example.com", { dotScope: "last" }), "a.b.example[.]com");
  assert.equal(defang("https://a.example.com/", { scheme: "hXXp", urlColon: "[:]" }), "hXXps[:]//a[.]example[.]com/");
  assert.equal(defang("https://a.example.com/", { scheme: "keep", urlColon: "[://]" }), "https[://]a[.]example[.]com/");
  assert.equal(defang("HTTPS://A.EXAMPLE.COM/", {}), "HXXPS://A[.]EXAMPLE[.]COM/");
  assert.equal(defang("b@x.example.com", { at: "[at]" }), "b[at]x[.]example[.]com");
  assert.equal(defang("b@x.example.com", { at: "keep" }), "b@x[.]example[.]com");
  assert.equal(defang("2001:db8::1", { ipv6Colon: false }), "2001:db8::1");
});

t("verifier: refang reads every documented spelling to one live form", () => {
  const cases: [string, string][] = [
    ["hxxp://a[.]example[.]com", "http://a.example.com"],
    ["hXXps://a(.)example(.)com", "https://a.example.com"],
    ["HXXP://a{.}example{.}com", "HTTP://a.example.com"],
    ["fxp://a[dot]example[dot]com", "ftp://a.example.com"],
    ["fxps://a(dot)example{dot}com", "ftps://a.example.com"],
    ["a\\.example\\.com", "a.example.com"],
    ["hxxp[:]//a[.]example[.]com", "http://a.example.com"],
    ["hxxp[://]a[.]example[.]com", "http://a.example.com"],
    ["hxxp(:)//a[.]example[.]com", "http://a.example.com"],
    ["hxxp://a[.]example[.]com[/]x", "http://a.example.com/x"],
    ["bob[@]example[.]com", "bob@example.com"],
    ["bob(@)example(.)com", "bob@example.com"],
    ["bob[at]example[dot]com", "bob@example.com"],
    ["bob{at}example{dot}com", "bob@example.com"],
    ["198[.]51[.]100[.]23", "198.51.100.23"],
    ["2001[:]db8[:][:]1", "2001:db8::1"],
    ["[2001[:]db8[:][:]1]", "[2001:db8::1]"],
    ["HXXPS[:]//EVIL[.]COM", "HTTPS://EVIL.COM"],
  ];
  for (const [from, to] of cases) assert.equal(refang(from), to, from);
});

t("verifier: strict mode leaves prose, versions, regexes, file names and abbreviations alone", () => {
  const prose =
    "See section 2.1 and v2.0.1 or Python 3.11.4. Use e.g. this, i.e. that. Open report.pdf, node.js, a.exe. Regex (.) and phrase (at) noon, [at] six, a{dot}b. Visit us at 5 p.m. U.S. Ph.D.";
  assert.equal(defang(prose), prose);
  assert.equal(refang(prose), prose);
  assert.equal(transform(prose, { direction: "defang", scope: "strict", style: S() }).ok, true);
  const r = transform(prose, { direction: "defang", scope: "strict", style: S() });
  assert.ok(r.ok && r.changeCount === 0);
});

t("verifier: surrounding text, punctuation, CRLF, tabs and blank lines are preserved byte for byte", () => {
  const input = "a\tb http://x.example.com/p, (c.example.net)\r\n\r\n  trailing  \n\nlast.example.org";
  const out = defang(input);
  assert.equal(out, "a\tb hxxp://x[.]example[.]com/p, (c[.]example[.]net)\r\n\r\n  trailing  \n\nlast[.]example[.]org");
  assert.equal(refang(out), input);
  const r = transform(input, { direction: "defang", scope: "strict", style: S() });
  assert.ok(r.ok);
  assert.equal(r.lines, 5);
  assert.deepEqual(r.changes.map((c) => c.line), [1, 1, 5]);
});

t("verifier: ordering and de-overlap when indicators touch each other", () => {
  assert.equal(defang("a.example.com,b.example.net;c.example.org"), "a[.]example[.]com,b[.]example[.]net;c[.]example[.]org");
  assert.equal(defang("http://a.example.com/x?u=b.example.net"), "hxxp://a[.]example[.]com/x?u=b.example.net");
  assert.equal(defang("bob@example.com/http://x.example.org"), "bob[@]example[.]com/hxxp://x[.]example[.]org");
});

t("verifier: idempotence and losslessness over seeded random mixes of every style and scope", () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const frags = [
    "http://", "https://", "hxxp://", "hxxps[:]//", "ftp://", "evil.com", "a.b.example.org", "198.51.100.23", "2001:db8::1", "::1",
    "user@example.com", "/p/a.php", "?q=1&u=http://i.example.com/x", ":8080", "[:]443", " ", "\n", ", ", ". ", "(", ")", "report.pdf", "setup.py", "e.g.", "1.2.3.4",
    "[.]", "(.)", "[dot]", "[@]", "[at]", "[:]", "{.}", "\\.", "hxxp", "é", "地址", "_", "-", "%2F", "@", ".",
  ];
  const styles: DefangStyle[] = [
    S(),
    S({ scheme: "hXXp", dot: "(.)", urlColon: "[:]", at: "[at]", ipv6Colon: false }),
    S({ scheme: "keep", dot: "[dot]", dotScope: "last", urlColon: "[://]", at: "keep" }),
  ];
  for (let n = 0; n < 1500; n++) {
    let input = "";
    for (let k = 1 + Math.floor(rnd() * 12); k > 0; k--) input += frags[Math.floor(rnd() * frags.length)];
    if (refangAll(refangAll(input)) !== refangAll(input)) continue; // nested defang tokens are ambiguous
    for (const style of styles) {
      for (const scope of ["strict", "everything"] as const) {
        const d = defang(input, style, scope);
        assert.equal(defang(d, style, scope), d, `defang idempotent: ${JSON.stringify(input)} [${scope}]`);
        assert.equal(refangAll(d), refangAll(input), `lossless: ${JSON.stringify(input)} -> ${JSON.stringify(d)} [${scope}]`);
        const f = refang(input, scope);
        assert.equal(refang(f, scope), f, `refang idempotent: ${JSON.stringify(input)} [${scope}]`);
        if (scope === "everything") assert.equal(f, refangAll(input));
      }
    }
  }
});

t("verifier: the matcher reads the same indicators from live, defanged and refanged text (seeded)", () => {
  let seed = 777;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const frags = [
    "http://", "https://", "evil.com", "a.b.example.org", "198.51.100.23", "10.0.0.1", "2001:db8::1", "user@example.com", "/p", "?q=1&u=http://i.example.com/x",
    ":8080", " ", "\n", ", ", ". ", "(", ")", "report.pdf", "e.g.", "1.2.3.4", "_", "é",
  ];
  const keys = (text: string) =>
    findNetworkIndicators(text, { keepAmbiguous: true }).matches.map((m) => `${m.type}:${m.value}:${m.nested}`).sort();
  for (let n = 0; n < 800; n++) {
    let input = "";
    for (let k = 1 + Math.floor(rnd() * 10); k > 0; k--) input += frags[Math.floor(rnd() * frags.length)];
    const base = keys(input);
    assert.deepEqual(keys(defang(input, {}, "strict", true)), base, `defanged: ${JSON.stringify(input)}`);
    assert.deepEqual(keys(defang(input, { dot: "[dot]", at: "[at]", scheme: "hXXp", urlColon: "[://]" }, "strict", true)), base, `defanged B: ${JSON.stringify(input)}`);
    assert.deepEqual(keys(refang(input)), base, `refanged: ${JSON.stringify(input)}`);
  }
});

t("verifier: IPv6 parse and RFC 5952 format against published forms", () => {
  const cases: [string, string][] = [
    ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"], // RFC 5952 style
    ["2001:db8:0:0:0:0:2:1", "2001:db8::2:1"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
    ["2001:0:0:1:0:0:0:1", "2001:0:0:1::1"],
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"],
    ["0:0:0:0:0:0:0:0", "::"],
    ["0:0:0:0:0:0:0:1", "::1"],
    ["1:0:0:0:0:0:0:0", "1::"],
    ["ABCD:EF01:2345:6789:ABCD:EF01:2345:6789", "abcd:ef01:2345:6789:abcd:ef01:2345:6789"],
    ["::ffff:192.0.2.128", "::ffff:192.0.2.128"],
    ["::ffff:c000:280", "::ffff:192.0.2.128"],
    ["64:ff9b::192.0.2.33", "64:ff9b::c000:221"], // RFC 6052 example, written in hex groups
    ["fe80::1", "fe80::1"],
    ["1:2:3:4:5:6:7::", "1:2:3:4:5:6:7:0"], // :: standing for a single group
  ];
  for (const [input, want] of cases) {
    const v = parseIPv6(input);
    assert.ok(v !== null, input);
    assert.equal(formatIPv6(v), want, input);
  }
  assert.equal(parseIPv6("::")!, 0n);
  assert.equal(parseIPv6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")!, (1n << 128n) - 1n);
  assert.equal(parseIPv6("2001:db8::1")!, 0x20010db8000000000000000000000001n);
  for (const bad of ["", ":", ":::", "1::2::3", "12345::", "g::1", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7", "::1:2:3:4:5:6:7:8", "1.2.3.4::", "::1.2.3", "::1.2.3.256", "1:2:3:4:5:6:1.2.3.4:5", "2001:db8:::1", " ::1", "::1 "]) {
    assert.equal(parseIPv6(bad), null, JSON.stringify(bad));
  }
});

t("verifier: IPv4 parse strictness", () => {
  assert.deepEqual(parseIPv4("0.0.0.0"), [0, 0, 0, 0]);
  assert.deepEqual(parseIPv4("255.255.255.255"), [255, 255, 255, 255]);
  for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.256", "01.2.3.4", "1.2.3.04", "1.2.3.-4", "1..3.4", "a.b.c.d", "1.2.3.4 ", "0x7f.0.0.1", "1.2.3.1e1"]) {
    assert.equal(parseIPv4(bad), null, JSON.stringify(bad));
  }
});

t("verifier: TLD list contains known entries and no file extensions", () => {
  for (const tld of ["com", "net", "org", "uk", "de", "xyz", "museum", "xn--p1ai", "xn--fiqs8s", "zip", "mov", "py", "sh", "io", "ai", "app", "dev", "onion"].filter((x) => x !== "onion")) {
    assert.ok(TLDS.has(tld), tld);
  }
  for (const ext of ["pdf", "js", "exe", "dll", "txt", "html", "php", "doc", "docx", "xls", "jpg", "png", "gif", "bin", "tmp", "log", "json", "xml", "csv", "sql", "bat", "ps1", "ts", "tsx", "rb", "local", "internal", "corp", "lan", "invalid", "localhost", "example", "test", "onion"]) {
    assert.ok(!TLDS.has(ext), ext);
  }
  assert.ok(AMBIGUOUS_TLDS.has("py") && AMBIGUOUS_TLDS.has("zip") && AMBIGUOUS_TLDS.has("sh") && AMBIGUOUS_TLDS.has("md"));
  assert.ok(!AMBIGUOUS_TLDS.has("com"));
  assert.equal(TLDS.size, 1436);
});

t("verifier: parseUrl and checkDomain edge cases", () => {
  assert.equal(parseUrl("http://"), null);
  assert.equal(parseUrl("http:///x"), null);
  assert.equal(parseUrl("://a.com"), null);
  assert.equal(parseUrl("gopher://a.com"), null);
  assert.equal(parseUrl("http://a.com:abc/"), null);
  assert.equal(parseUrl("http://a.com:123456/"), null);
  assert.equal(parseUrl("http://[::1"), null);
  assert.equal(parseUrl("http://[zz::1]/"), null);
  assert.equal(parseUrl("http://a,b.com/"), null);
  const p = parseUrl("HTTPS://User:Pw@Sub.Example.COM:8443/P?Q#F");
  assert.ok(p);
  assert.deepEqual([p.scheme, p.userinfo, p.host, p.hostKind, p.hostValue, p.rest], ["HTTPS", "User:Pw", "Sub.Example.COM", "domain", "sub.example.com", ":8443/P?Q#F"]);
  assert.equal(parseUrl("http://localhost:3000/")!.hostKind, "name");
  assert.equal(parseUrl("http://10.1.2.3/")!.hostKind, "ipv4");
  assert.equal(parseUrl("http://[2001:0DB8::1%25eth0]/")!.hostValue, "2001:db8::1");
  assert.deepEqual(checkDomain("Example.COM."), { ok: true, name: "example.com", tld: "com", ambiguous: false });
  assert.deepEqual(checkDomain("a.py"), { ok: true, name: "a.py", tld: "py", ambiguous: true });
  assert.equal(checkDomain("com").ok, false);
  assert.equal(checkDomain("a..com").ok, false);
  assert.equal(checkDomain(`${"a".repeat(64)}.com`).ok, false);
  assert.equal(checkDomain(`${"a.".repeat(127)}com`).ok, false, "over 253 characters");
});

t("verifier: input cap error is friendly, empty and whitespace-only input are fine", () => {
  const big = transform("x".repeat(MAX_INPUT_CHARS + 1), { direction: "defang", scope: "strict", style: S() });
  assert.equal(big.ok, false);
  if (!big.ok) assert.match(big.error, /1,000,001 characters.*1,000,000/);
  for (const text of ["", " ", "\n\n", "\t \r\n"]) {
    for (const direction of ["defang", "refang"] as const) {
      for (const scope of ["strict", "everything"] as const) {
        const r = transform(text, { direction, scope, style: S() });
        assert.ok(r.ok);
        if (r.ok) {
          assert.equal(r.output, text);
          assert.equal(r.changeCount, 0);
        }
      }
    }
  }
  const atCap = transform("a.example.com ".repeat(Math.floor(MAX_INPUT_CHARS / 14)), { direction: "defang", scope: "strict", style: S() });
  assert.ok(atCap.ok);
  if (atCap.ok) {
    assert.equal(atCap.changes.length, 200, "itemized list is capped");
    assert.ok(atCap.changeCount > 200, "but every change is counted");
  }
});

t("verifier: a 1 MB paste of adversarial shapes finishes quickly in every mode", () => {
  const shapes = ["a.", "http://[", "a@", "1:", "::", "http://a.com/", "[.]", "a\\.", "C:\\a\\.b", "_http://a.com_", "%2F", "hxxp:", "1.1.1.1-", "[at]a.com", "http://a@b@"];
  for (const unit of shapes) {
    const text = unit.repeat(Math.ceil(1_000_000 / unit.length)).slice(0, 1_000_000);
    for (const direction of ["defang", "refang"] as const) {
      for (const scope of ["strict", "everything"] as const) {
        const t0 = process.cpuUsage();
        const r = transform(text, { direction, scope, style: S() });
        const d = process.cpuUsage(t0);
        assert.ok(r.ok);
        assert.ok((d.user + d.system) / 1000 < 4000, `${unit} ${direction}/${scope} took ${(d.user + d.system) / 1000} ms CPU`);
      }
    }
  }
});


t("verifier: backslash-dot is a defang in a bare name but not a hidden folder in a Windows path", () => {
  assert.equal(refang("evil\\.com a\\.b\\.example\\.org"), "evil.com a.b.example.org");
  assert.equal(defang("evil\\.com"), "evil[.]com");
  const paths = ["C:\\Users\\bob\\.aws\\credentials", "%USERPROFILE%\\.azure\\tokens.json", "D:\\work\\.dev\\x", "C:\\repo\\.git\\config"];
  for (const p of paths) {
    assert.equal(refang(p), p, p);
    assert.equal(defang(p), p, p);
    assert.equal(refang(p, "everything"), p, p);
    assert.equal(refangAll(p), p, p);
  }
  // a path and a defanged name on one line: only the name changes
  assert.equal(refang("C:\\Users\\bob\\.aws\\credentials then evil\\.com"), "C:\\Users\\bob\\.aws\\credentials then evil.com");
  assert.equal(refang("see  C:\\Users\\bob\\.aws  and a\\.example\\.org"), "see  C:\\Users\\bob\\.aws  and a.example.org");
});

t("verifier: Markdown emphasis underscores around a URL are not part of it", () => {
  const found = (text: string) => findNetworkIndicators(text).matches.filter((m) => m.type === "url").map((m) => m.value);
  assert.deepEqual(found("_http://a.example.com_ and __http://b.example.com/x__"), ["http://a.example.com", "http://b.example.com/x"]);
  assert.deepEqual(found("http://a.example.com/x_ and http://a.example.com/_x_"), ["http://a.example.com/x_", "http://a.example.com/_x_"]);
  assert.equal(defang("_http://a.example.com_"), "_hxxp://a[.]example[.]com_");
});

console.log(`defang-refang: ${passed} test groups passed`);
