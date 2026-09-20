import type { Claim, Field, Setup } from "./types";

/** FD_SETSIZE on every build measured. */
export const FD_SETSIZE = 1024;

/** How many bytes an fd_set of that many descriptors takes. */
export function setBytes(setSize: number): number {
  return Math.ceil(Math.max(0, setSize) / 8);
}

/**
 * The byte the macro touches, counted from the start of the fd_set.
 *
 * This is the whole of the arithmetic and it does not change at the boundary,
 * which is exactly why nothing notices the boundary.
 */
export function byteFor(setup: Setup): number {
  return Math.floor(setup.fd / 8);
}

/** And the bit within it. */
export function bitFor(setup: Setup): number {
  return setup.fd % 8;
}

/** The value FD_SET leaves in that byte, in a byte that was zero. */
export function bitValue(setup: Setup): number {
  return 1 << bitFor(setup);
}

/** Whether the byte is one of the ones the fd_set owns. */
export function inTheSet(setup: Setup): boolean {
  return byteFor(setup) < setBytes(setup.setSize);
}

/**
 * Whether glibc's own check is compiled in.
 *
 * The threshold is 1 and not 2. glibc guards __FD_ELT with __USE_FORTIFY_LEVEL
 * greater than zero, so the lowest level that does anything at all already has
 * this one. Measured at all four levels, because the first version of this
 * model said 2 and nothing in the gate had reason to disagree with it.
 */
export function checked(setup: Setup): boolean {
  return setup.fortify >= 1;
}

/** The field that owns a byte of the struct, or nothing when it is padding. */
export function fieldAt(fields: Field[], byte: number): Field | undefined {
  return fields.find((field) => byte >= field.at && byte < field.at + field.size);
}

/** What the reader would call the place the bit lands. */
export function landsIn(setup: Setup): string {
  const field = fieldAt(setup.fields, byteFor(setup));
  if (field) return field.name;
  const past = setup.fields.reduce((end, field) => Math.max(end, field.at + field.size), 0);
  return byteFor(setup) >= past ? "past the end of the struct" : "padding";
}

/**
 * What the call does.
 *
 * Three outcomes and only one of them says anything. The check glibc ships is
 * off unless the build asked for it, and the write is the same instruction
 * either side of 1024.
 */
export function outcome(setup: Setup): string {
  if (inTheSet(setup)) return "it does what it looks like";
  if (checked(setup)) return "the process is terminated by glibc";
  return setup.call === "FD_ISSET"
    ? "it reads a byte that belongs to something else"
    : "it writes to a byte that belongs to something else";
}

/** Whether anything at all tells the program about it. */
export function reported(setup: Setup): boolean {
  return !inTheSet(setup) && checked(setup);
}

/**
 * Whether select would actually watch that descriptor.
 *
 * Two conditions, and FD_SETSIZE is not either of them. The bit has to be
 * inside the buffer that was handed to the syscall, and the descriptor has to
 * be below nfds, because the syscall reads ceil(nfds / 8) bytes and stops.
 */
export function watched(setup: Setup): boolean {
  return inTheSet(setup) && setup.fd < setup.nfds;
}

/** Why it is not watched, for the cases where it is not. */
export function whyNot(setup: Setup): string {
  if (watched(setup)) return "it is watched";
  if (!inTheSet(setup)) return "the bit is not in the buffer, it went past the end of it";
  return `the descriptor is not below nfds, which is ${setup.nfds}`;
}

/** A byte, as the measurement printed it. */
export function asHex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** The build flag, as a Makefile carries it. */
export function asFortify(level: number): string {
  return level === 0 ? "no -D_FORTIFY_SOURCE" : `-D_FORTIFY_SOURCE=${level}`;
}

/** The lines a reader would gather before answering. */
export function asFdset(setup: Setup): { name: string; value: string; unit: string }[] {
  const owner = fieldAt(setup.fields, byteFor(setup));
  return [
    {
      name: "the struct",
      value: `${setup.fields.length} members, ${setup.fields.reduce((end, f) => Math.max(end, f.at + f.size), 0)} bytes`,
      unit: setup.fields.map((f) => `${f.name} at ${f.at} for ${f.size}`).join(", "),
    },
    {
      name: "the fd_set",
      value: `${setBytes(setup.setSize)} bytes`,
      unit: `FD_SETSIZE is ${setup.setSize}, so it holds one bit each for descriptors 0 to ${setup.setSize - 1}`,
    },
    {
      name: "the call",
      value: `${setup.call}(${setup.fd}, &set)`,
      unit: `${setup.job} on ${setup.host} makes this call`,
    },
    {
      name: "the arithmetic",
      value: `byte ${byteFor(setup)}, bit ${bitFor(setup)}`,
      unit: `${setup.fd} over 8 and ${setup.fd} mod 8, and the macro does no other check`,
    },
    {
      name: "the build",
      value: asFortify(setup.fortify),
      unit: checked(setup)
        ? "glibc's own bounds check is compiled in at this level"
        : "glibc has a bounds check and this build does not have it",
    },
    {
      name: "nfds",
      value: `${setup.nfds}`,
      unit: `select reads ${setBytes(setup.nfds)} bytes from the pointer, whatever the pointer is`,
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "byte":
      return claim.value === byteFor(setup);
    case "field":
      return claim.value === landsIn(setup);
    case "outcome":
      return claim.value === outcome(setup);
    case "watched":
      return claim.value === watched(setup);
    case "reported":
      return claim.value === reported(setup);
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
