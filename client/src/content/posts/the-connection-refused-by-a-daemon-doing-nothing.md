## It failed once and then it worked

A deploy job connects to a bastion twenty times in a minute. One of the twenty
comes back like this:

```
kex_exchange_identification: Connection closed by remote host
Connection closed by 203.0.113.10 port 22
```

You run the same command again and it works. The host has four idle
processors, a load average under one, and nobody logged into it. Nothing in
the job changed, nothing in the network changed, and the failure does not
reproduce when you go looking for it.

The thing that refused you counts something no dashboard on that host is
showing: connections that have been accepted and have not finished
authenticating.

## What MaxStartups actually counts

From sshd_config(5):

> Specifies the maximum number of concurrent unauthenticated connections to
> the SSH daemon. Additional connections will be dropped until authentication
> succeeds or the LoginGraceTime expires for a connection. Alternatively,
> random early drop can be enabled by specifying the three colon separated
> values start:rate:full (e.g. "10:30:60"). The default is 10:30:100.

Two things in that paragraph do more work than they look like they do.

The first is "concurrent unauthenticated connections". Not sessions. Not
logins per second. Not load. A connection occupies one of these slots from
the moment sshd accepts it until authentication succeeds or LoginGraceTime
expires, and LoginGraceTime defaults to 120 seconds. So the occupancy is
arrival rate times holding time, and nothing else.

That product is where the surprise lives. Ten connections a minute that never
authenticate, from a scanner or a broken client or a health check pointed at
the wrong port, hold their slots for the full two minutes each. Ten a minute
times a hundred and twenty seconds is twelve hundred connection-seconds a
minute, which is twenty slots standing at any moment. Twenty. The default
start value is ten. Ten connections a minute is invisible on a bandwidth
graph and it is twice the threshold in the only unit sshd cares about.

The second is "random early drop". Not a limit. A probability.

## The ramp is a staircase

Here is the function, from sshd.c, with its own comment:

```c
/*
 * returns 1 if connection should be dropped, 0 otherwise.
 * dropping starts at connection #max_startups_begin with a probability
 * of (max_startups_rate/100). the probability increases linearly until
 * all connections are dropped for startups > max_startups
 */
static int
should_drop_connection(int startups)
{
	int p, r;

	if (startups < options.max_startups_begin)
		return 0;
	if (startups >= options.max_startups)
		return 1;
	if (options.max_startups_rate == 100)
		return 1;

	p  = 100 - options.max_startups_rate;
	p *= startups - options.max_startups_begin;
	p /= options.max_startups - options.max_startups_begin;
	p += options.max_startups_rate;
	r = arc4random_uniform(100);

	debug_f("p %d, r %d", p, r);
	return (r < p) ? 1 : 0;
}
```

`p` is an `int`. Every operation on it is integer arithmetic, and the divide
in the middle truncates. So the rise the comment calls linear is a staircase.
On the default `10:30:100`, with ninety connections between the start and the
full value and seventy percentage points to cover, the probability holds flat
for about one and a third connections before it steps:

| standing | chance of a refusal |
|---|---|
| 9 | 0% |
| 10 | 30% |
| 11 | 30% |
| 12 | 31% |
| 20 | 37% |
| 55 | 65% |
| 99 | 99% |
| 100 | 100% |

The comment is what the author meant. The table is what the code does. The
difference matters at exactly the numbers people configure, which is why the
exercise that goes with this article makes you read values off the ramp
rather than describing it.

## The middle number is not "the drop rate"

The most common misreading is that `10:30:100` refuses thirty percent of
connections once the limit is in effect. It does not. Thirty percent is the
chance at the *bottom* of the ramp, at exactly ten standing, and it climbs
from there.

The second most common is copying `10:30:60` out of the manual page, because
it is the example. That is a strictly harsher setting than the default at
every occupancy above ten, because the same seventy points are covered in
fifty connections instead of ninety. At thirty-five standing the default gives
thirty-seven percent and `10:30:60` gives sixty-five. Narrowing the gap
between the first and third numbers turns the ramp into a cliff.

The third is writing `100` as the middle number, usually while raising the
third one: `MaxStartups 10:100:200`. The guard clause three lines in returns
1 whenever the rate is a hundred, so this is not a gentle ramp to two hundred.
It is a hard refusal at ten, and the two hundred never comes into it.

## Raising the last number does not stop the dropping

This is the fix everybody reaches for, and it is the wrong one.

Look at the guard clauses again. Exactly one of them returns a definite
accept, and it is the first: `if (startups < options.max_startups_begin)
return 0`. It compares against `begin` alone. Raising `full` widens the ramp
and lowers the probability at any given occupancy, but it cannot make it zero,
because the only path to zero tests the first number.

Concretely: a daemon with twenty-two connections standing on the default
setting refuses about thirty-nine percent. Raise the third number to four
hundred and it refuses about thirty-one. Raise the first number to forty and
it refuses none.

So if the occupancy is legitimate, raise the first number to sit clear of it,
and set the third far enough out that the ramp is gentle. `MaxStartups
40:30:200` on a bastion that genuinely holds twenty-odd unauthenticated
connections. If the occupancy is *not* legitimate, do not raise anything
until you know what is holding the slots.

## Your log will go quiet

sshd does log this. `drop_connection()` writes a line naming the count and the
reason:

```
sshd[2411]: drop connection #33 from [198.51.100.24]:52310 on [10.0.4.9]:22 MaxStartups
```

But that same function initialises a rate limiter for those messages:

```c
log_ratelimit_init(&ratelimit_maxstartups, 4, 60, 20, 5*60);
```

and logs at `SYSLOG_LEVEL_DEBUG3` instead of `SYSLOG_LEVEL_INFO` once the
limiter is engaged, with a periodic summary line:

```
MaxStartups logging rate-limited: additional 118 connections dropped
```

So a daemon that is dropping steadily writes a handful of lines and then goes
quiet at the log level anybody runs. The quiet is the limiter, not a recovery.
If you are reading logs from a window after the storm started, absence of
drop lines is not evidence of absence.

## Where the slots actually go

Three things fill them, in roughly the order they surprise people.

**Connections that never authenticate.** Scanners, a monitoring check
connecting to port 22 and never speaking, a client wedged behind a firewall
that swallowed the response. Each costs a full LoginGraceTime. This is the one
where a tiny arrival rate becomes a large occupancy, and it is the reason
`LoginGraceTime 0` is not the permissive setting it looks like: with no time
limit, nothing ever reclaims a slot from a connection that will never finish,
and the count only goes up. A daemon in that state does not recover without a
restart.

**Authentication that got slow.** Anything sshd waits on during authentication
is holding a slot: a directory server that moved to a replica across a region,
a PAM module doing a network lookup, `UseDNS yes` with a reverse zone that
times out. Sixty logins a minute at two seconds each is two slots standing.
The same sixty logins at thirty seconds each is thirty. Nothing about the login
rate changed; a latency problem in a dependency became an availability problem
in the daemon, with no counter in between going red.

**Actual login storms.** A deploy fan-out, a CI matrix, a thundering herd of
config-management agents at the top of the hour. This is the case the setting
was designed for, and the one people assume they have when they have one of the
other two.

## Measuring it rather than guessing

The occupancy is what you want, and it is countable:

```
ss -tn state syn-recv '( dport = :22 or sport = :22 )' | wc -l
ss -tn state established '( sport = :22 )' | wc -l
```

The second number counts sessions as well as half-authenticated connections,
so it is an upper bound rather than the figure itself, but a bastion where it
sits well above your start value is telling you something. `sshd -T | grep -i
maxstartups` prints the effective setting including anything a Match block
changed, which is worth checking before you go editing a file that may not be
the one in force.

And before raising anything, check the two per-source controls. From
sshd_config(5):

> PerSourceMaxStartups: Specifies the number of unauthenticated connections
> allowed from a given source address, or "none" if there is no limit. This
> limit is applied in addition to MaxStartups, whichever is lower. The default
> is none.

`drop_connection()` checks `srclimit_penalty_check_allow()` before it consults
`should_drop_connection()` at all, so a penalised source is refused whatever
MaxStartups says. If one address is holding your slots, that is the control
that takes them back without spending anything on everybody else.

## The short version

MaxStartups counts connections that have not authenticated yet. The occupancy
is arrival rate times holding time, LoginGraceTime is the holding time for
anything that never finishes, and the default of 120 seconds turns a trivial
arrival rate into a large count. The refusal is probabilistic, so it presents
as intermittent; the ramp is a staircase rather than a line; the middle number
is the chance at the bottom of it rather than along it; and only the first
number can take the chance to zero.

It is a mechanism that protects the daemon by refusing the people it is for,
quietly, on a machine that by every other measure is doing nothing.
