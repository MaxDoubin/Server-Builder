import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  allowsAllInline,
  analyzeCsp,
  analyzePolicy,
  base64DecodedLength,
  classifySource,
  editDistance,
  extractPolicies,
  FALLBACKS,
  governing,
  listFacts,
  MAX_INPUT_CHARS,
  parseSerializedPolicy,
  riskyHosts,
  splitHeaderValues,
  type PolicyAnalysis,
} from "../../client/src/lib/toolkit/csp-analyzer.ts";

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

const one = (policy: string): PolicyAnalysis => {
  const r = analyzeCsp(policy);
  assert.equal(r.extraction.error, null, `unexpected error for ${policy}: ${r.extraction.error}`);
  assert.equal(r.policies.length, 1);
  return r.policies[0];
};
const ids = (p: PolicyAnalysis) => p.findings.map((f) => f.id);
const sev = (p: PolicyAnalysis, id: string) => p.findings.find((f) => f.id === id)?.severity;
const row = (p: PolicyAnalysis, key: string) => p.rows.find((r) => r.key === key)!;
const NONCE = "rAnd0mVa1ue-Base64url_xyzAB"; // 27 chars, 20 bytes

/* --------------------------------------------- CSP3 "Parse a serialized CSP" */

test("directive names are ASCII-lowercased and the first duplicate wins", () => {
  const p = parseSerializedPolicy("Script-SRC 'self';  script-src 'none' ;;img-src *");
  assert.deepEqual(
    p.directives.map((d) => [d.name, d.tokens]),
    [
      ["script-src", ["'self'"]],
      ["img-src", ["*"]],
    ],
  );
  assert.equal(p.duplicates.length, 1);
  assert.deepEqual(p.duplicates[0].tokens, ["'none'"]);
});

test("values split on all five ASCII whitespace characters", () => {
  const p = parseSerializedPolicy("default-src\t'self'\nhttps://a.example\fhttps://b.example\r https://c.example");
  assert.deepEqual(p.byName.get("default-src")!.tokens, ["'self'", "https://a.example", "https://b.example", "https://c.example"]);
});

test("a directive holding non-ASCII characters is skipped whole", () => {
  const p = parseSerializedPolicy("script-src ‘self’; object-src 'none'");
  assert.equal(p.byName.has("script-src"), false);
  assert.equal(p.nonAscii.length, 1);
  assert.ok(p.byName.has("object-src"));
  const a = one("script-src ‘self’; object-src 'none'");
  assert.equal(sev(a, "script-unrestricted"), "high");
  assert.ok(ids(a).some((id) => id.startsWith("non-ascii-")));
});

test("an empty directive value is an empty source list that matches nothing", () => {
  const f = listFacts([]);
  assert.equal(f.blocksAll, true);
  const a = one("default-src; script-src 'self'");
  assert.equal(row(a, "img-src").verdict, "Blocked entirely");
});

/* ------------------------------------------------- Fetch "get, decode, and split" */

test("header values split on commas outside quoted strings", () => {
  assert.deepEqual(splitHeaderValues("a, b ,c"), ["a", "b", "c"]);
  assert.deepEqual(splitHeaderValues('a "x,y", b'), ['a "x,y"', "b"]);
  assert.deepEqual(splitHeaderValues('"a\\",b", c'), ['"a\\",b"', "c"]);
  assert.deepEqual(splitHeaderValues(""), [""]);
});

/* ------------------------------------------------------------ source grammar */

test("source expressions classify by the CSP3 grammar", () => {
  assert.equal(classifySource("'SELF'").kind, "keyword");
  assert.equal(classifySource("'SELF'").keyword, "self");
  assert.equal(classifySource("'none'").kind, "none");
  assert.equal(classifySource("*").kind, "wildcard");
  assert.equal(classifySource("https:").kind, "scheme");
  assert.equal(classifySource("data:").scheme, "data");
  const h = classifySource("https://*.Example.com:443/path/");
  assert.equal(h.kind, "host");
  assert.equal(h.scheme, "https");
  assert.equal(h.host, "*.example.com");
  assert.equal(h.port, "443");
  assert.equal(h.path, "/path/");
  assert.equal(classifySource("example.com.").host, "example.com");
  assert.equal(classifySource("cdn.example.com:*").port, "*");
  assert.equal(classifySource("'Nonce-abc+/=='").kind, "nonce");
  assert.equal(classifySource("'nonce-abc+/=='").value, "abc+/==");
  assert.equal(classifySource("'nonce-{RANDOM}'").kind, "invalid");
  assert.match(classifySource("'nonce-{RANDOM}'").problem!, /placeholder/);
  assert.equal(classifySource("'sha256-abc'").kind, "hash");
  assert.equal(classifySource("'sha-256-abc'").kind, "invalid");
  assert.equal(classifySource("'sha1-abc'").kind, "invalid");
  assert.equal(classifySource("'*'").kind, "invalid");
  assert.equal(classifySource("\"self\"").kind, "invalid");
  assert.equal(classifySource("'unsafe_inline'").kind, "invalid");
  assert.match(classifySource("'unsafe_inline'").problem!, /unsafe-inline/);
  assert.equal(classifySource("self").kind, "host");
  assert.equal(classifySource("self").unquoted, "self");
  assert.equal(classifySource("nonce-abc").unquoted, undefined);
  assert.equal(classifySource("sha256-ab+c=").kind, "invalid");
  assert.equal(classifySource("https://exa mple").kind, "invalid");
  assert.equal(classifySource("http://[::1]").kind, "invalid");
});

test("base64 decoded lengths match digest sizes", () => {
  // CSP2 section 4.2 and CSP3 use this exact example: alert('Hello, world.');
  const digest = createHash("sha256").update("alert('Hello, world.');").digest("base64");
  assert.equal(digest, "qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=");
  assert.equal(base64DecodedLength(digest), 32);
  assert.equal(base64DecodedLength(digest.replace(/=$/, "")), 32);
  assert.equal(base64DecodedLength(createHash("sha384").update("x").digest("base64")), 48);
  assert.equal(base64DecodedLength(createHash("sha512").update("x").digest("base64")), 64);
  assert.equal(base64DecodedLength(createHash("sha512").update("x").digest("base64url")), 64);
  assert.equal(base64DecodedLength("a"), null);
  assert.equal(base64DecodedLength("abc=="), null);
  assert.equal(base64DecodedLength("A".repeat(22)), 16);
  assert.equal(base64DecodedLength("A".repeat(20)), 15);
  assert.equal(base64DecodedLength("A".repeat(21)), null);
});

test("a correct hash raises no length finding, a truncated one does", () => {
  const good = one("script-src 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='; object-src 'none'; base-uri 'none'");
  assert.ok(!ids(good).some((id) => id.startsWith("hash-length")));
  assert.equal(good.script.level, "strict");
  const bad = one("script-src 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob'");
  assert.ok(ids(bad).some((id) => id.startsWith("hash-length")));
});

/* --------------------------------------- CSP3 "allow all inline behavior" */

test("a nonce or hash switches 'unsafe-inline' off; 'strict-dynamic' does for scripts only", () => {
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'"]), "script"), true);
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'", `'nonce-${NONCE}'`]), "script"), false);
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'", "'sha256-abc='"]), "style"), false);
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'", "'strict-dynamic'"]), "script"), false);
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'", "'strict-dynamic'"]), "style"), true);
  // An invalid nonce is not a nonce-source, so it does not switch anything off.
  assert.equal(allowsAllInline(listFacts(["'unsafe-inline'", "'nonce-{x}'"]), "script"), true);
});

/* ------------------------------------------------------- fallback lists */

test("fallback lists follow CSP3 'Get fetch directive fallback list'", () => {
  assert.deepEqual(FALLBACKS["worker-src"], ["worker-src", "child-src", "script-src", "default-src"]);
  assert.deepEqual(FALLBACKS["frame-src"], ["frame-src", "child-src", "default-src"]);
  assert.deepEqual(FALLBACKS["script-src-attr"], ["script-src-attr", "script-src", "default-src"]);
  const p = parseSerializedPolicy("default-src 'none'; script-src 'self'; child-src https://c.example");
  assert.equal(governing(p.byName, "worker-src")!.name, "child-src");
  assert.equal(governing(p.byName, "frame-src")!.name, "child-src");
  assert.equal(governing(p.byName, "img-src")!.name, "default-src");
  assert.equal(governing(p.byName, "script-src-elem")!.name, "script-src");
  const q = parseSerializedPolicy("script-src 'self'");
  assert.equal(governing(q.byName, "worker-src")!.name, "script-src");
  assert.equal(governing(q.byName, "img-src"), null);
});

test("base-uri, form-action and frame-ancestors never fall back to default-src", () => {
  const a = one("default-src 'none'");
  assert.equal(row(a, "base-uri").governedBy, null);
  assert.equal(row(a, "form-action").governedBy, null);
  assert.equal(row(a, "frame-ancestors").governedBy, null);
  assert.ok(ids(a).includes("base-missing"));
  assert.ok(ids(a).includes("frame-ancestors-missing"));
  assert.ok(ids(a).includes("form-action-missing"));
  assert.equal(a.script.level, "blocked");
  assert.equal(sev(a, "object-none"), "pass");
});

/* -------------------------------------------------------- whole policies */

test("the strict CSP template is graded strict with no high or medium findings", () => {
  const a = one(`script-src 'nonce-${NONCE}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'`);
  assert.equal(a.script.level, "strict");
  assert.equal(a.findings.filter((f) => f.severity === "high" || f.severity === "medium").length, 0, JSON.stringify(a.findings, null, 1));
  assert.equal(sev(a, "script-strict-dynamic"), "pass");
  assert.equal(sev(a, "script-unsafe-inline-ignored"), "info");
  const elem = row(a, "script-src-elem");
  assert.match(elem.tokens.find((t) => t.token === "https:")!.note!, /strict-dynamic/);
  assert.match(elem.tokens.find((t) => t.token === "'unsafe-inline'")!.note!, /strict-dynamic/);
  assert.equal(elem.tokens.find((t) => t.token.startsWith("'nonce-"))!.note, null);
  assert.equal(elem.tone, "pass");
  const attr = row(a, "script-src-attr");
  assert.match(attr.tokens.find((t) => t.token.startsWith("'nonce-"))!.note!, /never apply to attributes/);
  assert.equal(attr.verdict, "Blocked");
});

test("'unsafe-inline' through default-src is high and named as such", () => {
  const a = one("default-src 'self' 'unsafe-inline'");
  assert.equal(sev(a, "script-unsafe-inline"), "high");
  assert.match(a.findings.find((f) => f.id === "script-unsafe-inline")!.detail, /default-src governs scripts/);
  assert.equal(a.script.level, "bypassable");
  assert.equal(sev(a, "style-unsafe-inline"), "low");
  assert.equal(sev(a, "object-inherited"), "low");
  assert.match(row(a, "img-src").tokens.find((t) => t.token === "'unsafe-inline'")!.note!, /no effect in img-src/);
});

test("scheme and wildcard sources in a script list", () => {
  assert.equal(sev(one("script-src 'self' https:"), "script-scheme-https"), "high");
  assert.equal(sev(one("script-src 'self' http:"), "script-scheme-http"), "high");
  assert.equal(sev(one("script-src 'self' data:"), "script-scheme-data"), "high");
  assert.equal(sev(one("script-src 'self' blob:"), "script-scheme-blob"), "medium");
  assert.equal(sev(one("script-src *"), "script-wildcard-*"), "high");
  assert.equal(sev(one("script-src https://*"), "script-wildcard-https://*"), "high");
  assert.equal(sev(one("script-src *.com"), "script-tld-*.com"), "high");
  assert.equal(sev(one("script-src http://cdn.example.com"), "script-cleartext-http://cdn.example.com"), "medium");
  assert.equal(one("script-src https:").script.level, "bypassable");
  assert.equal(one("script-src 'self' https://cdn.example.com").script.level, "allowlist");
});

test("strict-dynamic without a nonce blocks everything and is flagged", () => {
  const a = one("script-src 'strict-dynamic' https://cdn.example.com");
  assert.equal(sev(a, "script-strict-dynamic-alone"), "medium");
  assert.equal(a.script.level, "blocked");
  assert.match(row(a, "script-src-elem").verdict, /Nothing can load/);
});

test("known bypass hosts are flagged, and a path lowers the severity", () => {
  assert.equal(riskyHosts([classifySource("https://ajax.googleapis.com")]).length, 1);
  assert.equal(riskyHosts([classifySource("*.googleapis.com")]).length, 1);
  assert.equal(riskyHosts([classifySource("*.github.io")]).length, 1);
  assert.equal(riskyHosts([classifySource("me.github.io")]).length, 0);
  assert.equal(riskyHosts([classifySource("*.s3.amazonaws.com")]).length, 1);
  assert.equal(riskyHosts([classifySource("cdn.example.com")]).length, 0);
  assert.equal(sev(one("script-src 'self' https://cdn.jsdelivr.net"), "script-gadget-https://cdn.jsdelivr.net"), "medium");
  assert.equal(
    sev(one("script-src 'self' https://cdn.jsdelivr.net/npm/lib@1.2.3/"), "script-gadget-https://cdn.jsdelivr.net/npm/lib@1.2.3/"),
    "low",
  );
});

test("eval is governed by script-src then default-src only", () => {
  assert.equal(sev(one("script-src 'self' 'unsafe-eval'"), "eval-unsafe"), "medium");
  assert.equal(sev(one("default-src 'self' 'unsafe-eval'"), "eval-unsafe"), "medium");
  assert.equal(sev(one("script-src 'self' 'wasm-unsafe-eval'"), "eval-wasm"), "info");
  const elemOnly = one("script-src-elem 'self'");
  assert.equal(sev(elemOnly, "eval-unrestricted"), "medium");
  assert.equal(sev(elemOnly, "attr-unrestricted"), "high");
  assert.equal(elemOnly.script.level, "bypassable");
  assert.equal(row(one("script-src 'self'"), "eval").verdict, "Blocked");
});

test("script-src-attr with its own 'unsafe-inline' is reported separately", () => {
  const a = one(`script-src 'nonce-${NONCE}'; script-src-attr 'unsafe-inline'`);
  assert.equal(sev(a, "attr-unsafe-inline"), "high");
  assert.equal(a.script.level, "bypassable");
});

test("common typing mistakes", () => {
  assert.equal(sev(one("script-src self"), "unquoted-script-src"), "medium");
  assert.equal(sev(one("default-src 'self'\nscript-src 'self'"), "swallowed-default-src"), "medium");
  assert.equal(sev(one("scripts-src 'self'"), "unknown-scripts-src"), "medium");
  assert.match(one("scripts-src 'self'").findings.find((f) => f.id === "unknown-scripts-src")!.detail, /script-src/);
  assert.equal(sev(one("script-src: 'self'"), "colon-script-src:"), "medium");
  assert.equal(sev(one("script-src 'none' 'self'"), "none-mixed-script-src"), "low");
  assert.equal(sev(one("script-src 'self'; script-src 'unsafe-inline'"), "duplicate-script-src"), "medium");
  assert.equal(sev(one("script-src 'nonce-abc123'"), "nonce-short-abc123"), "medium");
  assert.equal(sev(one("script-src 'nonce-abcde'"), "nonce-short-abcde"), "medium");
  assert.ok(!ids(one(`script-src 'nonce-${NONCE}'`)).some((id) => id.startsWith("nonce-short")));
  assert.equal(sev(one("default-src 'self'; report-to https://r.example/csp"), "report-to-url"), "medium");
  assert.equal(sev(one("default-src 'self'; report-to csp"), "report-to-ok"), "pass");
  assert.equal(sev(one("default-src 'self'; report-uri /csp"), "report-uri-only"), "info");
  assert.equal(sev(one("default-src 'self'; frame-ancestors 'unsafe-inline'"), "invalid-frame-ancestors"), "low");
  assert.equal(sev(one("default-src 'self'; plugin-types application/pdf"), "obsolete-plugin-types"), "low");
});

test("an invalid placeholder nonce leaves 'unsafe-inline' in force", () => {
  const a = one("script-src 'nonce-{{NONCE}}' 'unsafe-inline'");
  assert.equal(sev(a, "script-unsafe-inline"), "high");
  assert.equal(sev(a, "invalid-script-src"), "medium");
});

/* ------------------------------------------------------- input shapes */

test("header lines, report-only and curl -v prefixes", () => {
  const r = analyzeCsp(
    "HTTP/2 200\r\ncontent-type: text/html\r\ncontent-security-policy-report-only: default-src 'self'; report-uri /r\r\n< Content-Security-Policy: object-src 'none'\r\n",
  );
  assert.equal(r.extraction.mode, "header");
  assert.equal(r.policies.length, 2);
  assert.equal(r.policies[0].disposition, "report");
  assert.equal(r.policies[0].label, "Content-Security-Policy-Report-Only");
  assert.equal(r.policies[1].disposition, "enforce");
  assert.ok(ids(r.policies[0]).includes("report-only"));
  assert.equal(r.combined!.level, "unrestricted");
});

test("obs-fold continuation lines join the previous header", () => {
  const r = extractPolicies("Content-Security-Policy: default-src 'self';\n  script-src 'none'");
  assert.equal(r.policies.length, 1);
  assert.equal(parseSerializedPolicy(r.policies[0].text).byName.get("script-src")!.tokens[0], "'none'");
});

test("headers without a CSP are reported, not analyzed", () => {
  const r = extractPolicies("HTTP/1.1 200 OK\nServer: nginx\nContent-Type: text/html");
  assert.match(r.error!, /none of them is Content-Security-Policy/);
});

test("a comma in a header splits policies, and a stray comma is called out", () => {
  const r = analyzeCsp("default-src 'self', script-src 'none'");
  assert.equal(r.policies.length, 2);
  assert.equal(r.extraction.notes[0].severity, "info");
  assert.equal(r.combined!.level, "blocked");
  const s = analyzeCsp("script-src 'self', 'unsafe-inline'");
  assert.equal(s.extraction.notes[0].severity, "medium");
});

test("meta elements decode entities and drop frame-ancestors, report-uri and sandbox", () => {
  const r = analyzeCsp(
    `<meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; frame-ancestors &apos;none&apos;; report-uri /r; sandbox">`,
  );
  assert.equal(r.extraction.mode, "meta");
  const p = r.policies[0];
  assert.equal(p.source, "meta");
  assert.equal(sev(p, "meta-ignored-frame-ancestors"), "medium");
  assert.equal(sev(p, "meta-ignored-report-uri"), "low");
  assert.equal(sev(p, "meta-ignored-sandbox"), "low");
  assert.equal(p.directives.map((d) => d.name).join(","), "default-src");
  assert.equal(p.script.level, "allowlist");
  assert.ok(!p.added.includes("frame-ancestors 'self'"));
  const ro = extractPolicies(`<meta http-equiv="content-security-policy-report-only" content="default-src 'self'">`);
  assert.match(ro.error!, /ignore this tag/);
});

test("limits and empty input never throw", () => {
  assert.equal(analyzeCsp("").policies.length, 0);
  assert.equal(analyzeCsp("   \n ").extraction.error, null);
  assert.match(analyzeCsp("a".repeat(MAX_INPUT_CHARS + 1)).extraction.error!, /at most/);
  assert.match(analyzeCsp(";;;,,,").extraction.error!, /no directive/);
  const many = Array.from({ length: 500 }, (_, i) => `x-${i} a`).join(";");
  const a = analyzePolicy({ text: many, source: "value", disposition: "enforce", label: "x" });
  assert.equal(a.directives.length, 200);
  assert.ok(ids(a).includes("truncated"));
  const big = analyzeCsp("script-src " + Array.from({ length: 5000 }, (_, i) => `'bad${i}`).join(" "));
  assert.ok(big.policies[0].findings.find((f) => f.id === "invalid-script-src")!.detail.length < 2000);
  analyzeCsp("<meta " + "a=".repeat(10000) + ">");
  analyzeCsp("'".repeat(50000));
  analyzeCsp("\u0000￿;\ud800");
});

test("missing directives are added in the hardened copy", () => {
  const a = one("default-src 'self'");
  assert.deepEqual(a.added, ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'"]);
  assert.equal(a.hardened, "default-src 'self';\nobject-src 'none';\nbase-uri 'none';\nframe-ancestors 'self'");
  const b = one("default-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  assert.equal(b.hardened, null);
});

test("edit distance", () => {
  assert.equal(editDistance("script-src", "script-src"), 0);
  assert.equal(editDistance("scripts-src", "script-src"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
});


/* ------------------------------------------- independent verifier cases */

test("verifier: sha384, sha512 and base64url hashes of the CSP2 example script are accepted", () => {
  const body = "alert('Hello, world.');";
  for (const alg of ["sha256", "sha384", "sha512"] as const) {
    const b64 = createHash(alg).update(body, "utf8").digest("base64");
    const url = b64.replace(/\+/g, "-").replace(/\//g, "_");
    for (const v of [b64, url]) {
      const p = one(`script-src '${alg}-${v}'`);
      assert.ok(!ids(p).some((id) => id.startsWith("hash-")), `${alg} ${v}: ${ids(p).join(",")}`);
      assert.equal(p.script.level, "strict");
    }
  }
  // The published CSP2 vector itself.
  assert.equal(createHash("sha256").update(body).digest("base64"), "qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=");
});

test("verifier: a hash without its padding is flagged, since CSP3 compares base64 text exactly", () => {
  const p = one("script-src 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng'");
  assert.equal(sev(p, "hash-padding-'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng'"), "low");
  assert.ok(!ids(p).some((id) => id.startsWith("hash-length")));
  // sha512 is 64 bytes: 86 characters plus "==".
  const v512 = createHash("sha512").update("x").digest("base64");
  assert.ok(v512.endsWith("=="));
  assert.ok(ids(one(`script-src 'sha512-${v512.slice(0, -2)}'`)).some((id) => id.startsWith("hash-padding")));
  assert.ok(ids(one(`script-src 'sha512-${v512.slice(0, -1)}'`)).some((id) => id.startsWith("hash-length")));
});

test("verifier: nonce entropy boundary is 128 bits (22 base64 characters)", () => {
  const n21 = "A".repeat(21);
  const n22 = "A".repeat(22);
  const p21 = one(`script-src 'nonce-${n21}'`);
  assert.equal(sev(p21, `nonce-short-${n21}`), "medium");
  assert.match(p21.findings.find((f) => f.id === `nonce-short-${n21}`)!.detail, /at most 126 bits/);
  assert.ok(!ids(one(`script-src 'nonce-${n22}'`)).some((id) => id.startsWith("nonce-short")));
  // 16 random bytes in padded base64 is 24 characters, 22 without the padding.
  assert.ok(!ids(one(`script-src 'nonce-${"B".repeat(22)}=='`)).some((id) => id.startsWith("nonce-short")));
});

test("verifier: CSP3 parse keeps the first of a case-insensitive duplicate", () => {
  const p = parseSerializedPolicy("Script-Src 'self'; SCRIPT-SRC 'none'; script-src *");
  assert.equal(p.directives.length, 1);
  assert.equal(p.directives[0].name, "script-src");
  assert.deepEqual(p.directives[0].tokens, ["'self'"]);
  assert.equal(p.duplicates.length, 2);
});

test("verifier: curly quotes drop the whole directive, leaving scripts unrestricted", () => {
  const p = one("script-src 'self' ‘unsafe-inline’; object-src 'none'");
  assert.equal(p.directives.map((d) => d.name).join(","), "object-src");
  assert.equal(sev(p, "script-unrestricted"), "high");
  assert.ok(ids(p).some((id) => id.startsWith("non-ascii-")));
  assert.equal(p.script.level, "unrestricted");
});

test("verifier: fallback chains for frames, workers and fenced frames", () => {
  const p = parseSerializedPolicy("default-src 'none'; child-src https://c.example; script-src 'self'");
  assert.equal(governing(p.byName, "frame-src")!.name, "child-src");
  assert.equal(governing(p.byName, "worker-src")!.name, "child-src");
  assert.equal(governing(p.byName, "fenced-frame-src")!.name, "child-src");
  assert.equal(governing(p.byName, "img-src")!.name, "default-src");
  const q = parseSerializedPolicy("default-src 'none'; script-src 'self'");
  assert.equal(governing(q.byName, "worker-src")!.name, "script-src");
  assert.equal(governing(q.byName, "frame-src")!.name, "default-src");
  // child-src never governs eval, so 'unsafe-eval' there is struck through in the worker row.
  const w = one("child-src 'self' 'unsafe-eval'; script-src 'self'");
  const evalTok = row(w, "worker-src").tokens.find((t) => t.token === "'unsafe-eval'")!;
  assert.match(evalTok.note!, /no effect/);
  assert.equal(row(w, "eval").verdict, "Blocked");
});

test("verifier: strict-dynamic in default-src governs scripts when script-src is absent", () => {
  const p = one(`default-src 'nonce-${NONCE}' 'strict-dynamic' https:; object-src 'none'; base-uri 'none'`);
  assert.equal(p.script.level, "strict");
  assert.equal(sev(p, "script-strict-dynamic"), "pass");
  assert.ok(!ids(p).includes("script-scheme-https"));
  // strict-dynamic without a nonce plus 'unsafe-inline': CSP3 ignores the keyword.
  const q = one("script-src 'strict-dynamic' 'unsafe-inline'");
  assert.equal(sev(q, "script-unsafe-inline-ignored"), "info");
  assert.match(q.findings.find((f) => f.id === "script-unsafe-inline-ignored")!.detail, /Older browsers/);
  assert.equal(q.script.level, "blocked");
});

test("verifier: script-src-elem alone leaves handlers and eval open", () => {
  const p = one("script-src-elem 'self'");
  assert.equal(sev(p, "attr-unrestricted"), "high");
  assert.equal(sev(p, "eval-unrestricted"), "medium");
  assert.equal(p.script.level, "bypassable");
  assert.equal(row(p, "eval").governedBy, null);
});

test("verifier: http: in script-src is high, 'none' mixed is low", () => {
  const p = one("script-src http:; object-src 'none' 'self'");
  assert.equal(sev(p, "script-scheme-http"), "high");
  assert.equal(sev(p, "none-mixed-object-src"), "low");
});

test("verifier: a redirect chain is read from the last response only", () => {
  const r = analyzeCsp(
    "HTTP/1.1 301 Moved Permanently\ncontent-security-policy: default-src 'none'\n\nHTTP/2 200\ncontent-security-policy: script-src 'unsafe-inline'",
  );
  assert.equal(r.policies.length, 1);
  assert.equal(r.combined!.level, "bypassable");
  assert.ok(r.extraction.notes.some((n) => n.id === "earlier-responses"));
  const none = analyzeCsp("HTTP/1.1 301 Moved\ncontent-security-policy: default-src 'none'\n\nHTTP/2 200\nserver: x");
  assert.equal(none.policies.length, 0);
  assert.match(none.extraction.error!, /last response/);
});

test("verifier: sandbox and upgrade-insecure-requests do nothing in report-only", () => {
  const r = analyzeCsp("Content-Security-Policy-Report-Only: sandbox allow-scripts; upgrade-insecure-requests; report-uri /r");
  const p = r.policies[0];
  assert.equal(p.disposition, "report");
  assert.ok(ids(p).includes("sandbox-report-only"));
  assert.ok(ids(p).includes("uir-report-only"));
  assert.equal(r.combined, null);
});

test("verifier: findings are capped, the input notes survive, and nothing is lost silently", () => {
  const many = "script-src " + Array.from({ length: 3000 }, (_, i) => `*.t${i}`).join(" ");
  const p = one(many);
  assert.equal(p.findings.length, 81);
  assert.equal(p.findings[p.findings.length - 1].id, "findings-capped");
  const dirs = Array.from({ length: 400 }, (_, i) => `x-${i} a`).join(";");
  const q = one(dirs);
  assert.ok(ids(q).includes("truncated"));
  assert.ok(ids(q).includes("findings-capped"));
  // Non-ASCII directives count toward the directive cap too.
  const na = one("é;".repeat(5000));
  assert.ok(na.findings.length <= 81);
  assert.ok(ids(na).includes("truncated"));
  // Several comma-split notes get distinct ids.
  const two = analyzeCsp("Content-Security-Policy: a, b\nContent-Security-Policy: c, d");
  const noteIds = two.extraction.notes.map((n) => n.id);
  assert.equal(new Set(noteIds).size, noteIds.length);
});

test("verifier: adversarial strings never throw", () => {
  for (const input of [
    "\u0000",
    "😀".repeat(1000),
    ";".repeat(99_999),
    "script-src " + "'".repeat(99_000),
    "<meta http-equiv=content-security-policy content=" + "x".repeat(90_000) + ">",
    "HTTP/1.1 200\n".repeat(5000),
    "content-security-policy: " + "a,".repeat(40_000),
    "script-src 'sha256-" + "A".repeat(90_000) + "'",
    "default-src " + "*.".repeat(40_000) + "com",
  ]) {
    const r = analyzeCsp(input);
    assert.ok(r.policies.length <= 16);
    for (const p of r.policies) assert.ok(p.findings.length <= 81);
  }
});

console.log(`csp-analyzer: ${passed} tests passed`);
