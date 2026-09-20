/**
 * umask, checked by deciding each of the twelve bits on its own rather than by
 * evaluating the same masking expression twice.
 *
 * The model is one AND NOT and that is the right shape for a page. It is the
 * wrong shape for a check, because the interesting property is WHICH BITS the
 * mask reaches: an expression can apply the mask to all twelve and still agree
 * with the model everywhere the top three were not asked for, which is almost
 * everywhere. The same expression can be written as an OR, or with the mask
 * the wrong way round, and still look right on the cases where the two happen
 * to coincide.
 *
 * So the gate below walks bit 11 down to bit 0 and decides each one from first
 * principles: is it in the mode, is it one of the nine a umask can touch, is
 * the mask set for it, and is this a directory under a setgid parent. The mode
 * is assembled from those answers and compared. Nothing on this side reuses
 * the model's arithmetic.
 *
 * The fixtures at the bottom are the measured grids.
 */
import { CASES } from "../client/src/lib/umask/data/cases";
import {
  DEFAULT_UMASK,
  PERMISSION_BITS,
  SETGID,
  SPECIAL_BITS,
  asLetters,
  asUmask,
  claimHolds,
  correctOption,
  created,
  executable,
  gid,
  masked,
  mode,
  modeText,
  removed,
  special,
} from "../client/src/lib/umask/model";
import type { Setup } from "../client/src/lib/umask/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ---------------------------------------------- one bit at a time */

/**
 * Build the created mode by asking, of each bit, whether it survives.
 *
 * Bits 0 to 8 are the nine permission bits and the only ones a umask reaches.
 * Bits 9, 10 and 11 are sticky, setgid and setuid, and a umask cannot touch
 * them however wide it is: the measured 6777 under a umask of 0777 came out
 * 6000 because of exactly this.
 */
function buildCreated(setup: Setup): number {
  let out = 0;
  for (let bit = 11; bit >= 0; bit -= 1) {
    const value = 1 << bit;
    const askedFor = (setup.asked & value) !== 0;
    const maskable = bit <= 8;
    const maskedOff = maskable && (setup.um & value) !== 0;
    if (askedFor && !maskedOff) out |= value;
  }
  /* And then the one bit a parent can add, which is not asked for at all. */
  if (setup.kind === "directory" && setup.parentSetgid) out |= 1 << 10;
  return out;
}

function buildFinal(setup: Setup): number {
  return setup.thenChmod > 0 ? setup.thenChmod : buildCreated(setup);
}

function buildGid(setup: Setup): number {
  return setup.parentSetgid ? setup.parentGid : setup.processGid;
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) {
  const where = item.slug;
  if (buildCreated(item.setup) !== created(item.setup)) {
    fail(`${where}: bit by bit the created mode is ${modeText(buildCreated(item.setup))} and the model says ${modeText(created(item.setup))}`);
  }
  if (buildFinal(item.setup) !== mode(item.setup)) {
    fail(`${where}: bit by bit the final mode is ${modeText(buildFinal(item.setup))} and the model says ${modeText(mode(item.setup))}`);
  }
  if (buildGid(item.setup) !== gid(item.setup)) {
    fail(`${where}: the group should be ${buildGid(item.setup)} and the model says ${gid(item.setup)}`);
  }
}

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
/*
  0o011 and 0o055 carry an execute bit for group and other and none for the
  owner, which is the only shape that tells "anybody can execute this" apart
  from "the owner can".
*/
const MODES = [0o000, 0o011, 0o055, 0o600, 0o640, 0o644, 0o666, 0o700, 0o750, 0o755, 0o777, 0o1777, 0o2755, 0o4755, 0o6777, 0o7777];
const MASKS = [0o000, 0o002, 0o007, 0o022, 0o027, 0o077, 0o177, 0o222, 0o700, 0o777];
for (const asked of MODES) {
  for (const um of MASKS) {
    for (const kind of ["file", "directory"] as const) {
      for (const parentSetgid of [false, true]) {
        /* 0o755 adds an execute bit no creation here would have left. */
        for (const thenChmod of [0, 0o644, 0o755]) {
          const setup: Setup = { host: "h", job: "j", kind, asked, um, parentSetgid, parentGid: 1, processGid: 0, thenChmod };
          exhaustive += 1;
          if (buildCreated(setup) !== created(setup)) {
            fail(`${modeText(asked)} under ${modeText(um)} on a ${kind}${parentSetgid ? " in a setgid parent" : ""}: bit by bit gives ${modeText(buildCreated(setup))} and the model says ${modeText(created(setup))}`);
          }
          if (buildFinal(setup) !== mode(setup)) fail(`${modeText(asked)} under ${modeText(um)}: the final mode disagrees`);
          if (buildGid(setup) !== gid(setup)) fail(`${modeText(asked)} under ${modeText(um)}: the group disagrees`);
          /* Executable is about the mode it ends up with, and about all three sets. */
          if (executable(setup) !== ((buildFinal(setup) & 0o111) !== 0)) {
            fail(`${modeText(asked)} under ${modeText(um)}${thenChmod ? ` then chmod ${modeText(thenChmod)}` : ""}: executable disagrees with the final mode`);
          }
          /*
            Two invariants that hold whatever the numbers are, and that a
            masking expression written backwards would break immediately.
          */
          if ((created(setup) & ~(asked | SETGID)) !== 0) {
            fail(`${modeText(asked)} under ${modeText(um)}: the result has a bit that was never asked for`);
          }
          if ((created(setup) & SPECIAL_BITS & ~SETGID) !== (asked & SPECIAL_BITS & ~SETGID)) {
            fail(`${modeText(asked)} under ${modeText(um)}: a umask changed a bit above the low nine`);
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
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a mode or an id`);
  }
  if (item.setup.asked > 0o7777) fail(`${where}: ${modeText(item.setup.asked)} is not a mode`);
  if (item.setup.um > PERMISSION_BITS) fail(`${where}: a umask is nine bits and ${modeText(item.setup.um)} is wider`);
  if (item.setup.thenChmod > 0o7777) fail(`${where}: ${modeText(item.setup.thenChmod)} is not a mode`);

  const held = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (held.length !== 1) fail(`${where}: ${held.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

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
      /*
        A mode in an option must be written the way the model writes it, with
        its leading zero, so the figure a reader sees is the figure the claim
        is checked against. check-option-prose compares these as strings, so
        "6000" against a claim of "06000" is a real mismatch rather than a
        formatting quibble.
      */
      if (typeof says.value === "string" && says.value !== number[1]) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim says ${says.value}`);
      }
      if (typeof says.value === "string" && !/^0[0-7]{3,4}$/.test(says.value)) {
        fail(`${where}/${option.id}: ${says.value} is not a mode written the way the model writes one`);
      }
      if (typeof says.value === "number" && says.value !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${says.value}`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== held[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asUmask(item.setup);
  if (lines.length !== 6) fail(`${where}: asUmask rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asUmask line is missing a part`);
  if (!lines[1].unit.includes("ceiling")) fail(`${where}: the mode line has to say it is a ceiling`);
  if (!lines[2].unit.includes("only these nine")) fail(`${where}: the umask line has to say how many bits it reaches`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------------ the measured grids reproduce

    open(O_CREAT) and mkdir, mode against umask:

      asked  0000  0022  0002  0077  0027  0777
       0666  0666  0644  0664  0600  0640  0000
       0777  0777  0755  0775  0700  0750  0000
       0600  0600  0600  0600  0600  0600  0000
       0644  0644  0644  0644  0600  0640  0000
       0755  0755  0755  0755  0700  0750  0000
       0640  0640  0640  0640  0600  0640  0000

      mkdir 0777 gave the 0777 row exactly.

      6777 gave 6777, 6755, 6775, 6700, 6750 and 6000.

      umask 0077, open 0666 -> 0600, then chmod 0666 -> 0666.

      parent plain  0777 gid 1   file inside 0644 gid 0   dir inside 0755 gid 0
      parent setgid 2777 gid 1   file inside 0644 gid 1   dir inside 2755 gid 1

      the shell's redirect: 0644 at 0022, 0600 at 0077, 0664 at 0002.
*/
{
  const base: Setup = { host: "the host these came from", job: "a probe", kind: "file", asked: 0o666, um: 0, parentSetgid: false, parentGid: 1, processGid: 0, thenChmod: 0 };
  const grid: [number, number[]][] = [
    [0o666, [0o666, 0o644, 0o664, 0o600, 0o640, 0o000]],
    [0o777, [0o777, 0o755, 0o775, 0o700, 0o750, 0o000]],
    [0o600, [0o600, 0o600, 0o600, 0o600, 0o600, 0o000]],
    [0o644, [0o644, 0o644, 0o644, 0o600, 0o640, 0o000]],
    [0o755, [0o755, 0o755, 0o755, 0o700, 0o750, 0o000]],
    [0o640, [0o640, 0o640, 0o640, 0o600, 0o640, 0o000]],
  ];
  const masks = [0o000, 0o022, 0o002, 0o077, 0o027, 0o777];
  for (const [asked, row] of grid) {
    masks.forEach((um, column) => {
      const s: Setup = { ...base, asked, um };
      if (created(s) !== row[column]) {
        fail(`measured: ${modeText(asked)} under ${modeText(um)} gave ${modeText(row[column])} and the model says ${modeText(created(s))}`);
      }
      const dir: Setup = { ...s, kind: "directory" };
      if (asked === 0o777 && created(dir) !== row[column]) {
        fail(`measured: mkdir ${modeText(asked)} under ${modeText(um)} gave ${modeText(row[column])} and the model says ${modeText(created(dir))}`);
      }
    });
  }

  const specials = [0o6777, 0o6755, 0o6775, 0o6700, 0o6750, 0o6000];
  masks.forEach((um, column) => {
    const s: Setup = { ...base, asked: 0o6777, um };
    if (created(s) !== specials[column]) {
      fail(`measured: ${modeText(0o6777)} under ${modeText(um)} gave ${modeText(specials[column])} and the model says ${modeText(created(s))}`);
    }
  });
  /*
    Written as a literal rather than against SPECIAL_BITS, because a test of
    which bits are out of reach cannot be written in terms of the constant that
    names them and still catch that constant being wrong.
  */
  if (PERMISSION_BITS !== 0o777) fail(`the nine permission bits are 0777 and the model says ${modeText(PERMISSION_BITS)}`);
  if (SPECIAL_BITS !== 0o7000) fail(`the three special bits are 07000 and the model says ${modeText(SPECIAL_BITS)}`);
  if (SETGID !== 0o2000) fail(`the setgid bit is 02000 and the model says ${modeText(SETGID)}`);
  if (DEFAULT_UMASK !== 0o022) fail(`the default umask measured 0022 and the model says ${modeText(DEFAULT_UMASK)}`);
  if (created({ ...base, asked: 0o6777, um: 0o777 }) !== 0o6000) fail(`measured: 06777 under 0777 left 06000`);
  if (created({ ...base, asked: 0o7777, um: 0o777 }) !== 0o7000) fail(`all three special bits survive a umask of 0777`);
  /*
    A real umask is nine bits and the case validator refuses a wider one, so
    nothing above would notice the model applying the mask to all twelve. It
    matters anyway: the narrowing to the low nine is the rule, not a tidy up,
    and a model handed a wider number must still refuse to clear the top three.
  */
  for (const wide of [0o7777, 0o2000, 0o4777, 0o1000]) {
    const s: Setup = { ...base, asked: 0o7777, um: wide };
    if ((created(s) & SPECIAL_BITS) !== 0o7000) {
      fail(`a umask of ${modeText(wide)} cleared a bit above the low nine, leaving ${modeText(created(s))}`);
    }
    const dir: Setup = { ...s, kind: "directory", parentSetgid: true };
    if ((created(dir) & SETGID) === 0) {
      fail(`a umask of ${modeText(wide)} cleared the setgid bit a parent handed down`);
    }
  }

  /* chmod. */
  const chmodded: Setup = { ...base, asked: 0o666, um: 0o077, thenChmod: 0o666 };
  if (created(chmodded) !== 0o600) fail(`measured: it was created 0600`);
  if (mode(chmodded) !== 0o666) fail(`measured: the chmod to 0666 took, so the umask did not apply to it`);

  /* The setgid parent, both halves. */
  const plainFile: Setup = { ...base, asked: 0o666, um: 0o022, parentSetgid: false };
  const sgidFile: Setup = { ...plainFile, parentSetgid: true };
  const plainDir: Setup = { ...base, kind: "directory", asked: 0o777, um: 0o022, parentSetgid: false };
  const sgidDir: Setup = { ...plainDir, parentSetgid: true };
  if (created(plainFile) !== 0o644 || created(sgidFile) !== 0o644) fail(`measured: the file was 0644 under both parents`);
  if (gid(plainFile) !== 0 || gid(sgidFile) !== 1) fail(`measured: the file was group 0 under the plain parent and group 1 under the setgid one`);
  if (created(plainDir) !== 0o755) fail(`measured: the directory was 0755 under the plain parent`);
  if (created(sgidDir) !== 0o2755) fail(`measured: the directory was 2755 under the setgid parent and the model says ${modeText(created(sgidDir))}`);
  if (gid(plainDir) !== 0 || gid(sgidDir) !== 1) fail(`measured: the directory's group followed the same rule as the file's`);

  /* The shell's redirect, which asks 0666 and never 0777. */
  for (const [um, got] of [[0o022, 0o644], [0o077, 0o600], [0o002, 0o664]] as const) {
    const s: Setup = { ...base, asked: 0o666, um };
    if (created(s) !== got) fail(`measured: a redirect at umask ${modeText(um)} gave ${modeText(got)}`);
    if (executable(s)) fail(`measured: a redirect is never executable, whatever the umask`);
  }
  if (executable({ ...base, asked: 0o666, um: 0o000 })) fail(`measured: a umask of 0000 does not make a redirect executable`);

  /* The pieces. */
  if (masked({ ...base, asked: 0o600, um: 0o022 })) fail(`0022 takes nothing from 0600`);
  if (!masked({ ...base, asked: 0o666, um: 0o022 })) fail(`0022 takes the two write bits from 0666`);
  if (removed({ ...base, asked: 0o666, um: 0o027 }) !== 0o026) fail(`0027 against 0666 removes 0026, not ${modeText(removed({ ...base, asked: 0o666, um: 0o027 }))}`);
  if (modeText(0o644) !== "0644" || modeText(0o2755) !== "02755" || modeText(0o0) !== "0000") {
    fail(`modeText reads wrong: ${modeText(0o644)}, ${modeText(0o2755)}, ${modeText(0o0)}`);
  }
  if (asLetters(0o644) !== "rw-r--r--") fail(`asLetters got 0644 wrong: ${asLetters(0o644)}`);
  if (asLetters(0o755) !== "rwxr-xr-x") fail(`asLetters got 0755 wrong: ${asLetters(0o755)}`);
  if (asLetters(0o2755) !== "rwxr-sr-x") fail(`asLetters got the setgid bit wrong: ${asLetters(0o2755)}`);
  if (asLetters(0o6000) !== "--S--S---") fail(`asLetters got a setuid file with no execute bit wrong: ${asLetters(0o6000)}`);
  if (asLetters(0o1777) !== "rwxrwxrwt") fail(`asLetters got the sticky bit wrong: ${asLetters(0o1777)}`);
  if (!special({ ...base, asked: 0o6777, um: 0o777 })) fail(`06000 still carries two of the special bits`);
  if (special({ ...base, asked: 0o777, um: 0o000 })) fail(`0777 carries none of them`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-umask: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} umask cases: deciding each of the twelve bits on its own agrees with the model on every one of them ` +
    `and on ${exhaustive} combinations of mode, mask, kind and parent; the measured grid of six modes against six masks ` +
    `reproduces for files and directories alike; the setuid, setgid and sticky bits survive a umask of 0777; chmod does not ` +
    `consult the mask; a setgid parent moves the group and leaves the mode alone, while a subdirectory inherits the bit ` +
    `itself; and no result ever carries a bit that was not asked for.`,
);
