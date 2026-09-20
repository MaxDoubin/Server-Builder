/**
 * A thousand signals sent, and one handler call.
 *
 * Measured on the host this was written on, kernel 6.18.44, in C rather than in
 * a scripting language: the first attempt at this used Python, which sets a
 * flag in its C handler and runs the Python one at the next bytecode boundary,
 * so every queued signal collapsed into a single call and the interesting
 * result disappeared into the interpreter. The numbers below come from a
 * volatile sig_atomic_t incremented in a real handler.
 *
 * Every trial blocks the signal, sends it N times, then unblocks, so nothing
 * here depends on a race.
 *
 * FIRST, standard signals do not queue, and nothing tells you:
 *
 *     SIGUSR1   sent    1   delivered 1
 *     SIGUSR1   sent    2   delivered 1
 *     SIGUSR1   sent    5   delivered 1
 *     SIGUSR1   sent  100   delivered 1
 *     SIGUSR1   sent 1000   delivered 1
 *
 * SIGHUP gave the same five rows. A standard signal that is already pending is
 * a bit in a mask, and setting a bit twice sets it once. The 999 that went
 * nowhere produced no error at the sender, no counter anywhere, and nothing the
 * receiver can inspect. This is why a reload-on-SIGHUP service under a
 * configuration push reloads once, and why a work-queued-per-signal design is
 * broken in a way that only appears under load.
 *
 * SECOND, realtime signals do queue:
 *
 *     SIGRTMIN  sent    1   delivered    1
 *     SIGRTMIN  sent    2   delivered    2
 *     SIGRTMIN  sent    5   delivered    5
 *     SIGRTMIN  sent  100   delivered  100
 *     SIGRTMIN  sent 1000   delivered 1000
 *
 * THIRD, and this is the part that is usually stated backwards: which of the
 * two happens is decided by the SIGNAL NUMBER, not by the call you used.
 *
 *     SIGUSR1  via kill      1000 sent, 1 delivered
 *     SIGUSR1  via sigqueue  1000 sent, 1 delivered
 *     SIGRTMIN via kill      1000 sent, 1000 delivered
 *     SIGRTMIN via sigqueue  1000 sent, 1000 delivered
 *
 * sigqueue on a standard signal still coalesces. kill on a realtime signal
 * still queues. Reaching for sigqueue does not buy you a queue; reaching for a
 * signal number at or above SIGRTMIN does.
 *
 * FOURTH, what the call does decide is whether the sender is told. Sending 5
 * SIGRTMIN at various values of RLIMIT_SIGPENDING:
 *
 *     limit   via        accepted   delivered
 *         1   kill              5           1
 *         1   sigqueue          0           0    EAGAIN
 *         2   kill              5           1
 *         2   sigqueue          1           1    EAGAIN
 *         3   kill              5           2
 *         3   sigqueue          2           2    EAGAIN
 *         4   kill              5           3
 *         4   sigqueue          3           3    EAGAIN
 *
 * The delivered column is the same either way. kill returns 0 for signals it is
 * about to drop; sigqueue returns EAGAIN and lets you decide. That, and not
 * queueing, is the difference between them.
 *
 * FIFTH, the queue holds RLIMIT_SIGPENDING minus one:
 *
 *     limit       1   sigqueue succeeded     0 times, then EAGAIN
 *     limit       2                          1
 *     limit       4                          3
 *     limit       8                          7
 *     limit      16                         15
 *     limit      32                         31
 *     limit   64313                      64312
 *
 * 64313 is the default here and it is per real user, shared by every process
 * they own. At a limit of 1 you cannot queue a single one.
 *
 * SIXTH, order. Dequeued with sigtimedwait, which takes them one at a time and
 * runs no handlers, the lowest number always comes first, whatever order they
 * were sent in:
 *
 *     queued SIGRTMIN+5, SIGUSR2, SIGRTMIN, SIGUSR1, SIGRTMIN+2
 *       dequeued 10, 12, 34, 36, 39
 *     queued SIGUSR1, SIGUSR2, SIGRTMIN, SIGRTMIN+2, SIGRTMIN+5
 *       dequeued 10, 12, 34, 36, 39
 *     queued SIGTERM, SIGUSR1, SIGHUP
 *       dequeued 1, 10, 15
 *
 * SEVENTH, and this is the one nobody expects: with handlers installed instead,
 * they run in the opposite order.
 *
 *     five queued while blocked, then unblocked
 *       handlers ran 39, 36, 34, 12, 10, and the deepest nesting was 1
 *     SIGHUP, SIGUSR1, SIGUSR2, SIGTERM
 *       handlers ran 15, 12, 10, 1
 *
 * Five runs, four different sets, the same answer every time. The handlers do
 * not nest: each one returns before the next begins, so the depth counter never
 * leaves 1. The kernel dequeues lowest first and builds a signal frame for each
 * one before it returns to user space, and each frame's saved context is the
 * previous handler's entry, so the last frame built is the first to run and
 * they unwind downward. Lowest first is true of the dequeue and false of your
 * code.
 *
 * EIGHTH, instances of one realtime signal keep the order they were sent in:
 * eight SIGRTMIN carrying 100 to 107 arrived as 100 to 107.
 *
 * Not modeled: signals 32 and 33, which glibc reserves for its own threading
 * and which are the reason SIGRTMIN reads as 34 rather than the kernel's 32,
 * and which were not measured here; SIGKILL and SIGSTOP, which cannot be
 * caught or blocked;
 * SA_RESTART and the EINTR that follows from its absence; signalfd; the
 * synchronous signals (SIGSEGV, SIGBUS, SIGFPE, SIGILL) which the kernel
 * dequeues before anything else; per-thread delivery and pthread_kill; and
 * si_code, which distinguishes these senders and which this model ignores.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What the receiving process does when it gets one. */
  job: string;
  /** The signal number being sent repeatedly. */
  sig: number;
  /** How many were sent while the receiver had it blocked. */
  sends: number;
  /** Which call sent them. */
  via: "kill" | "sigqueue";
  /** RLIMIT_SIGPENDING on the box. The default here is 64313. */
  pendingLimit: number;
  /** Other signal numbers queued at the same moment, one each. */
  alsoQueued: number[];
}

export type Claim =
  /** How many times the handler runs. */
  | { about: "delivered"; value: number }
  /** How many of the sends produce nothing. */
  | { about: "lost"; value: number }
  /** How many send calls return success. */
  | { about: "accepted"; value: number }
  /** Whether this signal queues at all. */
  | { about: "queues"; value: boolean }
  /** Which signal's handler runs first. */
  | { about: "firstHandler"; value: number }
  /** Which signal sigtimedwait would take first. */
  | { about: "firstDequeued"; value: number }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
