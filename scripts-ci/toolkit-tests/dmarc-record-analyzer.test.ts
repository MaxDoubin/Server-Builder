import assert from "node:assert/strict";
import {
  analyzeDmarc,
  analyzeDmarcInput,
  buildDmarcRecord,
  checkAlignment,
  isDomainName,
  normalizeReportAddresses,
  organizationalDomain,
  parseReportUri,
  policyEffect,
  policyStrength,
  toTxtPresentation,
  BUILDER_DEFAULTS,
  RI_MAX,
} from "../../client/src/lib/toolkit/dmarc-record-analyzer";

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

/* ---------------- organizational domains and alignment (section 3.1, 3.2) */
test("organizational domain", () => {
  assert.equal(organizationalDomain("mail.example.com"), "example.com");
  assert.equal(organizationalDomain("a.b.c.example.com."), "example.com");
  assert.equal(organizationalDomain("example.com"), "example.com");
  assert.equal(organizationalDomain("news.bbc.co.uk"), "bbc.co.uk");
  assert.equal(organizationalDomain("Shop.Example.COM.AU"), "example.com.au");
  assert.equal(organizationalDomain("com"), "com");
});
test("alignment, RFC 7489 section 3.1 examples", () => {
  // The 3.1.1 pattern: a parent-domain d= aligns with a subdomain From under relaxed, not strict.
  assert.equal(checkAlignment("r", "foo.example.com", "example.com").aligned, true);
  assert.equal(checkAlignment("s", "foo.example.com", "example.com").aligned, false);
  assert.equal(checkAlignment("s", "Example.com.", "example.com").aligned, true);
  assert.equal(checkAlignment("r", "example.com", "esp.example.net").aligned, false);
  assert.equal(checkAlignment("r", "example.co.uk", "other.co.uk").aligned, false);
});
test("isDomainName", () => {
  assert.ok(isDomainName("example.com"));
  assert.ok(isDomainName("example.com."));
  assert.ok(isDomainName("rua.dmarc.example.net"));
  assert.ok(!isDomainName("localhost"));
  assert.ok(!isDomainName("-bad.example.com"));
  assert.ok(!isDomainName("192.0.2.1"));
  assert.ok(!isDomainName("exa mple.com"));
});

/* ---------------- report URIs (section 6.2, 6.4) */
test("report URIs", () => {
  const a = parseReportUri("mailto:dmarc@example.com");
  assert.equal(a.error, null);
  assert.equal(a.host, "example.com");
  const sized = parseReportUri("mailto:dmarc@example.com!10m");
  assert.equal(sized.limitBytes, 10n * 1024n * 1024n); // m = 2^20, section 6.2
  assert.equal(sized.uri, "mailto:dmarc@example.com");
  assert.equal(parseReportUri("mailto:x@example.com!1t").limitBytes, 1n << 40n);
  assert.equal(parseReportUri("mailto:x@example.com!512").limitBytes, 512n);
  assert.match(parseReportUri("mailto:x@example.com!18446744073709551616").error ?? "", /64-bit/);
  assert.equal(parseReportUri("mailto:x@example.com!18446744073709551615").error, null);
  assert.match(parseReportUri("dmarc@example.com").error ?? "", /mailto:dmarc@example.com/);
  assert.match(parseReportUri("mailto:x@example.com!abc").error ?? "", /%21/);
  assert.match(parseReportUri("mailto:not-an-address").error ?? "", /usable address/);
  assert.match(parseReportUri("mailto:a b@example.com").error ?? "", /no spaces/);
  const https = parseReportUri("https://reports.example.net/dmarc");
  assert.equal(https.host, "reports.example.net");
  assert.match(https.warning ?? "", /only required to support mailto/);
  assert.equal(parseReportUri("mailto:dmarc%2Breports@example.com").host, "example.com");
});

/* ---------------- record analysis */
test("monitor only", () => {
  const r = analyzeDmarc("v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com", "example.com");
  assert.equal(r.errors.length, 0);
  assert.ok(r.applies);
  assert.equal(r.p, "none");
  assert.equal(r.pct, 100);
  assert.equal(r.adkim, "r");
  assert.equal(r.aspf, "r");
  assert.equal(r.ri, 86400);
  assert.deepEqual(r.fo, ["0"]);
  assert.deepEqual(r.rf, ["afrf"]);
  assert.equal(r.strength.level, 1);
  assert.ok(has(r.findings, "warn", /monitor-only/));
  assert.equal(r.external.length, 0);
});
test("enforced", () => {
  const r = analyzeDmarc("v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:dmarc@example.com", "example.com");
  assert.equal(r.errors.length, 0);
  assert.equal(r.strength.level, 4);
  assert.ok(has(r.findings, "ok", /p=reject at 100%/));
  assert.ok(has(r.findings, "info", /Strict DKIM and SPF/));
  assert.deepEqual(r.outcomes.map((o) => o.policy), ["reject", "reject", "reject"]);
});
test("pct sampling, section 6.6.4", () => {
  assert.equal(policyEffect("reject", 25), "rejected for 25%, quarantined for the rest");
  assert.equal(policyEffect("quarantine", 25), "quarantined for 25%, normal handling for the rest");
  assert.match(policyEffect("reject", 0), /^quarantined/);
  assert.equal(policyStrength("quarantine", 0, true).level, 1);
  assert.equal(policyStrength("quarantine", 50, true).level, 2);
  assert.equal(policyStrength("reject", 50, true).level, 3);
  const r = analyzeDmarc("v=DMARC1; p=quarantine; pct=25; rua=mailto:d@example.com");
  assert.equal(r.pct, 25);
  assert.ok(has(r.findings, "warn", /pct=25/));
  const zero = analyzeDmarc("v=DMARC1; p=reject; pct=0; rua=mailto:d@example.com");
  assert.ok(has(zero.findings, "warn", /enforces only quarantine/));
});
test("subdomain policies", () => {
  const r = analyzeDmarc("v=DMARC1; p=reject; sp=none; np=none; rua=mailto:d@example.com", "example.com");
  assert.ok(has(r.findings, "warn", /sp=none is weaker than p=reject/));
  assert.ok(has(r.findings, "info", /organizational domain/));
  assert.deepEqual(r.outcomes.map((o) => o.policy), ["reject", "none", "none"]);
  const np = analyzeDmarc("v=DMARC1; p=quarantine; np=reject; rua=mailto:d@example.com");
  assert.deepEqual(np.outcomes.map((o) => o.policy), ["quarantine", "quarantine", "reject"]);
  const npWeak = analyzeDmarc("v=DMARC1; p=reject; np=none; rua=mailto:d@example.com");
  assert.ok(has(npWeak.findings, "warn", /np=none is weaker than the p policy/));
});
test("external destinations, section 7.1", () => {
  const r = analyzeDmarc("v=DMARC1; p=none; rua=mailto:agg@reports.example.net,mailto:d@sub.example.com", "example.com");
  assert.equal(r.external.length, 1);
  assert.equal(r.external[0].host, "reports.example.net");
  assert.equal(r.external[0].recordName, "example.com._report._dmarc.reports.example.net");
  assert.ok(has(r.findings, "warn", /outside example.com/));
  const unknown = analyzeDmarc("v=DMARC1; p=none; rua=mailto:agg@reports.example.net");
  assert.equal(unknown.external[0].recordName, null);
  assert.ok(has(unknown.findings, "info", /Enter the domain/));
});
test("missing rua, ruf and fo", () => {
  const r = analyzeDmarc("v=DMARC1; p=quarantine; fo=1");
  assert.ok(has(r.findings, "warn", /No usable rua/));
  assert.ok(has(r.findings, "info", /fo is set, but there is no ruf/));
  const f = analyzeDmarc("v=DMARC1; p=none; rua=mailto:a@example.com; ruf=mailto:f@example.com; fo=0:1:d:s");
  assert.deepEqual(f.fo, ["0", "1", "d", "s"]);
  assert.ok(has(f.findings, "info", /personal data/));
});
test("syntax errors", () => {
  const r = analyzeDmarc("v=DMARC1; p=quarantine; pct=150; rua=dmarc@example.com; adkim=x; fo=2; ri=abc; rf=iodef");
  assert.ok(r.errors.some((e) => /pct=150/.test(e)));
  assert.ok(r.errors.some((e) => /mailto:dmarc@example.com/.test(e)));
  assert.ok(r.errors.some((e) => /adkim=x/.test(e)));
  assert.ok(r.errors.some((e) => /fo=2/.test(e)));
  assert.ok(r.errors.some((e) => /ri=abc/.test(e)));
  assert.ok(has(r.findings, "warn", /iodef/));
  assert.equal(r.pct, 100); // invalid pct leaves the default
  assert.equal(r.adkim, "r");
  assert.match(analyzeDmarc("v=DMARC1; p=none; ri=4294967296").errors.join(" "), /32-bit/);
  assert.equal(analyzeDmarc(`v=DMARC1; p=none; ri=${RI_MAX}`).errors.length, 0);
  assert.ok(analyzeDmarc("v=DMARC1; p=none; junk").errors.some((e) => /not a tag=value/.test(e)));
});
test("version rules, section 6.3 and 6.6.3", () => {
  const lower = analyzeDmarc("v=dmarc1; p=reject");
  assert.equal(lower.applies, false);
  assert.match(lower.ignoredReason ?? "", /exactly DMARC1/);
  const notFirst = analyzeDmarc("p=reject; v=DMARC1");
  assert.equal(notFirst.applies, false);
  assert.match(notFirst.ignoredReason ?? "", /does not start with v=DMARC1/);
  const ws = analyzeDmarc("v = DMARC1 ;p = reject");
  assert.equal(ws.errors.length, 0);
  assert.equal(ws.p, "reject");
  const missingSemicolon = analyzeDmarc("v=DMARC1; p=none rua=mailto:a@example.com");
  assert.ok(has(missingSemicolon.findings, "warn", /semicolon is probably missing/));
});
test("invalid or missing p, section 6.6.3", () => {
  const withRua = analyzeDmarc("v=DMARC1; p=quarntine; rua=mailto:a@example.com");
  assert.ok(withRua.applies);
  assert.equal(withRua.effectiveP, "none");
  assert.ok(has(withRua.findings, "danger", /act as if the record said p=none/));
  const noRua = analyzeDmarc("v=DMARC1; sp=reject");
  assert.equal(noRua.applies, false);
  assert.match(noRua.ignoredReason ?? "", /no DMARC processing/);
  const badSp = analyzeDmarc("v=DMARC1; p=reject; sp=strict; rua=mailto:a@example.com");
  assert.equal(badSp.effectiveP, "none");
});
test("duplicates, unknown tags, DMARCbis tags, case, empty tags", () => {
  const r = analyzeDmarc("v=DMARC1; p=reject; p=none;; foo=bar; t=y; psd=n; P=reject");
  assert.equal(r.p, "reject");
  assert.ok(has(r.findings, "warn", /appears more than once/));
  assert.ok(has(r.findings, "warn", /empty tag/));
  assert.ok(has(r.findings, "info", /foo is not a DMARC tag/));
  assert.ok(has(r.findings, "info", /RFC 9989/));
  assert.ok(has(r.findings, "info", /capitals/));
  assert.ok(analyzeDmarc("v=DMARC1; p=none; t=maybe").errors.some((e) => /t=maybe/.test(e)));
});

/* ---------------- input level */
test("input", () => {
  const dig = analyzeDmarcInput('_dmarc.example.org. 3600 IN TXT "v=DMARC1; p=reject; rua=mailto:agg@reports.example.net"');
  assert.equal(dig.kind, "ok");
  assert.equal(dig.ownerDomain, "example.org");
  assert.equal(dig.analysis?.external[0].recordName, "example.org._report._dmarc.reports.example.net");
  const two = analyzeDmarcInput("v=DMARC1; p=none\nv=DMARC1; p=reject");
  assert.equal(two.analysis?.applies, false);
  assert.equal(two.analysis?.strength.level, 0);
  assert.ok(has(two.analysis?.findings ?? [], "danger", /no DMARC at all/));
  assert.match(analyzeDmarcInput("v=spf1 -all").message ?? "", /SPF record/);
  assert.match(analyzeDmarcInput("hello world").message ?? "", /Nothing here/);
  assert.equal(analyzeDmarcInput("").kind, "empty");
  const noV = analyzeDmarcInput("p=reject; rua=mailto:a@example.com");
  assert.equal(noV.kind, "ok");
  assert.equal(noV.analysis?.applies, false);
  const lower = analyzeDmarcInput("v=dmarc1; p=reject");
  assert.equal(lower.analysis?.applies, false);
  const withOther = analyzeDmarcInput("v=DMARC1; p=none; rua=mailto:a@example.com\nsome-verification=xyz");
  assert.ok(has(withOther.analysis?.findings ?? [], "info", /One other TXT line/));
});
test("adversarial input does not throw", () => {
  const junk = [
    "v=DMARC1;" + ";".repeat(5000),
    "v=DMARC1; rua=" + "mailto:a@example.com,".repeat(2000),
    "v=DMARC1; p=\u0000",
    "v=DMARC1; ri=" + "9".repeat(500),
    "v=DMARC1; pct=" + "1".repeat(500),
    "v=DMARC1; rua=mailto:%E0%A4%A@example.com",
    '"v=DMARC1; p=none',
    "=",
    ";;;",
    "v=DMARC1 ; p=none",
  ];
  for (const j of junk) {
    const r = analyzeDmarcInput(j);
    assert.ok(r.kind === "ok" || r.kind === "error");
  }
  assert.ok(analyzeDmarc("v=DMARC1 ; p=none").errors.some((e) => /non-breaking/.test(e)));
});

/* ---------------- builder */
test("builder output is valid and minimal", () => {
  const b = buildDmarcRecord(BUILDER_DEFAULTS);
  assert.equal(b.record, "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com");
  assert.equal(b.errors.length, 0);
  assert.equal(b.zoneLine, '_dmarc.example.com. IN TXT "v=DMARC1; p=none; rua=mailto:dmarc-reports@example.com"');
  const r = analyzeDmarc(b.record, "example.com");
  assert.equal(r.errors.length, 0);
  assert.ok(r.applies);
});
test("builder full", () => {
  const b = buildDmarcRecord({
    domain: "example.com",
    p: "quarantine",
    sp: "reject",
    np: "reject",
    pct: "50",
    rua: "mailto:agg@example.com, agg@reports.example.net!10m",
    ruf: "forensic@example.com",
    adkim: "s",
    aspf: "r",
    fo: ["1", "d"],
    ri: "3600",
  });
  assert.equal(b.errors.length, 0);
  assert.equal(
    b.record,
    "v=DMARC1; p=quarantine; sp=reject; np=reject; pct=50; rua=mailto:agg@example.com,mailto:agg@reports.example.net!10m; ruf=mailto:forensic@example.com; adkim=s; fo=1:d; ri=3600",
  );
  assert.deepEqual(b.authorizations, ['example.com._report._dmarc.reports.example.net. IN TXT "v=DMARC1"']);
  const r = analyzeDmarc(b.record, "example.com");
  assert.equal(r.errors.length, 0);
  assert.equal(r.pct, 50);
  assert.equal(r.rua[1].limitBytes, 10n << 20n);
});
test("builder validation", () => {
  const b = buildDmarcRecord({ ...BUILDER_DEFAULTS, pct: "101", ri: "-5", rua: "not an address", domain: "bad domain" });
  assert.ok(b.errors.some((e) => /pct/.test(e)));
  assert.ok(b.errors.some((e) => /ri must/.test(e)));
  assert.ok(b.errors.some((e) => /rua:/.test(e)));
  assert.ok(b.errors.some((e) => /not a domain/.test(e)));
  assert.equal(b.zoneLine, null);
  // fo without ruf is left out, since it would be ignored.
  assert.doesNotMatch(buildDmarcRecord({ ...BUILDER_DEFAULTS, fo: ["1"] }).record, /fo=/);
  const n = normalizeReportAddresses("a@example.com a@example.com, mailto:b@example.com;c@x", "rua");
  assert.deepEqual(n.uris, ["mailto:a@example.com", "mailto:b@example.com"]);
  assert.equal(n.errors.length, 1);
});
test("txt presentation splitting", () => {
  assert.equal(toTxtPresentation("abc"), '"abc"');
  assert.equal(toTxtPresentation('a"b'), '"a\\"b"');
  const long = "x".repeat(300);
  const out = toTxtPresentation(long);
  assert.equal(out, `"${"x".repeat(255)}" "${"x".repeat(45)}"`);
});


/* ================= independent verifier cases ================= */

test("verifier: RFC 7489 section 7.1 worked example", () => {
  const a = analyzeDmarc("v=DMARC1; p=none; rua=mailto:reports@red.example.net", "blue.example.com");
  assert.equal(a.external.length, 1);
  assert.equal(a.external[0].recordName, "blue.example.com._report._dmarc.red.example.net");
  assert.ok(has(a.findings, "warn", /outside example\.com/));
  // Same organizational domain: no authorization record needed.
  const own = analyzeDmarc("v=DMARC1; p=none; rua=mailto:reports@mail.example.com", "blue.example.com");
  assert.equal(own.external.length, 0);
});

test("verifier: section 6.2 and 6.4 size limits are powers of two", () => {
  const u = parseReportUri("mailto:reports@example.com!50m");
  assert.equal(u.error, null);
  assert.equal(u.limitBytes, 50n * 1048576n);
  assert.equal(u.limitText, "50 MiB");
  assert.equal(parseReportUri("mailto:a@example.com!10k").limitBytes, 10240n);
  assert.equal(parseReportUri("mailto:a@example.com!1t").limitBytes, 1n << 40n);
  assert.equal(parseReportUri("mailto:a@example.com!18446744073709551615").error, null);
  assert.match(parseReportUri("mailto:a@example.com!18446744073709551616").error ?? "", /64-bit/);
  // An encoded comma is RFC 6068's separator between two addresses, not an encoding mistake.
  const enc = parseReportUri("mailto:a@example.com%2Cb@example.net");
  assert.equal(enc.error, null);
  assert.match(enc.warning ?? "", /separates two addresses/);
});

test("verifier: Appendix B.2.3 zone file record across lines", () => {
  const zone = [
    '_dmarc IN  TXT  ( "v=DMARC1; p=quarantine; "',
    '                  "rua=mailto:dmarc-feedback@example.com,"',
    '                  "mailto:tld-test@thirdparty.example.net!10m; "',
    '                  "pct=25" )',
  ].join("\n");
  const r = analyzeDmarcInput(zone, "test.example.com");
  assert.equal(r.kind, "ok");
  assert.equal(r.txt.length, 1);
  const a = r.analysis!;
  assert.equal(a.record, "v=DMARC1; p=quarantine; rua=mailto:dmarc-feedback@example.com,mailto:tld-test@thirdparty.example.net!10m; pct=25");
  assert.deepEqual(a.errors, []);
  assert.equal(a.rua.length, 2);
  assert.equal(a.rua[1].limitBytes, 10n << 20n);
  assert.equal(a.pct, 25);
  assert.equal(a.strength.label, "Partial quarantine");
  assert.equal(a.external[0].recordName, "test.example.com._report._dmarc.thirdparty.example.net");
  assert.ok(has(a.findings, "info", /RFC 9989.*pct/));
  // A split after a separator is not reported as two terms fusing.
  assert.ok(!a.findings.some((f) => /meet with no space/.test(f.text)));
});

test("verifier: Appendix B.1 alignment examples", () => {
  // B.1.1 example 2: MAIL FROM child.example.com, From example.com
  assert.equal(checkAlignment("r", "example.com", "child.example.com").aligned, true);
  assert.equal(checkAlignment("s", "example.com", "child.example.com").aligned, false);
  // B.1.1 example 3: example.net vs child.example.com
  assert.equal(checkAlignment("r", "child.example.com", "example.net").aligned, false);
  // B.1.2 example 2: d=example.com, From child.example.com
  assert.equal(checkAlignment("r", "child.example.com", "example.com").aligned, true);
  assert.equal(checkAlignment("s", "child.example.com", "example.com").aligned, false);
  // B.1.2 example 3: d=sample.net
  assert.equal(checkAlignment("r", "child.example.com", "sample.net").aligned, false);
  // Section 3.1 is case-insensitive and ignores the root dot.
  assert.equal(checkAlignment("s", "Example.COM.", "example.com").aligned, true);
});

test("verifier: 6.6.3 invalid sp with valid p and rua acts as p=none everywhere", () => {
  const a = analyzeDmarc("v=DMARC1; p=reject; sp=bogus; rua=mailto:a@example.com", "example.com");
  assert.equal(a.applies, true);
  assert.equal(a.effectiveP, "none");
  assert.equal(a.strength.label, "Monitor only");
  assert.ok(!a.findings.some((f) => /p=reject at 100%/.test(f.text)));
  assert.equal(a.outcomes[0].source, "p (treated as none)");
  assert.equal(a.outcomes[1].policy, "none");
  // Without a usable rua, nothing is applied.
  const none = analyzeDmarc("v=DMARC1; p=reject; sp=bogus", "example.com");
  assert.equal(none.applies, false);
  assert.equal(none.strength.level, 0);
});

test("verifier: 6.6.4 sampling, reject at pct=0 is quarantine for all failing mail", () => {
  assert.equal(policyEffect("reject", 0), "quarantined (pct=0 samples nothing for reject)");
  assert.equal(policyEffect("quarantine", 0), "normal handling (pct=0 samples nothing)");
  assert.equal(policyEffect("reject", 30), "rejected for 30%, quarantined for the rest");
  assert.deepEqual(policyStrength("reject", 0, true), { level: 3, label: "Quarantine (reject at pct=0)" });
  assert.deepEqual(policyStrength("quarantine", 0, true), { level: 1, label: "Monitor only (pct=0)" });
  assert.deepEqual(policyStrength("reject", 100, true), { level: 4, label: "Reject" });
  const a = analyzeDmarc("v=DMARC1; p=reject; pct=0; rua=mailto:a@example.com");
  assert.ok(has(a.findings, "warn", /enforces only quarantine/));
});

test("verifier: 6.3 syntax errors fall back to defaults", () => {
  const a = analyzeDmarc("v=DMARC1; p=quarantine; pct=150; adkim=x; ri=-5; rua=mailto:a@example.com");
  assert.equal(a.pct, 100);
  assert.equal(a.adkim, "r");
  assert.equal(a.ri, 86400);
  assert.ok(a.errors.some((e) => /pct=150.*default, 100/.test(e)));
  assert.ok(a.errors.some((e) => /adkim=x.*default, relaxed/.test(e)));
  assert.ok(a.errors.some((e) => /ri=-5.*86400/.test(e)));
  // ri boundary: 2^32 - 1 is allowed, 2^32 is not.
  assert.equal(analyzeDmarc("v=DMARC1; p=none; ri=4294967295").ri, 4294967295);
  assert.equal(analyzeDmarc("v=DMARC1; p=none; ri=4294967296").ri, 86400);
});

test("verifier: version tag rules (6.3) and multiple records (6.6.3)", () => {
  assert.equal(analyzeDmarc("v=DMARC1;p=none").applies, true);
  assert.equal(analyzeDmarc("v = DMARC1 ; p = none").applies, true);
  assert.equal(analyzeDmarc("v=dmarc1; p=none; rua=mailto:a@example.com").applies, false);
  assert.equal(analyzeDmarc("p=none; v=DMARC1").applies, false);
  assert.equal(analyzeDmarc("v=DMARC2; p=none").applies, false);
  const two = analyzeDmarcInput("v=DMARC1; p=reject\nv=DMARC1; p=none");
  assert.equal(two.analysis?.applies, false);
  assert.ok(has(two.analysis!.findings, "danger", /2 records start with v=DMARC1/));
  // An SPF record and junk lines alongside one DMARC record are ignored.
  const mixed = analyzeDmarcInput("google-site-verification=abc\nv=DMARC1; p=none; rua=mailto:a@example.com");
  assert.equal(mixed.analysis?.applies, true);
});

test("verifier: RFC 9989 tags and IP-literal report hosts", () => {
  const t = analyzeDmarc("v=DMARC1; p=reject; t=y; psd=n; rua=mailto:a@example.com");
  assert.deepEqual(t.errors, []);
  assert.ok(has(t.findings, "info", /t=y as a test: reject is applied as quarantine/));
  assert.match(analyzeDmarc("v=DMARC1; p=reject; t=maybe").errors.join(" "), /t=maybe/);
  const ip = analyzeDmarc("v=DMARC1; p=none; rua=https://[2001:db8::1]/r", "example.com");
  assert.equal(ip.external.length, 0);
  assert.ok(has(ip.findings, "warn", /IP address/));
  const fo = analyzeDmarc("v=DMARC1; p=none; ruf=mailto:f@example.com; fo=0:1");
  assert.ok(has(fo.findings, "info", /both 0 and 1/));
});

test("verifier: builder encodes URI-unsafe characters, checks size, round-trips", () => {
  const b = buildDmarcRecord({
    ...BUILDER_DEFAULTS,
    rua: "a{b}@example.com, ok+tag@example.com!10M",
    ruf: "f@example.net",
    fo: ["0", "1", "d"],
  });
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.ruaUris, ["mailto:a%7Bb%7D@example.com", "mailto:ok+tag@example.com!10m"]);
  assert.match(b.record, /fo=1:d/);
  assert.doesNotMatch(b.record, /fo=0/);
  const back = analyzeDmarc(b.record, "example.com");
  assert.deepEqual(back.errors, []);
  assert.equal(back.rua.length, 2);
  assert.equal(back.rua.every((u) => u.error === null), true);
  assert.deepEqual(b.authorizations, ['example.com._report._dmarc.example.net. IN TXT "v=DMARC1"']);
  const big = buildDmarcRecord({ ...BUILDER_DEFAULTS, rua: "x@example.com!18446744073709551616" });
  assert.ok(big.errors.some((e) => /64-bit/.test(e)));
  assert.doesNotMatch(big.record, /rua=/);
});

test("verifier: adversarial DMARC input never throws", () => {
  const nasty = [
    ";".repeat(10000),
    "v=DMARC1;" + "p=none;".repeat(2000),
    "v=DMARC1; p=none; rua=" + "mailto:a@example.com,".repeat(500),
    "v=DMARC1; p=none; rua=mailto:" + "%".repeat(3000),
    "v=DMARC1; p=\u{1F600}; rua=mailto:\u{1F600}@example.com",
    "v=DMARC1; pct=99999999999999999999999; ri=" + "9".repeat(400),
    '_dmarc IN TXT ( "v=DMARC1; p=none"\n(\n(\n(',
    "\u0000\u0001\u0002",
  ];
  for (const n of nasty) {
    const r = analyzeDmarcInput(n, "example.com");
    assert.ok(["ok", "error", "empty"].includes(r.kind));
  }
  for (const d of ["", " ", "..", "\u{1F600}", "a".repeat(5000)]) {
    const b = buildDmarcRecord({ ...BUILDER_DEFAULTS, domain: d, rua: d, ruf: d, pct: d, ri: d });
    assert.ok(typeof b.record === "string");
  }
});

console.log(`dmarc-record-analyzer: ${passed} tests passed`);
