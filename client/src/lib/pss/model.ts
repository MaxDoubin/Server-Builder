import type { Claim, Setup } from "./types";

/** The page size on the machine all of this was measured on. */
export const PAGE_BYTES = 4096;

/**
 * The fraction bits the kernel keeps PSS in.
 *
 * fs/proc/task_mmu.c adds `(PAGE_SIZE << PSS_SHIFT) / mapcount` for each page
 * and shifts the total back down at the end. The division truncates, so a
 * page shared three ways is credited slightly less than a third of a page,
 * and a large enough run of them shows up as a kilobyte that went missing.
 * Reproduced here rather than rounded away, because the whole point of these
 * numbers is that they are the ones a machine prints.
 */
export const PSS_SHIFT = 12;

/** One whole page, in those units, before it is divided by anything. */
export const UNITS_PER_PAGE = PAGE_BYTES << PSS_SHIFT;

/** And the divisor that turns them back into the kilobytes smaps prints. */
export const UNITS_PER_KIB = (1 << PSS_SHIFT) * 1024;

/** A run of pages that are all mapped by the same number of processes. */
export interface Region {
  pages: number;
  sharers: number;
}

/** Skip a run that is empty, so a zero page count never carries a divisor. */
const run = (pages: number, sharers: number): Region[] =>
  pages > 0 && sharers > 0 ? [{ pages, sharers }] : [];

/** Children that still map the region when the reading is taken. */
export function alive(setup: Setup): number {
  return Math.max(0, setup.children - setup.thenKilled);
}

/** Pages each child reaches after the fork. A child that does nothing reaches none. */
export function touched(setup: Setup): number {
  return setup.touch === "none" ? 0 : setup.touchPages;
}

/**
 * Whether what the children did costs page frames.
 *
 * Only a write, only to a private mapping. A read of a private mapping finds
 * the page already in the child's page table, put there by fork, and faults
 * nothing. A write to a shared mapping writes to the page everybody is
 * looking at, which is the point of asking for one.
 */
export function copies(setup: Setup): boolean {
  return setup.kind === "private" && setup.touch === "write" && setup.touchPages > 0;
}

/**
 * How the parent's pages are shared, one run at a time.
 *
 * The parent always maps the whole region: it touched every page before it
 * forked, and nothing since has taken a page away from it.
 */
export function parentRegions(setup: Setup): Region[] {
  const live = alive(setup);
  const reach = touched(setup);

  if (setup.kind === "shared") {
    /* One frame per page, always. A page is shared with whichever live
       children have faulted it in since the fork, and with nobody else. */
    const reached = setup.distinct ? live * reach : reach;
    const sharers = setup.distinct ? 2 : 1 + live;
    return [...run(reached, sharers), ...run(setup.pages - reached, 1)];
  }

  if (!copies(setup)) {
    /* Nothing was copied, so there is still one frame per page and every
       process that exists is looking at it. */
    return run(setup.pages, 1 + live);
  }

  if (!setup.distinct) {
    /* Every live child made its own copy of the same range, which leaves the
       parent by itself on the originals. */
    return [...run(reach, 1), ...run(setup.pages - reach, 1 + live)];
  }

  /* One range per child. A range whose child has exited is back to being
     shared by everyone left; a range whose child is alive is shared by
     everyone except that child, which is one fewer. */
  const gone = setup.children - live;
  return [
    ...run(gone * reach, 1 + live),
    ...run(live * reach, live),
    ...run(setup.pages - setup.children * reach, 1 + live),
  ];
}

/**
 * The same, for one surviving child. They are all alike.
 *
 * Not because the model waves at the difference but because there is none:
 * each survivor holds its own copies, and sees every other range on the same
 * terms as every other survivor does.
 */
export function childRegions(setup: Setup): Region[] {
  const live = alive(setup);
  if (live === 0) return [];
  const reach = touched(setup);

  if (setup.kind === "shared") {
    /* A child maps only what it has touched. Linux does not copy the page
       tables of a shared anonymous mapping on fork, so an untouched page is
       not in this process at all until something faults it in. */
    return run(reach, setup.distinct ? 2 : 1 + live);
  }

  if (!copies(setup)) return run(setup.pages, 1 + live);

  if (!setup.distinct) return [...run(reach, 1), ...run(setup.pages - reach, 1 + live)];

  const gone = setup.children - live;
  return [
    ...run(reach, 1),
    ...run((live - 1) * reach, live),
    ...run(gone * reach, 1 + live),
    ...run(setup.pages - setup.children * reach, 1 + live),
  ];
}

/** Resident pages of the parent, which is the whole region. */
export function rssParentPages(setup: Setup): number {
  return setup.pages;
}

/** Resident pages of one surviving child. */
export function rssChildPages(setup: Setup): number {
  if (alive(setup) === 0) return 0;
  return setup.kind === "shared" ? touched(setup) : setup.pages;
}

/** What adding up a column of RSS gives you, which is the subject here. */
export function rssSumPages(setup: Setup): number {
  return rssParentPages(setup) + alive(setup) * rssChildPages(setup);
}

/** Page frames that exist, which is the number the machine has to find room for. */
export function physicalPages(setup: Setup): number {
  return setup.pages + (copies(setup) ? alive(setup) * setup.touchPages : 0);
}

/** Whether anything that happened after the fork cost a frame. */
export function grew(setup: Setup): boolean {
  return physicalPages(setup) > setup.pages;
}

/** Runs of pages to the kilobytes smaps prints, the kernel's arithmetic exactly. */
export function pssKib(regions: Region[]): number {
  let units = 0;
  for (const region of regions) units += region.pages * Math.floor(UNITS_PER_PAGE / region.sharers);
  return Math.floor(units / UNITS_PER_KIB);
}

export function pssParentKib(setup: Setup): number {
  return pssKib(parentRegions(setup));
}

export function pssChildKib(setup: Setup): number {
  return pssKib(childRegions(setup));
}

/**
 * PSS added up across everything that maps the region.
 *
 * This is the number RSS cannot give you. Each process is truncated to a
 * kilobyte before it is added, so the total can land a hair under the frames
 * that exist; it is never over them, which is the property that matters.
 */
export function pssSumKib(setup: Setup): number {
  return pssParentKib(setup) + alive(setup) * pssChildKib(setup);
}

/** Pages as the mebibytes a claim states. */
export function pagesMib(pages: number): number {
  return (pages * PAGE_BYTES) / (1024 * 1024);
}

/** Kilobytes as the same. */
export function mib(kib: number): number {
  return kib / 1024;
}

/** A figure written for a reader, with no trailing zeros on a whole number. */
export function asMib(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)} MiB`;
}

/** The lines a reader would gather before answering. */
export function asPss(setup: Setup): { name: string; value: string; unit: string }[] {
  const live = alive(setup);
  const reach = touched(setup);
  const doing =
    setup.touch === "none"
      ? "nothing at all"
      : `${setup.touch === "read" ? "reads" : "writes"} ${asMib(pagesMib(setup.touchPages))}`;
  return [
    {
      name: "the mapping",
      value: asMib(pagesMib(setup.pages)),
      unit: `${setup.pages} pages of 4 KiB, every one touched by ${setup.job} before it forked`,
    },
    {
      name: "how it was mapped",
      value: setup.kind === "private" ? "MAP_PRIVATE | MAP_ANONYMOUS" : "MAP_SHARED | MAP_ANONYMOUS",
      unit:
        setup.kind === "private"
          ? "so fork copies the page tables, and a write copies the page"
          : "so fork copies no page tables, and a write copies nothing",
    },
    {
      name: "children",
      value:
        setup.thenKilled > 0
          ? `${setup.children} forked, ${setup.thenKilled} since exited`
          : `${setup.children} forked`,
      unit: `${1 + live} processes map it now, on ${setup.host}`,
    },
    {
      name: "each child then",
      value: doing,
      unit:
        reach === 0
          ? "so whatever the children hold, they did not ask for it"
          : setup.distinct
            ? "a different range in each child"
            : "the same range in every child",
    },
    {
      name: "the reading",
      value: "/proc/PID/smaps, this mapping alone",
      unit: "Rss and Pss for the one region, rather than for the whole process",
    },
    {
      name: "how Pss is counted",
      value: "one page divided by its mapcount",
      unit: "so the divisor is a count of processes and nothing else",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "rssParent":
      return claim.value === pagesMib(rssParentPages(setup));
    case "rssChild":
      return claim.value === pagesMib(rssChildPages(setup));
    case "rssSum":
      return claim.value === pagesMib(rssSumPages(setup));
    case "physical":
      return claim.value === pagesMib(physicalPages(setup));
    case "pssParent":
      return claim.value === mib(pssParentKib(setup));
    case "pssChild":
      return claim.value === mib(pssChildKib(setup));
    case "pssSum":
      return claim.value === mib(pssSumKib(setup));
    case "grew":
      return claim.value === grew(setup);
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
