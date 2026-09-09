/**
 * The memory estimate surface, against si_mem_available as the kernel writes it.
 *
 * The layers that have each caught something on the previous surfaces, and
 * two that belong to this one.
 *
 * The first is that every quantity has to be a whole kibibyte. /proc/meminfo
 * cannot print a fraction of one, so a case with 1.2 GiB of slab expressed as
 * 1.2 * 1024 * 1024 describes a machine that does not exist and produces
 * answers no reader could reproduce. The first draft here did exactly that
 * and the figures came out ending in .2.
 *
 * The second is the min() arm. The whole surface turns on min(half the cache,
 * the low watermark) going one way on a laptop and the other on a server, so
 * the model reports which arm won and the gate checks that report against the
 * arithmetic, and that the set contains at least one case of each.
 *
 *     npx tsx scripts-ci/check-free.ts
 */

import {
  CASES,
  asFree,
  asMeminfo,
  available,
  correctOption,
  estimate,
  fits,
  human,
  matching,
  overstatedBy,
  pageCache,
  reclaimable,
  trulyAvailable,
  used,
  withoutWaiting,
} from "../client/src/lib/free/index";
import type { Setup } from "../client/src/lib/free/types";

const problems: string[] = [];

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
}

/* ── the prose figure and the checked figure ────────────────────────────── */

/*
  Checked by scripts-ci/check-option-prose.ts, generically, for every surface
  that offers options rather than for this one.
*/

/* ── 2. whole kibibytes, because /proc/meminfo cannot print anything else ── */

for (const item of CASES) {
  for (const [name, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value)) {
      problems.push(
        `${item.slug}: ${name} is ${value}, which is not a whole kibibyte. /proc/meminfo prints` +
          ` integers, so this case describes a machine that cannot exist and its answers cannot be` +
          ` reproduced on one.`,
      );
    }
    if (value < 0) problems.push(`${item.slug}: ${name} is negative`);
  }
  for (const derived of [available, trulyAvailable, withoutWaiting, used, overstatedBy]) {
    const value = derived(item.setup);
    if (!Number.isInteger(value)) {
      problems.push(`${item.slug}: ${derived.name}() returns ${value}, which is not a whole kibibyte`);
    }
  }
}

/* ── 3. si_mem_available, recomputed differently ────────────────────────── */

/*
  estimate() builds the answer in three named parts. This adds it up in one
  expression in the order the C does, with no intermediate names, which is
  the shape a transcription error survives in: a part computed correctly and
  then added to the wrong accumulator still produces three right parts.
*/
function transcribed(setup: Setup): number {
  let avail = setup.free - setup.totalReserve;
  let cache = setup.activeFile + setup.inactiveFile;
  cache -= Math.min(Math.floor(cache / 2), setup.watermarkLow);
  avail += cache;
  let recl = setup.slabReclaimable + setup.kernelMiscReclaimable;
  recl -= Math.min(Math.floor(recl / 2), setup.watermarkLow);
  avail += recl;
  return avail < 0 ? 0 : avail;
}

for (const item of CASES) {
  const again = transcribed(item.setup);
  if (available(item.setup) !== again) {
    problems.push(
      `${item.slug}: estimate() says ${available(item.setup)} and a straight transcription of` +
        ` si_mem_available says ${again}`,
    );
  }
  const e = estimate(item.setup);
  if (e.fromFree + e.fromCache + e.fromSlab !== e.available && e.available !== 0) {
    problems.push(
      `${item.slug}: the three parts sum to ${e.fromFree + e.fromCache + e.fromSlab} and available` +
        ` is ${e.available}. The page shows the parts and the total.`,
    );
  }
}

/* ── 4. the min() arm, which is the whole surface ───────────────────────── */

let halfArm = 0;
let watermarkArm = 0;
for (const item of CASES) {
  const e = estimate(item.setup);
  const cache = pageCache(item.setup);
  const wantedHeld = Math.min(Math.floor(cache / 2), item.setup.watermarkLow);
  if (e.cacheHeld !== wantedHeld) {
    problems.push(`${item.slug}: held back ${e.cacheHeld} and min(cache/2, wmark) is ${wantedHeld}`);
  }
  const wantedArm =
    Math.floor(cache / 2) <= item.setup.watermarkLow ? "half the cache" : "the low watermark";
  if (e.cacheHeldBy !== wantedArm) {
    problems.push(
      `${item.slug}: the model says the arm was "${e.cacheHeldBy}" and the arithmetic says` +
        ` "${wantedArm}". The page prints this sentence.`,
    );
  }
  if (e.cacheHeldBy === "half the cache") halfArm += 1;
  else watermarkArm += 1;
}
if (halfArm === 0 || watermarkArm === 0) {
  problems.push(
    `every case takes the same arm of min(half the cache, the low watermark)` +
      ` (${halfArm} half, ${watermarkArm} watermark). The surface is about the arm changing with` +
      ` the size of the machine, and a set that only shows one has nothing in it.`,
  );
}

/* ── 5. the estimate against itself ─────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  if (available(s) > s.total) {
    problems.push(`${item.slug}: MemAvailable is ${available(s)} on a machine with ${s.total}`);
  }
  if (s.shmem > pageCache(s)) {
    problems.push(
      `${item.slug}: Shmem is ${s.shmem} and the file lists total ${pageCache(s)}. Shmem lives on` +
        ` those lists, so it cannot exceed them.`,
    );
  }
  if (s.dirty > pageCache(s)) {
    problems.push(`${item.slug}: Dirty is larger than the page cache it is part of`);
  }
  if (trulyAvailable(s) > available(s)) {
    problems.push(`${item.slug}: trulyAvailable is above MemAvailable, which it can only reduce`);
  }
  if (withoutWaiting(s) > trulyAvailable(s)) {
    problems.push(`${item.slug}: withoutWaiting is above trulyAvailable, which it can only reduce`);
  }
  /* Swap makes shmem movable, so the overstatement is zero with swap and
     never zero without it when there is shmem to overstate. */
  const withSwap: Setup = { ...s, swapTotal: 8 * 1024 * 1024 };
  if (overstatedBy(withSwap) !== 0) {
    problems.push(`${item.slug}: still overstated with swap present, and swap is the way out`);
  }
  if (s.swapTotal === 0 && s.shmem > 0 && overstatedBy(s) === 0) {
    problems.push(
      `${item.slug}: ${s.shmem} kB of shmem on a host with no swap and the estimate is not` +
        ` overstated at all`,
    );
  }
}

/* ── 6. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "two-hundred-and-forty-megabytes-free",
    () => {
      const s = find("two-hundred-and-forty-megabytes-free");
      /* Tiny free, most of the machine available. Both halves are the case. */
      return s.free < s.total / 100 && available(s) > s.total * 0.85;
    },
    "under one percent free and over eighty five percent available, on one machine",
  ],
  [
    "twenty-gigabytes-on-a-full-machine",
    () => {
      const s = find("twenty-gigabytes-on-a-full-machine");
      return fits(s) && s.wants > s.free * 50;
    },
    "an allocation fifty times the free column succeeding",
  ],
  [
    "the-laptop-keeps-half-of-it",
    () => {
      const s = find("the-laptop-keeps-half-of-it");
      const e = estimate(s);
      return e.cacheHeldBy === "half the cache" && e.cacheHeld === Math.floor(pageCache(s) / 2);
    },
    "the half arm winning, with exactly half the cache held back",
  ],
  [
    "tmpfs-is-not-reclaimable",
    () => {
      const s = find("tmpfs-is-not-reclaimable");
      /* The estimate says yes and the truth says no. That gap is the case. */
      return s.wants <= available(s) && !fits(s) && s.swapTotal === 0;
    },
    "an allocation inside MemAvailable that does not actually fit, with no swap",
  ],
  [
    "the-same-host-with-swap",
    () => {
      const a = find("tmpfs-is-not-reclaimable");
      const b = find("the-same-host-with-swap");
      /* Identical but for the swap, and the answers differ. */
      const sameBut = { ...a, swapTotal: b.swapTotal };
      return (
        JSON.stringify(sameBut) === JSON.stringify(b) &&
        available(a) === available(b) &&
        !fits(a) &&
        fits(b)
      );
    },
    "identical to the case before it but for swap, with the same MemAvailable and the opposite answer",
  ],
  [
    "genuinely-out",
    () => {
      const s = find("genuinely-out");
      /* The cache has collapsed, which is the signal, and available is tiny. */
      return pageCache(s) < s.total / 20 && available(s) < s.total / 20 && !fits(s);
    },
    "a collapsed page cache and a MemAvailable under five percent, which is what real pressure looks like",
  ],
  [
    "available-below-free",
    () => {
      const s = find("available-below-free");
      return available(s) < s.free && pageCache(s) === 0 && reclaimable(s) === 0;
    },
    "MemAvailable strictly below MemFree, which needs no cache and no reclaimable slab",
  ],
  [
    "eight-gigabytes-of-it-is-dirty",
    () => {
      const s = find("eight-gigabytes-of-it-is-dirty");
      /* It fits, and a large part of it has to be written first. */
      return fits(s) && withoutWaiting(s) < s.wants && s.dirty > s.total / 8;
    },
    "an allocation that fits and cannot be had at once, with over an eighth of the machine dirty",
  ],
  [
    "the-used-column-is-a-residue",
    () => {
      const item = CASES.find((c) => c.slug === "the-used-column-is-a-residue")!;
      const other = find("two-hundred-and-forty-megabytes-free");
      /* The used column differs a lot between two machines whose anonymous
         memory the case says is the same. */
      return used(item.setup) > used(other) * 2 && item.setup.total === other.total;
    },
    "a used column more than twice another machine of the same size, from cache alone",
  ],
  [
    "the-estimate-is-an-estimate",
    () => {
      const s = find("the-estimate-is-an-estimate");
      /* A thin margin: it fits, and by less than a sixteenth of the machine. */
      return fits(s) && available(s) - s.wants < s.total / 16;
    },
    "fitting by a margin under a sixteenth of the machine, which is the point about admission control",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-free names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this.`,
    );
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const meminfo = asMeminfo(item.setup);
  const fields = Object.fromEntries(
    meminfo.split("\n").map((line) => {
      const [name, rest] = line.split(":");
      return [name.trim(), Number(rest.replace("kB", "").trim())];
    }),
  );
  for (const [name, want] of [
    ["MemTotal", item.setup.total],
    ["MemFree", item.setup.free],
    ["MemAvailable", available(item.setup)],
    ["Shmem", item.setup.shmem],
    ["Dirty", item.setup.dirty],
  ] as [string, number][]) {
    if (fields[name] !== want) {
      problems.push(`${item.slug}: /proc/meminfo renders ${name} as ${fields[name]}, not ${want}`);
    }
  }
  /* KReclaimable includes SReclaimable, which is how the real file reports it. */
  if (fields.KReclaimable < fields.SReclaimable) {
    problems.push(`${item.slug}: KReclaimable is below SReclaimable, which it contains`);
  }
  if (/\.\d/.test(meminfo)) problems.push(`${item.slug}: /proc/meminfo has a fractional value in it`);

  const free = asFree(item.setup);
  if (!free.includes("available")) problems.push(`${item.slug}: free -h has no available column`);
  if (!free.includes(human(available(item.setup)))) {
    problems.push(`${item.slug}: free -h does not print ${human(available(item.setup))} as available`);
  }
}

for (const [value, want] of [
  [0, "0Ki"],
  [512, "512Ki"],
  [1024, "1Mi"],
  [245760, "240Mi"],
  [30511104, "29.1Gi"],
] as [number, string][]) {
  if (human(value) !== want) problems.push(`human(${value}) is "${human(value)}" and the page needs "${want}"`);
}

/* ── 8. spread and uniqueness ───────────────────────────────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(
    `${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`,
  );
}

const seen = new Map<string, string>();
for (const item of CASES) {
  const prior = seen.get(item.breaks);
  if (prior) problems.push(`${item.slug} and ${prior} break the same belief: "${item.breaks}"`);
  seen.set(item.breaks, item.slug);
  for (const field of ["brief", "question", "why", "fix"] as const) {
    if (!item[field] || item[field].length < 20) problems.push(`${item.slug}: ${field} is thin`);
  }
}

if (problems.length) {
  console.error(`check-free: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} machines through si_mem_available, each with exactly one option that holds,` +
    ` every estimate recomputed from a straight transcription of the C, every quantity a whole` +
    ` kibibyte, both arms of the min() represented (${halfArm} half, ${watermarkArm} watermark),` +
    ` ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
