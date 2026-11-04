import assert from "node:assert/strict";
import { createHash, randomFillSync } from "node:crypto";
import {
  GREGORIAN_OFFSET,
  NAMESPACES,
  MAX_BATCH,
  buildV1,
  canonical,
  decodeMany,
  decodeUuid,
  formatUuid,
  generateBatch,
  isoFrom100ns,
  parseUuid,
  sha1,
  swapGuidOrder,
  ticksFromUnixMs,
  uuidNameBased,
  uuidV4,
  uuidV7,
  utf8,
  bytesToHex,
  relativeTo,
} from "../../client/src/lib/toolkit/uuid-tool.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const cryptoFill = (b: Uint8Array) => { randomFillSync(b); };
function hexOf(s: string) {
  const p = parseUuid(s);
  if (p.kind !== "ok") throw new Error(`parse failed: ${s} ${JSON.stringify(p)}`);
  return p.hex;
}

test("Gregorian offset is 141427 days of 100 ns ticks", () => {
  assert.equal(GREGORIAN_OFFSET, 141427n * 86400n * 10_000_000n);
  // And it is exactly the distance between the two epochs per Date.
  const days = (Date.UTC(1970, 0, 1) - Date.UTC(1582, 9, 15)) / 86_400_000;
  assert.equal(days, 141427);
});

// RFC 9562 Appendix A test vectors.
test("A.1 UUIDv1 C232AB00-9414-11EC-B3C8-9F6BDECED846", () => {
  const d = decodeUuid(hexOf("C232AB00-9414-11EC-B3C8-9F6BDECED846"), NOW);
  assert.equal(d.version, 1);
  assert.equal(d.variant, "rfc");
  assert.equal(d.time!.raw, 0x1ec9414c232ab00n);
  assert.equal(d.time!.iso, "2022-02-22T19:22:22.0000000Z");
  assert.equal(d.clockSeq, 0x33c8);
  assert.equal(d.node!.mac, "9f:6b:de:ce:d8:46");
  assert.equal(d.node!.multicast, true); // RFC example uses a random node
  assert.equal(d.sortsByTime, false);
  assert.deepEqual(d.fields.map((f) => f.name), ["time_low", "time_mid", "ver", "time_high", "var", "clock_seq", "node"]);
  assert.deepEqual(d.fields.map((f) => f.hex), ["c232ab00", "9414", "1", "1ec", "2", "33c8", "9f6bdeced846"]);
});

test("A.5 UUIDv6 1EC9414C-232A-6B00-B3C8-9F6BDECED846 (same instant as A.1)", () => {
  const d = decodeUuid(hexOf("1EC9414C-232A-6B00-B3C8-9F6BDECED846"), NOW);
  assert.equal(d.version, 6);
  assert.equal(d.time!.raw, 0x1ec9414c232ab00n);
  assert.equal(d.time!.iso, "2022-02-22T19:22:22.0000000Z");
  assert.equal(d.clockSeq, 0x33c8);
  assert.equal(d.sortsByTime, true);
});

test("A.6 UUIDv7 017F22E2-79B0-7CC3-98C4-DC0C0C07398F", () => {
  const d = decodeUuid(hexOf("017F22E2-79B0-7CC3-98C4-DC0C0C07398F"), NOW);
  assert.equal(d.version, 7);
  assert.equal(d.time!.raw, 0x017f22e279b0n);
  assert.equal(d.time!.unixMs, 1645557742000n);
  assert.equal(d.time!.iso, "2022-02-22T19:22:22.000Z");
  assert.deepEqual(d.fields.map((f) => f.hex), ["017f22e279b0", "7", "cc3", "2", "18c4dc0c0c07398f"]);
});

test("A.2 UUIDv3 DNS www.example.com", () => {
  const r = uuidNameBased(3, NAMESPACES[0].uuid.replace(/-/g, ""), "www.example.com");
  assert.ok(r.ok);
  assert.equal(canonical(r.hex), "5df41881-3aed-3515-88a7-2f4a814cf09e");
  assert.equal(decodeUuid(r.hex, NOW).version, 3);
});

test("A.4 UUIDv5 DNS www.example.com", () => {
  const r = uuidNameBased(5, NAMESPACES[0].uuid.replace(/-/g, ""), "www.example.com");
  assert.ok(r.ok);
  assert.equal(canonical(r.hex), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
});

test("A.3 UUIDv4 919108f7-52d1-4320-9bac-f847db4148a8 decodes as random", () => {
  const d = decodeUuid(hexOf("919108f7-52d1-4320-9bac-f847db4148a8"), NOW);
  assert.equal(d.version, 4);
  assert.equal(d.variant, "rfc");
  assert.equal(d.time, null);
  assert.equal(d.node, null);
});

test("Nil and Max", () => {
  assert.equal(decodeUuid(hexOf("00000000-0000-0000-0000-000000000000"), NOW).special, "nil");
  assert.equal(decodeUuid(hexOf("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"), NOW).special, "max");
});

test("variants", () => {
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-7000-000000000001"), NOW).variant, "ncs");
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-8000-000000000001"), NOW).variant, "rfc");
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-b000-000000000001"), NOW).variant, "rfc");
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-c000-000000000001"), NOW).variant, "microsoft");
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-d000-000000000001"), NOW).variant, "microsoft");
  assert.equal(decodeUuid(hexOf("00000000-0000-1000-e000-000000000001"), NOW).variant, "future");
  const v0 = decodeUuid(hexOf("12345678-1234-0234-8234-123456789abc"), NOW);
  assert.equal(v0.version, 0);
  assert.ok(v0.findings.some((f) => f.tone === "warn" && /not assigned/.test(f.text)));
  const v9 = decodeUuid(hexOf("12345678-1234-9234-8234-123456789abc"), NOW);
  assert.ok(v9.findings.some((f) => /9 to 15 are reserved/.test(f.text)));
});

test("SHA-1 FIPS 180-4 vectors and against node:crypto", () => {
  assert.equal(bytesToHex(sha1(utf8("abc"))), "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(bytesToHex(sha1(utf8(""))), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
  assert.equal(
    bytesToHex(sha1(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "84983e441c3bd26ebaae4aa1f95129e5e54670f1",
  );
  for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    const b = new Uint8Array(len);
    randomFillSync(b);
    assert.equal(bytesToHex(sha1(b)), createHash("sha1").update(b).digest("hex"), `len ${len}`);
  }
});

test("name-based against an independent node:crypto computation, all namespaces", () => {
  for (const ns of NAMESPACES) {
    for (const name of ["", "example.com", "https://example.com/a?b=c", "é\u{1F600}"]) {
      for (const [v, alg] of [[3, "md5"], [5, "sha1"]] as const) {
        const nsBytes = Buffer.from(ns.uuid.replace(/-/g, ""), "hex");
        const h = createHash(alg).update(Buffer.concat([nsBytes, Buffer.from(name, "utf8")])).digest().subarray(0, 16);
        h[6] = (h[6] & 0x0f) | (v << 4);
        h[8] = (h[8] & 0x3f) | 0x80;
        const r = uuidNameBased(v, ns.uuid.replace(/-/g, ""), name);
        assert.ok(r.ok);
        assert.equal(r.hex, h.toString("hex"));
      }
    }
  }
});

test("name over the byte cap is refused, not thrown", () => {
  const r = uuidNameBased(5, NAMESPACES[0].uuid.replace(/-/g, ""), "x".repeat(65_537));
  assert.equal(r.ok, false);
});

test("v4 generation sets version and variant on every UUID", () => {
  for (let i = 0; i < 2000; i++) {
    const h = uuidV4(cryptoFill);
    assert.match(canonical(h), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  // All-ones randomness still yields a valid v4.
  assert.equal(canonical(uuidV4((b) => b.fill(0xff))), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.equal(canonical(uuidV4((b) => b.fill(0x00))), "00000000-0000-4000-8000-000000000000");
});

test("v7 layout, timestamp, and decode round trip", () => {
  const r = uuidV7(1645557742000, (b) => b.fill(0), null);
  assert.ok(r.ok);
  assert.equal(canonical(r.hex), "017f22e2-79b0-7000-8000-000000000000");
  const d = decodeUuid(r.hex, NOW);
  assert.equal(d.version, 7);
  assert.equal(d.time!.unixMs, 1645557742000n);
  const all = uuidV7(1645557742000, (b) => b.fill(0xff), null);
  assert.ok(all.ok);
  assert.equal(canonical(all.hex), "017f22e2-79b0-7fff-bfff-ffffffffffff");
});

test("v7 batch is strictly increasing within one millisecond and across calls", () => {
  const b = generateBatch(7, MAX_BATCH, NOW, cryptoFill, null);
  assert.ok(b.ok);
  assert.equal(b.list.length, MAX_BATCH);
  for (let i = 1; i < b.list.length; i++) assert.ok(b.list[i] > b.list[i - 1], `order at ${i}`);
  for (const h of b.list) {
    const d = decodeUuid(h, NOW);
    assert.equal(d.version, 7);
    assert.equal(d.variant, "rfc");
  }
  // Clock steps backward: still increasing.
  const back = generateBatch(7, 10, NOW - 5000, cryptoFill, b.state);
  assert.ok(back.ok);
  assert.ok(back.list[0] > b.list[b.list.length - 1]);
  // Counter overflow advances the timestamp by one millisecond.
  const max = (1n << 74n) - 1n;
  const o = uuidV7(NOW, cryptoFill, { ms: NOW, rand: max });
  assert.ok(o.ok);
  assert.equal(decodeUuid(o.hex, NOW).time!.unixMs, BigInt(NOW + 1));
  // Out of range clock.
  assert.equal(uuidV7(-1, cryptoFill, null).ok, false);
  assert.equal(uuidV7(2 ** 48, cryptoFill, null).ok, false);
  assert.equal(uuidV7(NaN, cryptoFill, null).ok, false);
});

test("batch count is clamped", () => {
  const b = generateBatch(4, 5000, NOW, cryptoFill, null);
  assert.ok(b.ok && b.list.length === MAX_BATCH);
  const z = generateBatch(4, 0, NOW, cryptoFill, null);
  assert.ok(z.ok && z.list.length === 1);
});

test("formatting", () => {
  const h = "017f22e279b07cc398c4dc0c0c07398f";
  assert.equal(formatUuid(h, "lower", "hyphens"), "017f22e2-79b0-7cc3-98c4-dc0c0c07398f");
  assert.equal(formatUuid(h, "upper", "hyphens"), "017F22E2-79B0-7CC3-98C4-DC0C0C07398F");
  assert.equal(formatUuid(h, "lower", "plain"), h);
  assert.equal(formatUuid(h, "upper", "braces"), "{017F22E2-79B0-7CC3-98C4-DC0C0C07398F}");
  assert.equal(formatUuid(h, "upper", "urn"), "urn:uuid:017F22E2-79B0-7CC3-98C4-DC0C0C07398F");
});

test("parsing accepts the common wrappers and rejects bad input precisely", () => {
  const want = "017f22e279b07cc398c4dc0c0c07398f";
  for (const s of [
    "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
    "  017F22E2-79B0-7CC3-98C4-DC0C0C07398F  ",
    "{017f22e2-79b0-7cc3-98c4-dc0c0c07398f}",
    "urn:uuid:017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
    "URN:UUID:017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
    "017f22e279b07cc398c4dc0c0c07398f",
    '"017f22e2-79b0-7cc3-98c4-dc0c0c07398f",',
  ]) {
    const p = parseUuid(s);
    assert.equal(p.kind, "ok", s);
    if (p.kind === "ok") assert.equal(p.hex, want);
  }
  assert.equal(parseUuid("").kind, "empty");
  assert.equal(parseUuid("   ").kind, "empty");
  const g = parseUuid("017f22e2-79b0-7cc3-98c4-dc0c0c07398g");
  assert.ok(g.kind === "error" && /"g" at position 36/.test(g.message));
  const hy = parseUuid("017f22e279b0-7cc3-98c4-dc0c0c07398f0000");
  assert.ok(hy.kind === "error" && /8-4-4-4-12/.test(hy.message));
  const short = parseUuid("abc");
  assert.ok(short.kind === "error" && /3 hex digits/.test(short.message));
  assert.equal(parseUuid("x".repeat(10_000)).kind, "error");
  assert.equal(parseUuid("{017f22e2-79b0-7cc3-98c4-dc0c0c07398f").kind, "error");
  assert.equal(parseUuid("\u0000".repeat(36)).kind, "error");
});

test("Windows GUID byte order swap", () => {
  // .NET: new Guid("00112233-4455-6677-8899-aabbccddeeff").ToByteArray()
  // gives 33 22 11 00 55 44 77 66 88 99 aa bb cc dd ee ff.
  assert.equal(swapGuidOrder("33221100554477668899aabbccddeeff"), "00112233445566778899aabbccddeeff");
  const p = parseUuid("33221100554477668899aabbccddeeff", true);
  assert.ok(p.kind === "ok" && p.hex === "00112233445566778899aabbccddeeff");
});

test("v1 with a documentation MAC (RFC 7042) flags the hardware address", () => {
  const ms = Date.UTC(2009, 1, 13, 23, 31, 30);
  const hex = buildV1(ticksFromUnixMs(ms) + 1234n, 0x2a5f, "00005e005301");
  const d = decodeUuid(hex, NOW);
  assert.equal(d.version, 1);
  assert.equal(d.time!.iso, "2009-02-13T23:31:30.0001234Z");
  assert.equal(d.clockSeq, 0x2a5f);
  assert.equal(d.node!.mac, "00:00:5e:00:53:01");
  assert.equal(d.node!.multicast, false);
  assert.equal(d.node!.local, false);
  assert.equal(d.node!.oui, "00:00:5E");
  assert.ok(d.findings.some((f) => f.tone === "danger"));
  console.log("  example v1:", canonical(hex));
});

test("v1 boundary timestamps", () => {
  const zero = decodeUuid(buildV1(0n, 0, "010000000000"), NOW);
  assert.equal(zero.time!.iso, "1582-10-15T00:00:00.0000000Z");
  const max = decodeUuid(buildV1((1n << 60n) - 1n, 0, "010000000000"), NOW);
  assert.ok(max.time!.displayable);
  assert.match(max.time!.iso, /^5236-03-31T21:21:00\.6846975Z$/);
  // Pre-1970 negative tick handling floors correctly.
  assert.equal(isoFrom100ns(-1n).iso, "1969-12-31T23:59:59.9999999Z");
  assert.equal(isoFrom100ns(-10_000n).iso, "1969-12-31T23:59:59.9990000Z");
  // Future time warns.
  const fut = decodeUuid(buildV1(ticksFromUnixMs(NOW + 10 * 86_400_000), 0, "010000000000"), NOW);
  assert.ok(fut.findings.some((f) => /future/.test(f.text)));
});

test("v2 DCE security layout", () => {
  // local id 1000 (uid), domain 0, time high bits from 2022.
  const v1 = buildV1(0x1ec9414c232ab00n, 0, "00005e005301");
  let value = BigInt("0x" + v1);
  value = (value & ~(0xffffffffn << 96n)) | (1000n << 96n); // local id
  value = (value & ~(0xfn << 76n)) | (2n << 76n); // version 2
  value = (value & ~(0xffn << 48n)) | (0x01n << 48n); // domain 1 (group)
  const d = decodeUuid(value.toString(16).padStart(32, "0"), NOW);
  assert.equal(d.version, 2);
  assert.equal(d.dce!.localId, 1000);
  assert.equal(d.dce!.domain, 1);
  assert.equal(d.time!.raw, 0x1ec9414n << 32n);
});

test("decodeMany: errors per line, shared nodes, span, cap", () => {
  const a = buildV1(ticksFromUnixMs(Date.UTC(2020, 0, 1)), 1, "00005e005301");
  const b = buildV1(ticksFromUnixMs(Date.UTC(2021, 0, 1)), 2, "00005e005301");
  const text = [canonical(a), "nope", "", canonical(b), "017F22E2-79B0-7CC3-98C4-DC0C0C07398F"].join("\n");
  const r = decodeMany(text, NOW);
  assert.equal(r.results.length, 4);
  assert.equal(r.results[1].kind, "error");
  assert.equal(r.results[1].line, 2);
  assert.deepEqual(r.sharedNodes, [{ mac: "00:00:5e:00:53:01", count: 2 }]);
  assert.equal(r.span!.first, "2020-01-01T00:00:00.000Z");
  assert.equal(r.span!.last, "2022-02-22T19:22:22.000Z");
  const many = decodeMany(Array(250).fill(canonical(a)).join("\n"), NOW);
  assert.equal(many.results.length, 200);
  assert.equal(many.truncated, 50);
});

test("relative time", () => {
  assert.equal(relativeTo(BigInt(NOW - 3 * 86_400_000), NOW), "3 days ago");
  assert.equal(relativeTo(BigInt(NOW + 30_000), NOW), "in 30 seconds");
  assert.equal(relativeTo(BigInt(NOW), NOW), "right now");
});

test("fuzz: random strings never throw", () => {
  const alphabet = "0123456789abcdefABCDEF-{}:urnid \t\"'xyz";
  for (let i = 0; i < 5000; i++) {
    const len = Math.floor(Math.random() * 50);
    let s = "";
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    const p = parseUuid(s);
    if (p.kind === "ok") decodeUuid(p.hex, NOW);
  }
  for (let i = 0; i < 3000; i++) {
    const b = new Uint8Array(16);
    randomFillSync(b);
    decodeUuid(Buffer.from(b).toString("hex"), NOW);
  }
});


/* ------------------------------------------------------------------------
 * Independent verifier cases. Reference values come from RFC 9562 Appendix A,
 * Python's uuid module (a separate implementation of RFC 4122/9562), the
 * .NET Guid.ToByteArray layout, and the COM IUnknown IID.
 * ---------------------------------------------------------------------- */

test("verifier: RFC 9562 A.3 v4 field split", () => {
  const d = decodeUuid(hexOf("919108f7-52d1-4320-9bac-f847db4148a8"), NOW);
  assert.equal(d.version, 4);
  assert.equal(d.variant, "rfc");
  assert.deepEqual(d.fields.map((f) => [f.name, f.hex]), [
    ["random_a", "919108f752d1"],
    ["ver", "4"],
    ["random_b", "320"],
    ["var", "2"],
    ["random_c", "1bacf847db4148a8"],
  ]);
  assert.equal(d.time, null);
  assert.equal(d.node, null);
});

test("verifier: name-based UUIDs match Python's uuid3/uuid5", () => {
  const ns = (k: string) => NAMESPACES.find((n) => n.key === k)!.uuid.replace(/-/g, "");
  const cases: [3 | 5, string, string, string][] = [
    [3, "dns", "python.org", "6fa459ea-ee8a-3ca4-894e-db77e160355e"],
    [5, "dns", "python.org", "886313e1-3b8a-5372-9b90-0c9aee199e5d"],
    [5, "url", "https://maxdoubin.com/", "85f09819-580c-5c90-94a0-e66c363c1a10"],
    [3, "oid", "1.3.6.1", "dd1a1cef-13d5-368a-ad82-eca71acd4cd1"],
    [5, "x500", "cn=test", "aa100ae4-58f0-5dc6-8f4e-421955eaf67f"],
    [5, "dns", "café.example", "1f25f992-3aeb-54f1-b196-ccca88f733b1"],
  ];
  for (const [v, k, name, want] of cases) {
    const r = uuidNameBased(v, ns(k), name);
    assert.ok(r.ok);
    assert.equal(canonical(r.ok ? r.hex : ""), want, `${v} ${k} ${name}`);
  }
  // A malformed namespace is refused instead of being hashed as zeros.
  const bad = uuidNameBased(5, "zz".repeat(16), "x");
  assert.equal(bad.ok, false);
  assert.equal(uuidNameBased(5, "abc", "x").ok, false);
});

test("verifier: the DNS namespace ID is itself a v1 UUID from 1998", () => {
  // Python: uuid.UUID('6ba7b810-...').time == 131059232331511824, clock_seq 180.
  const d = decodeUuid(hexOf("6ba7b810-9dad-11d1-80b4-00c04fd430c8"), NOW);
  assert.equal(d.version, 1);
  assert.equal(d.time!.raw, 131059232331511824n);
  assert.equal(d.time!.iso, "1998-02-04T22:13:53.1511824Z");
  assert.equal(d.clockSeq, 180);
  assert.equal(d.node!.mac, "00:c0:4f:d4:30:c8");
  assert.equal(d.node!.multicast, false);
  assert.equal(d.node!.local, false);
  assert.equal(d.node!.oui, "00:C0:4F");
  assert.ok(d.findings.some((f) => f.tone === "danger" && f.text.includes("00:C0:4F")));
});

test("verifier: variant from the first digit of the fourth group", () => {
  const want: Record<string, string> = {
    "0": "ncs", "7": "ncs", "8": "rfc", "9": "rfc", a: "rfc", b: "rfc", c: "microsoft", d: "microsoft", e: "future", f: "future",
  };
  for (const [digit, variant] of Object.entries(want)) {
    const d = decodeUuid(`12345678123441234${digit}`.slice(0, 16) + `${digit}23456789abcdef0`, NOW);
    assert.equal(d.variant, variant, digit);
  }
  // COM's IUnknown IID is the classic Microsoft-variant GUID.
  const iunknown = decodeUuid(hexOf("{00000000-0000-0000-C000-000000000046}"), NOW);
  assert.equal(iunknown.variant, "microsoft");
  assert.equal(iunknown.special, null);
  // All zeros except the last bit is NCS, not Nil.
  const ncs = decodeUuid(hexOf("00000000-0000-0000-0000-000000000001"), NOW);
  assert.equal(ncs.variant, "ncs");
  assert.equal(ncs.special, null);
});

test("verifier: Gregorian boundaries and floor division to 100 ns", () => {
  const at = (ticks: bigint) => decodeUuid(buildV1(ticks, 0, "010203040506"), NOW).time!.iso;
  assert.equal(at(0n), "1582-10-15T00:00:00.0000000Z");
  assert.equal(at(GREGORIAN_OFFSET), "1970-01-01T00:00:00.0000000Z");
  assert.equal(at(GREGORIAN_OFFSET + 1n), "1970-01-01T00:00:00.0000001Z");
  assert.equal(at(GREGORIAN_OFFSET - 1n), "1969-12-31T23:59:59.9999999Z");
  assert.equal(at(GREGORIAN_OFFSET - 10_000n), "1969-12-31T23:59:59.9990000Z");
  // The random node from buildV1's "01..." has the multicast bit set.
  assert.equal(decodeUuid(buildV1(0n, 0, "010203040506"), NOW).node!.multicast, true);
});

test("verifier: v7 timestamp boundaries", () => {
  const v7 = (ms: bigint) =>
    decodeUuid(((ms << 80n) | (7n << 76n) | (0b10n << 62n) | 1n).toString(16).padStart(32, "0"), NOW);
  assert.equal(v7(0n).time!.iso, "1970-01-01T00:00:00.000Z");
  assert.equal(v7((1n << 48n) - 1n).time!.iso, "+010889-08-02T05:31:50.655Z");
  assert.ok(v7((1n << 48n) - 1n).findings.some((f) => f.text.includes("future")));
  assert.equal(uuidV7(2 ** 48, cryptoFill, null).ok, false);
  assert.equal(uuidV7(-1, cryptoFill, null).ok, false);
  assert.equal(uuidV7(Number.NaN, cryptoFill, null).ok, false);
  const last = uuidV7(2 ** 48 - 1, (b) => b.fill(0), null);
  assert.ok(last.ok && last.hex.startsWith("ffffffffffff7"));
});

test("verifier: DCE Security (v2) fields", () => {
  // Local ID 1000 (a typical first POSIX UID), domain 0, clock_seq_high 0.
  const d = decodeUuid(hexOf("000003e8-9dad-21d1-8000-00c04fd430c8"), NOW);
  assert.equal(d.version, 2);
  assert.deepEqual(d.dce, { domain: 0, domainName: "person (POSIX UID)", localId: 1000 });
  assert.equal(d.clockSeq, 0);
  assert.equal(d.time!.raw, (0x1d1n << 48n) | (0x9dadn << 32n));
  const g = decodeUuid(hexOf("000003e8-9dad-21d1-8001-00c04fd430c8"), NOW);
  assert.equal(g.dce!.domainName, "group (POSIX GID)");
});

test("verifier: Windows GUID byte order matches .NET ToByteArray and Python bytes_le", () => {
  // new Guid("00112233-4455-6677-8899-aabbccddeeff").ToByteArray()
  //   == 33 22 11 00 55 44 77 66 88 99 AA BB CC DD EE FF
  const dump = "33 22 11 00 55 44 77 66 88 99 aa bb cc dd ee ff";
  const p = parseUuid(dump, true);
  assert.deepEqual(p, { kind: "ok", hex: "00112233445566778899aabbccddeeff" });
  assert.deepEqual(parseUuid(dump.replace(/ /g, ":"), true), p);
  assert.deepEqual(parseUuid(dump.replace(/ /g, ""), true), p);
  // Without the option a spaced dump gets a pointed hint, not a decode.
  const q = parseUuid(dump);
  assert.equal(q.kind, "error");
  assert.match(q.kind === "error" ? q.message : "", /hex dump/);
  // swapGuidOrder is its own inverse.
  assert.equal(swapGuidOrder(swapGuidOrder("00112233445566778899aabbccddeeff")), "00112233445566778899aabbccddeeff");
});

test("verifier: malformed input is rejected with a precise message", () => {
  const err = (s: string) => {
    const p = parseUuid(s);
    assert.equal(p.kind, "error", s);
    return p.kind === "error" ? p.message : "";
  };
  // 36 characters with hyphens in the right places plus one more: 31 digits.
  assert.match(err("aaaaaaaa-bbbb-cccc-dddd-eeeeee-eeeee"), /8-4-4-4-6-5/);
  assert.match(err("c232ab00-9414-11ec-b3c8-9f6bdeced84"), /8-4-4-4-11/);
  assert.match(err("c232ab0094141 1ecb3c89f6bdeced846"), /space at position 14/i);
  assert.match(err("c232ab00941411ecb3c89f6bdeced8467"), /33 hex digits/);
  assert.match(err("g232ab00-9414-11ec-b3c8-9f6bdeced846"), /"g" at position 1/);
  assert.match(err("\u{1F600}232ab00-9414-11ec-b3c8-9f6bdeced846"), /"\u{1F600}" at position 1/u);
  assert.match(err("c232ab00\u{1F600}-9414-11ec-b3c8-9f6bdeced84"), /position 9/);
  assert.match(err("​c232ab00-9414-11ec-b3c8-9f6bdeced846"), /U\+200B/);
  assert.match(err("c232ab00-9414-11ec-b3c8-9f6bdeced846\u0000"), /U\+0000/);
  assert.match(err("{c232ab00-9414-11ec-b3c8-9f6bdeced846"), /brace/);
  assert.match(err("x".repeat(101)), /101 characters/);
  assert.equal(parseUuid("   \t ").kind, "empty");
  // Every accepted input yields exactly 32 lowercase hex digits.
  const alphabet = "0123456789abcdefABCDEF----{}: \"'";
  for (let i = 0; i < 20000; i++) {
    let s = "";
    const len = 30 + Math.floor(Math.random() * 12);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    for (const g of [false, true]) {
      const p = parseUuid(s, g);
      if (p.kind === "ok") assert.match(p.hex, /^[0-9a-f]{32}$/, JSON.stringify(s));
    }
  }
});

test("verifier: batch of many lines stays capped and finds the shared node", () => {
  const line = "32e34c51-4e1d-11e0-9b7c-00005e005301";
  const b = decodeMany(Array(250).fill(line).join("\n"), NOW);
  assert.equal(b.results.length, 200);
  assert.equal(b.truncated, 50);
  assert.deepEqual(b.sharedNodes, [{ mac: "00:00:5e:00:53:01", count: 200 }]);
  const huge = decodeMany("f".repeat(5_000_000), NOW);
  assert.equal(huge.results.length, 1);
  assert.equal(huge.results[0].kind, "error");
});

console.log(`uuid-tool: ${passed} tests passed`);
