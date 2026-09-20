import type { Claim, How, Setup } from "./types";

/**
 * Whether the offset lives in one place for everybody.
 *
 * This is the whole of it. An offset belongs to an open file description;
 * one open() call makes one. fork and dup hand out a second descriptor onto
 * the same description, so the offset is shared and every write moves it for
 * all of them. Two open() calls on the same path do not share anything.
 */
export function sharesOffset(how: How): boolean {
  return how === "shared";
}

/**
 * Whether the write goes to the end whatever the offset says.
 *
 * O_APPEND is not a seek followed by a write. It is one operation the kernel
 * does under the inode lock, which is why writers that have never heard of
 * each other still do not overwrite anything.
 */
export function alwaysAtTheEnd(how: How): boolean {
  return how === "append" || how === "append-pwrite";
}

/**
 * Whether the offset a writer names is the offset it gets.
 *
 * pwrite is the call for writing at an offset without disturbing the file
 * offset, so it is the one place the answer is normally yes. Not under
 * O_APPEND: pwrite(2) records that POSIX requires the flag to have no effect
 * here and that Linux appends anyway. Measured, on a ten byte file: a plain
 * descriptor put "XX" at the front and left the size at ten, and an O_APPEND
 * descriptor put it on the end and took the size to twelve.
 */
export function honorsOffset(setup: Setup): boolean {
  return setup.how === "pwrite";
}

/** Bytes handed to write, which is the one number nothing argues with. */
export function written(setup: Setup): number {
  return setup.writers * setup.records * setup.bytes;
}

/** Bytes one writer hands over on its own. */
export function perWriter(setup: Setup): number {
  return setup.records * setup.bytes;
}

/**
 * How long the file is afterwards.
 *
 * Everything lands when the writes go to the end, or when one offset is
 * shared, or when the writers lay out ranges that do not overlap. Otherwise
 * every writer walks the same offsets from zero and the file is as long as
 * the furthest any one of them reached, which is one writer's worth however
 * many of them there were.
 */
export function size(setup: Setup): number {
  /*
    Nobody wrote anything, so there is nothing there. The fallback below is
    the furthest offset a writer reached, and with no writers there is no
    such offset; without this it reports one writer's worth of a writer that
    does not exist, and the file comes out longer than the bytes that went
    into it. Found by replaying the writes, which is the point of doing that.
  */
  if (setup.writers <= 0 || setup.records <= 0) return 0;
  if (alwaysAtTheEnd(setup.how)) return written(setup);
  if (sharesOffset(setup.how)) return written(setup);
  if (setup.how === "pwrite" && setup.tiled) return written(setup);
  return perWriter(setup);
}

/** What went into write() and is not in the file, which nothing reported. */
export function lost(setup: Setup): number {
  return written(setup) - size(setup);
}

/** Whether everything that was written survived. */
export function safe(setup: Setup): boolean {
  return lost(setup) === 0;
}

/** How many writers' worth of records the file actually holds. */
export function survived(setup: Setup): number {
  return setup.bytes > 0 ? size(setup) / setup.bytes : 0;
}

/** A size written for a reader. */
export function asBytes(value: number): string {
  if (value >= 1024 * 1024) return `${Number((value / 1024 / 1024).toFixed(2))} MiB`;
  if (value >= 1024) return `${Number((value / 1024).toFixed(2))} KiB`;
  return `${value} bytes`;
}

/** How the file was opened, as a program would write it. */
export function asHow(how: How): string {
  switch (how) {
    case "append":
      return "each writer opens it, O_WRONLY | O_APPEND";
    case "separate":
      return "each writer opens it, O_WRONLY";
    case "shared":
      return "the parent opens it once, then forks";
    case "pwrite":
      return "each writer opens it, then pwrite at its own offset";
    case "append-pwrite":
      return "each writer opens it O_APPEND, then pwrite at its own offset";
  }
}

/** Where the offset lives, in a few words. */
export function asOffset(how: How): string {
  if (sharesOffset(how)) return "one, shared by every writer";
  return `${how === "pwrite" ? "none used" : "one each"}, because each open() makes its own`;
}

/** The lines a reader would gather before answering. */
export function asAppend(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    {
      name: "the writers",
      value: `${setup.writers} processes`,
      unit: `${setup.job} on ${setup.host}, all writing at once`,
    },
    {
      name: "each one writes",
      value: `${setup.records} records of ${setup.bytes} bytes`,
      unit: `${asBytes(perWriter(setup))} from one writer, ${asBytes(written(setup))} in total`,
    },
    {
      name: "how it was opened",
      value: asHow(setup.how),
      unit: alwaysAtTheEnd(setup.how)
        ? "so the seek and the write are one operation nothing can interleave with"
        : "so a write goes wherever the offset happens to be",
    },
    {
      name: "file offsets",
      value: asOffset(setup.how),
      unit: "an offset belongs to an open file description, not to a file or a process",
    },
    {
      name: "the ranges",
      value:
        setup.how === "pwrite" || setup.how === "append-pwrite"
          ? setup.tiled
            ? "laid out so they do not overlap"
            : "every writer aiming at the same offsets"
          : "nobody chooses one",
      unit: "only read when a writer names the offset itself",
    },
    {
      name: "errors reported",
      value: "none",
      unit: "every write returned the number of bytes it was given",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "written":
      return claim.value === written(setup);
    case "size":
      return claim.value === size(setup);
    case "lost":
      return claim.value === lost(setup);
    case "safe":
      return claim.value === safe(setup);
    case "honorsOffset":
      return claim.value === honorsOffset(setup);
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
