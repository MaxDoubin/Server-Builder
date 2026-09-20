import type { Case } from "../types";

/**
 * Ten files, one lock each, and the question is always who gets it.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * replaying the descriptors and the open file descriptions as a table of
 * records rather than by evaluating the same conditions a second time.
 *
 * Six of the ten are the same lock file on the same host, deliberately. What
 * makes this class of bug hard is not that the situations differ. It is that
 * one line of the program differs, the one that says which of the three calls
 * to use, and the answer changes completely and silently.
 */
export const CASES: Case[] = [
  {
    slug: "two-daemons-one-lock-file",
    name: "Both of them got it",
    brief:
      "A collector holds an exclusive flock on /var/run/collect.lock for the length of its run. A second copy of the same job, shipped by a different team, guards the same path with fcntl. Both of them write.",
    setup: { host: "ingest-01", path: "/var/run/collect.lock", held: "flock", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "fcntl", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: [] },
    question: "Does the second process get the lock?",
    options: [
      { id: "yes", claim: "Yes. It gets the lock, at the same time, and neither side is told anything", says: { about: "granted", value: true } },
      { id: "no", claim: "No. One exclusive lock on a file is one exclusive lock, whichever call asked for it", says: { about: "granted", value: false } },
      { id: "range", claim: "No, and the reason is the range: both of them asked for the whole file", says: { about: "why", name: "a conflicting lock is held by the holder's description" } },
      { id: "owner", claim: "No, because a flock belongs to the process that took it and this is a different process", says: { about: "owner", name: "the process" } },
    ],
    why:
      "flock keeps its own list of locks and fcntl keeps another, and neither consults the other. Measured across all nine combinations of the three interfaces, twice: a flock holder blocks only another flock, and an fcntl holder blocks fcntl and open file description locks but never a flock. Two programs can guard the same file forever and never once contend.",
    fix:
      "Pick one interface for a given file and write it down where the next person will see it. If you cannot control both sides, flock is the safer default to standardize on, because its ownership rules hold no surprises.",
    breaks: "a lock is a lock, whichever call took it",
  },
  {
    slug: "the-list-they-are-not-on",
    name: "Two lists",
    brief:
      "The same pair of programs the other way around: the one holding a shared fcntl lock on the config file got there first, and the one asking is using flock.",
    setup: { host: "ingest-01", path: "/etc/collect/targets.yaml", held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: false, asking: "flock", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: [] },
    question: "What decides the outcome here?",
    options: [
      { id: "shared", claim: "The holder took a shared lock, and a shared lock does not stop anybody", says: { about: "why", name: "two shared locks do not conflict" } },
      { id: "lists", claim: "flock and fcntl keep separate lists and do not see each other, so the holder is invisible to this request", says: { about: "why", name: "flock and fcntl keep separate lists and do not see each other" } },
      { id: "ranges", claim: "The ranges: the holder took the whole file and so did the asker", says: { about: "why", name: "the byte ranges do not overlap" } },
      { id: "conflict", claim: "Nothing subtle. There is a conflicting lock and the request is refused", says: { about: "granted", value: false } },
    ],
    why:
      "The shared lock is a decoy. Even against an exclusive flock request this would be granted, and even if the fcntl lock had been exclusive it would still be granted, because the request is never compared against it at all. A shared lock only matters between two locks on the same list.",
    fix:
      "If you need a reader to hold off a writer, both of them have to be using the same interface. A shared fcntl lock protects you from fcntl writers and from nothing else.",
    breaks: "two locks on one file must interact somehow",
  },
  {
    slug: "the-library-that-read-the-file",
    name: "The unrelated close",
    brief:
      "A job takes an exclusive fcntl lock on its state file and holds it for the whole run. Half way through, a metrics library opens the same path to read one line, and closes it again. The job's own descriptor was never touched.",
    setup: { host: "batch-04", path: "/var/lib/rollup/state.db", held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "fcntl", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: ["closed another descriptor"] },
    question: "Does the job still hold its lock?",
    options: [
      { id: "held", claim: "Yes. It never called the unlock and its own descriptor is still open", says: { about: "stillHeld", value: true } },
      { id: "why-own", claim: "Yes, and an outsider asking now is refused because a conflicting lock is held", says: { about: "why", name: "a conflicting lock is held by the holder's process" } },
      { id: "gone", claim: "No. The lock went when the library closed its descriptor, and nothing in the job was involved", says: { about: "stillHeld", value: false } },
      { id: "blocked", claim: "Yes, and an outsider asking for the same bytes does not get them", says: { about: "granted", value: false } },
    ],
    why:
      "Closing any descriptor to a file releases all of that process's fcntl locks on that file, including locks taken through an entirely different descriptor. Measured: lock on one descriptor, open and close a second, and an outsider took the lock immediately. This is specified behavior and there is no way to opt out of it.",
    fix:
      "Use an open file description lock, F_OFD_SETLK, which is the same record lock with the ownership fixed. It survives an unrelated close, it was measured surviving one here, and it is otherwise a drop-in for what you already wrote.",
    breaks: "only unlocking or exiting releases a lock",
  },
  {
    slug: "the-same-read-under-flock",
    name: "The same read, one call different",
    brief:
      "The same job and the same metrics library, on a host where the job was written against flock instead. The library still opens the state file, reads its line, and closes.",
    setup: { host: "batch-05", path: "/var/lib/rollup/state.db", held: "flock", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "flock", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: ["closed another descriptor"] },
    question: "Can a second copy of the job start now?",
    options: [
      { id: "in", claim: "Yes, for the same reason as on the other host: the close dropped the lock", says: { about: "granted", value: true } },
      { id: "gone", claim: "No, but only because the second copy is on the same list; the lock itself is gone", says: { about: "stillHeld", value: false } },
      { id: "lists", claim: "Yes, because flock and fcntl keep separate lists and do not see each other", says: { about: "why", name: "flock and fcntl keep separate lists and do not see each other" } },
      { id: "out", claim: "No. A flock belongs to the open file description, and no descriptor of the holder's was closed", says: { about: "granted", value: false } },
    ],
    why:
      "The quirk in the case before this one belongs to fcntl alone. flock and open file description locks are held by the description rather than by the process, so closing some other descriptor to the same file has nothing to do with them. Measured: the same sequence, and the lock was still held.",
    fix:
      "Nothing to fix. This is the arrangement the previous case should have had.",
    breaks: "closing a descriptor always drops the lock",
  },
  {
    slug: "two-parts-of-one-process",
    name: "Two parts of one program",
    brief:
      "One process, two components. The importer opens the ledger and takes an exclusive fcntl lock before it writes. The reconciler, in the same process, opens the ledger separately and takes the same lock before it writes. Both of them were reviewed and both of them look right.",
    setup: { host: "ledger-02", path: "/srv/ledger/current.dat", held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "fcntl", asker: "the same process, a second descriptor", askerStart: 0, askerLength: 0, askerExclusive: true, events: [] },
    question: "What does an fcntl lock belong to?",
    options: [
      { id: "desc", claim: "The open file description, so the second component is asking as somebody else and waits", says: { about: "owner", name: "the open file description" } },
      { id: "proc", claim: "The process, so the second component is asking as the holder and is handed the lock", says: { about: "owner", name: "the process" } },
      { id: "blocked", claim: "It does not matter here: the second request is refused either way", says: { about: "granted", value: false } },
      { id: "nothing", claim: "The descriptor, which is why closing any other one releases it", says: { about: "nothing" } },
    ],
    why:
      "An fcntl lock is owned by the process. A second request from the same process is treated as the owner adjusting its own lock, so it is granted, and it silently replaces rather than conflicts. Measured: two descriptors in one process, both got the lock. fcntl gives you no mutual exclusion inside a process at all.",
    fix:
      "For exclusion between threads or components of one program, use a mutex, or use open file description locks, which are held per descriptor and did block the second request when measured.",
    breaks: "an fcntl lock excludes anything asking for the same file",
  },
  {
    slug: "the-forked-worker",
    name: "The worker it forked",
    brief:
      "A supervisor opens the queue file, takes an exclusive fcntl lock so nothing else can touch it, and forks a worker to do the write on the descriptor it inherited. The worker takes the lock first, because that is what the runbook says to do.",
    setup: { host: "queue-01", path: "/var/spool/jobs/queue.dat", held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "fcntl", asker: "the forked child", askerStart: 0, askerLength: 0, askerExclusive: true, events: [] },
    question: "Does the worker get the lock?",
    options: [
      { id: "yes", claim: "Yes. It inherited the descriptor, so it inherited the lock with it", says: { about: "granted", value: true } },
      { id: "why-desc", claim: "Yes, because both locks belong to the holder's description", says: { about: "why", name: "both locks belong to the holder's description" } },
      { id: "no", claim: "No. The lock belongs to the parent process and the worker is a different one", says: { about: "granted", value: false } },
      { id: "ranges", claim: "No, and the reason is that the ranges do not overlap", says: { about: "why", name: "the byte ranges do not overlap" } },
    ],
    why:
      "Locks are not inherited across fork. The child has the descriptor and therefore the open file description, but an fcntl lock is owned by the process, and the child is a new process with no locks of its own. Measured: the child asked on the inherited descriptor and was refused. Had the parent used flock or an open file description lock, the child would have been handed it.",
    fix:
      "Take the lock in the child rather than the parent, or use an open file description lock, which the child does inherit because it comes with the description.",
    breaks: "a child inherits its parent's locks",
  },
  {
    slug: "the-child-that-let-go",
    name: "The child that let go",
    brief:
      "A daemon takes an exclusive flock on its pid file at start up and never releases it, which is how a second copy is kept from starting. Later it forks a helper for an unrelated job, and the helper's cleanup path unlocks every descriptor it can see before exiting.",
    setup: { host: "agent-07", path: "/var/run/agent.pid", held: "flock", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "flock", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: ["the child unlocked"] },
    question: "Can a second copy of the daemon start now?",
    options: [
      { id: "no", claim: "No. The daemon is still running and never released anything", says: { about: "granted", value: false } },
      { id: "held", claim: "No, because the lock is still held by the description the daemon opened", says: { about: "stillHeld", value: true } },
      { id: "proc", claim: "No: a flock belongs to the process, and the helper was a different process", says: { about: "owner", name: "the process" } },
      { id: "yes", claim: "Yes. The helper's unlock released the daemon's lock, because both of them were holding one lock rather than two", says: { about: "granted", value: true } },
    ],
    why:
      "A flock is held by the open file description, and fork gives the child the same description rather than a copy. There is one lock, and either process can release it. Measured: the child called the unlock on the inherited descriptor and an outsider took the lock straight afterwards, with the parent still running and still believing it held it.",
    fix:
      "Close the inherited descriptor in the child, or set FD_CLOEXEC and exec, so the helper never has a descriptor it could unlock. A blanket unlock everything cleanup path is the dangerous part.",
    breaks: "only the process that took a lock can release it",
  },
  {
    slug: "the-unlock-that-did-nothing",
    name: "The unlock that did nothing",
    brief:
      "The same daemon and the same helper with the same cleanup path, on a host where the pid file is guarded with fcntl instead of flock.",
    setup: { host: "agent-08", path: "/var/run/agent.pid", held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "fcntl", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true, events: ["the child unlocked"] },
    question: "Does the daemon still hold its lock?",
    options: [
      { id: "held", claim: "Yes. The helper can only release its own process's locks, and it had none", says: { about: "stillHeld", value: true } },
      { id: "gone", claim: "No, the same as on the other host: the helper unlocked the descriptor it inherited", says: { about: "stillHeld", value: false } },
      { id: "granted", claim: "No, and a second copy of the daemon can start", says: { about: "granted", value: true } },
      { id: "lists", claim: "Yes, because flock and fcntl keep separate lists and do not see each other", says: { about: "why", name: "flock and fcntl keep separate lists and do not see each other" } },
    ],
    why:
      "The unlock is scoped the same way the lock is. fcntl locks belong to the process, so the child's unlock applies to the child's locks, of which there are none, and the parent is untouched. Measured: after the child unlocked, an outsider was still refused. Every difference between these two hosts comes from one word in the manual page.",
    fix:
      "Nothing here, but note that the safe behavior on this host and the dangerous one on the other are the same line of code. Which of the two you get depends only on which call the daemon used.",
    breaks: "an unlock on the right descriptor always works",
  },
  {
    slug: "two-records-in-one-file",
    name: "Two records, one file",
    brief:
      "A store keeps fixed size records in one file and locks the record it is about to touch rather than the file. One writer holds bytes 0 to 99 for the first record. Another writer wants the third record, bytes 200 to 299.",
    setup: { host: "store-03", path: "/srv/store/records.bin", held: "fcntl", holderStart: 0, holderLength: 100, holderExclusive: true, asking: "fcntl", asker: "another process", askerStart: 200, askerLength: 100, askerExclusive: true, events: [] },
    question: "Why does the second writer get its lock?",
    options: [
      { id: "lists", claim: "Because flock and fcntl keep separate lists and do not see each other", says: { about: "why", name: "flock and fcntl keep separate lists and do not see each other" } },
      { id: "shared", claim: "Because two shared locks do not conflict", says: { about: "why", name: "two shared locks do not conflict" } },
      { id: "ranges", claim: "Because the byte ranges do not overlap, and an fcntl lock covers a range rather than a file", says: { about: "why", name: "the byte ranges do not overlap" } },
      { id: "refused", claim: "It does not. The file is locked and the second writer waits", says: { about: "granted", value: false } },
    ],
    why:
      "fcntl and open file description locks are record locks: they cover a byte range, and two ranges that do not touch do not conflict. Measured: a holder on bytes 0 to 99 blocked an outsider asking for the same bytes and let one asking for 200 to 299 straight through. flock cannot do this at all, because a flock is always the whole file.",
    fix:
      "Nothing to fix, but know that this is the one thing flock cannot be swapped in for. A store that locks per record needs fcntl or the open file description version of it.",
    breaks: "locking a file locks the file",
  },
  {
    slug: "what-the-third-one-is-for",
    name: "The one that does what you meant",
    brief:
      "The ledger program from earlier, rewritten. Both components now take their lock with F_OFD_SETLK, and each of them still opens the ledger through its own descriptor.",
    setup: { host: "ledger-03", path: "/srv/ledger/current.dat", held: "ofd", holderStart: 0, holderLength: 0, holderExclusive: true, asking: "ofd", asker: "the same process, a second descriptor", askerStart: 0, askerLength: 0, askerExclusive: true, events: [] },
    question: "Does the second component get the lock?",
    options: [
      { id: "yes", claim: "Yes. It is still one process, and a record lock is owned by the process", says: { about: "granted", value: true } },
      { id: "why-proc", claim: "Yes, because both locks belong to the holder's process", says: { about: "why", name: "both locks belong to the holder's process" } },
      { id: "owner", claim: "No, and the thing it belongs to is the process", says: { about: "owner", name: "the process" } },
      { id: "no", claim: "No. An open file description lock is owned by the descriptor's description, so the second component is somebody else and waits", says: { about: "granted", value: false } },
    ],
    why:
      "This is what open file description locks were added for. They are the same record locks, on the same list, conflicting with fcntl locks in both directions, with the ownership moved from the process to the description. Measured: two descriptors in one process, and the second was refused, where fcntl granted it. They also survive an unrelated close and they are inherited by a forked child.",
    fix:
      "Nothing to fix. Of the three, this is the one whose rules match what people assume they are getting, and it has been in Linux since 3.15.",
    breaks: "the three interfaces are three spellings of one thing",
  },
];
