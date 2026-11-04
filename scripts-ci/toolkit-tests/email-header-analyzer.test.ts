import assert from "node:assert/strict";
import {
  analyzeHeaders,
  splitHeaders,
  stripComments,
  parseRfc5322Date,
  classifyIp,
  extractIps,
  extractHostnames,
  parseReceived,
  buildHops,
  parseAuthResults,
  parseReceivedSpf,
  decodeEncodedWords,
  parseAddressList,
  organizationalDomain,
  relaxedAligned,
  mixedScriptWord,
  hiddenCharacters,
  formatDuration,
  hopUsedTls,
  EXAMPLE_HEADERS,
  type EmailAnalysis,
} from "../../client/src/lib/toolkit/email-header-analyzer.ts";
import { analyzeSignature } from "../../client/src/lib/toolkit/dkim-record-analyzer.ts";

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
function analyze(text: string): EmailAnalysis {
  const r = analyzeHeaders(text);
  if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.value;
}
const has = (a: EmailAnalysis, tone: string, re: RegExp) => a.findings.some((f) => f.tone === tone && re.test(f.text));
const iso = (ms: number) => new Date(ms).toISOString();
function date(s: string) {
  const r = parseRfc5322Date(s);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.value;
}

/* ------------------------------------------------------------- splitting */
t("RFC 5322 section 2.2.3 unfolding", () => {
  const s = splitHeaders("Subject: This\r\n is a test\r\nTo: a@example.com\r\n\r\nbody line\r\nmore");
  assert.equal(s.fields[0].value, "This is a test");
  assert.equal(s.fields[1].name, "To");
  assert.equal(s.bodyLinesIgnored, 2);
  const tabs = splitHeaders("Received: from a\n\tby b; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(tabs.fields[0].value, "from a\tby b; Mon, 1 Jan 2024 00:00:00 +0000");
});
t("mbox line, indented paste, lost fold indent", () => {
  const s = splitHeaders("From MAILER-DAEMON Fri Jul  8 12:08:34 2011\nFrom: a@example.com\nSubject: x");
  assert.equal(s.mboxLine, "From MAILER-DAEMON Fri Jul  8 12:08:34 2011");
  assert.equal(s.fields[0].name, "From");
  const indented = splitHeaders("    Subject: hi\n      there\n    To: b@example.com");
  assert.equal(indented.fields[0].value, "hi  there");
  assert.equal(indented.fields.length, 2);
  const lost = splitHeaders("Subject: one\ntwo three\nTo: x@example.com");
  assert.equal(lost.fields[0].value, "one two three");
  assert.equal(lost.strays[0].attachedTo, "Subject");
  const obs = splitHeaders("Subject : spaced");
  assert.equal(obs.fields[0].name, "Subject");
});
t("comments", () => {
  const c = stripComments('a (b (nested) c) "x (not) y" d');
  assert.equal(c.text, 'a "x (not) y" d');
  assert.deepEqual(c.comments, ["b (nested) c"]);
  assert.doesNotThrow(() => stripComments("(".repeat(5000) + "x"));
});

/* ----------------------------------------------------------------- dates */
t("RFC 5322 appendix A dates", () => {
  assert.equal(iso(date("Fri, 21 Nov 1997 09:55:06 -0600").ms), "1997-11-21T15:55:06.000Z");
  assert.equal(iso(date("Tue, 1 Jul 2003 10:52:37 +0200").ms), "2003-07-01T08:52:37.000Z");
  // Appendix A.5, folded with a comment and no seconds.
  assert.equal(iso(date("Thu,\r\n      13\r\n        Feb\r\n          1969\r\n      23:32\r\n               -0330 (Newfoundland Time)").ms), "1969-02-14T03:02:00.000Z");
  // Appendix A.6.2, obsolete two digit year and named zone.
  const obs = date("21 Nov 97 09:55:06 GMT");
  assert.equal(iso(obs.ms), "1997-11-21T09:55:06.000Z");
  assert.ok(obs.notes.some((n) => /two digit year/.test(n)));
  assert.equal(iso(date("Fri, 11 Jul 2003 21:00:37 -0700 (PDT)").ms), "2003-07-12T04:00:37.000Z");
  assert.equal(iso(date("1 Jan 49 00:00:00 +0000").ms), "2049-01-01T00:00:00.000Z");
  assert.equal(iso(date("1 Jan 103 00:00:00 +0000").ms), "2003-01-01T00:00:00.000Z");
  assert.equal(date("Mon, 1 Jan 2024 00:00:00 -0000").zoneKnown, false);
  assert.equal(iso(date("Mon, 1 Jan 2024 00:00:00 EST").ms), "2024-01-01T05:00:00.000Z");
  assert.equal(date("Mon, 1 Jan 2024 00:00:00 Q").zoneKnown, false);
  assert.ok(date("Tue, 1 Jan 2024 00:00:00 +0000").notes.some((n) => /mon/.test(n)));
  assert.equal(parseRfc5322Date("30 Feb 2024 00:00:00 +0000").ok, false);
  assert.equal(parseRfc5322Date("1 Jan 2024 24:00:00 +0000").ok, false);
  assert.equal(parseRfc5322Date("1 Jan 2024 10:00:00 +0popcorn").ok, false);
  assert.equal(parseRfc5322Date("yesterday").ok, false);
  // RFC 5322 section 3.3: a four digit year is 1900 or later.
  assert.equal(parseRfc5322Date("1 Jan 0049 00:00:00 +0000").ok, false);
});

/* ------------------------------------------------------------ addresses */
t("IP classification", () => {
  const k = (s: string) => classifyIp(s)?.kind;
  assert.equal(k("10.1.2.3"), "private");
  assert.equal(k("172.16.0.1"), "private");
  assert.equal(k("172.31.255.255"), "private");
  assert.equal(k("172.32.0.1"), "public");
  assert.equal(k("192.168.1.1"), "private");
  assert.equal(k("100.64.0.1"), "shared");
  assert.equal(k("100.128.0.1"), "public");
  assert.equal(k("127.0.0.1"), "loopback");
  assert.equal(k("169.254.10.1"), "link-local");
  assert.equal(k("192.0.2.1"), "documentation");
  assert.equal(k("203.0.113.9"), "documentation");
  assert.equal(k("8.8.8.8"), "public");
  assert.equal(k("224.0.0.1"), "multicast");
  assert.equal(k("255.255.255.255"), "reserved");
  assert.equal(k("::1"), "loopback");
  assert.equal(k("::"), "unspecified");
  assert.equal(k("fe80::1%eth0"), "link-local");
  assert.equal(k("fd12:3456::1"), "unique-local");
  assert.equal(k("2001:db8::1"), "documentation");
  assert.equal(k("2607:f8b0:4864:20::42"), "public");
  assert.equal(k("::ffff:10.0.0.1"), "private");
  assert.equal(k("IPv6:2001:db8::5"), "documentation");
  // RFC 6052 NAT64 prefix carries an IPv4 address in its low 32 bits.
  assert.equal(k("64:ff9b::c000:221"), "documentation");
  assert.equal(k("64:ff9b::808:808"), "public");
  assert.equal(classifyIp("256.1.1.1"), null);
  assert.equal(classifyIp("01.2.3.4"), null);
  assert.equal(classifyIp("1:2:3:4:5:6:7:8:9"), null);
  assert.equal(classifyIp("1::2::3"), null);
  assert.equal(classifyIp("10:00:00"), null);
});
t("extract IPs and hosts from real Received shapes", () => {
  const gmail = "mail-sor-f41.google.com (mail-sor-f41.google.com. [209.85.220.41])";
  assert.deepEqual(extractIps(gmail).map((i) => i.address), ["209.85.220.41"]);
  assert.deepEqual(extractHostnames(gmail), ["mail-sor-f41.google.com"]);
  const exim = "[192.0.2.1] (helo=mail.example.org)";
  assert.deepEqual(extractIps(exim).map((i) => i.address), ["192.0.2.1"]);
  assert.deepEqual(extractHostnames(exim), ["mail.example.org"]);
  const ms = "BN8PR04MB6232.namprd04.prod.example.com (2603:10b6:408:d4::12)";
  assert.deepEqual(extractIps(ms).map((i) => i.address), ["2603:10b6:408:d4::12"]);
  assert.deepEqual(extractIps("[IPv6:2001:db8::1]").map((i) => i.address), ["2001:db8::1"]);
  assert.deepEqual(extractIps("1.2.0.192.in-addr.arpa mail-192.0.2.1.example.com"), []);
  assert.deepEqual(extractIps("client 198.51.100.4:25 ok").map((i) => i.address), ["198.51.100.4"]);
  assert.deepEqual(extractHostnames("TLSv1.3 Exim 4.96 8.15.2/8.15.2 localhost"), ["localhost"]);
  assert.deepEqual(extractHostnames("<first.last@example.com>"), []);
  // Long hostile runs stay linear.
  const start = Date.now();
  extractIps("a:".repeat(50000) + "1.".repeat(50000));
  extractHostnames("a.".repeat(100000));
  assert.ok(Date.now() - start < 2000);
});
t("TLS detection", () => {
  assert.equal(hopUsedTls("ESMTPS", ""), true);
  assert.equal(hopUsedTls("ESMTPSA", ""), true);
  assert.equal(hopUsedTls("ESMTPA", ""), false);
  assert.equal(hopUsedTls("ESMTP", ""), false);
  assert.equal(hopUsedTls("UTF8SMTPS", ""), true);
  assert.equal(hopUsedTls("LMTP", ""), false);
  assert.equal(hopUsedTls("SMTPS", ""), true);
  assert.equal(hopUsedTls("esmtp", "(using TLSv1.3 with cipher TLS_AES_256_GCM_SHA384)"), true);
  assert.equal(hopUsedTls("Microsoft", "(version=TLS1_2, cipher=X)"), true);
  assert.equal(hopUsedTls("Microsoft", ""), null);
  assert.equal(hopUsedTls(null, ""), null);
});

/* -------------------------------------------------------------- Received */
t("Postfix Received line", () => {
  const r = parseReceived(
    "from mail.example.org (mail.example.org [192.0.2.25]) (using TLSv1.3 with cipher TLS_AES_256_GCM_SHA384 (256/256 bits)) (No client certificate requested) by mx.example.net (Postfix) with ESMTPS id 4F2A1C0123 for <bob@example.net>; Tue, 13 Oct 2026 16:14:03 +0000 (UTC)",
  );
  assert.equal(r.fromName, "mail.example.org");
  assert.equal(r.byName, "mx.example.net");
  assert.equal(r.protocol, "ESMTPS");
  assert.equal(r.id, "4F2A1C0123");
  assert.equal(r.recipient, "<bob@example.net>");
  assert.deepEqual(r.fromIps.map((i) => i.address), ["192.0.2.25"]);
  assert.equal(r.tls, true);
  assert.equal(iso(r.time!), "2026-10-13T16:14:03.000Z");
});
t("qmail and missing date", () => {
  const q = parseReceived("(qmail 12345 invoked from network); 5 Jan 2024 10:00:00 -0000");
  assert.equal(q.fromName, null);
  assert.equal(iso(q.time!), "2024-01-05T10:00:00.000Z");
  const nodate = parseReceived("from a by b with SMTP");
  assert.equal(nodate.time, null);
  assert.ok(/no semicolon/.test(nodate.dateError!));
  const semiInComment = parseReceived("from a (x; y) by b; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(iso(semiInComment.time!), "2024-01-01T00:00:00.000Z");
});
t("hops run bottom up with delays", () => {
  const hops = buildHops([
    "from c by d; Mon, 1 Jan 2024 00:10:05 +0000",
    "from b by c; Mon, 1 Jan 2024 00:00:05 +0000",
    "from a by b; Mon, 1 Jan 2024 00:00:00 +0000",
  ]);
  assert.deepEqual(hops.map((h) => h.fromName), ["a", "b", "c"]);
  assert.deepEqual(hops.map((h) => h.delay), [null, 5, 600]);
  assert.equal(formatDuration(600), "10 min");
  assert.equal(formatDuration(125), "2 min 5 s");
  assert.equal(formatDuration(-12), "-12 s");
  assert.equal(formatDuration(90061), "1 d 1 h");
});

t("connecting address per MTA style", () => {
  // Postfix: HELO name, then (reverse DNS [peer]).
  const postfix = parseReceived("from [192.168.1.20] (unknown [198.51.100.7]) by mail.example.com (Postfix) with ESMTPSA id 4F; Tue, 13 Oct 2026 16:14:03 +0000");
  assert.equal(postfix.peerIp?.address, "198.51.100.7");
  assert.equal(postfix.heloIp?.address, "192.168.1.20");
  // Exim: bare [peer] then (helo=...).
  const exim = parseReceived("from [192.0.2.1] (helo=mail.example.org) by mx.example.net with esmtps (TLS1.3) id 1q; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(exim.peerIp?.address, "192.0.2.1");
  assert.equal(exim.heloIp, null);
  assert.equal(exim.tls, true);
  // Exim with a name: name ([peer] helo=...).
  const exim2 = parseReceived("from mail.example.org ([192.0.2.9] helo=mail.example.org) by mx.example.net with esmtp id 2q; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(exim2.peerIp?.address, "192.0.2.9");
  // Sendmail, nested comment.
  const sendmail = parseReceived("from host.example.org (host.example.org [192.0.2.44] (may be forged)) by mx.example.net (8.15.2/8.15.2) with ESMTP id x; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(sendmail.peerIp?.address, "192.0.2.44");
  // Postfix over IPv6.
  const v6 = parseReceived("from mail.example.org (mail.example.org [IPv6:2001:db8::25]) by mx.example.net with ESMTPS id y; Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(v6.peerIp?.address, "2001:db8::25");
  assert.equal(v6.peerIp?.kind, "documentation");
});
t("private connecting address at hop 1 and mid path", () => {
  const a = analyze(
    "Received: from relay.example.org (relay.example.org [192.0.2.5]) by mx.example.net with ESMTPS id 2; Mon, 1 Jan 2024 00:00:09 +0000\n" +
      "Received: from gw.example.org (gw.example.org [10.0.0.2]) by relay.example.org with ESMTP id 1; Mon, 1 Jan 2024 00:00:05 +0000\n" +
      "Received: from laptop (unknown [10.0.0.50]) by gw.example.org with ESMTPSA id 0; Mon, 1 Jan 2024 00:00:00 +0000\nFrom: a@example.org",
  );
  assert.ok(has(a, "info", /Hop 1 was submitted from 10.0.0.50/));
  // Hop 2 is still inside the sender's network: nothing public has been crossed yet.
  assert.ok(!a.findings.some((f) => /Hop 2 was handed over/.test(f.text)));
  assert.deepEqual(a.hops.map((h) => h.delay), [null, 5, 4]);
});
t("Received-SPF stands in when there is no Authentication-Results", () => {
  const a = analyze('Received-SPF: Fail (mx.example.net: domain of a@example.org does not designate 192.0.2.1 as permitted sender) client-ip=192.0.2.1; envelope-from="a@example.org";\nFrom: a@example.org');
  assert.ok(has(a, "danger", /Received-SPF fail for a@example.org/));
  const b = analyze("Received-SPF: neutral (x) client-ip=192.0.2.1;\nFrom: a@example.org");
  assert.ok(has(b, "warn", /RFC 7208 section 2.6.2/));
});

/* ----------------------------------------------- Authentication-Results */
t("RFC 8601 appendix B examples", () => {
  const none = parseAuthResults("example.org 1; none");
  assert.equal(none.authservId, "example.org");
  assert.equal(none.none, true);
  const b3 = parseAuthResults("example.com; spf=pass smtp.mailfrom=example.net");
  assert.equal(b3.results[0].method, "spf");
  assert.equal(b3.results[0].result, "pass");
  assert.equal(b3.results[0].props[0].value, "example.net");
  const b4 = parseAuthResults("example.com; auth=pass (cram-md5) smtp.auth=sender@example.net; spf=pass smtp.mailfrom=example.net");
  assert.deepEqual(b4.results.map((r) => r.method), ["auth", "spf"]);
  assert.deepEqual(b4.results[0].comments, ["cram-md5"]);
  const b6 = parseAuthResults(
    'example.com; dkim=pass reason="good signature" header.i=@mail-router.example.net; dkim=fail reason="bad signature" header.i=@newyork.example.com',
  );
  assert.equal(b6.results[0].reason, "good signature");
  assert.equal(b6.results[1].result, "fail");
  assert.equal(b6.results[1].props[0].value, "@newyork.example.com");
  const versioned = parseAuthResults("mx.example.org; dkim/1=pass header.d=example.org");
  assert.equal(versioned.results[0].method, "dkim");
  const ms = parseAuthResults("spf=pass (sender IP is 192.0.2.1) smtp.mailfrom=example.com; dkim=pass (signature was verified) header.d=example.com;dmarc=pass action=none header.from=example.com;compauth=pass reason=100");
  assert.equal(ms.authservId, null);
  assert.deepEqual(ms.results.map((r) => `${r.method}=${r.result}`), ["spf=pass", "dkim=pass", "dmarc=pass", "compauth=pass"]);
  assert.equal(ms.results[3].reason, "100");
  const arc = parseAuthResults("i=1; mx.example.net; dkim=pass header.d=example.com", "ARC-Authentication-Results");
  assert.equal(arc.arcInstance, 1);
  assert.equal(arc.authservId, "mx.example.net");
  const spf = parseReceivedSpf('Pass (mybox.example.org: domain of myname@example.com designates 192.0.2.1 as permitted sender) receiver=mybox.example.org; client-ip=192.0.2.1; envelope-from="myname@example.com"; helo=foo.example.com;');
  assert.equal(spf.result, "pass");
  assert.equal(spf.pairs["client-ip"], "192.0.2.1");
  assert.equal(spf.pairs["envelope-from"], "myname@example.com");
});

/* ------------------------------------------------------- encoded-words */
t("RFC 2047 section 8 examples", () => {
  const d = (s: string) => decodeEncodedWords(s).text;
  assert.equal(d("=?US-ASCII?Q?Keith_Moore?= <moore@cs.utk.edu>"), "Keith Moore <moore@cs.utk.edu>");
  assert.equal(d("=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <keld@dkuug.dk>"), "Keld Jørn Simonsen <keld@dkuug.dk>");
  assert.equal(d("=?ISO-8859-1?Q?Andr=E9?= Pirard <PIRARD@vm1.ulg.ac.be>"), "André Pirard <PIRARD@vm1.ulg.ac.be>");
  assert.equal(
    d("=?ISO-8859-1?B?SWYgeW91IGNhbiByZWFkIHRoaXMgeW8=?=\r\n    =?ISO-8859-2?B?dSB1bmRlcnN0YW5kIHRoZSBleGFtcGxlLg==?="),
    "If you can read this you understand the example.",
  );
  assert.equal(d("(=?ISO-8859-1?Q?a?=)"), "(a)");
  assert.equal(d("(=?ISO-8859-1?Q?a?= b)"), "(a b)");
  assert.equal(d("(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)"), "(ab)");
  assert.equal(d("(=?ISO-8859-1?Q?a?=  =?ISO-8859-1?Q?b?=)"), "(ab)");
  assert.equal(d("(=?ISO-8859-1?Q?a?=\r\n    =?ISO-8859-1?Q?b?=)"), "(ab)");
  assert.equal(d("(=?ISO-8859-1?Q?a_b?=)"), "(a b)");
  assert.equal(d("(=?ISO-8859-1?Q?a?= =?ISO-8859-2?Q?_b?=)"), "(a b)");
  // RFC 2231 section 5 language tag.
  assert.equal(d("=?US-ASCII*EN?Q?Keith_Moore?="), "Keith Moore");
  // A UTF-8 character split across two words (forbidden but common): 0xC3 | 0xA9.
  assert.equal(d("=?UTF-8?B?Y2Fmww==?= =?UTF-8?B?qQ==?="), "café");
  const bad = decodeEncodedWords("=?x-nope?Q?abc?= and =?UTF-8?B?!!!?=");
  assert.equal(bad.text, "=?x-nope?Q?abc?= and =?UTF-8?B?!!!?=");
  assert.equal(bad.errors.length, 2);
  const badB64 = decodeEncodedWords("=?UTF-8?B?QQQQQ?=");
  assert.equal(badB64.errors.length, 1);
  assert.equal(decodeEncodedWords("plain").hadEncodedWords, false);
  assert.doesNotThrow(() => decodeEncodedWords("=?UTF-8?Q?a?= ".repeat(10000)));
});

/* --------------------------------------------------------------- mailboxes */
t("address lists", () => {
  const a = parseAddressList('"Doe, John" <john@example.com>, jane@example.org (Jane Roe), =?UTF-8?Q?Jos=C3=A9?= <jose@Example.NET.>');
  assert.equal(a.length, 3);
  assert.equal(a[0].display, "Doe, John");
  assert.equal(a[0].domain, "example.com");
  assert.equal(a[1].address, "jane@example.org");
  assert.equal(a[1].display, "Jane Roe");
  assert.equal(a[2].display, "José");
  assert.equal(a[2].domain, "example.net");
  assert.deepEqual(parseAddressList("undisclosed-recipients:;"), []);
  assert.equal(parseAddressList("<>")[0].nullPath, true);
  assert.equal(parseAddressList("<@relay.example:user@example.com>")[0].address, "user@example.com");
  assert.equal(parseAddressList("Team: a@example.com, b@example.org;").length, 2);
});
t("organizational domain and alignment", () => {
  assert.equal(organizationalDomain("mail.example.com"), "example.com");
  assert.equal(organizationalDomain("a.b.example.co.uk"), "example.co.uk");
  assert.equal(organizationalDomain("example.com."), "example.com");
  assert.equal(relaxedAligned("bounces.example.com", "example.com"), true);
  assert.equal(relaxedAligned("example.net", "example.com"), false);
  assert.equal(relaxedAligned(null, "example.com"), false);
});
t("suspicious text", () => {
  assert.equal(mixedScriptWord("Recovery Accоunt"), "Accоunt");
  assert.equal(mixedScriptWord("Привет world"), null);
  assert.deepEqual(hiddenCharacters("pay‮fdp.exe"), ["bidirectional control characters"]);
  assert.deepEqual(hiddenCharacters("pay​pal"), ["zero width or invisible characters"]);
});

/* ------------------------------------------------------------- examples */
t("example: clean", () => {
  const a = analyze(EXAMPLE_HEADERS[0].text);
  assert.equal(a.hops.length, 3);
  assert.deepEqual(a.hops.map((h) => h.delay), [null, 3, 1]);
  assert.equal(a.transitSeconds, 4);
  assert.deepEqual(a.hops[0].fromIps.map((i) => `${i.address}/${i.kind}`), ["192.168.1.20/private", "198.51.100.7/documentation"]);
  assert.equal(a.hops[0].protocol, "ESMTPSA");
  assert.equal(a.hops[1].tls, true);
  assert.ok(has(a, "ok", /SPF pass/));
  assert.ok(has(a, "ok", /DKIM pass for example.com/));
  assert.ok(has(a, "ok", /DMARC pass/));
  assert.equal(a.hops[0].peerIp?.address, "198.51.100.7");
  assert.equal(a.hops[0].heloIp?.address, "192.168.1.20");
  assert.ok(has(a, "info", /Hop 1's client introduced itself as \[192.168.1.20\]/));
  assert.ok(!a.findings.some((f) => f.tone === "danger" || f.tone === "warn"), JSON.stringify(a.findings));
  assert.equal(a.messageId?.domain, "mail.example.com");
  assert.equal(a.dkimSignatures[0].dnsName, "s2026._domainkey.example.com");
  // The example's signature, unfolded, is the real one generated for the DKIM example.
  const field = a.fields.find((f) => f.name === "DKIM-Signature")!;
  const sig = analyzeSignature(field.value, Date.UTC(2026, 9, 30));
  assert.ok(sig.kind === "ok" && sig.value.signatureBytes === 256);
  assert.ok(field.value.replace(/\s+/g, "").includes("b=N8KqlcKdbMRosuDErJnhP3GglQSW6VBART89quJcTmlzXrquIoCiEAKlBXcqwNbvk327J+AQvgZsOIzWHjFvgzSOk92h+uqS0Pn8NCkXHwHjSHGYccZ0cXt01mnp0OExnRcBvmV8JcOLl3n0d4XRg+wyE+hUniBfaty9muX4jnyx8KbobwgmhOvn25vPFWWpL07qSEladUAqilBPmhlZzl6RuniNZbnm44VJRJgHnzVtSlCPjKf1T9OAC4zQXVVK9YsxB+3gnWGWINI2Lw9JeoVblleNjy10zNZpyJuOytcpGH1/GCjH4uBxH6IvMdpGgBKgOuZ/cP86u5Cb9BC2tQ=="));
  assert.ok(a.domains.every((d) => d.aligned !== false), JSON.stringify(a.domains));
});
t("example: phishing", () => {
  const a = analyze(EXAMPLE_HEADERS[1].text);
  assert.equal(a.subject, "Urgent: verify your account within 24 hours");
  assert.deepEqual(a.hops.map((h) => h.delay), [null, 2, 2436]);
  assert.ok(has(a, "danger", /display name contains the address security@bank.example/));
  assert.ok(has(a, "warn", /SPF softfail/));
  assert.ok(has(a, "warn", /DKIM none/));
  assert.ok(has(a, "warn", /DMARC none/));
  assert.ok(has(a, "warn", /Hop 3 is stamped 40 min 36 s after/));
  assert.ok(has(a, "warn", /Hop 2 was handed over from 10.20.30.40/));
  assert.equal(a.hops[0].peerIp?.address, "203.0.113.77");
  assert.ok(has(a, "warn", /Reply-To sends answers to mailbox.test/));
  assert.ok(has(a, "warn", /Reply-To display name has a word/));
  assert.ok(has(a, "warn", /SpamAssassin/));
  assert.ok(has(a, "warn", /Date field is 46 min 20 s later/));
  assert.ok(has(a, "info", /PHP/));
  assert.ok(has(a, "info", /Return-Path/));
  assert.equal(a.encoded.length, 2);
});
t("example: exchange style, forwarded", () => {
  const a = analyze(EXAMPLE_HEADERS[2].text);
  assert.equal(a.hops.length, 3);
  assert.equal(a.hops[0].fromName, "lists.example.org");
  assert.equal(a.hops[0].peerIp?.address, "198.51.100.88");
  assert.deepEqual(a.hops[0].fromIps.map((i) => i.address), ["198.51.100.88"]);
  assert.deepEqual(a.hops[0].byIps.map((i) => i.kind), ["private"]);
  assert.equal(a.hops[0].tls, true);
  assert.equal(a.hops[2].protocol, "HTTPS");
  assert.equal(a.from?.display, "José Martínez");
  assert.equal(a.subject, "Re: Café network cutover, Saturday window");
  assert.ok(has(a, "info", /SPF fail for example.org.*DMARC still passed/));
  assert.ok(has(a, "ok", /composite authentication passed/));
  assert.equal(a.auth.filter((r) => r.primary).length, 4);
  assert.equal(a.receivedSpf[0].result, "fail");
  const ff = a.xHeaders.find((x) => x.name === "X-Forefront-Antispam-Report")!;
  assert.ok(/SFV NSPM \(not spam\)/.test(ff.detail ?? ""));
  assert.ok(!a.findings.some((f) => f.tone === "danger" || f.tone === "warn"), JSON.stringify(a.findings));
});
t("multiple From, no headers, upstream A-R", () => {
  const a = analyze("From: a@example.com\nFrom: b@example.org\nSubject: x\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <1@example.com>");
  assert.ok(has(a, "danger", /2 From fields/));
  const r = analyzeHeaders("just some words\nwith no colon");
  assert.equal(r.kind, "error");
  assert.equal(analyzeHeaders("   \n").kind, "empty");
  const up = analyze("Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=example.com\nAuthentication-Results: forged.example; dkim=pass header.d=example.com\nFrom: a@example.com");
  assert.ok(has(up, "info", /more than one authserv-id/));
  assert.equal(up.auth.filter((x) => x.primary).length, 1);
  const misaligned = analyze("Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=bounce@esp.example; dkim=pass header.d=esp.example\nFrom: a@example.com");
  assert.ok(has(misaligned, "warn", /would fail DMARC/));
});
t("hostile input does not throw and is capped", () => {
  const big = "Received: from a by b; Mon, 1 Jan 2024 00:00:00 +0000\n".repeat(20000);
  const a = analyze(big);
  assert.ok(a.hops.length <= 100);
  assert.ok(a.truncated || a.hopsTruncated);
  for (const junk of [
    "X: " + "(".repeat(20000),
    "Authentication-Results: " + ";=".repeat(5000),
    "From: " + "<".repeat(5000) + "@",
    "Subject: " + "=?UTF-8?B?".repeat(3000),
    "Received: " + "from by with id for via ".repeat(2000),
    "Date: " + "9".repeat(5000),
    "\u0000\u0001: \u0002",
  ]) {
    assert.doesNotThrow(() => analyzeHeaders(junk), junk.slice(0, 20));
  }
});

t("inputs that used to backtrack stay fast", () => {
  const N = 60000;
  const inputs = [
    "From: a:" + " ".repeat(N) + "x",
    "From: <" + "@a".repeat(40) + ">",
    "From: <" + "@a".repeat(N / 2) + ">",
    "Received: from " + ".".repeat(N) + "1 by x; Mon, 1 Jan 2024 00:00:00 +0000",
    "Received: from a" + ".".repeat(N) + "a by x; Mon, 1 Jan 2024 00:00:00 +0000",
    "Received: from a" + "-".repeat(N) + "a by x; Mon, 1 Jan 2024 00:00:00 +0000",
    "Received-SPF: pass " + "a".repeat(N),
    'From: "' + "a".repeat(N) + '" <x@example.com>',
    "From: " + "a".repeat(N) + " <x@example.com>",
    "Authentication-Results: x; spf=pass smtp.mailfrom=a" + ".".repeat(N) + "b",
    "Message-ID: <a@" + ".".repeat(N) + "b>",
    " a\n".repeat(80000),
    "Authentication-Results: " + ")".repeat(N),
    "Authentication-Results: x; spf=pass ) smtp.mailfrom=a@example.com )",
  ];
  for (const input of inputs) {
    const start = Date.now();
    assert.doesNotThrow(() => analyzeHeaders(input));
    const ms = Date.now() - start;
    assert.ok(ms < 1500, `${ms} ms for ${JSON.stringify(input.slice(0, 30))}`);
  }
  assert.equal(parseAddressList("<@a.example,@b.example:user@example.com>")[0].address, "user@example.com");
  const stray = parseAuthResults("x; spf=pass ) smtp.mailfrom=a@example.com");
  assert.equal(stray.results[0].props[0].value, "a@example.com");
});



/* ===================== independent verification (second agent) ===================== */
t("V1 RFC 5322 appendix A dates and section 4.3 obsolete forms", () => {
  // A.1.1: Fri, 21 Nov 1997 09:55:06 -0600 is 15:55:06 UTC.
  assert.equal(iso(date("Fri, 21 Nov 1997 09:55:06 -0600").ms), "1997-11-21T15:55:06.000Z");
  // A.5: folded with a comment, -0330 Newfoundland, rolls into the next UTC day.
  assert.equal(iso(date("Thu,\r\n      13\r\n        Feb\r\n          1969\r\n      23:32\r\n               -0330 (Newfoundland Time)").ms), "1969-02-14T03:02:00.000Z");
  // A.6.2: obsolete two digit year and GMT.
  assert.equal(iso(date("21 Nov 97 09:55:06 GMT").ms), "1997-11-21T09:55:06.000Z");
  // A.6.3: comment and whitespace inside the time.
  assert.equal(iso(date("Fri, 21 Nov 1997 09(comment):   55  :  06 -0600").ms), "1997-11-21T15:55:06.000Z");
  // Section 4.3: 00-49 add 2000, 50-99 add 1900, three digits add 1900.
  assert.equal(new Date(date("1 Jan 49 00:00:00 +0000").ms).getUTCFullYear(), 2049);
  assert.equal(new Date(date("1 Jan 50 00:00:00 +0000").ms).getUTCFullYear(), 1950);
  assert.equal(new Date(date("1 Jan 103 00:00:00 +0000").ms).getUTCFullYear(), 2003);
  // EDT is -0400, PST is -0800 (section 4.3).
  assert.equal(iso(date("1 Jul 2024 10:00:00 EDT").ms), "2024-07-01T14:00:00.000Z");
  assert.equal(iso(date("1 Jan 2024 10:00:00 PST").ms), "2024-01-01T18:00:00.000Z");
  // -0000 is UTC with the local zone unknown (section 3.3).
  assert.equal(date("1 Jan 2024 10:00:00 -0000").zoneKnown, false);
  assert.equal(date("1 Jan 2024 10:00:00 +0000").zoneKnown, true);
  // A zone name after the offset, outside parentheses, is tolerated.
  assert.equal(iso(date("Mon, 14 Oct 2024 10:12:13 +0200 CEST").ms), "2024-10-14T08:12:13.000Z");
  // Calendar checks: 2023 is not a leap year, 2024 is; 24:00 is not a time.
  assert.equal(parseRfc5322Date("29 Feb 2023 10:00:00 +0000").ok, false);
  assert.equal(parseRfc5322Date("29 Feb 2024 10:00:00 +0000").ok, true);
  assert.equal(parseRfc5322Date("1 Jan 2024 24:00:00 +0000").ok, false);
  assert.equal(parseRfc5322Date("1 Jan 1899 00:00:00 +0000").ok, false);
  assert.ok(date("Sat, 1 Jan 2024 10:00:00 +0000").notes.some((n) => /that date was a mon/.test(n)));
});

t("V2 RFC 8601 section 2.2 example with CFWS everywhere", () => {
  const r = parseAuthResults(
    "foo.example.net (foobar) 1 (baz); dkim (Because I like it) / 1 (One yay) = (wait for it) fail policy (A dot can go here) . (like that) expired (this surprised me) = (as I wasn't expecting it) 1362471462",
  );
  assert.equal(r.authservId, "foo.example.net");
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].method, "dkim");
  assert.equal(r.results[0].result, "fail");
  assert.deepEqual(r.results[0].props, [{ key: "policy.expired", value: "1362471462" }]);
  // Appendix B.2: no checks were done.
  const none = parseAuthResults("example.org 1; none");
  assert.equal(none.none, true);
  assert.equal(none.results.length, 0);
  // Appendix B.6: quoted reasons and two DKIM results.
  const b6 = parseAuthResults('example.com; dkim=pass reason="good signature" header.i=@mail-router.example.net; dkim=fail reason="bad signature" header.i=@newyork.example.com');
  assert.deepEqual(b6.results.map((x) => [x.result, x.reason, x.props[0].value]), [
    ["pass", "good signature", "@mail-router.example.net"],
    ["fail", "bad signature", "@newyork.example.com"],
  ]);
});

t("V3 RFC 7208 section 9.1 Received-SPF example", () => {
  const r = parseReceivedSpf('pass (mybox.example.org: domain of myname@example.com designates 192.0.2.1 as permitted sender) receiver=mybox.example.org; client-ip=192.0.2.1; envelope-from="myname@example.com"; helo=foo.example.com;');
  assert.equal(r.result, "pass");
  assert.equal(r.pairs["client-ip"], "192.0.2.1");
  assert.equal(r.pairs["envelope-from"], "myname@example.com");
  assert.equal(r.pairs.helo, "foo.example.com");
  assert.equal(r.pairs.receiver, "mybox.example.org");
});

t("V4 RFC 2047 section 8 display examples", () => {
  const cases: [string, string][] = [
    ["=?US-ASCII?Q?Keith_Moore?= <moore@cs.utk.edu>", "Keith Moore <moore@cs.utk.edu>"],
    ["=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <keld@dkuug.dk>", "Keld Jørn Simonsen <keld@dkuug.dk>"],
    ["=?ISO-8859-1?Q?Andr=E9?= Pirard <PIRARD@vm1.ulg.ac.be>", "André Pirard <PIRARD@vm1.ulg.ac.be>"],
    ["=?ISO-8859-1?B?SWYgeW91IGNhbiByZWFkIHRoaXMgeW8=?=\r\n    =?ISO-8859-2?B?dSB1bmRlcnN0YW5kIHRoZSBleGFtcGxlLg==?=", "If you can read this you understand the example."],
    ["(=?ISO-8859-1?Q?a?=)", "(a)"],
    ["(=?ISO-8859-1?Q?a?= b)", "(a b)"],
    ["(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)", "(ab)"],
    ["(=?ISO-8859-1?Q?a?=  =?ISO-8859-1?Q?b?=)", "(ab)"],
    ["(=?ISO-8859-1?Q?a?=\r\n    =?ISO-8859-1?Q?b?=)", "(ab)"],
    ["(=?ISO-8859-1?Q?a_b?=)", "(a b)"],
    ["(=?ISO-8859-1?Q?a?= =?ISO-8859-2?Q?_b?=)", "(a b)"],
    // A UTF-8 check mark split across two Q words still decodes.
    ["=?UTF-8?Q?=E2=9C?= =?UTF-8?Q?=93?=", "✓"],
  ];
  for (const [raw, want] of cases) assert.equal(decodeEncodedWords(raw).text, want, raw);
  const bad = decodeEncodedWords("=?x-unknown-charset?Q?a?=");
  assert.equal(bad.text, "=?x-unknown-charset?Q?a?=");
  assert.equal(bad.errors.length, 1);
});

t("V5 Received parsing: RFC 5321 shapes and TLS without false positives", () => {
  const d = parseReceived("from bar.com by foo.com ; Thu, 21 May 1998 05:33:29 -0700");
  assert.equal(d.fromName, "bar.com");
  assert.equal(d.byName, "foo.com");
  assert.equal(iso(d.time!), "1998-05-21T12:33:29.000Z");
  // A host name containing "tls" is not evidence of TLS.
  assert.equal(parseReceived("from tls.example.com (tls.example.com [203.0.113.9]) by mx.example.net (Postfix) with ESMTP id A; Mon, 14 Oct 2024 10:12:13 +0000").tls, false);
  assert.equal(parseReceived("from TLS-gw.example.com (TLS-gw.example.com [203.0.113.9]) by mx.example.net with SMTP id A; Mon, 14 Oct 2024 10:12:13 +0000").tls, false);
  // Gmail notes TLS after the id; Sendmail in the by comment.
  assert.equal(parseReceived("from a.example.org (a.example.org. [192.0.2.1]) by mx.example.net with SMTP id x for <b@example.net> (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256); Mon, 14 Oct 2024 10:12:13 -0700").tls, true);
  assert.equal(parseReceived("from a.example.org (a.example.org [192.0.2.1]) by mx.example.net (8.15.2/8.15.2) with ESMTP id x (version=TLSv1/SSLv3 cipher=DHE-RSA-AES256-SHA bits=256 verify=NOT); Mon, 14 Oct 2024 10:12:13 +0000").tls, true);
  assert.equal(hopUsedTls("ESMTP", "(mail.tls.example.com [192.0.2.1])"), false);
  // A semicolon with nothing after it is a missing date, said plainly.
  assert.ok(/nothing follows the final semicolon/.test(parseReceived("from x by y;").dateError!));
});

t("V6 IP range boundaries (RFC 1918, RFC 6598, RFC 4193, RFC 4291, RFC 9637)", () => {
  const k = (ip: string) => classifyIp(ip)?.kind ?? null;
  assert.equal(k("172.15.255.255"), "public");
  assert.equal(k("172.16.0.0"), "private");
  assert.equal(k("172.31.255.255"), "private");
  assert.equal(k("172.32.0.0"), "public");
  assert.equal(k("100.63.255.255"), "public");
  assert.equal(k("100.64.0.0"), "shared");
  assert.equal(k("100.127.255.255"), "shared");
  assert.equal(k("100.128.0.0"), "public");
  assert.equal(k("febf:ffff::1"), "link-local");
  assert.equal(k("fec0::1"), "reserved");
  assert.equal(k("fbff::1"), "reserved");
  assert.equal(k("fc00::1"), "unique-local");
  assert.equal(k("fdff:ffff::1"), "unique-local");
  assert.equal(k("3fff:fff::1"), "documentation");
  assert.equal(k("3fff:1000::1"), "public");
  assert.equal(k("::ffff:192.168.0.1"), "private");
  assert.equal(k("010.0.0.1"), null);
  assert.equal(k("1::2::3"), null);
  assert.equal(k("1:2:3:4:5:6:7:8:9"), null);
});

t("V7 hop delays across time zones and the 5 minute threshold", () => {
  const head = (a: string, b: string) => `Received: from b.example.net (b.example.net [192.0.2.2]) by c.example.net; ${b}
Received: from a.example.org (a.example.org [192.0.2.1]) by b.example.net; ${a}
From: x@example.org
Date: ${a}
Message-ID: <1@example.org>`;
  const at300 = analyze(head("Mon, 14 Oct 2024 09:00:00 -0700", "Mon, 14 Oct 2024 16:05:00 +0000"));
  assert.equal(at300.hops[1].delay, 300);
  assert.equal(at300.transitSeconds, 300);
  assert.ok(!has(at300, "warn", /stamped .* after the hop before it/));
  const at301 = analyze(head("Mon, 14 Oct 2024 09:00:00 -0700", "Mon, 14 Oct 2024 16:05:01 +0000"));
  assert.ok(has(at301, "warn", /Hop 2 is stamped 5 min 1 s after/));
  const back = analyze(head("Mon, 14 Oct 2024 09:00:00 -0700", "Mon, 14 Oct 2024 15:58:00 +0000"));
  assert.equal(back.hops[1].delay, -120);
  assert.ok(has(back, "warn", /2 min earlier than the hop before it/));
});

t("V8 address checks: Sender with several From mailboxes, Message-ID literal, null path", () => {
  const multi = analyze("From: a@example.com, b@example.org\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <x@example.com>");
  assert.ok(has(multi, "warn", /requires a Sender field/));
  const withSender = analyze("From: a@example.com, b@example.org\nSender: a@example.com\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <x@example.com>");
  assert.ok(!withSender.findings.some((f) => /Sender field/.test(f.text)));
  const lit = analyze("From: a@example.com\nMessage-ID: <abc@[192.0.2.1]>\nDate: Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(lit.messageId?.domain, "[192.0.2.1]");
  const mid = analyze("From: a@example.com\nMessage-ID: <20261013.4F2A1@Mail.Example.COM>\nDate: Mon, 1 Jan 2024 00:00:00 +0000");
  assert.equal(mid.messageId?.domain, "mail.example.com");
  const bounce = analyze("Return-Path: <>\nFrom: MAILER-DAEMON@example.com\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <x@example.com>");
  assert.equal(bounce.returnPath?.nullPath, true);
  assert.ok(has(bounce, "info", /null reverse path/));
  const twoFrom = analyze("From: a@example.com\nFrom: b@example.org\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <x@example.com>");
  assert.ok(has(twoFrom, "danger", /There are 2 From fields/));
  const twoCc = analyze("From: a@example.com\nCc: b@example.org\nCc: c@example.org\nDate: Mon, 1 Jan 2024 00:00:00 +0000\nMessage-ID: <x@example.com>");
  assert.ok(has(twoCc, "warn", /There are 2 Cc fields/));
});

t("V9 alignment: relaxed versus exact, multi-label suffixes", () => {
  assert.equal(organizationalDomain("mail.example.co.uk"), "example.co.uk");
  assert.equal(organizationalDomain("a.b.example.com"), "example.com");
  assert.equal(relaxedAligned("bounce.example.com", "example.com"), true);
  assert.equal(relaxedAligned("example.co.uk", "other.co.uk"), false);
  const a = analyze(`Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=bounce@mailer.example.com; dkim=pass header.d=example.com
Return-Path: <bounce@mailer.example.com>
From: news@example.com
Date: Mon, 1 Jan 2024 00:00:00 +0000
Message-ID: <x@example.com>`);
  const rp = a.domains.find((d) => d.role === "Return-Path")!;
  assert.equal(rp.aligned, true);
  assert.equal(rp.strict, false);
  assert.ok(!has(a, "warn", /would fail DMARC/));
  const b = analyze(`Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=bounce@esp.example.net; dkim=pass header.d=esp.example.net
From: news@example.com
Date: Mon, 1 Jan 2024 00:00:00 +0000
Message-ID: <x@example.com>`);
  assert.ok(has(b, "warn", /would fail DMARC/));
});

t("V10 adversarial pastes never throw and stay fast", () => {
  const inputs = [
    "\u0000\u0001\u0002", ":".repeat(100000), "A: " + "=?".repeat(100000), "Received: " + ";".repeat(100000),
    "Received: from " + "[".repeat(50000) + "; 1 Jan 2024 00:00:00 +0000", "Date: " + "1 ".repeat(50000),
    "From: " + "<".repeat(50000), "Authentication-Results: " + "a/".repeat(50000), "Authentication-Results: x; " + "a . ".repeat(30000),
    "Subject: " + "\ud800".repeat(10000), "X-Forefront-Antispam-Report: " + "SCL:9;".repeat(20000),
    "From: \"" + "а".repeat(10000) + "\" <a@example.com>", "Received: from x by y; 31 Feb 2024 25:61:61 +9999",
  ];
  const start = Date.now();
  for (const input of inputs) analyzeHeaders(input);
  assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
});

console.log(`email-header-analyzer: ${passed} tests passed`);

/* ===================== third verifier: additional reference cases ===================== */
import * as E3 from "../../client/src/lib/toolkit/email-header-analyzer.ts";
{
  let n3 = 0;
  const c3 = (name: string, fn: () => void) => {
    try { fn(); n3++; } catch (e) { console.error(`FAIL v3 ${name}`); throw e; }
  };
  const date = (s: string) => { const r = E3.parseRfc5322Date(s); if (!r.ok) throw new Error(r.error); return r.value; };

  c3("RFC 5322 appendix A dates", () => {
    assert.equal(date("Fri, 21 Nov 1997 09:55:06 -0600").ms, Date.UTC(1997, 10, 21, 15, 55, 6));
    assert.equal(date("Tue, 1 Jul 2003 10:52:37 +0200").ms, Date.UTC(2003, 6, 1, 8, 52, 37));
    // A.5: folded, no seconds, comment after the zone.
    assert.equal(date("Thu,\r\n      13\r\n        Feb\r\n          1969\r\n      23:32\r\n               -0330 (Newfoundland Time)").ms, Date.UTC(1969, 1, 14, 3, 2, 0));
    // A.6.2 obsolete: two digit year and named zone.
    assert.equal(date("21 Nov 97 09:55:06 GMT").ms, Date.UTC(1997, 10, 21, 9, 55, 6));
    assert.equal(date("Fri, 21 Nov 1997 09(comment):   55  :  06 -0600").ms, Date.UTC(1997, 10, 21, 15, 55, 6));
  });

  c3("RFC 5322 section 4.3 year rules and zones", () => {
    assert.equal(new Date(date("1 Jan 49 00:00:00 +0000").ms).getUTCFullYear(), 2049);
    assert.equal(new Date(date("1 Jan 50 00:00:00 +0000").ms).getUTCFullYear(), 1950);
    assert.equal(new Date(date("1 Jan 103 00:00:00 +0000").ms).getUTCFullYear(), 2003);
    assert.equal(date("1 Jan 2024 00:00:00 -0000").zoneKnown, false);
    assert.equal(date("1 Jan 2024 12:00:00 EDT").ms, Date.UTC(2024, 0, 1, 16, 0, 0));
    assert.equal(date("1 Jan 2024 12:00:00 PST").ms, Date.UTC(2024, 0, 1, 20, 0, 0));
    assert.equal(date("29 Feb 2024 00:00:00 +0000").ms, Date.UTC(2024, 1, 29));
    for (const bad of ["29 Feb 2023 00:00:00 +0000", "31 Apr 2024 00:00:00 +0000", "1 Foo 2024 00:00:00 +0000", "1 Jan 2024 24:00:00 +0000", "1 Jan 2024 00:00:00 +0160", "1 Jan 1899 00:00:00 +0000", "", "garbage"]) {
      assert.equal(E3.parseRfc5322Date(bad).ok, false, bad);
    }
    assert.ok(date("Mon, 1 Jan 2025 00:00:00 +0000").notes.some((n) => /wed/.test(n)));
  });

  c3("RFC 2047 section 8 examples", () => {
    const d = (s: string) => E3.decodeEncodedWords(s).text;
    assert.equal(d("=?US-ASCII?Q?Keith_Moore?= <moore@cs.utk.edu>"), "Keith Moore <moore@cs.utk.edu>");
    assert.equal(d("=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <keld@dkuug.dk>"), "Keld Jørn Simonsen <keld@dkuug.dk>");
    assert.equal(d("=?ISO-8859-1?Q?Andr=E9?= Pirard <PIRARD@vm1.ulg.ac.be>"), "André Pirard <PIRARD@vm1.ulg.ac.be>");
    assert.equal(d("(=?ISO-8859-1?Q?a?=)"), "(a)");
    assert.equal(d("(=?ISO-8859-1?Q?a?= b)"), "(a b)");
    assert.equal(d("(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)"), "(ab)");
    assert.equal(d("(=?ISO-8859-1?Q?a?=  =?ISO-8859-1?Q?b?=)"), "(ab)");
    assert.equal(d("(=?ISO-8859-1?Q?a?=\r\n    =?ISO-8859-1?Q?b?=)"), "(ab)");
    assert.equal(d("(=?ISO-8859-1?Q?a_b?=)"), "(a b)");
    assert.equal(d("(=?ISO-8859-1?Q?a?= =?ISO-8859-2?Q?_b?=)"), "(a b)");
    assert.equal(d("=?UTF-8?B?w6k=?="), "é");
    assert.equal(d("=?UTF-8?Q?=C3?= =?UTF-8?Q?=A9?="), "é");
    assert.equal(d("=?utf-8*en?Q?hi?="), "hi");
    const bad = E3.decodeEncodedWords("=?x-no-such-charset?Q?a?=");
    assert.equal(bad.text, "=?x-no-such-charset?Q?a?=");
    assert.equal(bad.errors.length, 1);
    const badB = E3.decodeEncodedWords("=?UTF-8?B?@@@@?=");
    assert.equal(badB.errors.length, 1);
  });

  c3("RFC 8601 appendix B examples", () => {
    const b2 = E3.parseAuthResults("example.org 1; none");
    assert.equal(b2.authservId, "example.org");
    assert.equal(b2.none, true);
    assert.equal(b2.results.length, 0);
    const b3 = E3.parseAuthResults("example.com; spf=pass smtp.mailfrom=example.net");
    assert.equal(b3.authservId, "example.com");
    assert.equal(b3.results[0].method, "spf");
    assert.equal(E3.authIdentity(b3.results[0]), "example.net");
    const b4 = E3.parseAuthResults("example.com;\r\n auth=pass (cram-md5) smtp.auth=sender@example.net;\r\n spf=pass smtp.mailfrom=example.net");
    assert.equal(b4.results.length, 2);
    assert.deepEqual(b4.results[0].comments, ["cram-md5"]);
    assert.equal(E3.prop(b4.results[0], "smtp.auth"), "sender@example.net");
    const b6 = E3.parseAuthResults('example.com;\r\n dkim=pass reason="good signature"\r\n header.i=@mail-router.example.net;\r\n dkim=fail reason="bad signature"\r\n header.i=@newyork.example.com');
    assert.equal(b6.results[0].reason, "good signature");
    assert.equal(b6.results[1].result, "fail");
    assert.equal(E3.domainOf(E3.authIdentity(b6.results[1])), "newyork.example.com");
    const ver = E3.parseAuthResults("mx.example.com; dkim/1=pass header.d=example.com");
    assert.equal(ver.results[0].method, "dkim");
  });

  c3("IP parsing and classification (RFC 4291, RFC 6890)", () => {
    const k = (s: string) => E3.classifyIp(s)?.kind ?? null;
    assert.equal(k("10.0.0.1"), "private");
    assert.equal(k("172.15.255.255"), "public");
    assert.equal(k("172.16.0.0"), "private");
    assert.equal(k("172.31.255.255"), "private");
    assert.equal(k("172.32.0.0"), "public");
    assert.equal(k("100.64.0.1"), "shared");
    assert.equal(k("100.128.0.1"), "public");
    assert.equal(k("192.0.2.1"), "documentation");
    assert.equal(k("255.255.255.255"), "reserved");
    assert.equal(k("010.0.0.1"), null);
    assert.equal(k("256.0.0.1"), null);
    assert.equal(k("::1"), "loopback");
    assert.equal(k("::"), "unspecified");
    assert.equal(k("::ffff:192.168.1.1"), "private");
    assert.equal(k("fe80::1%eth0"), "link-local");
    assert.equal(k("fd12:3456::1"), "unique-local");
    assert.equal(k("2001:db8::1"), "documentation");
    assert.equal(k("2607:f8b0:4864:20::42f"), "public");
    assert.equal(k("[IPv6:2001:db8::5]"), "documentation");
    for (const bad of ["1:2:3:4:5:6:7:8:9", "1::2::3", "12345::", ":1:2:3:4:5:6:7", "g::1"]) assert.equal(k(bad), null, bad);
    assert.equal(E3.parseIPv6("1:2:3:4:5:6:7:8"), 0x00010002000300040005000600070008n);
    assert.equal(E3.parseIPv6("::ffff:1.2.3.4"), 0xffff01020304n);
    const ips = E3.extractIps("from x (host [203.0.113.5]:2525) at 09:14:07 id a1b2c3 IPv6:2001:db8::1");
    assert.deepEqual(ips.map((i) => i.address), ["203.0.113.5", "2001:db8::1"]);
  });

  c3("unfolding and Received order", () => {
    const s = E3.splitHeaders("Subject: This\r\n is a test\r\nX-A: 1\r\n\r\nbody: not a header");
    assert.equal(s.fields[0].value, "This is a test");
    assert.equal(s.fields.length, 2);
    assert.equal(s.bodyLinesIgnored, 1);
    const a = E3.analyzeHeaders(`Received: from b.example.net (b.example.net [198.51.100.2]) by c.example.org; Mon, 1 Jan 2024 00:10:00 +0000
Received: from a.example.com (a.example.com [192.0.2.1]) by b.example.net; Mon, 1 Jan 2024 00:00:30 +0000
Received: from [10.0.0.5] (pc [10.0.0.5]) by a.example.com; Mon, 1 Jan 2024 00:00:00 +0000
From: x@example.com`);
    assert.equal(a.kind, "ok");
    if (a.kind !== "ok") return;
    assert.deepEqual(a.value.hops.map((h) => h.byName), ["a.example.com", "b.example.net", "c.example.org"]);
    assert.deepEqual(a.value.hops.map((h) => h.delay), [null, 30, 570]);
    assert.equal(a.value.hops[0].peerIp?.kind, "private");
    assert.equal(a.value.transitSeconds, 600);
    assert.ok(a.value.findings.some((f) => f.tone === "warn" && /Hop 3/.test(f.text) && /9 min 30 s/.test(f.text)));
    assert.ok(!a.value.findings.some((f) => /Hop 1 was handed over/.test(f.text)));
  });

  c3("organizational domain and alignment", () => {
    assert.equal(E3.organizationalDomain("mail.example.co.uk"), "example.co.uk");
    assert.equal(E3.organizationalDomain("a.b.example.com."), "example.com");
    assert.equal(E3.relaxedAligned("bounce.example.com", "example.com"), true);
    assert.equal(E3.relaxedAligned("example.com", "badexample.com"), false);
    assert.equal(E3.relaxedAligned(null, "example.com"), false);
  });

  c3("addresses", () => {
    const m = E3.parseAddressList('"Doe, John" <john@Example.COM.>, jane@example.org (Jane)');
    assert.equal(m.length, 2);
    assert.equal(m[0].display, "Doe, John");
    assert.equal(m[0].domain, "example.com");
    assert.equal(m[1].display, "Jane");
    assert.equal(E3.parseAddressList("undisclosed-recipients:;").length, 0);
    assert.equal(E3.parseAddressList("<>")[0].nullPath, true);
    assert.equal(E3.parseAddressList("<@relay.example:user@example.net>")[0].address, "user@example.net");
  });

  c3("hostile input never throws", () => {
    const pieces = ["Received:", "from", "by", "(", ")", ";", "[", "]", "::", ".", "=?", "?=", "UTF-8", "?B?", "?Q?", "\r\n ", "\n", " ", "\t", "\"", "\\", "<", ">", "@", ",", ":", "1 Jan 2024 00:00:00 +0000", "Authentication-Results:", "spf=", "pass", "From:", "Date:", "\u{1F600}", "\ud800", "‮", "а"];
    const start = Date.now();
    for (let n = 0; n < 1500; n++) {
      let s = "";
      const len = Math.floor(Math.random() * 200);
      for (let i = 0; i < len; i++) s += pieces[Math.floor(Math.random() * pieces.length)];
      E3.analyzeHeaders(s);
    }
    E3.analyzeHeaders("Received: " + "(".repeat(300000));
    E3.analyzeHeaders("X: " + "1.2.3.4 ".repeat(40000));
    E3.analyzeHeaders(("Received: from a by b; 1 Jan 2024 00:00:00 +0000\n").repeat(5000));
    assert.ok(Date.now() - start < 20000, `took ${Date.now() - start} ms`);
    assert.equal(E3.analyzeHeaders("").kind, "empty");
    assert.equal(E3.analyzeHeaders("   \n\n ").kind, "empty");
    assert.equal(E3.analyzeHeaders("no colon here").kind, "error");
  });

  console.log(`email-header-analyzer third verifier: ${n3} tests passed`);
}

/* ===================== fourth verifier (independent) ===================== */
import * as E4 from "../../client/src/lib/toolkit/email-header-analyzer.ts";
{
  let n4 = 0;
  const t4 = (name: string, fn: () => void) => {
    try {
      fn();
      n4++;
    } catch (e) {
      console.error(`FAIL v4 ${name}`);
      throw e;
    }
  };
  const run = (text: string): E4.EmailAnalysis => {
    const r = E4.analyzeHeaders(text);
    if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
    return r.value;
  };
  const flagged = (a: E4.EmailAnalysis, tone: string, re: RegExp) => a.findings.some((f) => f.tone === tone && re.test(f.text));

  t4("Authentication-Results: a property value may hold = (VERP sender, base64 padding)", () => {
    const f = E4.parseAuthResults(
      "mx.example.net; dkim=pass header.i=@sender.test header.s=k1 header.b=AbCd+/==; spf=pass (mx.example.net: domain of x designates 192.0.2.5 as permitted sender) smtp.mailfrom=bounce+user=example.org@bounces.sender.test; dmarc=pass (p=NONE) header.from=sender.test",
    );
    assert.equal(f.authservId, "mx.example.net");
    assert.equal(f.results.length, 3);
    assert.equal(E4.prop(f.results[0], "header.b"), "AbCd+/==");
    assert.equal(E4.prop(f.results[0], "header.i"), "@sender.test");
    assert.equal(E4.prop(f.results[1], "smtp.mailfrom"), "bounce+user=example.org@bounces.sender.test");
    assert.equal(E4.domainOf(E4.authIdentity(f.results[1])), "bounces.sender.test");
    assert.equal(E4.prop(f.results[2], "header.from"), "sender.test");
    // method=result itself is unchanged, and a quoted reason still works.
    const q = E4.parseAuthResults('x.example; dkim=fail reason="signature = bad" header.d=a.example');
    assert.equal(q.results[0].result, "fail");
    assert.equal(q.results[0].reason, "signature = bad");
    assert.equal(E4.prop(q.results[0], "header.d"), "a.example");
    // The whole message: SPF domain is the bounce domain, relaxed aligned to From, not exact.
    const a = run(
      [
        "Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=bounce+user=example.org@bounces.example.org; dkim=none; dmarc=pass header.from=example.org",
        "Return-Path: <bounce+user=example.org@bounces.example.org>",
        "From: News <news@example.org>",
        "Date: Mon, 5 Aug 2024 13:11:55 +0000",
        "Message-ID: <1@example.org>",
      ].join("\n"),
    );
    const spf = a.domains.find((d) => d.role.startsWith("SPF"));
    assert.equal(spf?.domain, "bounces.example.org");
    assert.equal(spf?.aligned, true);
    assert.equal(spf?.strict, false);
    assert.ok(!a.domains.some((d) => d.domain?.includes("+")));
  });

  t4("a very large encoded word cannot overflow the stack, and joins the word before it", () => {
    const big = "QUJD".repeat(60000); // 240,000 base64 characters, 180,000 bytes of ABC...
    const d = E4.decodeEncodedWords(`=?UTF-8?B?REVG?= =?UTF-8?B?${big}?=`);
    assert.equal(d.text.length, 3 + 180000);
    assert.ok(d.text.startsWith("DEFABCABC"));
    assert.deepEqual(d.errors, []);
    const r = run(`Subject: =?UTF-8?B?REVG?= =?UTF-8?B?${big}?=\nFrom: a@example.com`);
    assert.equal(r.subject?.length, 180003);
    const q = E4.decodeEncodedWords(`=?UTF-8?Q?a?= =?UTF-8?Q?${"=C3=A9".repeat(50000)}?=`);
    assert.equal(q.text.length, 50001);
  });

  t4("RFC 2047 words: charsets, a split multibyte character, whitespace rules, bad input left as is", () => {
    assert.equal(E4.decodeEncodedWords("=?UTF-8?B?4pyTIFNpZ25lZA==?=").text, "\u2713 Signed");
    assert.equal(E4.decodeEncodedWords("=?utf-8?q?=E2=82=AC_5?=").text, "\u20AC 5");
    assert.equal(E4.decodeEncodedWords("=?iso-8859-15?Q?=A4_5?=").text, "\u20AC 5");
    assert.equal(E4.decodeEncodedWords("=?ISO-8859-1?Q?Andr=E9?= Pirard").text, "Andr\u00E9 Pirard");
    assert.equal(E4.decodeEncodedWords("=?UTF-8?B?4pw=?= =?UTF-8?B?kw==?=").text, "\u2713");
    // Section 6.2: whitespace between two encoded words vanishes, elsewhere it stays.
    assert.equal(E4.decodeEncodedWords("=?UTF-8?Q?a?=   \t =?UTF-8?Q?b?=").text, "ab");
    assert.equal(E4.decodeEncodedWords("=?UTF-8?Q?a?= x =?UTF-8?Q?b?=").text, "a x b");
    assert.equal(E4.decodeEncodedWords("Re: =?UTF-8?Q?caf=C3=A9?= au lait").text, "Re: caf\u00E9 au lait");
    // The charset*language form of RFC 2231 is accepted; an unknown charset and bad base64 are left alone with a message.
    assert.equal(E4.decodeEncodedWords("=?UTF-8*en?Q?hi?=").text, "hi");
    const unknown = E4.decodeEncodedWords("=?x-no-such-charset?Q?abc?=");
    assert.equal(unknown.text, "=?x-no-such-charset?Q?abc?=");
    assert.equal(unknown.errors.length, 1);
    const badB = E4.decodeEncodedWords("=?UTF-8?B?a?=");
    assert.equal(badB.text, "=?UTF-8?B?a?=");
    assert.equal(badB.errors.length, 1);
    assert.equal(E4.decodeEncodedWords("=?UTF-8?Q??=").text, "");
    assert.equal(E4.decodeEncodedWords("plain =? text ?= here").text, "plain =? text ?= here");
  });

  t4("hop delays across zones: 30 s, then 361 s crosses the 5 minute line, and the boundaries", () => {
    const received = (n: number, when: string) => `Received: from h${n}.example.net (h${n}.example.net [203.0.113.${n}])\n        by m${n}.example.org with ESMTP id Q${n}; ${when}`;
    const mk = (times: string[]) => [...times.map((w, i) => received(times.length - i, w)), "From: a@example.com"].join("\n");
    // Listed top first, so the bottom line is the first hop.
    const a = run(mk(["Tue, 13 Oct 2026 16:20:31 +0000 (UTC)", "Tue, 13 Oct 2026 18:14:30 +0200", "Tue, 13 Oct 2026 09:14:00 -0700"]));
    assert.deepEqual(a.hops.map((h) => h.delay), [null, 30, 361]);
    assert.equal(a.transitSeconds, 391);
    assert.ok(flagged(a, "warn", /Hop 3 is stamped 6 min 1 s after/));
    assert.ok(!flagged(a, "warn", /Hop 2 is stamped/));
    // Exactly 300 s is not flagged, 301 s is.
    const at300 = run(mk(["Tue, 13 Oct 2026 16:05:00 +0000", "Tue, 13 Oct 2026 16:00:00 +0000"]));
    assert.equal(at300.hops[1].delay, 300);
    assert.ok(!flagged(at300, "warn", /after the hop before it/));
    const at301 = run(mk(["Tue, 13 Oct 2026 16:05:01 +0000", "Tue, 13 Oct 2026 16:00:00 +0000"]));
    assert.ok(flagged(at301, "warn", /after the hop before it/));
    // A hop 60 s early is tolerated skew, 61 s is reported.
    assert.ok(!flagged(run(mk(["Tue, 13 Oct 2026 15:59:00 +0000", "Tue, 13 Oct 2026 16:00:00 +0000"])), "warn", /earlier than the hop before it/));
    assert.ok(flagged(run(mk(["Tue, 13 Oct 2026 15:58:59 +0000", "Tue, 13 Oct 2026 16:00:00 +0000"])), "warn", /1 min 1 s earlier than the hop before it/));
    // The same instant written in two zones is a delay of zero.
    const same = run(mk(["Tue, 13 Oct 2026 18:00:00 +0200", "Tue, 13 Oct 2026 09:00:00 -0700"]));
    assert.equal(same.hops[1].delay, 0);
  });

  t4("RFC 5322 dates: leap second, February 29, bad times, -0000", () => {
    const ok = (s: string) => {
      const r = E4.parseRfc5322Date(s);
      assert.ok(r.ok, `${s}: ${r.ok ? "" : r.error}`);
      return r.ok ? r.value : (undefined as never);
    };
    assert.equal(ok("Sat, 31 Dec 2016 23:59:60 +0000").ms, Date.UTC(2016, 11, 31, 23, 59, 60));
    assert.equal(ok("29 Feb 2028 12:00 +0000").ms, Date.UTC(2028, 1, 29, 12, 0, 0));
    assert.ok(!E4.parseRfc5322Date("29 Feb 2027 12:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("29 Feb 2100 12:00 +0000").ok); // not a leap year
    assert.ok(E4.parseRfc5322Date("29 Feb 2000 12:00 +0000").ok); // divisible by 400
    assert.ok(!E4.parseRfc5322Date("1 Jan 2020 24:00:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("1 Jan 2020 12:60:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("1 Jan 2020 12:00:61 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("32 Jan 2020 12:00:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("1 Foo 2020 12:00:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("1 Jan 1899 12:00:00 +0000").ok);
    assert.ok(!E4.parseRfc5322Date("1 Jan 2020 12:00:00 +0075").ok);
    assert.equal(ok("1 Jan 2020 12:00:00 -0000").zoneKnown, false);
    assert.equal(ok("1 Jan 2020 12:00:00 +0000").zoneKnown, true);
    assert.equal(ok("1 Jan 2020 12:00:00 +1400").ms, Date.UTC(2020, 0, 1, -2, 0, 0));
    assert.equal(ok("1 Jan 2020 12:00:00 -1200").ms, Date.UTC(2020, 0, 2, 0, 0, 0));
    assert.equal(ok("1 Jan 2020 12:00:00 PDT").ms, Date.UTC(2020, 0, 1, 19, 0, 0));
    assert.ok(ok("Tue, 1 Jan 2020 12:00:00 +0000").notes.some((n) => /was a wed/.test(n)));
    assert.ok(!ok("Wed, 1 Jan 2020 12:00:00 +0000").notes.length);
    assert.ok(!E4.parseRfc5322Date("").ok);
    assert.ok(!E4.parseRfc5322Date("x".repeat(500)).ok);
  });

  t4("addresses outside the usual ranges: mapped, NAT64, link-local with scope, shared space", () => {
    const kind = (s: string) => E4.classifyIp(s)?.kind ?? null;
    assert.equal(kind("::ffff:10.0.0.1"), "private");
    assert.equal(kind("::ffff:8.8.8.8"), "public");
    assert.equal(kind("64:ff9b::a00:1"), "private");
    assert.equal(kind("fe80::1%eth0"), "link-local");
    assert.equal(kind("100.64.0.1"), "shared");
    assert.equal(kind("100.127.255.255"), "shared");
    assert.equal(kind("100.128.0.0"), "public");
    assert.equal(kind("172.15.255.255"), "public");
    assert.equal(kind("172.16.0.0"), "private");
    assert.equal(kind("172.31.255.255"), "private");
    assert.equal(kind("172.32.0.0"), "public");
    assert.equal(kind("192.167.255.255"), "public");
    assert.equal(kind("198.18.0.1"), "reserved");
    assert.equal(kind("198.20.0.1"), "public");
    assert.equal(kind("255.255.255.255"), "reserved");
    assert.equal(kind("224.0.0.251"), "multicast");
    assert.equal(kind("fd12:3456::1"), "unique-local");
    assert.equal(kind("2606:4700:4700::1111"), "public");
    assert.equal(kind("3fff::1"), "documentation");
    assert.equal(kind("256.1.1.1"), null);
    assert.equal(kind("01.2.3.4"), null);
    assert.equal(kind("1.2.3"), null);
    assert.equal(kind("1:2:3:4:5:6:7:8:9"), null);
    assert.equal(kind("12345::1"), null);
    assert.equal(kind("::1::"), null);
    // Extraction ignores version numbers and queue ids that merely look like addresses.
    assert.deepEqual(E4.extractIps("id 15.20.6838.29 via Frontend").map((i) => i.address), []);
    assert.deepEqual(E4.extractIps("([2001:db8::1]:49912 helo=x) [192.0.2.7]:25").map((i) => i.address), ["2001:db8::1", "192.0.2.7"]);
  });

  t4("DKIM fail is a problem alone, a note when DMARC passed through something else", () => {
    const head = ["From: A <a@example.com>", "Date: Mon, 5 Aug 2024 13:11:55 +0000", "Message-ID: <1@example.com>"];
    const failAlone = run(["Authentication-Results: mx.example.net; dkim=fail header.d=example.com; spf=fail smtp.mailfrom=example.com; dmarc=fail (p=REJECT) header.from=example.com", ...head].join("\n"));
    assert.ok(flagged(failAlone, "danger", /DKIM fail for example.com/));
    assert.ok(flagged(failAlone, "danger", /SPF fail/));
    assert.ok(flagged(failAlone, "danger", /DMARC fail/));
    const listMail = run(["Authentication-Results: mx.example.net; dkim=fail header.d=example.com; dkim=pass header.d=lists.example.org; spf=pass smtp.mailfrom=lists.example.org; dmarc=pass header.from=example.com", ...head].join("\n"));
    assert.ok(flagged(listMail, "info", /DKIM fail for example.com.*DMARC still passed/));
    assert.ok(!flagged(listMail, "danger", /DKIM fail/));
    assert.ok(flagged(listMail, "ok", /DKIM pass for lists.example.org/));
  });

  t4("zero width joiners belong to Persian and emoji text, not to a Latin word", () => {
    assert.deepEqual(E4.hiddenCharacters("\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645"), []);
    assert.deepEqual(E4.hiddenCharacters("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"), []);
    assert.deepEqual(E4.hiddenCharacters("\u0915\u094D\u200D\u0937"), []);
    assert.equal(E4.hiddenCharacters("pay\u200Dpal").length, 1);
    assert.equal(E4.hiddenCharacters("pay\u200Cpal").length, 1);
    assert.equal(E4.hiddenCharacters("pay\u200Bpal").length, 1);
    assert.equal(E4.hiddenCharacters("pay\u2060pal").length, 1);
    assert.equal(E4.hiddenCharacters("pay\uFEFFpal").length, 1);
    assert.equal(E4.hiddenCharacters("pay\u00ADpal").length, 1);
    assert.equal(E4.hiddenCharacters("a\u202Eb").length, 1);
    assert.deepEqual(E4.hiddenCharacters("plain text"), []);
    const persian = run("From: =?UTF-8?B?2YXbjOKAjNiu2YjYp9mH2YU=?= <p@example.ir>\nSubject: x");
    assert.ok(!persian.findings.some((f) => /invisible/.test(f.text)));
    const pal = run("From: \"pay\u200Dpal support\" <p@example.com>\nSubject: x");
    assert.ok(flagged(pal, "warn", /zero width or invisible/));
  });

  t4("Received protocol is the whole with clause, and TLS comes from its comment or its S", () => {
    const ms = E4.parseReceived(
      "from a.example (2001:db8::1) by b.example (2001:db8::2) with Microsoft SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.1.2 via Frontend Transport; Tue, 6 Aug 2024 10:00:03 +0000",
    );
    assert.equal(ms.protocol, "Microsoft SMTP Server");
    assert.equal(ms.tls, true);
    assert.equal(ms.id, "15.20.1.2");
    const pf = E4.parseReceived("from [10.0.0.5] (unknown [198.51.100.9]) by mail.example.com (Postfix) with ESMTPSA id ABC123 for <bob@example.net>; Mon, 5 Aug 2024 13:11:58 +0000 (UTC)");
    assert.equal(pf.protocol, "ESMTPSA");
    assert.equal(pf.tls, true);
    assert.equal(pf.peerIp?.address, "198.51.100.9");
    assert.equal(pf.heloIp?.address, "10.0.0.5");
    assert.equal(pf.recipient, "<bob@example.net>");
    const plain = E4.parseReceived("from a.example ([192.0.2.9]) by b.example with ESMTP id Z; Mon, 5 Aug 2024 13:11:58 +0000");
    assert.equal(plain.protocol, "ESMTP");
    assert.equal(plain.tls, false);
    const none = E4.parseReceived("from a.example by b.example; Mon, 5 Aug 2024 13:11:58 +0000");
    assert.equal(none.protocol, null);
    assert.equal(none.tls, null);
    assert.ok(E4.parseReceived("by x with " + "w".repeat(500) + "; Mon, 5 Aug 2024 13:11:58 +0000").protocol!.length <= 64);
  });

  t4("unfolding keeps the whitespace that follows the break (RFC 5322 section 2.2.3)", () => {
    const s = E4.splitHeaders("Subject: This is\r\n a test\r\nX-Tab: abc\r\n\tdef\r\nX-Multi: one\r\n  two\r\n\tthree\r\nTo: x@example.com\r\n\r\nSubject: body line\r\n");
    assert.deepEqual(s.fields.map((f) => [f.name, f.value]), [
      ["Subject", "This is a test"],
      ["X-Tab", "abc\tdef"],
      ["X-Multi", "one  two\tthree"],
      ["To", "x@example.com"],
    ]);
    assert.equal(s.bodyLinesIgnored, 1);
    // The header section ends at the first empty line even if the body looks like headers.
    assert.equal(s.fields.filter((f) => f.name === "Subject").length, 1);
    // A name may not contain a space or a colon; one that does is not a field.
    assert.equal(E4.splitHeaders("Created at: now\nFrom: a@b.c").fields.length, 1);
  });

  t4("mailboxes: comma in a quoted name, group syntax, null path, comment as name", () => {
    const m = E4.parseAddressList('"Doe, John" <j@example.com>, plain@example.org (Plain Person), undisclosed@example.net');
    assert.deepEqual(m.map((x) => [x.display, x.address, x.domain]), [
      ["Doe, John", "j@example.com", "example.com"],
      ["Plain Person", "plain@example.org", "example.org"],
      [null, "undisclosed@example.net", "example.net"],
    ]);
    assert.deepEqual(E4.parseAddressList("undisclosed-recipients:;"), []);
    assert.equal(E4.parseAddressList("<>")[0].nullPath, true);
    assert.equal(E4.parseAddressList("Mailer <>")[0].nullPath, true);
    assert.equal(E4.parseAddressList("<@relay1.example,@relay2.example:user@final.example>")[0].address, "user@final.example");
    assert.equal(E4.parseAddressList("user@Example.COM.")[0].domain, "example.com");
    const gone = run("From: a@b.c\nReturn-Path: <>\nDate: Mon, 5 Aug 2024 13:11:55 +0000");
    assert.ok(flagged(gone, "info", /null reverse path/));
  });

  t4("organizational domains and the alignment test", () => {
    assert.equal(E4.organizationalDomain("mail.news.example.co.uk"), "example.co.uk");
    assert.equal(E4.organizationalDomain("a.b.example.com.au"), "example.com.au");
    assert.equal(E4.organizationalDomain("example.com"), "example.com");
    assert.equal(E4.organizationalDomain("com"), "com");
    assert.equal(E4.organizationalDomain("EXAMPLE.COM."), "example.com");
    assert.equal(E4.relaxedAligned("bounces.example.com", "Example.COM"), true);
    assert.equal(E4.relaxedAligned("example.co.uk", "other.co.uk"), false);
    assert.equal(E4.relaxedAligned(null, "example.com"), false);
    assert.equal(E4.relaxedAligned("example.com", ""), false);
  });

  t4("no input makes analyzeHeaders throw, and the caps are reported", () => {
    const junk = ["", "\0", "\r", ":", ": x", "From", "From:", "a:\n:\n:", "\ud800", "Received: ;", "Received: (", "Authentication-Results: =;=;=", "X-Forefront-Antispam-Report: ::;;", "Subject: =?", "Subject: =?UTF-8?B?", "Date: 31 Feb 2020 00:00 +0000"];
    for (const j of junk) E4.analyzeHeaders(j);
    const many = run(Array.from({ length: 1100 }, (_, i) => `X-F${i}: v`).join("\n"));
    assert.equal(many.fields.length, 1000);
    assert.equal(many.truncated, true);
    assert.ok(flagged(many, "info", /Only the first 1,000 fields/));
    const hops = run(Array.from({ length: 130 }, (_, i) => `Received: from h${i}.example.net by m.example.org; Tue, 13 Oct 2026 16:${String(i % 60).padStart(2, "0")}:00 +0000`).join("\n"));
    assert.equal(hops.hops.length, 100);
    assert.ok(flagged(hops, "info", /Only the first 100 of 130 Received fields/));
    const huge = E4.analyzeHeaders("Subject: " + "x".repeat(400_000));
    assert.equal(huge.kind, "ok");
    assert.ok(huge.kind === "ok" && huge.value.truncated);
  });

  console.log(`email-header-analyzer fourth verifier: ${n4} tests passed`);
}
