/**
 * RSS and PSS across a fork, checked by building the page table rather than by
 * doing the same region arithmetic twice.
 *
 * The model works in runs: so many pages shared this many ways, so many shared
 * that many ways, and the kilobytes fall out of a handful of multiplications.
 * That is the right shape for a page, because those runs are what a reader has
 * to see. It is the wrong shape for a check, because the interesting property
 * is WHO MAPS WHICH FRAME, and an expression over runs can get the divisor
 * wrong in a way that only shows up when a particular run is empty. Every
 * off by one in this subject hides in a boundary between two runs.
 *
 * So the gate below allocates nothing and assumes nothing. It walks page 0 to
 * page n, asks of each process whether it maps that page and which frame it is
 * looking at, counts the distinct frames, and credits each process a page
 * divided by the number of processes holding the same frame. Resident set size
 * is then a count of frames and proportional set size is a sum of fractions,
 * which is what both of them are defined to be. Nothing on this side reuses
 * the model's runs.
 *
 * The fixtures at the bottom are the measured readings.
 */
import { CASES } from "../client/src/lib/pss/data/cases";
import {
  PAGE_BYTES,
  PSS_SHIFT,
  UNITS_PER_KIB,
  UNITS_PER_PAGE,
  alive,
  asMib,
  asPss,
  childRegions,
  claimHolds,
  copies,
  correctOption,
  grew,
  mib,
  pagesMib,
  parentRegions,
  physicalPages,
  pssChildKib,
  pssKib,
  pssParentKib,
  pssSumKib,
  rssChildPages,
  rssParentPages,
  rssSumPages,
  touched,
} from "../client/src/lib/pss/model";
import type { Setup } from "../client/src/lib/pss/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* -------------------------------------------------- one page at a time */

/**
 * The kernel's own numbers, written out rather than imported.
 *
 * A check of how PSS is accumulated cannot be written in terms of the
 * constants the model accumulates it with, or a wrong constant agrees with
 * itself. 4096 is the page size and 12 is PSS_SHIFT in fs/proc/task_mmu.c.
 */
const UNIT = 4096 * (1 << 12);
const PER_KIB = (1 << 12) * 1024;

interface Reading {
  /** Frames this process has in its page table. */
  rss: number;
  /** Its share of them, in the kernel's fixed point. */
  units: number;
}

interface Ledger {
  /** Distinct frames that exist, counted by walking them. */
  physical: number;
  parent: Reading;
  /** One per child still running, in the order they were forked. */
  children: Reading[];
}

function ledger(setup: Setup): Ledger {
  /* Who is left. A child that has exited maps nothing and holds nothing. */
  const running: number[] = [];
  for (let child = 0; child < setup.children; child += 1) {
    if (child >= setup.thenKilled) running.push(child);
  }

  /* Whether a given child reached a given page after the fork. */
  const reached = (child: number, page: number): boolean => {
    if (setup.touch === "none" || setup.touchPages === 0) return false;
    const from = setup.distinct ? child * setup.touchPages : 0;
    return page >= from && page < from + setup.touchPages;
  };

  /*
    Which frame a process is looking at for one page, or nothing at all.

    A private mapping's page tables are copied by fork, so a child holds every
    page of it from the first instruction; a write swaps one entry for a frame
    of its own. A shared anonymous mapping's page tables are not copied, so a
    child holds only what it has faulted in since, and what it faults in is the
    same frame everybody else has.
  */
  const frameOf = (who: number | null, page: number): string | null => {
    if (who === null) return `shared:${page}`;
    if (setup.kind === "shared") return reached(who, page) ? `shared:${page}` : null;
    if (setup.touch === "write" && reached(who, page)) return `copy:${who}:${page}`;
    return `shared:${page}`;
  };

  const readings = new Map<number | null, Reading>();
  readings.set(null, { rss: 0, units: 0 });
  for (const child of running) readings.set(child, { rss: 0, units: 0 });

  let physical = 0;
  for (let page = 0; page < setup.pages; page += 1) {
    /* Everyone holding the same frame, gathered before anybody is charged. */
    const holders = new Map<string, (number | null)[]>();
    for (const who of [null, ...running] as (number | null)[]) {
      const frame = frameOf(who, page);
      if (frame === null) continue;
      const list = holders.get(frame);
      if (list) list.push(who);
      else holders.set(frame, [who]);
    }
    physical += holders.size;
    for (const list of holders.values()) {
      const share = Math.floor(UNIT / list.length);
      for (const who of list) {
        const reading = readings.get(who);
        if (!reading) continue;
        reading.rss += 1;
        reading.units += share;
      }
    }
  }

  return {
    physical,
    parent: readings.get(null) as Reading,
    children: running.map((child) => readings.get(child) as Reading),
  };
}

const kib = (units: number) => Math.floor(units / PER_KIB);

/** Everything the ledger and the model both have an opinion about. */
function compare(where: string, setup: Setup): void {
  const built = ledger(setup);
  const live = setup.children - setup.thenKilled;

  if (built.physical !== physicalPages(setup)) {
    fail(`${where}: the ledger counts ${built.physical} frames and the model says ${physicalPages(setup)}`);
  }
  if (built.parent.rss !== rssParentPages(setup)) {
    fail(`${where}: the parent holds ${built.parent.rss} pages and the model says ${rssParentPages(setup)}`);
  }
  if (kib(built.parent.units) !== pssParentKib(setup)) {
    fail(`${where}: the parent's share is ${kib(built.parent.units)} kB and the model says ${pssParentKib(setup)}`);
  }
  if (built.children.length !== Math.max(0, live)) {
    fail(`${where}: ${built.children.length} children are running and the model counts ${alive(setup)}`);
  }
  if (alive(setup) !== Math.max(0, live)) {
    fail(`${where}: the model says ${alive(setup)} children are left and ${Math.max(0, live)} were not killed`);
  }

  /*
    Every survivor has to read the same, or there is no such thing as "a
    child's PSS" and a case has no business claiming one.
  */
  for (const [index, child] of built.children.entries()) {
    if (child.rss !== built.children[0].rss || child.units !== built.children[0].units) {
      fail(`${where}: child ${index} reads ${child.rss}/${kib(child.units)} and child 0 reads ${built.children[0].rss}/${kib(built.children[0].units)}, so no single figure describes a child`);
    }
  }
  const first = built.children[0] ?? { rss: 0, units: 0 };
  if (first.rss !== rssChildPages(setup)) {
    fail(`${where}: a child holds ${first.rss} pages and the model says ${rssChildPages(setup)}`);
  }
  if (kib(first.units) !== pssChildKib(setup)) {
    fail(`${where}: a child's share is ${kib(first.units)} kB and the model says ${pssChildKib(setup)}`);
  }

  const sumRss = built.parent.rss + built.children.reduce((total, child) => total + child.rss, 0);
  if (sumRss !== rssSumPages(setup)) {
    fail(`${where}: the RSS column adds to ${sumRss} pages and the model says ${rssSumPages(setup)}`);
  }
  const sumPss = kib(built.parent.units) + built.children.reduce((total, child) => total + kib(child.units), 0);
  if (sumPss !== pssSumKib(setup)) {
    fail(`${where}: the PSS column adds to ${sumPss} kB and the model says ${pssSumKib(setup)}`);
  }

  /* --- and the things that are true whatever the numbers are --- */

  const frames = built.physical * 4;
  if (sumPss > frames) {
    fail(`${where}: the PSS column adds to ${sumPss} kB over ${frames} kB of frames, and it must never exceed them`);
  }
  if (frames - sumPss > built.children.length + 2) {
    fail(`${where}: the PSS column is ${frames - sumPss} kB under ${frames}, which is more than truncation can account for`);
  }
  if (sumRss < built.physical) {
    fail(`${where}: the RSS column adds to ${sumRss} pages, under the ${built.physical} frames that exist`);
  }
  if (kib(built.parent.units) > built.parent.rss * 4) {
    fail(`${where}: the parent's PSS is over its RSS, which cannot happen`);
  }
  if (kib(first.units) > first.rss * 4) {
    fail(`${where}: a child's PSS is over its RSS, which cannot happen`);
  }
  if (built.physical < setup.pages) {
    fail(`${where}: ${built.physical} frames for a ${setup.pages} page mapping the parent has touched in full`);
  }
  if (grew(setup) !== built.physical > setup.pages) {
    fail(`${where}: the model says grew is ${grew(setup)} and the ledger counts ${built.physical} frames against ${setup.pages} pages`);
  }
  /* A frame is only ever added by a private write, never by a read or a share. */
  if (built.physical > setup.pages && !(setup.kind === "private" && setup.touch === "write")) {
    fail(`${where}: frames appeared without a private write, which nothing in this subject can do`);
  }
  if (copies(setup) !== (setup.kind === "private" && setup.touch === "write" && setup.touchPages > 0)) {
    fail(`${where}: the model disagrees with itself about whether anything is copied`);
  }
  if (touched(setup) !== (setup.touch === "none" ? 0 : setup.touchPages)) {
    fail(`${where}: the model says a child reaches ${touched(setup)} pages`);
  }

  /* The runs the model builds have to cover the mapping and nothing more. */
  const covered = (runs: { pages: number; sharers: number }[]) =>
    runs.reduce((total, one) => total + one.pages, 0);
  if (covered(parentRegions(setup)) !== setup.pages) {
    fail(`${where}: the parent's runs cover ${covered(parentRegions(setup))} of ${setup.pages} pages`);
  }
  if (live > 0 && covered(childRegions(setup)) !== rssChildPages(setup)) {
    fail(`${where}: a child's runs cover ${covered(childRegions(setup))} pages and it holds ${rssChildPages(setup)}`);
  }
  for (const run of [...parentRegions(setup), ...childRegions(setup)]) {
    if (run.pages <= 0 || run.sharers <= 0) fail(`${where}: a run of ${run.pages} pages shared ${run.sharers} ways`);
    if (run.sharers > 1 + Math.max(0, live)) fail(`${where}: a run is shared ${run.sharers} ways by ${1 + live} processes`);
  }
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
for (const pages of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 24]) {
  for (const kind of ["private", "shared"] as const) {
    for (let children = 0; children <= 5; children += 1) {
      for (const touch of ["none", "read", "write"] as const) {
        for (let touchPages = 0; touchPages <= pages; touchPages += 1) {
          for (const distinct of [false, true]) {
            /* One range each only means something if the ranges fit. */
            if (distinct && children * touchPages > pages) continue;
            for (let thenKilled = 0; thenKilled <= children; thenKilled += 1) {
              const setup: Setup = { host: "h", job: "a probe", pages, kind, children, touch, touchPages, distinct, thenKilled };
              exhaustive += 1;
              compare(`${kind} ${pages}p ${children}c ${touch} ${touchPages} ${distinct ? "each" : "same"} kill ${thenKilled}`, setup);
            }
          }
        }
      }
    }
  }
}

/* --------------------------------------------------------- the cases hold up */

const slugs = new Set<string>();
const breaks = new Set<string>();
const names = new Set<string>();
const setups = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) fail(`${where}: two cases share a slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) fail(`${where}: two cases break the same belief, "${item.breaks}"`);
  breaks.add(item.breaks);
  if (names.has(item.name)) fail(`${where}: two cases share a name`);
  names.add(item.name);
  const shape = JSON.stringify(item.setup);
  if (setups.has(shape)) fail(`${where}: two cases have the same setup, so one of them teaches nothing new`);
  setups.add(shape);

  for (const [field, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a count`);
  }
  if (item.setup.touchPages > item.setup.pages) fail(`${where}: a child reaches past the end of the mapping`);
  if (item.setup.distinct && item.setup.children * item.setup.touchPages > item.setup.pages) {
    fail(`${where}: one range each does not fit in the mapping`);
  }
  if (item.setup.thenKilled > item.setup.children) fail(`${where}: more children exited than were forked`);
  if (item.setup.pages === 0) fail(`${where}: a mapping of no pages teaches nothing`);

  const held = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (held.length !== 1) fail(`${where}: ${held.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  /*
    A case may not claim a figure the kernel would print differently.

    Every number here is a whole mebibyte, which is only possible when each
    page in the answer is divided by a power of two and the kernel's fixed
    point loses nothing. A case whose answer needs a third of a page states a
    figure a reader would not find on a machine, and this refuses it rather
    than explaining it away in the prose.
  */
  const answer = held[0];
  if (answer && "value" in answer.says && typeof answer.says.value === "number") {
    if (!Number.isInteger(answer.says.value)) {
      fail(`${where}/${answer.id}: the answer is ${answer.says.value} MiB, and only a whole one is a figure a machine prints here`);
    }
  }

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    const number = /^(\d+)/.exec(option.claim.trim());
    if (number) {
      if (leading.has(number[1])) fail(`${where}: two options open with ${number[1]}, which a reader reads as the same answer`);
      leading.add(number[1]);
      const says = option.says as Record<string, unknown>;
      if (typeof says.value !== "number") {
        fail(`${where}/${option.id}: the prose opens with a figure and the claim states none`);
      } else if (says.value !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says.value}`);
      }
      /* Every figure on this surface is mebibytes, so the prose has to say so. */
      if (!option.claim.trim().startsWith(`${number[1]} MiB`)) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and does not say MiB, and a reader has to guess the unit`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== held[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asPss(item.setup);
  if (lines.length !== 6) fail(`${where}: asPss rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asPss line is missing a part`);
  if (!lines[1].unit.includes("page table")) fail(`${where}: the mapping line has to say what fork does with the page tables`);
  if (!lines[2].unit.includes("map it now")) fail(`${where}: the children line has to say how many processes map it`);
  if (!lines[5].unit.includes("processes")) fail(`${where}: the last line has to say the divisor is a count of processes`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------------ the measured readings reproduce

    A 64 MiB mapping, touched in full by the parent, then forked three ways.
    Rss and Pss in kB for that one mapping, out of /proc/self/smaps:

      mapping    what the children did        parent Pss   child Pss   child Rss
      private    nothing                           16384       16384       65536
      private    read 16 MiB, the same range       16384       16384       65536
      private    wrote 16 MiB, the same range      28672       28672       65536
      private    wrote 16 MiB, one range each      20479       31402       65536
      shared     nothing                           65536           0           0
      shared     read 16 MiB, the same range       53248        4096       16384
      shared     wrote 16 MiB, the same range      53248        4096       16384
      shared     wrote 16 MiB, one range each      40960        8192       16384

    One child rather than three, writing 16 MiB: 40960 both sides.
    No children at all: 65536, and the parent has it to itself.
    Three children and one of them killed: 21845 each. Two killed: 32768.

    AnonPages moved by 65380, 114524 and 114016 kB for the three private rows
    that have a figure, against mappings of 65536: the copies are the only new
    memory. The shared rows moved it by a few hundred kB of noise, because a
    shared anonymous mapping is shmem and is not counted as anonymous at all.

    And ps, on the first row: RSS 66948, 65828, 65828, 65828 and PSS 16492,
    16435, 16435, 16435. 258.2 MiB against 64.3 MiB for the same four
    processes and the same 64 MiB.
*/
{
  const base: Setup = { host: "the host these came from", job: "a probe", pages: 16384, kind: "private", children: 3, touch: "none", touchPages: 0, distinct: false, thenKilled: 0 };
  const measured: [string, Partial<Setup>, number, number, number][] = [
    ["private, children idle", {}, 16384, 16384, 65536],
    ["private, children read the same range", { touch: "read", touchPages: 4096 }, 16384, 16384, 65536],
    ["private, children write the same range", { touch: "write", touchPages: 4096 }, 28672, 28672, 65536],
    ["private, children write one range each", { touch: "write", touchPages: 4096, distinct: true }, 20479, 31402, 65536],
    ["shared, children idle", { kind: "shared" }, 65536, 0, 0],
    ["shared, children read the same range", { kind: "shared", touch: "read", touchPages: 4096 }, 53248, 4096, 16384],
    ["shared, children write the same range", { kind: "shared", touch: "write", touchPages: 4096 }, 53248, 4096, 16384],
    ["shared, children write one range each", { kind: "shared", touch: "write", touchPages: 4096, distinct: true }, 40960, 8192, 16384],
    ["private, one child writing", { children: 1, touch: "write", touchPages: 4096 }, 40960, 40960, 65536],
    ["private, no children", { children: 0 }, 65536, 0, 0],
    ["private, one of three exited", { thenKilled: 1 }, 21845, 21845, 65536],
    ["private, two of three exited", { thenKilled: 2 }, 32768, 32768, 65536],
  ];
  for (const [label, over, parent, child, childRss] of measured) {
    const setup: Setup = { ...base, ...over };
    if (pssParentKib(setup) !== parent) fail(`measured: ${label} gave the parent ${parent} kB and the model says ${pssParentKib(setup)}`);
    if (pssChildKib(setup) !== child) fail(`measured: ${label} gave a child ${child} kB and the model says ${pssChildKib(setup)}`);
    if (rssChildPages(setup) * 4 !== childRss) fail(`measured: ${label} gave a child ${childRss} kB resident and the model says ${rssChildPages(setup) * 4}`);
  }

  /*
    The measured 20479 is the one number here that is not the exact division,
    and it is the reason the model carries the kernel's fixed point rather
    than dividing in floating point. Twelve thousand two hundred and eighty
    eight pages shared three ways lose a third of a unit each, which is enough
    to fall one kilobyte short of 20480.
  */
  const thirds: Setup = { ...base, touch: "write", touchPages: 4096, distinct: true };
  if (pssParentKib(thirds) !== 20479) fail(`the fixed point is not being applied: a third of a page is not exact`);
  if (Math.round((12288 * 4) / 3 + (4096 * 4) / 4) !== 20480) fail(`the exact division of the same runs is 20480`);
  if (PAGE_BYTES !== 4096) fail(`the page size is 4096 and the model says ${PAGE_BYTES}`);
  if (PSS_SHIFT !== 12) fail(`PSS_SHIFT is 12 and the model says ${PSS_SHIFT}`);
  if (UNITS_PER_PAGE !== 16777216) fail(`a page is 16777216 units and the model says ${UNITS_PER_PAGE}`);
  if (UNITS_PER_KIB !== 4194304) fail(`a kilobyte is 4194304 units and the model says ${UNITS_PER_KIB}`);
  if (pssKib([{ pages: 16384, sharers: 4 }]) !== 16384) fail(`16384 pages shared four ways is 16384 kB`);
  /*
    Three pages shared three ways is exactly one page, which is four
    kilobytes. The kernel reports three, because each page loses a third of a
    unit and three of them lose a whole one. The smallest complete example of
    the thing that makes the 20479 above.
  */
  if (pssKib([{ pages: 3, sharers: 3 }]) !== 3) fail(`three pages shared three ways reports 3 kB, and the model says ${pssKib([{ pages: 3, sharers: 3 }])}`);
  if (pssKib([{ pages: 4, sharers: 4 }]) !== 4) fail(`four pages shared four ways divides exactly and reports 4 kB`);
  if (pssKib([]) !== 0) fail(`no pages is no kilobytes`);

  /* ps on the same four processes. */
  const four: Setup = { ...base };
  if (pagesMib(rssSumPages(four)) !== 256) fail(`four processes at 64 MiB add up to 256 MiB of RSS`);
  if (mib(pssSumKib(four)) !== 64) fail(`and to 64 MiB of PSS, which is what exists`);
  if (pagesMib(physicalPages(four)) !== 64) fail(`64 MiB of frames`);
  if (grew(four)) fail(`nothing was allocated by the fork`);

  /* The reader facing bits. */
  if (asMib(64) !== "64 MiB") fail(`asMib got a whole number wrong: ${asMib(64)}`);
  if (asMib(21.3333) !== "21.33 MiB") fail(`asMib got a fraction wrong: ${asMib(21.3333)}`);
  if (pagesMib(256) !== 1) fail(`256 pages is one mebibyte`);
  if (mib(1024) !== 1) fail(`1024 kilobytes is one mebibyte`);
  const lines = asPss(base);
  if (!lines[0].value.startsWith("64 MiB")) fail(`the first line should name the mapping: ${lines[0].value}`);
  if (!lines[1].value.includes("MAP_PRIVATE")) fail(`the second line should name the flags: ${lines[1].value}`);
  if (!asPss({ ...base, kind: "shared" })[1].value.includes("MAP_SHARED")) fail(`and for a shared mapping too`);
  if (!asPss({ ...base, thenKilled: 1 })[2].value.includes("since exited")) fail(`the children line should say some have gone`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-pss: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} pss cases: building the page table one page at a time and counting who holds which frame agrees ` +
    `with the model on every one of them and on ${exhaustive} combinations of size, flags, children, touch and exits; ` +
    `the measured readings for twelve of those reproduce to the kilobyte, including the 20479 the kernel's fixed point ` +
    `produces where the exact division gives 20480; no PSS column ever adds up to more than the frames that exist, and ` +
    `no frame ever appears without a private write.`,
);
