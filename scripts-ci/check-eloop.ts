/**
 * The symlink budget set, checked by walking the path rather than adding.
 *
 * The model adds two fields and compares to forty. That is the right shape for
 * a page and the wrong shape for a check, because the property that matters is
 * that ONE counter spans the whole resolution: a model that kept a counter per
 * component, or per chain, gets every single-chain case right and is wrong
 * about the ones that matter.
 *
 * So the gate below walks the path. It steps through the components in order,
 * follows each chain a link at a time against a single running counter, and
 * stops the moment that counter is spent. Whether the walk finishes falls out
 * of the walk.
 *
 * It also runs a cyclic chain for real, with a step limit as a safety net
 * rather than as the answer, so "the kernel does not detect cycles, it counts"
 * is a thing the gate demonstrates rather than a thing it asserts.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/eloop/data/cases";
import {
  ELOOP,
  MAX_TRAVERSALS,
  asWalk,
  claimHolds,
  demanded,
  correctOption,
  followsFinal,
  headroom,
  humanHops,
  reason,
  refusedByNoFollow,
  result,
  spent,
  succeeds,
  withinBudget,
} from "../client/src/lib/eloop/model";
import type { Setup } from "../client/src/lib/eloop/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ---------------------------------------------- the walk, one link at a time */

/**
 * Resolve the path against a single counter.
 *
 * One budget for the whole thing: the leading directories and then, if this
 * call follows it, the final component. A cyclic chain is walked for real and
 * only stops because the counter does, which is exactly what the kernel does.
 */
function walk(setup: Setup): { used: number; eloop: boolean; why: string } {
  let used = 0;

  /* The directories, whichever call this is. */
  for (let i = 0; i < setup.leadingHops; i += 1) {
    used += 1;
    if (used > MAX_TRAVERSALS) return { used, eloop: true, why: "budget" };
  }

  if (!followsFinal(setup)) {
    /* lstat and readlink stop here, and so does an open with O_NOFOLLOW that
       got this far, except that open reports the refusal rather than the stop. */
    if (refusedByNoFollow(setup)) return { used, eloop: true, why: "nofollow" };
    return { used, eloop: false, why: "" };
  }

  if (setup.cyclicFinal) {
    /* Walk it. It comes back round; nothing notices; the counter ends it. */
    let step = 0;
    while (step < 10_000) {
      used += 1;
      step += 1;
      if (used > MAX_TRAVERSALS) return { used, eloop: true, why: "cycle" };
    }
    fail("walk: a cyclic chain was not stopped by the counter");
    return { used, eloop: true, why: "cycle" };
  }

  for (let i = 0; i < setup.finalHops; i += 1) {
    used += 1;
    if (used > MAX_TRAVERSALS) return { used, eloop: true, why: "budget" };
  }
  return { used, eloop: false, why: "" };
}

for (const c of CASES) {
  const run = walk(c.setup);

  if (run.eloop === succeeds(c.setup)) {
    fail(`${c.slug}: the walk ${run.eloop ? "failed" : "succeeded"} and succeeds() says ${succeeds(c.setup)}`);
  }
  if (run.used !== spent(c.setup)) {
    fail(`${c.slug}: the walk spent ${run.used} and spent() says ${spent(c.setup)}`);
  }
  if (headroom(c.setup) !== MAX_TRAVERSALS - run.used) {
    fail(`${c.slug}: headroom disagrees with the walk`);
  }
  if (withinBudget(c.setup) !== run.used <= MAX_TRAVERSALS) {
    fail(`${c.slug}: withinBudget disagrees with the walk`);
  }
  /* What the path asks for, against what the walk performs. They differ on
     anything that overran, because the kernel stops rather than finishing. */
  const asked = c.setup.leadingHops + (followsFinal(c.setup) ? c.setup.finalHops : 0);
  const wantsDemanded = followsFinal(c.setup) && c.setup.cyclicFinal ? Number.POSITIVE_INFINITY : asked;
  if (demanded(c.setup) !== wantsDemanded) {
    fail(`${c.slug}: the path asks for ${wantsDemanded} and demanded() says ${demanded(c.setup)}`);
  }
  if (spent(c.setup) > MAX_TRAVERSALS + 1) {
    fail(`${c.slug}: the walk cannot perform ${spent(c.setup)} traversals on a budget of ${MAX_TRAVERSALS}`);
  }
  if (withinBudget(c.setup) && spent(c.setup) !== demanded(c.setup)) {
    fail(`${c.slug}: a walk that stayed inside the budget performed something other than what it asked for`);
  }

  const wanted =
    run.why === "cycle"
      ? "the budget, spent going round a cycle"
      : run.why === "budget"
        ? "the budget, forty traversals for the whole path"
        : run.why === "nofollow"
          ? "O_NOFOLLOW, and the last component is a link"
          : "nothing";
  if (reason(c.setup) !== wanted) {
    fail(`${c.slug}: the walk blames "${wanted}" and reason() says "${reason(c.setup)}"`);
  }

  /* Only one thing may refuse a case, so the order in reason() never decides. */
  const refusals = [
    followsFinal(c.setup) && c.setup.cyclicFinal,
    !withinBudget(c.setup) && !(followsFinal(c.setup) && c.setup.cyclicFinal),
    refusedByNoFollow(c.setup),
  ].filter(Boolean).length;
  if (refusals > 1) fail(`${c.slug}: ${refusals} things refuse this at once, so the order decides the answer`);

  if (followsFinal(c.setup) !== (c.setup.call === "open" || c.setup.call === "stat") || (c.setup.noFollow && c.setup.call === "open" && followsFinal(c.setup))) {
    if (c.setup.call === "lstat" || c.setup.call === "readlink") {
      if (followsFinal(c.setup)) fail(`${c.slug}: ${c.setup.call} is following the final component`);
    } else if (!c.setup.noFollow && !followsFinal(c.setup)) {
      fail(`${c.slug}: ${c.setup.call} is not following the final component`);
    }
  }

  if ((reason(c.setup) === "nothing") !== succeeds(c.setup)) {
    fail(`${c.slug}: reason() says "${reason(c.setup)}" and succeeds() says ${succeeds(c.setup)}`);
  }
  if (result(c.setup) !== (succeeds(c.setup) ? `${c.setup.call} returns` : `${c.setup.call} fails with ELOOP`)) {
    fail(`${c.slug}: result() reads "${result(c.setup)}"`);
  }
  if (c.setup.cyclicFinal && c.setup.finalHops < 1) {
    fail(`${c.slug}: a cycle needs at least one link in it`);
  }
  if (c.setup.noFollow && c.setup.call !== "open") {
    fail(`${c.slug}: O_NOFOLLOW is an open flag and this case is a ${c.setup.call}`);
  }
}

/* ------------------------------- one counter, however the hops are split */

/*
  The property the whole surface turns on. Split the same total across a
  leading part and a final part in every way, and the answer must depend only
  on the total. A model with a counter per component passes every single-chain
  case and fails here on the first row.
*/
{
  const base: Setup = { ...CASES[0].setup, cyclicFinal: false, noFollow: false, call: "open" };
  let rows = 0;
  let over = 0;
  for (let total = 0; total <= 60; total += 1) {
    for (let leading = 0; leading <= total; leading += 1) {
      const s: Setup = { ...base, leadingHops: leading, finalHops: total - leading };
      rows += 1;
      const run = walk(s);
      if (run.used !== total && total <= MAX_TRAVERSALS) {
        fail(`split: ${leading} + ${total - leading} spent ${run.used}`);
      }
      if (succeeds(s) !== total <= MAX_TRAVERSALS) {
        fail(`split: ${leading} + ${total - leading} = ${total} gave ${succeeds(s)}`);
      }
      /* And the split must not change the answer for a fixed total. */
      const other: Setup = { ...base, leadingHops: 0, finalHops: total };
      if (succeeds(s) !== succeeds(other)) {
        fail(`split: ${leading} + ${total - leading} disagrees with 0 + ${total}, and only the total should matter`);
      }
      if (total > MAX_TRAVERSALS) over += 1;
    }
  }
  if (rows < 1500) fail(`split: only ${rows} rows`);
  if (over < 200) fail(`split: only ${over} rows were over the budget`);
}

/* The boundary is forty exactly, from every direction. */
{
  const base: Setup = { ...CASES[0].setup, cyclicFinal: false, noFollow: false, call: "open" };
  if (MAX_TRAVERSALS !== 40) fail(`the budget is ${MAX_TRAVERSALS} and forty was measured`);
  for (const [leading, final] of [[0, 40], [40, 0], [20, 20], [13, 27], [39, 1], [1, 39]] as const) {
    if (!succeeds({ ...base, leadingHops: leading, finalHops: final })) {
      fail(`boundary: ${leading} + ${final} = 40 did not resolve`);
    }
    if (succeeds({ ...base, leadingHops: leading, finalHops: final + 1 })) {
      fail(`boundary: ${leading} + ${final + 1} = 41 resolved`);
    }
  }
}

/* -------------------------------- a cycle is caught by the counter alone */

{
  const base: Setup = { ...CASES[0].setup, noFollow: false, call: "open" };
  for (const links of [1, 2, 3, 7]) {
    const cyclic: Setup = { ...base, leadingHops: 0, finalHops: links, cyclicFinal: true };
    const run = walk(cyclic);
    if (!run.eloop) fail(`cycle: a ${links} link cycle resolved`);
    if (run.used !== MAX_TRAVERSALS + 1) {
      fail(`cycle: a ${links} link cycle stopped after ${run.used}, and a counter would stop at ${MAX_TRAVERSALS + 1}`);
    }
    /* Indistinguishable from a long straight chain, which is the point. */
    const straight: Setup = { ...base, leadingHops: 0, finalHops: MAX_TRAVERSALS + 1, cyclicFinal: false };
    if (spent(cyclic) !== spent(straight)) {
      fail(`cycle: a ${links} link cycle spent ${spent(cyclic)} and a 41 link straight chain spent ${spent(straight)}`);
    }
    if (succeeds(cyclic) !== succeeds(straight)) fail(`cycle: a cycle and a long chain differ in outcome`);
  }
  /* A cycle the call does not follow costs nothing at all. */
  for (const call of ["lstat", "readlink"] as const) {
    const s: Setup = { ...base, leadingHops: 0, finalHops: 2, cyclicFinal: true, call };
    if (!succeeds(s)) fail(`cycle: ${call} on a cyclic final component failed, and it never follows it`);
    if (spent(s) !== 0) fail(`cycle: ${call} spent ${spent(s)} on a chain it does not walk`);
  }
}

/* ------------------------------------ which calls follow, and what that costs */

{
  const base: Setup = { ...CASES[0].setup, leadingHops: 5, finalHops: 30, cyclicFinal: false, noFollow: false };
  for (const call of ["open", "stat"] as const) {
    const s: Setup = { ...base, call };
    if (!followsFinal(s)) fail(`calls: ${call} does not follow the final component`);
    if (spent(s) !== 35) fail(`calls: ${call} spent ${spent(s)} of 35`);
  }
  for (const call of ["lstat", "readlink"] as const) {
    const s: Setup = { ...base, call };
    if (followsFinal(s)) fail(`calls: ${call} follows the final component`);
    if (spent(s) !== 5) fail(`calls: ${call} spent ${spent(s)} and the directories cost 5`);
  }
  /* The exemption is one component wide: the directories are never free. */
  for (const call of ["lstat", "readlink"] as const) {
    const s: Setup = { ...base, call, leadingHops: 41, finalHops: 1 };
    if (succeeds(s)) fail(`calls: ${call} resolved a path whose directory part is 41 deep`);
    if (reason(s) !== "the budget, forty traversals for the whole path") {
      fail(`calls: ${call} past the budget on its directories blamed "${reason(s)}"`);
    }
  }
}

/* --------------------------------------------- O_NOFOLLOW, the third ELOOP */

{
  const base: Setup = { ...CASES[0].setup, leadingHops: 0, cyclicFinal: false, call: "open" };
  const link: Setup = { ...base, finalHops: 1, noFollow: true };
  if (succeeds(link)) fail(`nofollow: a single link opened with O_NOFOLLOW`);
  if (reason(link) !== "O_NOFOLLOW, and the last component is a link") {
    fail(`nofollow: blamed "${reason(link)}"`);
  }
  if (spent(link) !== 0) fail(`nofollow: it spent ${spent(link)} traversals refusing to take one`);
  /* Without the flag, the same path opens. */
  if (!succeeds({ ...link, noFollow: false })) fail(`nofollow: the same link failed without the flag`);
  /* And O_NOFOLLOW on something that is not a link changes nothing. */
  const plain: Setup = { ...base, finalHops: 0, noFollow: true };
  if (!succeeds(plain)) fail(`nofollow: it refused a final component that is not a link`);
  /*
    O_NOFOLLOW is a flag on open(). It is not a property of the path, so it has
    nothing to say about stat, lstat or readlink, and setting it alongside one
    of those must change nothing at all. No case in the set ever does, which is
    exactly why this needs saying here: a blinding that dropped the open check
    changed no case and went unnoticed until these lines existed.
  */
  for (const call of ["stat", "lstat", "readlink"] as const) {
    const flagged: Setup = { ...base, finalHops: 1, noFollow: true, call };
    const plainCall: Setup = { ...flagged, noFollow: false };
    if (refusedByNoFollow(flagged)) fail(`nofollow: it refused a ${call}, and it is a flag on open`);
    if (succeeds(flagged) !== succeeds(plainCall)) fail(`nofollow: setting it changed whether a ${call} succeeds`);
    if (spent(flagged) !== spent(plainCall)) fail(`nofollow: setting it changed what a ${call} spends`);
    if (reason(flagged) !== reason(plainCall)) fail(`nofollow: setting it changed why a ${call} failed`);
  }

  /* Three different situations, one errno. */
  const budget: Setup = { ...base, finalHops: 41, noFollow: false };
  const cycle: Setup = { ...base, finalHops: 2, cyclicFinal: true, noFollow: false };
  const three = [reason(budget), reason(cycle), reason(link)];
  if (new Set(three).size !== 3) fail(`nofollow: the three reasons are not three: ${three.join(" | ")}`);
  for (const s of [budget, cycle, link]) {
    if (succeeds(s)) fail(`nofollow: one of the three ELOOP situations succeeded`);
  }
  if (ELOOP !== 40) fail(`ELOOP is ${ELOOP} and errno 40 was measured`);
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const seenSetups = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const shape = JSON.stringify(c.setup);
  if (seenSetups.has(shape)) fail(`${c.slug}: another case has exactly this setup`);
  seenSetups.add(shape);
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

  const numbers = c.options
    .map((o) => (o.says.about === "spent" || o.says.about === "headroom" ? `${o.says.about}:${o.says.value}` : null))
    .filter((v): v is string => v !== null);
  if (new Set(numbers).size !== numbers.length) fail(`${c.slug}: two options claim the same figure`);

  const opening = c.options
    .map((o) => o.claim.match(/^([\d,]+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1].replace(/,/g, "")));
  if (new Set(opening).size !== opening.length) fail(`${c.slug}: two options open with the same number`);

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked = o.says.about === "spent" || o.says.about === "headroom" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole counts`);
    if (typeof v === "number" && v < 0) fail(`${c.slug}: ${k} is negative`);
  }

  const lines = asWalk(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asWalk rendered ${lines.length} lines and there are six figures`);
  if (!lines.some((l) => /WHOLE path/.test(l.unit))) {
    fail(`${c.slug}: asWalk does not say the budget covers the whole path`);
  }
  if (!lines.some((l) => /whichever call it is/.test(l.unit))) {
    fail(`${c.slug}: asWalk does not say every call pays for the leading directories`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* The set has to cover all three things ELOOP means, or it teaches one of them. */
{
  const reasons = new Set(CASES.map((c) => reason(c.setup)));
  for (const wanted of [
    "the budget, forty traversals for the whole path",
    "the budget, spent going round a cycle",
    "O_NOFOLLOW, and the last component is a link",
    "nothing",
  ]) {
    if (!reasons.has(wanted)) fail(`no case ends in "${wanted}", and the surface is about ELOOP meaning several things`);
  }
  const calls = new Set(CASES.map((c) => c.setup.call));
  for (const wanted of ["open", "stat", "lstat", "readlink"] as const) {
    if (!calls.has(wanted)) fail(`no case uses ${wanted}, and which calls follow is half the subject`);
  }
}

{
  if (humanHops(0) !== "no symlinks") fail(`humanHops(0) is "${humanHops(0)}"`);
  if (humanHops(1) !== "1 traversal") fail(`humanHops(1) is "${humanHops(1)}"`);
  if (humanHops(41) !== "41 traversals") fail(`humanHops(41) is "${humanHops(41)}"`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Measured on the host this was written on, kernel 6.18.44, by building chains
  of symlinks and opening them.

    a single chain of 40                       opens
    a single chain of 41                       errno 40, ELOOP
    13 + 13 + 13 = 39 across three components  opens
    14 + 13 + 13 = 40                          opens
    14 + 14 + 13 = 41                          ELOOP
    20 + 10 + 10 = 40                          opens
    20 + 11 + 10 = 41                          ELOOP
    38 +  1 +  1 = 40                          opens
    38 +  2 +  1 = 41                          ELOOP
    cycA -> cycB -> cycA                       ELOOP, the same errno
    a chain of 45: open ELOOP, stat ELOOP, readlink returns, lstat returns
    one link, plain open                       opens
    the same link with O_NOFOLLOW              ELOOP
*/
{
  const base: Setup = {
    host: "the host these came from",
    path: "measured",
    leadingHops: 0,
    finalHops: 0,
    cyclicFinal: false,
    noFollow: false,
    call: "open",
  };

  /* One chain, at the wall and one past it. */
  if (!succeeds({ ...base, finalHops: 40 })) fail(`measured: a chain of 40 opens and the model refuses it`);
  if (succeeds({ ...base, finalHops: 41 })) fail(`measured: a chain of 41 is ELOOP and the model opens it`);

  /* Three components, at three different splits, each flipping at 40 and 41. */
  const split = (a: number, b: number, c: number): Setup => ({ ...base, leadingHops: a + b, finalHops: c });
  for (const [a, b, c, ok] of [
    [13, 13, 13, true],
    [14, 13, 13, true],
    [14, 14, 13, false],
    [20, 10, 10, true],
    [20, 11, 10, false],
    [38, 1, 1, true],
    [38, 2, 1, false],
  ] as const) {
    if (succeeds(split(a, b, c)) !== ok) {
      fail(`measured: ${a} + ${b} + ${c} = ${a + b + c} ${ok ? "opens" : "is ELOOP"} and the model disagrees`);
    }
  }

  /* A two link cycle, indistinguishable from a long chain. */
  const cycle: Setup = { ...base, finalHops: 2, cyclicFinal: true };
  if (succeeds(cycle)) fail(`measured: the two link cycle is ELOOP and the model opens it`);
  if (spent(cycle) !== spent({ ...base, finalHops: 41 })) {
    fail(`measured: the cycle and the 41 chain are indistinguishable and the model spends differently`);
  }

  /* A chain of 45, by call. */
  const deep = (call: Setup["call"]): Setup => ({ ...base, finalHops: 45, call });
  if (succeeds(deep("open"))) fail(`measured: open on a chain of 45 is ELOOP`);
  if (succeeds(deep("stat"))) fail(`measured: stat on a chain of 45 is ELOOP`);
  if (!succeeds(deep("readlink"))) fail(`measured: readlink on a chain of 45 returns`);
  if (!succeeds(deep("lstat"))) fail(`measured: lstat on a chain of 45 returns`);

  /* One link, with and without the flag. */
  if (!succeeds({ ...base, finalHops: 1 })) fail(`measured: one link opens plainly`);
  if (succeeds({ ...base, finalHops: 1, noFollow: true })) fail(`measured: one link with O_NOFOLLOW is ELOOP`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-eloop: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} ELOOP cases: the path walked one link at a time against a single counter agrees with the model, ` +
    `every split of a total across components gives the same answer over 1891 rows, the boundary is forty exactly from ` +
    `six directions, a cycle is stopped by the counter rather than detected and is indistinguishable from a long chain, ` +
    `and the measured 40, 41, three splits, the cycle, the chain of 45 by call and O_NOFOLLOW all reproduce.`,
);
