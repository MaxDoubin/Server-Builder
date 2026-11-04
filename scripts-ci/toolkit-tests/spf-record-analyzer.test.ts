import assert from "node:assert/strict";
import {
  analyzeSpf,
  analyzeSpfInput,
  checkMacroString,
  extractTxtRecords,
  formatIpv6,
  lookupTotal,
  parseIpv4,
  parseIpv6,
  parseTerm,
  sortFindings,
  LOOKUP_LIMIT,
  MAX_INPUT_CHARS,
} from "../../client/src/lib/toolkit/spf-record-analyzer";

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
const has = (findings: { tone: string; text: string }[], tone: string, re: RegExp) =>
  findings.some((f) => f.tone === tone && re.test(f.text));

/* ---------------- IPv4 per the qnum rule (RFC 7208 section 12) */
test("ipv4 valid", () => {
  const r = parseIpv4("192.0.2.10");
  assert.ok(r.ok && r.value === 0xc000020an);
  const z = parseIpv4("0.0.0.0");
  assert.ok(z.ok && z.value === 0n);
  const m = parseIpv4("255.255.255.255");
  assert.ok(m.ok && m.value === 0xffffffffn);
});
test("ipv4 rejects leading zeros, shortened, out of range", () => {
  assert.equal(parseIpv4("192.168.01.1").ok, false);
  const s = parseIpv4("192.0.2");
  assert.ok(!s.ok && /shortened/.test(s.error));
  assert.equal(parseIpv4("256.1.1.1").ok, false);
  assert.equal(parseIpv4("1.2.3.4.5").ok, false);
  assert.equal(parseIpv4("1.2.3.x").ok, false);
  assert.equal(parseIpv4("").ok, false);
  assert.equal(parseIpv4("1.2.3.0004").ok, false);
});

/* ---------------- IPv6 per RFC 4291 section 2.2, output per RFC 5952 */
test("ipv6 forms", () => {
  const cases: [string, string][] = [
    ["2001:db8::cd30", "2001:db8::cd30"], // RFC 7208 grammar example
    ["2001:0DB8:0000:0000:0008:0800:200C:417A", "2001:db8::8:800:200c:417a"], // RFC 4291 2.2
    ["::", "::"],
    ["::1", "::1"],
    ["::ffff:192.0.2.1", "::ffff:c000:201"],
    ["::13.1.68.3", "::d01:4403"], // RFC 4291 2.2 example
    ["FFFF:0:0:0:0:0:129.144.52.38".replace("FFFF:0:0:0:0:0", "0:0:0:0:0:FFFF"), "::ffff:8190:3426"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"], // RFC 5952 4.2.3: first longest run
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"], // RFC 5952 4.2.2: single 0 not compressed
    ["1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8"],
    ["1:2:3:4:5:6:1.2.3.4", "1:2:3:4:5:6:102:304"],
  ];
  for (const [input, want] of cases) {
    const r = parseIpv6(input);
    assert.ok(r.ok, `${input} should parse`);
    if (r.ok) assert.equal(formatIpv6(r.value), want, input);
  }
});
test("ipv6 rejects", () => {
  for (const bad of ["1::2::3", ":1::2", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7", "12345::", "fe80::1%eth0", "1:2:3:4:5:6:7:1.2.3.4", "::1.2.3", "g::1", ":::"]) {
    assert.equal(parseIpv6(bad).ok, false, bad);
  }
});

/* ---------------- macro strings and domain-end (section 7, 12) */
test("domain specs", () => {
  assert.equal(checkMacroString("_spf.google.com", true).error, null);
  assert.equal(checkMacroString("example.com.", true).error, null);
  assert.equal(checkMacroString("%{i}._spf.%{d}", true).error, null);
  assert.equal(checkMacroString("%{ir}.%{v}._spf.%{d2}", true).error, null); // RFC 7208 7.4 style
  assert.equal(checkMacroString("%{l1r-}.example.com", true).error, null);
  assert.equal(checkMacroString("xn--p1ai.xn--p1ai", true).error, null); // hyphenated toplabel
  assert.match(checkMacroString("localhost", true).error ?? "", /no dot/);
  assert.match(checkMacroString("192.0.2.1", true).error ?? "", /all-numeric/);
  assert.match(checkMacroString("%{c}.example.com", true).error ?? "", /explanation text/); // 7.2
  assert.match(checkMacroString("%{x}.example.com", true).error ?? "", /not a macro letter/);
  assert.match(checkMacroString("%{d0}.example.com", true).error ?? "", /nonzero/); // 7.3
  assert.match(checkMacroString("50%.example.com", true).error ?? "", /does not start a macro/);
  assert.match(checkMacroString("%{d.example.com", true).error ?? "", /never closes/);
  assert.match(checkMacroString("example.-com", true).error ?? "", /top-level label/);
  assert.equal(checkMacroString("%%.example.com", true).error, null);
  assert.equal(checkMacroString("example..com", true).error, null);
  assert.match(checkMacroString("example..com", true).warning ?? "", /empty label/);
  assert.equal(checkMacroString("", false).error, null); // unknown modifier value may be empty
});

/* ---------------- term parsing */
test("mechanisms and qualifiers", () => {
  const t = parseTerm("-ip4:192.0.2.0/24", 1);
  assert.equal(t.kind, "mechanism");
  assert.equal(t.qualifier, "-");
  assert.equal(t.network, "192.0.2.0/24");
  const a = parseTerm("a:mail.example.com/24//64", 1);
  assert.equal(a.target, "mail.example.com");
  assert.equal(a.ip4Cidr, 24);
  assert.equal(a.ip6Cidr, 64);
  const a2 = parseTerm("a//64", 1);
  assert.equal(a2.error, null);
  assert.equal(a2.ip6Cidr, 64);
  assert.equal(a2.ip4Cidr, null);
  const mx = parseTerm("MX/30", 1);
  assert.equal(mx.name, "mx");
  assert.equal(mx.ip4Cidr, 30);
  assert.equal(parseTerm("ip6:2001:db8::/32", 1).network, "2001:db8::/32");
  assert.equal(parseTerm("ip4:192.0.2.1", 1).network, "192.0.2.1/32"); // default /32, section 5.6
  assert.equal(parseTerm("ip6:2001:db8::1", 1).network, "2001:db8::1/128"); // default /128
  assert.equal(parseTerm("?include:_spf.example.net", 1).qualifier, "?");
  assert.equal(parseTerm("~all", 1).qualifier, "~");
  assert.equal(parseTerm("all", 1).qualifier, "+");
  assert.equal(parseTerm("all", 1).explicitQualifier, false);
});
test("term errors", () => {
  assert.match(parseTerm("ipv4:192.0.2.1", 1).error ?? "", /ip4:/);
  assert.match(parseTerm("ip4:2001:db8::1", 1).error ?? "", /ip6:/);
  assert.match(parseTerm("ip6:192.0.2.1", 1).error ?? "", /ip4:/);
  assert.match(parseTerm("ip4:192.0.2.0/33", 1).error ?? "", /out of range/);
  assert.match(parseTerm("ip6:2001:db8::/129", 1).error ?? "", /out of range/);
  assert.match(parseTerm("ip4:192.0.2.0/024", 1).error ?? "", /leading zero/);
  assert.match(parseTerm("ip4:192.0.2.0/", 1).error ?? "", /no IPv4 prefix/);
  assert.match(parseTerm("a:example.com/", 1).error ?? "", /no IPv4 prefix/);
  assert.match(parseTerm("include", 1).error ?? "", /needs a domain/);
  assert.match(parseTerm("include:", 1).error ?? "", /needs a domain/);
  assert.match(parseTerm("include:example.com/24", 1).error ?? "", /prefix length/);
  assert.match(parseTerm("all:foo", 1).error ?? "", /no argument/);
  assert.match(parseTerm("ptr/24", 1).error ?? "", /prefix length/);
  assert.match(parseTerm("redirect:example.com", 1).error ?? "", /redirect=/);
  assert.match(parseTerm("-redirect=example.com", 1).error ?? "", /qualifier/);
  assert.match(parseTerm("+", 1).error ?? "", /no mechanism/);
  assert.match(parseTerm("inc:example.com", 1).error ?? "", /include:/);
  assert.match(parseTerm("a:", 1).error ?? "", /no domain/);
  assert.match(parseTerm("a=b", 1).kind, /modifier/); // a=b is an unknown modifier, valid grammar
  assert.equal(parseTerm("foo=bar", 1).error, null);
  assert.match(parseTerm("foo=%z", 1).error ?? "", /does not start a macro/);
});

/* ---------------- record analysis */
test("google workspace style", () => {
  const r = analyzeSpf("v=spf1 include:_spf.google.com ~all");
  assert.equal(r.errors.length, 0);
  assert.equal(r.lookupCount, 1);
  assert.equal(r.defaultResult, "softfail");
  assert.equal(r.nested.length, 1);
  assert.equal(r.nested[0].digCommand, "dig +short TXT _spf.google.com");
});
test("lookup counting, section 4.6.4", () => {
  // include, a, mx, ptr, exists, redirect count; ip4, ip6, all, exp do not.
  const r = analyzeSpf("v=spf1 ip4:192.0.2.0/24 ip6:2001:db8::/32 a mx ptr exists:%{i}.x.example include:a.example redirect=b.example exp=c.example");
  assert.equal(r.lookupCount, 6);
  assert.equal(r.lookupTermsPresent, 6);
  // With all present, redirect is ignored (6.1) and terms after all are unreached (5.1).
  const r2 = analyzeSpf("v=spf1 a mx -all include:late.example redirect=b.example");
  assert.equal(r2.lookupCount, 2);
  assert.equal(r2.lookupTermsPresent, 4);
  assert.equal(r2.terms[3].status, "unreached");
  assert.equal(r2.terms[4].status, "ignored");
  assert.ok(has(r2.findings, "warn", /after all/));
  assert.ok(has(r2.findings, "warn", /redirect=b.example is ignored/));
});
test("over the limit", () => {
  const terms = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.net`).join(" ");
  const r = analyzeSpf(`v=spf1 ${terms} -all`);
  assert.equal(r.lookupCount, 11);
  assert.ok(r.lookupCount > LOOKUP_LIMIT);
  assert.ok(has(r.findings, "danger", /limit is 10/));
  const ten = Array.from({ length: 10 }, (_, i) => `a:h${i}.example.net`).join(" ");
  assert.ok(has(analyzeSpf(`v=spf1 ${ten} -all`).findings, "warn", /whole budget/));
});
test("qualifier on all", () => {
  assert.ok(has(analyzeSpf("v=spf1 +all").findings, "danger", /\+all passes every host/));
  assert.ok(has(analyzeSpf("v=spf1 all").findings, "danger", /bare "all"/));
  assert.ok(has(analyzeSpf("v=spf1 a ?all").findings, "warn", /neutral/));
  assert.ok(has(analyzeSpf("v=spf1 a -all").findings, "ok", /-all/));
  const none = analyzeSpf("v=spf1 a mx");
  assert.equal(none.defaultResult, "neutral");
  assert.ok(has(none.findings, "warn", /no all and no redirect/));
  const red = analyzeSpf("v=spf1 a redirect=_spf.example.com");
  assert.equal(red.defaultResult, "whatever _spf.example.com returns");
  assert.equal(red.lookupCount, 2);
});
test("null sender record", () => {
  const r = analyzeSpf("v=spf1 -all");
  assert.equal(r.lookupCount, 0);
  assert.ok(has(r.findings, "ok", /never sends mail/));
  const empty = analyzeSpf("v=spf1");
  assert.ok(has(empty.findings, "warn", /no terms at all/));
  assert.ok(!has(empty.findings, "warn", /no all and no redirect/));
});
test("ptr, %{p}, include=, duplicates, v= modifier", () => {
  const r = analyzeSpf("v=spf1 ptr exists:%{p}.x.example include=_spf.example.net v=spf1 a a -all");
  assert.equal(r.errors.length, 0);
  assert.ok(has(r.findings, "warn", /ptr/));
  assert.ok(has(r.findings, "warn", /%\{p\}/));
  assert.ok(has(r.findings, "danger", /unknown modifier named include/));
  assert.ok(has(r.findings, "warn", /second version tag/));
  assert.ok(has(r.findings, "warn", /"a" appears 2 times/));
});
test("syntax errors make permerror", () => {
  const r = analyzeSpf("v=spf1 ip4:192.0.2.300 ipv4:198.51.100.0/24 -all");
  assert.equal(r.errors.length, 2);
  assert.equal(r.defaultResult, "permerror");
  assert.ok(has(r.findings, "danger", /2 syntax errors/));
  const dupe = analyzeSpf("v=spf1 a redirect=a.example redirect=b.example");
  assert.ok(dupe.errors.some((e) => /appears 2 times/.test(e)));
});
test("whitespace that is not a space", () => {
  const tab = analyzeSpf("v=spf1 a\tmx -all");
  assert.ok(tab.errors.some((e) => /a tab at character 9/.test(e)));
  const nbsp = analyzeSpf("v=spf1 a -all");
  assert.ok(nbsp.errors.some((e) => /non-breaking space/.test(e)));
  // Splitting still continues, so the terms are analyzed.
  assert.equal(nbsp.terms.length, 2);
});
test("ip ranges", () => {
  assert.ok(has(analyzeSpf("v=spf1 ip4:0.0.0.0/0 -all").findings, "danger", /every IPv4 address/));
  assert.ok(!has(analyzeSpf("v=spf1 -ip4:0.0.0.0/0 a -all").findings, "danger", /every IPv4/));
  assert.ok(has(analyzeSpf("v=spf1 ip4:10.0.0.0/8 -all").findings, "danger", /16,777,216/));
  assert.ok(has(analyzeSpf("v=spf1 ip4:40.92.0.0/15 -all").findings, "info", /131,072/));
  assert.ok(has(analyzeSpf("v=spf1 ip4:192.168.1.0/24 -all").findings, "info", /RFC 1918/));
  assert.ok(has(analyzeSpf("v=spf1 ip4:192.0.2.77/24 -all").findings, "info", /host bits set past \/24.*192\.0\.2\.0\/24/));
  assert.ok(has(analyzeSpf("v=spf1 ip6:::/0 -all").findings, "danger", /every IPv6/));
});
test("exists and void lookups", () => {
  const r = analyzeSpf("v=spf1 exists:%{i}.a.example exists:%{i}.b.example exists:%{i}.c.example -all");
  assert.ok(has(r.findings, "warn", /3 exists terms/));
  const v = analyzeSpf("v=spf1 a mx a:one.example.com -all");
  assert.ok(has(v.findings, "info", /empty or NXDOMAIN/));
});
test("self reference", () => {
  const r = analyzeSpf("v=spf1 include:Example.com. -all", "example.com");
  assert.ok(has(r.findings, "danger", /points back at example.com/));
});
test("record size guide", () => {
  const long = "v=spf1 " + Array.from({ length: 40 }, (_, i) => `ip4:198.51.100.${i}`).join(" ") + " -all";
  assert.ok(long.length > 450);
  assert.ok(has(analyzeSpf(long).findings, "warn", /under 450 octets/));
});
test("lookup total with nested counts", () => {
  const r = analyzeSpf("v=spf1 include:a.example include:b.example mx -all");
  assert.deepEqual(lookupTotal(r, {}), { total: 3, complete: false, missing: 2 });
  assert.deepEqual(lookupTotal(r, { 1: 4, 2: 4 }), { total: 11, complete: true, missing: 0 });
});

/* ---------------- TXT presentation format (RFC 1035 5.1, RFC 7208 3.3) */
test("quoted strings join without spaces", () => {
  const x = extractTxtRecords('example.com. 300 IN TXT "v=spf1 ip4:192.0.2.0/24 " "include:_spf.example.net -all"');
  assert.equal(x.records.length, 1);
  assert.equal(x.records[0].text, "v=spf1 ip4:192.0.2.0/24 include:_spf.example.net -all");
  assert.equal(x.records[0].owner, "example.com.");
  const esc = extractTxtRecords('"a\\"b\\\\c\\065"');
  assert.equal(esc.records[0].text, 'a"b\\cA');
  const bad = extractTxtRecords('"v=spf1 -all');
  assert.match(bad.records[0].error ?? "", /never closed/);
  const stray = extractTxtRecords('"v=spf1 a" -all');
  assert.match(stray.records[0].error ?? "", /outside the quotes/);
});
test("input level", () => {
  const two = analyzeSpfInput("v=spf1 a -all\nv=spf1 mx -all\ngoogle-site-verification=abc");
  assert.equal(two.kind, "ok");
  assert.equal(two.spf.length, 2);
  assert.ok(has(two.findings, "danger", /only one/));
  assert.ok(has(two.findings, "info", /One other TXT line/));
  const fused = analyzeSpfInput('"v=spf1 include:a.example" "-all"');
  assert.ok(has(fused.spf[0].analysis.findings, "warn", /no space between/));
  // "include:a.example-all" is valid grammar ("example-all" is a legal toplabel), so the
  // fused record silently loses its all, which is exactly the trap worth flagging.
  assert.equal(fused.spf[0].analysis.errors.length, 0);
  assert.equal(fused.spf[0].analysis.terms[0].target, "a.example-all");
  assert.ok(has(fused.spf[0].analysis.findings, "warn", /no all and no redirect/));
  assert.equal(analyzeSpfInput("").kind, "empty");
  assert.equal(analyzeSpfInput("   \n  ").kind, "empty");
  assert.match(analyzeSpfInput("v=spf1a -all").message ?? "", /followed by a space/);
  assert.match(analyzeSpfInput("spf2.0/pra a -all").message ?? "", /Sender ID/);
  assert.match(analyzeSpfInput("v=DMARC1; p=none").message ?? "", /DMARC record/);
  assert.match(analyzeSpfInput("hello").message ?? "", /No line starts/);
  assert.equal(analyzeSpfInput("x".repeat(MAX_INPUT_CHARS + 1)).kind, "error");
  const dig = analyzeSpfInput('example.org. 3600 IN TXT "v=spf1 include:example.org -all"');
  assert.equal(dig.ownerDomain, "example.org");
  assert.ok(has(dig.spf[0].analysis.findings, "danger", /points back/));
});
test("adversarial input does not throw", () => {
  const junk = [
    "v=spf1 " + "a ".repeat(5000),
    "v=spf1 %{",
    "v=spf1 ip6:" + ":".repeat(500),
    "v=spf1 ip4:" + "9".repeat(400),
    'v=spf1 "" """ \\',
    "v=spf1 a:" + "a".repeat(300) + ".com",
    "v=spf1 \u0000 ‮ include:x.example",
    "v=spf1 =",
    "v=spf1 ~",
    "v=spf1 a/99999999999999999999",
  ];
  for (const j of junk) {
    const r = analyzeSpfInput(j);
    assert.ok(r.kind === "ok" || r.kind === "error");
  }
  const big = analyzeSpf("v=spf1 " + "a ".repeat(5000));
  assert.equal(big.terms.length, 200);
  assert.ok(big.truncated);
});
test("sortFindings", () => {
  const s = sortFindings([
    { tone: "ok", text: "1" },
    { tone: "danger", text: "2" },
    { tone: "info", text: "3" },
    { tone: "warn", text: "4" },
    { tone: "danger", text: "5" },
  ]);
  assert.deepEqual(s.map((f) => f.text), ["2", "5", "4", "3", "1"]);
});


/* ================= independent verifier cases ================= */

test("verifier: RFC 7208 Appendix A.1 records parse cleanly with the right lookup counts", () => {
  const cases: [string, number][] = [
    ["v=spf1 +all", 0],
    ["v=spf1 a -all", 1],
    ["v=spf1 a:example.org -all", 1],
    ["v=spf1 mx -all", 1],
    ["v=spf1 mx:example.org -all", 1],
    ["v=spf1 mx mx:example.org -all", 2],
    ["v=spf1 mx/30 mx:example.org/30 -all", 2],
    ["v=spf1 ptr -all", 1],
    ["v=spf1 ip4:192.0.2.128/28 -all", 0],
  ];
  for (const [rec, n] of cases) {
    const a = analyzeSpf(rec, "example.com");
    assert.deepEqual(a.errors, [], rec);
    assert.equal(a.lookupCount, n, rec);
  }
  const plusAll = analyzeSpf("v=spf1 +all");
  assert.equal(plusAll.defaultResult, "pass");
  assert.ok(has(plusAll.findings, "danger", /\+all passes every host/));
  const mx30 = analyzeSpf("v=spf1 mx/30 mx:example.org/30 -all");
  assert.equal(mx30.terms[0].ip4Cidr, 30);
  assert.equal(mx30.terms[1].ip4Cidr, 30);
  assert.equal(mx30.terms[1].target, "example.org");
  assert.ok(has(analyzeSpf("v=spf1 ptr -all").findings, "warn", /SHOULD NOT be published/));
  const r28 = analyzeSpf("v=spf1 ip4:192.0.2.128/28 -all");
  assert.equal(r28.terms[0].network, "192.0.2.128/28");
  assert.match(r28.terms[0].summary, /\(16 addresses\)/);
});

test("verifier: Appendix A.2 include and redirect", () => {
  const inc = analyzeSpf("v=spf1 include:example.com include:example.net -all", "example.org");
  assert.equal(inc.lookupCount, 2);
  assert.deepEqual(inc.nested.map((n) => [n.kind, n.domain, n.digCommand]), [
    ["include", "example.com", "dig +short TXT example.com"],
    ["include", "example.net", "dig +short TXT example.net"],
  ]);
  const red = analyzeSpf("v=spf1 redirect=example.org", "la.example.org");
  assert.deepEqual(red.errors, []);
  assert.equal(red.lookupCount, 1);
  assert.equal(red.defaultResult, "whatever example.org returns");
  assert.match(red.terms[0].summary, /publishes no SPF record, the result is permerror/);
});

test("verifier: section 7.4 macro strings are valid domain-specs; c, r, t only outside domains", () => {
  for (const m of [
    "%{ir}.%{v}._spf.%{d2}",
    "%{lr-}.lp._spf.%{d2}",
    "%{lr-}.lp.%{ir}.%{v}._spf.%{d2}",
    "%{ir}.%{v}.%{l1r-}.lp._spf.%{d2}",
    "%{d2}.trusted-domains.example.net",
  ]) {
    const c = checkMacroString(m, true);
    assert.equal(c.error, null, m);
    assert.ok(c.hasMacro, m);
    assert.deepEqual(analyzeSpf(`v=spf1 exists:${m} -all`).errors, [], m);
  }
  // macro-letter includes c, r, t (section 7.1), so an unknown modifier may carry them.
  const unk = analyzeSpf("v=spf1 -all foo=%{c}.%{r}.%{t}");
  assert.deepEqual(unk.errors, []);
  // In a domain-spec they are not allowed (section 7.2).
  assert.equal(analyzeSpf("v=spf1 exists:%{c}.example.com -all").errors.length, 1);
  assert.match(checkMacroString("%{d0}.example.com", true).error ?? "", /nonzero/);
  assert.match(checkMacroString("%{x}.example.com", true).error ?? "", /not a macro letter/);
  // A non-ASCII character is named whole, not as half a surrogate pair.
  assert.match(checkMacroString("\u{1F600}.example.com", true).error ?? "", /U\+1F600/);
});

test("verifier: section 6.2 example record, exp is not a lookup", () => {
  const a = analyzeSpf("v=spf1 mx -all exp=explain._spf.%{d}", "example.com");
  assert.deepEqual(a.errors, []);
  assert.equal(a.lookupCount, 1);
  assert.equal(a.exp?.status, "deferred");
  assert.equal(a.defaultResult, "fail");
});

test("verifier: 4.6.4 boundary at 10 and 11, unreached and ignored terms not counted", () => {
  const ten = analyzeSpf("v=spf1 " + Array.from({ length: 10 }, (_, i) => `a:h${i}.example.com`).join(" ") + " -all");
  assert.equal(ten.lookupCount, 10);
  assert.ok(has(ten.findings, "warn", /whole budget/));
  assert.ok(!ten.findings.some((f) => f.tone === "danger"));
  const eleven = analyzeSpf("v=spf1 " + Array.from({ length: 11 }, (_, i) => `a:h${i}.example.com`).join(" ") + " -all");
  assert.equal(eleven.lookupCount, 11);
  assert.ok(has(eleven.findings, "danger", /limit is 10/));
  // Section 5.1: mechanisms after all are never tested; redirect is ignored when all exists.
  const after = analyzeSpf("v=spf1 -all a mx redirect=example.net");
  assert.equal(after.lookupCount, 0);
  assert.deepEqual(after.terms.map((t) => t.status), ["evaluated", "unreached", "unreached", "ignored"]);
  assert.equal(after.defaultResult, "fail");
});

test("verifier: 4.5 selection, version spelling and whitespace", () => {
  assert.equal(analyzeSpfInput("v=spf10 -all").kind, "error");
  const bare = analyzeSpf("v=spf1");
  assert.deepEqual(bare.errors, []);
  assert.equal(bare.defaultResult, "neutral");
  const tab = analyzeSpfInput("v=spf1\tinclude:example.com -all");
  assert.equal(tab.kind, "error");
  assert.match(tab.message ?? "", /a tab after v=spf1/);
  const nbsp = analyzeSpfInput("v=spf1 -all");
  assert.match(nbsp.message ?? "", /non-breaking space/);
  const curly = analyzeSpfInput("“v=spf1 -all”");
  assert.match(curly.message ?? "", /curly or single quotation mark/);
  assert.match(analyzeSpfInput("spf2.0/pra -all").message ?? "", /RFC 6686/);
});

test("verifier: 4.6.1 '=' makes a modifier, so ip4= and a= authorize nothing", () => {
  const r = analyzeSpf("v=spf1 ip4=192.0.2.1 a= -all");
  assert.deepEqual(r.errors, []);
  assert.equal(r.terms[0].kind, "modifier");
  assert.equal(r.terms[1].kind, "modifier");
  assert.equal(r.findings.filter((f) => f.tone === "danger" && /unknown modifier/.test(f.text)).length, 2);
  // Unknown mechanism: a syntax error, permerror per section 4.6.
  const bad = analyzeSpf("v=spf1 ipv4:192.0.2.1 -all");
  assert.equal(bad.defaultResult, "permerror");
  assert.match(bad.errors[0], /section 4\.6/);
  assert.match(bad.errors[0], /ip4:/);
});

test("verifier: section 6 duplicates and qualifiers on modifiers", () => {
  assert.ok(analyzeSpf("v=spf1 redirect=a.example redirect=b.example").errors.some((e) => /redirect= appears 2 times/.test(e)));
  assert.ok(analyzeSpf("v=spf1 -all exp=a.example exp=b.example").errors.some((e) => /exp= appears 2 times/.test(e)));
  assert.match(analyzeSpf("v=spf1 ~redirect=a.example").errors[0], /do not take a qualifier/);
});

test("verifier: void lookups, exists x3 warns, x2 does not", () => {
  const three = analyzeSpf("v=spf1 exists:%{i}.a.example exists:%{i}.b.example exists:%{i}.c.example -all");
  assert.ok(has(three.findings, "warn", /3 exists terms/));
  const two = analyzeSpf("v=spf1 exists:%{i}.a.example exists:%{i}.b.example -all");
  assert.ok(!two.findings.some((f) => /exists terms\./.test(f.text)));
});

test("verifier: RFC 5952 compression rules", () => {
  // 4.2.2: a single 16-bit 0 field is not shortened to ::
  assert.equal(formatIpv6((parseIpv6("2001:db8:0:1:1:1:1:1") as { value: bigint }).value), "2001:db8:0:1:1:1:1:1");
  // 4.2.3: the longest run wins; on a tie the first is compressed
  assert.equal(formatIpv6((parseIpv6("2001:0:0:1:0:0:0:1") as { value: bigint }).value), "2001:0:0:1::1");
  assert.equal(formatIpv6((parseIpv6("2001:db8:0:0:1:0:0:1") as { value: bigint }).value), "2001:db8::1:0:0:1");
  // 4.3: lowercase
  assert.equal(formatIpv6((parseIpv6("2001:DB8::ABCD") as { value: bigint }).value), "2001:db8::abcd");
  assert.equal(parseIpv6("1:2:3:4:5:6:7:8:9").ok, false);
  assert.equal(parseIpv6("1::2::3").ok, false);
  assert.equal(parseIpv6("12345::").ok, false);
  assert.equal(parseIpv6("fe80::1%eth0").ok, false);
});

test("verifier: RFC 1035 5.1 parentheses carry one TXT record across lines", () => {
  const zone = 'example.com. IN TXT ( "v=spf1 ip4:192.0.2.0/24 " ; first part\n   "include:_spf.example.net -all" )';
  const r = analyzeSpfInput(zone);
  assert.equal(r.kind, "ok");
  assert.equal(r.txt.length, 1);
  assert.equal(r.spf[0].analysis.record, "v=spf1 ip4:192.0.2.0/24 include:_spf.example.net -all");
  assert.deepEqual(r.spf[0].analysis.errors, []);
  assert.equal(r.ownerDomain, "example.com");
  // Section 3.3: strings joined with no space can fuse two terms.
  const fused = analyzeSpfInput('"v=spf1 -all" "x"');
  assert.ok(has(fused.spf[0].analysis.findings, "warn", /meet with no space/));
  assert.equal(fused.spf[0].analysis.record, "v=spf1 -allx");
  // An unclosed parenthesis does not hang or crash.
  const open = analyzeSpfInput('example.com. IN TXT ( "v=spf1 -all"\n"a"\n"b"');
  assert.equal(open.kind, "ok");
});

test("verifier: multiple records and adversarial input never throw", () => {
  const two = analyzeSpfInput("v=spf1 -all\nv=spf1 ~all");
  assert.ok(has(two.findings, "danger", /2 records start with v=spf1/));
  const nasty = [
    "v=spf1 " + "(".repeat(5000),
    '"v=spf1 (' + '"\n('.repeat(3000),
    "v=spf1 ip6:" + "f".repeat(5000),
    "v=spf1 a:%{" + "i".repeat(3000),
    "v=spf1 \u{1F600}\u{1F600} include:\u{1F600}.com",
    "v=spf1 a/4294967296 mx//18446744073709551616",
    "v=spf1 ip4:4294967296.0.0.0",
    "﻿v=spf1 -all",
  ];
  for (const n of nasty) {
    const r = analyzeSpfInput(n);
    assert.ok(["ok", "error", "empty"].includes(r.kind));
  }
});

console.log(`spf-record-analyzer: ${passed} tests passed`);
