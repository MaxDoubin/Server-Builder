/**
 * The receive buffer set, checked against the kernel's steps rather than the
 * model's expressions.
 *
 * Every number here is one of two shapes: a value that passes through
 * sock_setsockopt, or a page count somebody has to multiply. So the gate
 * performs the setsockopt path as separate steps, sweeps the requested size
 * across the whole range to check the shape of the result, and re-derives
 * every page count by counting pages rather than by scaling.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/rcvbuf/data/cases";
import {
  PAGE_BYTES,
  asSysctl,
  autotuning,
  backfired,
  band,
  ceilingBytes,
  claimHolds,
  correctOption,
  demandPages,
  highMarkBytes,
  highMarkIfBytes,
  human,
  reportedBytes,
} from "../client/src/lib/rcvbuf/model";
import type { Setup } from "../client/src/lib/rcvbuf/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------ setsockopt, step by step */

/**
 * sock_setsockopt's path for SO_RCVBUF, written as the three things it does
 * rather than as one expression: clamp to the sysctl, double for overhead,
 * and never go under the floor. Doing it in steps means a clamp applied after
 * the doubling, which is the natural way to get this wrong, disagrees here.
 */
function throughSetsockopt(asked: number, rmemMax: number): number {
  let value = asked;
  if (value > rmemMax) value = rmemMax;
  value = value * 2;
  const floor = 2048 * 2;
  if (value < floor) value = floor;
  return value;
}

for (const c of CASES) {
  const s = c.setup;
  if (s.asks === null) {
    if (reportedBytes(s) !== s.tcpRmem[1]) {
      fail(`${c.slug}: an untouched socket reports ${reportedBytes(s)} and tcp_rmem's default is ${s.tcpRmem[1]}`);
    }
    if (!autotuning(s)) fail(`${c.slug}: nothing called setsockopt and autotuning is reported off`);
    if (ceilingBytes(s) !== s.tcpRmem[2]) {
      fail(`${c.slug}: an autotuned ceiling is ${ceilingBytes(s)} where tcp_rmem's maximum is ${s.tcpRmem[2]}`);
    }
  } else {
    const stepped = throughSetsockopt(s.asks, s.rmemMax);
    if (stepped !== reportedBytes(s)) {
      fail(`${c.slug}: walking setsockopt gives ${stepped} and reportedBytes says ${reportedBytes(s)}`);
    }
    if (autotuning(s)) fail(`${c.slug}: setsockopt was called and autotuning is reported on`);
    if (ceilingBytes(s) !== stepped) {
      fail(`${c.slug}: a set socket's ceiling is ${ceilingBytes(s)} and its buffer is ${stepped}`);
    }
  }
}

/* -------------------------------------------------- the shape of the clamp */

/*
  Sweep what a program asks for across the whole range. The reported value has
  to be a straight doubling up to net.core.rmem_max and then flat, and it must
  never fall. A clamp applied after the doubling gives a plateau at rmem_max
  rather than at twice it, and a missing clamp gives a line that never bends.
*/
{
  const rmemMax = 4_194_304;
  const base: Setup = { ...CASES[0].setup, rmemMax, asks: 0 };
  let previous = -1;
  let doubling = 0;
  let flat = 0;
  for (let ask = 4096; ask <= rmemMax * 3; ask += 4096) {
    const got = reportedBytes({ ...base, asks: ask });
    const expected = Math.min(ask, rmemMax) * 2;
    if (got !== expected) fail(`clamp: asking ${ask} reported ${got}, expected ${expected}`);
    if (got < previous) fail(`clamp: the reported size fell from ${previous} to ${got} as the request grew`);
    if (ask <= rmemMax) doubling += 1;
    else if (got === rmemMax * 2) flat += 1;
    previous = got;
  }
  if (doubling < 500) fail(`clamp: only ${doubling} requests under rmem_max were doubled`);
  if (flat < 500) fail(`clamp: only ${flat} requests over rmem_max landed on the plateau`);
  if (reportedBytes({ ...base, asks: rmemMax * 10 }) !== rmemMax * 2) {
    fail("clamp: a very large request did not land on twice rmem_max");
  }
}

/* ------------------------------------------------- pages, counted not scaled */

/*
  Re-derive tcp_mem's high mark by adding up pages one mebibyte at a time,
  rather than by multiplying. A model that had the unit wrong, or the page
  size wrong, disagrees with a count.
*/
for (const c of CASES) {
  const pages = c.setup.tcpMemPages[2];
  let bytes = 0;
  for (let i = 0; i < pages; i += 256) bytes += Math.min(256, pages - i) * PAGE_BYTES;
  if (bytes !== highMarkBytes(c.setup)) {
    fail(`${c.slug}: counting ${pages} pages gives ${bytes} and highMarkBytes says ${highMarkBytes(c.setup)}`);
  }
  /* And the misreading has to stay available, because a case turns on it. */
  if (highMarkIfBytes(c.setup) !== pages) {
    fail(`${c.slug}: the bytes misreading should be the raw ${pages} and is ${highMarkIfBytes(c.setup)}`);
  }
  if (highMarkBytes(c.setup) <= highMarkIfBytes(c.setup)) {
    fail(`${c.slug}: reading tcp_mem as pages should give a larger number than reading it as bytes`);
  }
}

/*
  The arithmetic that settles the unit question. As pages the high mark is a
  sensible slice of memory; as bytes it is a rounding error. That is the whole
  argument, so assert the gap rather than the claim.
*/
{
  const s = CASES[0].setup;
  const ram = s.ramGiB * 1024 ** 3;
  const asPages = (100 * highMarkBytes(s)) / ram;
  const asBytes = (100 * highMarkIfBytes(s)) / ram;
  if (asPages < 1 || asPages > 50) fail(`units: as pages the high mark is ${asPages.toFixed(2)}% of memory, which is not a number anybody chose`);
  if (asBytes > 0.01) fail(`units: as bytes the high mark is ${asBytes.toFixed(4)}% of memory, which is too plausible for this argument`);
}

/* ------------------------------------------------------- the three bands */

/*
  Walk the charge from nothing to past the high mark and check the bands come
  in order, each one exactly once, changing only at the marks.
*/
{
  const s = CASES[0].setup;
  const [low, pressure, high] = s.tcpMemPages;
  const seen: string[] = [];
  let previous = "";
  for (let pages = 0; pages <= high + 20_000; pages += 500) {
    const here = band({ ...s, chargedPages: pages });
    if (here !== previous) { seen.push(here); previous = here; }
  }
  const expected = ["below low", "charging normally", "under pressure", "above high"];
  if (seen.join(" -> ") !== expected.join(" -> ")) {
    fail(`bands: the walk went ${seen.join(" -> ")} and should go ${expected.join(" -> ")}`);
  }
  for (const [mark, name] of [[low, "charging normally"], [pressure, "under pressure"], [high, "above high"]] as const) {
    if (band({ ...s, chargedPages: mark }) !== name) fail(`bands: at exactly ${mark} pages the band is not "${name}"`);
    if (band({ ...s, chargedPages: mark - 1 }) === name) fail(`bands: one page under ${mark} is already "${name}"`);
  }
}

/* --------------------------------------------- backfired, against the pair */

/*
  Tuning backfires exactly when the ceiling it fixes is under what autotuning
  could have reached. Derive that from the two sysctls rather than from the
  function, across a sweep of both.
*/
for (const rmemMax of [1 << 18, 1 << 20, 1 << 22, 1 << 24, 1 << 26]) {
  for (const tcpMax of [1 << 20, 1 << 22, 1 << 25, 1 << 26]) {
    const s: Setup = { ...CASES[0].setup, rmemMax, tcpRmem: [4096, 131072, tcpMax], asks: rmemMax };
    const best = Math.min(rmemMax, rmemMax) * 2;
    const worse = best < tcpMax;
    if (backfired(s) !== worse) {
      fail(`backfired: rmem_max ${rmemMax} against tcp_rmem max ${tcpMax} gives ${backfired(s)}, expected ${worse}`);
    }
    if (backfired({ ...s, asks: null })) fail(`backfired: an untouched socket cannot have backfired`);
  }
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const previous = seenBreaks.get(c.breaks);
  if (previous) fail(`${c.slug}: breaks the same belief as ${previous}, "${c.breaks}"`);
  seenBreaks.set(c.breaks, c.slug);

  const holds = c.options.map((o, i) => [i, claimHolds(o.says, c.setup)] as const).filter(([, v]) => v);
  if (holds.length !== 1) {
    fail(`${c.slug}: ${holds.length} options hold, and a case has exactly one answer`);
    continue;
  }
  answerAt.push(holds[0][0]);

  const asked = correctOption(c);
  if (asked?.id !== c.options[holds[0][0]].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the scan finds ${c.options[holds[0][0]].id}`);
  }

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  /*
    Two options claiming the same value is how a case ends up with two right
    answers, and it happened here: a distractor reading "twice the new
    rmem_max" worked out to the same number as tcp_rmem's maximum.
  */
  const values = c.options
    .map((o) => (o.says.about === "reported" || o.says.about === "ceiling" ? o.says.bytes : null))
    .filter((v): v is number => v !== null);
  if (new Set(values).size !== values.length) {
    fail(`${c.slug}: two options claim the same byte count, so one of them is a right answer by accident`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^(\d+)/);
    if (!opens) continue;
    const stated = Number(opens[1]);
    const checked = o.says.about === "reported" || o.says.about === "ceiling" ? o.says.bytes : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole units`);
  }
  const [lo, pr, hi] = c.setup.tcpMemPages;
  if (!(lo <= pr && pr <= hi)) fail(`${c.slug}: tcp_mem's marks are out of order: ${lo} ${pr} ${hi}`);
  if (c.setup.tcpRmem[0] > c.setup.tcpRmem[1] || c.setup.tcpRmem[1] > c.setup.tcpRmem[2]) {
    fail(`${c.slug}: tcp_rmem's three values are out of order`);
  }

  /* asSysctl is what the page renders, and it has to name the units. */
  const lines = asSysctl(c.setup);
  if (lines.length !== 3) fail(`${c.slug}: asSysctl rendered ${lines.length} lines and there are three sysctls`);
  if (!lines.some((l) => /PAGES/.test(l.unit))) fail(`${c.slug}: asSysctl does not say which of the three is in pages`);
  if (demandPages(c.setup) < 0) fail(`${c.slug}: demandPages is negative`);
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* ------------------------------------------------------ measured fixtures */

/*
  Taken on the host this was written on, kernel 6.18.44, socket options only
  so there was nothing to restore. tcp_mem 191742 255659 383484, tcp_rmem
  4096 131072 33554432, net.core.rmem_max 4194304, MemTotal 15.72 GiB.
*/
{
  const measured: Setup = {
    host: "the host these came from",
    ramGiB: 16,
    tcpMemPages: [191_742, 255_659, 383_484],
    tcpRmem: [4096, 131_072, 33_554_432],
    rmemMax: 4_194_304,
    asks: null,
    sockets: 42,
    chargedPages: 0,
  };

  /* A fresh socket reported 131072, which is tcp_rmem[1] and is NOT doubled. */
  if (reportedBytes(measured) !== 131_072) {
    fail(`the measured fresh socket reported 131072 and the model says ${reportedBytes(measured)}`);
  }

  /* Setting that same 131072 reported 262144, so the doubling is on the set. */
  if (reportedBytes({ ...measured, asks: 131_072 }) !== 262_144) {
    fail(`setting 131072 measured 262144 and the model says ${reportedBytes({ ...measured, asks: 131_072 })}`);
  }

  /* Asking 65536 reported 131072, the same doubling on a smaller value. */
  if (reportedBytes({ ...measured, asks: 65_536 }) !== 131_072) {
    fail(`setting 65536 measured 131072 and the model says ${reportedBytes({ ...measured, asks: 65_536 })}`);
  }

  /* Asking 16 MiB reported 8 MiB, clamped to twice rmem_max, no error. */
  if (reportedBytes({ ...measured, asks: 16_777_216 }) !== 8_388_608) {
    fail(`setting 16 MiB measured 8 MiB and the model says ${reportedBytes({ ...measured, asks: 16_777_216 })}`);
  }

  /* And the trap: the tuned ceiling is a quarter of the autotuned one. */
  const tuned = ceilingBytes({ ...measured, asks: 4_194_304 });
  const loose = ceilingBytes(measured);
  if (loose / tuned !== 4) {
    fail(`the measured host makes a tuned socket 4x smaller and the model says ${(loose / tuned).toFixed(1)}x`);
  }

  /* 42 established connections and sockstat TCP mem 0: under the low mark. */
  if (band(measured) !== "below low") {
    fail(`the measured quiet host read 0 pages and the model puts it in "${band(measured)}"`);
  }

  if (human(1_570_791_424) !== "1.46 GiB") fail(`human() renders the measured high mark as ${human(1_570_791_424)}`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-rcvbuf: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} receive buffer cases: setsockopt agrees with its own steps, the clamp is a doubling then a ` +
    `plateau at twice rmem_max, tcp_mem's marks agree with pages counted one by one, the three bands come in order, ` +
    `and the measured undoubled default, doubled set, silent clamp and fourfold backfire all reproduce.`,
);
