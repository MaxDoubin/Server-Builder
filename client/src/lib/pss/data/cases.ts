import type { Case } from "../types";

/**
 * Ten forks, and what each process is charged for afterwards.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * building an explicit page by page ledger of which process maps which frame
 * and counting, rather than by evaluating the same region arithmetic twice.
 *
 * Four of the ten are the same 64 MiB mapping with one thing changed, because
 * the thing that makes this hard in production is that the program is
 * identical and the number is not.
 */
export const CASES: Case[] = [
  {
    slug: "the-four-workers-that-added-up-to-two-hundred-and-fifty-six",
    name: "Four workers, one copy",
    brief:
      "A preforking worker pool loads a 64 MiB model into memory, touches all of it, and forks three workers. Nobody writes to it afterwards. The dashboard adds up the RSS column from ps and pages somebody at three in the morning.",
    setup: { host: "infer-01", job: "a worker pool", pages: 16384, kind: "private", children: 3, touch: "none", touchPages: 0, distinct: false, thenKilled: 0 },
    question: "What does the RSS column add up to?",
    options: [
      { id: "sum", claim: "256 MiB. Four processes at 64 MiB each, and that is exactly what a column of ps adds up to", says: { about: "rssSum", value: 256 } },
      { id: "shared-aware", claim: "64 MiB, because RSS already accounts for the sharing", says: { about: "rssSum", value: 64 } },
      { id: "half", claim: "128 MiB. The parent counts once and the three children count once between them", says: { about: "rssSum", value: 128 } },
      { id: "grew", claim: "The fork itself cost page frames, which is where the extra went", says: { about: "grew", value: true } },
    ],
    why:
      "Measured on four processes sharing one 64 MiB mapping: ps reported 66948, 65828, 65828 and 65828 kB, which adds up to 258.2 MiB. Every one of those rows is true about its own process, and the sum is not true about anything. The same page frame appears in four of them at full price. PSS for the same four came to 65794 kB, which is the 64 MiB that actually exists.",
    fix:
      "Never add up a column of RSS. Add up PSS instead, from /proc/PID/smaps_rollup or the ps PSS column, which is the same measurement with each page divided by the number of processes that map it.",
    breaks: "adding up RSS gives you the memory in use",
  },
  {
    slug: "the-read-that-cost-nothing",
    name: "The read that cost nothing",
    brief:
      "The same pool, except each of the three workers now reads 16 MiB of the model on startup to build an index. Somebody budgeting the host wants to know what the reads cost.",
    setup: { host: "infer-01", job: "a worker pool", pages: 16384, kind: "private", children: 3, touch: "read", touchPages: 4096, distinct: false, thenKilled: 0 },
    question: "How many page frames does the machine hold for this?",
    options: [
      { id: "copies", claim: "112 MiB. Three children reading 16 MiB each fault in 48 MiB of copies", says: { about: "physical", value: 112 } },
      { id: "grew", claim: "The reads cost frames, which is what copy on write means", says: { about: "grew", value: true } },
      { id: "same", claim: "64 MiB, unchanged. A read finds the page already in the child's page table, put there by fork, and faults nothing at all", says: { about: "physical", value: 64 } },
      { id: "one-copy", claim: "80 MiB: one 16 MiB copy, made once and shared by the three readers", says: { about: "physical", value: 80 } },
    ],
    why:
      "Measured: RSS 65536 kB and PSS 16384 kB per process whether the children read 16 MiB or did nothing at all, with the anonymous page count unmoved either way. Copy on write is about writing. Fork already gave the child a page table entry for every page in the mapping, so there is nothing for a read to fault in.",
    fix:
      "Budget for what gets written after the fork, not for what gets touched. Loading a large read only structure before forking is the whole trick, and it works.",
    breaks: "touching a page after a fork costs memory",
  },
  {
    slug: "the-write-that-did",
    name: "The write that did",
    brief:
      "Same pool again, and this time the three workers each write to the same 16 MiB of the model, because the index is built in place rather than beside it.",
    setup: { host: "infer-01", job: "a worker pool", pages: 16384, kind: "private", children: 3, touch: "write", touchPages: 4096, distinct: false, thenKilled: 0 },
    question: "How many page frames does the machine hold for this?",
    options: [
      { id: "none", claim: "64 MiB. Copy on write shares the page and the write goes to the shared copy", says: { about: "physical", value: 64 } },
      { id: "whole", claim: "256 MiB, because a write breaks the sharing and each child ends up with the mapping to itself", says: { about: "physical", value: 256 } },
      { id: "one-copy", claim: "80 MiB: the range is copied once and the three children share the copy", says: { about: "physical", value: 80 } },
      { id: "copies", claim: "112 MiB. The original 64, plus one private 16 MiB copy per child", says: { about: "physical", value: 112 } },
    ],
    why:
      "Measured: anonymous pages went up by 114524 kB against a mapping of 65536, which is the 48 MiB of copies, and each process reported PSS 28672 kB where the reading version reported 16384. Copy on write copies the page that was written and nothing else. Three children writing the same range produce three copies, not one, because a copy is private to the process that made it.",
    fix:
      "Count the pages that get written after the fork, per child, and multiply. Writing in place to a structure that was meant to be shared is the usual way a preforking server quietly costs four times what it was sized for.",
    breaks: "copy on write copies the whole mapping",
  },
  {
    slug: "the-parent-that-got-bigger-doing-nothing",
    name: "The parent that got bigger",
    brief:
      "A 64 MiB mapping, two children, and each child writes to its own half of it. The parent does nothing at all from the fork onward, and its PSS is on a graph somebody is watching.",
    setup: { host: "shard-02", job: "a sharding daemon", pages: 16384, kind: "private", children: 2, touch: "write", touchPages: 8192, distinct: true, thenKilled: 0 },
    question: "What is the parent's PSS?",
    options: [
      { id: "child", claim: "48 MiB, the same as each child, because they all map the same region", says: { about: "pssParent", value: 48 } },
      { id: "half", claim: "32 MiB. Every page is now shared with exactly one child rather than two, so the parent carries half of all of it", says: { about: "pssParent", value: 32 } },
      { id: "all", claim: "64 MiB, because the parent still has the whole mapping resident and copied nothing", says: { about: "pssParent", value: 64 } },
      { id: "still", claim: "It cannot move. PSS is a measurement of this process, and this process did nothing", says: { about: "nothing" } },
    ],
    why:
      "Before the children wrote, three processes shared all 64 MiB and the parent carried a third of it. Afterwards each half is shared by the parent and one child, so the parent carries half of 64 rather than a third, and its graph steps up by 11 MiB on a process that executed no instructions. Its RSS never moved. PSS is not a property of a process; it is a property of a process and everybody else.",
    fix:
      "Read a PSS graph together with the process count. A step in one process's PSS with no allocation behind it is almost always somebody else having stopped sharing, by writing or by exiting.",
    breaks: "a process's PSS moves only when that process does something",
  },
  {
    slug: "the-child-with-nothing-resident",
    name: "Nothing resident, everything mapped",
    brief:
      "A cache daemon puts 64 MiB in a MAP_SHARED anonymous region so its children can all see writes, touches every page of it, and forks three children. The children have not touched it yet.",
    setup: { host: "cache-07", job: "a cache daemon", pages: 16384, kind: "shared", children: 3, touch: "none", touchPages: 0, distinct: false, thenKilled: 0 },
    question: "What is a child's RSS for this mapping?",
    options: [
      { id: "zero", claim: "0 MiB. Linux copies no page tables for a shared anonymous mapping on fork, so nothing is resident in the child until the child touches it", says: { about: "rssChild", value: 0 } },
      { id: "all", claim: "64 MiB, the same as the parent, because the child maps the whole region", says: { about: "rssChild", value: 64 } },
      { id: "quarter", claim: "16 MiB, the child's quarter of a region four processes map", says: { about: "rssChild", value: 16 } },
      { id: "nothing", claim: "RSS is not defined for a shared mapping, which is why smaps reports Shared_Clean instead", says: { about: "nothing" } },
    ],
    why:
      "Measured: the parent reported RSS 65536 kB and each child reported 0 for a region all four of them map in full. Fork skips copying page tables for a VMA a fault can refill correctly, and a shared anonymous mapping is one, so a child's RSS here records what it has touched since the fork rather than what it can reach. The private mapping in the other cases behaves the opposite way, because it has an anon_vma and its page tables are copied.",
    fix:
      "Do not read a low RSS on a child as a small process. For shared regions, ask how much the process has touched, which is a different question from how much it can reach, and read the parent's figure for the size of the region itself.",
    breaks: "a child's RSS counts what it inherited",
  },
  {
    slug: "the-shared-region-nobody-shared",
    name: "Shared, and mostly not",
    brief:
      "The same cache daemon, and now each of the three children has read the same 16 MiB hot range. Capacity planning wants the daemon's own PSS.",
    setup: { host: "cache-07", job: "a cache daemon", pages: 16384, kind: "shared", children: 3, touch: "read", touchPages: 4096, distinct: false, thenKilled: 0 },
    question: "What is the parent's PSS?",
    options: [
      { id: "quarter", claim: "16 MiB, a quarter of 64, because four processes map the region", says: { about: "pssParent", value: 16 } },
      { id: "most", claim: "52 MiB. The 16 MiB the children actually touched is divided four ways, and the 48 MiB none of them touched is the parent's alone", says: { about: "pssParent", value: 52 } },
      { id: "all", claim: "64 MiB, because a shared region is charged to whichever process created it", says: { about: "pssParent", value: 64 } },
      { id: "child", claim: "4 MiB, which is what each of the children carries", says: { about: "pssParent", value: 4 } },
    ],
    why:
      "Measured: parent PSS 53248 kB, each child 4096. A page is divided by the number of processes that map it, and a process only maps a page of a shared anonymous region once it has faulted the page in. Forty eight of the sixty four megabytes here have exactly one mapper, so the word shared describes the flags rather than the accounting.",
    fix:
      "Expect a shared region to be charged mostly to whoever touched it, and expect that to move as the children warm up. It is not a fixed split.",
    breaks: "a shared mapping divides evenly among the processes that map it",
  },
  {
    slug: "the-step-up-with-nothing-behind-it",
    name: "The step nobody allocated",
    brief:
      "Eight processes share a 64 MiB mapping: a supervisor and seven workers. A rolling restart takes four of the workers away. The alert on per process memory fires while the restart is still going.",
    setup: { host: "api-11", job: "a supervisor", pages: 16384, kind: "private", children: 7, touch: "none", touchPages: 0, distinct: false, thenKilled: 4 },
    question: "What is the supervisor's PSS once the four have exited?",
    options: [
      { id: "freed", claim: "32 MiB of page frames were freed when the four exited, so the supervisor holds what is left", says: { about: "physical", value: 32 } },
      { id: "unchanged", claim: "8 MiB, unchanged, because nothing was allocated and nothing was freed", says: { about: "pssParent", value: 8 } },
      { id: "quarter", claim: "16 MiB. Four of the eight are gone, so every page is divided four ways instead of eight", says: { about: "pssParent", value: 16 } },
      { id: "all", claim: "64 MiB, because the survivors have to carry what the departed were carrying", says: { about: "pssParent", value: 64 } },
    ],
    why:
      "Measured on four processes sharing 64 MiB: 16384 kB of PSS each, and 21845 kB each after one of them was killed. Nothing was allocated and nothing was freed. The divisor changed. This is the single most confusing thing about watching PSS over time, and a deployment produces it on every rollout.",
    fix:
      "Alert on the sum of PSS across the group, which does not move here, rather than on any one process's. A per process PSS alert fires on every rolling restart by construction.",
    breaks: "PSS rises only when a process allocates",
  },
  {
    slug: "the-column-that-does-add-up",
    name: "The column that adds up",
    brief:
      "A 128 MiB dataset, one child forked to process it, and the child writes 32 MiB of it in place. Somebody wants a number they can put in a capacity spreadsheet.",
    setup: { host: "batch-03", job: "a batch job", pages: 32768, kind: "private", children: 1, touch: "write", touchPages: 8192, distinct: false, thenKilled: 0 },
    question: "What do the two PSS figures add up to?",
    options: [
      { id: "mapping", claim: "128 MiB, the size of the mapping, because PSS can never exceed what was mapped", says: { about: "pssSum", value: 128 } },
      { id: "rss", claim: "256 MiB, the same as the RSS column, since both processes have all of it resident", says: { about: "pssSum", value: 256 } },
      { id: "one", claim: "80 MiB. PSS is a per process figure, and adding two of them up counts the shared pages twice", says: { about: "pssSum", value: 80 } },
      { id: "exact", claim: "160 MiB, which is exactly the page frames in use", says: { about: "pssSum", value: 160 } },
    ],
    why:
      "The parent and the child report 81920 kB each, and 160 MiB of frames exist: 128 for the mapping and 32 for the copy the write made. This is what PSS is for. Each process is truncated to a kilobyte before you add it, so a long column can land a hair under the frames in use and never over them.",
    fix:
      "Sum PSS for a capacity number and RSS for nothing. If you need the figure per container rather than per process, memory.current in the cgroup is a different accounting again: it charges a page to whoever touched it first and divides nothing.",
    breaks: "PSS is an estimate, so a column of it will not add up",
  },
  {
    slug: "the-write-that-copied-nothing",
    name: "The write that copied nothing",
    brief:
      "The cache daemon again, with its 64 MiB shared region, and this time each of the three children writes to its own 16 MiB slice of it.",
    setup: { host: "cache-07", job: "a cache daemon", pages: 16384, kind: "shared", children: 3, touch: "write", touchPages: 4096, distinct: true, thenKilled: 0 },
    question: "What is a child's PSS?",
    options: [
      { id: "half", claim: "8 MiB. Its slice is mapped by exactly two processes, itself and the parent, and writing to a shared page copies nothing", says: { about: "pssChild", value: 8 } },
      { id: "own", claim: "16 MiB, because the child wrote the whole slice and now has a private copy of it", says: { about: "pssChild", value: 16 } },
      { id: "quarter", claim: "4 MiB, a quarter of 16, since four processes map the region", says: { about: "pssChild", value: 4 } },
      { id: "grew", claim: "The writes gave each child a private copy, so the machine is holding more than it was", says: { about: "grew", value: true } },
    ],
    why:
      "Measured: parent PSS 40960 kB, each child 8192, and the anonymous page count did not move because a shared anonymous region is shmem rather than anonymous memory. A write to MAP_SHARED is the write everybody else sees, which is the entire reason to ask for one, and it allocates nothing. The same program against MAP_PRIVATE produces three copies.",
    fix:
      "Pick the flag for the semantics you want and then read the accounting that follows from it. MAP_SHARED costs one copy and gives up isolation; MAP_PRIVATE keeps isolation and costs a copy per writer per page.",
    breaks: "writing to a shared mapping costs the writer a private copy",
  },
  {
    slug: "the-gigabyte-that-eight-workers-did-not-need",
    name: "A gigabyte, eight times over",
    brief:
      "A preforking API server loads a 1 GiB lookup table, touches it all, and forks seven workers. Each worker writes 16 MiB of per worker state into the table's memory. The host has 4 GiB and the RSS column adds up to 8 GiB.",
    setup: { host: "api-11", job: "an API server", pages: 262144, kind: "private", children: 7, touch: "write", touchPages: 4096, distinct: false, thenKilled: 0 },
    question: "How much memory does the host actually have to find?",
    options: [
      { id: "rss", claim: "8192 MiB, which is what adding up the eight RSS figures gives, and the host is two gigabytes short", says: { about: "physical", value: 8192 } },
      { id: "actual", claim: "1136 MiB. One copy of the gigabyte, plus the 16 MiB each of the seven workers dirtied", says: { about: "physical", value: 1136 } },
      { id: "free", claim: "1024 MiB, because copy on write means the workers cost nothing at all", says: { about: "physical", value: 1024 } },
      { id: "each", claim: "142 MiB, which is what each worker actually costs", says: { about: "physical", value: 142 } },
    ],
    why:
      "Eight processes report 1024 MiB of RSS each and 142 MiB of PSS each. The PSS column adds up to 1136 MiB, which is the gigabyte plus seven 16 MiB copies, and that is what the host has to find. The RSS column adds up to eight gigabytes, which is what the host would need if fork copied memory, and it has not done that since 1979.",
    fix:
      "Size a preforking server from the sum of PSS, or from the size of the shared image plus the per worker dirty pages, which is the same arithmetic done by hand. Sizing from RSS times workers is how a machine that fits gets called a machine that does not.",
    breaks: "a preforking server needs its RSS times the number of workers",
  },
];
