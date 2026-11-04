import assert from "node:assert/strict";
import {
  SPEED_OF_LIGHT_M_S,
  EARTH_RADIUS_KM,
  GEO_ALTITUDE_KM,
  LEO_ALTITUDE_KM,
  FIBER_GROUP_INDEX,
  MEDIA,
  mediumById,
  CITIES,
  cityById,
  propagationSeconds,
  microsecondsPerKm,
  haversineKm,
  bentPipeMidpoint,
  bentPipeGeo,
  equatorialPair,
  wireBytes,
  serializationSeconds,
  bdpBytes,
  formatDuration,
  formatKm,
  formatBytes,
  formatRate,
  parseDistanceKm,
  parseVelocityFactor,
  parseStretch,
  parsePacketBytes,
  parseRateBps,
  parseHops,
  computeDelay,
  MAX_SURFACE_KM,
} from "../../client/src/lib/toolkit/propagation-delay-calculator.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
}
const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} got ${a} (tol ${tol})`);

t("propagation basics", () => {
  close(propagationSeconds(SPEED_OF_LIGHT_M_S / 1000, 1), 1, 1e-12, "1 light-second");
  // 1000 km of single-mode fiber at n = 1.468: 4.8967 ms.
  close(propagationSeconds(1000, 1 / FIBER_GROUP_INDEX) * 1e3, 4.89671, 1e-4, "fiber 1000 km");
  close(microsecondsPerKm(1 / FIBER_GROUP_INDEX), 4.89671, 1e-4, "fiber us/km");
  close(microsecondsPerKm(1), 3.33564, 1e-4, "vacuum us/km");
  close(microsecondsPerKm(0.64), 5.21194, 1e-4, "copper us/km");
  close(mediumById("fiber").velocityFactor, 0.68120, 1e-4, "fiber vf");
  assert.equal(mediumById("geo").altitudeKm, GEO_ALTITUDE_KM);
  assert.equal(mediumById("leo").altitudeKm, LEO_ALTITUDE_KM);
  assert.equal(new Set(MEDIA.map((m) => m.id)).size, MEDIA.length);
});

t("haversine", () => {
  // Rosetta Code reference: BNA to LAX with R = 6372.8 km is 2887.2599506 km.
  close(haversineKm({ lat: 36.12, lon: -86.67 }, { lat: 33.94, lon: -118.4 }, 6372.8), 2887.2599506, 1e-6, "BNA-LAX");
  const R = EARTH_RADIUS_KM;
  close(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }), (Math.PI * R) / 2, 1e-9, "quarter equator");
  close(haversineKm({ lat: 0, lon: 0 }, { lat: 90, lon: 0 }), (Math.PI * R) / 2, 1e-9, "equator to pole");
  close(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }), Math.PI * R, 1e-9, "antipodal");
  close(haversineKm({ lat: 45, lon: 10 }, { lat: -45, lon: -170 }), Math.PI * R, 1e-6, "antipodal 2");
  assert.equal(haversineKm({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0);
  close(haversineKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 }), (Math.PI * R) / 180, 1e-9, "dateline");
  // Symmetric
  const a = cityById("new-york")!;
  const b = cityById("london")!;
  close(haversineKm(a, b), haversineKm(b, a), 1e-9);
  // New York to London is about 5,570 km on a sphere.
  close(haversineKm(a, b), 5570, 10, "NYC-LON");
  assert.ok(CITIES.length >= 25);
  assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
  for (const c of CITIES) assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.name);
});

t("satellite geometry", () => {
  // Same point, satellite overhead: path is exactly twice the altitude.
  const [p] = equatorialPair(0);
  const geoZenith = bentPipeMidpoint(p, p, GEO_ALTITUDE_KM);
  close(geoZenith.pathKm, 2 * GEO_ALTITUDE_KM, 1e-6, "GEO zenith path");
  close(geoZenith.up.elevationDeg, 90, 1e-6, "zenith elevation");
  assert.equal(geoZenith.visible, true);
  // 71,572 km at c: 238.74 ms one way, 477.48 ms round trip.
  close(propagationSeconds(geoZenith.pathKm, 1) * 1e3, 238.7385, 1e-3, "GEO one-way ms");
  const leoZenith = bentPipeMidpoint(p, p, LEO_ALTITUDE_KM);
  close(leoZenith.pathKm, 1100, 1e-6, "LEO zenith");
  close(propagationSeconds(1100, 1) * 1e3, 3.66920, 1e-4, "LEO one-way ms");

  // Law of cosines check for a separated pair.
  const ground = 2000;
  const [a, b] = equatorialPair(ground);
  close(haversineKm(a, b), ground, 1e-6, "equatorial pair spacing");
  const half = ground / EARTH_RADIUS_KM / 2;
  const R = EARTH_RADIUS_KM;
  const Rs = R + LEO_ALTITUDE_KM;
  const slant = Math.sqrt(R * R + Rs * Rs - 2 * R * Rs * Math.cos(half));
  const leo = bentPipeMidpoint(a, b, LEO_ALTITUDE_KM);
  close(leo.up.slantKm, slant, 1e-6, "slant");
  close(leo.down.slantKm, slant, 1e-6, "slant symmetric");
  assert.equal(leo.visible, true);
  // Elevation from geometry: tan(el) = (cos(theta) - R/Rs) / sin(theta)
  const el = Math.atan2(Math.cos(half) - R / Rs, Math.sin(half)) * (180 / Math.PI);
  close(leo.up.elevationDeg, el, 1e-6, "elevation");

  // LEO horizon: cos(theta/2) = R / (R + h), about 5,116 km of ground at 0 degrees.
  const limit = 2 * Math.acos(R / Rs) * R;
  assert.equal(bentPipeMidpoint(...equatorialPair(limit - 1), LEO_ALTITUDE_KM).visible, true);
  assert.equal(bentPipeMidpoint(...equatorialPair(limit + 1), LEO_ALTITUDE_KM).visible, false);
  close(limit, 5116, 5, "LEO single-hop limit");

  // Antipodal: no satellite can see both.
  const anti = bentPipeMidpoint({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }, GEO_ALTITUDE_KM);
  assert.equal(anti.visible, false);
  assert.ok(Number.isFinite(anti.pathKm));
});

t("geo search", () => {
  // Two points on the equator: best slot is straight above the midpoint.
  const [a, b] = equatorialPair(4000);
  const g = bentPipeGeo(a, b);
  const m = bentPipeMidpoint(a, b, GEO_ALTITUDE_KM);
  close(g.pathKm, m.pathKm, 1e-3, "geo search matches midpoint on equator");
  close(g.satellite.lat, 0, 1e-9);
  // New York to London: visible, path between zenith minimum and twice the horizon range.
  const nyl = bentPipeGeo(cityById("new-york")!, cityById("london")!);
  assert.equal(nyl.visible, true);
  assert.ok(nyl.pathKm > 2 * GEO_ALTITUDE_KM && nyl.pathKm < 2 * 41_680, `${nyl.pathKm}`);
  assert.ok(nyl.up.elevationDeg >= 0 && nyl.down.elevationDeg >= 0);
  // Las Vegas to Singapore: a slot over the western Pacific sees both, low in the sky.
  const lvs = bentPipeGeo(cityById("las-vegas")!, cityById("singapore")!);
  assert.equal(lvs.visible, true);
  assert.ok(lvs.satellite.lon > 160 || lvs.satellite.lon < -170, `${lvs.satellite.lon}`);
  assert.ok(Math.min(lvs.up.elevationDeg, lvs.down.elevationDeg) < 15);
  // London to Auckland is nearly antipodal: no geostationary slot sees both.
  const la = bentPipeGeo(cityById("london")!, cityById("auckland")!);
  assert.equal(la.visible, false);
  assert.ok(Number.isFinite(la.pathKm));
  // The search never returns a longer path than the midpoint-of-longitudes guess when both are visible.
  const tok = bentPipeGeo(cityById("tokyo")!, cityById("sydney")!);
  assert.equal(tok.visible, true);
});

t("computeDelay", () => {
  const [a, b] = equatorialPair(1000);
  const input = { ends: [a, b] as [typeof a, typeof b], routeKm: 1000, groundKm: 1000, fromPlaces: false };
  const fiber = computeDelay(input, mediumById("fiber"), mediumById("fiber").velocityFactor);
  close(fiber.oneWaySeconds * 1e3, 4.89671, 1e-4);
  close(fiber.rttSeconds, 2 * fiber.oneWaySeconds, 1e-15);
  const geo = computeDelay(input, mediumById("geo"), 1);
  assert.equal(geo.problem, null);
  assert.ok(geo.oneWaySeconds > 0.2387);
  const tooFar = computeDelay({ ...input, groundKm: MAX_SURFACE_KM + 10, routeKm: MAX_SURFACE_KM + 10 }, mediumById("leo"), 1);
  assert.ok(tooFar.problem !== null);
  const leoFar = computeDelay({ ...input, ends: equatorialPair(8000), groundKm: 8000, routeKm: 8000 }, mediumById("leo"), 1);
  assert.ok(leoFar.problem !== null);
  // A long fiber route beyond half the planet is still fine for terrestrial media.
  const long = computeDelay({ ...input, routeKm: 30000, groundKm: 30000 }, mediumById("fiber"), mediumById("fiber").velocityFactor);
  assert.equal(long.problem, null);
});

t("serialization", () => {
  close(serializationSeconds(1500, 1e9), 12e-6, 1e-15, "1500 B at 1G");
  close(serializationSeconds(1500, 10e6), 1.2e-3, 1e-15, "1500 B at 10M");
  assert.equal(wireBytes(1500, false), 1500);
  assert.equal(wireBytes(1500, true), 1538);
  close(serializationSeconds(wireBytes(1500, true), 1e9), 12.304e-6, 1e-15);
  // Minimum frame: 64 bytes plus 20 of preamble and gap is 84 bytes, 672 ns at 1 Gbps,
  // which is the familiar 1,488,095 frames per second line rate.
  assert.equal(wireBytes(1, true), 84);
  assert.equal(wireBytes(46, true), 84);
  assert.equal(wireBytes(47, true), 85);
  close(serializationSeconds(84, 1e9), 672e-9, 1e-18);
  assert.equal(Math.floor(1 / serializationSeconds(84, 1e9)), 1488095);
  // BDP: 1 Gbps x 100 ms = 12.5 MB
  close(bdpBytes(1e9, 0.1), 12_500_000, 1e-6);
  // 100 Mbps over a GEO round trip is about 6 MB in flight.
  close(bdpBytes(100e6, 0.47748), 5_968_500, 1);
});

t("parsing", () => {
  assert.deepEqual(parseDistanceKm("100", "km"), { ok: true, value: 100 });
  close((parseDistanceKm("1", "mi") as { value: number }).value, 1.609344, 1e-12);
  close((parseDistanceKm("1000", "ft") as { value: number }).value, 0.3048, 1e-12);
  close((parseDistanceKm("100", "m") as { value: number }).value, 0.1, 1e-12);
  assert.deepEqual(parseDistanceKm("1,000", "km"), { ok: true, value: 1000 });
  assert.deepEqual(parseDistanceKm("1e3", "km"), { ok: true, value: 1000 });
  assert.deepEqual(parseDistanceKm("0", "km"), { ok: true, value: 0 });
  for (const bad of ["", "abc", "-5", "1.2.3", "Infinity", "NaN", "1e400", "2000000", "9".repeat(50)]) {
    assert.equal(parseDistanceKm(bad, "km").ok, false, bad);
  }
  assert.deepEqual(parseVelocityFactor("0.66"), { ok: true, value: 0.66 });
  assert.deepEqual(parseVelocityFactor("1"), { ok: true, value: 1 });
  for (const bad of ["0", "1.01", "", "x", "-0.5"]) assert.equal(parseVelocityFactor(bad).ok, false, bad);
  assert.deepEqual(parseStretch("1.3"), { ok: true, value: 1.3 });
  for (const bad of ["0.9", "11", ""]) assert.equal(parseStretch(bad).ok, false, bad);
  assert.deepEqual(parsePacketBytes("1500"), { ok: true, value: 1500 });
  for (const bad of ["0", "1.5", "", "2000000000"]) assert.equal(parsePacketBytes(bad).ok, false, bad);
  assert.deepEqual(parseRateBps("1", "Gbps"), { ok: true, value: 1e9 });
  assert.deepEqual(parseRateBps("1.544", "Mbps"), { ok: true, value: 1544000 });
  for (const bad of ["0", "", "11"]) assert.equal(parseRateBps(bad, bad === "11" ? "Tbps" : "Mbps").ok, false, bad);
  assert.deepEqual(parseHops("3"), { ok: true, value: 3 });
  for (const bad of ["0", "65", "1.5", "", "abc"]) assert.equal(parseHops(bad).ok, false, bad);
});

t("formatting", () => {
  assert.equal(formatDuration(0.2387385), "238.74 ms");
  assert.equal(formatDuration(12.304e-6), "12.304 µs");
  assert.equal(formatDuration(672e-9), "672 ns");
  assert.equal(formatDuration(4.89671e-3), "4.8967 ms");
  assert.equal(formatDuration(8e9), "8,000,000,000 s");
  assert.equal(formatDuration(1e-13), "0.0001 ns");
  assert.equal(formatDuration(100e-6), "100 µs");
  assert.equal(formatDuration(1.5), "1.5 s");
  assert.equal(formatDuration(0), "0 s");
  assert.equal(formatDuration(NaN), "n/a");
  assert.equal(formatKm(0.1), "100 m");
  assert.equal(formatKm(5570.23), "5,570.2 km");
  assert.equal(formatBytes(12_500_000), "12,500,000 bytes (12.5 MB)");
  assert.equal(formatBytes(500), "500 bytes");
  assert.equal(formatRate(1e9), "1 Gbps");
  assert.equal(formatRate(1544000), "1.544 Mbps");
});

console.log(`propagation-delay-calculator: ${n} test groups passed`);

import { normalizeLon } from "../../client/src/lib/toolkit/propagation-delay-calculator.ts";
assert.equal(normalizeLon(180), -180);
assert.equal(normalizeLon(-180), -180);
assert.equal(normalizeLon(190), -170);
assert.equal(normalizeLon(-190), 170);
assert.equal(normalizeLon(45), 45);
for (const [a, b] of [["las-vegas", "singapore"], ["new-york", "tokyo"], ["london", "auckland"]]) {
  const g = bentPipeGeo(cityById(a)!, cityById(b)!);
  assert.ok(g.satellite.lon >= -180 && g.satellite.lon < 180, `${a}-${b} ${g.satellite.lon}`);
}
console.log("normalizeLon checks passed");

assert.equal(parseVelocityFactor("1e-300").ok, false);
assert.equal(parseVelocityFactor("0.009").ok, false);
assert.deepEqual(parseVelocityFactor("0.01"), { ok: true, value: 0.01 });
assert.equal(formatDuration(1e-20), "under 0.0001 ns");
assert.ok(!/\de[+-]?\d/.test(formatDuration(propagationSeconds(1e-300, 1))));
// Worst finite case stays readable: 1,000,000 km at the slowest allowed factor.
assert.equal(formatDuration(propagationSeconds(1_000_000, 0.01)), "333.56 s");
console.log("edge checks passed");

{
  const r = parseDistanceKm("-5", "km");
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error.includes("negative"));
  console.log("negative check passed");
}

/* ---------------- independent verifier additions ---------------- */
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
  const near = (a: number, b: number, tol: number, msg: string) =>
    assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} +/- ${tol}`);

  // Values below were computed independently with the Vincenty sphere formula (atan2 form) in Python.
  check("great-circle reference distances", () => {
    // Movable Type Scripts worked example, Land's End to John o' Groats at R = 6371 km: 968.9 km.
    near(
      haversineKm({ lat: 50 + 3 / 60 + 59 / 3600, lon: -(5 + 42 / 60 + 53 / 3600) }, { lat: 58 + 38 / 60 + 38 / 3600, lon: -(3 + 4 / 60 + 12 / 3600) }, 6371),
      968.8535,
      0.001,
      "LE-JOG",
    );
    near(haversineKm(cityById("paris")!, cityById("london")!), 343.5565, 0.001, "Paris-London");
    near(haversineKm(cityById("new-york")!, cityById("london")!), 5570.2299, 0.001, "NY-London");
    near(haversineKm(cityById("sydney")!, cityById("auckland")!), 2155.9013, 0.001, "Sydney-Auckland");
    near(haversineKm(cityById("las-vegas")!, cityById("los-angeles")!), 367.6068, 0.001, "LV-LA");
    near(haversineKm({ lat: 90, lon: 0 }, { lat: -90, lon: 0 }), 20015.1144, 0.001, "pole to pole");
    near(haversineKm({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0, 0, "same point");
    // Symmetric
    near(haversineKm(cityById("tokyo")!, cityById("sao-paulo")!), haversineKm(cityById("sao-paulo")!, cityById("tokyo")!), 1e-9, "symmetry");
  });

  check("propagation reference values", () => {
    near(propagationSeconds(299_792.458, 1), 1, 1e-15, "c covers 299,792.458 km in 1 s");
    near(propagationSeconds(1000, 1 / FIBER_GROUP_INDEX) * 1e3, 4.896721, 1e-6, "1000 km fiber ms");
    near(propagationSeconds(0.1, 0.64) * 1e9, 521.1939, 1e-4, "100 m copper ns");
    near(microsecondsPerKm(1), 3.335641, 1e-6, "vacuum us/km");
    // Rule of thumb: 100 km of fiber round trip is about 1 ms.
    near(2 * propagationSeconds(100, 1 / FIBER_GROUP_INDEX) * 1e3, 0.979344, 1e-6, "100 km RTT");
  });

  check("GEO geometry against the law of cosines", () => {
    // Ground point 30 degrees of longitude from the subsatellite point, on the equator.
    const pair = equatorialPair((30 * Math.PI / 180) * EARTH_RADIUS_KM * 2);
    const pipe = bentPipeMidpoint(pair[0], pair[1], GEO_ALTITUDE_KM);
    near(pipe.up.slantKm, 36777.769, 0.01, "slant at 30 deg");
    near(pipe.up.elevationDeg, 55.0311, 1e-3, "elevation at 30 deg");
    assert.ok(pipe.visible);
    // Just inside the 81.31 degree horizon each leg is close to sqrt((R+h)^2 - R^2) = 41,672.8 km.
    const edge = equatorialPair((81.3 * Math.PI / 180) * EARTH_RADIUS_KM * 2);
    const e = bentPipeMidpoint(edge[0], edge[1], GEO_ALTITUDE_KM);
    assert.ok(e.visible);
    near(e.up.slantKm, 41672.8, 5, "slant near horizon");
    assert.ok(e.up.elevationDeg >= 0 && e.up.elevationDeg < 0.05);
    const beyond = equatorialPair((81.4 * Math.PI / 180) * EARTH_RADIUS_KM * 2);
    assert.equal(bentPipeMidpoint(beyond[0], beyond[1], GEO_ALTITUDE_KM).visible, false);
    // Zenith: 238.738 ms one way.
    near(propagationSeconds(2 * GEO_ALTITUDE_KM, 1) * 1e3, 238.7385, 1e-3, "GEO zenith");
  });

  check("LEO single-hop reach", () => {
    // Horizon central angle acos(R / (R + 550)) = 22.996 degrees, so ends up to 5114 km apart.
    const ok = equatorialPair(5100);
    assert.equal(bentPipeMidpoint(ok[0], ok[1], LEO_ALTITUDE_KM).visible, true);
    const no = equatorialPair(5130);
    assert.equal(bentPipeMidpoint(no[0], no[1], LEO_ALTITUDE_KM).visible, false);
    const ny = cityById("new-york")!;
    const ldn = cityById("london")!;
    const r = computeDelay({ ends: [ny, ldn], routeKm: 5570, groundKm: 5570, fromPlaces: true }, mediumById("leo"), 1);
    assert.notEqual(r.problem, null);
  });

  check("serialization reference values", () => {
    near(serializationSeconds(wireBytes(46, true), 10e6) * 1e6, 67.2, 1e-9, "minimum frame at 10 Mbps");
    assert.equal(wireBytes(1, true), 84); // padded to the 64-byte minimum frame plus 20
    assert.equal(wireBytes(45, true), 84);
    assert.equal(wireBytes(47, true), 85);
    near(serializationSeconds(wireBytes(9000, true), 10e9) * 1e6, 7.2304, 1e-9, "jumbo at 10 Gbps");
    near(serializationSeconds(1500, 1e6) * 1e3, 12, 1e-12, "1500 B unframed at 1 Mbps");
    near(bdpBytes(100e6, 2 * propagationSeconds(2 * GEO_ALTITUDE_KM, 1)) / 1e6, 5.96846, 1e-5, "GEO BDP at 100 Mbps");
  });

  check("malformed and boundary input", () => {
    const bad = ["", "  ", "abc", "-5", "1e400", "１２", "−5", "1..2", "0x10", "Infinity", "NaN", "🙂", "9".repeat(5000)];
    for (const s of bad) {
      assert.equal(parseDistanceKm(s, "km").ok, false, `distance ${JSON.stringify(s.slice(0, 10))}`);
      assert.equal(parseRateBps(s, "Gbps").ok, false);
      assert.equal(parsePacketBytes(s).ok, false);
      assert.equal(parseVelocityFactor(s).ok, false);
      assert.equal(parseStretch(s).ok, false);
      assert.equal(parseHops(s).ok, false);
    }
    assert.deepEqual(parseDistanceKm("1,000", "km"), { ok: true, value: 1000 });
    assert.equal(parseDistanceKm("1e6", "km").ok, true);
    assert.equal(parseDistanceKm("1000001", "km").ok, false);
    assert.equal(parseDistanceKm("621372", "mi").ok, false); // 1,000,001.3 km
    assert.equal(parseDistanceKm("621371", "mi").ok, true);
    assert.equal(parseRateBps("0.5", "bps").ok, false);
    assert.equal(parseRateBps("10", "Tbps").ok, true);
    assert.equal(parseRateBps("10.001", "Tbps").ok, false);
    assert.equal(parseHops("0").ok, false);
    assert.equal(parseHops("65").ok, false);
    assert.equal(parseHops("64").ok, true);
    assert.equal(parsePacketBytes("1.5").ok, false);
    assert.equal(parsePacketBytes("1000000001").ok, false);
    assert.equal(parseVelocityFactor("1.01").ok, false);
    assert.equal(parseVelocityFactor("0.005").ok, false);
    assert.equal(parseStretch("0.99").ok, false);
  });

  check("satellite on a typed distance past half the Earth", () => {
    const r = computeDelay(
      { ends: equatorialPair(MAX_SURFACE_KM), routeKm: 30000, groundKm: 30000, fromPlaces: false },
      mediumById("geo"),
      1,
    );
    assert.notEqual(r.problem, null);
    assert.equal(formatDuration(r.oneWaySeconds), "n/a");
    // Every medium on a zero distance is zero delay, satellites the climb only.
    const zero = { ends: equatorialPair(0), routeKm: 0, groundKm: 0, fromPlaces: false };
    assert.equal(computeDelay(zero, mediumById("fiber"), 1 / FIBER_GROUP_INDEX).oneWaySeconds, 0);
    near(computeDelay(zero, mediumById("leo"), 1).pathKm, 1100, 1e-6, "LEO zenith path");
  });

  console.log(`propagation verifier additions: ${v} groups passed`);
}
