/**
 * Exit status, checked by packing and unpacking the status word rather than by
 * reading the model's conditions twice.
 *
 * The model is a handful of arithmetic and that is the right shape for a page.
 * It is the wrong shape for a check, because everything here turns on WHICH
 * HALF of one 16 bit word a number lands in, and an expression can put it in
 * the wrong half and still produce the right $?: 128 plus a signal and an exit
 * code that happens to equal it are the same byte, which is the entire subject.
 *
 * So the gate below transcribes the macros from wait.h and builds the word the
 * way the kernel does, then takes it apart with those macros and works out what
 * a shell would print from the pieces. Nothing on this side knows what the
 * model thinks; it agrees or it does not.
 *
 * The fixtures at the bottom are the measured tables, taken in C beside bash on
 * the same host.
 */
import { CASES } from "../client/src/lib/exit/data/cases";
import {
  CORE_FLAG,
  SIGNALS,
  SIGNAL_BASE,
  SIGRTMAX,
  ambiguous,
  asByte,
  asExit,
  asHex,
  claimHolds,
  cored,
  correctOption,
  exitStatus,
  pipeStatus,
  rawStatus,
  reported,
  shellStatus,
  signalName,
  theOtherReading,
} from "../client/src/lib/exit/model";
import type { Setup } from "../client/src/lib/exit/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------- the macros, transcribed

   From sys/wait.h, which defines the word rather than describing it:

     #define __WEXITSTATUS(status)  (((status) & 0xff00) >> 8)
     #define __WTERMSIG(status)     ((status) & 0x7f)
     #define __WIFEXITED(status)    (__WTERMSIG(status) == 0)
     #define __WIFSIGNALED(status)  (((signed char) (((status) & 0x7f) + 1) >> 1) > 0)
     #define __WCOREDUMP(status)    ((status) & __WCOREFLAG)

   An exit lands in the high byte and a signal in the low seven bits, and
   WIFEXITED is simply "no signal here". That is the fact the surface is about,
   and writing it out is the only way to check it from the other side.
*/

const WEXITSTATUS = (status: number) => (status & 0xff00) >> 8;
const WTERMSIG = (status: number) => status & 0x7f;
const WIFEXITED = (status: number) => WTERMSIG(status) === 0;
const WIFSIGNALED = (status: number) => !WIFEXITED(status) && WTERMSIG(status) !== 0x7f;
const WCOREDUMP = (status: number) => (status & CORE_FLAG) !== 0;

/** Build the word the kernel would, from what actually happened. */
function pack(setup: Setup): number {
  if (setup.ending === "exited") {
    /* The C cast to a byte, then into the high half. */
    const byte = ((setup.code % 256) + 256) % 256;
    return (byte << 8) & 0xffff;
  }
  return (setup.sig & 0x7f) | (setup.coreAllowed ? CORE_FLAG : 0);
}

/** What a shell prints, worked out from the word alone. */
function shellWouldPrint(status: number): number {
  if (WIFSIGNALED(status)) return SIGNAL_BASE + WTERMSIG(status);
  return WEXITSTATUS(status);
}

/** What $? holds after the whole command, given where this process sat. */
function afterTheCommand(setup: Setup): number {
  if (setup.place === "first in a pipeline") return ((setup.nextCode % 256) + 256) % 256;
  return shellWouldPrint(pack(setup));
}

/* ------------------------------------------------------- the cases agree */

for (const item of CASES) {
  const word = pack(item.setup);
  const where = item.slug;
  if (word !== rawStatus(item.setup)) {
    fail(`${where}: packing the word gives ${asHex(word)} and the model says ${asHex(rawStatus(item.setup))}`);
  }
  if (afterTheCommand(item.setup) !== reported(item.setup)) {
    fail(`${where}: the word says $? is ${afterTheCommand(item.setup)} and the model says ${reported(item.setup)}`);
  }
  if (WIFEXITED(word) !== (item.setup.ending === "exited")) {
    fail(`${where}: WIFEXITED on the packed word disagrees with how the process ended`);
  }
  if (item.setup.ending === "exited" && WEXITSTATUS(word) !== exitStatus(item.setup)) {
    fail(`${where}: WEXITSTATUS gives ${WEXITSTATUS(word)} and the model says ${exitStatus(item.setup)}`);
  }
  if (item.setup.ending === "signaled" && WTERMSIG(word) !== item.setup.sig) {
    fail(`${where}: WTERMSIG gives ${WTERMSIG(word)} and the process was killed by ${item.setup.sig}`);
  }
  if (WCOREDUMP(word) !== cored(item.setup)) {
    fail(`${where}: the core flag in the word disagrees with the model`);
  }
}

/* ------------------------------ and so does everything the model can take */

let exhaustive = 0;
for (const code of [0, 1, 42, 125, 126, 127, 128, 129, 137, 143, 192, 193, 255, 256, 300, 512, 768, 1000, -1, -2, -256]) {
  for (const place of ["alone", "first in a pipeline", "last in a pipeline"] as const) {
    for (const nextCode of [0, 7, 256]) {
      const setup: Setup = { host: "h", job: "j", ending: "exited", code, sig: 0, coreAllowed: false, place, nextCode };
      exhaustive += 1;
      const word = pack(setup);
      if (word !== rawStatus(setup) || afterTheCommand(setup) !== reported(setup)) {
        fail(`exit(${code}) ${place}: the word gives ${asHex(word)} and $? ${afterTheCommand(setup)}, the model says ${asHex(rawStatus(setup))} and ${reported(setup)}`);
      }
      if (!WIFEXITED(word)) fail(`exit(${code}) packed into a word that does not read as an exit`);
      /* PIPESTATUS must always account for every member. */
      const pipe = pipeStatus(setup);
      if (pipe.length !== (place === "alone" ? 1 : 2)) fail(`exit(${code}) ${place}: PIPESTATUS has ${pipe.length} entries`);
      if (!pipe.includes(shellStatus(setup))) fail(`exit(${code}) ${place}: PIPESTATUS does not carry this process's own status`);
    }
  }
}
for (let sig = 1; sig <= SIGRTMAX; sig += 1) {
  for (const coreAllowed of [false, true]) {
    for (const place of ["alone", "first in a pipeline", "last in a pipeline"] as const) {
      const setup: Setup = { host: "h", job: "j", ending: "signaled", code: 0, sig, coreAllowed, place, nextCode: 0 };
      exhaustive += 1;
      const word = pack(setup);
      if (word !== rawStatus(setup) || afterTheCommand(setup) !== reported(setup)) {
        fail(`signal ${sig} core ${coreAllowed} ${place}: the word gives ${asHex(word)} and $? ${afterTheCommand(setup)}, the model says ${asHex(rawStatus(setup))} and ${reported(setup)}`);
      }
      if (!WIFSIGNALED(word)) fail(`a death by signal ${sig} packed into a word that does not read as a death`);
      /*
        WEXITSTATUS of a death is meaningless, so an exitStatus claim must never
        hold against one however its number is chosen. Nothing in the ten cases
        makes that claim about a death, so without this the guard is untested.
      */
      for (const value of [0, sig, SIGNAL_BASE + sig, WEXITSTATUS(word)]) {
        if (claimHolds({ about: "exitStatus", value }, setup)) {
          fail(`an exitStatus claim of ${value} held against a death by signal ${sig}, which has no exit status`);
        }
      }
      if (WCOREDUMP(word) !== coreAllowed) fail(`the core flag for signal ${sig} does not follow the limit`);
      /*
        And the collision, from the other side: for every signal there is an
        exit code that produces the same $?, and the model must call both of
        them ambiguous.
      */
      const twin: Setup = { host: "h", job: "j", ending: "exited", code: SIGNAL_BASE + sig, sig: 0, coreAllowed: false, place, nextCode: 0 };
      if (shellWouldPrint(pack(twin)) !== shellWouldPrint(pack(setup))) {
        fail(`exit(${SIGNAL_BASE + sig}) and a death by signal ${sig} should print the same status`);
      }
      if (!ambiguous(setup) || !ambiguous(twin)) fail(`signal ${sig} and exit(${SIGNAL_BASE + sig}) are both ambiguous and the model says otherwise`);
      if (pack(twin) === pack(setup)) fail(`the words for exit(${SIGNAL_BASE + sig}) and signal ${sig} must differ`);
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

  if (item.setup.sig < 0 || item.setup.sig > SIGRTMAX) fail(`${where}: ${item.setup.sig} is not a signal`);
  if (item.setup.ending === "signaled" && item.setup.sig === 0) fail(`${where}: a death needs a signal`);
  if (item.setup.ending === "exited" && item.setup.sig !== 0) fail(`${where}: an exit carries no signal`);
  if (item.setup.ending === "exited" && item.setup.coreAllowed) fail(`${where}: a process that exited does not dump core`);
  if (!Number.isInteger(item.setup.code) || !Number.isInteger(item.setup.nextCode)) fail(`${where}: a code must be whole`);
  if (item.setup.nextCode < 0) fail(`${where}: the neighbor's code is written as a program would pass it`);

  const held = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (held.length !== 1) fail(`${where}: ${held.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    /*
      A hexadecimal status must never open an option, because a reader and the
      prose check would both take the leading 0 of 0x8900 for the number nine
      hundred nothing. Say "the word is 0x8900" instead.
    */
    if (/^0x/i.test(option.claim.trim())) fail(`${where}/${option.id}: an option opens with a hexadecimal, which reads as zero`);
    const number = /^(\d+)(?!x)/.exec(option.claim.trim());
    if (number) {
      if (leading.has(number[1])) fail(`${where}: two options open with ${number[1]}, which a reader reads as the same answer`);
      leading.add(number[1]);
      const says = option.says as Record<string, unknown>;
      if (typeof says.value === "number" && says.value !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says.value}`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== held[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asExit(item.setup);
  if (lines.length !== 6) fail(`${where}: asExit rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asExit line is missing a part`);
  if (!lines[1].unit.includes("byte") && !lines[1].unit.includes("seven bits")) {
    fail(`${where}: the ending line has to say which half of the word it lands in`);
  }
  if (!lines[3].unit.includes("0x80")) fail(`${where}: the core line has to name the flag`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* --------------------------------------------- the measured tables reproduce

    from C, forking a child and reading the raw status:

      _exit(0)     0x0000     _exit(256)   0x0000     _exit(-1)   0xff00
      _exit(1)     0x0100     _exit(300)   0x2c00     _exit(-2)   0xfe00
      _exit(42)    0x2a00     _exit(512)   0x0000
      _exit(127)   0x7f00     _exit(768)   0x0000
      _exit(128)   0x8000     _exit(1000)  0xe800
      _exit(137)   0x8900
      _exit(255)   0xff00

      killed by SIGINT   2   0x0002      SIGTERM 15   0x000f
      killed by SIGKILL  9   0x0009      SIGRTMIN 34  0x0022
      killed by SIGSEGV 11   0x000b      SIGRTMAX 64  0x0040

      with RLIMIT_CORE raised: SIGSEGV 0x008b, SIGQUIT 0x0083, SIGABRT 0x0086

    from bash, the same endings:

      exit 256 -> 0     exit 300 -> 44     exit 1000 -> 232
      killed 2 -> 130   killed 9 -> 137    killed 11 -> 139   killed 15 -> 143
      ( exit 137 ) -> 137 and kill -9 -> 137, the same number
      a missing command -> 127, a non executable file -> 126
      false | true -> 0 with PIPESTATUS 1 0
      ( exit 42 ) | ( exit 7 ) -> 7 with PIPESTATUS 42 7
      killed | true -> 0 with PIPESTATUS 137 0
*/
{
  const base: Setup = { host: "the host these came from", job: "a child", ending: "exited", code: 0, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 };

  const exits: [number, number, number][] = [
    [0, 0x0000, 0], [1, 0x0100, 1], [42, 0x2a00, 42], [127, 0x7f00, 127], [128, 0x8000, 128],
    [137, 0x8900, 137], [255, 0xff00, 255], [256, 0x0000, 0], [300, 0x2c00, 44],
    [512, 0x0000, 0], [768, 0x0000, 0], [1000, 0xe800, 232], [-1, 0xff00, 255], [-2, 0xfe00, 254],
  ];
  for (const [code, raw, shell] of exits) {
    const s: Setup = { ...base, code };
    if (rawStatus(s) !== raw) fail(`measured: _exit(${code}) gave ${asHex(raw)} and the model says ${asHex(rawStatus(s))}`);
    if (reported(s) !== shell) fail(`measured: exit ${code} gave $? ${shell} and the model says ${reported(s)}`);
  }

  const deaths: [number, number, number][] = [
    [2, 0x0002, 130], [9, 0x0009, 137], [11, 0x000b, 139], [15, 0x000f, 143], [34, 0x0022, 162], [64, 0x0040, 192],
  ];
  for (const [sig, raw, shell] of deaths) {
    const s: Setup = { ...base, ending: "signaled", code: 0, sig };
    if (rawStatus(s) !== raw) fail(`measured: a death by ${sig} gave ${asHex(raw)} and the model says ${asHex(rawStatus(s))}`);
    if (reported(s) !== shell) fail(`measured: killed by ${sig} gave $? ${shell} and the model says ${reported(s)}`);
  }

  for (const [sig, raw] of [[11, 0x008b], [3, 0x0083], [6, 0x0086]] as const) {
    const s: Setup = { ...base, ending: "signaled", code: 0, sig, coreAllowed: true };
    if (rawStatus(s) !== raw) fail(`measured: ${signalName(sig)} with the core limit raised gave ${asHex(raw)} and the model says ${asHex(rawStatus(s))}`);
    if (!cored(s)) fail(`measured: ${signalName(sig)} wrote a core with the limit raised`);
    const without: Setup = { ...s, coreAllowed: false };
    if (rawStatus(without) !== sig) fail(`measured: ${signalName(sig)} at a core limit of 0 gave ${asHex(sig)}`);
    if (reported(s) !== reported(without)) fail(`measured: $? was the same with and without a core`);
  }

  /* The collision, in the two directions it was measured in. */
  const exited137: Setup = { ...base, code: 137 };
  const killed9: Setup = { ...base, ending: "signaled", code: 0, sig: 9 };
  if (reported(exited137) !== reported(killed9)) fail(`measured: exit 137 and a death by SIGKILL both gave 137`);
  if (rawStatus(exited137) === rawStatus(killed9)) fail(`measured: their raw statuses were 0x8900 and 0x0009`);
  if (!ambiguous(exited137) || !ambiguous(killed9)) fail(`both readings of 137 exist, so both are ambiguous`);
  if (!theOtherReading(exited137).includes("signal 9")) fail(`the other reading of exit 137 is a death by signal 9`);
  if (!theOtherReading(killed9).includes("137")) fail(`the other reading of a death by SIGKILL is an exit with 137`);
  if (theOtherReading({ ...base, code: 1 }) !== "") fail(`an unambiguous status has no other reading`);
  /*
    Written as literals rather than against the constants, because a range
    expressed in terms of SIGRTMAX moves when SIGRTMAX does and cannot catch
    SIGRTMAX being wrong. 64 is what this kernel reports and 192 is 128 plus it.
  */
  if (SIGRTMAX !== 64) fail(`SIGRTMAX measured 64 on this kernel and the model says ${SIGRTMAX}`);
  if (SIGNAL_BASE !== 128) fail(`the shell adds 128 and the model adds ${SIGNAL_BASE}`);
  if (ambiguous({ ...base, code: 128 })) fail(`128 is below the collision range`);
  if (!ambiguous({ ...base, code: 129 })) fail(`129 is the bottom of the collision range`);
  if (!ambiguous({ ...base, code: 192 })) fail(`192 is the top of the collision range, being 128 plus signal 64`);
  if (ambiguous({ ...base, code: 193 })) fail(`there is no signal 65, so 193 is unambiguous`);
  if (reported({ ...base, ending: "signaled", code: 0, sig: 64 }) !== 192) fail(`a death by signal 64 shows as 192`);

  /* Pipelines. */
  const killedFirst: Setup = { ...base, ending: "signaled", code: 0, sig: 9, place: "first in a pipeline", nextCode: 0 };
  if (reported(killedFirst) !== 0) fail(`measured: a killed process piped into true left $? at 0`);
  if (pipeStatus(killedFirst).join(" ") !== "137 0") fail(`measured: PIPESTATUS read 137 0 and the model says ${pipeStatus(killedFirst).join(" ")}`);
  const fortyTwo: Setup = { ...base, code: 42, place: "first in a pipeline", nextCode: 7 };
  if (reported(fortyTwo) !== 7) fail(`measured: ( exit 42 ) | ( exit 7 ) left $? at 7`);
  if (pipeStatus(fortyTwo).join(" ") !== "42 7") fail(`measured: PIPESTATUS read 42 7`);

  /* The pieces. */
  if (asByte(-1) !== 255 || asByte(256) !== 0 || asByte(300) !== 44) fail(`asByte is not a byte: ${asByte(-1)}, ${asByte(256)}, ${asByte(300)}`);
  if (asHex(0x8900) !== "0x8900" || asHex(9) !== "0x0009") fail(`asHex reads wrong: ${asHex(9)}`);
  if (signalName(9) !== "SIGKILL" || signalName(34) !== "SIGRTMIN+0") fail(`signalName reads wrong: ${signalName(34)}`);
  if (!Object.keys(SIGNALS).every((key) => Number(key) >= 1 && Number(key) <= 31)) fail(`SIGNALS should name only the standard ones`);
  if (shellStatus({ ...base, code: 42, place: "first in a pipeline", nextCode: 7 }) !== 42) {
    fail(`shellStatus is this process's own, whatever the pipeline reports`);
  }
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-exit: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} exit status cases: the word packed and unpacked with the wait.h macros agrees with the model on ` +
    `every one of them and on ${exhaustive} endings; an exit code truncates to a byte so 256, 512 and 768 all read as ` +
    `success; a death lands in the low seven bits where no exit code reaches, so waitpid always knows and $? never does ` +
    `for the 64 values that collide; the core flag follows the limit rather than the signal; and a pipeline reports only ` +
    `the command at its end.`,
);
