import assert from "node:assert/strict";
import {
  cidrString,
  decodeOption,
  dnsmasqConfig,
  encodeRoute,
  encodeRoutes,
  formatIPv4,
  iscConfig,
  keaConfig,
  maskOf,
  parseCidr,
  parseDecimalBytes,
  parseHexBytes,
  parseIPv4,
  routeWarnings,
  significantOctets,
  toHex,
  type Route,
  MAX_DECODE_BYTES,
  MAX_DECODE_CHARS,
} from "../../client/src/lib/toolkit/dhcp-option-121-encoder.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
}

const ip = (s: string) => {
  const r = parseIPv4(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const cidr = (s: string) => {
  const r = parseCidr(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

test("maskOf boundaries", () => {
  assert.equal(maskOf(0), 0);
  assert.equal(maskOf(1), 0x80000000);
  assert.equal(maskOf(8), 0xff000000);
  assert.equal(maskOf(25), 0xffffff80);
  assert.equal(maskOf(31), 0xfffffffe);
  assert.equal(maskOf(32), 0xffffffff);
});

test("significant octets is ceil(width/8)", () => {
  const expect = [0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  for (let w = 0; w <= 32; w += 1) assert.equal(significantOctets(w), expect[w], `width ${w}`);
});

test("IPv4 parse and format", () => {
  assert.equal(ip("0.0.0.0"), 0);
  assert.equal(ip("255.255.255.255"), 0xffffffff);
  assert.equal(formatIPv4(ip("192.168.1.254")), "192.168.1.254");
  assert.equal(parseIPv4("256.1.1.1").ok, false);
  assert.equal(parseIPv4("1.2.3").ok, false);
  assert.equal(parseIPv4("01.2.3.4").ok, false);
  assert.equal(parseIPv4("").ok, false);
  assert.equal(parseIPv4("a.b.c.d").ok, false);
  assert.equal(parseIPv4("1.2.3.4.5").ok, false);
});

// RFC 3442 section 2, the destination descriptor table, verbatim.
test("RFC 3442 destination descriptor table", () => {
  const rows: [string, number[]][] = [
    ["0.0.0.0/0", [0]],
    ["10.0.0.0/8", [8, 10]],
    ["10.0.0.0/24", [24, 10, 0, 0]],
    ["10.17.0.0/16", [16, 10, 17]],
    ["10.27.129.0/24", [24, 10, 27, 129]],
    ["10.229.0.128/25", [25, 10, 229, 0, 128]],
    ["10.198.122.47/32", [32, 10, 198, 122, 47]],
  ];
  for (const [text, descriptor] of rows) {
    const c = cidr(text);
    const bytes = encodeRoute({ network: c.network, prefix: c.prefix, router: 0 });
    assert.deepEqual(bytes.slice(0, bytes.length - 4), descriptor, text);
    assert.deepEqual(bytes.slice(-4), [0, 0, 0, 0]);
  }
});

test("dotted masks and default keyword", () => {
  assert.deepEqual(cidr("10.229.0.128/255.255.255.128"), { network: ip("10.229.0.128"), prefix: 25, typed: ip("10.229.0.128"), hostBitsSet: false });
  assert.equal(cidr("default").prefix, 0);
  assert.equal(parseCidr("10.0.0.0/255.0.255.0").ok, false);
  assert.equal(parseCidr("10.0.0.0").ok, false);
  assert.equal(parseCidr("10.0.0.0/33").ok, false);
  assert.equal(parseCidr("10.0.0.0/x").ok, false);
});

test("host bits are masked off and reported", () => {
  const c = cidr("10.229.0.129/25");
  assert.equal(c.hostBitsSet, true);
  assert.equal(formatIPv4(c.network), "10.229.0.128");
  // encodeRoute masks even if handed an unmasked network
  assert.deepEqual(encodeRoute({ network: ip("10.229.0.255"), prefix: 25, router: ip("1.2.3.4") }), [25, 10, 229, 0, 128, 1, 2, 3, 4]);
});

const split: Route[] = [
  { network: ip("10.0.0.0"), prefix: 8, router: ip("192.168.1.254") },
  { network: 0, prefix: 0, router: ip("192.168.1.1") },
];

test("full option encoding, hand computed", () => {
  const bytes = encodeRoutes(split);
  assert.equal(toHex(bytes), "080ac0a801fe00c0a80101");
  assert.equal(toHex(bytes, ":"), "08:0a:c0:a8:01:fe:00:c0:a8:01:01");
  assert.equal(bytes.length, 11);
});

test("decoder round trips the RFC examples", () => {
  const routes: Route[] = [
    "0.0.0.0/0", "10.0.0.0/8", "10.0.0.0/24", "10.17.0.0/16", "10.27.129.0/24", "10.229.0.128/25", "10.198.122.47/32",
  ].map((t, i) => {
    const c = cidr(t);
    return { network: c.network, prefix: c.prefix, router: ip(`192.0.2.${i + 1}`) };
  });
  const bytes = encodeRoutes(routes);
  const d = decodeOption(bytes);
  assert.equal(d.error, null);
  assert.equal(d.routes.length, routes.length);
  d.routes.forEach((r, i) => {
    assert.equal(r.network, routes[i].network);
    assert.equal(r.prefix, routes[i].prefix);
    assert.equal(r.router, routes[i].router);
  });
  assert.equal(d.warnings.length, 0);
});

test("decoder strips a 121 or 249 header only when the length matches", () => {
  const data = encodeRoutes(split);
  const d = decodeOption([121, data.length, ...data]);
  assert.equal(d.headerCode, 121);
  assert.equal(d.routes.length, 2);
  const m = decodeOption([249, data.length, ...data]);
  assert.equal(m.headerCode, 249);
  const bad = decodeOption([121, data.length + 3, ...data]);
  assert.notEqual(bad.error, null);
  assert.equal(bad.routes.length, 0);
});

test("decoder validates widths and truncation", () => {
  const wide = decodeOption([33, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(wide.error ?? "", /prefix length from 0 to 32/);
  const short = decodeOption([24, 10, 0, 0, 192, 168]);
  assert.match(short.error ?? "", /needs 8 octets/);
  assert.match(short.error ?? "", /only 6 remain/);
  // Partial decode keeps the good route before the fault
  const partial = decodeOption([0, 192, 168, 1, 1, 24, 10, 0]);
  assert.equal(partial.routes.length, 1);
  assert.notEqual(partial.error, null);
  const empty = decodeOption([]);
  assert.notEqual(empty.error, null);
});

test("decoder flags host bits and a missing default route", () => {
  const d = decodeOption([25, 10, 229, 0, 129, 10, 0, 0, 1]);
  assert.equal(d.error, null);
  assert.equal(d.routes[0].hostBitsSet, true);
  assert.equal(cidrString(d.routes[0].network, 25), "10.229.0.128/25");
  assert.ok(d.warnings.some((w) => /requires the client to zero them/.test(w)));
  assert.ok(d.warnings.some((w) => /No default route/.test(w)));
});

test("decoder: minimum length rule (RFC 3442, 5 octets)", () => {
  const d = decodeOption([0, 192, 168, 1, 1]);
  assert.equal(d.error, null);
  assert.equal(d.warnings.length, 0);
});

test("hex parsing accepts common paste formats", () => {
  const want = [8, 10, 192, 168, 1, 254];
  for (const s of ["080ac0a801fe", "08:0a:c0:a8:01:fe", "08 0a c0 a8 01 fe", "0x08,0x0a,0xc0,0xa8,0x01,0xfe", "\\x08\\x0a\\xc0\\xa8\\x01\\xfe", "08-0A-C0-A8-01-FE", "0x080ac0a801fe", "8:a:c0:a8:1:fe"]) {
    const r = parseHexBytes(s);
    assert.ok(r.ok, s);
    if (r.ok) assert.deepEqual(r.value, want, s);
  }
  assert.equal(parseHexBytes("080").ok, false);
  assert.equal(parseHexBytes("zz").ok, false);
  assert.equal(parseHexBytes("").ok, false);
  assert.equal(parseHexBytes("0x").ok, false);
  assert.equal(parseHexBytes("ab".repeat(5000)).ok, false);
});

test("decimal parsing accepts dhcpd lines and RFC dotted descriptors", () => {
  const r = parseDecimalBytes("option rfc3442-classless-static-routes 24, 192, 168, 123, 10, 10, 10, 1;");
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.value, [24, 192, 168, 123, 10, 10, 10, 1]);
    const d = decodeOption(r.value);
    assert.equal(cidrString(d.routes[0].network, d.routes[0].prefix), "192.168.123.0/24");
    assert.equal(formatIPv4(d.routes[0].router), "10.10.10.1");
  }
  const dotted = parseDecimalBytes("25.10.229.0.128");
  assert.ok(dotted.ok && dotted.value.length === 5);
  assert.equal(parseDecimalBytes("256").ok, false);
  assert.equal(parseDecimalBytes("1a").ok, false);
  assert.equal(parseDecimalBytes("").ok, false);
});

test("config renderers", () => {
  const isc = iscConfig(split, { includeMs: true });
  assert.match(isc, /code 121 = array of unsigned integer 8;/);
  assert.match(isc, /code 249 = array of unsigned integer 8;/);
  assert.match(isc, /option routers 192\.168\.1\.1;/);
  assert.match(isc, /option rfc3442-classless-static-routes 8, 10, 192, 168, 1, 254, 0, 192, 168, 1, 1;/);
  const kea = JSON.parse(keaConfig(split, { includeMs: false }));
  assert.deepEqual(kea, {
    "option-data": [
      { name: "routers", data: "192.168.1.1" },
      { code: 121, "csv-format": false, data: "080AC0A801FE00C0A80101" },
    ],
  });
  const dm = dnsmasqConfig(split, { includeMs: true });
  assert.equal(
    dm,
    "dhcp-option=option:router,192.168.1.1\ndhcp-option=121,10.0.0.0/8,192.168.1.254,0.0.0.0/0,192.168.1.1\ndhcp-option=249,10.0.0.0/8,192.168.1.254,0.0.0.0/0,192.168.1.1",
  );
  const noMs = iscConfig(split, { includeMs: false });
  assert.doesNotMatch(noMs, /249/);
});

test("route warnings", () => {
  assert.equal(routeWarnings(split).length, 0);
  const noDefault = routeWarnings([split[0]]);
  assert.ok(noDefault.some((w) => /no default route/i.test(w)));
  const dup = routeWarnings([...split, { ...split[0], router: ip("192.168.1.253") }]);
  assert.ok(dup.some((w) => /different routers/.test(w)));
  const onLink = routeWarnings([{ network: ip("192.168.2.0"), prefix: 24, router: 0 }, split[1]]);
  assert.ok(onLink.some((w) => /same link/.test(w)));
  const loop = routeWarnings([{ network: ip("192.168.2.0"), prefix: 24, router: ip("127.0.0.1") }, split[1]]);
  assert.ok(loop.some((w) => /loopback/.test(w)));
  // 29 host routes at 9 octets each is 261 octets, past one option instance
  const many: Route[] = Array.from({ length: 29 }, (_, i) => ({ network: ip(`10.0.0.${i}`), prefix: 32, router: ip("192.168.1.1") }));
  assert.equal(encodeRoutes(many).length, 261);
  assert.ok(routeWarnings([...many, split[1]]).some((w) => /RFC 3396/.test(w)));
});

test("adversarial bytes never throw", () => {
  for (let seed = 1; seed < 300; seed += 1) {
    let x = seed;
    const bytes = Array.from({ length: seed % 40 }, () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x & 255;
    });
    const d = decodeOption(bytes);
    assert.ok(Array.isArray(d.routes));
  }
});


/* ---------------- independent verifier cases ---------------- */

// RFC 3442, DHCP Client Behavior: the server sends 129.210.177.132 (81D2B184)
// with mask 255.255.255.128; the client installs 129.210.177.128 (81D2B180).
test("verifier: RFC 3442 client masking example", () => {
  const d = decodeOption([25, 0x81, 0xd2, 0xb1, 0x84, 10, 0, 0, 1, 0, 10, 0, 0, 1]);
  assert.equal(d.error, null);
  assert.equal(d.routes[0].network, 0x81d2b180);
  assert.equal(d.routes[0].sent, 0x81d2b184);
  assert.equal(d.routes[0].hostBitsSet, true);
  assert.equal(cidrString(d.routes[0].network, 25), "129.210.177.128/25");
  // And the encoder never puts the stray host bit on the wire.
  const c = cidr("129.210.177.132/25");
  assert.deepEqual(encodeRoute({ network: c.network, prefix: c.prefix, router: 0 }).slice(0, 5), [25, 0x81, 0xd2, 0xb1, 0x80]);
  assert.deepEqual(encodeRoute({ network: 0x81d2b184, prefix: 25, router: 0 }).slice(0, 5), [25, 0x81, 0xd2, 0xb1, 0x80]);
});

// RFC 3442 significant octet table boundaries: 1-8 -> 1, 9-16 -> 2, 17-24 -> 3, 25-32 -> 4.
test("verifier: widths at every octet boundary", () => {
  const cases: [string, number[]][] = [
    ["128.0.0.0/1", [1, 128]],
    ["255.0.0.0/8", [8, 255]],
    ["172.0.0.0/9", [9, 172, 0]],
    ["172.16.0.0/12", [12, 172, 16]],
    ["192.168.0.0/16", [16, 192, 168]],
    ["192.168.128.0/17", [17, 192, 168, 128]],
    ["192.0.2.0/24", [24, 192, 0, 2]],
    ["192.0.2.128/25", [25, 192, 0, 2, 128]],
    ["192.0.2.254/31", [31, 192, 0, 2, 254]],
    ["255.255.255.255/32", [32, 255, 255, 255, 255]],
  ];
  for (const [text, desc] of cases) {
    const c = cidr(text);
    const bytes = encodeRoute({ network: c.network, prefix: c.prefix, router: ip("203.0.113.1") });
    assert.deepEqual(bytes, [...desc, 203, 0, 113, 1], text);
    const d = decodeOption([...bytes, 0, 203, 0, 113, 1]);
    assert.equal(d.error, null, text);
    assert.equal(cidrString(d.routes[0].network, d.routes[0].prefix), text);
  }
});

test("verifier: dotted masks, /0 forms and whitespace", () => {
  assert.equal(cidr("10.0.0.0/255.255.255.255").prefix, 32);
  const zero = cidr("10.1.2.3/0.0.0.0");
  assert.equal(zero.prefix, 0);
  assert.equal(zero.network, 0);
  assert.equal(zero.hostBitsSet, true);
  assert.equal(cidr("  DEFAULT ").prefix, 0);
  assert.equal(cidr(" 10.0.0.0 / 8 ").prefix, 8);
  assert.equal(parseCidr("10.0.0.0/").ok, false);
  assert.equal(parseCidr("/8").ok, false);
  assert.equal(parseCidr("10.0.0.0/8/8").ok, false);
  assert.equal(parseCidr("10.0.0.0/-1").ok, false);
  assert.equal(parseCidr("10.0.0.0/255.255.0.255").ok, false);
  assert.equal(parseCidr("１０.0.0.0/8").ok, false); // full-width digits
  assert.equal(parseIPv4("1.2.3.4 ").ok, true);
  assert.equal(parseIPv4("1..2.3").ok, false);
  assert.equal(parseIPv4("9".repeat(100)).ok, false);
});

// RFC 2132 section 2: one option carries at most 255 octets of data.
test("verifier: 255 octet boundary", () => {
  const hosts: Route[] = Array.from({ length: 28 }, (_, i) => ({ network: ip(`10.0.1.${i + 1}`), prefix: 32, router: ip("192.168.1.1") }));
  assert.equal(encodeRoutes(hosts).length, 252);
  assert.ok(!routeWarnings(hosts).some((w) => /RFC 3396/.test(w)));
  const withDefault = [...hosts, { network: 0, prefix: 0, router: ip("192.168.1.1") }];
  assert.equal(encodeRoutes(withDefault).length, 257);
  assert.ok(routeWarnings(withDefault).some((w) => /RFC 3396/.test(w)));
  const d = decodeOption(encodeRoutes(withDefault));
  assert.equal(d.error, null);
  assert.equal(d.routes.length, 29);
  assert.ok(d.warnings.some((w) => /RFC 3396/.test(w)));
});

test("verifier: header handling and malformed data", () => {
  // A whole option for one default route: code 121, length 5.
  const whole = decodeOption([0x79, 0x05, 0x00, 0xc0, 0xa8, 0x01, 0x01]);
  assert.equal(whole.headerCode, 121);
  assert.equal(whole.dataLength, 5);
  assert.equal(whole.routes.length, 1);
  assert.equal(formatIPv4(whole.routes[0].router), "192.168.1.1");
  assert.equal(whole.warnings.length, 0);
  const ms = decodeOption([0xf9, 0x05, 0x00, 0xc0, 0xa8, 0x01, 0x01]);
  assert.equal(ms.headerCode, 249);
  const headerOnly = decodeOption([121, 0]);
  assert.notEqual(headerOnly.error, null);
  assert.equal(decodeOption([121]).error !== null, true);
  assert.equal(decodeOption([255]).error !== null, true);
  // Width 32 with only 3 octets left.
  assert.match(decodeOption([32, 1, 2]).error ?? "", /needs 9 octets/);
  // A lone default route width with no router.
  assert.match(decodeOption([0]).error ?? "", /needs 5 octets/);
  // Three octets that are a complete-looking but short option.
  assert.notEqual(decodeOption([8, 10, 1]).error, null);
});

test("verifier: byte parsers reject junk with bounded messages", () => {
  const huge = "z".repeat(MAX_DECODE_CHARS);
  const r1 = parseHexBytes(huge);
  assert.ok(!r1.ok && r1.error.length < 200);
  const r2 = parseHexBytes("a".repeat(999));
  assert.ok(!r2.ok && r2.error.length < 200, r2.ok ? "" : r2.error);
  const r3 = parseDecimalBytes("1".repeat(5000));
  assert.ok(!r3.ok && r3.error.length < 200, r3.ok ? "" : r3.error);
  const r4 = parseDecimalBytes("0001");
  assert.ok(!r4.ok && !/larger than 255/.test(r4.error), r4.ok ? "" : r4.error);
  const r5 = parseHexBytes("08 0a 🙂");
  assert.ok(!r5.ok && r5.error.includes("🙂"));
  const r6 = parseDecimalBytes("-1, 2");
  assert.equal(r6.ok, false);
  const r7 = parseHexBytes(" \n\t ");
  assert.equal(r7.ok, false);
  const r8 = parseHexBytes("00".repeat(MAX_DECODE_BYTES + 1));
  assert.equal(r8.ok, false);
  const r9 = parseHexBytes("00".repeat(MAX_DECODE_BYTES));
  assert.ok(r9.ok && r9.value.length === MAX_DECODE_BYTES);
});

test("verifier: router sanity warnings", () => {
  const def = { network: 0, prefix: 0, router: ip("192.168.1.1") };
  const thisNet = routeWarnings([{ network: ip("10.0.0.0"), prefix: 8, router: ip("0.1.2.3") }, def]);
  assert.ok(thisNet.some((w) => /0\.0\.0\.0\/8/.test(w)));
  const mc = routeWarnings([{ network: ip("10.0.0.0"), prefix: 8, router: ip("224.0.0.1") }, def]);
  assert.ok(mc.some((w) => /multicast/.test(w)));
  const bc = routeWarnings([{ network: ip("10.0.0.0"), prefix: 8, router: ip("255.255.255.255") }, def]);
  assert.ok(bc.some((w) => /broadcast/.test(w)));
  // Exact duplicate rows produce one warning each time they repeat.
  const dup = routeWarnings([def, def, def]);
  assert.equal(dup.filter((w) => /listed twice/.test(w)).length, 2);
  // Default router of 0.0.0.0 is not repeated as option 3.
  assert.doesNotMatch(iscConfig([{ network: 0, prefix: 0, router: 0 }], { includeMs: false }), /option routers/);
});

test("verifier: config text for the RFC table", () => {
  const routes: Route[] = ["10.17.0.0/16", "10.229.0.128/25", "0.0.0.0/0"].map((t) => {
    const c = cidr(t);
    return { network: c.network, prefix: c.prefix, router: ip("192.0.2.1") };
  });
  const bytes = encodeRoutes(routes);
  assert.deepEqual(bytes, [16, 10, 17, 192, 0, 2, 1, 25, 10, 229, 0, 128, 192, 0, 2, 1, 0, 192, 0, 2, 1]);
  assert.equal(toHex(bytes), "100a11c0000201190ae50080c000020100c0000201");
  const kea = JSON.parse(keaConfig(routes, { includeMs: true }));
  assert.equal(kea["option-data"][1].data, "100A11C0000201190AE50080C000020100C0000201");
  assert.equal(kea["option-data"][2].code, 249);
  assert.equal(
    dnsmasqConfig(routes, { includeMs: false }),
    "dhcp-option=option:router,192.0.2.1\ndhcp-option=121,10.17.0.0/16,192.0.2.1,10.229.0.128/25,192.0.2.1,0.0.0.0/0,192.0.2.1",
  );
});

/* ---------------- second verifier pass ---------------- */

const route = (dest: string, router: string): Route => {
  const c = cidr(dest);
  return { network: c.network, prefix: c.prefix, router: ip(router) };
};

// A whole option as a packet capture shows it: code 0x79, length 0x0d, then
// 192.168.2.0/24 via 192.168.1.1 (18 c0 a8 02 | c0 a8 01 01) and the default
// route via 192.168.1.1 (00 | c0 a8 01 01). Derived by hand from RFC 3442.
test("verifier 2: captured option in every paste form", () => {
  const forms = [
    "79 0d 18 c0 a8 02 c0 a8 01 01 00 c0 a8 01 01",
    "790d18c0a802c0a8010100c0a80101",
    "79:0D:18:C0:A8:02:C0:A8:01:01:00:C0:A8:01:01",
    "\\x79\\x0d\\x18\\xc0\\xa8\\x02\\xc0\\xa8\\x01\\x01\\x00\\xc0\\xa8\\x01\\x01",
    "0x79,0x0d,0x18,0xc0,0xa8,0x02,0xc0,0xa8,0x01,0x01,0x00,0xc0,0xa8,0x01,0x01",
  ];
  for (const text of forms) {
    const p = parseHexBytes(text);
    assert.ok(p.ok, text);
    const d = decodeOption(p.value);
    assert.equal(d.error, null, text);
    assert.equal(d.headerCode, 121, text);
    assert.equal(d.dataLength, 13, text);
    assert.deepEqual(
      d.routes.map((r) => `${cidrString(r.network, r.prefix)} via ${formatIPv4(r.router)}`),
      ["192.168.2.0/24 via 192.168.1.1", "0.0.0.0/0 via 192.168.1.1"],
      text,
    );
    assert.deepEqual(d.warnings, [], text);
  }
  // The encoder produces exactly the data portion.
  assert.equal(toHex(encodeRoutes([route("192.168.2.0/24", "192.168.1.1"), route("0.0.0.0/0", "192.168.1.1")])), "18c0a802c0a8010100c0a80101");
});

test("verifier 2: RFC dotted descriptor and dhcpd decimal forms agree", () => {
  const a = parseDecimalBytes("24.192.168.123.10.10.10.1");
  const b = parseDecimalBytes("option rfc3442-classless-static-routes 24, 192, 168, 123, 10, 10, 10, 1;");
  const c = parseDecimalBytes("option ms-classless-static-routes 24,192,168,123,10,10,10,1 ;");
  assert.ok(a.ok && b.ok && c.ok);
  assert.deepEqual(a.value, [24, 192, 168, 123, 10, 10, 10, 1]);
  assert.deepEqual(b.value, a.value);
  assert.deepEqual(c.value, a.value);
  const d = decodeOption(a.value);
  assert.equal(d.error, null);
  assert.equal(cidrString(d.routes[0].network, d.routes[0].prefix), "192.168.123.0/24");
  assert.equal(formatIPv4(d.routes[0].router), "10.10.10.1");
  assert.ok(d.warnings.some((w) => /No default route/.test(w)));
});

test("verifier 2: malformed data keeps earlier routes and names the byte", () => {
  // Default route, then a width of 40.
  const d = decodeOption([0, 10, 0, 0, 1, 40, 1, 2, 3, 4]);
  assert.equal(d.routes.length, 1);
  assert.match(d.error ?? "", /^Byte 5 should be a prefix length/);
  assert.match(d.error ?? "", /40 \(0x28\)/);
  // Width 33 is the first illegal width.
  assert.match(decodeOption([33, 1, 2, 3, 4, 5, 6, 7, 8]).error ?? "", /33/);
  assert.equal(decodeOption([32, 1, 2, 3, 4, 5, 6, 7, 8]).error, null);
  // 249 header with a length that does not match.
  assert.match(decodeOption([0xf9, 6, 0, 1, 2, 3, 4]).error ?? "", /says 6 while 5 octets follow/);
  // A pasted option with a trailing End option (255) has a length mismatch.
  assert.notEqual(decodeOption([0x79, 5, 0, 192, 168, 1, 1, 255]).error, null);
  // Truncated router.
  assert.match(decodeOption([24, 10, 0, 0, 192, 168]).error ?? "", /needs 8 octets/);
});

test("verifier 2: masks, edge networks and host bits", () => {
  assert.deepEqual(encodeRoute(route("0.0.0.0/32", "192.0.2.1")), [32, 0, 0, 0, 0, 192, 0, 2, 1]);
  assert.deepEqual(encodeRoute(route("10.0.0.0/7", "192.0.2.1")), [7, 10, 192, 0, 2, 1]);
  const odd = cidr("11.0.0.0/7");
  assert.equal(formatIPv4(odd.network), "10.0.0.0");
  assert.equal(odd.hostBitsSet, true);
  const m = cidr("192.0.2.128/255.255.255.128");
  assert.equal(m.prefix, 25);
  assert.equal(cidr("10.1.2.3/8").hostBitsSet, true);
  assert.equal(formatIPv4(cidr("10.1.2.3/8").network), "10.0.0.0");
  assert.equal(parseCidr("10.0.0.0/33").ok, false);
  assert.equal(parseCidr("10.0.0.0/255.0.255.0").ok, false);
  assert.equal(parseCidr("010.0.0.0/8").ok, false);
});

test("verifier 2: error messages stay short for huge input", () => {
  const big = "1".repeat(200000);
  for (const r of [parseCidr(big), parseCidr(`10.0.0.0/${big}`), parseCidr(`${big}/8`), parseIPv4(big)]) {
    assert.ok(!r.ok && r.error.length < 300, r.ok ? "" : r.error.slice(0, 80));
  }
  const nohex = parseHexBytes("g".repeat(16000));
  assert.ok(!nohex.ok && nohex.error.length < 300);
});

test("verifier 2: config renderers with and without 249", () => {
  const routes = [route("10.0.0.0/8", "192.168.1.254"), route("0.0.0.0/0", "192.168.1.1")];
  const isc = iscConfig(routes, { includeMs: false });
  assert.match(isc, /option rfc3442-classless-static-routes code 121 = array of unsigned integer 8;/);
  assert.match(isc, /option routers 192\.168\.1\.1;/);
  assert.match(isc, /option rfc3442-classless-static-routes 8, 10, 192, 168, 1, 254, 0, 192, 168, 1, 1;/);
  assert.doesNotMatch(isc, /249|ms-classless/);
  const iscMs = iscConfig(routes, { includeMs: true });
  assert.match(iscMs, /option ms-classless-static-routes code 249 = array of unsigned integer 8;/);
  assert.match(iscMs, /option ms-classless-static-routes 8, 10, 192, 168, 1, 254, 0, 192, 168, 1, 1;/);
  const kea = JSON.parse(keaConfig(routes, { includeMs: false }));
  assert.deepEqual(kea, {
    "option-data": [
      { name: "routers", data: "192.168.1.1" },
      { code: 121, "csv-format": false, data: "080AC0A801FE00C0A80101" },
    ],
  });
  assert.equal(
    dnsmasqConfig(routes, { includeMs: true }),
    "dhcp-option=option:router,192.168.1.1\ndhcp-option=121,10.0.0.0/8,192.168.1.254,0.0.0.0/0,192.168.1.1\ndhcp-option=249,10.0.0.0/8,192.168.1.254,0.0.0.0/0,192.168.1.1",
  );
  // Two default routes with different gateways are flagged.
  const twoDefaults = routeWarnings([route("0.0.0.0/0", "192.168.1.1"), route("0.0.0.0/0", "192.168.1.2")]);
  assert.ok(twoDefaults.some((w) => /different routers/.test(w)));
});

console.log(`dhcp-option-121-encoder (with second verifier pass): ${passed} tests passed`);
