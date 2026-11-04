import assert from "node:assert";
import { deflateSync, deflateRawSync, brotliCompressSync } from "node:zlib";
import { createCipheriv } from "node:crypto";
import {
  byteHistogram,
  entropyFromCounts,
  shannonEntropy,
  maxEntropyFor,
  expectedRandomEntropy,
  gammaQ,
  chiSquareUpperTail,
  byteStats,
  checkWindow,
  slidingEntropy,
  highRegions,
  downsample,
  decodeHex,
  decodeBase64,
  encodedAlphabet,
  describeEntropy,
  pseudoRandomBytes,
  hexOffset,
  MAX_WINDOWS,
  type SlidingResult,
} from "../../client/src/lib/toolkit/entropy-analyzer.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b}, got ${a} (tolerance ${tol})`);

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

test("Shannon entropy reference values", () => {
  assert.strictEqual(shannonEntropy(new Uint8Array(0)), 0);
  assert.strictEqual(shannonEntropy(enc("aaaa")), 0);
  assert.strictEqual(shannonEntropy(enc("ab")), 1);
  assert.strictEqual(shannonEntropy(enc("abcd")), 2);
  // Values computed independently with Python's math.log2 over collections.Counter.
  close(shannonEntropy(enc("aab")), 0.9182958340544896, 1e-15);
  close(shannonEntropy(enc("abracadabra")), 2.0403733936884962, 1e-15);
  close(shannonEntropy(enc("Hello, World!")), 3.180832987205441, 1e-15);
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.strictEqual(shannonEntropy(all), 8);
  const twice = Uint8Array.from({ length: 512 }, (_, i) => i & 0xff);
  assert.strictEqual(shannonEntropy(twice), 8);
  assert.strictEqual(entropyFromCounts([0, 0, 0], 0), 0);
  const h = byteHistogram(enc("abca"), 1, 3);
  assert.strictEqual(h[0x62], 1);
  assert.strictEqual(h[0x63], 1);
  assert.strictEqual(h[0x61], 0);
});

test("ceilings", () => {
  assert.strictEqual(maxEntropyFor(0), 0);
  assert.strictEqual(maxEntropyFor(1), 0);
  assert.strictEqual(maxEntropyFor(2), 1);
  assert.strictEqual(maxEntropyFor(64), 6);
  assert.strictEqual(maxEntropyFor(256), 8);
  assert.strictEqual(maxEntropyFor(1e6), 8);
});

test("expected entropy of random data matches the exact binomial sum", () => {
  // References: an independent Python sum of the binomial pmf in log space (lgamma).
  assert.strictEqual(expectedRandomEntropy(2), 0.99609375); // 255/256 exactly
  close(expectedRandomEntropy(16), 3.942064617480526, 1e-10);
  close(expectedRandomEntropy(64), 5.765716928946417, 1e-10);
  close(expectedRandomEntropy(256), 7.174966352532717, 1e-10);
  close(expectedRandomEntropy(1024), 7.808756571172598, 1e-10);
  close(expectedRandomEntropy(4096), 7.954588733869495, 1e-10);
  // The reference itself carries about 1e-10 of error here: lgamma(65537) is near 6.6e5,
  // so double rounding in the log-pmf alone is of that order.
  close(expectedRandomEntropy(65536), 7.99719140168482, 1e-9);
  // Past 65,536 the Miller-Madow form is used. At 65,537 it is within 2e-6 of exact.
  close(expectedRandomEntropy(65537), 7.99719140168482, 3e-6);
  assert.strictEqual(expectedRandomEntropy(0), 0);
  assert.strictEqual(expectedRandomEntropy(1), 0);
  assert.strictEqual(expectedRandomEntropy(NaN), 0);

  // And a simulation agrees: 4000 windows of 256 pseudo-random bytes.
  const data = pseudoRandomBytes(256 * 4000, 12345);
  let sum = 0;
  for (let k = 0; k < 4000; k++) sum += shannonEntropy(data.subarray(k * 256, k * 256 + 256));
  close(sum / 4000, 7.174966352532717, 0.01, "simulated mean");
});

test("chi-square tail against closed forms", () => {
  // df = 2: Q = exp(-x/2) exactly.
  close(chiSquareUpperTail(3, 2), Math.exp(-1.5), 1e-14);
  close(chiSquareUpperTail(10, 2), Math.exp(-5), 1e-14);
  // df = 1: Q = erfc(sqrt(x/2)); 3.841458820694124 is the 5% critical value.
  close(chiSquareUpperTail(3.841458820694124, 1), 0.05, 1e-12);
  // df = 255, from the exact odd-df closed form erfc + finite sum (Python).
  close(chiSquareUpperTail(200, 255), 0.995425444541996, 1e-10);
  close(chiSquareUpperTail(255, 255), 0.4882225217704305, 1e-10);
  close(chiSquareUpperTail(293.24783508070084, 255), 0.05, 1e-10);
  close(chiSquareUpperTail(300, 255), 0.027727522053904025, 1e-10);
  close(chiSquareUpperTail(350, 255), 7.132745072663724e-5, 1e-13);
  close(chiSquareUpperTail(400, 255), 1.660002524412354e-8, 1e-16);
  // df = 256, even closed form.
  close(chiSquareUpperTail(256, 256), 0.48824554909585993, 1e-10);
  close(chiSquareUpperTail(320, 256), 0.004013073884195504, 1e-12);
  assert.strictEqual(chiSquareUpperTail(0, 255), 1);
  assert.ok(Number.isNaN(gammaQ(0, 1)));
  assert.ok(Number.isNaN(gammaQ(1, -1)));
  assert.ok(chiSquareUpperTail(1e9, 255) === 0);
});

test("byteStats: chi-square, mean, serial correlation (ent definitions)", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const s = byteStats(all);
  assert.strictEqual(s.entropy, 8);
  assert.strictEqual(s.distinct, 256);
  assert.strictEqual(s.mean, 127.5);
  assert.strictEqual(s.chiSquare, 0);
  assert.strictEqual(s.chiP, 1);

  const zeros = byteStats(new Uint8Array(256));
  assert.strictEqual(zeros.chiSquare, 65025 + 255);
  assert.strictEqual(zeros.serialCorrelation, null, "constant data has no defined correlation");
  assert.strictEqual(zeros.entropy, 0);
  assert.strictEqual(zeros.distinct, 1);

  assert.strictEqual(byteStats(Uint8Array.of(0, 255, 0, 255)).serialCorrelation, -1);
  assert.strictEqual(byteStats(Uint8Array.of(0, 0, 255, 255)).serialCorrelation, 0);
  assert.strictEqual(byteStats(Uint8Array.of(7)).serialCorrelation, null);
  const empty = byteStats(new Uint8Array(0));
  assert.strictEqual(empty.size, 0);
  assert.strictEqual(empty.entropy, 0);
  assert.strictEqual(empty.mean, 0);

  // Cross-check serial correlation against a direct floating point formula on random data.
  const r = pseudoRandomBytes(10_000, 7);
  let su = 0, suu = 0, slag = 0;
  for (let i = 0; i < r.length; i++) {
    su += r[i];
    suu += r[i] * r[i];
    slag += r[i] * r[(i + 1) % r.length];
  }
  const n = r.length;
  const direct = (n * slag - su * su) / (n * suu - su * su);
  close(byteStats(r).serialCorrelation!, direct, 1e-12);

  // Linear ramp: strongly positive correlation.
  const ramp = Uint8Array.from({ length: 4096 }, (_, i) => Math.floor(i / 16));
  assert.ok(byteStats(ramp).serialCorrelation! > 0.99);
});

test("pseudo-random, compressed and encrypted data all measure near 8", () => {
  const rnd = byteStats(pseudoRandomBytes(1 << 20));
  assert.ok(rnd.entropy > 7.999, `random ${rnd.entropy}`);
  close(rnd.randomExpected, 8 - 255 / (2 * (1 << 20) * Math.LN2), 1e-12);
  assert.ok(rnd.chiP > 0.001 && rnd.chiP < 0.999, `chi p ${rnd.chiP}`);
  close(rnd.mean, 127.5, 0.5);

  // Words drawn pseudo-randomly, so the text is not one repeated phrase. A single phrase
  // repeated thousands of times deflates to a tiny, structured stream nowhere near 8.
  const words = "the of and to in is was for on that with as by at from his her which this be are or had not but they have one were all".split(" ");
  const pick = pseudoRandomBytes(60_000, 5);
  const text = enc(Array.from(pick, (b, i) => words[b % words.length] + (i % 12 === 11 ? ".\n" : " ")).join(""));
  const t = byteStats(text);
  assert.ok(t.entropy > 3.5 && t.entropy < 5, `text ${t.entropy}`);
  const z = byteStats(new Uint8Array(deflateSync(text, { level: 9 })));
  assert.ok(z.entropy > 7.5, `deflate ${z.entropy}`);

  const key = Buffer.alloc(32, 1);
  const iv = Buffer.alloc(16, 2);
  const c = createCipheriv("aes-256-ctr", key, iv);
  const ct = new Uint8Array(Buffer.concat([c.update(text), c.final()]));
  const e = byteStats(ct);
  assert.ok(e.entropy > 7.99, `aes ${e.entropy}`);
});

test("window validation", () => {
  assert.ok(checkWindow(1024, 256).ok);
  assert.ok(checkWindow(16, 16).ok);
  assert.ok(!checkWindow(15, 1).ok);
  assert.ok(!checkWindow(65537, 1).ok);
  assert.ok(!checkWindow(1024.5, 1).ok);
  assert.ok(!checkWindow(1024, 0).ok);
  assert.ok(!checkWindow(1024, 2048).ok);
  assert.ok(!checkWindow(NaN, 1).ok);
});

function brute(bytes: Uint8Array, window: number, step: number) {
  const out: { o: number; h: number }[] = [];
  let o = 0;
  for (; o + window <= bytes.length; o += step) out.push({ o, h: shannonEntropy(bytes.subarray(o, o + window)) });
  const lastEnd = out.length ? out[out.length - 1].o + window : 0;
  if (lastEnd < bytes.length) {
    const s = bytes.length - window;
    out.push({ o: s, h: shannonEntropy(bytes.subarray(s)) });
  }
  return out;
}

test("sliding entropy equals brute force, including the end-aligned tail window", () => {
  const mixed = new Uint8Array(10_000);
  mixed.set(enc("plain text ".repeat(300)).subarray(0, 3000), 0);
  mixed.set(pseudoRandomBytes(4000, 99), 5000);
  for (const [w, st] of [
    [256, 1],
    [256, 64],
    [256, 256],
    [1000, 333],
    [16, 7],
    [4096, 4096],
  ] as const) {
    const got = slidingEntropy(mixed, w, st);
    const want = brute(mixed, w, st);
    assert.strictEqual(got.count, want.length, `count for ${w}/${st}`);
    for (let k = 0; k < want.length; k++) {
      assert.strictEqual(got.offsets[k], want[k].o, `offset ${k} for ${w}/${st}`);
      close(got.entropy[k], want[k].h, 1e-9, `entropy ${k} for ${w}/${st}`);
    }
    assert.strictEqual(got.offsets[got.count - 1] + w, mixed.length, "the last window reaches the end");
    assert.ok(!got.stepRaised);
    assert.strictEqual(got.uncovered, 0, `no gaps for ${w}/${st}`);
  }
  // Input shorter than the window: one window over everything.
  const short = slidingEntropy(enc("abcd"), 256, 64);
  assert.strictEqual(short.count, 1);
  assert.strictEqual(short.lengths[0], 4);
  assert.strictEqual(short.entropy[0], 2);
  assert.strictEqual(slidingEntropy(new Uint8Array(0), 256, 64).count, 0);
});

test("the window cap raises the step and reports gaps honestly", () => {
  const big = pseudoRandomBytes(1_000_000, 3);
  const r = slidingEntropy(big, 64, 1);
  assert.ok(r.stepRaised);
  assert.ok(r.count <= MAX_WINDOWS);
  assert.ok(r.step > 1);
  assert.strictEqual(r.gaps, r.step > 64);
  assert.strictEqual(r.offsets[r.count - 1] + 64, big.length);
  // 1000 windows of 1 KiB still cover 1 MB (step 1001), so no gaps.
  const fits = slidingEntropy(big, 1024, 1, 1000);
  assert.ok(fits.count <= 1000 && fits.stepRaised && !fits.gaps);
  // 500 windows cannot: the step becomes 2006, larger than the window.
  const small = slidingEntropy(big, 1024, 1, 500);
  assert.ok(small.count <= 500);
  assert.strictEqual(small.step, 2006);
  assert.ok(small.gaps);
  // Exact coverage by brute force: mark every byte some window touches.
  const seen = new Uint8Array(big.length);
  for (let k = 0; k < small.count; k++) seen.fill(1, small.offsets[k], small.offsets[k] + 1024);
  const missed = seen.length - seen.reduce((a, b) => a + b, 0);
  assert.strictEqual(small.uncovered, missed);
  assert.ok(missed > 0);
  assert.strictEqual(fits.uncovered, 0);
  // Spot check a raised result against brute force.
  for (const k of [0, 1, 250, small.count - 2, small.count - 1]) {
    const o = small.offsets[k];
    close(small.entropy[k], shannonEntropy(big.subarray(o, o + 1024)), 1e-9);
  }
});

test("regions merge overlapping windows and respect the threshold", () => {
  const fake = (entropy: number[], step: number, window: number): SlidingResult => ({
    window,
    step,
    requestedStep: step,
    stepRaised: false,
    gaps: false,
    uncovered: 0,
    offsets: Float64Array.from(entropy, (_, i) => i * step),
    lengths: new Float64Array(entropy.length).fill(window),
    entropy: Float64Array.from(entropy),
    count: entropy.length,
  });
  const s = fake([1, 7.9, 7.95, 2, 2, 7.6, 1, 7.5], 100, 200);
  const r = highRegions(s, 7.5);
  assert.deepStrictEqual(
    r.map((x) => [x.start, x.end, x.windows]),
    [
      [100, 400, 2],
      [500, 900, 2],
    ],
  );
  close(r[0].mean, 7.925, 1e-12);
  assert.strictEqual(r[0].max, 7.95);
  // Window 6 [600, 800) is low, but windows 5 [500, 700) and 7 [700, 900) touch, so
  // their union covers [500, 900) without a gap and is reported as one region.
  close(r[1].mean, 7.55, 1e-12);
  assert.strictEqual(highRegions(s, 9).length, 0);
  assert.strictEqual(highRegions(s, 0).length, 1, "everything at or above 0 is one region");
  assert.strictEqual(highRegions(s, 0)[0].end, 900);
});

test("downsampling keeps spikes", () => {
  const e = new Array(10_000).fill(4);
  e[7777] = 7.99;
  const s: SlidingResult = {
    window: 256,
    step: 1,
    requestedStep: 1,
    stepRaised: false,
    gaps: false,
    uncovered: 0,
    offsets: Float64Array.from(e, (_, i) => i),
    lengths: new Float64Array(e.length).fill(256),
    entropy: Float64Array.from(e),
    count: e.length,
  };
  const cols = downsample(s, 100);
  assert.strictEqual(cols.length, 100);
  assert.strictEqual(Math.max(...cols.map((c) => c.max)), 7.99);
  const spike = cols.find((c) => c.max === 7.99)!;
  assert.strictEqual(spike.peak, 7777);
  assert.strictEqual(cols[0].first, 0);
  assert.strictEqual(cols[99].last, 9999);
  assert.strictEqual(downsample(s, 100000).length, 10_000);
  assert.deepStrictEqual(downsample({ ...s, count: 0 }, 10), []);
});

test("hex and Base64 input (RFC 4648 section 10 vectors)", () => {
  const vectors: [string, string, string][] = [
    ["", "", ""],
    ["f", "66", "Zg=="],
    ["fo", "666F", "Zm8="],
    ["foo", "666F6F", "Zm9v"],
    ["foob", "666F6F62", "Zm9vYg=="],
    ["fooba", "666F6F6261", "Zm9vYmE="],
    ["foobar", "666F6F626172", "Zm9vYmFy"],
  ];
  const dec = (r: ReturnType<typeof decodeHex>) => {
    assert.ok(r.ok, JSON.stringify(r));
    return new TextDecoder().decode((r as { bytes: Uint8Array }).bytes);
  };
  for (const [plain, hex, b64] of vectors) {
    assert.strictEqual(dec(decodeHex(hex)), plain);
    assert.strictEqual(dec(decodeHex(hex.toLowerCase())), plain);
    assert.strictEqual(dec(decodeBase64(b64)), plain);
    assert.strictEqual(dec(decodeBase64(b64.replace(/=/g, ""))), plain, "padding is optional");
  }
  assert.strictEqual(dec(decodeHex("66 6f:6f,0x62 \\x61-72")), "foobar");
  assert.strictEqual(dec(decodeHex("0x66, 0x6F")), "fo");
  assert.strictEqual(dec(decodeBase64("Zm9v\nYmFy\n")), "foobar");
  const url = decodeBase64("-_8");
  assert.ok(url.ok);
  assert.deepStrictEqual(Array.from((url as { bytes: Uint8Array }).bytes), [0xfb, 0xff]);

  const oddHex = decodeHex("abc");
  assert.ok(!oddHex.ok && /odd/.test(oddHex.error));
  const badHex = decodeHex("zz");
  assert.ok(!badHex.ok && /"z" is not a hex digit/.test(badHex.error));
  const badB64 = decodeBase64("Zm9v!");
  assert.ok(!badB64.ok && /position 5/.test(badB64.error));
  const shortB64 = decodeBase64("Zm9vY");
  assert.ok(!shortB64.ok && /impossible/.test(shortB64.error));
  assert.ok(!decodeBase64("Zg===").ok);
});

test("encoded alphabet detection and readings", () => {
  const h = (s: string) => byteHistogram(enc(s));
  const hex = "deadbeef00112233 445566778899aabb";
  assert.strictEqual(encodedAlphabet(h(hex), hex.length), "hex");
  const b64 = "U29tZSBzZWNyZXQgdGV4dCBoZXJlIQ==";
  assert.strictEqual(encodedAlphabet(h(b64), b64.length), "base64");
  const prose = "this is plain prose with spaces only";
  assert.strictEqual(encodedAlphabet(h(prose), prose.length), null);
  assert.strictEqual(encodedAlphabet(h("abc"), 3), null, "too short to say");
  assert.match(describeEntropy(0.2), /same value/);
  assert.match(describeEntropy(4.3), /plain text/);
  assert.match(describeEntropy(7.9), /cannot say which/);
  assert.strictEqual(hexOffset(255), "0xFF");
});

test("performance: 50 MiB", () => {
  const big = pseudoRandomBytes(50 * 1024 * 1024, 1);
  const t0 = performance.now();
  const s = byteStats(big);
  const t1 = performance.now();
  const w = slidingEntropy(big, 1024, 256);
  const t2 = performance.now();
  const w1 = slidingEntropy(big, 65536, 1);
  const t3 = performance.now();
  console.log(
    `  50 MiB: stats ${(t1 - t0).toFixed(0)} ms, sliding 1024/256 ${(t2 - t1).toFixed(0)} ms (${w.count} windows, step ${w.step}), sliding 65536/1 ${(t3 - t2).toFixed(0)} ms (${w1.count} windows, step ${w1.step})`,
  );
  assert.ok(s.entropy > 7.9999);
  assert.ok(w.count <= MAX_WINDOWS);
  assert.ok(t3 - t0 < 8000);
});


/* ---------------- independent verifier cases ---------------- */

test("verifier: chi-square tail against 80-digit series references", () => {
  // Q(df/2, x/2) summed in Python's decimal module at 80 digits, with
  // Gamma(n + 1/2) = (2n)! sqrt(pi) / (4^n n!) for the half-integer case.
  const refs: [number, number, number][] = [
    [255, 200, 0.99542544454195192],
    [255, 255, 0.48822252177040637],
    [255, 240.5, 0.73401209903925457],
    [255, 310.4574, 0.0099999877963166377], // the published 1% critical value
    [255, 350, 7.1327450726634662e-5],
    [255, 400, 1.6600025244124518e-8],
    [256, 256, 0.48824554909587708],
    [3, 7.814727903251178, 0.05], // published 5% critical value for 3 df
  ];
  for (const [df, x, q] of refs) {
    const v = chiSquareUpperTail(x, df);
    assert.ok(Math.abs(v - q) / q < 1e-11, `df ${df}, x ${x}: expected ${q}, got ${v}`);
  }
  assert.strictEqual(chiSquareUpperTail(0, 255), 1);
  assert.ok(Number.isNaN(chiSquareUpperTail(-1, 255)));
  assert.ok(Number.isNaN(chiSquareUpperTail(5, 0)));
  assert.strictEqual(chiSquareUpperTail(1e9, 255), 0, "underflows to 0, never NaN");
});

test("verifier: hand-computed chi-square, mean and serial correlation", () => {
  // 512 zero bytes: expected 2 per bin. Bin 0 gives 510^2/2 = 130050, the
  // other 255 bins give 2^2/2 = 2 each, 510 in all.
  const z = byteStats(new Uint8Array(512));
  assert.strictEqual(z.chiSquare, 130560);
  assert.strictEqual(z.entropy, 0);
  assert.strictEqual(z.distinct, 1);
  assert.strictEqual(z.serialCorrelation, null, "constant data has no defined correlation");
  // Each value exactly once: chi-square 0, p = 1, entropy 8, mean 127.5.
  const all = byteStats(Uint8Array.from({ length: 256 }, (_, i) => i));
  assert.strictEqual(all.chiSquare, 0);
  assert.strictEqual(all.chiP, 1);
  assert.strictEqual(all.entropy, 8);
  assert.strictEqual(all.mean, 127.5);
  // ent's serial correlation with the wraparound pair, worked by hand for
  // 1,2,3,4: N=4, sum=10, sum of squares=30, lag sum=1*2+2*3+3*4+4*1=24,
  // so (4*24 - 100) / (4*30 - 100) = -4/20.
  close(byteStats(Uint8Array.of(1, 2, 3, 4)).serialCorrelation as number, -0.2, 1e-15);
  // 0,0,255,255: lag sum = 0+0+65025+0 = 65025, sum 510, squares 130050:
  // (4*65025 - 260100) / (4*130050 - 260100) = 0.
  assert.strictEqual(byteStats(Uint8Array.of(0, 0, 255, 255)).serialCorrelation, 0);
  assert.strictEqual(byteStats(Uint8Array.of(0, 255)).mean, 127.5);
  assert.strictEqual(byteStats(new Uint8Array(0)).size, 0);
  assert.ok(Number.isNaN(byteStats(new Uint8Array(0)).chiP));
});

test("verifier: entropy of dyadic distributions and ceilings", () => {
  // p = 1/2, 1/4, 1/8, 1/8 gives exactly 1/2 + 2/4 + 3/8 + 3/8 = 1.75 bits.
  assert.strictEqual(shannonEntropy(enc("aaaabbcd")), 1.75);
  // 16 equally likely values: exactly 4 bits.
  assert.strictEqual(shannonEntropy(enc("0123456789abcdef".repeat(3))), 4);
  // 64 equally likely values: exactly 6 bits, the Base64 ceiling.
  const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  assert.strictEqual(shannonEntropy(enc(b64)), 6);
  close(maxEntropyFor(100), Math.log2(100), 1e-15);
  assert.strictEqual(maxEntropyFor(255), Math.log2(255));
});

test("verifier: expected random entropy at more sizes (independent lgamma sum)", () => {
  close(expectedRandomEntropy(32), 4.881786623421097, 1e-10);
  close(expectedRandomEntropy(100), 6.285706843743615, 1e-10);
  close(expectedRandomEntropy(2048), 7.907965871301855, 1e-10);
  // Miller-Madow above the exact range, continuous with the exact sum.
  close(expectedRandomEntropy(65537), expectedRandomEntropy(65536), 1e-5);
  assert.strictEqual(expectedRandomEntropy(0), 0);
  assert.strictEqual(expectedRandomEntropy(-5), 0);
  assert.strictEqual(expectedRandomEntropy(Infinity), 0);
});

test("verifier: sliding windows, end alignment and region offsets by hand", () => {
  // 100 bytes, window 16, step 16: regular windows at 0..80, then one more
  // aligned to the end at 84 so bytes 96 to 99 are covered.
  const s = slidingEntropy(new Uint8Array(100), 16, 16);
  assert.deepStrictEqual(Array.from(s.offsets), [0, 16, 32, 48, 64, 80, 84]);
  assert.strictEqual(s.uncovered, 0);
  // Input shorter than the window: one window of the whole input.
  const short = slidingEntropy(enc("abcd"), 16, 4);
  assert.strictEqual(short.count, 1);
  assert.strictEqual(short.lengths[0], 4);
  assert.strictEqual(short.entropy[0], 2);
  // 64 zeros, 256 distinct bytes, 64 zeros. With window 16 and step 16 the
  // windows from 64 to 304 each hold 16 distinct values (exactly 4 bits),
  // and every other window holds zeros (0 bits).
  const data = new Uint8Array(384);
  for (let i = 0; i < 256; i++) data[64 + i] = i;
  const w = slidingEntropy(data, 16, 16);
  const regions = highRegions(w, 4);
  assert.strictEqual(regions.length, 1);
  assert.strictEqual(regions[0].start, 64);
  assert.strictEqual(regions[0].end, 320);
  assert.strictEqual(regions[0].windows, 16);
  assert.strictEqual(regions[0].max, 4);
  assert.strictEqual(highRegions(w, 4.0001).length, 0);
  assert.strictEqual(slidingEntropy(new Uint8Array(0), 16, 1).count, 0);
});

test("verifier: malformed paste input gives precise errors, never throws", () => {
  const emoji = decodeHex("de ad 😀");
  assert.ok(!emoji.ok && emoji.error.includes("😀"), "the whole character is quoted, not half a surrogate pair");
  const ctrl = decodeHex("de\u0007ad");
  assert.ok(!ctrl.ok && ctrl.error.startsWith("U+0007"));
  const joined = decodeBase64("QQ==QQ==");
  assert.ok(!joined.ok && /padding/i.test(joined.error));
  const b64emoji = decodeBase64("Zm9v😀");
  assert.ok(!b64emoji.ok && b64emoji.error.includes("😀"));
  // RFC 4648 section 5: the URL-safe alphabet uses - and _ for 62 and 63.
  const url = decodeBase64("-_-_");
  assert.ok(url.ok);
  assert.deepStrictEqual(Array.from(url.ok ? url.bytes : []), [0xfb, 0xff, 0xbf]);
  const huge = decodeHex("zz".repeat(100000));
  assert.ok(!huge.ok);
  assert.deepStrictEqual(decodeHex(""), { ok: true, bytes: new Uint8Array(0) });
  assert.ok(!decodeBase64("A").ok, "one leftover character cannot be a byte");
});

test("verifier: chi-square separates large deflate and Brotli output from AES-CTR (deterministic)", () => {
  // Zipf-distributed word salad from a fixed seed, about 1.5 MB, so the
  // compressed outputs are a few hundred kilobytes: the size the notes cite.
  const r = pseudoRandomBytes(4_000_000, 42);
  const letters = "etaoinshrdlucmfwypvbgkjqxz";
  const vocab: string[] = [];
  let k = 0;
  for (let i = 0; i < 3000; i++) {
    const len = 2 + (r[k++] % 9);
    let w = "";
    for (let j = 0; j < len; j++) w += letters[Math.min(25, Math.floor((r[k++] / 256) ** 2 * 26))];
    vocab.push(w);
  }
  const parts: string[] = [];
  let size = 0;
  while (size < 1_500_000) {
    const u = (r[k++ % r.length] * 256 + r[k++ % r.length]) / 65536;
    const w = vocab[Math.floor(3000 * u ** 3)];
    parts.push(w);
    size += w.length + 1;
  }
  const text = Buffer.from(parts.join(" "));
  const d = byteStats(new Uint8Array(deflateRawSync(text, { level: 9 })));
  const b = byteStats(new Uint8Array(brotliCompressSync(text)));
  assert.ok(d.size > 256 * 1024 && b.size > 256 * 1024);
  assert.ok(d.entropy > 7.99 && b.entropy > 7.99, "both look random to entropy alone");
  assert.ok(d.chiP < 1e-6, `deflate p ${d.chiP}`);
  assert.ok(b.chiP < 1e-6, `brotli p ${b.chiP}`);
  const c = createCipheriv("aes-256-ctr", Buffer.alloc(32, 7), Buffer.alloc(16, 1));
  const ct = byteStats(new Uint8Array(Buffer.concat([c.update(Buffer.alloc(1 << 20)), c.final()])));
  assert.ok(ct.chiP > 0.05, `AES-CTR p ${ct.chiP}`);
});

console.log(`entropy-analyzer: ${passed} tests passed`);
