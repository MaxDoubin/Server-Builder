import type { Claim, Setup } from "./types";

/** The nine permission bits, which are the only ones a umask can touch. */
export const PERMISSION_BITS = 0o777;

/** The setuid, setgid and sticky bits, which it cannot. */
export const SPECIAL_BITS = 0o7000;

/** The setgid bit, which a directory hands down to its subdirectories. */
export const SETGID = 0o2000;

/** The default on this host, and on most of them. */
export const DEFAULT_UMASK = 0o022;

/**
 * A mode written the way a program passes it, so it reads as a mode.
 *
 * A leading zero and at least three octal digits, so 0644 reads as a mode and
 * 02755 keeps the bit above them. The first version chose the padding width
 * from whether the mode exceeded 0777, which can never matter: the octal string
 * is already four characters exactly when it does.
 */
export function modeText(mode: number): string {
  return `0${mode.toString(8).padStart(3, "0")}`;
}

/**
 * The mode at the moment of creation.
 *
 * mode AND NOT umask, and the umask is only the low nine bits, so the setuid,
 * setgid and sticky bits pass through however wide the mask is. Measured at 42
 * combinations of mode and umask with no exceptions, including 6777 under a
 * umask of 0777, which left 6000 behind.
 */
export function created(setup: Setup): number {
  const masked = setup.asked & ~(setup.um & PERMISSION_BITS);
  /* A directory under a setgid parent is given the bit as well, after the mask. */
  const inherited = setup.kind === "directory" && setup.parentSetgid ? SETGID : 0;
  return masked | inherited;
}

/**
 * The mode it ends up with.
 *
 * chmod does not consult the umask, measured directly: a file created 0600
 * under a umask of 0077 became 0666 the moment it was chmodded to 0666.
 */
export function mode(setup: Setup): number {
  return setup.thenChmod > 0 ? setup.thenChmod : created(setup);
}

/**
 * The group that owns it.
 *
 * A setgid parent gives its own group to everything created inside, which is
 * the whole reason the bit exists. Measured with a parent owned by group 1 and
 * a process in group 0: the file came out group 1 under the setgid parent and
 * group 0 under the plain one, with the same mode either way.
 */
export function gid(setup: Setup): number {
  return setup.parentSetgid ? setup.parentGid : setup.processGid;
}

/** The bits that were asked for and did not survive. */
export function removed(setup: Setup): number {
  return setup.asked & (setup.um & PERMISSION_BITS);
}

/** Whether the umask took anything away at all. */
export function masked(setup: Setup): boolean {
  return removed(setup) !== 0;
}

/** Whether anybody can execute the result. */
export function executable(setup: Setup): boolean {
  return (mode(setup) & 0o111) !== 0;
}

/** Whether the result carries any of the three bits a umask cannot reach. */
export function special(setup: Setup): boolean {
  return (mode(setup) & SPECIAL_BITS) !== 0;
}

/** A mode as the nine letters ls would print, plus the special bits. */
export function asLetters(value: number): string {
  const rwx = ["r", "w", "x"];
  let out = "";
  for (let group = 0; group < 3; group += 1) {
    for (let bit = 0; bit < 3; bit += 1) {
      out += (value >> (8 - group * 3 - bit)) & 1 ? rwx[bit] : "-";
    }
  }
  /* The three that sit over the top of the execute positions. */
  const chars = out.split("");
  if (value & 0o4000) chars[2] = chars[2] === "x" ? "s" : "S";
  if (value & SETGID) chars[5] = chars[5] === "x" ? "s" : "S";
  if (value & 0o1000) chars[8] = chars[8] === "x" ? "t" : "T";
  return chars.join("");
}

/** The lines a reader would gather before answering. */
export function asUmask(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "creating", value: `${setup.kind}, by ${setup.job}`, unit: `on ${setup.host}` },
    { name: "mode argument", value: modeText(setup.asked), unit: "a ceiling the umask can lower and nothing can raise" },
    { name: "umask", value: modeText(setup.um), unit: `clears these bits, and only these nine: ${asLetters(setup.um & PERMISSION_BITS)}` },
    { name: "parent directory", value: setup.parentSetgid ? `setgid, group ${setup.parentGid}` : `plain, group ${setup.parentGid}`, unit: setup.parentSetgid ? "so the group comes from the parent rather than the process" : "so the group comes from the process" },
    { name: "process group", value: String(setup.processGid), unit: "what the group would be without a setgid parent" },
    { name: "chmod afterwards", value: setup.thenChmod > 0 ? modeText(setup.thenChmod) : "none", unit: "chmod does not go through the umask" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "mode":
      return claim.value === modeText(mode(setup));
    case "created":
      return claim.value === modeText(created(setup));
    case "gid":
      return claim.value === gid(setup);
    case "masked":
      return claim.value === masked(setup);
    case "executable":
      return claim.value === executable(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
