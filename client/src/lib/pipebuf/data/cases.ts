import type { Case } from "../types";

/** A pipe nobody resized. */
const CAP = 65_536;
/** Records each writer sends in the measured runs. */
const RECORDS = 200;

/**
 * Ten pipes, one writer in question each.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * running the writers against a simulated pipe rather than by reading the same
 * condition twice.
 */
export const CASES: Case[] = [
  {
    slug: "four-writers-at-the-limit",
    name: "Four thousand and ninety six",
    brief:
      "Four workers log to the same pipe, each line padded to exactly 4096 bytes. Somebody points out that four processes are writing to one file descriptor and asks whether the lines can come out mixed.",
    setup: { host: "worker-01", target: "pipe", requested: CAP, capacity: CAP, writers: [4096, 4096, 4096, 4096], underTest: 0, records: RECORDS },
    question: "Can one of these lines come out with another line inside it?",
    options: [
      { id: "never", claim: "No. At or under PIPE_BUF a write is never interleaved, and that is a guarantee rather than an observation", says: { about: "because", name: "at or under PIPE_BUF, which is guaranteed" } },
      { id: "yes", claim: "Yes. Four processes on one descriptor is exactly the race this describes", says: { about: "tears", value: true } },
      { id: "some", claim: "Some of them: 2 of the four writers are at risk", says: { about: "atRisk", value: 2 } },
      { id: "lock", claim: "No, but only because the kernel serializes writers behind a lock, which is not promised", says: { about: "because", name: "a file, where writes did not interleave here" } },
    ],
    why:
      "PIPE_BUF is 4096 and a write of that size or less is atomic against other writers. Measured: four writers at 4096, 200 records each, and every one of the 800 came out whole, in three runs. This is why a log line under four kilobytes is safe on a pipe and why log formats cap their lines.",
    fix:
      "Nothing to fix. Keep the lines under 4096 bytes and this stays true however many writers there are.",
    breaks: "a write can always be interleaved by another writer",
  },
  {
    slug: "the-guarantee-under-fire",
    name: "The small writer, with company",
    brief:
      "The same pipe, except one of the four is a different service whose records are 5000 bytes. The 4096 byte writers have not changed at all.",
    setup: { host: "worker-01", target: "pipe", requested: CAP, capacity: CAP, writers: [4096, 4096, 4096, 5000], underTest: 0, records: RECORDS },
    question: "How many of these four writers can have a record torn?",
    options: [
      { id: "none", claim: "0. Nothing here is big enough to be at risk", says: { about: "atRisk", value: 0 } },
      { id: "all", claim: "4. Once one writer is over the limit the pipe is unsafe for everyone on it", says: { about: "atRisk", value: 4 } },
      { id: "one", claim: "1, the 5000 byte writer. The other three are under PIPE_BUF and the guarantee does not care what else is going on", says: { about: "atRisk", value: 1 } },
      { id: "three", claim: "3, because the three small writers are the ones being interrupted", says: { about: "atRisk", value: 3 } },
    ],
    why:
      "The guarantee is per write, not per pipe. Measured with three writers at 4096 and one at 5000: the 4096 writers produced 200 of 200 whole records every run while the 5000 writer lost between 16 and 22. Somebody else being unsafe does not make you unsafe.",
    fix:
      "Nothing for the small writers. The 5000 byte one is the one to shorten, and it is the one whose lines are appearing mangled.",
    breaks: "one bad writer spoils the pipe for everybody",
  },
  {
    slug: "nine-hundred-and-four-bytes-over",
    name: "Nine hundred over",
    brief:
      "The same pipe again, and this time the question is about the 5000 byte writer itself. Its records are 22 percent over the limit and its author considers that close enough.",
    setup: { host: "worker-01", target: "pipe", requested: CAP, capacity: CAP, writers: [4096, 4096, 4096, 5000], underTest: 3, records: RECORDS },
    question: "Is 5000 bytes close enough to 4096?",
    options: [
      { id: "close", claim: "Yes, near enough. The risk is proportional and 22 percent over is barely a risk at all", says: { about: "tears", value: false } },
      { id: "no", claim: "No. Over PIPE_BUF the guarantee simply stops, and with nothing to align the records this one tears", says: { about: "because", name: "over PIPE_BUF with nothing to align it, so it tears" } },
      { id: "aligned", claim: "It is safe, because the records happen to divide the pipe capacity", says: { about: "because", name: "the records divide the capacity, which is luck" } },
      { id: "count", claim: "0 of its records are at risk", says: { about: "atRisk", value: 0 } },
    ],
    why:
      "There is nothing gradual about it. Measured at 4096: nothing torn in three runs. Measured at 4097: 84, 81 and 76 records of 800. One byte over the limit is not one byte worse, it is the difference between a guarantee and no guarantee.",
    fix:
      "Get the record under 4096, including whatever the logging library adds. If the payload cannot shrink, write it somewhere that is not a shared pipe.",
    breaks: "a slightly larger record is only slightly more dangerous",
  },
  {
    slug: "eight-kilobytes-and-fine",
    name: "Eight kilobytes, and fine",
    brief:
      "A different service writes 8192 byte records, four workers, one pipe. Twice the limit, and a soak test over a weekend found not a single mangled line.",
    setup: { host: "ingest-02", target: "pipe", requested: CAP, capacity: CAP, writers: [8192, 8192, 8192, 8192], underTest: 0, records: RECORDS },
    question: "It is double PIPE_BUF and it does not tear. Why not?",
    options: [
      { id: "guaranteed", claim: "It is under the real limit: PIPE_BUF only applies to writes over 8192", says: { about: "because", name: "at or under PIPE_BUF, which is guaranteed" } },
      { id: "tears", claim: "It does tear, and the soak test did not look for it", says: { about: "tears", value: true } },
      { id: "power", claim: "A power of two is always safe on a pipe", says: { about: "nothing" } },
      { id: "luck", claim: "8192 divides the 65536 capacity exactly, so the pipe never fills part way through a record and no writer is ever interrupted mid write. That is arithmetic, not a promise", says: { about: "because", name: "the records divide the capacity, which is luck" } },
    ],
    why:
      "Measured across nine record sizes: every size that divides 65536 exactly tore nothing in three runs out of three, and every size that does not tore between 70 and 354 of 800. 4096, 8192, 16384 and 32768 were clean; 4097, 5000, 8193, 12288 and 20000 were not. A writer is only interrupted part way through a record if the pipe fills part way through one.",
    fix:
      "Do not rely on it. It is true today and it is one configuration change away from not being true, which the next case is about.",
    breaks: "if it does not tear in testing it is safe",
  },
  {
    slug: "one-more-logger",
    name: "One more logger",
    brief:
      "The same 8192 byte service, unchanged, still four workers. A sidecar has been added that writes 5000 byte records to the same pipe. Nobody touched the workers and the workers' lines start coming out mangled.",
    setup: { host: "ingest-02", target: "pipe", requested: CAP, capacity: CAP, writers: [8192, 8192, 8192, 5000], underTest: 0, records: RECORDS },
    question: "The 8192 writers did not change. Why are they tearing now?",
    options: [
      { id: "unchanged", claim: "They are not. Only the new sidecar's records can be torn", says: { about: "tears", value: false } },
      { id: "gone", claim: "The alignment that was protecting them is gone: it depended on every writer using the same size, and now one does not", says: { about: "because", name: "over PIPE_BUF with nothing to align it, so it tears" } },
      { id: "sidecar", claim: "1 writer is at risk, the sidecar", says: { about: "atRisk", value: 1 } },
      { id: "capacity", claim: "The sidecar changed the pipe capacity when it opened the descriptor", says: { about: "nothing" } },
    ],
    why:
      "Measured: four writers at 8192 tore nothing, three runs out of three. Three at 8192 with one at 5000, and the 8192 writers lost 6, 6 and 14 records. Their code is identical. The thing that was keeping them whole was that the pipe always filled on a record boundary, and a writer with a different size means it no longer does.",
    fix:
      "Get everything on that pipe under 4096, which is the only arrangement that survives somebody adding a writer. Or give the sidecar its own pipe.",
    breaks: "the writers that changed are the ones that break",
  },
  {
    slug: "one-byte-past-eight-kilobytes",
    name: "One byte past",
    brief:
      "A serializer that used to emit exactly 8192 bytes gains a field and now emits 8193. Four workers, the same pipe, no other change.",
    setup: { host: "ingest-02", target: "pipe", requested: CAP, capacity: CAP, writers: [8193, 8193, 8193, 8193], underTest: 0, records: RECORDS },
    question: "One byte longer. What does that cost?",
    options: [
      { id: "nothing", claim: "Nothing measurable. One byte in eight kilobytes", says: { about: "tears", value: false } },
      { id: "prop", claim: "1 writer becomes marginal while the rest stay safe", says: { about: "atRisk", value: 1 } },
      { id: "all", claim: "All 4 writers start tearing, because 8193 no longer divides the capacity and nothing else was protecting them", says: { about: "atRisk", value: 4 } },
      { id: "align", claim: "Nothing, because 8193 still rounds to the same number of pages", says: { about: "because", name: "the records divide the capacity, which is luck" } },
    ],
    why:
      "Measured: 8192 tore nothing in three runs, 8193 tore 125, 125 and 139 of 800. The extra byte does not make the record marginally more likely to tear; it removes the only thing that was stopping it. This is why a field added to a log format can produce mangled lines in a service nobody deployed.",
    fix:
      "Under 4096, or accept that the format's size is now load bearing and write it down somewhere the next person will read.",
    breaks: "a round number of kilobytes is a safe record size",
  },
  {
    slug: "the-same-writers-on-a-file",
    name: "The same writers, on a file",
    brief:
      "Two services writing 512 byte lines and two writing 200000 byte records, all appending to one log file opened O_APPEND rather than sharing a pipe.",
    setup: { host: "ingest-02", target: "file", requested: CAP, capacity: CAP, writers: [512, 512, 200_000, 200_000], underTest: 2, records: RECORDS },
    question: "A 200000 byte record, fifty times PIPE_BUF. Does it come out whole?",
    options: [
      { id: "whole", claim: "It did here. Linux holds the inode lock for the length of a buffered write, so writes to one file do not interleave, and this is a measurement rather than a guarantee", says: { about: "because", name: "a file, where writes did not interleave here" } },
      { id: "torn", claim: "No. Fifty times PIPE_BUF is far past any atomicity", says: { about: "tears", value: true } },
      { id: "pipebuf", claim: "Yes, and it is the same PIPE_BUF guarantee that covers it", says: { about: "because", name: "at or under PIPE_BUF, which is guaranteed" } },
      { id: "risk", claim: "2 of these writers are at risk", says: { about: "atRisk", value: 2 } },
    ],
    why:
      "Measured: 512 and 200000 byte writers appending to one file, 200 records each, and every writer produced 200 whole records in every run. The lock the kernel takes for a write to a regular file covers the whole write. POSIX does not promise this above PIPE_BUF and it is not true over NFS, so it is worth knowing and not worth depending on.",
    fix:
      "Append to a file rather than sharing a pipe where you can. It is why myapp >> app.log behaves and myapp 2>&1 | tee app.log does not.",
    breaks: "a pipe and a file behave the same way",
  },
  {
    slug: "the-same-writers-on-a-pipe",
    name: "The same writers, on a pipe",
    brief:
      "The identical four services, the identical record sizes, except the log now goes through a pipe because somebody put tee in front of it.",
    setup: { host: "ingest-02", target: "pipe", requested: CAP, capacity: CAP, writers: [512, 512, 200_000, 200_000], underTest: 0, records: RECORDS },
    question: "How many of the four are at risk now?",
    options: [
      { id: "none", claim: "0. Adding tee does not change what any of them writes", says: { about: "atRisk", value: 0 } },
      { id: "four", claim: "4. A pipe has no lock, so nothing on it is safe", says: { about: "atRisk", value: 4 } },
      { id: "two", claim: "2, the pair writing 200000 bytes. The 512 byte writers keep their guarantee whatever is happening around them", says: { about: "atRisk", value: 2 } },
      { id: "one", claim: "It depends which of them writes first", says: { about: "nothing" } },
    ],
    why:
      "Putting tee in the line turns a file into a pipe and a write with a lock around it into a write with a 4096 byte guarantee. Measured with these exact sizes on a pipe: the 512 byte writers came out 200 of 200 whole every run and the 200000 byte writers lost between 40 and 76 records each.",
    fix:
      "tee is the change that broke it. If both destinations are needed, have the application write both, or keep every record under 4096.",
    breaks: "the big writers are the only ones at risk",
  },
  {
    slug: "the-resize-that-was-rounded",
    name: "Asking for forty thousand",
    brief:
      "An operator decides the pipe is too small and calls F_SETPIPE_SZ with 40000, reasoning that a bit more headroom will stop the writers blocking.",
    setup: { host: "ingest-02", target: "pipe", requested: 40_000, capacity: 65_536, writers: [8192, 8192, 8192, 8192], underTest: 0, records: RECORDS },
    question: "What capacity does the pipe actually end up with?",
    options: [
      { id: "asked", claim: "40000, which is what was asked for", says: { about: "granted", value: 40_000 } },
      { id: "pages", claim: "40960, rounded up to a whole number of pages", says: { about: "granted", value: 40_960 } },
      { id: "power", claim: "65536. F_SETPIPE_SZ rounds up to a power of two, so the request made no difference at all here", says: { about: "granted", value: 65_536 } },
      { id: "refused", claim: "The call is refused, because 40000 is not a multiple of the page size", says: { about: "granted", value: 0 } },
    ],
    why:
      "Measured: asking for 1 gives 4096, 4097 gives 8192, 40000 gives 65536 and 65537 gives 131072. It matters beyond the headroom, because the capacity is what the record sizes have to divide into, and an operator who asks for a number and gets a different one has changed the alignment without knowing it.",
    fix:
      "Read F_GETPIPE_SZ back after setting it. The number you get is the one that decides whether your records line up.",
    breaks: "F_SETPIPE_SZ gives you the size you ask for",
  },
  {
    slug: "the-resize-that-was-refused",
    name: "Asking for two megabytes",
    brief:
      "Having discovered the rounding, the same operator asks for two megabytes instead, to be well clear of any boundary. The service is not running as root.",
    setup: { host: "ingest-02", target: "pipe", requested: 2_097_152, capacity: 65_536, writers: [8192, 8192, 8192, 8192], underTest: 0, records: RECORDS },
    question: "What happens to the pipe?",
    options: [
      { id: "two", claim: "2097152, since it is already a power of two and needs no rounding", says: { about: "granted", value: 2_097_152 } },
      { id: "cap", claim: "1048576, silently clamped to fs.pipe-max-size", says: { about: "granted", value: 1_048_576 } },
      { id: "torn", claim: "It succeeds, and the writers start tearing because the new capacity does not divide their records", says: { about: "tears", value: true } },
      { id: "refused", claim: "Nothing: the call is refused with EPERM for being over fs.pipe-max-size, and the pipe stays exactly as it was", says: { about: "granted", value: 0 } },
    ],
    why:
      "fs.pipe-max-size is 1048576 on this host and an unprivileged process cannot exceed it. Measured: 1048576 is granted and 2097152 returns errno 1, EPERM. It is a refusal rather than a clamp, so a program that does not check the return value carries on with a pipe it thinks it resized.",
    fix:
      "Check the return value, and read F_GETPIPE_SZ back. A resize that failed and a resize that was rounded look identical from the inside if you do neither.",
    breaks: "a pipe can be made as large as you like",
  },
];
