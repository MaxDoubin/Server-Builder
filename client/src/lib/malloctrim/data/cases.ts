import type { Case } from "../types";

/**
 * Ten heaps, one question each.
 *
 * Every figure here is the model's, and the model reproduces the measured
 * runs: the 20184 KiB free() returned when everything was freed, the nothing
 * it returned when one chunk survived, the 1000 KiB left after a trim with
 * two hundred sparse survivors, and both edges of the band of earlier
 * allocation sizes that switches the automatic trim off.
 */
export const CASES: Case[] = [
  {
    slug: "the-twenty-megabytes-that-came-back",
    name: "Twenty megabytes, all of it freed",
    brief:
      "A batch job builds a working set of twenty thousand small records, finishes with them, and frees every one. Nothing else in the process is holding anything.",
    setup: {
      host: "batch-01",
      job: "ingest",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 0,
      pinnedBytes: 0,
      trims: false,
    },
    question: "How much does free() give back to the operating system, with nothing else called?",
    options: [
      { id: "a", claim: "20184 KiB, nearly all of it, because the freed chunks consolidate into the top of the heap and free() calls sbrk down before it returns.", says: { about: "freeReturns", value: 20184 } },
      { id: "b", claim: "Nothing. free() returns memory to the allocator, never to the kernel, and only exit does that.", says: { about: "freeReturns", value: 0 } },
      { id: "c", claim: "10240 KiB, half of it, since the allocator keeps a reserve the size of the working set.", says: { about: "freeReturns", value: 10240 } },
      { id: "d", claim: "It depends on the kernel, not on glibc, and the process cannot influence it.", says: { about: "nothing" } },
    ],
    why:
      "Measured: 22092 kB resident with all twenty thousand touched, 1912 kB after the last free, and malloc_trim was never called. Freeing them all lets every chunk coalesce into one region at the top, that region passes M_TRIM_THRESHOLD, and free() shrinks the break on its way out.",
    fix: "nothing to fix here. This is the case everybody assumes is normal, and it is the only one in this set that behaves the way the assumption says.",
    breaks: "that free() never returns memory to the kernel",
  },
  {
    slug: "the-one-chunk-that-stayed",
    name: "One record, still live",
    brief:
      "The same twenty thousand records, freed in the same order, except that the last one allocated is still referenced by a cache and is not freed.",
    setup: {
      host: "batch-02",
      job: "ingest",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "one on top",
      everyNth: 0,
      earlierBytes: 0,
      pinnedBytes: 0,
      trims: false,
    },
    question: "How much does free() give back this time?",
    options: [
      { id: "a", claim: "20180 KiB, one kilobyte less than before, because one kilobyte is still in use.", says: { about: "freeReturns", value: 20180 } },
      { id: "b", claim: "Nothing at all. The survivor sits above everything freed, so the free space never reaches the top of the heap and the trim never fires.", says: { about: "freeHelps", value: false } },
      { id: "c", claim: "20184 KiB, the same as before, since a single kilobyte rounds away.", says: { about: "freeReturns", value: 20184 } },
      { id: "d", claim: "8 KiB, which is the one page the survivor sits in plus its neighbor.", says: { about: "freeReturns", value: 8 } },
    ],
    why:
      "Measured: 22088 kB before the frees and 22088 kB after them. The heap only shrinks from the top, and something is at the top. One kilobyte out of twenty megabytes decides whether twenty megabytes comes back, and it is not the kilobyte that matters but where it sits.",
    fix:
      "call malloc_trim(0) after the batch. It releases the free pages underneath the survivor, which free() cannot reach.",
    breaks: "that what free() returns depends on how much you freed",
  },
  {
    slug: "the-survivors-that-were-far-apart",
    name: "Two hundred survivors, and a trim",
    brief:
      "A parser keeps every hundredth record and frees the rest, then calls malloc_trim(0) because somebody read that it helps. Two hundred kilobytes of the twenty megabytes is genuinely still in use.",
    setup: {
      host: "parse-01",
      job: "parser",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "sparse survivors",
      everyNth: 100,
      earlierBytes: 0,
      pinnedBytes: 0,
      trims: true,
    },
    question: "How much is the process still holding when it is all done?",
    options: [
      { id: "a", claim: "200 KiB, which is what is still live, because malloc_trim releases everything else.", says: { about: "held", value: 200 } },
      { id: "b", claim: "20313 KiB, all of it, because a survivor anywhere means nothing can be given back.", says: { about: "held", value: 20313 } },
      { id: "c", claim: "1000 KiB, five times what is live, because every survivor pins the whole page it sits in and the pages are four kilobytes.", says: { about: "held", value: 1000 } },
      { id: "d", claim: "The heap cannot be measured from inside the process, so there is no figure to give.", says: { about: "nothing" } },
    ],
    why:
      "Measured: 22084 kB after the frees, 2788 kB after the trim. malloc_trim walks the arena's free chunks and hands back whole pages with MADV_DONTNEED, anywhere in the heap and not only at the top. Two hundred survivors, one page each, and the twenty thousand pages between them go.",
    fix:
      "nothing, but know the ratio. Two hundred kilobytes of live data costs a megabyte of resident memory, and that factor of five is the page, not a leak.",
    breaks: "that what a heap costs is what is live in it",
  },
  {
    slug: "the-survivors-that-were-not",
    name: "Ten thousand survivors, and the same trim",
    brief:
      "The same twenty thousand records and the same malloc_trim(0), except that this parser keeps every other one. Ten megabytes is genuinely live.",
    setup: {
      host: "parse-02",
      job: "parser",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "dense survivors",
      everyNth: 2,
      earlierBytes: 0,
      pinnedBytes: 0,
      trims: true,
    },
    question: "Does calling malloc_trim(0) return anything here that free() did not?",
    options: [
      { id: "a", claim: "Yes. It always returns something, since it releases free pages anywhere in the arena rather than only at the top.", says: { about: "trimHelps", value: true } },
      { id: "b", claim: "10160 KiB is left, which is the half that was never freed.", says: { about: "held", value: 10160 } },
      { id: "c", claim: "It returns half of what it returned with two hundred survivors, because twice as much is live.", says: { about: "held", value: 500 } },
      { id: "d", claim: "No. The survivors are about two kilobytes apart, so no whole page anywhere in the heap is free, and there is nothing for MADV_DONTNEED to be called on.", says: { about: "trimHelps", value: false } },
    ],
    why:
      "Measured: 22084 kB after the frees and 22084 kB after the trim, not one page recovered. Compare the parser that kept two hundred records and got a megabyte: that one held less and recovered more. What decides it is how far apart the survivors are, not how many bytes they are.",
    fix:
      "the allocator cannot help. Either allocate the long lived records from their own pool so they sit together, or copy the survivors into a fresh array and free the originals.",
    breaks: "that fragmentation is about how much is live rather than how it is spread",
  },
  {
    slug: "the-block-that-came-back",
    name: "The ten megabyte buffer",
    brief:
      "A media service allocates one ten megabyte buffer, fills it, and frees it. This is the first allocation of that size the process has made.",
    setup: {
      host: "media-01",
      job: "transcoder",
      chunks: 1,
      chunkBytes: 10 * 1024 * 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 0,
      pinnedBytes: 0,
      trims: false,
    },
    question: "Where does that buffer come from?",
    options: [
      { id: "a", claim: "mmap, a mapping of its own, because the request is over M_MMAP_THRESHOLD and glibc hands anything that large straight to the kernel.", says: { about: "source", value: "mmap" } },
      { id: "b", claim: "The heap, grown with brk, because that is where malloc always gets memory.", says: { about: "source", value: "heap" } },
      { id: "c", claim: "Nothing comes back when it is freed, whichever it is.", says: { about: "freeHelps", value: false } },
      { id: "d", claim: "6144 KiB of it comes back and the rest is kept as a reserve.", says: { about: "freeReturns", value: 6144 } },
    ],
    why:
      "Measured: mallinfo2 reported 10489856 bytes in one mapping while the buffer was live, and zero the moment it was freed, with resident memory going 11928 kB to 1684 kB. A chunk over the threshold is its own mapping and free() munmaps it.",
    fix:
      "nothing. This is the behavior people remember, and it is real. The next case is what happens when you do it twice.",
    breaks: "that every allocation comes out of one heap",
  },
  {
    slug: "the-same-block-a-second-time",
    name: "The same buffer, one frame later",
    brief:
      "The same service, the same ten megabyte buffer, allocated and freed once already. Nothing in the code changed between the two calls.",
    setup: {
      host: "media-02",
      job: "transcoder",
      chunks: 1,
      chunkBytes: 10 * 1024 * 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 10 * 1024 * 1024,
      pinnedBytes: 0,
      trims: false,
    },
    question: "How much does free() give back the second time?",
    options: [
      { id: "a", claim: "10244 KiB, the same as the first time, because the same call does the same thing.", says: { about: "freeReturns", value: 10244 } },
      { id: "b", claim: "Nothing. Freeing the first buffer raised M_MMAP_THRESHOLD to that buffer's mapping, so the second request is under the threshold and comes from the heap.", says: { about: "freeReturns", value: 0 } },
      { id: "c", claim: "5120 KiB, since the allocator keeps half of a repeated allocation as a cache.", says: { about: "freeReturns", value: 5120 } },
      { id: "d", claim: "It still comes from mmap, so the question of the heap does not arise.", says: { about: "source", value: "mmap" } },
    ],
    why:
      "Measured, three rounds in one process: round one mapped 10489856 bytes and gave all of it back, rounds two and three reported no mappings at all and gave back nothing, at 11924 kB each time. glibc sets mmap_threshold to the size of a freed mapping so that a program repeating an allocation stops paying for the mapping. The cost of that is that it stops getting the memory back.",
    fix:
      "call mallopt(M_MMAP_THRESHOLD, n) before the first allocation. It pins the threshold and switches the adjustment off, and then every round maps and unmaps.",
    breaks: "that the same allocation behaves the same way twice",
  },
  {
    slug: "the-allocation-that-switched-it-off",
    name: "The sixteen megabyte read that changed everything",
    brief:
      "The ingest job from the first case, unchanged, except that at startup it reads a sixteen mebibyte configuration blob into one allocation, parses it, and frees it.",
    setup: {
      host: "batch-03",
      job: "ingest",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 16 * 1024 * 1024,
      pinnedBytes: 0,
      trims: false,
    },
    question: "How much does free() give back at the end of the batch now?",
    options: [
      { id: "a", claim: "20184 KiB, as before. A startup allocation that was freed at startup cannot affect anything later.", says: { about: "freeReturns", value: 20184 } },
      { id: "b", claim: "4184 KiB, the working set less the size of the blob.", says: { about: "freeReturns", value: 4184 } },
      { id: "c", claim: "Nothing at all. Freeing the blob set M_TRIM_THRESHOLD to twice its mapping, which is more than the whole working set, so the automatic trim can never fire again in this process.", says: { about: "freeHelps", value: false } },
      { id: "d", claim: "16384 KiB, the size of the blob, released late.", says: { about: "freeReturns", value: 16384 } },
    ],
    why:
      "Measured: the identical twenty megabyte workload run twice in one process, with one allocate-touch-free in between. At nine mebibytes in between, free() still gave the twenty megabytes back; at ten through thirty one, it gave back nothing, on that run and every later one. Freeing an mmapped chunk sets mmap_threshold to its size and trim_threshold to twice that, and both stay there.",
    fix:
      "pin the thresholds with mallopt before anything large is allocated, or call malloc_trim(0) yourself at the end of each batch and stop depending on the automatic one.",
    breaks: "that one allocation cannot change how later unrelated ones behave",
  },
  {
    slug: "the-bigger-one-that-did-not",
    name: "The thirty three megabyte read that did not",
    brief:
      "The same ingest job and the same startup read, except that the configuration blob has grown to thirty three mebibytes.",
    setup: {
      host: "batch-04",
      job: "ingest",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 33 * 1024 * 1024,
      pinnedBytes: 0,
      trims: false,
    },
    question: "How much is the process still holding at the end of the batch?",
    options: [
      { id: "a", claim: "20313 KiB. A bigger blob can only make the previous case worse.", says: { about: "held", value: 20313 } },
      { id: "b", claim: "33792 KiB, since the blob is now too big for the allocator to release.", says: { about: "held", value: 33792 } },
      { id: "c", claim: "Nothing at all is held, because a blob that large is always a separate mapping.", says: { about: "held", value: 0 } },
      { id: "d", claim: "129 KiB, because a chunk over 32 MiB is past DEFAULT_MMAP_THRESHOLD_MAX and does not move the thresholds at all, so the automatic trim still fires and leaves M_TOP_PAD behind.", says: { about: "held", value: 129 } },
    ],
    why:
      "Measured: thirty and thirty one mebibytes in between left the batch holding everything, and thirty two, thirty three and sixty four gave it all back. The adjustment only applies while the freed chunk is at or under DEFAULT_MMAP_THRESHOLD_MAX, which is 32 MiB on 64 bit. So there is a band, and above it things work again. A thirty three megabyte allocation is safer here than a twenty megabyte one.",
    fix:
      "do not rely on either side of the band. Pin the thresholds, or trim explicitly.",
    breaks: "that a larger allocation is always the more expensive one",
  },
  {
    slug: "the-heap-that-would-not-shrink",
    name: "Two buffers, and the second one held",
    brief:
      "A service pins M_MMAP_THRESHOLD at a gigabyte so that everything comes from the heap, allocates two eight mebibyte buffers, and frees the first while still using the second.",
    setup: {
      host: "svc-01",
      job: "encoder",
      chunks: 2,
      chunkBytes: 8 * 1024 * 1024,
      pattern: "one on top",
      everyNth: 0,
      earlierBytes: 0,
      pinnedBytes: 1073741824,
      trims: false,
    },
    question: "How much is the process holding after that free?",
    options: [
      { id: "a", claim: "16384 KiB, both of them, because the freed buffer is underneath the live one and the heap only shrinks from the top.", says: { about: "held", value: 16384 } },
      { id: "b", claim: "8196 KiB, the buffer that is still in use, because the other one was freed.", says: { about: "held", value: 8196 } },
      { id: "c", claim: "The first buffer was mmapped, so freeing it unmapped it whatever else is live.", says: { about: "source", value: "mmap" } },
      { id: "d", claim: "128 KiB, which is M_TOP_PAD, with everything else returned.", says: { about: "held", value: 128 } },
    ],
    why:
      "Measured with sixteen bytes rather than eight megabytes above the freed block: 9812 kB before the free and 9812 kB after it, and the same block freed with nothing above it went to 1748 kB. What is above the free space decides the whole thing, and its size does not come into it.",
    fix:
      "call malloc_trim(0), which releases the pages under the live buffer and brings this down to the eight mebibytes that are really in use.",
    breaks: "that freeing a large block always shows up in the process size",
  },
  {
    slug: "the-mallopt-that-put-it-back",
    name: "The same job, with one line added",
    brief:
      "The ingest job that reads a sixteen mebibyte blob at startup, with mallopt(M_MMAP_THRESHOLD, 131072) called before anything else, which pins the threshold where glibc's default already was.",
    setup: {
      host: "batch-05",
      job: "ingest",
      chunks: 20000,
      chunkBytes: 1024,
      pattern: "all freed",
      everyNth: 0,
      earlierBytes: 16 * 1024 * 1024,
      pinnedBytes: 131072,
      trims: false,
    },
    question: "Does free() give anything back at the end of the batch?",
    options: [
      { id: "a", claim: "No. Pinning the threshold at the value it already had cannot change anything.", says: { about: "freeHelps", value: false } },
      { id: "b", claim: "Yes, 20184 KiB of it, because the mallopt call also sets no_dyn_threshold, so freeing the blob no longer moves either threshold and the automatic trim still works.", says: { about: "freeReturns", value: 20184 } },
      { id: "c", claim: "It gives back 16384 KiB, the size of the blob, and keeps the working set.", says: { about: "freeReturns", value: 16384 } },
      { id: "d", claim: "It gives back 10240 KiB, half of the working set.", says: { about: "freeReturns", value: 10240 } },
    ],
    why:
      "The value passed is not the point: what matters is that calling mallopt at all switches the dynamic adjustment off for the life of the process. Measured directly, with M_MMAP_THRESHOLD pinned at 131072, a ten megabyte buffer allocated and freed three times in a row mapped and unmapped all three times, where without the call only the first one did.",
    fix:
      "if you allocate anything large and care about resident memory, make that call the first thing main does. One line, and the allocator stops changing its own configuration behind you.",
    breaks: "that setting a value to what it already is has no effect",
  },
];
