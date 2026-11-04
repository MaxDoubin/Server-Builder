import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildVector,
  defaultMetrics,
  parseVector,
  roundup,
  score,
  severity,
  optionWeight,
  type Metrics,
} from "../../client/src/lib/toolkit/cvss-calculator";

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

function parse(v: string): Metrics {
  const r = parseVector(v);
  if (!r.ok) throw new Error(`parse failed for ${v}: ${r.error}`);
  return r.metrics;
}

/* Roundup, appendix A */
test("roundup basics", () => {
  assert.equal(roundup(4.02), 4.1);
  assert.equal(roundup(4.0), 4.0);
  assert.equal(roundup(4.000000000000001), 4.0); // the case v3.0's definition got wrong
  assert.equal(roundup(4.00001), 4.1);
  assert.equal(roundup(4.000004), 4.0);
  assert.equal(roundup(0), 0);
  assert.equal(roundup(9.999), 10);
  assert.equal(roundup(10), 10);
  assert.equal(roundup(0.01), 0.1);
  assert.equal(roundup(7.794332), 7.8);
});

/* Base scores: published examples (spec examples document and NVD) */
const BASE: [string, number][] = [
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0],
  ["CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.8],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", 7.5],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H", 7.5],
  ["CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H", 8.1],
  ["CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 8.8],
  ["CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H", 7.2],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H", 8.8],
  ["CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H", 7.8],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", 5.3],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:N/A:N", 5.8],
  ["CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N", 3.1], // POODLE, spec examples
  ["CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H", 8.8],
  ["CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H", 9.9],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", 0.0],
  ["CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N", 1.6],
  ["CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 6.5],
  ["CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N", 5.4],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N", 6.5],
  ["CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 8.8],
  ["CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.0],
  ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L", 5.3],
  ["CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H", 5.5],
  ["CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 5.5],
];
test("base scores", () => {
  for (const [v, expected] of BASE) {
    const r = score(parse(v));
    assert.equal(r.base, expected, `${v} expected ${expected} got ${r.base}`);
    // With nothing temporal defined the temporal score equals the base score.
    assert.equal(r.temporal, expected, `${v} temporal`);
  }
});

test("subscores for 9.8", () => {
  const r = score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"));
  assert.equal(r.impact.toFixed(1), "5.9");
  assert.equal(r.exploitability.toFixed(1), "3.9");
  assert.ok(Math.abs(r.iss - 0.914816) < 1e-12);
});

/* Temporal, 7.2 */
test("temporal", () => {
  // 9.8 x 0.91 x 0.95 x 0.92 = 7.794332 -> 7.8
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:U")).temporal, 7.8);
  // 9.8 x 0.94 x 0.95 = 8.7514 -> 8.8
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C")).temporal, 8.8);
  // 9.8 x 0.97 x 0.97 x 0.96 = 8.851... -> 8.9
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:F/RL:W/RC:R")).temporal, 8.9);
  // 6.1 x 0.91 x 0.95 x 0.92 = 4.8516... -> 4.9
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N/E:U/RL:O/RC:U")).temporal, 4.9);
  // Zero base stays zero.
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N/E:U")).temporal, 0);
});

/* Environmental, 7.3 (hand computed) */
test("environmental", () => {
  // MISS = 1 - 0.72^3 = 0.626752; MI = 4.02375; ME = 3.88704; sum 7.9108 -> 8.0
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L")).environmental, 8.0);
  // MISS capped at 0.915; MI = 5.8743; sum 9.7613 -> 9.8
  const capped = score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:H/IR:H/AR:H"));
  assert.equal(capped.miss, 0.915);
  assert.equal(capped.environmental, 9.8);
  // MS:C makes MPR:L weigh 0.68: (6.12803 + 2.01212) x 1.08 = 8.7914 -> 8.8
  assert.equal(score(parse("CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H/MS:C")).environmental, 8.8);
  // Modified impact all none gives zero.
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MC:N/MI:N/MA:N")).environmental, 0);
  // Modified metrics fully restating the base score the same.
  assert.equal(
    score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MAV:N/MAC:L/MPR:N/MUI:N/MS:U/MC:H/MI:H/MA:H")).environmental,
    9.8,
  );
  // MAV:P on the 9.8: ME = 8.22*0.2*0.77*0.85*0.85 = 0.91460; MI 5.87312; sum 6.78772 -> 6.8
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MAV:P")).environmental, 6.8);
  // Temporal factors apply to the environmental score: Roundup(9.8 x 0.91 x 0.95 x 0.92) = 7.8
  assert.equal(score(parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:U/CR:M")).environmental, 7.8);
  // The v3.1 changed-scope environmental formula differs from the base one:
  // with nothing set, AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H is 9.9 base and 10.0 environmental.
  const quirk = score(parse("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H"));
  assert.equal(quirk.base, 9.9);
  assert.equal(quirk.environmental, 10.0);
  assert.equal(quirk.environmentalDefined, false);
});

test("severity bands", () => {
  assert.equal(severity(0), "None");
  assert.equal(severity(0.1), "Low");
  assert.equal(severity(3.9), "Low");
  assert.equal(severity(4.0), "Medium");
  assert.equal(severity(6.9), "Medium");
  assert.equal(severity(7.0), "High");
  assert.equal(severity(8.9), "High");
  assert.equal(severity(9.0), "Critical");
  assert.equal(severity(10), "Critical");
  assert.equal(severity(NaN), "None");
});

test("PR weight depends on scope", () => {
  assert.equal(optionWeight("PR", "L", "U"), 0.62);
  assert.equal(optionWeight("PR", "L", "C"), 0.68);
  assert.equal(optionWeight("PR", "H", "C"), 0.5);
  assert.equal(optionWeight("MPR", "H", "U"), 0.27);
  assert.equal(optionWeight("MPR", "X", "U"), null);
  assert.equal(optionWeight("S", "C", "C"), null);
  assert.equal(optionWeight("CR", "H", "U"), 1.5);
});

/* Parsing and building, section 6 */
test("round trip in canonical order", () => {
  const v = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C/CR:H/IR:H/AR:L/MAV:A/MS:C/MA:N";
  assert.equal(buildVector(parse(v)), v);
});

test("any order is accepted, output is canonical", () => {
  const m = parse("CVSS:3.1/A:H/I:H/C:H/S:U/UI:N/PR:N/AC:L/AV:N/RC:C");
  assert.equal(buildVector(m), "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/RC:C");
});

test("explicit X values are dropped from the built vector", () => {
  const m = parse("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:X/MAV:X");
  assert.equal(buildVector(m), "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
});

test("lenient: lowercase and missing prefix with notes", () => {
  const r = parseVector("av:n/ac:l/pr:n/ui:n/s:u/c:h/i:h/a:h");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.notes.length, 2);
    assert.equal(score(r.metrics).base, 9.8);
  }
  const r2 = parseVector("  CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H  ");
  assert.ok(r2.ok && r2.notes.length === 0);
});

test("errors", () => {
  const bad: [string, RegExp][] = [
    ["", /Enter a vector/],
    ["CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /v3\.0/],
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N", /v4\.0/],
    ["AV:N/AC:L/Au:N/C:P/I:P/A:P", /v2/],
    ["CVSS:9.9/AV:N", /Unknown version/],
    ["CVSS:3.1", /no metrics/],
    ["CVSS:3.1/", /no metrics/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/", /empty/],
    ["CVSS:3.1/AV:N//AC:L", /empty/],
    ["CVSS:3.1/AV:Q/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /accepts N, A, L or P, not "Q"/],
    ["CVSS:3.1/AV:N/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /more than once/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H", /Missing base metric A\./],
    ["CVSS:3.1/AV:N/AC:L", /Missing base metrics PR, UI, S, C, I and A/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/ZZ:X", /not a CVSS v3.1 metric/],
    ["CVSS:3.1/AV:NN/AC:L", /not a metric/],
    ["CVSS:3.1/AV:N /AC:L", /no spaces/],
    ["CVSS:3.1/" + "AV:N/".repeat(200), /not read/],
    ["CVSS:3.1/E:X/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MS:Q", /MS .* accepts X, U or C/],
    ["CVSS:3.1/__proto__:N", /not a metric/],
    ["CVSS:3.1/CONSTRUCTOR:N", /not a CVSS v3.1 metric/],
  ];
  for (const [input, re] of bad) {
    const r = parseVector(input);
    assert.equal(r.ok, false, `expected failure for ${JSON.stringify(input)}`);
    if (!r.ok) assert.match(r.error, re, `${JSON.stringify(input)} -> ${r.error}`);
  }
});

test("default metrics score zero and build a full base vector", () => {
  const m = defaultMetrics();
  assert.equal(buildVector(m), "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N");
  assert.equal(score(m).base, 0);
});

/* Exhaustive sweep: every base vector scores within range and severity matches. */
test("exhaustive base sweep is well formed", () => {
  const opts: Record<string, string[]> = {
    AV: ["N", "A", "L", "P"],
    AC: ["L", "H"],
    PR: ["N", "L", "H"],
    UI: ["N", "R"],
    S: ["U", "C"],
    C: ["H", "L", "N"],
    I: ["H", "L", "N"],
    A: ["H", "L", "N"],
  };
  let count = 0;
  const keys = Object.keys(opts);
  const walk = (i: number, m: Metrics) => {
    if (i === keys.length) {
      const r = score(m);
      assert.ok(r.base >= 0 && r.base <= 10 && Number.isFinite(r.base));
      assert.equal(Math.round(r.base * 10) / 10, r.base);
      assert.equal(r.temporal, r.base);
      assert.ok(Math.abs(r.environmental - r.base) <= 0.1 + 1e-9, buildVector(m));
      if (m.C === "N" && m.I === "N" && m.A === "N") assert.equal(r.base, 0);
      else assert.ok(r.base > 0);
      const back = parseVector(buildVector(m));
      assert.ok(back.ok && buildVector(back.metrics) === buildVector(m));
      count++;
      return;
    }
    for (const v of opts[keys[i]]) walk(i + 1, { ...m, [keys[i]]: v });
  };
  walk(0, defaultMetrics());
  assert.equal(count, 4 * 2 * 3 * 2 * 2 * 27);
});

/* ------------------------------------------------------------------
 * Independent verifier additions.
 * ------------------------------------------------------------------ */

/*
 * 32,592 vectors (all 2,592 base vectors, then 30,000 random vectors with
 * random temporal and environmental metrics) scored by a separate oracle
 * written from the v3.1 specification in Python with 60-digit Decimal
 * arithmetic and an exact ceiling. Generator:
 * scratchpad/scripts/cvss_oracle.py.
 */
test("verifier: agrees with an exact-decimal oracle on 32,592 vectors", () => {
  const rows = JSON.parse(
    readFileSync(new URL("./cvss-oracle-fixture.json", import.meta.url), "utf8"),
  ) as [string, number, number, number][];
  assert.equal(rows.length, 32592);
  let quirk = 0;
  for (let i = 0; i < rows.length; i++) {
    const [v, b, t, e] = rows[i];
    const r = score(parse(v));
    assert.equal(r.base, b, `${v} base`);
    assert.equal(r.temporal, t, `${v} temporal`);
    assert.equal(r.environmental, e, `${v} environmental`);
    // Temporal metrics can only lower the score or leave it (notes, paragraph 3).
    assert.ok(r.temporal <= r.base, `${v} temporal above base`);
    if (i < 2592 && r.environmental !== r.base) {
      quirk++;
      // Notes, paragraph 4: only scope-changed vectors, and only by a tenth.
      assert.equal(parse(v).S, "C", v);
      assert.equal(Math.round(Math.abs(r.environmental - r.base) * 10), 1, v);
    }
  }
  assert.equal(quirk, 80);
});

/* CVSS v3.1 Examples document (FIRST), base scores. */
const FIRST_EXAMPLES: [string, string, number][] = [
  ["CVE-2013-1937 phpMyAdmin reflected XSS", "AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
  ["CVE-2013-0375 MySQL stored SQL injection", "AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N", 6.4],
  ["CVE-2014-3566 POODLE", "AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N", 3.1],
  ["CVE-2012-1516 VMware guest to host escape", "AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H", 9.9],
  ["CVE-2009-0783 Apache Tomcat XML parser", "AV:L/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L", 4.2],
  ["CVE-2012-0384 Cisco IOS command injection", "AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 8.8],
  ["CVE-2015-1098 Apple iWork", "AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H", 7.8],
  ["CVE-2014-0160 Heartbleed", "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", 7.5],
  ["CVE-2014-6271 Shellshock", "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
  ["CVE-2014-0224 OpenSSL CCS injection", "AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N", 7.4],
  ["CVE-2012-5376 Chrome sandbox bypass", "AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H", 9.6],
  ["CVE-2010-0467 Joomla directory traversal", "AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:N/A:N", 5.8],
  ["CVE-2012-1342 Cisco ASA ACL bypass", "AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:L/A:N", 5.8],
  ["CVE-2013-6014 Juniper proxy ARP", "AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:H", 9.3],
  ["CVE-2014-2005 Sophos login bypass", "AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 6.8],
  ["CVE-2011-1265 Bluetooth stack", "AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 8.8],
  ["CVE-2014-2019 iOS iCloud control bypass", "AV:P/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N", 4.6],
  ["CVE-2016-0128 Badlock", "AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N", 6.8],
  ["CVE-2016-5729 Lenovo BIOS", "AV:L/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H", 8.2],
  ["CVE-2018-3652 Intel DCI", "AV:P/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 7.6],
];
test("verifier: FIRST v3.1 examples document", () => {
  for (const [name, v, expected] of FIRST_EXAMPLES) {
    assert.equal(score(parse(`CVSS:3.1/${v}`)).base, expected, name);
  }
});

/* Temporal and environmental, worked by hand from section 7.2 and 7.3. */
test("verifier: temporal and environmental worked values", () => {
  const T: [string, number, number, number][] = [
    // 9.8 x 0.94 x 0.95 x 1 = 8.7514 -> 8.8
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O/RC:C", 9.8, 8.8, 8.8],
    // 9.8 x 0.91 x 0.95 = 8.4721 -> 8.5
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:C", 9.8, 8.5, 8.5],
    // 9.8 x 0.97 x 0.95 = 9.0307 -> 9.1
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:F/RL:O/RC:C", 9.8, 9.1, 9.1],
    // 9.8 x 0.91 x 0.95 x 0.92 = 7.7943 -> 7.8
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:U/RL:O/RC:U", 9.8, 7.8, 7.8],
    // MISS = 1 - 0.72^3 = 0.626752; 6.42 x MISS + 3.8870 = 7.9107 -> 8.0
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:L/IR:L/AR:L", 9.8, 9.8, 8.0],
    // 1.5 x 0.56 = 0.84 per term, 1 - 0.16^3 = 0.995904, capped at 0.915
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/CR:H/IR:H/AR:H", 9.8, 9.8, 9.8],
    // MS:C switches MPR's weight to 0.68 and the changed-scope formula
    ["AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H/MS:C", 8.8, 8.8, 10.0],
    // MS:U switches PR:H from 0.5 to 0.27
    ["AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H/MS:U", 9.1, 9.1, 7.2],
    // No modified impact at all
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MC:N/MI:N/MA:N", 9.8, 9.8, 0.0],
    ["AV:L/AC:H/PR:H/UI:R/S:C/C:L/I:N/A:N/E:U/RL:O/RC:U/CR:L/MAV:P/MAC:H", 2.3, 1.9, 0.8],
  ];
  for (const [v, b, t, e] of T) {
    const r = score(parse(`CVSS:3.1/${v}`));
    assert.deepEqual([r.base, r.temporal, r.environmental], [b, t, e], v);
  }
  // The changed-scope environmental quirk with nothing environmental set.
  const q = score(parse("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H"));
  assert.equal(q.base, 9.9);
  assert.equal(q.environmental, 10.0);
  assert.equal(q.environmentalDefined, false);
});

/* Roundup boundaries from appendix A: within 0.000005 of a tenth snaps to it. */
test("verifier: Roundup boundary values", () => {
  assert.equal(roundup(4.000005), 4.1); // 400000.5 rounds to 400001
  assert.equal(roundup(4.0000049), 4.0);
  assert.equal(roundup(3.9999999), 4.0);
  assert.equal(roundup(0.000001), 0.0);
  assert.equal(roundup(0.1), 0.1);
  assert.equal(roundup(0.30000000000000004), 0.3);
  assert.equal(roundup(8.9), 8.9);
  assert.equal(roundup(8.90001), 9.0);
  assert.equal(severity(roundup(8.90001)), "Critical");
  assert.equal(severity(8.9), "High");
  assert.equal(severity(0.1), "Low");
  assert.equal(severity(0), "None");
  assert.equal(severity(Number.NaN), "None");
});

/* Malformed and adversarial input: always an error object, never a throw. */
test("verifier: malformed and adversarial vectors", () => {
  const good = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
  const bad: [string, RegExp][] = [
    [`${good}/`, /empty/],
    [good.replace("UI", "Uı"), /U\+0131/], // dotless i would upper-case to I
    [good.replace("S:U", "ſ:U"), /U\+017F/], // long s would upper-case to S
    [good.replace("AV:N", "ＡV:N"), /U\+FF21/], // fullwidth A
    [`${good}\u0000`, /U\+0000/],
    [good.replace("AV:N", "AV:\u{1F600}"), /U\+1F600/],
    [good.replace("AV:N", "AV:1"), /not a metric/],
    [good.replace("AV:N", "AV:NN"), /not a metric/],
    [good.replace("AV:N", "AV:"), /not a metric/],
    [`${good}/E:Z`, /E \(exploit code maturity\) accepts X, H, F, P or U/],
    [`${good}/MS:A`, /MS .* accepts X, U or C/],
    [`${good}/AV:N`, /more than once/],
    [`${good}/av:n`, /more than once/],
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H", /Missing base metric A\./],
    ["CVSS:3.1/E:H", /Missing base metrics AV, AC, PR, UI, S, C, I and A/],
    ["CVSS:3.1", /no metrics/],
    ["CVSS:3.1/", /no metrics/],
    ["CVSS:3.10/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /Unknown version/],
    ["CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", /v3\.0/],
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N", /v4\.0/],
    ["AV:N/AC:L/Au:N/C:P/I:P/A:P", /v2/],
    ["(AV:N/AC:L/Au:N/C:P/I:P/A:P)", /v2/],
    [`${good}/${"E:H/".repeat(80)}`, /not read/],
    ["/".repeat(5), /empty/],
    ["::::", /not a metric/],
    ["__proto__:X", /not a metric/],
    ["CONSTRUCTOR:X", /not a CVSS v3\.1 metric name/],
    ["AV N", /no spaces/],
  ];
  for (const [input, re] of bad) {
    let r: ReturnType<typeof parseVector>;
    assert.doesNotThrow(() => {
      r = parseVector(input);
    }, input);
    r = parseVector(input);
    assert.equal(r.ok, false, `accepted ${JSON.stringify(input)}`);
    if (!r.ok) assert.match(r.error, re, `${JSON.stringify(input)} gave: ${r.error}`);
  }
  // A million characters is refused by length before any other work.
  const huge = parseVector("A".repeat(1_000_000));
  assert.equal(huge.ok, false);
  // Leading and trailing whitespace is trimmed, explicit X values are accepted.
  const padded = parseVector(`  ${good}/E:X/MAV:X\n`);
  assert.ok(padded.ok);
  if (padded.ok) assert.equal(buildVector(padded.metrics), good);
});

/* score() on hostile metric records: no NaN, no throw. */
test("verifier: score never yields NaN", () => {
  const m = { ...defaultMetrics(), AV: "Q", C: "H" } as Metrics;
  const r = score(m);
  for (const v of [r.base, r.temporal, r.environmental]) assert.ok(Number.isFinite(v));
});

console.log(`cvss-calculator: ${passed} tests passed`);
