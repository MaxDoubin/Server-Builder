import type { Case } from "../types";

/** RLIMIT_SIGPENDING as this host ships it. */
const DEFAULT_LIMIT = 64_313;

/**
 * Ten senders and one receiver each.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * walking a pending set and a queue the way the kernel does, rather than by
 * evaluating the same conditions a second time.
 *
 * The first four are the same shape with one thing changed each time, because
 * the whole difficulty here is that the four combinations of standard against
 * realtime and kill against sigqueue do not behave the way the names suggest.
 */
export const CASES: Case[] = [
  {
    slug: "the-reload-that-happened-once",
    name: "Forty pushes, one reload",
    brief:
      "A configuration daemon reloads on SIGHUP. A deployment pushes forty tenant configurations in a burst, and the tool sends one SIGHUP per tenant. The daemon is busy writing the previous reload out when they arrive, so the signal is blocked for the length of that write.",
    setup: { host: "config-01", job: "rereads its configuration file", sig: 1, sends: 40, via: "kill", pendingLimit: DEFAULT_LIMIT, alsoQueued: [] },
    question: "How many times does it reload?",
    options: [
      { id: "one", claim: "1. A standard signal that is already pending is a bit in a mask, and setting it again does nothing", says: { about: "delivered", value: 1 } },
      { id: "all", claim: "40. Every send is a separate signal and each one runs the handler", says: { about: "delivered", value: 40 } },
      { id: "two", claim: "2. One for the first and one for whatever was still pending when the mask lifted", says: { about: "delivered", value: 2 } },
      { id: "queues", claim: "It depends on the queue depth, because SIGHUP queues like any other signal", says: { about: "queues", value: true } },
    ],
    why:
      "Signals below SIGRTMIN do not queue. The pending state for one is a single bit, so the second through fortieth sends set a bit that was already set. Measured: SIGUSR1 and SIGHUP both delivered exactly once whether 2, 5, 100 or 1000 were sent. Thirty nine tenants got no reload and nothing anywhere recorded it.",
    fix:
      "Do not carry a count in a standard signal. Have the handler set a flag and the main loop do the work once, reading whatever the current state is, which is what one reload of the whole file already does.",
    breaks: "a signal sent is a signal delivered",
  },
  {
    slug: "the-ones-that-went-nowhere",
    name: "The ones that went nowhere",
    brief:
      "A worker increments a counter on SIGUSR1 and the supervisor sends one per completed job. Five hundred jobs finish while the worker is inside a write that blocks the signal.",
    setup: { host: "worker-02", job: "increments a completed-jobs counter", sig: 10, sends: 500, via: "kill", pendingLimit: DEFAULT_LIMIT, alsoQueued: [] },
    question: "How many of the five hundred sends produce nothing at all?",
    options: [
      { id: "none", claim: "0. None of them are lost, they are only delayed until the mask lifts", says: { about: "lost", value: 0 } },
      { id: "most", claim: "499. The handler runs once and the other sends set a bit that was already set", says: { about: "lost", value: 499 } },
      { id: "delivered", claim: "500 arrive, because kill returned success for every one of them", says: { about: "delivered", value: 500 } },
      { id: "half", claim: "250, because the queue is drained as fast as it fills for roughly half of them", says: { about: "lost", value: 250 } },
    ],
    why:
      "Every one of the five hundred kill calls returned 0. One handler call happened. The counter is short by 499 and there is no error, no counter and no log line anywhere in the system that says so: the loss is invisible from both ends. This is the failure mode that makes signal-per-event designs wrong rather than merely lossy.",
    fix:
      "Count in shared memory or a pipe and use the signal only to say that something is there. A signal is an edge, never a quantity.",
    breaks: "a dropped signal reports itself somewhere",
  },
  {
    slug: "sigqueue-does-not-buy-a-queue",
    name: "Reaching for sigqueue",
    brief:
      "The team above reads that sigqueue queues signals and switches the supervisor to sigqueue, keeping SIGUSR1. The worker is unchanged and still blocks the signal for the length of a write.",
    setup: { host: "worker-03", job: "increments a completed-jobs counter", sig: 10, sends: 500, via: "sigqueue", pendingLimit: DEFAULT_LIMIT, alsoQueued: [] },
    question: "Does SIGUSR1 queue now?",
    options: [
      { id: "yes", claim: "Yes. That is what sigqueue is for, and it carries a value alongside", says: { about: "queues", value: true } },
      { id: "all", claim: "It does, and all 500 arrive", says: { about: "delivered", value: 500 } },
      { id: "no", claim: "No. Queueing belongs to the signal number, and SIGUSR1 is below SIGRTMIN whoever sends it", says: { about: "queues", value: false } },
      { id: "some", claim: "Partly: 499 of them queue and the first is delivered immediately", says: { about: "lost", value: 1 } },
    ],
    why:
      "Measured directly: 1000 sends of SIGUSR1 via sigqueue delivered one, exactly as via kill. sigqueue lets you attach a value and lets you find out when the queue is full, and it does not change what a signal number does. The counter is still short by 499.",
    fix:
      "Move to a signal at or above SIGRTMIN, which is 34 here. The sending call was never the thing to change.",
    breaks: "sigqueue is what makes a signal queue",
  },
  {
    slug: "kill-on-a-realtime-signal",
    name: "The old call, the new number",
    brief:
      "The same worker again, now using SIGRTMIN. The supervisor was not updated and is still calling plain kill, which somebody flags in review as the reason it will not work.",
    setup: { host: "worker-04", job: "increments a completed-jobs counter", sig: 34, sends: 500, via: "kill", pendingLimit: DEFAULT_LIMIT, alsoQueued: [] },
    question: "How many times does the handler run?",
    options: [
      { id: "one", claim: "1, because kill cannot queue and the review comment is right", says: { about: "delivered", value: 1 } },
      { id: "lost", claim: "499 are lost, the same as before, because nothing about the sender changed", says: { about: "lost", value: 499 } },
      { id: "nothing", claim: "It depends on whether the handler was installed with SA_SIGINFO", says: { about: "nothing" } },
      { id: "all", claim: "500. The number decides, and kill queues a realtime signal exactly as sigqueue does", says: { about: "delivered", value: 500 } },
    ],
    why:
      "Measured: 1000 sends of SIGRTMIN via kill delivered 1000, the same as via sigqueue. The review comment has it backwards. What kill costs you here is not the queue, it is knowing when the queue is full, which the next two cases are about.",
    fix:
      "Nothing to change for correctness. Move to sigqueue when you want to be told about overflow, or to carry a value.",
    breaks: "kill cannot queue anything",
  },
  {
    slug: "the-sender-that-was-told-nothing",
    name: "Five calls, five successes",
    brief:
      "A hardened image sets RLIMIT_SIGPENDING to 3. A supervisor sends five SIGRTMIN with kill while the receiver has it blocked, and checks the return value of every call.",
    setup: { host: "hardened-01", job: "appends one line to an audit log", sig: 34, sends: 5, via: "kill", pendingLimit: 3, alsoQueued: [] },
    question: "How many of the five kill calls return success?",
    options: [
      { id: "five", claim: "5. kill returns 0 for the ones it is about to drop, so the sender learns nothing", says: { about: "accepted", value: 5 } },
      { id: "two", claim: "2, matching the two that are actually delivered", says: { about: "accepted", value: 2 } },
      { id: "three", claim: "3, one per slot the limit allows", says: { about: "accepted", value: 3 } },
      { id: "delivered", claim: "All five are delivered, so the question does not arise", says: { about: "delivered", value: 5 } },
    ],
    why:
      "Measured at limits 1, 2, 3 and 4: kill accepted all five every time, and delivered 1, 1, 2 and 3 respectively. The audit log is short by three lines and the supervisor's error handling never fired, because there was no error to handle.",
    fix:
      "Use sigqueue if you need to know. It delivers the same number and returns EAGAIN for the rest, which is the only difference between the two calls that matters here.",
    breaks: "a send that returns success was delivered",
  },
  {
    slug: "the-sender-that-was-told",
    name: "The same five, sent the other way",
    brief:
      "The same hardened image and the same limit of 3, with the supervisor switched to sigqueue.",
    setup: { host: "hardened-02", job: "appends one line to an audit log", sig: 34, sends: 5, via: "sigqueue", pendingLimit: 3, alsoQueued: [] },
    question: "How many of the five sigqueue calls return success?",
    options: [
      { id: "five", claim: "5, the same as kill, because the queue is per signal rather than per user", says: { about: "accepted", value: 5 } },
      { id: "two", claim: "2, and the other three come back EAGAIN", says: { about: "accepted", value: 2 } },
      { id: "three", claim: "3, because the limit is 3", says: { about: "accepted", value: 3 } },
      { id: "more", claim: "It accepts more than kill did, which is the point of using it", says: { about: "delivered", value: 5 } },
    ],
    why:
      "The queue holds RLIMIT_SIGPENDING minus one, measured at seven different limits. So two are accepted and the third call onward returns EAGAIN. Two are delivered, which is exactly what kill delivered as well. Nothing about the receiver improved; the sender now knows.",
    fix:
      "Handle the EAGAIN. Back off, or count the drop, or drop deliberately. The information is the whole benefit.",
    breaks: "sigqueue delivers more than kill",
  },
  {
    slug: "the-queue-is-one-short",
    name: "One short of the limit",
    brief:
      "A collector uses SIGRTMIN+2 and the operator sets RLIMIT_SIGPENDING to 32, reasoning that 32 outstanding events is plenty of headroom. Sixty four are sent with sigqueue while the collector is blocked.",
    setup: { host: "collect-07", job: "records one event", sig: 36, sends: 64, via: "sigqueue", pendingLimit: 32, alsoQueued: [] },
    question: "How many times does the handler run?",
    options: [
      { id: "thirtytwo", claim: "32. The limit is the number of pending signals allowed", says: { about: "delivered", value: 32 } },
      { id: "all", claim: "64, because the receiver drains the queue as the sender fills it", says: { about: "delivered", value: 64 } },
      { id: "thirtyone", claim: "31. The queue holds one less than the limit, and the thirty second sigqueue is refused", says: { about: "delivered", value: 31 } },
      { id: "one", claim: "1, since the limit is reached immediately and the rest collapse", says: { about: "delivered", value: 1 } },
    ],
    why:
      "Measured at limits 1, 2, 4, 8, 16 and 32, and the number that got in was 0, 1, 3, 7, 15 and 31. The default limit here is 64313 and 64312 fit. It is also per real user rather than per process, so every process that user owns is drawing on the same allowance.",
    fix:
      "Size the limit as the events you must not lose plus one, and treat EAGAIN as a real condition rather than an impossible one. Better still, do not put the event count in the signal at all.",
    breaks: "the pending limit is the number you can have pending",
  },
  {
    slug: "which-handler-runs-first",
    name: "Which one runs first",
    brief:
      "A process has handlers for SIGUSR1, SIGUSR2, SIGRTMIN, SIGRTMIN+2 and SIGRTMIN+5. All five are blocked, one of each is queued, and the mask is then lifted. The handlers each log which signal they are.",
    setup: { host: "agent-11", job: "logs which signal it got", sig: 10, sends: 1, via: "sigqueue", pendingLimit: DEFAULT_LIMIT, alsoQueued: [12, 34, 36, 39] },
    question: "Which handler runs first?",
    options: [
      { id: "low", claim: "10, SIGUSR1. The kernel takes the lowest pending number first", says: { about: "firstHandler", value: 10 } },
      { id: "rt", claim: "34, SIGRTMIN, because realtime signals are delivered ahead of standard ones", says: { about: "firstHandler", value: 34 } },
      { id: "dequeue", claim: "Whichever sigtimedwait would take first, which is 12", says: { about: "firstDequeued", value: 12 } },
      { id: "high", claim: "39, SIGRTMIN+5. The kernel dequeues lowest first and builds a frame for each, so the last frame built is the first to run", says: { about: "firstHandler", value: 39 } },
    ],
    why:
      "Both halves of this are measured and they disagree, which is why it is worth knowing. sigtimedwait, which dequeues one at a time and runs nothing, took them 10, 12, 34, 36, 39. With handlers installed the order was 39, 36, 34, 12, 10, over five runs and four different sets, and the handlers did not nest: the deepest the depth counter reached was 1. The kernel dequeues lowest first and stacks a signal frame per signal before returning to user space, so they unwind in reverse.",
    fix:
      "Do not order work by signal number. If one handler must run before another, that is sequencing your program has to do, not something the numbers give you.",
    breaks: "the lowest numbered signal is handled first",
  },
  {
    slug: "which-one-comes-off-the-queue-first",
    name: "The same five, waited for",
    brief:
      "The same process, rewritten to block everything and call sigtimedwait in a loop rather than install handlers. SIGRTMIN+5 is queued first, then SIGHUP, SIGUSR1 and SIGTERM.",
    setup: { host: "agent-12", job: "waits with sigtimedwait and dispatches", sig: 39, sends: 1, via: "sigqueue", pendingLimit: DEFAULT_LIMIT, alsoQueued: [1, 10, 15] },
    question: "Which signal does the first sigtimedwait return?",
    options: [
      { id: "low", claim: "1, SIGHUP. Dequeue order is the lowest pending number, whatever order they arrived in", says: { about: "firstDequeued", value: 1 } },
      { id: "sent", claim: "39, SIGRTMIN+5, because it was queued first and the queue is in order", says: { about: "firstDequeued", value: 39 } },
      { id: "handler", claim: "Also SIGHUP, and the handlers would have run in that order too", says: { about: "firstHandler", value: 1 } },
      { id: "usr", claim: "10, SIGUSR1, because the standard signals go first and SIGHUP is special", says: { about: "firstDequeued", value: 10 } },
    ],
    why:
      "Measured: SIGTERM, SIGUSR1 and SIGHUP queued in that order came off as 1, 10, 15. A scrambled send order of five signals came off as 10, 12, 34, 36, 39, identical to sending them in ascending order. Only instances of the same realtime signal keep their arrival order: eight SIGRTMIN carrying 100 to 107 came off as 100 to 107.",
    fix:
      "Nothing to fix, but note that moving from handlers to sigtimedwait reverses the order your code sees things in, which has surprised people mid migration.",
    breaks: "a signal queue is a queue in the order you sent things",
  },
  {
    slug: "the-limit-that-refused-everything",
    name: "A limit of one",
    brief:
      "A hardening pass sets RLIMIT_SIGPENDING to 1, on the reasoning that one pending signal is all anything should need. A service sends five SIGRTMIN with sigqueue and does not check the return value.",
    setup: { host: "hardened-03", job: "flushes a batch", sig: 34, sends: 5, via: "sigqueue", pendingLimit: 1, alsoQueued: [] },
    question: "How many times does the handler run?",
    options: [
      { id: "one", claim: "1. One pending signal is allowed and one is what gets through", says: { about: "delivered", value: 1 } },
      { id: "five", claim: "5, because the receiver is unblocked long before the fifth is sent", says: { about: "delivered", value: 5 } },
      { id: "zero", claim: "0. The queue holds the limit minus one, so it holds nothing and every sigqueue is refused", says: { about: "delivered", value: 0 } },
      { id: "accepted", claim: "The sends all succeed, so 5 of them are accepted", says: { about: "accepted", value: 5 } },
    ],
    why:
      "Measured at a limit of 1: sigqueue returned EAGAIN on the first call and the handler never ran. The same five sent with kill delivered one, because when kill cannot allocate a queue entry the kernel still sets the pending bit and delivers the signal without its siginfo. Two calls that behave identically at every sane limit part company at this one.",
    fix:
      "Do not set RLIMIT_SIGPENDING to 1. If the intent is to bound a queue, the smallest useful value is 2, and a service that relies on sigqueue needs the limit sized for its burst plus one.",
    breaks: "a limit of one lets one through",
  },
];
