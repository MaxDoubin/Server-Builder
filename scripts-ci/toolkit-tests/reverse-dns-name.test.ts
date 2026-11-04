import assert from "node:assert/strict";
import {
  ptrName,
  zoneName,
  standardZones,
  delegationFor,
  classlessFor,
  classlessZoneFiles,
  parseNameservers,
  parseReverseInput,
  digCommands,
  ZONE_LIST_CAP,
} from "../../client/src/lib/toolkit/reverse-dns-name.ts";
import { parseIp, formatIp } from "../../client/src/lib/toolkit/ip-address-classifier.ts";

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
function addr(text: string) {
  const r = parseIp(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
function rev(text: string) {
  const r = parseReverseInput(text);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r.value;
}
function revErr(text: string): string {
  const r = parseReverseInput(text);
  assert.equal(r.ok, false, `expected failure for ${text}`);
  return (r as { ok: false; error: string }).error;
}

const RFC3596_ADDR = "4321:0:1:2:3:4:567:89ab";
const RFC3596_NAME = "b.a.9.8.7.6.5.0.4.0.0.0.3.0.0.0.2.0.0.0.1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa";

t("forward: RFC 1035 3.5 and RFC 3596 2.5 examples", () => {
  // RFC 1035 section 3.5: 10.2.0.52 is at 52.0.2.10.IN-ADDR.ARPA
  assert.equal(ptrName(4, addr("10.2.0.52").value), "52.0.2.10.in-addr.arpa");
  assert.equal(ptrName(4, addr("192.0.2.1").value), "1.2.0.192.in-addr.arpa");
  assert.equal(ptrName(4, addr("0.0.0.0").value), "0.0.0.0.in-addr.arpa");
  // RFC 3596 section 2.5 example
  assert.equal(ptrName(6, addr(RFC3596_ADDR).value), RFC3596_NAME);
  assert.equal(
    ptrName(6, addr("2001:db8::1").value),
    "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa",
  );
  assert.equal(ptrName(6, addr("::").value).split(".").length, 34);
});

t("zones", () => {
  const v = addr("192.0.2.77").value;
  assert.equal(zoneName(4, v, 0), "in-addr.arpa");
  assert.deepEqual(standardZones(4, v), [
    { prefix: 8, zone: "192.in-addr.arpa", labels: 1 },
    { prefix: 16, zone: "0.192.in-addr.arpa", labels: 2 },
    { prefix: 24, zone: "2.0.192.in-addr.arpa", labels: 3 },
  ]);
  const z6 = standardZones(6, addr("2001:db8:abcd:12::1").value);
  assert.equal(z6[0].zone, "8.b.d.0.1.0.0.2.ip6.arpa");
  assert.equal(z6[1].zone, "d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
  assert.equal(z6[2].zone, "0.0.d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
  assert.equal(z6[3].zone, "2.1.0.0.d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
  assert.equal(z6[1].labels, 12);
  assert.equal(z6[3].labels, 16);
});

t("delegation kinds", () => {
  const v = addr("192.0.2.77").value;
  const d24 = delegationFor(4, v, 24);
  assert.equal(d24.kind, "exact");
  assert.deepEqual(d24.zones, ["2.0.192.in-addr.arpa"]);
  const d23 = delegationFor(4, v, 23);
  assert.equal(d23.kind, "split");
  assert.equal(d23.networkText, "192.0.2.0/23");
  assert.deepEqual(d23.zones, ["2.0.192.in-addr.arpa", "3.0.192.in-addr.arpa"]);
  const d22 = delegationFor(4, addr("198.51.101.9").value, 22);
  assert.deepEqual(d22.zones, ["100.51.198.in-addr.arpa", "101.51.198.in-addr.arpa", "102.51.198.in-addr.arpa", "103.51.198.in-addr.arpa"]);
  const d17 = delegationFor(4, v, 17);
  assert.equal(d17.zoneCount, 128);
  assert.equal(d17.zones.length, ZONE_LIST_CAP);
  assert.equal(d17.zones[0], "0.0.192.in-addr.arpa");
  const d0 = delegationFor(4, v, 0);
  assert.deepEqual(d0.zones, ["in-addr.arpa"]);
  const d1 = delegationFor(4, v, 1);
  assert.equal(d1.zoneCount, 128);
  assert.equal(d1.zones[0], "128.in-addr.arpa");
  const d26 = delegationFor(4, v, 26);
  assert.equal(d26.kind, "classless");
  assert.equal(d26.classless?.childZone, "64/26.2.0.192.in-addr.arpa");
  assert.equal(d26.classless?.start, 64);
  assert.equal(d26.classless?.end, 127);
  const d32 = delegationFor(4, v, 32);
  assert.equal(d32.classless?.label, "77/32");
  assert.equal(d32.classless?.end, 77);

  const v6 = addr("2001:db8:abcd:12::1").value;
  assert.equal(delegationFor(6, v6, 48).kind, "exact");
  const d62 = delegationFor(6, v6, 62);
  assert.equal(d62.kind, "split");
  assert.equal(d62.zoneCount, 4);
  assert.deepEqual(d62.zones.map((z) => z.split(".")[0]), ["0", "1", "2", "3"]);
  const d61 = delegationFor(6, addr("2001:db8:abcd:1f::").value, 61);
  assert.deepEqual(d61.zones.map((z) => z.split(".")[0]), ["8", "9", "a", "b", "c", "d", "e", "f"]);
  const d128 = delegationFor(6, v6, 128);
  assert.equal(d128.zones[0], ptrName(6, v6));
  assert.equal(delegationFor(6, v6, 0).zones[0], "ip6.arpa");
});

t("classless label styles and zone files (RFC 2317 section 4 shape)", () => {
  const v = addr("192.0.2.130").value;
  const dash = classlessFor(v, 26, "-");
  assert.equal(dash.label, "128-26");
  assert.equal(dash.childZone, "128-26.2.0.192.in-addr.arpa");
  const info = classlessFor(v, 26, "/");
  const files = classlessZoneFiles(info, 130, ["ns.b.example.", "some.other.name.server.example."]);
  const parentLines = files.parent.split("\n");
  assert.equal(parentLines[0], "$ORIGIN 2.0.192.in-addr.arpa.");
  assert.ok(parentLines.some((l) => /^128\/26\s+IN NS\s+ns\.b\.example\.$/.test(l)));
  assert.ok(parentLines.some((l) => /^129\s+IN CNAME\s+129\.128\/26\.2\.0\.192\.in-addr\.arpa\.$/.test(l)));
  assert.equal(parentLines.filter((l) => / CNAME /.test(l)).length, 64);
  assert.match(files.parent, /192\.0\.2\.0\/24/);
  const childLines = files.child.split("\n");
  assert.equal(childLines[0], "$ORIGIN 128/26.2.0.192.in-addr.arpa.");
  assert.ok(childLines.some((l) => /^130\s+IN PTR\s+host130\.b\.example\.$/.test(l)));
  assert.ok(childLines.some((l) => /IN SOA\s+ns\.b\.example\. hostmaster\.b\.example\./.test(l)));
  assert.equal(files.generate, "$GENERATE 128-191 $ IN CNAME $.128/26.2.0.192.in-addr.arpa.");
  const two = classlessZoneFiles(classlessFor(v, 25, "/"), 130, ["ns.example."]);
  assert.match(two.child, /hostmaster\.ns\.example\./); // two labels: kept whole rather than reduced to a TLD
  assert.equal(two.parent.split("\n").filter((l) => / CNAME /.test(l)).length, 128);
});

t("name servers", () => {
  const ok = parseNameservers("ns1.customer.example, NS2.Customer.Example.");
  assert.deepEqual(ok, { ok: true, value: ["ns1.customer.example.", "ns2.customer.example."] });
  for (const bad of ["", "   ", "localhost", "-bad.example", "bad-.example", "a..b", "x_y.example", "a.b c.d e.f g.h i.j k.l m.n"]) {
    assert.equal(parseNameservers(bad).ok, false, bad);
  }
  assert.equal(parseNameservers(`${"a".repeat(64)}.example`).ok, false);
  assert.equal(parseNameservers(`${"a".repeat(63)}.example`).ok, true);
});

t("reverse: addresses and prefixes", () => {
  const a = rev("192.0.2.65");
  assert.equal(a.kind, "address");
  const p = rev("192.0.2.64/26");
  assert.equal(p.kind === "address" && p.prefix, 26);
  const z = rev("fe80::1%eth0/64");
  assert.equal(z.kind === "address" && z.zoneId, "eth0");
  assert.match(revErr("192.0.2.1/33"), /0 to 32/);
  assert.match(revErr("2001:db8::/129"), /0 to 128/);
  assert.match(revErr("192.0.2.1/abc"), /plain number/);
  assert.match(revErr("192.0.2.1/024"), /plain number/);
  assert.match(revErr("example.com"), /host name/);
  assert.match(revErr(""), /Enter/);
  assert.match(revErr("1".repeat(5000)), /not read/);
});

t("reverse: PTR names to addresses", () => {
  const r1 = rev("52.0.2.10.IN-ADDR.ARPA.");
  assert.equal(r1.kind, "ptr");
  assert.equal(formatIp(4, r1.value), "10.2.0.52");
  assert.equal(r1.prefix, 32);
  const r6 = rev(RFC3596_NAME.toUpperCase());
  assert.equal(formatIp(6, r6.value), RFC3596_ADDR);
  assert.equal(r6.prefix, 128);
  const zone = rev("2.0.192.in-addr.arpa");
  assert.equal(formatIp(4, zone.value), "192.0.2.0");
  assert.equal(zone.prefix, 24);
  const root = rev("in-addr.arpa");
  assert.equal(root.prefix, 0);
  const z6 = rev("8.b.d.0.1.0.0.2.ip6.arpa");
  assert.equal(formatIp(6, z6.value), "2001:db8::");
  assert.equal(z6.prefix, 32);
  assert.equal(rev("ip6.arpa").prefix, 0);
});

t("reverse: RFC 2317 classless names", () => {
  // RFC 2317 section 4 example names
  const host = rev("129.128/26.2.0.192.in-addr.arpa");
  assert.equal(formatIp(4, host.value), "192.0.2.129");
  assert.equal(host.prefix, 32);
  assert.deepEqual(host.kind === "ptr" && host.classless, { start: 128, prefix: 26, label: "128/26" });
  const zone = rev("0/25.2.0.192.in-addr.arpa");
  assert.equal(formatIp(4, zone.value), "192.0.2.0");
  assert.equal(zone.prefix, 25);
  const dash = rev("64-26.2.0.192.in-addr.arpa");
  assert.equal(dash.prefix, 26);
  const range = rev("64-127.2.0.192.in-addr.arpa");
  assert.equal(range.prefix, 26);
  assert.match((range.kind === "ptr" && range.note) || "", /range 64 to 127/);
  const amb = rev("0-31.2.0.192.in-addr.arpa");
  assert.equal(amb.prefix, 31);
  assert.match((amb.kind === "ptr" && amb.note) || "", /\/27/);
  assert.match(revErr("200.128/26.2.0.192.in-addr.arpa"), /outside the block/);
  assert.match(revErr("65/26.2.0.192.in-addr.arpa"), /not aligned/);
  assert.match(revErr("0/24.2.0.192.in-addr.arpa"), /\/25 to \/32/);
  assert.match(revErr("0/25.0.192.in-addr.arpa"), /directly under a \/24/);
  assert.match(revErr("1.2.0/25.2.0.192.in-addr.arpa"), /directly under a \/24/);
  assert.match(revErr("64-100.2.0.192.in-addr.arpa"), /\/25 to \/32|not aligned/);
});

t("reverse: malformed names", () => {
  assert.match(revErr("1.2.3.4.5.in-addr.arpa"), /at most four/);
  assert.match(revErr("256.2.0.192.in-addr.arpa"), /0 to 255/);
  assert.match(revErr("01.2.0.192.in-addr.arpa"), /leading zero/);
  assert.match(revErr("a.2.0.192.in-addr.arpa"), /not a decimal/);
  assert.match(revErr("1..0.192.in-addr.arpa"), /empty label/);
  assert.match(revErr("8.b.d0.1.0.0.2.ip6.arpa"), /single hex digit/);
  assert.match(revErr(`${"0.".repeat(33)}ip6.arpa`), /at most 32/);
  assert.match(revErr("1.0.0.0.ip6.int"), /RFC 4159/);
  assert.match(revErr("example.arpa"), /in-addr\.arpa \(IPv4\) or ip6\.arpa/);
});

t("round trips", () => {
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 2000; i++) {
    const v4 = BigInt(Math.floor(rnd() * 2 ** 32));
    const back4 = rev(ptrName(4, v4));
    assert.equal(back4.value, v4);
    let v6 = 0n;
    for (let j = 0; j < 8; j++) v6 = (v6 << 16n) | BigInt(Math.floor(rnd() * 65536));
    const back6 = rev(ptrName(6, v6));
    assert.equal(back6.value, v6);
    assert.equal(back6.prefix, 128);
  }
});

t("dig commands", () => {
  const v = addr("192.0.2.1").value;
  assert.deepEqual(digCommands(4, v, true, ""), [
    "dig -x 192.0.2.1",
    "dig +short PTR 1.2.0.192.in-addr.arpa",
    "dig +trace -x 192.0.2.1",
  ]);
  assert.deepEqual(digCommands(4, v, false, "2.0.192.in-addr.arpa"), ["dig NS 2.0.192.in-addr.arpa", "dig SOA 2.0.192.in-addr.arpa"]);
  assert.equal(digCommands(6, addr(RFC3596_ADDR).value, true, "")[0], `dig -x ${RFC3596_ADDR}`);
});

t("fuzz: never throws", () => {
  const alphabet = "0123456789abcdef.:/-%arpinx ";
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const suffixes = ["", ".in-addr.arpa", ".ip6.arpa", ".arpa"];
  for (let i = 0; i < 20000; i++) {
    let s = "";
    const len = Math.floor(rnd() * 40);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    s += suffixes[Math.floor(rnd() * suffixes.length)];
    const r = parseReverseInput(s);
    if (r.ok) {
      const p = r.value.kind === "address" ? (r.value.prefix ?? (r.value.family === 4 ? 24 : 64)) : r.value.prefix;
      delegationFor(r.value.family, r.value.value, p, "/");
    } else {
      assert.ok(r.error.length > 0 && !/—/.test(r.error));
    }
  }
});

console.log(`reverse-dns-name: ${passed} test groups passed`);

/* ================= verifier pass 2 ================= */
{
  let n = 0;
  const v2 = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL ${name}`);
      throw e;
    }
  };

  v2("RFC 2317 section 4 example names, all three child zones", () => {
    const a = rev("1.0/25.2.0.192.in-addr.arpa");
    assert.equal(formatIp(4, a.value), "192.0.2.1");
    assert.equal(a.prefix, 32);
    const c = rev("193.192/26.2.0.192.in-addr.arpa");
    assert.equal(formatIp(4, c.value), "192.0.2.193");
    const z = rev("192/26.2.0.192.in-addr.arpa.");
    assert.equal(formatIp(4, z.value), "192.0.2.192");
    assert.equal(z.prefix, 26);
    assert.match(revErr("1.192/26.2.0.192.in-addr.arpa"), /outside the block 192\/26, which covers 192 to 255/);
    assert.match(revErr("128.0/25.2.0.192.in-addr.arpa"), /covers 0 to 127/);
  });

  v2("RFC 2317 section 4 parent and child zone shape for 0/25", () => {
    const info = classlessFor(addr("192.0.2.1").value, 25, "/");
    assert.equal(info.childZone, "0/25.2.0.192.in-addr.arpa");
    const f = classlessZoneFiles(info, 1, ["ns.a.domain.", "some.other.name.server."]);
    const p = f.parent.split("\n");
    assert.equal(p.filter((l) => /^0\/25\s+IN NS\s+/.test(l)).length, 2);
    assert.ok(p.some((l) => /^1\s+IN CNAME\s+1\.0\/25\.2\.0\.192\.in-addr\.arpa\.$/.test(l)), "CNAME for .1 as in the RFC");
    assert.ok(p.some((l) => /^127\s+IN CNAME\s+127\.0\/25\.2\.0\.192\.in-addr\.arpa\.$/.test(l)));
    assert.ok(!p.some((l) => /^128\s/.test(l)), "nothing past the block");
    const ch = f.child.split("\n");
    assert.equal(ch[0], "$ORIGIN 0/25.2.0.192.in-addr.arpa.");
    assert.ok(ch.some((l) => /^@\s+IN NS\s+some\.other\.name\.server\.$/.test(l)));
    assert.ok(ch.some((l) => /^1\s+IN PTR\s+host1\.a\.domain\.$/.test(l)));
    assert.equal(f.generate, "$GENERATE 0-127 $ IN CNAME $.0/25.2.0.192.in-addr.arpa.");
  });

  v2("a dash label that reads two ways follows the host label", () => {
    const h = rev("5.0-31.2.0.192.in-addr.arpa");
    assert.equal(formatIp(4, h.value), "192.0.2.5");
    assert.deepEqual(h.kind === "ptr" && h.classless, { start: 0, prefix: 27, label: "0-31" });
    assert.match((h.kind === "ptr" && h.note) || "", /range 0 to 31, a \/27, because host 5/);
    const one = rev("1.0-31.2.0.192.in-addr.arpa"); // fits the /31 reading, which stays
    assert.equal(one.kind === "ptr" && one.classless?.prefix, 31);
    assert.match(revErr("40.0-31.2.0.192.in-addr.arpa"), /outside the block/);
    assert.match(revErr("5.0/31.2.0.192.in-addr.arpa"), /covers 0 to 1/); // a slash has one reading only
  });

  v2("leading dot, URL and inet_aton forms get the specific error", () => {
    assert.match(revErr(".in-addr.arpa"), /starts with a dot/);
    assert.match(revErr(".ip6.arpa."), /starts with a dot/);
    assert.match(revErr("http://192.0.2.1/"), /URL/);
    assert.match(revErr("0x7f.0.0.1"), /hexadecimal/);
    assert.match(revErr("0x7f.0.0.1/24"), /hexadecimal/);
    assert.match(revErr("0177.0.0.1"), /leading zero/);
    assert.match(revErr("127.1"), /inet_aton/);
    assert.match(revErr("localhost"), /host name/);
    assert.match(revErr("mail.example.com."), /host name/);
    assert.match(revErr("fe80::1/64%eth0"), /plain number/); // RFC 4007 11.7 order is address%zone/prefix
    assert.equal(rev("fe80::1%eth0/64").kind, "address");
  });

  v2("IPv6 zones: RFC 3596 address at /48, and splits near the root", () => {
    const v = addr(RFC3596_ADDR).value;
    assert.equal(zoneName(6, v, 48), "1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa");
    assert.equal(zoneName(6, v, 4), "4.ip6.arpa");
    const d1 = delegationFor(6, v, 1);
    assert.equal(d1.kind, "split");
    assert.equal(d1.boundary, 4);
    assert.deepEqual(d1.zones, ["0", "1", "2", "3", "4", "5", "6", "7"].map((x) => `${x}.ip6.arpa`));
    const d3 = delegationFor(6, addr("2001:db8::").value, 3); // 2000::/3
    assert.deepEqual(d3.zones, ["2.ip6.arpa", "3.ip6.arpa"]);
    const d33 = delegationFor(6, addr("2001:db8:8000::").value, 33);
    assert.equal(d33.networkText, "2001:db8:8000::/33");
    assert.deepEqual(d33.zones.map((z) => z.split(".")[0]), ["8", "9", "a", "b", "c", "d", "e", "f"]);
  });

  v2("name lengths: the longest reverse names", () => {
    const max6 = ptrName(6, (1n << 128n) - 1n);
    assert.equal(max6.length, 72); // 32 nibbles, 32 dots, ip6.arpa
    assert.equal(rev(`${max6}.`).value, (1n << 128n) - 1n);
    assert.equal(ptrName(4, 0xffffffffn), "255.255.255.255.in-addr.arpa");
    assert.equal(ptrName(6, 0n).split(".").slice(0, 32).every((l) => l === "0"), true);
  });

  v2("IPv4 delegation at /8 and /9", () => {
    const v = addr("203.0.113.9").value;
    assert.deepEqual(delegationFor(4, v, 8).zones, ["203.in-addr.arpa"]);
    const d9 = delegationFor(4, v, 9);
    assert.equal(d9.zoneCount, 128);
    assert.equal(d9.zones[0], "0.203.in-addr.arpa");
    assert.equal(d9.zones[ZONE_LIST_CAP - 1], "15.203.in-addr.arpa");
    const d25 = delegationFor(4, addr("203.0.113.200").value, 25);
    assert.equal(d25.classless?.label, "128/25");
    assert.equal(d25.classless?.end, 255);
  });

  console.log(`reverse-dns-name verifier pass 2: ${n} groups passed`);
}

/* ================= verifier pass 3 (independent) ================= */
import { classlessLabelWarning } from "../../client/src/lib/toolkit/reverse-dns-name.ts";
{
  let n = 0;
  const v3 = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL ${name}`);
      throw e;
    }
  };

  v3("RFC 1035 section 3.5 example names, both directions", () => {
    // "data for Internet address 10.2.0.52 is located at domain name 52.0.2.10.IN-ADDR.ARPA"
    assert.equal(formatIp(4, rev("52.0.2.10.IN-ADDR.ARPA").value), "10.2.0.52");
    // The section's zone example: 10.IN-ADDR.ARPA, 52.0.0.10, 103.0.0.26, 77.0.0.10, 6.0.0.10
    const z = rev("10.IN-ADDR.ARPA.");
    assert.equal(z.prefix, 8);
    assert.equal(formatIp(4, z.value), "10.0.0.0");
    for (const [name, a] of [
      ["52.0.0.10.IN-ADDR.ARPA", "10.0.0.52"],
      ["103.0.0.26.IN-ADDR.ARPA", "26.0.0.103"],
      ["77.0.0.10.IN-ADDR.ARPA", "10.0.0.77"],
      ["6.0.0.10.IN-ADDR.ARPA", "10.0.0.6"],
    ]) {
      const r = rev(name);
      assert.equal(formatIp(4, r.value), a);
      assert.equal(ptrName(4, r.value), name.toLowerCase());
    }
  });

  v3("ip6.arpa names against an independent nibble builder", () => {
    const build = (v: bigint) => [...v.toString(16).padStart(32, "0")].reverse().join(".") + ".ip6.arpa";
    let x = 0x9e3779b97f4a7c15f39cc0605cedc834n;
    for (let i = 0; i < 500; i++) {
      x = (x * 0x5851f42d4c957f2dn + 0x14057b7ef767814fn) & ((1n << 128n) - 1n);
      assert.equal(ptrName(6, x), build(x));
      assert.equal(rev(build(x)).value, x);
    }
    // RFC 3596 section 2.5 example written in full and with ::
    assert.equal(ptrName(6, addr("4321:0000:0001:0002:0003:0004:0567:89AB").value), RFC3596_NAME);
    // A /32 zone name reads back as the /32 prefix
    const p = rev("8.b.d.0.1.0.0.2.ip6.arpa.");
    assert.equal(p.prefix, 32);
    assert.equal(formatIp(6, p.value), "2001:db8::");
  });

  v3("RFC 2317 section 4, the 128/26 block exactly as the RFC lays it out", () => {
    const info = classlessFor(addr("192.0.2.129").value, 26, "/");
    assert.deepEqual(
      { parent: info.parentZone, start: info.start, end: info.end, label: info.label, child: info.childZone },
      { parent: "2.0.192.in-addr.arpa", start: 128, end: 191, label: "128/26", child: "128/26.2.0.192.in-addr.arpa" },
    );
    const f = classlessZoneFiles(info, 129, ["ns.b.domain.", "some.other.name.server.too."]);
    const p = f.parent.split("\n");
    assert.equal(p[0], "$ORIGIN 2.0.192.in-addr.arpa.");
    assert.deepEqual(p.filter((l) => / IN NS /.test(l)).map((l) => l.split(/\s+/).join(" ")), [
      "128/26 IN NS ns.b.domain.",
      "128/26 IN NS some.other.name.server.too.",
    ]);
    const cn = p.filter((l) => / IN CNAME /.test(l));
    assert.equal(cn.length, 64);
    assert.equal(cn[1].split(/\s+/).join(" "), "129 IN CNAME 129.128/26.2.0.192.in-addr.arpa.");
    assert.equal(cn[63].split(/\s+/).join(" "), "191 IN CNAME 191.128/26.2.0.192.in-addr.arpa.");
    const c = f.child.split("\n");
    assert.equal(c[0], "$ORIGIN 128/26.2.0.192.in-addr.arpa.");
    assert.ok(c.some((l) => l.split(/\s+/).join(" ") === "@ IN SOA ns.b.domain. hostmaster.b.domain. 1 3600 900 1209600 3600"));
    assert.ok(c.some((l) => l.split(/\s+/).join(" ") === "129 IN PTR host129.b.domain."));
    assert.equal(f.generate, "$GENERATE 128-191 $ IN CNAME $.128/26.2.0.192.in-addr.arpa.");
  });

  v3("every aligned classless block round-trips through its own child and host names", () => {
    const base = addr("198.51.100.0").value;
    for (let prefix = 25; prefix <= 32; prefix++) {
      const size = 2 ** (32 - prefix);
      for (let start = 0; start < 256; start += size) {
        for (const style of ["/", "-"] as const) {
          const info = classlessFor(base + BigInt(start), prefix, style);
          const z = rev(info.childZone);
          assert.equal(z.kind, "ptr");
          assert.deepEqual(
            z.kind === "ptr" && z.classless ? [z.classless.start, z.classless.prefix] : null,
            [start, prefix],
            `${info.childZone} reads back`,
          );
          const host = start + size - 1;
          const h = rev(`${host}.${info.childZone}`);
          assert.equal(h.value, base + BigInt(host), `${host}.${info.childZone}`);
          // The dash form is ambiguous only for /31 at 0, 16, 24 and 28, and the page says so.
          const amb = style === "-" && prefix === 31 && [0, 16, 24, 28].includes(start);
          assert.equal(classlessLabelWarning(info) !== null, amb, `${info.label} warning`);
        }
      }
    }
    assert.match(classlessLabelWarning(classlessFor(base + 16n, 31, "-")) ?? "", /16-31 can also be read as the range 16 to 31/);
  });

  v3("delegation counts at and past the listing cap", () => {
    const v = addr("203.0.113.9").value;
    const d20 = delegationFor(4, v, 20);
    assert.equal(d20.zoneCount, 16);
    assert.equal(d20.zones.length, 16);
    assert.equal(d20.zones[0], "112.0.203.in-addr.arpa");
    assert.equal(d20.zones[15], "127.0.203.in-addr.arpa");
    const d19 = delegationFor(4, v, 19);
    assert.equal(d19.zoneCount, 32);
    assert.equal(d19.zones.length, ZONE_LIST_CAP);
    const d0 = delegationFor(4, v, 0);
    assert.deepEqual([d0.kind, d0.zones], ["exact", ["in-addr.arpa"]]);
    const v6 = addr("2001:db8:abcd:1234::1").value;
    const d47 = delegationFor(6, v6, 47);
    // 2001:db8:abcc::/47 covers the /48s abcc and abcd
    assert.deepEqual(d47.zones, ["c.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa", "d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa"]);
    assert.equal(d47.networkText, "2001:db8:abcc::/47");
    const d128 = delegationFor(6, v6, 128);
    assert.deepEqual([d128.kind, d128.zones[0]], ["exact", ptrName(6, v6)]);
    assert.deepEqual(standardZones(4, addr("192.0.2.1").value).map((z) => z.zone), [
      "192.in-addr.arpa",
      "0.192.in-addr.arpa",
      "2.0.192.in-addr.arpa",
    ]);
  });

  v3("malformed input gets a specific error and never throws", () => {
    assert.match(revErr("1.2.3.4/32/32"), /more than one slash/);
    assert.match(revErr("192.0.2.1/"), /plain number/);
    assert.match(revErr("192.0.2.1/-1"), /plain number/);
    assert.match(revErr("2001:db8::/129"), /0 to 128/);
    assert.match(revErr("1.2.0.192.in-addr.arpa.."), /two dots/);
    assert.match(revErr("1..0.192.in-addr.arpa"), /empty label/);
    assert.match(revErr("example.arpa"), /in-addr\.arpa \(IPv4\) or ip6\.arpa/);
    assert.match(revErr("00.ip6.arpa"), /single hex digit/);
    assert.match(revErr("1.2.0.192.in-addr.arpa.​"), /U\+200B/);
    for (const s of ["", " ", "/", "//", "arpa.", "..", "-", "ip6.arpa..", "%", "[]", "1.2.3.4%x/24", "x".repeat(400), "0.".repeat(40) + "in-addr.arpa"]) {
      assert.doesNotThrow(() => parseReverseInput(s), s);
      assert.equal(parseReverseInput(s).ok, false, s);
    }
    for (const s of ["", "ns", "a..b", "-a.b", "a-.b", `${"a".repeat(64)}.example`, "a.b,c.d,e.f,g.h,i.j,k.l,m.n", "x".repeat(2000)]) {
      assert.doesNotThrow(() => parseNameservers(s), s);
      assert.equal(parseNameservers(s).ok, false, s);
    }
    assert.equal(parseNameservers(`${"a".repeat(63)}.example`).ok, true);
  });

  v3("dig commands match the input kind", () => {
    const v = addr("2001:db8::1").value;
    assert.deepEqual(digCommands(6, v, true, ""), [
      "dig -x 2001:db8::1",
      `dig +short PTR ${ptrName(6, v)}`,
      "dig +trace -x 2001:db8::1",
    ]);
    assert.deepEqual(digCommands(4, 0n, false, "64/26.2.0.192.in-addr.arpa"), [
      "dig NS 64/26.2.0.192.in-addr.arpa",
      "dig SOA 64/26.2.0.192.in-addr.arpa",
    ]);
  });

  console.log(`reverse-dns-name verifier pass 3: ${n} groups passed`);
}

/* ================= verifier pass 4 (independent) ================= */
(async () => {
  const R = await import("../../client/src/lib/toolkit/reverse-dns-name.ts");
  let n = 0;
  const g = (name: string, fn: () => void) => { fn(); n++; };
  const ok = (s: string) => { const r = R.parseReverseInput(s); assert.ok(r.ok, `${s}: ${!r.ok && r.error}`); return r.value; };
  const bad = (s: string) => { const r = R.parseReverseInput(s); assert.equal(r.ok, false, s); };

  g("PTR names cross-checked with Python ipaddress.reverse_pointer", () => {
    const v = (s: string) => { const x = ok(s); return R.ptrName(x.family, x.value); };
    assert.equal(v("2001:db8::567:89ab"), "b.a.9.8.7.6.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
    assert.equal(v("::ffff:192.0.2.1"), "1.0.2.0.0.0.0.c.f.f.f.f.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa");
    assert.equal(v("fe80::1%eth0"), "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.e.f.ip6.arpa");
    assert.equal(v("255.255.255.255"), "255.255.255.255.in-addr.arpa");
    assert.equal(v("0.0.0.0"), "0.0.0.0.in-addr.arpa");
    assert.equal(v("10.2.0.52"), "52.0.2.10.in-addr.arpa"); // RFC 1035 3.5
  });
  g("reverse parse of names and zones", () => {
    const a = ok("52.0.2.10.IN-ADDR.ARPA.");
    assert.equal(a.kind, "ptr"); assert.equal(a.value, 0x0a020034n); assert.equal(a.prefix, 32);
    const z = ok("in-addr.arpa"); assert.equal(z.prefix, 0);
    const z6 = ok("8.B.D.0.1.0.0.2.ip6.arpa"); assert.equal(z6.prefix, 32); assert.equal(z6.value, 0x20010db8n << 96n);
    const c = ok("128/25.2.0.192.in-addr.arpa"); assert.equal(c.prefix, 25); assert.equal(c.value, 0xc0000280n);
    const h = ok("1.0/25.2.0.192.in-addr.arpa"); assert.equal(h.prefix, 32); assert.equal(h.value, 0xc0000201n);
    const r = ok("70.64-127.2.0.192.in-addr.arpa"); assert.equal(r.value, 0xc0000246n);
  });
  g("malformed names are refused", () => {
    for (const s of ["01.2.0.192.in-addr.arpa", "256.2.0.192.in-addr.arpa", "1.2.3.4.5.in-addr.arpa", "g.ip6.arpa",
      Array(33).fill("0").join(".") + ".ip6.arpa", "130/25.2.0.192.in-addr.arpa", "64/24.2.0.192.in-addr.arpa",
      "200.0/25.2.0.192.in-addr.arpa", "1..2.in-addr.arpa", ".in-addr.arpa", "1.2.in-addr.arpa..", "10.ip6.arpa",
      "1.0.ip6.int", "example.com", "1.2.3.4/33", "::1/129", "1.2.3.4/024", "1.2.3.4/2/3", "x".repeat(5000), "", " ",
      "-1.2.0.192.in-addr.arpa", "١.2.0.192.in-addr.arpa", "1/2/3.in-addr.arpa"]) bad(s);
  });
  g("delegation boundaries", () => {
    const d = R.delegationFor(4, 0xc0000200n, 22);
    assert.equal(d.kind, "split"); assert.equal(d.zoneCount, 4);
    assert.deepEqual(d.zones, ["0.0.192.in-addr.arpa", "1.0.192.in-addr.arpa", "2.0.192.in-addr.arpa", "3.0.192.in-addr.arpa"]);
    const d0 = R.delegationFor(4, 0x01020304n, 0);
    assert.deepEqual(d0.zones, ["in-addr.arpa"]);
    const d6 = R.delegationFor(6, 0x20010db8n << 96n, 62);
    assert.equal(d6.zoneCount, 4);
    assert.equal(d6.zones[3], "3.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
    const big = R.delegationFor(6, 0n, 1);
    assert.equal(big.zoneCount, 8); assert.equal(big.zones.length, 8);
    const huge = R.delegationFor(4, 0n, 1);
    assert.equal(huge.zoneCount, 128); assert.equal(huge.zones.length, R.ZONE_LIST_CAP);
    const c = R.delegationFor(4, 0xc0000241n, 26);
    assert.equal(c.classless?.childZone, "64/26.2.0.192.in-addr.arpa");
    assert.equal(c.classless?.end, 127);
  });
  g("RFC 2317 zone file shape", () => {
    const info = R.classlessFor(0xc0000200n, 25, "/");
    const ns = R.parseNameservers("ns.a.domain");
    assert.ok(ns.ok);
    const f = R.classlessZoneFiles(info, 1, ns.value);
    assert.match(f.parent, /^0\/25\s+IN NS\s+ns\.a\.domain\.$/m);
    assert.match(f.parent, /^1\s+IN CNAME\s+1\.0\/25\.2\.0\.192\.in-addr\.arpa\.$/m);
    assert.equal(f.parent.split("\n").filter((l: string) => l.includes("CNAME")).length, 128);
    assert.equal(f.generate, "$GENERATE 0-127 $ IN CNAME $.0/25.2.0.192.in-addr.arpa.");
  });
  g("name server validation", () => {
    assert.equal(R.parseNameservers("ns1.example.com, 192.0.2.1").ok, false);
    assert.equal(R.parseNameservers("-bad.example").ok, false);
    assert.equal(R.parseNameservers("a.b c.d e.f g.h i.j k.l m.n").ok, false);
    assert.equal(R.parseNameservers("localhost").ok, false);
    assert.equal(R.parseNameservers("").ok, false);
    const r = R.parseNameservers("NS1.Example.COM.");
    assert.ok(r.ok); assert.deepEqual(r.value, ["ns1.example.com."]);
  });
  console.log(`reverse-dns-name verifier pass 4: ${n} groups passed`);
})().catch((e) => { console.error(e); process.exit(1); });

/* ================= verifier pass 5 (independent; reference values derived by hand from RFC 1035, 3596, 2317) ================= */
(async () => {
  const ip = await import("../../client/src/lib/toolkit/ip-address-classifier");
  const r = await import("../../client/src/lib/toolkit/reverse-dns-name");
  let n = 0;
  const g = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL pass5: ${name}`);
      throw e;
    }
  };
  const A = (s: string) => {
    const p = ip.parseIp(s);
    assert.ok(p.ok, s);
    return p.value;
  };
  const nib = (hex32: string) => hex32.split("").reverse().join(".") + ".ip6.arpa";
  const parse = (s: string) => {
    const p = r.parseReverseInput(s);
    assert.ok(p.ok, `${s}: ${!p.ok && p.error}`);
    return p.value;
  };
  const refuse = (s: string) => {
    const p = r.parseReverseInput(s);
    assert.equal(p.ok, false, s);
    return (p as { error: string }).error;
  };

  g("IPv4 names: octets reversed, no padding, extremes", () => {
    const f = (s: string) => r.ptrName(4, A(s).value);
    assert.equal(f("8.8.4.4"), "4.4.8.8.in-addr.arpa");
    assert.equal(f("255.255.255.255"), "255.255.255.255.in-addr.arpa");
    assert.equal(f("0.0.0.0"), "0.0.0.0.in-addr.arpa");
    assert.equal(f("1.2.3.4"), "4.3.2.1.in-addr.arpa");
    assert.equal(f("127.0.0.1"), "1.0.0.127.in-addr.arpa");
  });
  g("IPv6 names: 32 nibbles, zeros written out, reversed (RFC 3596 section 2.5)", () => {
    const f = (s: string) => r.ptrName(6, A(s).value);
    assert.equal(f("::1"), nib("0".repeat(31) + "1"));
    assert.equal(f("::"), nib("0".repeat(32)));
    assert.equal(f("2001:db8::567:89ab"), nib("20010db8" + "0".repeat(16) + "056789ab"));
    assert.equal(f("2001:DB8::567:89AB"), f("2001:db8:0:0:0:0:567:89ab"));
    assert.equal(f("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), nib("f".repeat(32)));
    assert.equal(f("1000::"), nib("1" + "0".repeat(31)));
    assert.equal(f("::ffff:192.0.2.1").split(".").length, 34);
  });
  g("RFC 2317 child zones for each size, both label styles", () => {
    const c = (s: string, p: number, st: "/" | "-" = "/") => r.classlessFor(A(s).value, p, st);
    const a = c("192.0.2.65", 26);
    assert.deepEqual([a.label, a.start, a.end, a.parentZone, a.childZone], ["64/26", 64, 127, "2.0.192.in-addr.arpa", "64/26.2.0.192.in-addr.arpa"]);
    assert.equal(c("192.0.2.65", 26, "-").childZone, "64-26.2.0.192.in-addr.arpa");
    const b = c("192.0.2.200", 25);
    assert.deepEqual([b.label, b.start, b.end], ["128/25", 128, 255]);
    const d = c("198.51.100.77", 27);
    assert.deepEqual([d.childZone, d.start, d.end], ["64/27.100.51.198.in-addr.arpa", 64, 95]);
    const e = c("192.0.2.1", 32);
    assert.deepEqual([e.label, e.start, e.end], ["1/32", 1, 1]);
    const f = c("203.0.113.255", 29);
    assert.deepEqual([f.label, f.start, f.end], ["248/29", 248, 255]);
    const h = c("192.0.2.0", 25);
    assert.deepEqual([h.label, h.start, h.end], ["0/25", 0, 127]);
  });
  g("delegation: split counts, label boundaries, capped listing, IPv6 nibble cuts", () => {
    const d20 = r.delegationFor(4, A("192.0.2.0").value, 20);
    assert.equal(d20.kind, "split");
    assert.equal(d20.boundary, 24);
    assert.equal(d20.zoneCount, 16);
    assert.equal(d20.zones[0], "0.0.192.in-addr.arpa");
    assert.equal(d20.zones[15], "15.0.192.in-addr.arpa");
    const d17 = r.delegationFor(4, A("10.1.200.9").value, 17);
    assert.equal(d17.zoneCount, 128);
    assert.equal(d17.zones.length, r.ZONE_LIST_CAP);
    assert.equal(d17.zones[0], "128.1.10.in-addr.arpa");
    assert.equal(d17.zones[15], "143.1.10.in-addr.arpa");
    assert.equal(d17.networkText, "10.1.128.0/17");
    assert.equal(r.delegationFor(4, A("10.1.200.9").value, 16).kind, "exact");
    assert.equal(r.delegationFor(4, A("10.1.200.9").value, 0).zones[0], "in-addr.arpa");
    const v50 = r.delegationFor(6, A("2001:db8:abcd:ef12::1").value, 50);
    assert.equal(v50.boundary, 52);
    assert.equal(v50.zoneCount, 4);
    assert.deepEqual(v50.zones.map((z) => z.split(".")[0]), ["c", "d", "e", "f"]);
    assert.equal(v50.zones[0], "c.d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
    const v48 = r.delegationFor(6, A("2001:db8:abcd:ef12::1").value, 48);
    assert.equal(v48.kind, "exact");
    assert.equal(v48.zones[0], "d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
    const v64 = r.delegationFor(6, A("2001:db8:abcd:ef12::1").value, 64);
    assert.equal(v64.zones[0], "2.1.f.e.d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa");
    assert.equal(r.delegationFor(6, A("2001:db8::1").value, 128).kind, "exact");
  });
  g("parse back: zones and hosts, RFC 2317 names copied from the RFC text", () => {
    const z24 = parse("2.0.192.in-addr.arpa");
    assert.equal(ip.formatIp(4, z24.value), "192.0.2.0");
    assert.equal(z24.prefix, 24);
    const z8 = parse("192.in-addr.arpa");
    assert.equal(ip.formatIp(4, z8.value), "192.0.0.0");
    assert.equal(z8.prefix, 8);
    assert.equal(parse("in-addr.arpa").prefix, 0);
    const z25 = parse("0/25.2.0.192.in-addr.arpa");
    assert.equal(z25.prefix, 25);
    assert.equal(ip.formatIp(4, z25.value), "192.0.2.0");
    const h193 = parse("193.192/26.2.0.192.in-addr.arpa");
    assert.equal(ip.formatIp(4, h193.value), "192.0.2.193");
    assert.equal(h193.prefix, 32);
    const h1 = parse("1.0/25.2.0.192.in-addr.arpa");
    assert.equal(ip.formatIp(4, h1.value), "192.0.2.1");
    const v = parse("8.b.d.0.1.0.0.2.ip6.arpa");
    assert.equal(ip.formatIp(6, v.value), "2001:db8::");
    assert.equal(v.prefix, 32);
    assert.equal(parse(nib("20010db8" + "0".repeat(16) + "056789ab").toUpperCase() + ".").prefix, 128);
    assert.equal(parse("1.2.3.4.IN-ADDR.ARPA.").prefix, 32);
  });
  g("parse back refuses names that cannot be right, with a reason", () => {
    assert.match(refuse("129.0/25.2.0.192.in-addr.arpa"), /outside the block/);
    assert.match(refuse("65/26.2.0.192.in-addr.arpa"), /not aligned/);
    assert.match(refuse("1.2.3.4.5.in-addr.arpa"), /at most four/);
    assert.match(refuse("256.1.1.1.in-addr.arpa"), /0 to 255/);
    assert.match(refuse("01.1.1.1.in-addr.arpa"), /leading zero/);
    assert.match(refuse("g.1.ip6.arpa"), /hex digit/);
    assert.match(refuse("10.1.ip6.arpa"), /hex digit/);
    assert.match(refuse("1.ip6.int"), /RFC 4159/);
    assert.match(refuse("1..2.in-addr.arpa"), /empty label/);
    assert.match(refuse("example.com"), /host name|in-addr\.arpa/);
    assert.match(refuse("1.2.3.4/33"), /0 to 32/);
    assert.match(refuse("::1/129"), /0 to 128/);
    assert.match(refuse("1.2.3.4/"), /prefix/);
    assert.match(refuse("a".repeat(400)), /256/);
  });
  g("dig commands for an address and for a zone", () => {
    assert.deepEqual(r.digCommands(4, A("192.0.2.65").value, true, ""), [
      "dig -x 192.0.2.65",
      "dig +short PTR 65.2.0.192.in-addr.arpa",
      "dig +trace -x 192.0.2.65",
    ]);
    assert.equal(r.digCommands(6, A("2001:db8::1").value, true, "")[0], "dig -x 2001:db8::1");
    assert.deepEqual(r.digCommands(4, A("192.0.2.0").value, false, "2.0.192.in-addr.arpa"), ["dig NS 2.0.192.in-addr.arpa", "dig SOA 2.0.192.in-addr.arpa"]);
  });
  g("generated zone files: one CNAME per address, NS delegation, child SOA and PTR", () => {
    for (const [prefix, count, label] of [[26, 64, "64/26"], [25, 128, "0/25"], [32, 1, "65/32"], [30, 4, "64/30"]] as const) {
      const info = r.classlessFor(A("192.0.2.65").value, prefix, "/");
      assert.equal(info.label, label);
      const ns = r.parseNameservers("ns1.customer.example, NS2.Customer.Example.");
      assert.ok(ns.ok);
      assert.deepEqual(ns.value, ["ns1.customer.example.", "ns2.customer.example."]);
      const files = r.classlessZoneFiles(info, 65, ns.value);
      const cnames = files.parent.split("\n").filter((l) => /\sIN CNAME\s/.test(l));
      assert.equal(cnames.length, count, `${prefix} CNAME count`);
      assert.ok(cnames.every((l) => l.trimEnd().endsWith(`.${info.childZone}.`)));
      assert.equal(files.parent.split("\n").filter((l) => /\sIN NS\s/.test(l)).length, 2);
      assert.ok(files.parent.includes(`$ORIGIN 2.0.192.in-addr.arpa.`));
      assert.ok(files.child.includes(`$ORIGIN ${info.childZone}.`));
      assert.match(files.child, /IN SOA\s+ns1\.customer\.example\. hostmaster\.customer\.example\. 1 3600 900 1209600 3600/);
      assert.match(files.child, /65\s+IN PTR\s+host65\.customer\.example\./);
      assert.equal(files.generate, `$GENERATE ${info.start}-${info.end} $ IN CNAME $.${info.childZone}.`);
    }
  });
  g("name server list validation", () => {
    const bad = (s: string) => assert.equal(r.parseNameservers(s).ok, false, s);
    bad("");
    bad("ns1");
    bad("192.0.2.1");
    bad("ns_1.example");
    bad("-ns.example");
    bad("ns-.example");
    bad("ns1.example,,ns..example");
    bad("a.b.c d.e.f g.h.i j.k.l m.n.o p.q.r s.t.u");
    bad(`${"a".repeat(64)}.example`);
    bad("ns.​example");
    bad("ns1.example.com.123");
    assert.ok(r.parseNameservers("a.example").ok);
    assert.ok(r.parseNameservers(`${"a".repeat(63)}.example`).ok);
    assert.deepEqual(r.parseNameservers("ns1.example\nns2.example\tns3.example").ok, true);
  });
  g("hostile text never throws; accepted addresses round-trip through the PTR name", () => {
    const alphabet = ["0", "1", "9", "f", "g", ":", "::", ".", "%", "/", "-", " ", "in-addr.arpa", "ip6.arpa", ".ip6.arpa", ".in-addr.arpa", "64/26", "2.0.192", "..", "​", "٣", "x"];
    let seed = 7;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % k;
    };
    let ok = 0;
    for (let i = 0; i < 30000; i++) {
      let s = "";
      for (let j = rnd(12) + 1; j > 0; j--) s += alphabet[rnd(alphabet.length)];
      const p = r.parseReverseInput(s);
      if (!p.ok) continue;
      ok++;
      const v = p.value;
      if (v.kind === "ptr" && v.prefix === ip.familyBits(v.family) && !v.classless) {
        assert.equal(r.ptrName(v.family, v.value) + ".", v.name);
      }
      r.delegationFor(v.family, v.value, v.kind === "address" ? (v.prefix ?? 24) : v.prefix);
    }
    assert.ok(ok > 200, `only ${ok} accepted`);
  });
  console.log(`reverse-dns-name verifier pass 5: ${n} groups passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
