import assert from "node:assert/strict";
import {
  decodeCommunities,
  parseCommunity,
  splitCommunities,
  MAX_COMMUNITIES,
  type DecodedCommunity,
} from "../../client/src/lib/toolkit/bgp-community-decoder.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
}

function good(s: string): DecodedCommunity {
  const r = parseCommunity(s);
  assert.ok(r.ok, `${s}: ${!r.ok ? r.error : ""}`);
  return (r as { ok: true; value: DecodedCommunity }).value;
}
function bad(s: string, re?: RegExp) {
  const r = parseCommunity(s);
  assert.equal(r.ok, false, `expected failure for ${JSON.stringify(s.slice(0, 30))}`);
  if (!r.ok && re) assert.match(r.error, re);
}
function field(d: DecodedCommunity, label: string): string {
  const f = d.fields.find((x) => x.label.startsWith(label));
  assert.ok(f, `no field ${label}`);
  return f!.value;
}

t("well-known values, RFC 1997 / 3765 / 7999 / 8326", () => {
  const table: [string, string, number, string][] = [
    ["no-export", "65535:65281", 4294967041, "NO_EXPORT"],
    ["NO_ADVERTISE", "65535:65282", 4294967042, "NO_ADVERTISE"],
    ["no_export_subconfed", "65535:65283", 4294967043, "NO_EXPORT_SUBCONFED"],
    ["local-AS", "65535:65283", 4294967043, "NO_EXPORT_SUBCONFED"],
    ["nopeer", "65535:65284", 4294967044, "NOPEER"],
    ["blackhole", "65535:666", 4294902426, "BLACKHOLE"],
    ["graceful-shutdown", "65535:0", 4294901760, "GRACEFUL_SHUTDOWN"],
    ["accept-own", "65535:1", 4294901761, "ACCEPT_OWN"],
  ];
  for (const [alias, canon, int, name] of table) {
    const a = good(alias);
    assert.equal(a.canonical, canon);
    assert.equal(a.name, name);
    assert.equal(field(a, "32-bit integer"), String(int));
    const b = good(canon);
    assert.equal(b.name, name);
    const c = good(String(int));
    assert.equal(c.canonical, canon);
  }
  assert.equal(good("no-export").bytes, "FF FF FF 01");
  assert.equal(field(good("no-export"), "Hex"), "0xFFFFFF01");
  assert.equal(good("0xFFFF029A").name, "BLACKHOLE");
  assert.equal(good("ff:ff:ff:01").name, "NO_EXPORT");
  assert.equal(good("FFFFFF02").name, "NO_ADVERTISE");
});

t("standard conversion", () => {
  assert.equal(field(good("65000:100"), "32-bit integer"), "4259840100");
  assert.equal(good("4259840100").canonical, "65000:100");
  assert.equal(field(good("1:1"), "32-bit integer"), "65537");
  assert.equal(good("0").canonical, "0:0");
  assert.equal(good("4294967295").canonical, "65535:65535");
  assert.equal(good("65535:65535").bytes, "FF FF FF FF");
  const priv = good("64512:10");
  assert.ok(priv.flags.some((f) => /private/.test(f.text)));
  const doc = good("64496:1");
  assert.ok(doc.flags.some((f) => /documentation/.test(f.text)));
  const trans = good("23456:1");
  assert.ok(trans.flags.some((f) => /AS_TRANS/.test(f.text)));
  const zero = good("0:6939");
  assert.ok(zero.flags.some((f) => /reserves/.test(f.text)));
  const unk = good("65535:4");
  assert.equal(unk.name, null);
  assert.ok(unk.flags.some((f) => f.tone === "warn" && /well-known/.test(f.text)));
  assert.ok(good("3356:666").flags.some((f) => /blackhole/.test(f.text)));
});

t("standard errors", () => {
  bad("70000:1", /large community/);
  bad("1.10:100", /asdot/);
  bad("65535:65536", /second half/);
  bad("4294967296", /32 bits/);
  bad("99999999999999999999999999999999999", /32 bits/);
  bad("a:b");
  bad("0x123456789", /hex digits/);
});

t("large communities, RFC 8092", () => {
  const a = good("64496:4294967295:1");
  assert.equal(a.kind, "large");
  assert.equal(a.bytes, "00 00 FB F0 FF FF FF FF 00 00 00 01");
  const b = good("large:4200000000:1:2");
  assert.equal(b.canonical, "4200000000:1:2");
  assert.equal(b.bytes, "FA 56 EA 00 00 00 00 01 00 00 00 02");
  assert.ok(b.flags.some((f) => /private/.test(f.text)));
  const c = good("64086.59904:1:2");
  assert.equal(c.canonical, "4200000000:1:2");
  const d = good("0xFA56EA000000000100000002");
  assert.equal(d.canonical, "4200000000:1:2");
  assert.ok(good("0:1:2").flags.some((f) => /reserved/.test(f.text)));
  bad("1:4294967296:0", /32 bits/);
  bad("4294967296:1:1");
  bad("1:x:2");
});

t("extended communities, RFC 4360 / RFC 5668", () => {
  const rt = good("rt:65000:100");
  assert.equal(rt.kind, "extended");
  assert.equal(rt.bytes, "00 02 FD E8 00 00 00 64");
  assert.equal(rt.canonical, "rt:65000:100");
  assert.equal(rt.name, "Route Target");
  assert.equal(field(rt, "64-bit integer"), "842122827661412");
  assert.equal(good("RT:65000:100").bytes, rt.bytes);
  assert.equal(good("target:65000:100").bytes, rt.bytes);
  assert.equal(good("0x0002FDE800000064").canonical, "rt:65000:100");
  assert.equal(good("0002fde800000064").canonical, "rt:65000:100");
  assert.equal(good("00:02:fd:e8:00:00:00:64").canonical, "rt:65000:100");

  const ip = good("target:192.0.2.1:7");
  assert.equal(ip.bytes, "01 02 C0 00 02 01 00 07");
  assert.equal(ip.canonical, "rt:192.0.2.1:7");

  const soo = good("soo:4200000000:1");
  assert.equal(soo.bytes, "02 03 FA 56 EA 00 00 01");
  assert.equal(soo.name, "Route Origin");
  assert.equal(soo.canonical, "soo:4200000000:1");
  assert.equal(good("origin:64086.59904:1").bytes, soo.bytes);

  const forced = good("rt:65000L:5");
  assert.equal(forced.bytes, "02 02 00 00 FD E8 00 05");
  assert.equal(forced.canonical, "rt:65000L:5");
  assert.equal(good(forced.canonical).bytes, forced.bytes);

  const big = good("rt:65000:4294967295");
  assert.equal(big.bytes, "00 02 FD E8 FF FF FF FF");

  bad("rt:4200000000:70000", /16 bits/);
  bad("rt:65000:4294967296", /32 bits/);
  bad("rt:192.0.2.300:1", /IPv4/);
  bad("rt:192.0.2.1:65536", /16 bits/);
  bad("rt:4294967296:1");
  bad("foo:1:2", /Unknown prefix/);
  bad("rt:::");
});

t("extended, other registered types", () => {
  const ov = good("0x4300000000000002");
  assert.equal(ov.name, "BGP Origin Validation State");
  assert.equal(field(ov, "Validation state"), "2 Invalid");
  assert.ok(ov.flags.some((f) => /Non-transitive/.test(f.text)));
  const drop = good("0x8006000000000000");
  assert.ok(drop.flags.some((f) => /drop all/.test(f.text)));
  // 0x447A0000 is 1000.0 as an IEEE 754 single.
  assert.match(field(good("0x80060000447A0000"), "Rate"), /^1000 bytes/);
  const color = good("0x030B000000000064");
  assert.equal(color.name, "Color");
  const unk = good("0x7F00000000000000");
  assert.ok(unk.flags.some((f) => /not in the table/.test(f.text)));
  // RT sub-type on a non-transitive type is not a route target.
  assert.notEqual(good("0x4002FDE800000064").canonical.startsWith("rt:"), true);
});

t("batch splitting and caps", () => {
  const s = splitCommunities("rt 65000:100, no-export\n64496:1:2; RT 192.0.2.1:5");
  assert.deepEqual(s.tokens, ["rt:65000:100", "no-export", "64496:1:2", "RT:192.0.2.1:5"]);
  const many = decodeCommunities(Array.from({ length: MAX_COMMUNITIES + 7 }, () => "1:1").join(" "));
  assert.equal(many.results.length, MAX_COMMUNITIES);
  assert.equal(many.dropped, 7);
  const huge = decodeCommunities("1:1 ".repeat(40_000));
  assert.equal(huge.clipped, true);
  bad("x".repeat(500), /characters/);
});

t("fuzz, never throws", () => {
  const alphabet = "0123456789abcdefxLrtsoolarge:.-_ ,\n";
  for (let i = 0; i < 30000; i++) {
    let s = "";
    const len = Math.floor(Math.random() * 30);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    for (const r of decodeCommunities(s).results) {
      if (r.ok) {
        const bytes = r.value.bytes.split(" ").length;
        const want = { standard: 4, extended: 8, large: 12 }[r.value.kind];
        assert.equal(bytes, want, s);
        // The canonical form must parse back to the same bytes.
        const again = parseCommunity(r.value.canonical);
        assert.ok(again.ok, `canonical ${r.value.canonical} from ${s}`);
        if (again.ok) assert.equal(again.value.bytes, r.value.bytes, s);
      } else {
        assert.ok(r.error.length > 5);
      }
    }
  }
});


// ---- Independent verifier cases ----
t("verifier: IANA well-known values by integer and bytes", () => {
  const gs = good("4294901760");
  assert.equal(gs.name, "GRACEFUL_SHUTDOWN");
  assert.equal(gs.canonical, "65535:0");
  assert.equal(gs.bytes, "FF FF 00 00");
  assert.equal(good("65535:6").name, "LLGR_STALE");
  assert.equal(good("65535:7").name, "NO_LLGR");
  assert.equal(good("ff:ff:ff:04").name, "NOPEER");
  assert.equal(field(good("nopeer"), "32-bit integer"), "4294967044");
  assert.equal(good("0xFFFF029A").canonical, "65535:666");
  // 0x29A on its own is 0:666, a reserved-range value, not BLACKHOLE.
  const z = good("0x29a");
  assert.equal(z.canonical, "0:666");
  assert.equal(z.name, null);
  assert.ok(!z.flags.some((f) => /ASN:666/.test(f.text)));
  // 64501 * 65536 + 100 = 4227137636.
  assert.equal(good("4227137636").canonical, "64501:100");
  assert.equal(field(good("64501:100"), "32-bit integer"), "4227137636");
});

t("verifier: RFC 8092 / RFC 8195 large communities", () => {
  // RFC 8195 style example 64497:1:528 -> 00 00 FB F1 | 00 00 00 01 | 00 00 02 10.
  const a = good("64497:1:528");
  assert.equal(a.kind, "large");
  assert.equal(a.bytes, "00 00 FB F1 00 00 00 01 00 00 02 10");
  const max = good("4294967295:4294967295:4294967295");
  assert.equal(max.bytes, "FF FF FF FF FF FF FF FF FF FF FF FF");
  assert.ok(max.flags.some((f) => /reserved/.test(f.text)));
  assert.equal(good("large:0:0:0").bytes, "00 00 00 00 00 00 00 00 00 00 00 00");
  assert.equal(good("AS64496:1:2").canonical, "64496:1:2");
  bad("64496:1:4294967296", /32 bits/);
  bad("64496:-1:2");
});

t("verifier: RFC 4360 / RFC 5668 extended encodings", () => {
  assert.equal(good("rt:10.1.2.3:65535").bytes, "01 02 0A 01 02 03 FF FF");
  assert.equal(good("rt:4294967295:65535").bytes, "02 02 FF FF FF FF FF FF");
  assert.equal(good("rt:65535:4294967295").bytes, "00 02 FF FF FF FF FF FF");
  const one = good("rt:65536:0");
  assert.equal(one.bytes, "02 02 00 01 00 00 00 00");
  assert.equal(good("rt:1.0:0").bytes, one.bytes);
  // 0x0002FDE800000064 = 2 * 2^48 + 65000 * 2^32 + 100.
  const expected = 2n * 2n ** 48n + 65000n * 2n ** 32n + 100n;
  assert.equal(field(good("rt:65000:100"), "64-bit integer"), expected.toString());
  assert.equal(good("soo:65000:7").bytes, "00 03 FD E8 00 00 00 07");
  assert.equal(good("site-of-origin:192.0.2.1:1").bytes, "01 03 C0 00 02 01 00 01");
  // Same numbers, different type: different community.
  assert.notEqual(good("rt:65000:5").bytes, good("rt:65000L:5").bytes);
});

t("verifier: other registered sub-types", () => {
  assert.equal(field(good("0x4300000000000000"), "Validation state"), "0 Valid");
  assert.equal(field(good("0x4300000000000001"), "Validation state"), "1 NotFound");
  assert.equal(field(good("0x43000000000000FF"), "Validation state"), "255 (undefined value)");
  // 0x42C80000 is 100.0 as an IEEE 754 single.
  assert.match(field(good("0x800C000042C80000"), "Rate"), /^100 packets per second$/);
  // Link Bandwidth: 0x49742400 is 1000000.0, bytes per second.
  const lb = good("0x4004FDE849742400");
  assert.equal(lb.name, "Link Bandwidth");
  assert.equal(field(lb, "Bandwidth"), "1000000 bytes per second");
  assert.ok(lb.flags.some((f) => /Non-transitive/.test(f.text)));
  const redirect = good("0x8108C000020100FF");
  assert.ok(redirect.fields.some((f) => /RFC 8955/.test(f.value)));
  assert.equal(field(redirect, "Global admin, IPv4"), "192.0.2.1");
  assert.equal(field(good("0x0600000000000000"), "Sub-type"), "0x00 MAC Mobility (RFC 7432)");
});

t("verifier: malformed and adversarial input", () => {
  // Inherited Object.prototype names must not count as keywords.
  bad("constructor:1:2", /Unknown prefix/);
  bad("Constructor:65000:100", /Unknown prefix/);
  bad("__proto__:1:2");
  bad("hasownproperty:1:2", /Unknown prefix/);
  // Short words made of hex letters are not decoded as numbers.
  bad("face", /0x/);
  bad("add", /0x/);
  bad("deadbeefcafe", /8, 16 or 24/);
  assert.equal(good("0xface").canonical, "0:64206");
  assert.equal(good("deadbeef").canonical, "57005:48879");
  bad("65536:1", /16 bits/);
  bad("rt:1:2:3:4");
  bad("0x" + "f".repeat(25), /hex digits/);
  bad("１:１");
  bad("65000:100\u0000");
  bad("");
  bad("   ");
  for (const s of ["\ud800", "rt: :1", "::::::", "rt:" + "9".repeat(70) + ":1", "x".repeat(200_000)]) {
    const r = decodeCommunities(s);
    assert.ok(Array.isArray(r.results));
  }
});

console.log(`bgp-community-decoder: ${n} groups passed`);
