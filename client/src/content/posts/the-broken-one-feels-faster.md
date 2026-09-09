## Four numbers, four people, four days

```
browser     fetch retry: 3
edge        upstream retries: 3, upstream timeout: 10s
api client  maxRetries: 3, timeout: 2s
pg pool     retry: 3, statement_timeout: 900ms
```

Every one of those is defensible. Three attempts is the default in all four
libraries. Ten seconds is generous for an edge. Two seconds is generous for a
query that normally takes forty milliseconds. Nine hundred milliseconds is a
sensible ceiling on a statement.

One person pressing the button once produces eighty-one queries.

Nobody wrote eighty-one. It does not appear in any of the four configuration
files, and there is no page anywhere in the observability stack that shows all
four policies at once. The number exists only as a product, and products are
not what a code review of a single file computes.

## What I actually wanted to know

The multiplication is arithmetic and I am not the first person to point at it.
What I could not find was a sense of how likely it is that you have already
done this. So I built a model of a call path, gave it a slow dependency, and
sampled the configuration space.

Every value is drawn from what people type. Timeouts from 250ms, 500ms, one,
two, three, five, ten and thirty seconds. Attempts from one, two or three.
Backoff from zero, 50, 100, 250 or 500 milliseconds, constant or doubling. A
dependency answering in one, two, four or eight seconds. Two hundred thousand
four-layer stacks.

```
a caller hangs up while the layer below is still working    90.3%
work left running after every caller has given up           97.7%
nothing truncated and nothing orphaned                       2.3%

fan-out reaching the dependency:   median 12,  p90 36,  worst 81
```

Ninety per cent. Not a pathological corner of the space, not a
deliberately bad configuration: pick four timeouts and three retry counts from
the values a reasonable engineer types, and nine times in ten you have built a
stack in which some layer abandons a request that is still being worked on.

The clean case is two per cent.

## The part I did not expect

I split the sample by whether any caller hangs up on live work, expecting the
broken ones to be slower. They are faster.

```
                                     median wait   median fan-out
a caller hangs up on live work            2.0s               12
nobody hangs up on live work              4.0s                6
```

Twice as fast for the user, and twice the load on the thing that is already
struggling.

The mechanism is obvious once you see the number and invisible before. A
caller with a short timeout gives up early, which is exactly what makes the
page respond quickly. It also means the layer below never gets to finish
reporting a failure, so its remaining attempts run unread, and the caller
issues a fresh request on top of them. Every short timeout in the stack
shortens the user's wait and lengthens the queue at the bottom.

So the symptom is not slowness. The user gets a fast error. The dashboard the
frontend team looks at shows a p99 that has barely moved. The dependency sees
double the offered load at precisely the moment its capacity is gone, and the
only signal anywhere in the stack is a rise in timeouts, which is what you
would expect from a slow dependency anyway, which is what everyone concludes.

This is why the retry storm is discovered from the bottom, and why the
conversation always starts with somebody from the database team asking why
there are twelve identical queries per click.

## Three things that follow

**A timeout is not a local decision.** The number a layer's timeout has to
beat is not "a healthy response". It is the entire retry budget of the layer
beneath it, which is itself derived from three numbers one layer further down.
Nothing in a layer's own configuration contains that value, which is why
choosing timeouts bottom-up produces broken stacks nine times in ten. One
budget divided downwards produces correct ones, because then every layer
allows less time than its caller by construction and the innermost failure is
always the one that surfaces.

**Retry in exactly one place.** Setting one of the four layers to a single
attempt takes 81 to 27, because it removes a factor rather than a term. That
is a two thirds reduction from one line of configuration, and it is the
strongest argument there is for retrying at exactly one layer: the one that
knows whether the operation is safe to repeat and can see the whole deadline.
Which is almost never the driver at the bottom, and is usually the outermost
one.

**Jitter, or they come back together.** Exponential backoff without
randomisation does not spread retries out. It synchronises them: every client
that failed in the same instant returns in the same instant, and then again,
in tighter formation each round, because the doubling is the same doubling for
everybody.

## The one this does not fix

```
POST /charge
```

The gateway is slow rather than broken and answers after eleven seconds. The
HTTP client gives up at four and tries again. Three attempts, three charges,
all of which the gateway completes, none of which is reported to the caller as
a success. The customer sees the total on a statement three days later.

No timeout budget helps here, because the problem is not how long anybody
waited. A timeout tells you that you stopped listening. It tells you nothing
whatsoever about whether the work happened, and the two are constantly
confused because in the common case they coincide. The fix is an idempotency
key, so the second and third requests are recognizable as the same intent
rather than as three intentions that happen to look alike.

## Why every part passed review

The two previous things I measured were beliefs that survive because reality
never contradicts them: the additive permissions model is wrong for
seventy-six per cent of possible file modes and right for every one of the
132,720 files on a stock install, and CVSS base scores present eighty-four
rungs of precision as a hundred and one.

This one is different, and worse. Nothing here is a misunderstanding. Every
one of the four numbers is correct in isolation, was reviewed in isolation,
and would be correct again if you asked. The stack is broken because
correctness did not compose, and there is no file to open in which the
mistake appears.

That is the class of bug that automated checks are for, and almost nobody has
one. The check is four lines: multiply the attempt counts, and walk the path
comparing each timeout against the budget beneath it. Both numbers are
computable from configuration you already have, at build time, before anybody
presses anything.

You can [work through eight of these](/retry) with the fan-out and the
timeline drawn.

## References

- [Google SRE Book, on handling overload and cascading failures](https://sre.google/sre-book/handling-overload/)
- [Google SRE Book, addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [AWS Builders' Library: timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [AWS Builders' Library: using load shedding to avoid overload](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/)
- [gRPC documentation on deadlines, and why they propagate](https://grpc.io/docs/guides/deadlines/)
- [RFC 9110, on idempotent methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)
