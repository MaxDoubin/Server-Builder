## How rare is that ending?

I built a set of branching incident scenarios for this site: you are the
on-call engineer, a file server stops answering, and you choose what to do
next. Each one has several endings, and the interesting question is not which
ending you got. It is how easy it was to get.

An ending you reach by ignoring three warnings in a row is a different piece of
information from one you reach by any of forty reasonable routes, and a
scenario that does not say which is which is telling you almost nothing about
how you did.

So each ending shows a rarity. The temptation is to make that number up. A
tag, hand-written: this one feels rare. That is worthless, because it is
unfalsifiable and it drifts the moment anybody edits a branch.

The other temptation is to count what readers actually do, which needs a
backend, an analytics pipeline and a privacy policy, and produces a number that
changes with traffic and is meaningless on the first day.

## Count the paths

There is a third option that is honest, stable, and computable offline: rarity
is **the share of all distinct start-to-ending paths that finish at this
ending**.

The scenario is a directed acyclic graph. Scenes are nodes, choices are edges,
endings are sinks. Counting paths to each sink is a five-line dynamic program:

```js
const memo = new Map();
const countsFrom = (id) => {
  const seen = memo.get(id);
  if (seen) return seen;
  const counts = new Map();
  if (endings.has(id)) {
    counts.set(id, 1);
    memo.set(id, counts);
    return counts;
  }
  memo.set(id, counts);
  for (const choice of scenes.get(id).choices) {
    for (const [ending, n] of countsFrom(choice.to)) {
      counts.set(ending, (counts.get(ending) ?? 0) + n);
    }
  }
  return counts;
};
```

For the ransomware scenario, which has 23 scenes and 7 endings, that produces
1,500 distinct routes and this distribution:

| Ending | Grade | Paths | Share |
|---|---|---|---|
| It kept spreading while you watched | catastrophic | 15 | 1.0% |
| Four days dark, and no idea how | catastrophic | 16 | 1.1% |
| The key was in the memory you kept | **best** | 104 | 6.9% |
| A clean recovery and a refused claim | bad | 104 | 6.9% |
| Paid, decrypted, published anyway | bad | 351 | 23% |
| Nine days back, and a review nobody enjoyed | good | 455 | 30% |
| Service restored, lessons unrecorded | mixed | 455 | 30% |

That shape is doing real work. The best available outcome is 6.9 percent of
routes, which is about right for an outcome that requires killing the encryptor
without powering the host off and then imaging memory before anyone reboots it.
Paying is 23 percent, which is roughly how often organizations get talked into
it. And the two catastrophes are about one percent each, because each needs a
specific sequence of plausible-feeling wrong turns rather than one obvious
blunder.

None of those numbers was chosen. They fell out of the graph, and when I move a
branch they move with it.

## What the number is not

It is not the probability that a sensible person lands there. Path share weights
every choice equally, and readers do not. An ending guarded behind three
consecutive bad decisions is rare in path terms and rarer in practice; an ending
reachable from many reasonable routes is common in both. Where the two come
apart, the path count is still the number that can be checked by anyone who
looks at the file, which is the property I wanted.

It is also a property of the scenario's shape, which means it is a design tool.
A distribution where one ending takes eighty percent of the paths is telling you
that most of your choices do not matter, and that is invisible in the source: it
only shows up when you count. I have a script that prints the table above for
every scenario precisely so I can see it while writing.

## Cycles are the reason this needs a gate

Path counting terminates on a DAG. On a graph with a cycle it does not, and
"wander back to an earlier scene" is a natural thing to write when you are
building a branch that lets someone reconsider.

I wrote five of them. Every one felt right at the time:

```
certificate-sunday: cycle: the-error -> try-renew -> disabled-verify -> try-renew
the-dns-that-lied:  cycle: the-report -> old-host-off -> who-are-they
                           -> checked-record -> the-ttl -> flushed -> old-host-off
```

Both are the same mistake. A scene that can be reached late in the story offers
a choice that goes back to something early, because narratively that is what
"go and check properly this time" means. The fix is not to remove the choice, it
is to point it at a scene further along that covers the same ground, which
usually makes the writing better anyway: the second visit should not read like
the first.

The check that catches this is one depth-first walk with three colors, and it
runs on every push alongside the rest:

- every scene reachable from the start
- every choice pointing at a scene or an ending that exists
- no cycles
- every ending with at least one path to it
- the shares summing to exactly 1
- a spread of outcome grades, and at least one graded best

On its first run against nineteen scenario files it found nine faults: five
cycles, three endings nothing routed to, and a choice pointing at an ending id
that had never existed. All nine are invisible in review. You find them by
playing every path, which is the thing a computer is for.

## The unreachable ending is the interesting failure

Two of the three orphan endings were ones I had written first and then designed
around. You write the ending you want the reader to reach, then build the
branches, and by the time the branches are finished the route you imagined has
been replaced by a better one and the ending is stranded.

Nothing about that is visible when you read the file top to bottom. The ending
is right there, well written, with a lesson attached. It is simply not connected
to anything, and the only symptom is that no reader ever mentions it.

## Making the check able to fail

The last thing worth saying is about trusting the checker. I only believe a gate
after watching it go red for a reason I planted. For this one that meant
pointing a choice at an id that does not exist and confirming the message names
the scenario and the id, then reintroducing a cycle and confirming it prints the
whole loop rather than just saying "cycle detected".

A cycle message that does not print the path is nearly useless in a graph with
twenty scenes. This is what it prints:

```
cycle: the-report -> old-host-off -> who-are-they -> checked-record
       -> the-ttl -> flushed -> old-host-off
```

That is enough to fix it without opening the file.

## References

- [Directed acyclic graphs and topological ordering](https://en.wikipedia.org/wiki/Directed_acyclic_graph)
- [Depth-first search, and the three-color cycle test](https://en.wikipedia.org/wiki/Depth-first_search)
- [Counting paths in a DAG with dynamic programming](https://en.wikipedia.org/wiki/Dynamic_programming)
- [Memoization](https://en.wikipedia.org/wiki/Memoization)
