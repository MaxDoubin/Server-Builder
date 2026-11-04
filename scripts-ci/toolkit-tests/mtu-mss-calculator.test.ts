import assert from "node:assert/strict";
import {
  clampCommands,
  computeStack,
  espAt,
  parseMtu,
  validCiscoIface,
  validLinuxIface,
  type Layer,
} from "../../client/src/lib/toolkit/mtu-mss-calculator.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
}

const run = (linkMtu: number, layers: Layer[], tagsCountAgainstMtu = false) =>
  computeStack({ linkMtu, layers, tagsCountAgainstMtu });

/* ------------------------------------------------------------ MSS basics */
t("plain Ethernet: 1500 gives MSS 1460 / 1440", () => {
  const r = run(1500, []);
  assert.equal(r.innerMtu, 1500);
  assert.equal(r.mss4, 1460);
  assert.equal(r.mss6, 1440);
  assert.equal(r.frameSize, 1518);
  assert.equal(r.totalOverhead, 0);
});

t("jumbo 9000 gives MSS 8960", () => {
  assert.equal(run(9000, []).mss4, 8960);
});

/* ---------------------------------------------------- fixed encapsulations */
t("PPPoE (RFC 2516): 1492, MSS 1452", () => {
  const r = run(1500, [{ kind: "pppoe" }]);
  assert.equal(r.innerMtu, 1492);
  assert.equal(r.mss4, 1452);
  assert.equal(r.mss6, 1432);
});

t("GRE over IPv4: 24 bytes, Linux gre default 1476", () => {
  assert.equal(run(1500, [{ kind: "gre", outer: "ipv4" }]).innerMtu, 1476);
});

t("GRE with key: Linux default 1472", () => {
  assert.equal(run(1500, [{ kind: "gre", outer: "ipv4", greKey: true }]).innerMtu, 1472);
});

t("GRE with checksum, key, sequence: 36 bytes", () => {
  const r = run(1500, [{ kind: "gre", greChecksum: true, greKey: true, greSeq: true }]);
  assert.equal(r.totalOverhead, 36);
});

t("GRE over IPv6 with encap limit: Linux ip6gre default 1448", () => {
  assert.equal(run(1500, [{ kind: "gre", outer: "ipv6", encapLimit: true }]).innerMtu, 1448);
  assert.equal(run(1500, [{ kind: "gre", outer: "ipv6" }]).innerMtu, 1456);
});

t("outer IPv6 header: 40, with encap limit Linux ip6tnl default 1452", () => {
  assert.equal(run(1500, [{ kind: "ipv6" }]).innerMtu, 1460);
  assert.equal(run(1500, [{ kind: "ipv6", encapLimit: true }]).innerMtu, 1452);
});

t("encap limit ignored on an IPv4 outer", () => {
  assert.equal(run(1500, [{ kind: "gre", outer: "ipv4", encapLimit: true }]).innerMtu, 1476);
  assert.equal(run(1500, [{ kind: "ipv4", encapLimit: true }]).innerMtu, 1480);
});

t("IPIP / 6in4: 1480", () => {
  assert.equal(run(1500, [{ kind: "ipv4" }]).innerMtu, 1480);
});

t("VXLAN (RFC 7348): 50 over IPv4 gives 1450, 70 over IPv6 gives 1430", () => {
  assert.equal(run(1500, [{ kind: "vxlan", outer: "ipv4" }]).innerMtu, 1450);
  assert.equal(run(1500, [{ kind: "vxlan", outer: "ipv6" }]).innerMtu, 1430);
  assert.equal(run(9000, [{ kind: "vxlan" }]).innerMtu, 8950);
});

t("WireGuard: 60 over IPv4, 80 over IPv6 (wg-quick default 1420)", () => {
  assert.equal(run(1500, [{ kind: "wireguard", outer: "ipv4" }]).innerMtu, 1440);
  assert.equal(run(1500, [{ kind: "wireguard", outer: "ipv6" }]).innerMtu, 1420);
  assert.equal(run(1500, [{ kind: "wireguard", outer: "ipv6" }]).mss4, 1380);
});

t("MPLS (RFC 3032): 4 bytes per label", () => {
  assert.equal(run(1500, [{ kind: "mpls" }, { kind: "mpls" }]).innerMtu, 1492);
});

/* ------------------------------------------------------------ VLAN tags */
t("802.1Q on the link: frame 1522, IP MTU unchanged", () => {
  const r = run(1500, [{ kind: "dot1q" }]);
  assert.equal(r.innerMtu, 1500);
  assert.equal(r.frameSize, 1522);
  assert.equal(r.linkTags, 1);
  assert.equal(r.rows[0].overhead, 0);
  assert.equal(r.rows[0].frameBytes, 4);
});

t("QinQ on the link: frame 1526", () => {
  const r = run(1500, [{ kind: "dot1ad" }, { kind: "dot1q" }]);
  assert.equal(r.innerMtu, 1500);
  assert.equal(r.frameSize, 1526);
  assert.equal(r.warnings.length, 0);
});

t("tags counted against a 1518 byte frame cap", () => {
  const r = run(1500, [{ kind: "dot1ad" }, { kind: "dot1q" }], true);
  assert.equal(r.innerMtu, 1492);
  assert.equal(r.frameSize, 1518);
});

t("tag inside VXLAN costs 4 (tagged inner frame)", () => {
  const r = run(1500, [{ kind: "vxlan" }, { kind: "dot1q" }]);
  assert.equal(r.innerMtu, 1446);
  assert.equal(r.linkTags, 0);
  assert.equal(r.frameSize, 1518);
  assert.equal(r.warnings.length, 0);
});

t("tag after an L3 tunnel warns and still counts", () => {
  const r = run(1500, [{ kind: "gre" }, { kind: "dot1q" }]);
  assert.equal(r.innerMtu, 1472);
  assert.equal(r.warnings.length, 1);
});

t("PPPoE after VLAN tag on the link (fiber ONT): 1492, no warnings", () => {
  const r = run(1500, [{ kind: "dot1q" }, { kind: "pppoe" }]);
  assert.equal(r.innerMtu, 1492);
  assert.equal(r.warnings.length, 0);
});

t("PPPoE after WireGuard warns", () => {
  assert.equal(run(1500, [{ kind: "wireguard" }, { kind: "pppoe" }]).warnings.length, 1);
});

t("S-tag after C-tag warns about order", () => {
  assert.equal(run(1500, [{ kind: "dot1q" }, { kind: "dot1ad" }]).warnings.length, 1);
});

/* ----------------------------------------------------------- ESP AES-GCM */
t("ESP over IPv4 on 1500: inner 1446, overhead exactly 54", () => {
  const r = espAt(1500, "ipv4", false);
  assert.equal(r.inner, 1446);
  assert.equal(r.detail.pre, 36);
  assert.equal(r.detail.lost, 0);
  // check against the RFC 4303 layout by hand: 20 + 8 + 8 + 1446 + 0 + 2 + 16 = 1500
  assert.equal(20 + 8 + 8 + 1446 + 0 + 2 + 16, 1500);
});

t("ESP on 1499: padding pushes overhead to 57", () => {
  const r = espAt(1499, "ipv4", false);
  assert.equal(r.inner, 1442);
  assert.equal(1499 - r.inner, 57);
  assert.equal(r.detail.lost, 3);
});

t("ESP overhead is 54 to 57 across alignments", () => {
  const seen = new Set<number>();
  for (let b = 1400; b < 1500; b++) seen.add(b - espAt(b, "ipv4", false).inner);
  assert.deepEqual([...seen].sort(), [54, 55, 56, 57]);
});

t("ESP with NAT-T: 62 on 1500 (inner 1438)", () => {
  assert.equal(espAt(1500, "ipv4", true).inner, 1438);
});

t("ESP over IPv6: 74 on 1500 (inner 1426)", () => {
  assert.equal(espAt(1500, "ipv6", false).inner, 1426);
});

t("ESP padding table: four inner sizes share one ESP size, the fifth does not fit", () => {
  const rows = espAt(1500, "ipv4", false).detail.rows;
  assert.deepEqual(
    rows.map((r) => [r.inner, r.padding, r.espPacket, r.fits]),
    [
      [1443, 3, 1500, true],
      [1444, 2, 1500, true],
      [1445, 1, 1500, true],
      [1446, 0, 1500, true],
      [1447, 3, 1504, false],
    ],
  );
});

t("ESP brute force: computed inner is the largest length that fits", () => {
  for (const outer of ["ipv4", "ipv6"] as const) {
    for (const natt of [false, true]) {
      for (let budget = 80; budget <= 1600; budget++) {
        const pre = (outer === "ipv6" ? 40 : 20) + (natt ? 8 : 0) + 16;
        const size = (L: number) => pre + L + ((4 - ((L + 2) % 4)) % 4) + 2 + 16;
        let best = 0;
        for (let L = 1; L <= budget; L++) if (size(L) <= budget) best = L;
        assert.equal(Math.max(0, espAt(budget, outer, natt).inner), best, `budget ${budget} ${outer} ${natt}`);
      }
    }
  }
});

t("ESP inside PPPoE: 1492 - 54 = 1438", () => {
  assert.equal(run(1500, [{ kind: "pppoe" }, { kind: "esp" }]).innerMtu, 1438);
});

t("GRE inside ESP: alignment applies at the ESP budget", () => {
  const r = run(1500, [{ kind: "esp" }, { kind: "gre" }]);
  assert.equal(r.innerMtu, 1446 - 24);
});

/* -------------------------------------------------------- limits & errors */
t("IPv6 minimum: inner below 1280 gives no IPv6 MSS", () => {
  const r = run(1300, [{ kind: "wireguard", outer: "ipv6" }]);
  assert.equal(r.innerMtu, 1220);
  assert.equal(r.mss6, null);
  assert.equal(r.mss4, 1180);
  assert.ok(r.warnings[0].includes("1280"));
});

t("inner exactly 1280 is fine for IPv6", () => {
  const r = run(1320, [{ kind: "ipv6" }]);
  assert.equal(r.innerMtu, 1280);
  assert.equal(r.mss6, 1220);
});

t("stack that runs out of room stops and reports where", () => {
  const r = run(100, [{ kind: "wireguard", outer: "ipv6" }, { kind: "esp" }]);
  assert.equal(r.innerMtu, 0);
  assert.equal(r.mss4, null);
  assert.equal(r.mss6, null);
  assert.deepEqual(r.exhaustedAt?.index, 1);
  assert.equal(r.rows.length, 2);
});

t("inner below 68 gives no MSS at all", () => {
  const r = run(120, [{ kind: "vxlan" }, { kind: "pppoe" }]);
  assert.equal(r.innerMtu, 62);
  assert.equal(r.mss4, null);
});

t("layer cap", () => {
  const layers: Layer[] = Array.from({ length: 20 }, () => ({ kind: "mpls" }));
  const r = run(1500, layers);
  assert.equal(r.rows.length, 12);
  assert.equal(r.innerMtu, 1500 - 48);
});

t("parseMtu", () => {
  assert.deepEqual(parseMtu(" 1500 "), { ok: true, value: 1500 });
  assert.equal(parseMtu("").ok, false);
  assert.equal(parseMtu("15.5").ok, false);
  assert.equal(parseMtu("-1").ok, false);
  assert.equal(parseMtu("67").ok, false);
  assert.deepEqual(parseMtu("68"), { ok: true, value: 68 });
  assert.deepEqual(parseMtu("65535"), { ok: true, value: 65535 });
  assert.equal(parseMtu("65536").ok, false);
  assert.equal(parseMtu("9".repeat(400)).ok, false);
  assert.equal(parseMtu("0x5dc").ok, false);
});

t("interface name validation", () => {
  assert.ok(validLinuxIface("wg0"));
  assert.ok(validLinuxIface("eth0.100"));
  assert.ok(!validLinuxIface("a".repeat(16)));
  assert.ok(!validLinuxIface("wg0; rm -rf"));
  assert.ok(!validLinuxIface(".."));
  assert.ok(!validLinuxIface(""));
  assert.ok(validCiscoIface("GigabitEthernet0/0/0.100"));
  assert.ok(validCiscoIface("Tunnel0"));
  assert.ok(!validCiscoIface("0Tunnel"));
  assert.ok(!validCiscoIface("Tunnel0\n ip mtu 9"));
});

t("commands carry the computed values", () => {
  const c = clampCommands(1420, 1380, 1360, "wg0", "Tunnel0");
  assert.equal(c.linuxMtu, "ip link set dev wg0 mtu 1420");
  assert.ok(c.iptables.includes("iptables -t mangle -A FORWARD -o wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1380"));
  assert.ok(c.iptables.includes("ip6tables -t mangle -A FORWARD -i wg0 -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1360"));
  assert.ok(c.nftables.includes("tcp option maxseg size > 1360 tcp option maxseg size set 1360"));
  assert.equal(c.cisco, "interface Tunnel0\n ip mtu 1420\n ip tcp adjust-mss 1380\n ipv6 mtu 1420\n ipv6 tcp adjust-mss 1360");
});

t("commands without IPv6", () => {
  const c = clampCommands(1220, 1180, null, "wg0", "Tunnel0");
  assert.ok(!c.iptables.includes("ip6tables"));
  assert.ok(!c.nftables.includes("ipv6"));
  assert.ok(!c.cisco.includes("ipv6"));
});

/* ------------------------------------------- independent verifier cases */
t("verifier: DS-Lite / 4in6 (RFC 6333) on 1500: inner 1460, MSS 1420; with encap limit 1452", () => {
  const r = run(1500, [{ kind: "ipv6" }]);
  assert.equal(r.innerMtu, 1460);
  assert.equal(r.mss4, 1420);
  assert.equal(run(1500, [{ kind: "ipv6", encapLimit: true }]).mss4, 1412);
});

t("verifier: WireGuard over PPPoE with IPv6 outer is 1412", () => {
  const r = run(1500, [{ kind: "pppoe" }, { kind: "wireguard", outer: "ipv6" }]);
  assert.equal(r.innerMtu, 1412);
  assert.equal(r.mss4, 1372);
  assert.equal(r.mss6, 1352);
  assert.equal(r.rows[1].overhead, 80);
});

t("verifier: WireGuard over IPv4 is exactly 20 + 8 + 16 + 16", () => {
  const r = run(1500, [{ kind: "wireguard", outer: "ipv4" }]);
  assert.deepEqual(r.rows[0].parts.map((p) => p.bytes), [20, 8, 16, 16]);
  assert.equal(r.rows[0].overhead, 60);
});

t("verifier: VXLAN over IPv6 on 9000 is 8930", () => {
  assert.equal(run(9000, [{ kind: "vxlan", outer: "ipv6" }]).innerMtu, 8930);
});

t("verifier: ESP NAT-T inside PPPoE, hand computed 44 + 1430 + 0 + 2 + 16 = 1492", () => {
  const r = run(1500, [{ kind: "pppoe" }, { kind: "esp", outer: "ipv4", natt: true }]);
  assert.equal(r.innerMtu, 1430);
  assert.equal(r.mss4, 1390);
  assert.equal(44 + 1430 + 0 + 2 + 16, 1492);
});

t("verifier: ESP at the 16 bit ceiling, 65535: inner 65478, one more needs 3 of padding", () => {
  const r = espAt(65535, "ipv4", false);
  assert.equal(r.inner, 65478);
  assert.equal(36 + 65478 + 0 + 2 + 16, 65532);
  assert.equal(36 + 65479 + 3 + 2 + 16, 65536);
  assert.equal(r.detail.lost, 3);
});

t("verifier: ESP over IPv6 with NAT-T on 1500: pre 64, inner 1418", () => {
  const r = espAt(1500, "ipv6", true);
  assert.equal(r.detail.pre, 64);
  assert.equal(r.inner, 1418);
});

t("verifier: parts always sum to the overhead and budgets chain", () => {
  const kinds: Layer[] = [
    { kind: "dot1q" }, { kind: "dot1ad" }, { kind: "mpls" }, { kind: "pppoe" }, { kind: "ipv4" },
    { kind: "ipv6", encapLimit: true }, { kind: "gre", outer: "ipv6", greKey: true, greSeq: true, greChecksum: true },
    { kind: "vxlan", outer: "ipv6" }, { kind: "wireguard", outer: "ipv4" }, { kind: "esp", outer: "ipv6", natt: true },
  ];
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let trial = 0; trial < 3000; trial++) {
    const layers = Array.from({ length: 1 + rnd(6) }, () => kinds[rnd(kinds.length)]);
    const mtu = 68 + rnd(9000);
    const r = computeStack({ linkMtu: mtu, layers, tagsCountAgainstMtu: rnd(2) === 1 });
    let budget = mtu;
    for (const row of r.rows) {
      assert.equal(row.budget, budget);
      assert.equal(row.inner, row.budget - row.overhead);
      if (row.frameBytes === 0) assert.equal(row.parts.reduce((n, p) => n + p.bytes, 0), row.overhead);
      budget = row.inner;
    }
    if (!r.exhaustedAt) assert.equal(r.innerMtu, budget);
    assert.equal(r.totalOverhead, mtu - r.innerMtu);
    if (r.mss4 !== null) assert.equal(r.mss4, r.innerMtu - 40);
    if (r.mss6 !== null) assert.equal(r.mss6, r.innerMtu - 60);
  }
});

t("verifier: boundaries at the IPv4 and IPv6 minimums", () => {
  const a = run(68, []);
  assert.equal(a.mss4, 28);
  assert.equal(a.mss6, null);
  const b = run(1279, []);
  assert.equal(b.mss6, null);
  assert.equal(run(1280, []).mss6, 1220);
  const c = run(68, [{ kind: "wireguard", outer: "ipv6" }]);
  assert.equal(c.exhaustedAt?.index, 0);
  assert.equal(c.innerMtu, 0);
  assert.equal(c.totalOverhead, 68);
});

t("verifier: parseMtu edge cases", () => {
  assert.deepEqual(parseMtu("0001500"), { ok: true, value: 1500 });
  assert.deepEqual(parseMtu("\t9000\n"), { ok: true, value: 9000 });
  assert.deepEqual(parseMtu("000000000000068"), { ok: true, value: 68 });
  assert.equal(parseMtu("0").ok, false);
  assert.equal(parseMtu("00000").ok, false);
  for (const bad of ["\uff11\uff15\uff10\uff10", "+1500", "1_500", "1,500", "1e3", "1500 bytes", "\u{1F600}", "NaN", "Infinity"]) {
    assert.equal(parseMtu(bad).ok, false, bad);
  }
});

t("verifier: Cisco interface validation blocks injection", () => {
  assert.ok(!validCiscoIface("Tunnel0 ip mtu 9000"));
  assert.ok(!validCiscoIface(""));
  assert.ok(validCiscoIface("Serial0/0/0:0"));
  assert.ok(!validLinuxIface("wg0\n"));
  assert.ok(!validLinuxIface("eth0:1"));
  assert.ok(!validLinuxIface("we/0"));
});

t("verifier: IPv4-only commands at a small inner MTU", () => {
  const r = run(600, [{ kind: "esp" }]);
  assert.equal(r.innerMtu, 546);
  const c = clampCommands(r.innerMtu, r.mss4, r.mss6, "ipsec0", "Tunnel1");
  assert.ok(c.iptables.includes("--set-mss 506"));
  assert.ok(c.iptables.includes("below the IPv6 minimum"));
  assert.equal(c.cisco, "interface Tunnel1\n ip mtu 546\n ip tcp adjust-mss 506");
});

/* Emit the nft rules so the shell step can syntax-check them with nft -c. */
if (process.env.EMIT_NFT) {
  const c = clampCommands(1432, 1392, 1372, "wg0", "Tunnel0");
  const lines = c.nftables
    .split("\n")
    .map((l) => l.replace(/^nft '?/, "").replace(/'$/, ""));
  console.log(lines.join("\n"));
} else {
  console.log(`mtu-mss-calculator: ${passed} tests passed`);
}
