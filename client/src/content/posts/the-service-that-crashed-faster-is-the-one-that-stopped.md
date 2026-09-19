## Two hosts, one bug, opposite outcomes

A bad deploy goes out at 02:00 and breaks the same worker on two machines. The
process reads a config file, finds a key missing, logs the error and exits 1.
Same binary, same config, same unit file, same version of systemd.

At 09:00 the first host has a dead service:

```
● worker.service - worker
     Loaded: loaded (/etc/systemd/system/worker.service; enabled)
     Active: failed (Result: start-limit-hit) since Mon 02:00:03 UTC
```

The second host has a live one, in a sense:

```
● worker.service - worker
     Loaded: loaded (/etc/systemd/system/worker.service; enabled)
     Active: activating (auto-restart) (Result: exit-code)
```

It has restarted about ten thousand times overnight and is still going. The
unit files are identical. The difference is that on the first host the process
dies about half a second after starting, and on the second it opens a database
connection first and does not reach the config error for another two seconds.

The service that fails faster is the one that stopped. That is worth
understanding before you need it at three in the morning, and it is entirely
mechanical.

## Restart=always does not mean always

`Restart=` in `[Service]` decides whether systemd schedules a restart. It does
not decide whether the start is permitted. That is a separate mechanism, in
`[Unit]`, and it is on by default:

```
StartLimitIntervalSec=10s
StartLimitBurst=5
```

Those are the shipped defaults, from `DefaultStartLimitIntervalSec` and
`DefaultStartLimitBurst` in `systemd-system.conf`. More than five starts inside
ten seconds and systemd refuses, logs `Start request repeated too quickly`,
puts the unit in the failed state with result `start-limit-hit`, and leaves it
there. Not backed off. Not retried later. Failed, until a human runs
`systemctl reset-failed`.

So the restart policy and the rate limit are two different systems, written in
two different sections, and `Restart=always` is a statement about the first
one only.

## The window does not slide

This is the part that decides everything, and it is a dozen lines of C in
`src/basic/ratelimit.c`:

```c
if (r->begin <= 0 || usec_sub_unsigned(ts, r->begin) > r->interval) {
        r->begin = ts;
        r->num = 1;
        return true;
}
if (r->num < r->burst) {
        r->num++;
        return true;
}
return false;
```

Read the first branch carefully. When a start arrives and more than `interval`
has passed since `begin`, the limiter does not slide the window forward or
expire the oldest entries. It throws the whole counter away, sets `begin` to
now, and calls this start the first one in a brand new window.

That is a fixed window anchored at the first start, and it behaves quite
differently from the sliding window most people picture. Under a sliding
window, five starts anywhere within any ten second stretch trips the limit.
Under this one, five starts trip it only if they all land inside the one
particular window that opened when the counter was last reset.

Which means a unit whose restart cycle is long enough to walk off the end of
the window resets the counter on its way past, every time, and can crash
forever without ever being refused.

## Doing the arithmetic

One cycle is the time the process lives plus `RestartSec`, which defaults to
100ms. Call it `c`. Starts land at 0, `c`, `2c`, and so on. The counter fills
after `burst` of them, and the next start, at `burst x c`, is the one that gets
refused, if the window is still open when it arrives.

The window is still open exactly when `burst x c` is not greater than
`interval`. So:

```
the limit trips  <=>  burst x cycle <= interval
```

The first host: the process lives 500ms, `RestartSec` is 100ms, so the cycle is
600ms. Five times 600 is 3000, which is inside 10000. Starts at 0, 0.6, 1.2,
1.8 and 2.4 seconds, and the attempt at 3.0 is refused. The unit is dead three
seconds after the deploy, and stays dead for seven hours.

The second host: the process lives 2.3 seconds, so the cycle is 2.4 seconds.
Five times 2400 is 12000, which is past 10000. Starts land at 0, 2.4, 4.8, 7.2
and 9.6, which fills the counter to five, and then the sixth start arrives at
12.0. By then the window that opened at zero has elapsed, so the counter is
discarded and a new window opens. Nothing is ever refused.

Note what nearly happened there. The counter did reach five, which is the exact
state that killed the first host. It survived only because the next start was
late enough that the window had closed first. A sliding-window limiter would
have refused that sixth start, because the five before it span 9.6 seconds.

## The boundary is one comparison

`usec_sub_unsigned(ts, r->begin) > r->interval` is strictly greater than. A
start landing at exactly the interval is inside the window, not outside it.

This is not a hypothetical. Somebody who reads that the limit is five per ten
seconds will reasonably set `RestartSec=2s`, since five times two is ten and
that surely spreads the starts across the whole window. With an instant crash,
starts land at 0, 2, 4, 6 and 8, filling the counter, and the sixth arrives at
exactly 10.000. Ten thousand microseconds is not greater than ten thousand, so
the window is still open and the start is refused.

`RestartSec=3s` restarts forever. `RestartSec=2s` fails at ten seconds. The
value you compute as the safe one is the last one that fails.

## Which means the fixes are not the obvious ones

**Raising `StartLimitBurst` mostly does nothing.** If you set it to 50 on a
unit with a 600ms cycle, the counter never gets near 50: sixteen starts fit in
ten seconds, the seventeenth opens a new window, and the limiter is now off in
effect while still looking configured in the unit file. If you want it off, set
`StartLimitIntervalSec=0` and let the file say so.

**Widening `StartLimitIntervalSec` makes it stricter, not kinder.** The
interval is how far back the counter remembers, not how long the service is
given. The second host above, restarting forever on a ten second window, fails
permanently the moment somebody widens the window to a minute, because now
nothing throws the counter away before the sixth start arrives. This one
surprises people in the wrong direction: it is usually done to reduce noise and
it stops the service.

**`RestartSec` has to account for the crash time.** The tempting value is
`interval / burst`, and that is the boundary value that fails. What matters is
the whole cycle, crash plus delay. For the first host, crashing at 500ms, a
`RestartSec` of one second gives a 1.5 second cycle, five of which is 7.5
seconds, still inside the window, still fatal. Two seconds gives 2.5, five of
which is 12.5, and the unit runs all weekend.

## The case that produces the worst tickets

A unit that needs a network mount, starting at boot before the mount exists.
The process exits 1 about 200 milliseconds in. Cycle 300ms. Five starts by 1.2
seconds, refused at 1.5.

The mount finishes forty seconds into boot. Nothing retries the unit, because
the rate limit does not expire into a retry: it expires into permission to
start, and nobody asks. The machine comes up with one service missing, the
journal entry that explains it is at 1.5 seconds where nobody is looking, and
the obvious suspect is whatever was happening at forty seconds.

The fix is ordering, not restarting. `After=` and `Requires=` on the mount unit,
so the service does not start until the thing it needs exists. Restarting into
a dependency is a retry loop standing in for a dependency declaration, and the
rate limiter is what collects the bill.

## What to check, in order

1. What does `systemctl status` give as the Result? `start-limit-hit` means the
   limiter stopped the unit and the real failure is five restarts further back
   in the journal.
2. How long does the process actually live? That number, plus `RestartSec`, is
   the cycle, and the cycle against `StartLimitBurst` and
   `StartLimitIntervalSec` decides everything else.
3. Is the unit restarting forever rather than failing? That is not the better
   outcome. It is the same bug with nothing stopping it, and no alert, because
   `activating (auto-restart)` is not a failed state.
4. If you are about to raise `StartLimitBurst`, work out how many starts fit in
   the interval first. If the answer is smaller than your new burst, you have
   disabled the limit rather than raised it.
5. If the unit fails at boot and the dependency arrives later, fix the
   ordering. No limiter setting turns a retry loop into a dependency.

## References

- [systemd.unit(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html), for StartLimitIntervalSec, StartLimitBurst, and that either at zero disables the limit
- [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), for Restart=, RestartSec=, and the exit conditions on-failure covers
- [systemd-system.conf(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html), for DefaultStartLimitIntervalSec and DefaultStartLimitBurst
- [src/basic/ratelimit.c](https://github.com/systemd/systemd/blob/main/src/basic/ratelimit.c), where the fixed window is implemented
- [systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html), for reset-failed and what it clears
- [systemd NEWS for v254](https://github.com/systemd/systemd/blob/main/NEWS), for RestartSteps and RestartMaxDelaySec, the exponential backoff that arrived long after these defaults