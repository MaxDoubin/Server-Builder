## One reload, forty pushes

A configuration daemon reloads on SIGHUP. A deploy pushes forty tenants and
sends one SIGHUP per tenant. One reload happens.

That is not a race and it is not a bug in the daemon. Blocking the signal,
sending it N times, then unblocking, with the handler calls counted in C:

```
SIGUSR1   sent    1   delivered 1
SIGUSR1   sent    2   delivered 1
SIGUSR1   sent    5   delivered 1
SIGUSR1   sent  100   delivered 1
SIGUSR1   sent 1000   delivered 1
```

SIGHUP gives the same five rows. The pending state for a standard signal is one
bit in a mask, and setting a bit that is already set does nothing at all.

A note on how that was measured, because the first attempt got a wrong answer
that looked right: in Python, the C-level handler sets a flag and the
interpreter runs the Python handler at the next bytecode boundary, so every
queued signal collapses into one call. Python reports one delivery for realtime
signals too, and the whole distinction disappears into the runtime. The numbers
above are a `volatile sig_atomic_t` incremented in a real handler.

## Realtime signals do queue

```
SIGRTMIN  sent    1   delivered    1
SIGRTMIN  sent    2   delivered    2
SIGRTMIN  sent    5   delivered    5
SIGRTMIN  sent  100   delivered  100
SIGRTMIN  sent 1000   delivered 1000
```

`SIGRTMIN` is 34 here and `SIGRTMAX` is 64, so there are 31 of them. Below 34
there is no queue.

## The part that is usually said backwards

The common advice is to use `sigqueue` instead of `kill` if you want signals to
queue. All four combinations:

```
SIGUSR1  via kill      1000 sent, 1 delivered
SIGUSR1  via sigqueue  1000 sent, 1 delivered
SIGRTMIN via kill      1000 sent, 1000 delivered
SIGRTMIN via sigqueue  1000 sent, 1000 delivered
```

`sigqueue` on a standard signal still coalesces. Plain `kill` on a realtime
signal still queues all thousand. The queue belongs to the signal number.
Switching the sending call and keeping SIGUSR1 changes nothing, which is a
particularly frustrating way to spend an afternoon.

## What the call does decide is whether you are told

Five SIGRTMIN at various values of `RLIMIT_SIGPENDING`:

```
limit   via        accepted   delivered
    1   kill              5           1
    1   sigqueue          0           0    EAGAIN
    2   kill              5           1
    2   sigqueue          1           1    EAGAIN
    3   kill              5           2
    3   sigqueue          2           2    EAGAIN
    4   kill              5           3
    4   sigqueue          3           3    EAGAIN
```

Read the delivered column: the two calls are identical, except at a limit of 1
where `kill` gets one through and `sigqueue` gets none. `getrlimit(2)` says why:
the limit "is enforced only for `sigqueue(3)`; it is always possible to use
`kill(2)` to queue one instance of any of the signals that are not already
queued to the process." Read the accepted column instead: `kill` returns 0 for
every signal it is about to throw away.

That is the real difference between them. `sigqueue` lets you carry a value and
lets you find out that the queue is full. It does not deliver more.

## The queue holds one less than the limit

```
limit       1   sigqueue succeeded     0 times, then EAGAIN
limit       2                          1
limit       4                          3
limit       8                          7
limit      16                         15
limit      32                         31
limit   64313                      64312
```

Two things follow. An operator who sets `RLIMIT_SIGPENDING` to 32 expecting 32
outstanding events gets 31. And an operator who sets it to 1, reasoning that one
pending signal is all anything should need, gets a service where `sigqueue`
fails on the first call.

The limit is also per real user, not per process, so every process that user
owns is drawing on the same allowance.

## Two delivery orders, and they are opposites

Five signals queued while blocked, then unblocked. Dequeued with
`sigtimedwait`, which takes them one at a time and runs no handlers:

```
queued SIGRTMIN+5, SIGUSR2, SIGRTMIN, SIGUSR1, SIGRTMIN+2
  dequeued 10, 12, 34, 36, 39
```

Lowest number first, and sending them in ascending order gives the same result,
so the send order is not remembered. Now the same five with handlers installed:

```
  handlers ran 39, 36, 34, 12, 10
```

The exact reverse, over five runs and four different sets. And they do not
nest: a depth counter incremented on entry and decremented on return never left
1, so each handler finishes before the next begins.

The kernel dequeues the lowest first and builds a signal frame for each pending
signal before it returns to user space. Each frame's saved context is the
previous handler's entry, so the last frame built is the one that runs first,
and they unwind downward. Lowest first is true of the kernel and false of your
code.

Instances of one realtime signal do keep their order: eight SIGRTMIN carrying
100 to 107 arrived as 100 to 107.

## What to do about it

1. **Never carry a count in a signal.** Put the count in shared memory, a pipe,
   or a file, and use the signal to say that something is there. A signal is an
   edge.
2. **Have the handler set a flag and let the main loop do the work,** once,
   reading whatever the current state is. A reload that rereads the whole
   configuration is correct however many pushes collapsed into it.
3. **If you genuinely need one delivery per event, use a number at or above
   SIGRTMIN,** and size `RLIMIT_SIGPENDING` to your burst plus one.
4. **Use `sigqueue` when you need to know about overflow,** and handle the
   EAGAIN. That is what it buys you, and it is worth having.
5. **Do not order work by signal number.** The dequeue order and the order your
   handlers run in are opposites, and a migration from handlers to
   `sigtimedwait` silently reverses the sequence your code sees.
6. **Suspect this first when a counter is short and nothing is logging errors.**
   Both ends report success. That is the signature.

## Sources

- [signal(7), on standard and realtime signals and the queueing difference](https://man7.org/linux/man-pages/man7/signal.7.html)
- [sigqueue(3), on EAGAIN and the queued value](https://man7.org/linux/man-pages/man3/sigqueue.3.html)
- [kill(2), on what the return value means](https://man7.org/linux/man-pages/man2/kill.2.html)
- [getrlimit(2), on RLIMIT_SIGPENDING being per real user](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
- [sigtimedwait(2), on dequeueing without a handler](https://man7.org/linux/man-pages/man2/sigwaitinfo.2.html)
- [sigaction(2), on SA_SIGINFO and the mask during a handler](https://man7.org/linux/man-pages/man2/sigaction.2.html)

Every measurement here was taken on Linux 6.18.44 in C, with the signal blocked
before sending and unblocked afterwards, so none of it turns on a race. Signals
32 and 33, which glibc keeps for its own threading and which are why SIGRTMIN
reads as 34 rather than the kernel's 32, were not measured.

The ten bursts on [A thousand sent, one arrived](/signals) are the same model,
one question each.
