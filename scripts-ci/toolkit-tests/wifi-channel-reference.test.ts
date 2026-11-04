import assert from "node:assert/strict";
import {
  BANDS,
  BAND_WIDTHS,
  PSC,
  bondedChannels,
  bondedNotes,
  centerFrequency,
  channelNotes,
  channels,
  containing,
  findBonded,
  getChannel,
  ht40Options,
  membersOf,
  overlapping24,
  overlappingRange24,
  parseLookup,
  formulaText,
  ht40Notes,
  SUBBANDS,
  type Lookup,
} from "../../client/src/lib/toolkit/wifi-channel-reference.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

/* IEEE 802.11 channel to frequency, matching ieee80211_channel_to_freq_khz */
test("2.4 GHz centers", () => {
  assert.equal(centerFrequency("2.4", 1), 2412);
  assert.equal(centerFrequency("2.4", 6), 2437);
  assert.equal(centerFrequency("2.4", 11), 2462);
  assert.equal(centerFrequency("2.4", 13), 2472);
  assert.equal(centerFrequency("2.4", 14), 2484);
  assert.equal(centerFrequency("2.4", 0), null);
  assert.equal(centerFrequency("2.4", 15), null);
  assert.equal(centerFrequency("2.4", 1.5), null);
});

test("5 GHz centers", () => {
  assert.equal(centerFrequency("5", 36), 5180);
  assert.equal(centerFrequency("5", 64), 5320);
  assert.equal(centerFrequency("5", 100), 5500);
  assert.equal(centerFrequency("5", 144), 5720);
  assert.equal(centerFrequency("5", 149), 5745);
  assert.equal(centerFrequency("5", 165), 5825);
  assert.equal(centerFrequency("5", 177), 5885);
  assert.equal(centerFrequency("5", 42), 5210);
  assert.equal(centerFrequency("5", 50), 5250);
  assert.equal(centerFrequency("5", 184), null);
});

test("6 GHz centers", () => {
  assert.equal(centerFrequency("6", 1), 5955);
  assert.equal(centerFrequency("6", 5), 5975);
  assert.equal(centerFrequency("6", 37), 6135);
  assert.equal(centerFrequency("6", 93), 6415);
  assert.equal(centerFrequency("6", 97), 6435);
  assert.equal(centerFrequency("6", 233), 7115);
  assert.equal(centerFrequency("6", 234), null);
});

test("channel counts", () => {
  assert.equal(channels("2.4").length, 14);
  assert.equal(channels("5").length, 28);
  assert.equal(channels("5").filter((c) => !c.unii4).length, 25);
  assert.equal(channels("6").length, 59);
  assert.equal(channels("6")[58].highMHz, 7125);
  assert.equal(channels("6")[0].lowMHz, 5945);
  assert.equal(bondedChannels("6", 40).length, 29);
  assert.equal(bondedChannels("6", 80).length, 14);
  assert.equal(bondedChannels("6", 160).length, 7);
  assert.equal(bondedChannels("6", 320).length, 6);
  assert.equal(bondedChannels("5", 40).length, 14);
  assert.equal(bondedChannels("5", 80).length, 7);
  assert.equal(bondedChannels("5", 160).length, 3);
  assert.equal(bondedChannels("2.4", 40).length, 0);
});

test("dfs flags", () => {
  const dfs = channels("5").filter((c) => c.dfs).map((c) => c.channel);
  assert.deepEqual(dfs, [52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144]);
  assert.equal(channels("6").some((c) => c.dfs), false);
  assert.equal(getChannel("5", 36)?.subband, "UNII-1");
  assert.equal(getChannel("5", 52)?.subband, "UNII-2A");
  assert.equal(getChannel("5", 144)?.subband, "UNII-2C");
  assert.equal(getChannel("5", 165)?.subband, "UNII-3");
  assert.equal(getChannel("5", 169)?.subband, "UNII-4");
});

test("6 GHz sub-bands and PSC", () => {
  assert.deepEqual(PSC, [5, 21, 37, 53, 69, 85, 101, 117, 133, 149, 165, 181, 197, 213, 229]);
  assert.deepEqual(channels("6").filter((c) => c.psc).map((c) => c.channel), PSC);
  assert.equal(getChannel("6", 93)?.subband, "UNII-5");
  assert.equal(getChannel("6", 97)?.subband, "UNII-6");
  assert.equal(getChannel("6", 113)?.subband, "UNII-6");
  assert.equal(getChannel("6", 117)?.subband, "UNII-7");
  assert.equal(getChannel("6", 185)?.subband, "UNII-7/8");
  assert.equal(getChannel("6", 189)?.subband, "UNII-8");
  // Sub-band edges line up with channel edges.
  assert.equal(getChannel("6", 93)?.highMHz, 6425);
  assert.equal(getChannel("6", 113)?.highMHz, 6525);
  assert.equal(getChannel("6", 185)?.lowMHz, 6865);
});

test("bonding", () => {
  assert.deepEqual(membersOf(42, 80), [36, 40, 44, 48]);
  assert.deepEqual(membersOf(50, 160), [36, 40, 44, 48, 52, 56, 60, 64]);
  assert.deepEqual(membersOf(38, 40), [36, 40]);
  assert.deepEqual(membersOf(15, 160), [1, 5, 9, 13, 17, 21, 25, 29]);
  const b42 = findBonded("5", 80, 42)!;
  assert.equal(b42.centerMHz, 5210);
  assert.equal(b42.lowMHz, 5170);
  assert.equal(b42.highMHz, 5250);
  assert.equal(b42.dfs, false);
  const b50 = findBonded("5", 160, 50)!;
  assert.equal(b50.centerMHz, 5250);
  assert.deepEqual(b50.dfsMembers, [52, 56, 60, 64]);
  const b114 = findBonded("5", 160, 114)!;
  assert.equal(b114.centerMHz, 5570);
  assert.deepEqual(b114.members, [100, 104, 108, 112, 116, 120, 124, 128]);
  const b163 = findBonded("5", 160, 163)!;
  assert.equal(b163.unii4, true);
  assert.equal(b163.dfs, false);
  assert.equal(findBonded("5", 40, 151)!.centerMHz, 5755);
  assert.equal(findBonded("5", 80, 155)!.centerMHz, 5775);
  const b31 = findBonded("6", 320, 31)!;
  assert.equal(b31.centerMHz, 6105);
  assert.equal(b31.lowMHz, 5945);
  assert.equal(b31.highMHz, 6265);
  assert.equal(b31.set, "320-1");
  assert.equal(b31.standardPower, true);
  assert.equal(findBonded("6", 320, 63)!.set, "320-2");
  assert.equal(findBonded("6", 320, 95)!.standardPower, false);
  assert.equal(findBonded("6", 160, 111)!.standardPower, false);
  assert.equal(findBonded("6", 160, 143)!.standardPower, true);
  assert.equal(findBonded("6", 160, 175)!.standardPower, false);
  assert.equal(findBonded("6", 80, 7)!.centerMHz, 5985);
  assert.deepEqual(findBonded("6", 80, 7)!.pscMembers, [5]);
  // Every member of every bonded channel exists, and no bonded channel crosses the UNII-2B gap.
  for (const band of BANDS) {
    for (const width of BAND_WIDTHS[band]) {
      for (const b of bondedChannels(band, width)) {
        for (const m of b.members) assert.ok(getChannel(band, m), `${band} ${width} ${b.channel} member ${m}`);
        assert.equal(b.highMHz - b.lowMHz, width);
      }
    }
  }
  // Every US 160 MHz channel in UNII-1 to UNII-3 includes DFS channels.
  assert.ok(bondedChannels("5", 160).filter((b) => !b.unii4).every((b) => b.dfs));
});

test("containing", () => {
  const c36 = containing("5", 36).map((b) => `${b.width}:${b.channel}`);
  assert.deepEqual(c36, ["40:38", "80:42", "160:50"]);
  const c165 = containing("5", 165).map((b) => `${b.width}:${b.channel}`);
  assert.deepEqual(c165, ["40:167", "80:171", "160:163"]);
  const c233 = containing("6", 233);
  assert.equal(c233.length, 0);
  const c37 = containing("6", 37).map((b) => `${b.width}:${b.channel}`);
  assert.deepEqual(c37, ["40:35", "80:39", "160:47", "320:31", "320:63"]);
});

test("2.4 overlap: why 1, 6, 11", () => {
  assert.deepEqual(overlapping24(1, 20), [2, 3, 4]);
  assert.deepEqual(overlapping24(1, 22), [2, 3, 4, 5]);
  assert.deepEqual(overlapping24(6, 22), [2, 3, 4, 5, 7, 8, 9, 10]);
  assert.equal(overlapping24(6, 22).includes(1), false);
  assert.equal(overlapping24(6, 22).includes(11), false);
  assert.deepEqual(overlapping24(13, 20), [10, 11, 12, 14]);
  assert.deepEqual(overlapping24(14, 20), [12, 13]);
  assert.deepEqual(overlapping24(14, 22), [12, 13]);
  // 1, 5, 9, 13 is clean for 20 MHz OFDM but not for 22 MHz DSSS.
  assert.equal(overlapping24(5, 20).includes(1), false);
  assert.equal(overlapping24(5, 22).includes(1), true);
  assert.deepEqual(overlappingRange24(2402, 2442, 20), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(overlappingRange24(2402, 2442, 22), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("HT40 options", () => {
  const o1 = ht40Options(1);
  assert.equal(o1.length, 1);
  assert.equal(o1[0].direction, "above");
  assert.equal(o1[0].secondary, 5);
  assert.equal(o1[0].centerMHz, 2422);
  assert.equal(o1[0].centerChannel, 3);
  assert.equal(o1[0].us, true);
  const o6 = ht40Options(6);
  assert.deepEqual(o6.map((o) => `${o.direction}:${o.secondary}:${o.us}`), ["above:10:true", "below:2:true"]);
  const o9 = ht40Options(9);
  assert.deepEqual(o9.map((o) => `${o.direction}:${o.secondary}:${o.us}`), ["above:13:false", "below:5:true"]);
  assert.equal(ht40Options(14).length, 0);
  assert.equal(ht40Options(0).length, 0);
  assert.equal(ht40Options(11)[0].direction, "below");
});

test("notes exist and are free of em dashes", () => {
  for (const band of BANDS) {
    for (const c of channels(band)) {
      const n = channelNotes(band, c.channel);
      assert.ok(n.us.length > 0, `${band} ${c.channel} us`);
      assert.ok(n.elsewhere.length > 0, `${band} ${c.channel} elsewhere`);
      for (const s of [...n.us, ...n.elsewhere]) assert.equal(s.includes("—"), false);
    }
    for (const w of BAND_WIDTHS[band]) {
      for (const b of bondedChannels(band, w)) {
        const n = bondedNotes(b);
        assert.ok(n.us.length > 0);
      }
    }
  }
  assert.ok(channelNotes("5", 120).us.some((s) => /Weather Radar/.test(s)));
  assert.ok(channelNotes("5", 144).elsewhere.some((s) => /not allowed/.test(s)));
  assert.ok(channelNotes("2.4", 14).elsewhere.some((s) => /Japan only/.test(s)));
  assert.ok(channelNotes("6", 185).us.some((s) => /straddles/.test(s)));
});

test("lookup", () => {
  const f = (s: string, band: "2.4" | "5" | "6" = "5"): Lookup => parseLookup(s, band);
  const sel = (l: Lookup) => (l.kind === "found" ? `${l.band}/${l.width}/${l.channel}` : l.kind);
  assert.equal(sel(f("")), "empty");
  assert.equal(sel(f("36")), "5/20/36");
  assert.equal(sel(f("ch 36")), "5/20/36");
  assert.equal(sel(f("Channel 149")), "5/20/149");
  assert.equal(sel(f("149", "6")), "6/20/149");
  assert.equal(sel(f("5180")), "5/20/36");
  assert.equal(sel(f("5180 MHz", "2.4")), "5/20/36");
  assert.equal(sel(f("5.18 GHz", "2.4")), "5/20/36");
  assert.equal(sel(f("2.437")), "2.4/20/6");
  assert.equal(sel(f("2484")), "2.4/20/14");
  assert.equal(sel(f("6135")), "6/20/37");
  assert.equal(sel(f("5210")), "5/80/42");
  assert.equal(sel(f("5250")), "5/160/50");
  assert.equal(sel(f("6105")), "6/320/31");
  assert.equal(sel(f("42")), "5/80/42");
  assert.equal(sel(f("6", "5")), "2.4/20/6");
  assert.equal(sel(f("7", "6")), "6/80/7");
  assert.equal(sel(f("5185")), "5/20/36");
  assert.equal(sel(f("2440", "2.4")), "2.4/20/7");
  assert.equal(sel(f("5400")), "error");
  assert.equal(sel(f("5340")), "error");
  assert.equal(sel(f("5910")), "error");
  assert.equal(sel(f("5935")), "error");
  assert.equal(sel(f("3000")), "error");
  assert.equal(sel(f("0")), "error");
  assert.equal(sel(f("234")), "error");
  assert.equal(sel(f("68")), "error");
  assert.equal(sel(f("36.5")), "error");
  assert.equal(sel(f("5180.5")), "error");
  assert.equal(sel(f("abc")), "error");
  assert.equal(sel(f("9".repeat(500))), "error");
  assert.equal(sel(f("-1")), "error");
  const n = f("6", "5");
  assert.ok(n.kind === "found" && /not a 5 GHz channel/.test(n.note ?? ""));
});

test("fuzz lookup", () => {
  const alphabet = "0123456789.mhzgc annel-";
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < 20000; i += 1) {
    let s = "";
    const len = rnd() % 20;
    for (let j = 0; j < len; j += 1) s += alphabet[rnd() % alphabet.length];
    for (const band of BANDS) assert.ok(typeof parseLookup(s, band).kind === "string");
  }
});


/* ---------------- Independent verifier cases ---------------- */

test("verifier: 802.11 / Linux mapping edge cases", () => {
  // ieee80211_channel_to_freq_khz: 6 GHz channel 2 is 5935 MHz, not 5950 + 10.
  assert.equal(centerFrequency("6", 2), 5935);
  assert.equal(formulaText("6", 2), "special case: 5935");
  assert.equal(getChannel("6", 2), null);
  assert.equal(centerFrequency("6", 0), null);
  assert.equal(centerFrequency("6", -1), null);
  assert.equal(centerFrequency("5", 0), null);
  assert.equal(centerFrequency("2.4", Number.MAX_SAFE_INTEGER), null);
  assert.equal(centerFrequency("2.4", NaN), null);
  assert.equal(centerFrequency("5", Infinity), null);
  // Every 20 MHz channel's center is exactly 5 MHz times its number above the band base.
  for (const c of channels("5")) assert.equal(c.centerMHz, 5000 + 5 * c.channel);
  for (const c of channels("6")) assert.equal(c.centerMHz, 5950 + 5 * c.channel);
  for (const c of channels("2.4").filter((x) => x.channel < 14)) assert.equal(c.centerMHz, 2407 + 5 * c.channel);
});

test("verifier: band edges from the FCC sub-band limits", () => {
  // UNII-1 5150-5250, UNII-2A 5250-5350, UNII-2C 5470-5725, UNII-3 5725-5850, UNII-4 5850-5895.
  assert.equal(getChannel("5", 36)!.lowMHz, 5170);
  assert.equal(getChannel("5", 48)!.highMHz, 5250);
  assert.equal(getChannel("5", 64)!.highMHz, 5330);
  assert.equal(getChannel("5", 100)!.lowMHz, 5490);
  assert.equal(getChannel("5", 144)!.lowMHz, 5710);
  assert.equal(getChannel("5", 144)!.highMHz, 5730);
  assert.equal(getChannel("5", 165)!.highMHz, 5835);
  assert.equal(getChannel("5", 177)!.highMHz, 5895);
  const s5 = SUBBANDS["5"].map((b) => `${b.name}:${b.lowMHz}-${b.highMHz}`);
  assert.deepEqual(s5, ["UNII-1:5150-5250", "UNII-2A:5250-5350", "UNII-2B:5350-5470", "UNII-2C:5470-5725", "UNII-3:5725-5850", "UNII-4:5850-5895"]);
  const s6 = SUBBANDS["6"].map((b) => `${b.name}:${b.lowMHz}-${b.highMHz}`);
  assert.deepEqual(s6, ["UNII-5:5925-6425", "UNII-6:6425-6525", "UNII-7:6525-6875", "UNII-8:6875-7125"]);
  // Every 6 GHz channel lies inside the sub-band it is labeled with (185 straddles 6875).
  for (const c of channels("6")) {
    if (c.subband === "UNII-7/8") continue;
    const sb = SUBBANDS["6"].find((b) => b.name === c.subband)!;
    assert.ok(c.lowMHz >= sb.lowMHz && c.highMHz <= sb.highMHz, `6 GHz ${c.channel}`);
  }
  for (const c of channels("5")) {
    if (c.channel === 144 || c.channel === 169) continue; // each straddles a sub-band edge
    const sb = SUBBANDS["5"].find((b) => b.name === c.subband)!;
    assert.ok(c.lowMHz >= sb.lowMHz && c.highMHz <= sb.highMHz, `5 GHz ${c.channel}`);
  }
});

test("verifier: 802.11be 320 MHz and other bonded centers", () => {
  const b191 = findBonded("6", 320, 191)!;
  assert.equal(b191.centerMHz, 6905);
  assert.equal(b191.lowMHz, 6745);
  assert.equal(b191.highMHz, 7065);
  assert.equal(b191.set, "320-2");
  assert.equal(findBonded("6", 320, 159)!.set, "320-1");
  assert.deepEqual(bondedChannels("6", 320).filter((b) => b.set === "320-1").map((b) => b.channel), [31, 95, 159]);
  const b175 = findBonded("5", 40, 175)!;
  assert.equal(b175.centerMHz, 5875);
  assert.equal(b175.highMHz, 5895);
  assert.equal(findBonded("5", 80, 138)!.centerMHz, 5690);
  assert.deepEqual(findBonded("5", 80, 138)!.members, [132, 136, 140, 144]);
  assert.equal(findBonded("6", 160, 207)!.highMHz, 7065); // 193 to 221; 225 to 233 have no 160 MHz channel
  assert.equal(findBonded("5", 80, 50), null);
  assert.equal(findBonded("2.4", 40, 3), null);
  // Bonded rows never overlap within one width (except the two 320 MHz sets).
  for (const band of ["5", "6"] as const) {
    for (const w of BAND_WIDTHS[band]) {
      if (w === 20) continue;
      const list = bondedChannels(band, w);
      for (const set of [null, "320-1", "320-2"]) {
        const grp = list.filter((b) => (w === 320 ? b.set === set : set === null));
        for (let i = 1; i < grp.length; i += 1) assert.ok(grp[i].lowMHz >= grp[i - 1].highMHz, `${band} ${w} ${grp[i].channel}`);
      }
    }
  }
});

test("verifier: 2.4 GHz overlap and HT40 at the top of the band", () => {
  assert.deepEqual(overlapping24(11, 22), [7, 8, 9, 10, 12, 13]);
  assert.deepEqual(overlapping24(11, 20), [8, 9, 10, 12, 13]);
  assert.deepEqual(overlapping24(99, 20), []);
  const o13 = ht40Options(13);
  assert.equal(o13.length, 1);
  assert.equal(o13[0].direction, "below");
  assert.equal(o13[0].secondary, 9);
  assert.equal(o13[0].centerMHz, 2462);
  assert.equal(o13[0].us, false);
  assert.ok(ht40Notes(o13[0]).us[0].startsWith("Not usable"));
  assert.deepEqual(ht40Options(7).map((o) => `${o.direction}:${o.secondary}:${o.us}`), ["above:11:true", "below:3:true"]);
  assert.equal(ht40Options(1.5).length, 0);
  assert.equal(ht40Options(-4).length, 0);
});

test("verifier: lookup parsing hardening", () => {
  const f = (s: string, band: "2.4" | "5" | "6" = "5"): Lookup => parseLookup(s, band);
  const sel = (l: Lookup) => (l.kind === "found" ? `${l.band}/${l.width}/${l.channel}` : l.kind);
  assert.equal(sel(f("5.180 GHz")), "5/20/36");
  assert.equal(sel(f("5.1800 GHz")), "5/20/36");
  assert.equal(sel(f("5.1805 GHz")), "error");
  assert.equal(sel(f("2.4375")), "error");
  assert.equal(sel(f("ch 5180")), "error");
  assert.equal(sel(f("ch 36 mhz")), "error");
  assert.equal(sel(f("ch 3.5")), "error");
  assert.equal(sel(f("  CH. 165  ", "6")), "6/20/165");
  assert.equal(sel(f("165", "5")), "5/20/165");
  assert.equal(sel(f("6.135g")), "6/20/37");
  assert.equal(sel(f("7125")), "6/20/233");
  assert.equal(sel(f("7126")), "error");
  assert.equal(sel(f("2401")), "error");
  assert.equal(sel(f("2402", "6")), "2.4/20/1");
  const gap = f("5732");
  assert.ok(gap.kind === "error" && /channel 144/.test(gap.message) && !/outside/.test(gap.message));
  const b2 = f("5400");
  assert.ok(b2.kind === "error" && /UNII-2B/.test(b2.message));
  const v2x = f("5900");
  assert.ok(v2x.kind === "error" && /C-V2X/.test(v2x.message));
  assert.equal(sel(f("\u0663\u0666")), "error");
  assert.equal(sel(f("36\u00a0")), "5/20/36");
  assert.equal(sel(f("1e3")), "error");
  assert.equal(sel(f("0x24")), "error");
  assert.equal(sel(f("x".repeat(41))), "error");
});

test("verifier: regulatory note consistency", () => {
  // 120, 124 and 128 overlap TDWR at 5600-5650 MHz; 116 and 132 do not.
  for (const ch of [120, 124, 128]) assert.ok(channelNotes("5", ch).us.some((s) => /Weather Radar/.test(s)), `${ch}`);
  for (const ch of [116, 132]) assert.ok(!channelNotes("5", ch).us.some((s) => /Weather Radar/.test(s)), `${ch}`);
  assert.ok(channelNotes("5", 169).us.some((s) => /Straddles 5850/.test(s)));
  assert.ok(channelNotes("6", 37).us.some((s) => /Preferred scanning/.test(s)));
  assert.ok(!channelNotes("6", 33).us.some((s) => /Preferred scanning/.test(s)));
  assert.ok(channelNotes("6", 97).us.some((s) => /not allowed in UNII-6/.test(s)));
  assert.ok(channelNotes("6", 1).elsewhere[0].includes("5945 to 6425"));
  assert.ok(channelNotes("6", 97).elsewhere[0].startsWith("Above 6425 MHz"));
  assert.ok(channelNotes("2.4", 12).us.some((s) => /reduced power/.test(s)));
  assert.equal(channelNotes("5", 999).us.length, 0);
  const n = bondedNotes(findBonded("6", 160, 111)!);
  assert.ok(n.us.some((s) => /standard power under AFC is not available/.test(s)));
  const all = [] as string[];
  for (const band of BANDS) for (const c of channels(band)) { const x = channelNotes(band, c.channel); all.push(...x.us, ...x.elsewhere); }
  for (const t of all) {
    assert.ok(!t.includes("\u2014"));
    assert.ok(!/!/.test(t));
  }
});

console.log(`wifi-channel-reference: ${passed} tests passed`);
