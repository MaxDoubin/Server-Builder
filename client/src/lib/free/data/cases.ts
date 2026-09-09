/**
 * Ten machines and one estimate.
 *
 * Every figure came out of si_mem_available as transcribed in model.ts. All
 * quantities are whole kibibytes, because /proc/meminfo cannot print a
 * fraction of one and a case whose input it could not produce is teaching
 * from a machine that does not exist.
 */

import type { Case } from "../types";

const M = 1024;
const G = 1024 * 1024;

export const CASES: Case[] = [
  {
    slug: "two-hundred-and-forty-megabytes-free",
    name: "Two hundred and forty megabytes free",
    brief:
      "A 32 GiB application server, up for eleven days. free -h shows 240Mi in the free column." +
      " A monitoring rule on free memory has been paging every night and somebody has been asked" +
      " to size the replacement.",
    setup: {
      total: 32 * G,
      free: 240 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 18 * G,
      inactiveFile: 10 * G,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 1228 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 0,
    },
    question: "What does MemAvailable say?",
    options: [
      {
        id: "free",
        claim: "245760 kB, the same as free, because that is the memory nothing is using",
        says: { about: "available", value: 245760 },
      },
      {
        id: "half",
        claim: "14925312 kB, being free plus half the page cache",
        says: { about: "available", value: 14925312 },
      },
      {
        id: "correct",
        claim: "30511104 kB, which is 29.1 GiB of a 32 GiB machine",
        says: { about: "available", value: 30511104 },
      },
      {
        id: "used",
        claim: "29360128 kB, because the page cache is memory that is in use",
        says: { about: "available", value: 29360128 },
      },
    ],
    why:
      "An operating system that leaves memory unused is wasting it, so the page cache grows until" +
      " something needs the space back, and on any server that has been up for a week the free" +
      " column is small by design. MemAvailable is the estimate of what userspace could allocate" +
      " without swapping or an OOM kill, and here it is 29.1 GiB. The machine is not short of" +
      " memory and never was. The rule has been paging on the one column that was always going to" +
      " go to zero.",
    fix:
      "alert on MemAvailable, or on the pressure figures in /proc/pressure/memory, and never on" +
      " MemFree. free -h has printed an available column since procps 3.3.10, in 2014, precisely" +
      " because the free one misleads.",
    breaks: "that the free column is the memory you can use",
  },
  {
    slug: "twenty-gigabytes-on-a-full-machine",
    name: "Twenty gigabytes, on the machine with nothing free",
    brief:
      "The same host. A batch job needs to allocate 20 GiB and the operator refuses to run it on" +
      " a machine showing 240Mi free.",
    setup: {
      total: 32 * G,
      free: 240 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 18 * G,
      inactiveFile: 10 * G,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 1228 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 20 * G,
    },
    question: "Does the allocation fit?",
    options: [
      {
        id: "correct",
        claim: "Yes: the cache is given back as it is needed and nothing swaps",
        says: { about: "fits" },
      },
      {
        id: "no",
        claim: "No: there is nowhere near 20 GiB free and it will be killed",
        says: { about: "does-not-fit" },
      },
      {
        id: "available",
        claim: "MemAvailable is 20971520 kB, exactly what it wants",
        says: { about: "available", value: 20971520 },
      },
      {
        id: "nothing",
        claim: "It cannot be worked out without knowing what the cached files are",
        says: { about: "nothing" },
      },
    ],
    why:
      "Page cache is not a claim on memory, it is a use of memory that is given up the moment" +
      " anything wants it. An allocation of 20 GiB against 29.1 GiB available succeeds: the kernel" +
      " reclaims clean file pages, which costs nothing but the reads that will have to happen" +
      " again later. Nothing swaps and nothing is killed. What it costs is cache hit rate, which" +
      " is a performance question and not an availability one.",
    fix:
      "run the job. If the concern is the cache, measure the thing that is actually affected: read" +
      " latency after the job, or the major fault rate in /proc/vmstat, rather than a memory" +
      " column that was never going to be large.",
    breaks: "that reclaiming page cache is a failure mode",
  },
  {
    slug: "the-laptop-keeps-half-of-it",
    name: "Three hundred megabytes of cache",
    brief:
      "A 4 GiB virtual machine that has just booted and read very little, so the page cache is" +
      " only 300Mi. Somebody is applying the rule of thumb that MemAvailable is roughly free plus" +
      " cache.",
    setup: {
      total: 4 * G,
      free: 500 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 200 * M,
      inactiveFile: 100 * M,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 120 * M,
      kernelMiscReclaimable: 20 * M,
      swapTotal: 0,
      wants: 0,
    },
    question: "How much of the 300Mi cache is counted as available?",
    options: [
      {
        id: "all",
        claim: "307200 kB, all of it, because clean page cache is always reclaimable",
        says: { about: "available", value: 307200 },
      },
      {
        id: "correct",
        claim: "671744 kB in total, which is free plus half the cache plus half the slab",
        says: { about: "available", value: 671744 },
      },
      {
        id: "watermark",
        claim: "The low watermark of 184320 kB is held back, as it is on any machine",
        says: { about: "nothing" },
      },
      {
        id: "free",
        claim: "512000 kB, since only the free column really counts",
        says: { about: "available", value: 512000 },
      },
    ],
    why:
      "The subtraction in si_mem_available is min(half the cache, the low watermark), and which" +
      " arm wins changes with the size of the machine. Here half of 300Mi is 150Mi and the" +
      " watermark is 180Mi, so half wins and half the cache is kept back. On the 32 GiB server" +
      " earlier, half the cache is 14 GiB and the watermark is 180Mi, so the watermark wins and" +
      " almost all the cache counts. The remembered version of this rule, that half the cache is" +
      " available, is the small machine case, and most servers are the other one.",
    fix:
      "read MemAvailable rather than reconstructing it. If you do want to reason about it, the" +
      " question to ask first is which arm of that min applies, and on anything with more than a" +
      " gigabyte or so of cache it is the watermark.",
    breaks: "that half the page cache is what counts as available",
  },
  {
    slug: "tmpfs-is-not-reclaimable",
    name: "Six gigabytes of tmpfs and no swap",
    brief:
      "A 16 GiB build host with no swap, where the build writes intermediates into a 6 GiB tmpfs" +
      " and leaves them there between runs. MemAvailable reads 9.0 GiB. A step needing 5 GiB is" +
      " about to start.",
    setup: {
      total: 16 * G,
      free: 300 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 7 * G,
      inactiveFile: 1 * G,
      shmem: 6 * G,
      dirty: 40 * M,
      slabReclaimable: 1024 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 5 * G,
    },
    question: "MemAvailable says 9.0 GiB. Does the 5 GiB step fit?",
    options: [
      {
        id: "yes",
        claim: "Yes: 5 GiB is comfortably inside the 9.0 GiB the kernel is offering",
        says: { about: "fits" },
      },
      {
        id: "overstates",
        claim: "The estimate overstates by 6291456 kB, being the whole tmpfs",
        says: { about: "overstates-by", value: 6291456 },
      },
      {
        id: "correct",
        claim: "No: about 5.9 GiB of that cache is tmpfs, which nothing can reclaim without swap",
        says: { about: "does-not-fit" },
      },
      {
        id: "available",
        claim: "MemAvailable is really 3238912 kB and the tool is printing it wrongly",
        says: { about: "available", value: 3238912 },
      },
    ],
    why:
      "tmpfs pages live on the file LRU lists, which is where si_mem_available looks for the page" +
      " cache, so they are counted. They are also the one kind of page on those lists that cannot" +
      " be dropped: there is no file behind them to read back from, so the only way out is swap," +
      " and this host has none. MemAvailable is not lying, it is answering a question about the" +
      " page cache and part of this page cache is not page cache in the sense the estimate" +
      " assumes. Around 3.1 GiB is genuinely available and the step wants five.",
    fix:
      "subtract Shmem from MemAvailable on any host with a large tmpfs and no swap, and check" +
      " /proc/meminfo rather than free -h, because free's shared column is the same number and is" +
      " the one people skip. Better still, give the host swap: it does not have to be used, and it" +
      " turns an unreclaimable page into a slow one.",
    breaks: "that everything counted as page cache can be reclaimed",
  },
  {
    slug: "the-same-host-with-swap",
    name: "The same build host, with swap",
    brief:
      "The identical machine and the identical tmpfs, with 8 GiB of swap added and nothing else" +
      " changed.",
    setup: {
      total: 16 * G,
      free: 300 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 7 * G,
      inactiveFile: 1 * G,
      shmem: 6 * G,
      dirty: 40 * M,
      slabReclaimable: 1024 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 8 * G,
      wants: 5 * G,
    },
    question: "Does the 5 GiB step fit now?",
    options: [
      {
        id: "no",
        claim: "No: swap does not change how much memory there is",
        says: { about: "does-not-fit" },
      },
      {
        id: "overstates",
        claim: "It still overstates by 6291456 kB, because the tmpfs is still there",
        says: { about: "overstates-by", value: 6291456 },
      },
      {
        id: "available",
        claim: "MemAvailable rises to 17784832 kB, since swap is added to it",
        says: { about: "available", value: 17784832 },
      },
      {
        id: "correct",
        claim: "Yes: the tmpfs pages can go to swap now, so the estimate is honest again",
        says: { about: "fits" },
      },
    ],
    why:
      "MemAvailable is unchanged at 9.0 GiB, because swap is not memory and the estimate does not" +
      " count it. What changed is that the estimate is now true: the six gigabytes of tmpfs have" +
      " somewhere to go under pressure, so the page cache really is reclaimable and the step" +
      " succeeds. Swap on a machine with plenty of memory is not there to be used, it is there so" +
      " that the pages which cannot be dropped can at least be moved.",
    fix:
      "keep a modest swap file on hosts with tmpfs, shared memory or large anonymous working sets," +
      " and set vm.swappiness low if you want it used only under real pressure. A host with no" +
      " swap has one fewer option under pressure, and the option it lost is the graceful one.",
    breaks: "that swap is only useful on a machine short of memory",
  },
  {
    slug: "genuinely-out",
    name: "Ninety megabytes free and nothing cached",
    brief:
      "An 8 GiB host where the page cache has collapsed to 260Mi and free is 90Mi. Something has" +
      " grown to fill the machine. A 2 GiB allocation is about to be attempted.",
    setup: {
      total: 8 * G,
      free: 90 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 200 * M,
      inactiveFile: 60 * M,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 100 * M,
      kernelMiscReclaimable: 20 * M,
      swapTotal: 0,
      wants: 2 * G,
    },
    question: "What is different about this machine?",
    options: [
      {
        id: "same",
        claim: "Nothing: the free column is small here for the same reason it always is",
        says: { about: "fits" },
      },
      {
        id: "correct",
        claim: "MemAvailable is 221184 kB, so there is genuinely almost nothing left",
        says: { about: "available", value: 221184 },
      },
      {
        id: "cache",
        claim: "The cache is 266240 kB and giving it back would cover the allocation",
        says: { about: "nothing" },
      },
      {
        id: "free",
        claim: "92160 kB, the free column, which is all that is really left",
        says: { about: "available", value: 92160 },
      },
    ],
    why:
      "A collapsed page cache is the signal, not a small free column. On a healthy server the" +
      " cache is most of the machine and free is nearly nothing; here the cache has been squeezed" +
      " down to 260Mi, which means the kernel has already been reclaiming hard and there is" +
      " nothing left to reclaim. MemAvailable at 216Mi says so directly, and the 2 GiB allocation" +
      " will swap if it can and be killed if it cannot.",
    fix:
      "look at the cache size, not the free size. A shrinking page cache over hours is the early" +
      " warning that a memory alert on MemFree can never give you, because MemFree looked exactly" +
      " like this on the healthy machine too.",
    breaks: "that a machine in trouble looks different in the free column",
  },
  {
    slug: "available-below-free",
    name: "Available is less than free",
    brief:
      "A small 2 GiB instance that has just booted. It has 1.5 GiB free and essentially no page" +
      " cache at all, and MemAvailable reads lower than MemFree, which somebody has reported as a" +
      " bug.",
    setup: {
      total: 2 * G,
      free: 1536 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 0,
      inactiveFile: 0,
      shmem: 0,
      dirty: 0,
      slabReclaimable: 0,
      kernelMiscReclaimable: 0,
      swapTotal: 0,
      wants: 0,
    },
    question: "Why is MemAvailable lower than MemFree?",
    options: [
      {
        id: "bug",
        claim: "It is a bug: available can never be less than free",
        says: { about: "nothing" },
      },
      {
        id: "grows",
        claim: "1572864 kB: the two are the same, and only diverge once there is a cache",
        says: { about: "available", value: 1572864 },
      },
      {
        id: "correct",
        claim: "1507328 kB: the reserves the kernel will not allocate from are subtracted",
        says: { about: "available", value: 1507328 },
      },
      {
        id: "watermark",
        claim: "The low watermark of 184320 kB is subtracted from free",
        says: { about: "available", value: 1388544 },
      },
    ],
    why:
      "The first line of the estimate is free minus totalreserve_pages, and there is no page cache" +
      " here to add back. totalreserve is the memory the kernel holds for allocations that cannot" +
      " fail and for the watermarks, and it will not be handed to userspace, so subtracting it is" +
      " the estimate being honest. Available below free is the normal state of a machine with no" +
      " cache, and it is one of the few times the two columns are close enough to compare at all.",
    fix:
      "nothing to fix. Worth knowing because it is the one shape where MemFree looks generous and" +
      " MemAvailable is the smaller and more accurate number, which is the opposite of the" +
      " situation everybody is warned about.",
    breaks: "that MemAvailable is always larger than MemFree",
  },
  {
    slug: "eight-gigabytes-of-it-is-dirty",
    name: "Twenty three gigabytes available, eight of them dirty",
    brief:
      "A 32 GiB host in the middle of writing out a large dataset, so 8 GiB of the page cache is" +
      " dirty and waiting on a slow disk. MemAvailable reads 23.2 GiB and a 20 GiB allocation is" +
      " about to start.",
    setup: {
      total: 32 * G,
      free: 500 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 12 * G,
      inactiveFile: 10 * G,
      shmem: 0,
      dirty: 8 * G,
      slabReclaimable: 1024 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 20 * G,
    },
    question: "MemAvailable says 23.2 GiB. What happens to the 20 GiB allocation?",
    options: [
      {
        id: "fails",
        claim: "It fails, because 8 GiB of the estimate is dirty and cannot be counted",
        says: { about: "does-not-fit" },
      },
      {
        id: "correct",
        claim: "15888384 kB could be had at once; the rest waits on writeback and it stalls",
        says: { about: "without-waiting", value: 15888384 },
      },
      {
        id: "clean",
        claim: "24276992 kB is there at once, since dirty pages are reclaimed as fast as clean ones",
        says: { about: "without-waiting", value: 24276992 },
      },
      {
        id: "dirty",
        claim: "MemAvailable subtracts Dirty, so it already reads 15888384 kB",
        says: { about: "available", value: 15888384 },
      },
    ],
    why:
      "si_mem_available does not subtract Dirty and this is not an oversight: a dirty page will" +
      " become available, so counting it is correct about the destination. It says nothing about" +
      " the journey. Reclaiming a dirty page means writing it first, at the speed of the device" +
      " under it, so the allocation succeeds and takes as long as the disk needs. About 15.2 GiB" +
      " is there at once and the remaining five arrive at whatever rate the writeback runs at." +
      " The symptom is a stall rather than a failure, which is why it gets diagnosed as the disk" +
      " rather than as memory.",
    fix:
      "watch Dirty and Writeback in /proc/meminfo alongside MemAvailable when latency matters, and" +
      " tune vm.dirty_background_ratio down if a host regularly accumulates gigabytes of it. A" +
      " large dirty set is a queue of work that a memory number cannot show you.",
    breaks: "that available memory is memory you can have now",
  },
  {
    slug: "the-used-column-is-a-residue",
    name: "The used column moved and nothing did",
    brief:
      "Two readings of the same 32 GiB server ten minutes apart. Nothing was deployed, no process" +
      " started or stopped, and the used column went from 2.6 GiB to 8.5 GiB. A capacity review" +
      " has flagged it as a leak.",
    setup: {
      total: 32 * G,
      free: 500 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 12 * G,
      inactiveFile: 10 * G,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 1024 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 0,
    },
    question: "The second reading is this one. What is its used column?",
    options: [
      {
        id: "correct",
        claim: "8925184 kB, and it moved because the page cache shrank, not because anything grew",
        says: { about: "used", value: 8925184 },
      },
      {
        id: "same",
        claim: "2691072 kB, the same as before, because nothing changed",
        says: { about: "used", value: 2691072 },
      },
      {
        id: "available",
        claim: "MemAvailable also fell, to 15888384 kB",
        says: { about: "available", value: 15888384 },
      },
      {
        id: "free",
        claim: "512000 kB, which is what free reports as used on an idle host",
        says: { about: "used", value: 512000 },
      },
    ],
    why:
      "used is not a quantity anything tracks. free computes it as total minus free minus" +
      " buff/cache, so it is whatever is left after the cache, and it moves whenever the cache" +
      " moves. Between the two readings the cache went from 28 GiB to 22 GiB, most likely because" +
      " something read a large file and displaced it, and the used column rose by exactly that" +
      " much without a single byte of anonymous memory being allocated. It is the column people" +
      " screenshot and the one with the least meaning in the output.",
    fix:
      "for what processes are actually holding, read anonymous memory:" +
      " grep -E 'AnonPages|Mapped' /proc/meminfo, or the sum of Pss across /proc/*/smaps_rollup." +
      " Those move when something allocates and stay still when the cache churns.",
    breaks: "that the used column tracks what programs are holding",
  },
  {
    slug: "the-estimate-is-an-estimate",
    name: "It says 29.1 and it is a guess",
    brief:
      "Back to the healthy 32 GiB server. Somebody wants to use MemAvailable as the input to an" +
      " admission controller that will refuse work when the remaining figure drops below what the" +
      " work needs.",
    setup: {
      total: 32 * G,
      free: 240 * M,
      totalReserve: 64 * M,
      watermarkLow: 180 * M,
      activeFile: 18 * G,
      inactiveFile: 10 * G,
      shmem: 0,
      dirty: 40 * M,
      slabReclaimable: 1228 * M,
      kernelMiscReclaimable: 80 * M,
      swapTotal: 0,
      wants: 29 * G,
    },
    question: "MemAvailable is 30511104 kB. Does an allocation of 29 GiB fit?",
    options: [
      {
        id: "no",
        claim: "No: 29 GiB of a 32 GiB machine leaves nothing for the kernel",
        says: { about: "does-not-fit" },
      },
      {
        id: "correct",
        claim: "By this estimate, yes, and the estimate is what the question was about",
        says: { about: "fits" },
      },
      {
        id: "held",
        claim: "The 184320 kB held back from the cache makes the answer no",
        says: { about: "nothing" },
      },
      {
        id: "waiting",
        claim: "30354432 kB is there without waiting, which is under the 29 GiB it wants",
        says: { about: "without-waiting", value: 30354432 },
      },
    ],
    why:
      "The kernel's own comment above si_mem_available calls it an estimate of what can be" +
      " allocated without causing swapping or OOM, and by that estimate 29 GiB fits with about a" +
      " gigabyte to spare. Which is the right answer and a thin margin to build an admission" +
      " controller on: the estimate does not know what the cached data is worth, whether the" +
      " reclaim will be cheap, or what else is about to start. It is a good number to alert on and" +
      " a poor one to make automatic decisions from at the edge of the machine.",
    fix:
      "leave a margin, and prefer a pressure signal for control. /proc/pressure/memory measures" +
      " time actually spent stalled on memory, so it says whether reclaim is costing anything" +
      " rather than predicting whether it might, and it is the input a controller can act on" +
      " without a guess about the future.",
    breaks: "that MemAvailable is a measurement rather than an estimate",
  },
];
