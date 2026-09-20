import type { Case } from "../types";

/**
 * Ten machines, and how much of the cache column is really yours.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * itemizing the column one contributor at a time, adding it up, and filtering
 * it by what each attempt can actually take, rather than by evaluating the
 * same three sums again.
 *
 * The first two are the same gibibyte written two ways, because the whole
 * surface is that the column reads the same for both and means the opposite.
 */
export const CASES: Case[] = [
  {
    slug: "the-gigabyte-that-came-back",
    name: "The gigabyte that came back",
    brief:
      "A nightly job copies a one gibibyte export to a scratch directory on disk. Afterwards free shows buff/cache well over a gigabyte, and somebody wants to know whether that memory is available for the database that is about to start.",
    setup: { host: "batch-01", job: "a nightly export", totalKb: 16481980, baseCacheKb: 212780, baseShmemKb: 13164, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 1048576, store: "disk", attempt: "drop_caches" },
    question: "Somebody runs echo 3 > /proc/sys/vm/drop_caches. How much of the column comes back?",
    options: [
      { id: "none", claim: "None of it. buff/cache is what the kernel decided to keep and a write to a file does not change that", says: { about: "freed", value: 0 } },
      { id: "all", claim: "1295000 kB, the whole column, because that is what dropping caches means", says: { about: "freed", value: 1295000 } },
      { id: "job", claim: "1073520 kB: the gibibyte this job put there, plus the reclaimable slab. The 212 MB that was already in Cached stays, because most of a baseline like that is the mapped pages of whatever is running", says: { about: "freed", value: 1073520 } },
      { id: "nothing", claim: "It depends on whether the file was synced first", says: { about: "nothing" } },
    ],
    why:
      "Measured: Cached went from 212780 to 1261688 and back to 212360. The gibibyte came back and the baseline did not, which is the part people get wrong in both directions. drop_caches drops clean, unmapped page cache, and a running system's baseline is mostly neither. It also drops the reclaimable slab, which is the third term in free's column and the one nobody remembers is in there.",
    fix:
      "Do not run drop_caches to make room. The kernel would have evicted exactly these pages the moment anything asked, and running it by hand only throws away a cache that was earning its keep. It is a benchmarking tool.",
    breaks: "dropping caches empties the buff/cache column",
  },
  {
    slug: "the-gigabyte-that-did-not",
    name: "The gigabyte that did not",
    brief:
      "The same machine and the same gibibyte, written to /dev/shm instead because somebody wanted the job to go faster. free shows the same figure in buff/cache as it did last night, to within a few hundred kilobytes.",
    setup: { host: "batch-01", job: "a nightly export", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 27324, buffersKb: 8700, wroteKb: 1048576, store: "tmpfs", attempt: "drop_caches" },
    question: "The same drop_caches. How much comes back this time?",
    options: [
      { id: "same", claim: "The same as last night, 1073520 kB. The column reads the same, so the memory behind it is the same", says: { about: "freed", value: 1073520 } },
      { id: "slab", claim: "27324 kB, which is the reclaimable slab and nothing else. tmpfs has no disk to be written back to, so there is nothing for the kernel to drop and the gibibyte stays exactly where it is", says: { about: "freed", value: 27324 } },
      { id: "half", claim: "Half of it, because the kernel balances what it keeps against what it can get back", says: { about: "freed", value: 524288 } },
      { id: "error", claim: "The write would have failed, because tmpfs cannot hold a gibibyte", says: { about: "nothing" } },
    ],
    why:
      "Measured: Cached went from 212652 to 1261392, and after drop_caches it read 1261232. Nothing moved. The same command on the same machine with the same figure in the same column freed a gibibyte last night and freed nothing tonight, and the only thing that changed was the mount the file was written to.",
    fix:
      "Read Shmem, or free's shared column, which is the same number. That is the part of buff/cache that is not coming back, and it is the only column in the output that distinguishes these two nights.",
    breaks: "the same figure in the same column means the same thing",
  },
  {
    slug: "what-the-column-actually-is",
    name: "What the column actually is",
    brief:
      "A host with Buffers at 8700, Cached at 230000 and SReclaimable at 24828, and a job about to write four kilobytes. Somebody is trying to reconcile free's output against /proc/meminfo by hand.",
    setup: { host: "api-07", job: "a health check", totalKb: 16481980, baseCacheKb: 230000, baseShmemKb: 12996, reclaimableKb: 24828, buffersKb: 8700, wroteKb: 4, store: "disk", attempt: "nothing" },
    question: "What does free print in the buff/cache column?",
    options: [
      { id: "cached", claim: "230004 kB, which is Cached. That is what the cache is", says: { about: "buffCache", value: 230004 } },
      { id: "both", claim: "238704 kB, Buffers plus Cached, since slab is kernel memory and not cache", says: { about: "buffCache", value: 238704 } },
      { id: "nothing", claim: "It depends on the version of procps", says: { about: "nothing" } },
      { id: "sum", claim: "263532 kB: Buffers plus Cached plus SReclaimable, because the reclaimable slab is in that column too and almost nobody expects it there", says: { about: "buffCache", value: 263532 } },
    ],
    why:
      "Measured against one atomic copy of /proc/meminfo taken next to one free -k: 8704 plus 230000 plus 24828 is 263532, and free printed 263532. The slab term is the one that surprises people, and on a host with a lot of dentries it is not small. free's shared column is Shmem exactly, 12996 against 12996.",
    fix:
      "Reconcile against those four fields and nothing else. If your figure is out by tens of megabytes on an idle box, you have left SReclaimable out of it.",
    breaks: "buff/cache is the page cache",
  },
  {
    slug: "the-file-that-was-deleted",
    name: "The file that was deleted",
    brief:
      "512 mebibytes of scratch in /dev/shm. The job finishes, calls unlink on the file, and exits its cleanup path. One of its workers is still running and still has the file open.",
    setup: { host: "render-04", job: "a frame cache", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 524288, store: "tmpfs", attempt: "delete while open" },
    question: "How much memory does the unlink hand back?",
    options: [
      { id: "all", claim: "524288 kB. The file is gone from the directory and there is nothing left to hold the pages", says: { about: "freed", value: 524288 } },
      { id: "none", claim: "None of it. An open descriptor keeps the inode alive, and on tmpfs the inode is the memory, so df still reports 512M used and Shmem does not move", says: { about: "freed", value: 0 } },
      { id: "later", claim: "All of it, but only at the next writeback interval", says: { about: "nothing" } },
      { id: "half", claim: "262144 kB, the part not currently mapped by the worker", says: { about: "freed", value: 262144 } },
    ],
    why:
      "Measured: Shmem read 537096 after the write, 537096 after the unlink with the descriptor still open, and 12992 once the descriptor was closed. df on /dev/shm agreed at every step: 512M, 512M, then 0. It is the ordinary unlink rule, and it is worth knowing here because the space being held is not disk.",
    fix:
      "Find the descriptor, not the file. lsof +L1, or walk /proc/*/fd looking for links marked deleted, and the memory comes back when that process does.",
    breaks: "deleting a file in tmpfs frees its memory",
  },
  {
    slug: "no-space-with-fourteen-gigabytes-free",
    name: "No space with fourteen gigabytes free",
    brief:
      "A container mounts a tmpfs with size=16M for its scratch. A job writes a 32 mebibyte file into it. The machine has over fourteen gigabytes of memory free at the time.",
    setup: { host: "job-11", job: "a scratch writer", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 16384, store: "tmpfs", attempt: "nothing" },
    question: "What does Shmem read once the write has stopped?",
    options: [
      { id: "capped", claim: "29376 kB: the baseline plus exactly the 16 MiB the mount allows. The write stopped there and returned ENOSPC, with fourteen gigabytes of the machine unused", says: { about: "shared", value: 29376 } },
      { id: "asked", claim: "45760 kB, the 32 MiB it asked to write on top of the baseline, because the machine had the memory", says: { about: "shared", value: 45760 } },
      { id: "oom", claim: "The job would have been killed by the out of memory killer instead", says: { about: "nothing" } },
      { id: "base", claim: "12992 kB, the baseline, because a write that fails leaves nothing behind", says: { about: "shared", value: 12992 } },
    ],
    why:
      "Measured: the write stopped at exactly 16777216 bytes and the next one returned errno 28, ENOSPC, \"No space left on device\", with MemFree at 14782776 kB. The size= option is the only thing that stopped it, and the error names the wrong resource: the device is memory, and there was plenty. A tmpfs mounted with no size= at all reported 7.9G against a MemTotal of 15.7 GiB, so the default is half of RAM.",
    fix:
      "Always mount tmpfs with an explicit size, and pick it from what the box can spare rather than from what the job wants. The default of half your RAM is a default, not a recommendation, and nothing stops a job reaching it.",
    breaks: "a tmpfs runs out when the machine runs out",
  },
  {
    slug: "the-figure-that-was-honest",
    name: "The figure that was honest",
    brief:
      "The same gibibyte in /dev/shm as on the second case, and the monitoring is being rewritten. The question is which field to alert on.",
    setup: { host: "batch-01", job: "a nightly export", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 27324, buffersKb: 8700, wroteKb: 1048576, store: "tmpfs", attempt: "nothing" },
    question: "MemAvailable was 14893824 kB before the job. What is it after?",
    options: [
      { id: "same", claim: "About the same. MemAvailable counts the page cache as available, and this is page cache", says: { about: "availableCost", value: 0 } },
      { id: "free", claim: "Whatever MemFree is, because available and free are the same thing on a machine with no swap", says: { about: "nothing" } },
      { id: "up", claim: "Higher, because the write warmed the cache", says: { about: "shared", value: 12992 } },
      { id: "down", claim: "1048576 kB lower, near enough. MemAvailable excludes tmpfs because tmpfs cannot be reclaimed, so it is the one field in the file that tells you the truth without your having to know where the bytes went", says: { about: "availableCost", value: 1048576 } },
    ],
    why:
      "Measured: MemAvailable went from 14893824 to 13836480, which is the gibibyte. The run against an ordinary file on the same machine left it at 14840752 against a baseline of 14856712, which is drift. MemAvailable is an estimate and it is the right estimate: it already knows the difference that buff/cache hides, and it has known it since 2014.",
    fix:
      "Alert on MemAvailable. Not on MemFree, which is low on every healthy machine, and not on total minus buff/cache, which is the arithmetic this whole page exists to warn about.",
    breaks: "there is no field that accounts for this correctly",
  },
  {
    slug: "the-column-after-the-drop",
    name: "The column after the drop",
    brief:
      "A host holding 512 mebibytes of tmpfs and a 212 megabyte baseline, with 24944 of reclaimable slab. Somebody runs drop_caches to tidy up before a deployment and then reads free again.",
    setup: { host: "deploy-02", job: "a release staging area", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 524288, store: "tmpfs", attempt: "drop_caches" },
    question: "What does the buff/cache column read afterwards?",
    options: [
      { id: "zero", claim: "Close to zero, which is the point of running it", says: { about: "after", value: 0 } },
      { id: "left", claim: "745640 kB. The slab goes and nothing else does, so the column drops by 24944 out of 770584, and the half gigabyte of tmpfs is still sitting in it", says: { about: "after", value: 745640 } },
      { id: "base", claim: "221352 kB, the baseline and the buffers, because everything the job added is gone", says: { about: "after", value: 221352 } },
      { id: "nothing", claim: "It cannot be worked out without knowing how much of the baseline is mapped", says: { about: "nothing" } },
    ],
    why:
      "The column is 8700 of Buffers plus 736940 of Cached, of which 537280 is the tmpfs, plus 24944 of slab: 770584 in total. The only one of those four the drop can take is the slab. The baseline stays because it is mapped, and the tmpfs stays because there is nowhere to write it back to. A tidy-up that frees three percent of what it looks like it will free, on a command that reads like it will free all of it.",
    fix:
      "Nothing here is worth tidying. If the deployment needs memory, it will get the reclaimable part of this automatically, and the rest was never going to be available whatever anybody typed.",
    breaks: "drop_caches at least gets you back to a clean baseline",
  },
  {
    slug: "the-page-that-a-byte-costs",
    name: "The page that a byte costs",
    brief:
      "A service caches small responses as individual files in /dev/shm. There are a lot of them and they are mostly tiny. This one is a single byte.",
    setup: { host: "cache-09", job: "a response cache", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 1, store: "tmpfs", attempt: "nothing" },
    question: "How much does Shmem go up by?",
    options: [
      { id: "one", claim: "By nothing worth measuring. It is one byte", says: { about: "shared", value: 12992 } },
      { id: "block", claim: "By 4 kB of disk and nothing of memory, since tmpfs is backed by swap", says: { about: "nothing" } },
      { id: "page", claim: "12996 kB in total, up by a whole 4 kB page, because tmpfs allocates in pages like every other filesystem and the thing being allocated here is memory", says: { about: "shared", value: 12996 } },
      { id: "double", claim: "13000 kB, a page for the data and a page for the inode", says: { about: "shared", value: 13000 } },
    ],
    why:
      "Measured: a one byte file on tmpfs reports 4096 bytes used by df and 4096 allocated by du, against an apparent size of 1. This is the ordinary rule and it is worth stating because of what is being allocated: a million of these files is four gigabytes of RAM that free reports as cache, MemAvailable correctly refuses to count, and nothing will reclaim.",
    fix:
      "Count the files, not the bytes, when the store is tmpfs. If the entries are smaller than a page, the page is the unit and the total is the count times four kilobytes.",
    breaks: "a small file in tmpfs costs about what it holds",
  },
  {
    slug: "the-file-on-disk-that-was-deleted",
    name: "The file on disk that was deleted",
    brief:
      "The same nightly export, back on disk, one gibibyte of it in the page cache. The cleanup step removes the file. Somebody watches free while it happens.",
    setup: { host: "batch-01", job: "a nightly export", totalKb: 16481980, baseCacheKb: 212780, baseShmemKb: 13164, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 1048576, store: "disk", attempt: "delete" },
    question: "How much memory does removing the file hand back?",
    options: [
      { id: "none", claim: "None, as far as this column is concerned. The pages were already reclaimable, so nothing was being held and nothing is handed back: the kernel simply has one less thing worth keeping", says: { about: "freed", value: 0 } },
      { id: "all", claim: "1048576 kB, because the pages belonged to a file that no longer exists", says: { about: "freed", value: 1048576 } },
      { id: "drop", claim: "The same as drop_caches would, since the effect on the file is the same", says: { about: "freed", value: 1073520 } },
      { id: "nothing", claim: "It depends on whether the pages were dirty at the time", says: { about: "nothing" } },
    ],
    why:
      "This is the mirror of the tmpfs case and the contrast is the point. Deleting a tmpfs file returns memory because the pages were the file. Deleting an ordinary file returns nothing that was not already yours: those pages were reclaimable the whole time, and MemAvailable has been counting them as available since they were written.",
    fix:
      "Stop reasoning about a disk file's page cache as memory you have spent. It is memory the kernel is using on your behalf and will stop using the instant you need it.",
    breaks: "removing a file gives you its page cache back",
  },
  {
    slug: "the-two-columns-side-by-side",
    name: "The two columns side by side",
    brief:
      "A host with 256 mebibytes in tmpfs and a 212 megabyte baseline, being read by somebody who has learned to look at shared as well as buff/cache.",
    setup: { host: "edge-03", job: "a session store", totalKb: 16481980, baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 24944, buffersKb: 8700, wroteKb: 262144, store: "tmpfs", attempt: "nothing" },
    question: "The bytes are in tmpfs. Do they survive a drop_caches?",
    options: [
      { id: "yes", claim: "Yes. There is no backing store to write them to and no other copy of them anywhere, so there is nothing the kernel could do except lose them, and it will not", says: { about: "survives", value: true } },
      { id: "no", claim: "No, they are in Cached and Cached is what drop_caches drops", says: { about: "survives", value: false } },
      { id: "shared", claim: "262144 kB of shared says they are there, which is a different question from whether they stay", says: { about: "shared", value: 262144 } },
      { id: "nothing", claim: "Only if something still has the file open", says: { about: "nothing" } },
    ],
    why:
      "Being in Cached is not what makes a page droppable. What makes a page droppable is having somewhere to put it, and a tmpfs page has nowhere: no file on a disk behind it and, on a machine with no swap, no swap either. The third option states the right figure for shared and answers a question nobody asked, which is the usual shape of being nearly right here.",
    fix:
      "Read the two columns together and subtract. buff/cache minus shared is roughly what a drop would get you, and shared is what you have actually spent.",
    breaks: "everything in Cached is droppable",
  },
];
