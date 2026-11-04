import assert from "node:assert/strict";
import {
  ospfCost,
  parseBandwidthKbps,
  parseReferenceMbps,
  parseProcessId,
  formatBandwidth,
  pathSummary,
  compareTotals,
  suggestReferenceMbps,
  findCollapses,
  cleanInterfaceName,
  iosConfig,
  frrConfig,
  LINK_PRESETS,
  MAX_INTERFACE_COST,
} from "../../client/src/lib/toolkit/ospf-cost-calculator.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
}

// Cisco's published default-reference cost table (reference 10^8 bps).
t("cisco default table", () => {
  const table: [bigint, number][] = [
    [56n, 1785],
    [64n, 1562],
    [1544n, 64], // T1: 64.77 truncated, not rounded
    [2048n, 48], // E1: 48.83
    [4000n, 25], // 4 Mbps Token Ring
    [10_000n, 10],
    [16_000n, 6], // 16 Mbps Token Ring: 6.25
    [100_000n, 1],
    [1_000_000n, 1],
    [10_000_000n, 1],
    [40_000_000n, 1],
    [100_000_000n, 1],
  ];
  for (const [kbps, cost] of table) assert.equal(ospfCost(100, kbps).cost, cost, `kbps ${kbps}`);
  assert.equal(ospfCost(100, 1544n).raw, 64n);
  assert.equal(ospfCost(100, 1544n).exact, false);
  assert.equal(ospfCost(100, 10_000n).exact, true);
  assert.equal(ospfCost(100, 1_000_000n).floored, true);
  assert.equal(ospfCost(100, 100_000n).floored, false);
});

t("reference 100 Gbps", () => {
  assert.equal(ospfCost(100000, 1_000_000n).cost, 100);
  assert.equal(ospfCost(100000, 10_000_000n).cost, 10);
  assert.equal(ospfCost(100000, 25_000_000n).cost, 4);
  assert.equal(ospfCost(100000, 40_000_000n).cost, 2); // 2.5 truncated
  assert.equal(ospfCost(100000, 100_000_000n).cost, 1);
  assert.equal(ospfCost(100000, 400_000_000n).cost, 1); // 0.25 floored to 1
  assert.equal(ospfCost(100000, 400_000_000n).raw, 0n);
  assert.equal(ospfCost(100000, 100_000n).cost, 1000);
});

t("16-bit cap", () => {
  const r = ospfCost(4294967, 1n);
  assert.equal(r.raw, 4_294_967_000n);
  assert.equal(r.cost, MAX_INTERFACE_COST);
  assert.equal(r.capped, true);
  assert.equal(ospfCost(65535, 1000n).cost, 65535);
  assert.equal(ospfCost(65535, 1000n).capped, false);
  assert.equal(ospfCost(65536, 1000n).capped, true);
});

t("bandwidth parsing", () => {
  assert.deepEqual(parseBandwidthKbps("1.544", "Mbps"), { ok: true, value: 1544n });
  assert.deepEqual(parseBandwidthKbps("2.5", "Gbps"), { ok: true, value: 2_500_000n });
  assert.deepEqual(parseBandwidthKbps("100,000", "kbps"), { ok: true, value: 100_000n });
  assert.deepEqual(parseBandwidthKbps(" 56 ", "kbps"), { ok: true, value: 56n });
  assert.deepEqual(parseBandwidthKbps(".5", "Mbps"), { ok: true, value: 500n });
  assert.deepEqual(parseBandwidthKbps("10.", "Gbps"), { ok: true, value: 10_000_000n });
  assert.deepEqual(parseBandwidthKbps("10000", "Gbps"), { ok: true, value: 10_000_000_000n });
  for (const bad of ["", "abc", "1.2.3", "-5", "1e3", ".", "0", "0.0", "0.5", "1.0001"]) {
    const r = parseBandwidthKbps(bad, bad === "0.5" || bad === "1.0001" ? "kbps" : "Mbps");
    assert.equal(r.ok, false, `should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(parseBandwidthKbps("10001", "Gbps").ok, false);
  assert.equal(parseBandwidthKbps("9".repeat(400), "Gbps").ok, false);
});

t("reference parsing", () => {
  assert.deepEqual(parseReferenceMbps("100"), { ok: true, value: 100 });
  assert.deepEqual(parseReferenceMbps("100,000"), { ok: true, value: 100000 });
  assert.deepEqual(parseReferenceMbps("4294967"), { ok: true, value: 4294967 });
  for (const bad of ["", "0", "4294968", "1.5", "-1", "abc", "99999999999999999999"]) {
    assert.equal(parseReferenceMbps(bad).ok, false, bad);
  }
  assert.deepEqual(parseProcessId("1"), { ok: true, value: 1 });
  assert.equal(parseProcessId("0").ok, false);
  assert.equal(parseProcessId("65536").ok, false);
  assert.equal(parseProcessId("x").ok, false);
});

t("format bandwidth", () => {
  assert.equal(formatBandwidth(56n), "56 kbps");
  assert.equal(formatBandwidth(1544n), "1.544 Mbps");
  assert.equal(formatBandwidth(2048n), "2.048 Mbps");
  assert.equal(formatBandwidth(2_500_000n), "2.5 Gbps");
  assert.equal(formatBandwidth(100_000_000n), "100 Gbps");
  assert.equal(formatBandwidth(1_000_001n), "1.000001 Gbps");
  assert.equal(formatBandwidth(10_000_000_000n), "10 Tbps");
  for (const p of LINK_PRESETS) assert.ok(formatBandwidth(p.kbps).length > 0);
});

t("paths and comparison", () => {
  const a = pathSummary(100, [1_000_000n, 1_000_000n, 1_000_000n]);
  const b = pathSummary(100, [100_000_000n, 100_000_000n, 100_000_000n, 100_000_000n]);
  assert.equal(a.total, 3);
  assert.equal(b.total, 4);
  assert.equal(compareTotals(a.total, b.total), "A");
  const a2 = pathSummary(100000, [1_000_000n, 1_000_000n, 1_000_000n]);
  const b2 = pathSummary(100000, [100_000_000n, 100_000_000n, 100_000_000n, 100_000_000n]);
  assert.equal(a2.total, 300);
  assert.equal(b2.total, 4);
  assert.equal(compareTotals(a2.total, b2.total), "B");
  assert.equal(compareTotals(5, 5), "tie");
  assert.equal(compareTotals(null, 5), "none");
  assert.equal(a.bottleneckKbps, 1_000_000n);
  assert.equal(pathSummary(100, []).total, 0);
  assert.equal(pathSummary(100, []).bottleneckKbps, null);
});

t("suggested reference", () => {
  assert.equal(suggestReferenceMbps(100_000n), 100);
  assert.equal(suggestReferenceMbps(56n), 100);
  assert.equal(suggestReferenceMbps(1_000_000n), 1000);
  assert.equal(suggestReferenceMbps(40_000_000n), 100000);
  assert.equal(suggestReferenceMbps(100_000_000n), 100000);
  assert.equal(suggestReferenceMbps(400_000_000n), 1000000);
  assert.equal(suggestReferenceMbps(10_000_000_000n), 1000000); // 10^7 would exceed 4294967
  // The suggested reference gives the fastest link cost 1.
  // The suggested reference never floors a link, and the fastest costs 1 to 10.
  for (const p of LINK_PRESETS.filter((x) => x.kbps >= 100_000n)) {
    const r = ospfCost(suggestReferenceMbps(p.kbps), p.kbps);
    assert.equal(r.floored, false, p.label);
    assert.ok(r.cost >= 1 && r.cost <= 10, p.label);
  }
  assert.equal(ospfCost(suggestReferenceMbps(2_500_000n), 2_500_000n).cost, 4);
  assert.equal(ospfCost(suggestReferenceMbps(100_000_000n), 100_000_000n).cost, 1);
});

t("collapses", () => {
  const speeds = [100_000n, 1_000_000n, 10_000_000n, 40_000_000n, 100_000_000n];
  const at100 = findCollapses(100, speeds);
  assert.equal(at100.length, 1);
  assert.equal(at100[0].cost, 1);
  assert.equal(at100[0].speeds.length, 5);
  assert.equal(findCollapses(100000, speeds).length, 0);
  assert.equal(findCollapses(100, [1_000_000n, 1_000_000n]).length, 0); // same speed twice is not a collapse
});

t("names and config", () => {
  assert.equal(cleanInterfaceName("  Gi0/0 \n", "x"), "Gi0/0");
  assert.equal(cleanInterfaceName("Gig\u00070/1", "x"), "Gig0/1");
  assert.equal(cleanInterfaceName("   ", "A-hop1"), "A-hop1");
  assert.equal(cleanInterfaceName("x".repeat(100), "f").length, 40);
  const hops = [{ path: "A" as const, index: 1, name: "Te0/0/0", kbps: 10_000_000n, cost: 10 }];
  const ios = iosConfig({ referenceMbps: 100000, processId: 7, pin: true, hops });
  assert.ok(ios.includes("router ospf 7\n auto-cost reference-bandwidth 100000\n!"));
  assert.ok(ios.includes("interface Te0/0/0\n ip ospf cost 10\n!"));
  const frr = frrConfig({ referenceMbps: 100000, processId: 7, pin: true, hops });
  assert.ok(frr.includes("router ospf\n auto-cost reference-bandwidth 100000\nexit"));
  assert.ok(frr.includes("interface Te0/0/0\n ip ospf cost 10\nexit"));
  const unpinned = iosConfig({ referenceMbps: 100, processId: 1, pin: false, hops });
  assert.ok(!unpinned.includes("ip ospf cost"));
  assert.ok(unpinned.includes("default"));
  for (const s of [ios, frr, unpinned]) assert.ok(!s.includes("—"));
});

console.log(`ospf-cost-calculator: ${n} test groups passed`);

assert.deepEqual(parseReferenceMbps("0000000000000100"), { ok: true, value: 100 });
assert.equal(parseReferenceMbps("000").ok, false);
console.log("edge checks passed");

{
  const r = parseBandwidthKbps("-5", "Mbps");
  assert.ok(!r.ok && r.error.includes("negative"));
  console.log("negative check passed");
}

/* ---------------- independent verifier additions ---------------- */
import {
  frrCost,
  FRR_BUILTIN_REFERENCE_MBPS,
  DEFAULT_REFERENCE_MBPS,
} from "../../client/src/lib/toolkit/ospf-cost-calculator.ts";
{
  let v = 0;
  const check = (name: string, fn: () => void) => {
    try {
      fn();
      v++;
    } catch (e) {
      console.error(`verifier case failed: ${name}`);
      throw e;
    }
  };

  // RFC 4750 ospfIfMetricValue table at 10^8: >= 100 Mbps 1, Ethernet 10, E1 48,
  // 64k 1562, 56k 1785. Its T1 (ESF) entry is 65, the rounded value; IOS truncates to 64.
  check("rfc4750 table, IOS truncation", () => {
    assert.equal(ospfCost(DEFAULT_REFERENCE_MBPS, 10_000n).cost, 10);
    assert.equal(ospfCost(100, 2048n).cost, 48);
    assert.equal(ospfCost(100, 64n).cost, 1562);
    assert.equal(ospfCost(100, 56n).cost, 1785);
    assert.equal(ospfCost(100, 1544n).cost, 64);
    assert.equal(ospfCost(100, 1544n).exact, false);
  });

  // FRR ospfd: (uint32_t)(refbw / bw + 0.5), clamped to 1..65535.
  check("frr rounding", () => {
    assert.equal(frrCost(100, 1544n), 65); // matches the RFC 4750 T1 entry
    assert.equal(frrCost(100, 2048n), 49); // 48.83 rounds up
    assert.equal(frrCost(100000, 40_000_000n), 3); // 2.5 rounds half up
    assert.equal(ospfCost(100000, 40_000_000n).cost, 2); // IOS: 2.5 truncates
    assert.equal(frrCost(100000, 25_000_000n), 4);
    assert.equal(frrCost(FRR_BUILTIN_REFERENCE_MBPS, 1_000_000n), 100); // 1 Gbps at FRR's built-in reference
    assert.equal(frrCost(100, 100_000_000n), 1); // 0.001 + 0.5 truncates to 0, floored to 1
    assert.equal(frrCost(1, 2_000n), 1); // exactly 0.5 + 0.5 = 1
    assert.equal(frrCost(1, 3_000n), 1); // 0.33 + 0.5 = 0.83, floored to 1
    assert.equal(frrCost(4294967, 56n), 65535); // capped
    assert.equal(frrCost(100, 3_000n), 33); // 33.33
    assert.equal(frrCost(100, 6_000n), 17); // 16.67 rounds up
    assert.equal(ospfCost(100, 6_000n).cost, 16);
  });

  check("boundaries of the reference and the cap", () => {
    assert.deepEqual(parseReferenceMbps("4294967"), { ok: true, value: 4294967 });
    assert.equal(parseReferenceMbps("4294968").ok, false);
    assert.equal(parseReferenceMbps("1").ok, true);
    assert.equal(parseReferenceMbps("0").ok, false);
    // 65535 exactly is not capped; 65536 is.
    const exact = ospfCost(65535, 1_000n);
    assert.equal(exact.cost, 65535);
    assert.equal(exact.capped, false);
    const over = ospfCost(65536, 1_000n);
    assert.equal(over.cost, 65535);
    assert.equal(over.capped, true);
    // A link exactly at the reference costs exactly 1 without flooring.
    const at = ospfCost(1000, 1_000_000n);
    assert.equal(at.cost, 1);
    assert.equal(at.floored, false);
    assert.equal(at.exact, true);
  });

  check("malformed and adversarial input never throws", () => {
    const bad = ["", "   ", "abc", "1e3", "Infinity", "NaN", "1..5", "１０", "−5", "+5", "0x10", "1/2", "🙂", "9".repeat(5000)];
    for (const s of bad) {
      const r = parseBandwidthKbps(s, "Mbps");
      assert.equal(r.ok, false, `bandwidth ${JSON.stringify(s.slice(0, 10))}`);
      const q = parseReferenceMbps(s);
      assert.equal(q.ok, false, `reference ${JSON.stringify(s.slice(0, 10))}`);
      assert.equal(parseProcessId(s).ok, false);
    }
    assert.deepEqual(parseBandwidthKbps("10 000", "kbps"), { ok: true, value: 10_000n });
    assert.deepEqual(parseBandwidthKbps("0.0005", "Gbps"), { ok: true, value: 500n });
    assert.equal(parseBandwidthKbps("0.0000005", "Gbps").ok, false); // half a kbps
    assert.equal(parseBandwidthKbps("10.000000001", "Tbps" as never).ok, false);
    assert.equal(parseBandwidthKbps("10001", "Gbps").ok, false); // above 10 Tbps
    assert.deepEqual(parseBandwidthKbps("10000", "Gbps"), { ok: true, value: 10_000_000_000n });
    assert.equal(parseProcessId("65536").ok, false);
    assert.equal(parseProcessId("0").ok, false);
    // A nonsense reference reaching ospfCost directly must not throw.
    assert.doesNotThrow(() => ospfCost(Number.NaN, 1000n));
    assert.doesNotThrow(() => frrCost(Number.POSITIVE_INFINITY, 0n));
    assert.equal(ospfCost(100, 0n).cost, 65535); // zero bandwidth is clamped, not a division by zero
  });

  check("suggestion caps at 1,000,000 Mbps", () => {
    assert.equal(suggestReferenceMbps(56n), 100);
    assert.equal(suggestReferenceMbps(100_000n), 100);
    assert.equal(suggestReferenceMbps(100_001n), 1000);
    assert.equal(suggestReferenceMbps(1_000_001n), 10000);
    assert.equal(suggestReferenceMbps(400_000_000n), 1_000_000);
    assert.equal(suggestReferenceMbps(10_000_000_000n), 1_000_000); // 10 Tbps link is still faster
  });

  check("frr config flags rounding and the built-in default", () => {
    const hops = [
      { path: "A" as const, index: 1, name: "eth0", kbps: 40_000_000n, cost: 2 },
      { path: "A" as const, index: 2, name: "eth1", kbps: 1544n, cost: 64 },
      { path: "B" as const, index: 1, name: "eth2", kbps: 10_000_000n, cost: 10 },
    ];
    const frr = frrConfig({ referenceMbps: 100000, processId: 1, pin: false, hops });
    assert.ok(frr.includes("gives this interface 3, not 2"));
    assert.ok(frr.includes("whole Mbps"));
    assert.ok(frr.includes("100000 Mbps, not the documented 100"));
    assert.equal(frr.split("\n").filter((l) => l.includes("FRR rounds")).length, 1); // 10G is exact
    const pinned = frrConfig({ referenceMbps: 100000, processId: 1, pin: true, hops });
    assert.ok(pinned.includes("interface eth0\n ip ospf cost 2\nexit"));
    assert.ok(pinned.includes("The pinned 2 matches IOS"));
    const frr100 = frrConfig({ referenceMbps: 100, processId: 1, pin: false, hops: [] });
    assert.ok(!frr100.includes("restores"));
    const ios100 = iosConfig({ referenceMbps: 100, processId: 1, pin: false, hops: [] });
    assert.ok(ios100.includes("IOS default"));
    for (const s of [frr, pinned, frr100, ios100]) assert.ok(!s.includes("—"));
  });

  check("textbook path comparison", () => {
    // Two T1 hops (64 + 64 = 128) lose to one 10 Mbps hop plus one FastEthernet hop (10 + 1 = 11).
    const a = pathSummary(100, [1544n, 1544n]);
    const b = pathSummary(100, [10_000n, 100_000n]);
    assert.equal(a.total, 128);
    assert.equal(b.total, 11);
    assert.equal(compareTotals(a.total, b.total), "B");
    // At 100 Gbps reference, 3 x 1G (300) loses to 4 x 100G (4).
    assert.equal(pathSummary(100000, [1_000_000n, 1_000_000n, 1_000_000n]).total, 300);
    assert.equal(pathSummary(100000, [100_000_000n, 100_000_000n, 100_000_000n, 100_000_000n]).total, 4);
  });

  console.log(`ospf verifier additions: ${v} groups passed`);
}
