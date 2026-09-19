/**
 * The shared memory surface, against a measurement rather than a belief.
 *
 * Three things this gate exists to hold in place.
 *
 * The failure is SIGBUS at first touch, not an error at allocation. That was
 * measured on an 8 MiB tmpfs: mapping a 32 MiB file succeeds and the process
 * dies after touching exactly 8388608 bytes. So the set has to contain a case
 * whose whole point is that the mmap succeeded, and the gate checks that the
 * boundary is the filesystem size rather than anything else: the unit that
 * dies is the first whose share does not fit, recomputed here by handing out
 * memory one unit at a time.
 *
 * The tmpfs is memory. Its pages are charged to the cgroup, so a workload
 * whose /dev/shm is large enough can still be killed, and the gate requires a
 * case of each failure so the set does not teach that Bus error is the only
 * way this ends.
 *
 * And the knob is per platform. Kubernetes has no shm-size field at all,
 * compose has a per service key, and a host defaults to half of RAM. The gate
 * checks the set covers the platforms and that the rendered invocation is the
 * one that platform would actually use.
 *
 *     npx tsx scripts-ci/check-shm.ts
 */

import {
  CASES,
  DOCKER_DEFAULT_SHM_MIB,
  asInvocation,
  asSymptom,
  chargedMiB,
  correctOption,
  demandMiB,
  diesAtUnit,
  failure,
  fits,
  holds,
  human,
  matching,
  needsShmMiB,
  overMemoryLimit,
  shmKnob,
  unitLabel,
} from "../client/src/lib/shm/index";
import type { Setup } from "../client/src/lib/shm/types";

const problems: string[] = [];
const whole = (n: number) => Number.isInteger(n) && n >= 0;

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
  for (const option of item.options) {
    if (holds(option.says, item.setup) !== hits.includes(option)) {
      problems.push(`${item.slug}: holds() and matching() disagree about ${option.id}`);
    }
    if (option.says.about === "nothing" && holds(option.says, item.setup)) problems.push(`${item.slug}: a claim about nothing holds`);
  }
}

/* ── 2. the documented default, and inputs a runtime could produce ──────── */

if (DOCKER_DEFAULT_SHM_MIB !== 64) {
  problems.push(`DOCKER_DEFAULT_SHM_MIB is ${DOCKER_DEFAULT_SHM_MIB}; the Docker docs say "If you omit the size entirely, the system uses 64m."`);
}
if (shmKnob("kubernetes") !== null) problems.push("shmKnob says Kubernetes has a shm-size field, and it does not");
if (shmKnob("docker") !== "--shm-size" || shmKnob("compose") !== "shm_size") problems.push("the docker and compose knobs are not named the way their documentation names them");

for (const item of CASES) {
  const s = item.setup;
  for (const field of ["shmMiB", "perUnitMiB", "units", "residentMiB", "hostMiB"] as const) {
    if (!whole(s[field])) problems.push(`${item.slug}: ${field} is ${s[field]}, not a whole number of MiB or units`);
  }
  if (s.shmMiB < 1) problems.push(`${item.slug}: a /dev/shm of ${s.shmMiB} MiB`);
  if (s.units < 1) problems.push(`${item.slug}: no units of work`);
  if (s.memoryLimitMiB !== null && !whole(s.memoryLimitMiB)) problems.push(`${item.slug}: a fractional memory limit`);
  if (s.memoryLimitMiB !== null && s.memoryLimitMiB < s.residentMiB) {
    problems.push(`${item.slug}: the memory limit is below the resident set, so it would never have started`);
  }
  if (s.hostMiB < s.shmMiB) problems.push(`${item.slug}: /dev/shm is larger than the host's memory`);
  /* A container on a host with less RAM than its limit is a configuration nobody ships. */
  if (s.memoryLimitMiB !== null && s.memoryLimitMiB > s.hostMiB) problems.push(`${item.slug}: the memory limit exceeds the host's memory`);
  /* Zero per unit is legitimate exactly once: the case where a flag moves the data elsewhere. */
  if (s.perUnitMiB === 0 && !item.slug.includes("flag")) {
    problems.push(`${item.slug}: a unit of work costing no shared memory, which only the flag case should`);
  }
}

/* ── 3. the boundary, recomputed by handing memory out one unit at a time ─ */

/*
  diesAtUnit() is a floor and a plus one. This hands each unit its share in
  turn and stops at the first that does not fit, which is what the page fault
  does, and gets the off-by-one wrong in a different direction if the closed
  form is wrong.
*/
function handOut(s: Setup): number | null {
  let used = 0;
  for (let i = 1; i <= s.units; i += 1) {
    if (used + s.perUnitMiB > s.shmMiB) return i;
    used += s.perUnitMiB;
  }
  return null;
}

for (const item of CASES) {
  const s = item.setup;
  if (diesAtUnit(s) !== handOut(s)) {
    problems.push(`${item.slug}: diesAtUnit() says ${diesAtUnit(s)} and handing memory out one unit at a time says ${handOut(s)}`);
  }
  if (fits(s) !== (diesAtUnit(s) === null)) problems.push(`${item.slug}: fits() and diesAtUnit() disagree`);
  if (demandMiB(s) !== s.units * s.perUnitMiB) problems.push(`${item.slug}: demand is not units times per unit`);
  /* The unit that dies is inside the set of units, and the one before it fits. */
  const died = diesAtUnit(s);
  if (died !== null) {
    if (died < 1 || died > s.units) problems.push(`${item.slug}: dies at unit ${died} of ${s.units}`);
    if (s.perUnitMiB > 0 && (died - 1) * s.perUnitMiB > s.shmMiB) {
      problems.push(`${item.slug}: the unit before the one that dies does not fit either, so the boundary is wrong`);
    }
  }
}

/* ── 4. the tmpfs is memory ─────────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  /* What is charged is what is written, capped by the filesystem, plus the rest of the process. */
  const want = s.residentMiB + Math.min(demandMiB(s), s.shmMiB);
  if (chargedMiB(s) !== want) problems.push(`${item.slug}: charged ${chargedMiB(s)} MiB where the resident set plus the shared memory in use is ${want}`);
  if (overMemoryLimit(s) !== (s.memoryLimitMiB !== null && chargedMiB(s) > s.memoryLimitMiB)) {
    problems.push(`${item.slug}: overMemoryLimit disagrees with its own definition`);
  }
  if (s.memoryLimitMiB === null && overMemoryLimit(s)) problems.push(`${item.slug}: over a memory limit that does not exist`);
  /* A tmpfs costs nothing until it is written to: raising it alone must not change the charge. */
  const roomier: Setup = { ...s, shmMiB: s.shmMiB * 4 };
  if (fits(s) && chargedMiB(roomier) !== chargedMiB(s)) {
    problems.push(`${item.slug}: quadrupling a /dev/shm that already fits changed what is charged against the limit`);
  }
  /* And the failure ordering: an OOM kill is only possible where a limit exists. */
  if (failure(s) === "oom-killed" && s.memoryLimitMiB === null) problems.push(`${item.slug}: OOM killed with no memory limit`);
  if (failure(s) === "oom-killed" && !overMemoryLimit(s)) problems.push(`${item.slug}: OOM killed while inside the memory limit`);
  if (failure(s) === "sigbus" && fits(s)) problems.push(`${item.slug}: SIGBUS on a workload that fits`);
  if (failure(s) === "none" && (!fits(s) || overMemoryLimit(s))) problems.push(`${item.slug}: no failure on a workload that does not fit or is over its limit`);
  if (needsShmMiB(s) < demandMiB(s)) problems.push(`${item.slug}: the recommended /dev/shm is smaller than the peak demand`);
}

/*
  Which ending comes first, on the one unit that would cross both limits.

  No case in the set crosses both, so nothing above notices if the model picks
  an order rather than deriving one. Getting the two limits to bite on the
  same unit takes arithmetic: the tmpfs runs out at unit 9 (8 units of 8 MiB
  fill 64 MiB), and the cgroup has 68 MiB of headroom, which the 9th unit's
  72 MiB also crosses. Neither is crossed at unit 8.

  SIGBUS is the right answer, and not by convention. The page fault that
  cannot find a page in the tmpfs fails before any page is charged to the
  cgroup, so the process is signalled for memory it never received. You are
  not OOM killed for an allocation that did not happen.
*/
const crossesBoth: Setup = {
  platform: "docker",
  workload: "both:latest",
  shmMiB: 64,
  perUnitMiB: 8,
  unit: "worker",
  units: 40,
  memoryLimitMiB: 2048,
  residentMiB: 1980,
  hostMiB: 65_536,
};
{
  const s = crossesBoth;
  const atEight = 8 * s.perUnitMiB;
  const atNine = 9 * s.perUnitMiB;
  /* The setup is only a proof if it really is the same unit, so check that here rather than trusting the comment. */
  if (!(atEight <= s.shmMiB && s.residentMiB + atEight <= (s.memoryLimitMiB ?? 0))) {
    problems.push("the ordering proof is built wrong: unit 8 already crosses one of the limits");
  }
  if (!(atNine > s.shmMiB && s.residentMiB + atNine > (s.memoryLimitMiB ?? 0))) {
    problems.push("the ordering proof is built wrong: unit 9 does not cross both limits");
  }
  if (failure(s) !== "sigbus") {
    problems.push(
      `on the unit that crosses both limits the answer is SIGBUS, because a page fault the tmpfs cannot satisfy ` +
        `charges nothing to the cgroup, and this model says ${failure(s)}`,
    );
  }
}

/* And the other direction, where only the cgroup is crossed, still ends in a kill. */
const cgroupOnly: Setup = { ...crossesBoth, shmMiB: 1024, memoryLimitMiB: 2040 };
if (failure(cgroupOnly) !== "oom-killed") {
  problems.push(`a workload with room in its tmpfs that crosses memory.max should be OOM killed, and this model says ${failure(cgroupOnly)}`);
}

/* ── 5. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "the-headless-browser",
    () => {
      const s = find("the-headless-browser");
      return s.shmMiB === DOCKER_DEFAULT_SHM_MIB && diesAtUnit(s) === 9 && s.hostMiB === 65_536 && failure(s) === "sigbus";
    },
    "the ninth renderer dying on a 64 MiB default while the host has 64 GiB free",
  ],
  [
    "the-mmap-that-succeeded",
    () => {
      const s = find("the-mmap-that-succeeded");
      return s.units === 1 && s.perUnitMiB > s.shmMiB && failure(s) === "sigbus" && diesAtUnit(s) === 1;
    },
    "a single mapping larger than the whole filesystem, which maps fine and dies on the first page past the end",
  ],
  [
    "the-field-that-does-not-exist",
    () => {
      const s = find("the-field-that-does-not-exist");
      const docker = find("the-headless-browser");
      /* Same workload, same numbers, and a platform with nowhere to put the fix. */
      return s.platform === "kubernetes" && shmKnob(s.platform) === null && s.memoryLimitMiB !== null && demandMiB(s) === demandMiB(docker) && !fits(s);
    },
    "the same overflow on a platform with no shm-size field and a memory limit that does not help",
  ],
  [
    "the-tmpfs-was-big-enough",
    () => {
      const s = find("the-tmpfs-was-big-enough");
      return fits(s) && failure(s) === "oom-killed" && chargedMiB(s) > (s.memoryLimitMiB ?? 0) && failure({ ...s, memoryLimitMiB: 4096 }) === "none";
    },
    "a workload that fits its tmpfs and is killed anyway, and stops being killed when the limit is raised",
  ],
  [
    "parallel-query",
    () => {
      const s = find("parallel-query");
      return s.units === 24 && demandMiB(s) === 96 && needsShmMiB(s) === 128 && !fits(s);
    },
    "six workers across four queries wanting 96 MiB of a 64 MiB default, and 128m being the size to set",
  ],
  [
    "the-dataloader",
    () => {
      const s = find("the-dataloader");
      return s.units === 8 && demandMiB(s) === 192 && diesAtUnit(s) === 3 && s.hostMiB === 262_144;
    },
    "eight prefetching workers dying on the third, on a host with 256 GiB",
  ],
  [
    "the-flag-that-moves-it",
    () => {
      const s = find("the-flag-that-moves-it");
      return s.perUnitMiB === 0 && demandMiB(s) === 0 && fits(s) && failure(s) === "none" && s.shmMiB === DOCKER_DEFAULT_SHM_MIB;
    },
    "the flag taking the demand to zero without changing the tmpfs, which is what makes it look like a fix",
  ],
  [
    "the-host-that-never-fails",
    () => {
      const s = find("the-host-that-never-fails");
      const contained = find("the-headless-browser");
      /* Same program, same demand, and five hundred times the filesystem. */
      return s.platform === "host" && demandMiB(s) === demandMiB(contained) && fits(s) && !fits(contained) && s.shmMiB === Math.floor(s.hostMiB / 2);
    },
    "the same workload surviving outside a container because /dev/shm there is half of RAM",
  ],
  [
    "the-compose-file",
    () => {
      const s = find("the-compose-file");
      return s.platform === "compose" && shmKnob(s.platform) === "shm_size" && s.shmMiB === DOCKER_DEFAULT_SHM_MIB && diesAtUnit(s) === 9;
    },
    "a second service in a file that already sets shm_size, left at the default and dying at the same ninth unit",
  ],
  [
    "sized-for-the-peak",
    () => {
      const s = find("sized-for-the-peak");
      return failure(s) === "none" && s.shmMiB > demandMiB(s) && s.memoryLimitMiB !== null && chargedMiB(s) < s.memoryLimitMiB && chargedMiB(s) < s.residentMiB + s.shmMiB;
    },
    "a tmpfs sized above the peak costing only what is written to it",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-shm names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(`${slug} no longer has the property it exists to teach: ${what}. The exactly-one check cannot see this.`);
  }
}

/* ── 6. what the page renders ───────────────────────────────────────────── */

const readings: [number, string][] = [
  [64, "64m"],
  [256, "256m"],
  [1024, "1g"],
  [2048, "2g"],
];
for (const [mib, want] of readings) {
  if (human(mib) !== want) problems.push(`human(${mib}) reads "${human(mib)}" rather than "${want}"`);
}

for (const item of CASES) {
  const s = item.setup;
  const invocation = asInvocation(s);
  if (s.platform === "docker" && !invocation.includes("docker run")) problems.push(`${item.slug}: a docker case does not render a docker run`);
  if (s.platform === "compose" && !invocation.includes("services:")) problems.push(`${item.slug}: a compose case does not render a compose file`);
  if (s.platform === "kubernetes") {
    if (!invocation.includes("containers:")) problems.push(`${item.slug}: a Kubernetes case does not render a pod spec`);
    if (invocation.includes("--shm-size") || invocation.includes("shm_size:")) {
      problems.push(`${item.slug}: the Kubernetes spec renders a knob that platform does not have`);
    }
  }
  if (s.shmMiB !== DOCKER_DEFAULT_SHM_MIB && s.platform === "docker" && !invocation.includes(`--shm-size=${human(s.shmMiB)}`)) {
    problems.push(`${item.slug}: /dev/shm is not the default and the invocation does not say so`);
  }
  if (s.memoryLimitMiB !== null && s.platform === "docker" && !invocation.includes(`--memory=${human(s.memoryLimitMiB)}`)) {
    problems.push(`${item.slug}: a memory limit is set and the docker invocation does not show it`);
  }

  const symptom = asSymptom(s);
  const mode = failure(s);
  if ((mode === "sigbus") !== symptom.includes("Bus error")) problems.push(`${item.slug}: the symptom and the model disagree about the Bus error`);
  if ((mode === "oom-killed") !== symptom.includes("out of memory")) problems.push(`${item.slug}: the symptom and the model disagree about the OOM kill`);
  if (mode === "sigbus" && !symptom.includes("dmesg says nothing")) {
    problems.push(`${item.slug}: a Bus error case does not point out that dmesg is empty, which is the whole diagnostic difficulty`);
  }
  if (unitLabel(s, diesAtUnit(s)).length < 3) problems.push(`${item.slug}: the unit label renders as nothing useful`);
}

/* ── 7. spread, uniqueness and coverage ─────────────────────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(`${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`);
}

const failures = new Set(CASES.map((item) => failure(item.setup)));
for (const want of ["sigbus", "oom-killed", "none"] as const) {
  if (!failures.has(want)) problems.push(`no case ends "${want}"; the set would teach that there is only one way this goes wrong`);
}
const platforms = new Set(CASES.map((item) => item.setup.platform));
for (const want of ["docker", "compose", "kubernetes", "host"] as const) {
  if (!platforms.has(want)) problems.push(`no case runs on ${want}, and the knob differs on every one of them`);
}
const defaults = CASES.filter((item) => item.setup.shmMiB === DOCKER_DEFAULT_SHM_MIB).length;
if (defaults < 5) problems.push(`only ${defaults} cases are at the 64 MiB default; the surface is about how often that number is the one in play`);

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
  console.error(`check-shm: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} containers against /dev/shm, each with exactly one option that holds,` +
    ` every boundary recomputed by handing memory out one unit at a time, the tmpfs charge checked` +
    ` against the cgroup on every case, all four platforms and all three endings present,` +
    ` ${defaults} cases sitting at the 64 MiB default, ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
