/**
 * The descriptor limit set, checked by walking the chain rather than by
 * calling the same functions the page calls.
 *
 * The model answers each question with a branch. This gate answers it by
 * simulating the four checks in the order the kernel makes them, one
 * descriptor at a time where that is cheap, so a branch written backwards
 * disagrees with a walk rather than with itself.
 *
 * The fixtures at the bottom were measured on the container this was written
 * on, which turned out to be an unusually good specimen: uid 0 holding forty
 * of the forty one capabilities, with CAP_SYS_RESOURCE the one it lacks.
 */
import { CASES } from "../client/src/lib/fds/data/cases";
import {
  afterSetrlimit,
  asLimits,
  binding,
  claimHolds,
  correctOption,
  count,
  effectiveHard,
  effectiveSoft,
  frozen,
  outcome,
} from "../client/src/lib/fds/model";
import type { Case, Setup } from "../client/src/lib/fds/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------- the chain, walked */

/**
 * setrlimit as do_prlimit performs it, written out rather than branched.
 *
 * Returns the pair the process ends up with. The important part is that the
 * hard value in the call is checked whatever it is, including when it merely
 * restates the limit already held, which is the whole of the frozen case.
 */
function callSetrlimit(
  current: { soft: number; hard: number },
  asked: { soft: number; hard: number },
  nrOpen: number,
  sysResource: boolean,
): { soft: number; hard: number; refused: boolean } {
  if (asked.soft > asked.hard) return { ...current, refused: true };
  if (asked.hard > nrOpen) return { ...current, refused: true };
  if (asked.hard > current.hard && !sysResource) return { ...current, refused: true };
  return { soft: asked.soft, hard: asked.hard, refused: false };
}

function walk(setup: Setup): { soft: number; hard: number; refused: boolean; errno: "ok" | "emfile" | "enfile" } {
  let state = { soft: setup.soft, hard: setup.hard };
  let refused = false;
  if (setup.wantSoft !== null || setup.wantHard !== null) {
    const asked = { soft: setup.wantSoft ?? state.soft, hard: setup.wantHard ?? state.hard };
    const after = callSetrlimit(state, asked, setup.nrOpen, setup.sysResource);
    refused = after.refused;
    state = { soft: after.soft, hard: after.hard };
  }

  /*
    Now open descriptors one at a time, the way the kernel checks them:
    alloc_fd against the soft limit first, then __alloc_file against
    files_stat.max_files. Counted rather than compared, so an off by one in
    either bound shows up here.
  */
  let held = 0;
  let system = setup.systemOpen;
  let errno: "ok" | "emfile" | "enfile" = "ok";
  const want = Math.min(setup.needFds, 2_000_000);
  for (let i = 0; i < want; i += 1) {
    if (held >= state.soft) { errno = "emfile"; break; }
    if (system >= setup.fileMax) { errno = "enfile"; break; }
    held += 1;
    system += 1;
  }
  return { ...state, refused, errno };
}

for (const c of CASES) {
  const w = walk(c.setup);
  if (w.soft !== effectiveSoft(c.setup)) {
    fail(`${c.slug}: walking the calls gives soft ${w.soft} and effectiveSoft says ${effectiveSoft(c.setup)}`);
  }
  if (w.hard !== effectiveHard(c.setup)) {
    fail(`${c.slug}: walking the calls gives hard ${w.hard} and effectiveHard says ${effectiveHard(c.setup)}`);
  }
  /*
    frozen is not "this call was refused", it is "every call would be". Derive
    it by making the most modest call there is, one that restates exactly the
    limits already held, and seeing whether even that comes back refused.
  */
  const restate = callSetrlimit(
    { soft: c.setup.soft, hard: c.setup.hard },
    { soft: c.setup.soft, hard: c.setup.hard },
    c.setup.nrOpen,
    c.setup.sysResource,
  );
  if (restate.refused !== frozen(c.setup)) {
    fail(`${c.slug}: restating the held limits is ${restate.refused ? "refused" : "accepted"} and frozen() says ${frozen(c.setup)}`);
  }
  if (w.errno !== outcome(c.setup)) {
    fail(`${c.slug}: opening one at a time gives ${w.errno} and outcome() says ${outcome(c.setup)}`);
  }

  /*
    afterSetrlimit carries one thing the two accessors do not: whether the
    call was refused at all. A model that silently kept the old limits and a
    model that granted them are indistinguishable from soft and hard alone
    when the request happened to match what was already held.
  */
  const call = afterSetrlimit(c.setup);
  if (call.refused !== w.refused) {
    fail(`${c.slug}: afterSetrlimit says refused=${call.refused} and walking the call says ${w.refused}`);
  }
  if (call.soft !== w.soft || call.hard !== w.hard) {
    fail(`${c.slug}: afterSetrlimit gives ${call.soft}/${call.hard} and the walk gives ${w.soft}/${w.hard}`);
  }
  if (call.refused && (call.soft !== c.setup.soft || call.hard !== c.setup.hard)) {
    fail(`${c.slug}: the call was refused and the limits moved to ${call.soft}/${call.hard} anyway`);
  }
}

/*
  frozen does not depend on the capability, and no case in the set exercises
  that: the only frozen host here is an unprivileged one, so a model that
  added "&& !sysResource" would pass every case unchanged. So probe it
  directly, and derive the answer from callSetrlimit rather than restating
  frozen(), because callSetrlimit encodes the kernel's ORDER: the fs.nr_open
  test comes before the capability test and consults no credentials.

  This branch is read from kernel/sys.c rather than measured. The container
  these fixtures came from is precisely the one that cannot hold
  CAP_SYS_RESOURCE, so it cannot be asked.
*/
for (const sysResource of [false, true]) {
  const stuck: Setup = { ...CASES[0].setup, soft: 8192, hard: 20_000, nrOpen: 4096, sysResource, wantSoft: 5000, wantHard: null };
  const restate = callSetrlimit({ soft: stuck.soft, hard: stuck.hard }, { soft: stuck.soft, hard: stuck.hard }, stuck.nrOpen, sysResource);
  if (!restate.refused) {
    fail(`frozen: with a hard limit above fs.nr_open and sysResource=${sysResource}, restating the held limits was accepted`);
  }
  if (frozen(stuck) !== restate.refused) {
    fail(`frozen: sysResource=${sysResource} gives frozen()=${frozen(stuck)} where the call is ${restate.refused ? "refused" : "accepted"}`);
  }
  if (effectiveSoft(stuck) !== 8192) {
    fail(`frozen: sysResource=${sysResource} let the soft limit move to ${effectiveSoft(stuck)} from a frozen 8192`);
  }
}

/* --------------------------------------------- the shape of the ceiling */

/*
  Hold everything else still and raise what a process asks for. With the
  capability the granted limit should track the request exactly up to
  fs.nr_open and then STOP GRANTING: the kernel refuses rather than clamps, so
  past the ceiling the process keeps what it had. The line is a ramp and then
  a cliff back to the starting value, not a ramp and then a plateau, and that
  difference is the whole of case six.
*/
{
  const base: Setup = { ...CASES[0].setup, soft: 1024, hard: 1024, nrOpen: 65536, wantSoft: null };
  let granted = 0;
  let refusedPast = 0;
  for (let ask = 1024; ask <= 200_000; ask += 1024) {
    const withCap = effectiveHard({ ...base, sysResource: true, wantHard: ask });
    const expected = ask <= 65536 ? ask : 1024;
    if (withCap !== expected) {
      fail(`ceiling: asking for ${ask} with the capability gave ${withCap}, expected ${expected}`);
    }
    if (ask <= 65536) granted += 1;
    else if (withCap === 1024) refusedPast += 1;

    const without = effectiveHard({ ...base, sysResource: false, wantHard: ask });
    if (without !== 1024) fail(`ceiling: asking for ${ask} without the capability moved the hard limit to ${without}`);
  }
  if (granted < 50) fail(`ceiling: only ${granted} requests under fs.nr_open were granted`);
  if (refusedPast < 100) fail(`ceiling: only ${refusedPast} requests past fs.nr_open were refused`);
}

/*
  And lowering, which needs nothing and cannot be undone. Walk a hard limit
  down and check that each step sticks and that the way back is closed.
*/
for (let to = 1024; to <= 16_384; to += 512) {
  const lowered = effectiveHard({ ...CASES[0].setup, soft: 1024, hard: 20_000, sysResource: false, wantSoft: null, wantHard: to });
  if (lowered !== to) fail(`lowering: a hard limit of 20000 asked down to ${to} became ${lowered}`);
  const back = effectiveHard({ ...CASES[0].setup, soft: 1024, hard: to, sysResource: false, wantSoft: null, wantHard: 20_000 });
  if (back !== to) fail(`lowering: from ${to} the way back to 20000 was open, giving ${back}`);
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

  /* The page asks the model; the gate scans the claims. They must agree. */
  const asked = correctOption(c);
  if (asked?.id !== c.options[holds[0][0]].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the scan finds ${c.options[holds[0][0]].id}`);
  }

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  for (const o of c.options) {
    const opens = o.claim.match(/^(\d+)/);
    if (!opens) continue;
    const stated = Number(opens[1]);
    const checked = o.says.about === "soft" || o.says.about === "hard" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and descriptors are whole`);
  }
  if (c.setup.soft > c.setup.hard) fail(`${c.slug}: a soft limit of ${c.setup.soft} above its hard limit is not a state a process can be in`);

  /* asLimits is what the page renders, so it has to name the capability. */
  const lines = asLimits(c.setup);
  if (lines.length !== 5) fail(`${c.slug}: asLimits rendered ${lines.length} lines and there are five things to read`);
  const cap = lines.find((l) => l.name === "CAP_SYS_RESOURCE");
  if (!cap || (cap.value === "held") !== c.setup.sysResource) {
    fail(`${c.slug}: asLimits reports the capability as ${cap?.value} where the setup says ${c.setup.sysResource}`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* Every binding() answer a case relies on has to be one the function returns. */
{
  const produced = new Set(CASES.map((c) => binding(c.setup)));
  for (const c of CASES) {
    for (const o of c.options) {
      if (o.says.about !== "binding") continue;
      const reachable = ["fs.file-max", "fs.nr_open", "CAP_SYS_RESOURCE", "RLIMIT_NOFILE hard", "RLIMIT_NOFILE soft", "nothing"];
      if (!reachable.includes(o.says.name)) {
        fail(`${c.slug}/${o.id}: claims binding "${o.says.name}", which binding() can never return`);
      }
    }
  }
  if (produced.size < 3) fail(`the set only ever binds on ${[...produced].join(", ")}, so it teaches one number`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Taken on the container this was written on, kernel 6.18.44, and restored.
  fs.file-max 1645588, fs.nr_open 1048576, RLIMIT_NOFILE 20000/20000, uid 0
  with CapEff 000001fffeffffff, whose one missing bit is 24, CAP_SYS_RESOURCE.
*/
{
  const measured: Setup = {
    host: "the container these came from",
    fileMax: 1_645_588,
    nrOpen: 1_048_576,
    soft: 20_000,
    hard: 20_000,
    sysResource: false,
    wantSoft: null,
    wantHard: 1_048_577,
    needFds: 100,
    systemOpen: 367,
  };

  /* setrlimit(NOFILE, (20000, nr_open + 1)) was refused, and the limit held. */
  if (effectiveHard(measured) !== 20_000) {
    fail(`the measured refusal left the hard limit at 20000 and the model says ${effectiveHard(measured)}`);
  }

  /* With fs.nr_open at 4096, a call LOWERING soft to 5000 was refused too. */
  const lowered: Setup = { ...measured, nrOpen: 4096, wantSoft: 5000, wantHard: 20_000 };
  if (!frozen(lowered)) fail("with fs.nr_open under the held hard limit the measured call was refused and frozen() says it is not");
  if (effectiveSoft(lowered) !== 20_000) {
    fail(`the refused call left soft at 20000 and the model says ${effectiveSoft(lowered)}`);
  }

  /* Soft 200: the 200th open failed, highest descriptor handed out was 199. */
  const exhausted: Setup = { ...measured, soft: 200, wantHard: null, needFds: 201, systemOpen: 367 };
  if (outcome(exhausted) !== "emfile") fail(`the measured run gave EMFILE at 200 and the model says ${outcome(exhausted)}`);
  const justFits: Setup = { ...exhausted, needFds: 200 };
  if (outcome(justFits) !== "ok") fail(`200 descriptors fit inside a soft limit of 200 and the model says ${outcome(justFits)}`);

  /* And the machine was never close: 563 of 1645588 at the peak. */
  const share = (563 / 1_645_588) * 100;
  if (share > 0.05) fail(`the measured system wide share was 0.034 percent and this arithmetic gives ${share.toFixed(3)}`);
  if (count(1_645_588) !== "1,645,588") fail(`count() renders fs.file-max as ${count(1_645_588)}`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-fds: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} descriptor limit cases: every limit agrees with the calls walked in order, every open agrees ` +
    `with the descriptors counted one at a time, the hard limit tracks a request to fs.nr_open and stops, and the ` +
    `measured refusal, freeze and EMFILE all reproduce.`,
);
