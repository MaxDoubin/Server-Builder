import assert from "node:assert/strict";
import {
  DISCORD_EPOCH_MS,
  MAX_BATCH,
  MAX_INPUT_CHARS,
  PLATFORMS,
  X_EPOCH_MS,
  batchCsv,
  bitFields,
  decodeBatch,
  decodeSnowflake,
  extractCandidates,
  formatDelta,
  formatUtc,
  idRange,
  maxOffsetMs,
  parseEpoch,
  parseIdDigits,
  parseInstant,
  relativeTime,
  reviewDecoded,
} from "../../client/src/lib/toolkit/snowflake-decoder.ts";

let n = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
  n++;
}

t("epochs are the published constants", () => {
  assert.equal(formatUtc(X_EPOCH_MS), "2010-11-04T01:42:54.657Z");
  assert.equal(formatUtc(DISCORD_EPOCH_MS), "2015-01-01T00:00:00.000Z");
});

t("Discord developer docs vector 175928847299117063", () => {
  const d = decodeSnowflake(175928847299117063n, DISCORD_EPOCH_MS);
  assert.equal(d.offsetMs, 41944705796);
  assert.equal(d.unixMs, 1462015105796);
  assert.equal(formatUtc(d.unixMs), "2016-04-30T11:18:25.796Z");
  assert.equal(d.fieldA, 1); // internal worker ID
  assert.equal(d.fieldB, 0); // internal process ID
  assert.equal(d.sequence, 7); // increment
  assert.equal(d.machine, 32);
});

t("hand computed boundaries", () => {
  const one = decodeSnowflake(1n << 22n, X_EPOCH_MS);
  assert.equal(one.offsetMs, 1);
  assert.equal(one.unixMs, X_EPOCH_MS + 1);
  assert.equal(one.machine, 0);
  assert.equal(one.sequence, 0);

  const zero = decodeSnowflake(0n, X_EPOCH_MS);
  assert.equal(zero.unixMs, X_EPOCH_MS);

  const lows = decodeSnowflake((1n << 22n) - 1n, X_EPOCH_MS);
  assert.equal(lows.offsetMs, 0);
  assert.equal(lows.fieldA, 31);
  assert.equal(lows.fieldB, 31);
  assert.equal(lows.machine, 1023);
  assert.equal(lows.sequence, 4095);

  const maxX = decodeSnowflake((1n << 63n) - 1n, X_EPOCH_MS);
  assert.equal(maxX.offsetMs, 2 ** 41 - 1);
  assert.equal(formatUtc(maxX.unixMs), "2080-07-10T17:30:30.208Z");

  const maxD = decodeSnowflake((1n << 64n) - 1n, DISCORD_EPOCH_MS);
  assert.equal(maxD.offsetMs, 2 ** 42 - 1);
  assert.equal(formatUtc(maxD.unixMs), "2154-05-15T07:35:11.103Z");

  assert.equal(maxOffsetMs(63), 2 ** 41 - 1);
  assert.equal(maxOffsetMs(64), 2 ** 42 - 1);
});

t("synthetic X ID round trip", () => {
  // Built as ((t - epoch) << 22) | (10 << 17) | (3 << 12) | 1
  const d = decodeSnowflake(1768293366511185921n, X_EPOCH_MS);
  assert.equal(formatUtc(d.unixMs), "2024-03-14T15:09:26.535Z");
  assert.equal(d.fieldA, 10);
  assert.equal(d.fieldB, 3);
  assert.equal(d.sequence, 1);
});

t("ID range checks", () => {
  assert.equal(parseIdDigits("9223372036854775807", 63).ok, true);
  const tooBigX = parseIdDigits("9223372036854775808", 63);
  assert.equal(tooBigX.ok, false);
  assert.equal(parseIdDigits("9223372036854775808", 64).ok, true);
  assert.equal(parseIdDigits("18446744073709551615", 64).ok, true);
  assert.equal(parseIdDigits("18446744073709551616", 64).ok, false);
  assert.equal(parseIdDigits("123456789012345678901", 64).ok, false);
  const lead = parseIdDigits("000000000000000000000000042", 64);
  assert.ok(lead.ok && lead.value === 42n, "leading zeros do not count toward the digit cap");
  const zero = parseIdDigits("0000", 64);
  assert.ok(zero.ok && zero.value === 0n);
});

t("bit fields partition all 64 bits", () => {
  const id = 175928847299117063n;
  const x = bitFields(id, 63);
  assert.deepEqual(
    x.map((f) => [f.key, f.bits.length]),
    [
      ["sign", 1],
      ["time", 41],
      ["a", 5],
      ["b", 5],
      ["seq", 12],
    ],
  );
  assert.equal(x.map((f) => f.bits).join(""), id.toString(2).padStart(64, "0"));
  const d = bitFields(id, 64);
  assert.deepEqual(d.map((f) => f.bits.length), [42, 5, 5, 12]);
  assert.equal(parseInt(d[1].bits, 2), 1);
  assert.equal(parseInt(d[3].bits, 2), 7);
});

t("parseInstant", () => {
  const a = parseInstant("2024-03-01T14:30:05.250Z", "local");
  assert.ok(a.ok && a.value === Date.UTC(2024, 2, 1, 14, 30, 5, 250), "Z overrides the zone choice");
  const b = parseInstant("2024-03-01 14:30", "utc");
  assert.ok(b.ok && b.value === Date.UTC(2024, 2, 1, 14, 30));
  const c = parseInstant("2024-03-01", "utc");
  assert.ok(c.ok && c.value === Date.UTC(2024, 2, 1));
  const d = parseInstant("2024-03-01T14:30:00+02:00", "utc");
  assert.ok(d.ok && d.value === Date.UTC(2024, 2, 1, 12, 30));
  const e = parseInstant("2024-03-01T14:30:00-0530", "utc");
  assert.ok(e.ok && e.value === Date.UTC(2024, 2, 1, 20, 0));
  const f = parseInstant("2024-03-01T00:00:00.123999Z", "utc");
  assert.ok(f.ok && f.value === Date.UTC(2024, 2, 1, 0, 0, 0, 123), "sub-millisecond digits truncate");
  const g = parseInstant("2024-03-01T00:00:00.5Z", "utc");
  assert.ok(g.ok && g.value === Date.UTC(2024, 2, 1, 0, 0, 0, 500));
  const local = parseInstant("2024-03-01 14:30", "local");
  assert.ok(local.ok && local.value === new Date(2024, 2, 1, 14, 30).getTime());

  assert.equal(parseInstant("2024-02-29", "utc").ok, true, "2024 is a leap year");
  assert.equal(parseInstant("2023-02-29", "utc").ok, false);
  assert.equal(parseInstant("2100-02-29", "utc").ok, false, "2100 is not a leap year");
  assert.equal(parseInstant("2024-13-01", "utc").ok, false);
  assert.equal(parseInstant("2024-01-01T24:00", "utc").ok, false);
  assert.equal(parseInstant("2016-12-31T23:59:60Z", "utc").ok, false, "no leap second");
  assert.equal(parseInstant("1969-12-31", "utc").ok, false);
  assert.equal(parseInstant("yesterday", "utc").ok, false);
  assert.equal(parseInstant("", "utc").ok, false);
  assert.equal(parseInstant("2024-01-01T00:00+25:00", "utc").ok, false);
});

t("parseEpoch", () => {
  const ms = parseEpoch("1288834974657");
  assert.ok(ms.ok && ms.value === X_EPOCH_MS);
  const iso = parseEpoch("2010-11-04T01:42:54.657Z");
  assert.ok(iso.ok && iso.value === X_EPOCH_MS);
  const under = parseEpoch("1_420_070_400_000");
  assert.ok(under.ok && under.value === DISCORD_EPOCH_MS);
  const zero = parseEpoch("0");
  assert.ok(zero.ok && zero.value === 0);
  assert.equal(parseEpoch("-1").ok, false);
  assert.equal(parseEpoch("").ok, false);
  assert.equal(parseEpoch("1420070400000000").ok, false, "microseconds are rejected");
  assert.equal(parseEpoch("99999999999999999999").ok, false);
  assert.equal(parseEpoch("2200-01-01").ok, false);
});

t("extractCandidates", () => {
  const discord = extractCandidates(
    "https://discord.com/channels/309037367812030464/613571166430302211/1249460793393811473",
  );
  assert.deepEqual(
    discord.map((c) => ("digits" in c ? c.digits : c.error)),
    ["309037367812030464", "613571166430302211", "1249460793393811473"],
  );

  const x = extractCandidates("https://x.com/someone/status/1768293366511185921/photo/1?s=20#frag");
  assert.deepEqual(
    x.map((c) => ("digits" in c ? c.digits : null)),
    ["1768293366511185921"],
    "the 1 in /photo/1 and the 20 in ?s=20 are not IDs",
  );

  const bare = extractCandidates("1, 2;3\n\t4 (5) \"6\".");
  assert.deepEqual(bare.map((c) => ("digits" in c ? c.digits : null)), ["1", "2", "3", "4", "5", "6"]);

  const mentions = extractCandidates("<@80351110224678912> <@!80351110224678912> <#613571166430302211> <@&41771983423143936> <:blob:309037367812030464> <a:spin:309037367812030464>");
  assert.equal(mentions.length, 6);
  assert.ok(mentions.every((c) => "digits" in c));

  const bad = extractCandidates("<t:1618953630:R> 1.7682933665111859e+18 -5 hello https://example.com/about");
  assert.equal(bad.length, 5);
  assert.ok(bad.every((c) => "error" in c));
  assert.match((bad[0] as { error: string }).error, /timestamp tag/);
  assert.match((bad[1] as { error: string }).error, /floating point/);
  assert.match((bad[2] as { error: string }).error, /negative/);
  assert.match((bad[4] as { error: string }).error, /no numeric ID/);

  assert.deepEqual(extractCandidates("   \n  "), []);
});

t("decodeBatch sorts by time, computes gaps, flags duplicates", () => {
  const out = decodeBatch(
    "1768293770611404804 1768293366511185921\nhttps://x.com/i/status/1768293368889024512 1768293366511185921 nope",
    63,
    X_EPOCH_MS,
  );
  assert.equal(out.kind, "ok");
  if (out.kind !== "ok") return;
  assert.deepEqual(
    out.rows.map((r) => r.decoded.id.toString()),
    ["1768293366511185921", "1768293366511185921", "1768293368889024512", "1768293770611404804"],
  );
  assert.deepEqual(
    out.rows.map((r) => r.deltaMs),
    [null, 0, 567, 95778],
  );
  assert.deepEqual(
    out.rows.map((r) => r.duplicate),
    [false, true, false, false],
  );
  assert.equal(out.errors.length, 1);
  assert.equal(out.truncated, 0);
  assert.equal(out.rows[2].source, "https://x.com/i/status/1768293368889024512");
});

t("decodeBatch caps", () => {
  assert.equal(decodeBatch("", 63, X_EPOCH_MS).kind, "empty");
  assert.equal(decodeBatch("x".repeat(MAX_INPUT_CHARS + 1), 63, X_EPOCH_MS).kind, "error");
  const many = Array.from({ length: MAX_BATCH + 5 }, (_, i) => String(i + 1)).join(" ");
  const out = decodeBatch(many, 63, X_EPOCH_MS);
  assert.ok(out.kind === "ok" && out.rows.length === MAX_BATCH && out.truncated === 5);
  // A 100k character digit run is rejected on length, not handed to BigInt.
  const huge = decodeBatch("9".repeat(MAX_INPUT_CHARS), 64, DISCORD_EPOCH_MS);
  assert.ok(huge.kind === "ok" && huge.rows.length === 0 && huge.errors.length === 1);
  const over = decodeBatch("9223372036854775808", 63, X_EPOCH_MS);
  assert.ok(over.kind === "ok" && over.rows.length === 0 && /2\^63/.test(over.errors[0].error));
});

t("batchCsv quotes and defuses formulas", () => {
  const out = decodeBatch('175928847299117063 "=cmd|x/175928847299117063"', 64, DISCORD_EPOCH_MS);
  assert.equal(out.kind, "ok");
  if (out.kind !== "ok") return;
  const csv = batchCsv(out.rows, PLATFORMS.discord).split("\n");
  assert.equal(csv[0], "id,utc,unix_ms,delta_ms,Internal worker ID,Internal process ID,Increment,source");
  assert.equal(csv[1], "175928847299117063,2016-04-30T11:18:25.796Z,1462015105796,,1,0,7,175928847299117063");
  assert.equal(csv[2], "175928847299117063,2016-04-30T11:18:25.796Z,1462015105796,0,1,0,7,'=cmd|x/175928847299117063");
});

t("idRange", () => {
  const from = Date.UTC(2024, 0, 1);
  const to = Date.UTC(2024, 0, 1, 23, 59, 59, 999);
  const r = idRange(from, to, X_EPOCH_MS, 63);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.min, BigInt(from - X_EPOCH_MS) << 22n);
  assert.equal(r.value.max, (BigInt(to - X_EPOCH_MS) << 22n) | 0x3fffffn);
  assert.equal(decodeSnowflake(r.value.min, X_EPOCH_MS).unixMs, from);
  assert.equal(decodeSnowflake(r.value.max, X_EPOCH_MS).unixMs, to);
  assert.equal(decodeSnowflake(r.value.min - 1n, X_EPOCH_MS).unixMs, from - 1);
  assert.equal(decodeSnowflake(r.value.max + 1n, X_EPOCH_MS).unixMs, to + 1);
  // 2024-01-01T00:00:00Z on X: (1704067200000 - 1288834974657) << 22
  assert.equal(r.value.min.toString(), "1741610183685046272");

  const single = idRange(DISCORD_EPOCH_MS, DISCORD_EPOCH_MS, DISCORD_EPOCH_MS, 64);
  assert.ok(single.ok && single.value.min === 0n && single.value.max === 0x3fffffn);

  assert.equal(idRange(X_EPOCH_MS - 1, X_EPOCH_MS, X_EPOCH_MS, 63).ok, false);
  assert.equal(idRange(to, from, X_EPOCH_MS, 63).ok, false);
  const last = X_EPOCH_MS + 2 ** 41 - 1;
  const atLimit = idRange(last, last, X_EPOCH_MS, 63);
  assert.ok(atLimit.ok && atLimit.value.max === (1n << 63n) - 1n);
  assert.equal(idRange(last, last + 1, X_EPOCH_MS, 63).ok, false);
});

t("reviewDecoded", () => {
  const now = Date.UTC(2026, 9, 30);
  const pre = reviewDecoded(decodeSnowflake(20n, X_EPOCH_MS), "x", now);
  assert.equal(pre.length, 1);
  assert.match(pre[0].text, /sequential/);
  const fine = reviewDecoded(decodeSnowflake(1768293366511185921n, X_EPOCH_MS), "x", now);
  assert.equal(fine.length, 0);
  const future = reviewDecoded(decodeSnowflake(1768293366511185921n, DISCORD_EPOCH_MS + 10 ** 12), "custom", now);
  assert.ok(future.some((f) => /future/.test(f.text)));
  const top = reviewDecoded(decodeSnowflake(1n << 63n, 0), "custom", now);
  assert.ok(top.some((f) => /top bit/.test(f.text)));
});

t("formatting helpers", () => {
  assert.equal(formatDelta(0), "+0 ms");
  assert.equal(formatDelta(999), "+999 ms");
  assert.equal(formatDelta(1000), "+1.000 s");
  assert.equal(formatDelta(95778), "+1 min 35.778 s");
  assert.equal(formatDelta(3_600_000 + 61_000), "+1 h 1 min 1 s");
  assert.equal(formatDelta(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000), "+2 d 3 h 4 min");
  const now = Date.UTC(2026, 9, 30);
  assert.equal(relativeTime(now, now), "right now");
  assert.equal(relativeTime(now - 1000, now), "1 second ago");
  assert.equal(relativeTime(now + 3 * 365.25 * 86_400_000, now), "in 3 years");
});


/* ---------------- independent verifier vectors (values from Python and published sources) */

t("verifier: Wikipedia Snowflake ID example 1541815603606036480 on X", () => {
  // Wikipedia "Snowflake ID": 2022-06-28 16:07:40.105 UTC, machine ID 378, sequence 0.
  const d = decodeSnowflake(1541815603606036480n, X_EPOCH_MS);
  assert.equal(d.offsetMs, 367597485448);
  assert.equal(d.unixMs, 1656432460105);
  assert.equal(formatUtc(d.unixMs), "2022-06-28T16:07:40.105Z");
  assert.equal(d.machine, 378);
  assert.equal(d.fieldA, 11);
  assert.equal(d.fieldB, 26);
  assert.equal(d.sequence, 0);
});

t("verifier: tweet 20 is a pre-Snowflake counter at the epoch", () => {
  const d = decodeSnowflake(20n, X_EPOCH_MS);
  assert.equal(d.offsetMs, 0);
  assert.equal(d.sequence, 20);
  assert.ok(reviewDecoded(d, "x", Date.now()).some((f) => /before Snowflake/.test(f.text)));
});

t("verifier: layout maxima decode to the documented limits", () => {
  const x = decodeSnowflake((1n << 63n) - 1n, X_EPOCH_MS);
  assert.equal(formatUtc(x.unixMs), "2080-07-10T17:30:30.208Z");
  assert.deepEqual([x.fieldA, x.fieldB, x.machine, x.sequence], [31, 31, 1023, 4095]);
  const dc = decodeSnowflake((1n << 64n) - 1n, DISCORD_EPOCH_MS);
  assert.equal(formatUtc(dc.unixMs), "2154-05-15T07:35:11.103Z");
  assert.equal(dc.offsetMs, 4398046511103);
});

t("verifier: 2^63 and 2^64 limits as decimal strings", () => {
  assert.equal(parseIdDigits("9223372036854775807", 63).ok, true);
  assert.equal(parseIdDigits("9223372036854775808", 63).ok, false);
  assert.equal(parseIdDigits("9223372036854775808", 64).ok, true);
  assert.equal(parseIdDigits("18446744073709551615", 64).ok, true);
  assert.equal(parseIdDigits("18446744073709551616", 64).ok, false);
  assert.equal(parseIdDigits("99999999999999999999", 64).ok, false);
  const long = parseIdDigits("1".repeat(21), 64);
  assert.equal(long.ok, false);
  assert.match((long as { error: string }).error, /21 digits/);
  // Leading zeros do not count against the 20 digit cap.
  assert.equal(parseIdDigits("0".repeat(40) + "175928847299117063", 64).ok, true);
});

t("verifier: example IDs decode to the times the page implies", () => {
  const ex = decodeSnowflake(1768293366511185921n, X_EPOCH_MS);
  assert.equal(formatUtc(ex.unixMs), "2024-03-14T15:09:26.535Z");
  assert.deepEqual([ex.fieldA, ex.fieldB, ex.sequence], [10, 3, 1]);
  const last2023 = decodeSnowflake(1741610183681150988n, X_EPOCH_MS);
  assert.equal(formatUtc(last2023.unixMs), "2023-12-31T23:59:59.999Z");
  const msg = decodeSnowflake(1249460793393811473n, DISCORD_EPOCH_MS);
  assert.equal(formatUtc(msg.unixMs), "2024-06-09T20:31:07.004Z");
});

t("verifier: idRange reference values from Python", () => {
  const jan1 = Date.UTC(2024, 0, 1);
  const x = idRange(jan1, Date.UTC(2024, 0, 1, 23, 59, 59, 999), X_EPOCH_MS, 63);
  assert.ok(x.ok);
  if (x.ok) {
    assert.equal(x.value.min, 1741610183685046272n);
    assert.equal(x.value.max, 1741972571550646271n);
    // The last ID of 2023 sorts just under the first possible ID of 2024.
    assert.ok(1741610183681150988n < x.value.min);
  }
  const d = idRange(jan1, jan1, DISCORD_EPOCH_MS, 64);
  assert.ok(d.ok && d.value.min === 1191168914227200000n);
  // The Discord docs vector lies inside the range of its own millisecond.
  const ms = Date.UTC(2016, 3, 30, 11, 18, 25, 796);
  const r = idRange(ms, ms, DISCORD_EPOCH_MS, 64);
  assert.ok(r.ok && r.value.min === 175928847298985984n && r.value.min <= 175928847299117063n && 175928847299117063n <= r.value.max);
  // Epoch itself gives 0; one millisecond before is refused; the last millisecond is accepted, one after refused.
  const e = idRange(X_EPOCH_MS, X_EPOCH_MS, X_EPOCH_MS, 63);
  assert.ok(e.ok && e.value.min === 0n && e.value.max === (1n << 22n) - 1n);
  assert.equal(idRange(X_EPOCH_MS - 1, X_EPOCH_MS, X_EPOCH_MS, 63).ok, false);
  const lastMs = X_EPOCH_MS + maxOffsetMs(63);
  const top = idRange(lastMs, lastMs, X_EPOCH_MS, 63);
  assert.ok(top.ok && top.value.max === (1n << 63n) - 1n);
  assert.equal(idRange(lastMs + 1, lastMs + 1, X_EPOCH_MS, 63).ok, false);
  assert.equal(idRange(jan1 + 1, jan1, X_EPOCH_MS, 63).ok, false);
});

t("verifier: parseInstant offsets, leap years and truncation", () => {
  assert.deepEqual(parseInstant("2024-03-01T00:00:00+05:30", "utc"), { ok: true, value: 1709231400000 });
  assert.deepEqual(parseInstant("2024-03-01T00:00:00-0800", "local"), { ok: true, value: 1709280000000 });
  assert.deepEqual(parseInstant("2024-03-01T00:00:00.9999Z", "utc"), { ok: true, value: Date.UTC(2024, 2, 1, 0, 0, 0, 999) });
  assert.equal(parseInstant("2000-02-29", "utc").ok, true);
  assert.equal(parseInstant("2100-02-29", "utc").ok, false);
  assert.equal(parseInstant("2023-02-29", "utc").ok, false);
  assert.equal(parseInstant("2024-13-01", "utc").ok, false);
  assert.equal(parseInstant("2024-01-01T24:00", "utc").ok, false);
  assert.equal(parseInstant("2016-12-31T23:59:60Z", "utc").ok, false);
  assert.equal(parseInstant("1969-12-31", "utc").ok, false);
  assert.equal(parseInstant("2024-01-01T00:00:00+24:00", "utc").ok, false);
  assert.equal(parseInstant("yesterday", "utc").ok, false);
  assert.equal(parseInstant("", "utc").ok, false);
  assert.equal(parseInstant("2024-01-01T00:00:00." + "9".repeat(100000) + "Z", "utc").ok, true);
});

t("verifier: extraction edge cases", () => {
  const ids = (s: string) => extractCandidates(s).map((c) => ("digits" in c ? c.digits : `ERR`));
  // Discord's embed-suppressing angle brackets around a message link.
  assert.deepEqual(ids("<https://discord.com/channels/1/2/3>"), ["ERR"]);
  assert.deepEqual(
    ids("<https://discord.com/channels/309037367812030464/613571166430302211/1249460793393811473>."),
    ["309037367812030464", "613571166430302211", "1249460793393811473"],
  );
  assert.deepEqual(ids("<@!80351110224678912> <@&123456> <#654321> <a:wave:7654321>"), ["80351110224678912", "123456", "654321", "7654321"]);
  assert.deepEqual(ids('("1768293366511185921").'), ["1768293366511185921"]);
  assert.deepEqual(ids("[post](https://x.com/i/status/1768293366511185921/photo/1)"), ["1768293366511185921"]);
  // Full-width and Arabic-Indic digits are not ASCII digits and are refused.
  assert.deepEqual(ids("\uff11\uff12\uff13 \u0661\u0662"), ["ERR", "ERR"]);
  assert.deepEqual(ids("-5 1.7e18 <t:1700000000:R>"), ["ERR", "ERR", "ERR"]);
  assert.deepEqual(ids(" \n\t ,;; "), []);
  assert.deepEqual(ids('"""...'), []);
});

t("verifier: adversarial inputs stay fast and never throw", () => {
  for (const ch of [".", ")", "]", '"', "'", "(", "[", "/", "<", "9", "-", "e"]) {
    const s = ch.repeat(MAX_INPUT_CHARS - 1) + "x";
    const t0 = Date.now();
    decodeBatch(s, 63, X_EPOCH_MS);
    decodeBatch("x" + s, 64, DISCORD_EPOCH_MS);
    const took = Date.now() - t0;
    assert.ok(took < 1000, `run of ${JSON.stringify(ch)} took ${took} ms`);
  }
  const over = decodeBatch("1".repeat(MAX_INPUT_CHARS + 1), 63, X_EPOCH_MS);
  assert.equal(over.kind, "error");
  assert.equal(decodeBatch("   ", 63, X_EPOCH_MS).kind, "empty");
  const many = decodeBatch(Array.from({ length: MAX_BATCH + 5 }, (_, i) => String(4194304 * (i + 1))).join(" "), 63, X_EPOCH_MS);
  assert.ok(many.kind === "ok" && many.rows.length === MAX_BATCH && many.truncated === 5);
  // Every example ID path through the batch decoder at the latest custom epoch stays inside Date's range.
  const late = decodeBatch("18446744073709551615", 64, 4102444800000);
  assert.ok(late.kind === "ok");
  if (late.kind === "ok") assert.doesNotThrow(() => formatUtc(late.rows[0].decoded.unixMs));
});

console.log(`snowflake-decoder: ${n} test groups passed`);
