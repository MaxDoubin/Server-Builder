## The rule is correct and it never runs

```
-A INPUT -p tcp --dport 22 -j DROP
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
```

The office cannot SSH in. The rule allowing the office is right there, spelled
correctly, and it never executes, because evaluation stops at the first match
and line one matches first.

Everybody knows this sentence. Almost nobody can see it happening, which is a
different thing, and it is why this remains the most common firewall fault
there is.

## What the tools actually tell you

`iptables -L -v` gives you a packet counter per rule. That tells you a rule
fired. It does not tell you which packet, and it does not tell you which other
rule was hoping for that packet, which is the only question you have.

You can get closer with a LOG target, at the cost of editing the ruleset you
are trying to diagnose and then remembering to take it out again. On a busy
host you can also drown.

So I built the thing I wanted instead: a chain, a packet, and every rule it was
tested against, with the first field that ruled each one out.

```
skip   -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
       --ctstate: packet is NEW, rule wants ESTABLISHED or RELATED
match  -A INPUT -p tcp --dport 22 -j DROP
never  -A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
never  -A INPUT -p tcp --dport 443 -j ACCEPT

verdict DROP (wanted ACCEPT)
```

Reporting only the first failing field is deliberate. A rule can miss on five
things at once and the reader is looking for the one they would have checked,
not a list.

## How often is a rule unreachable

Eight broken chains, 25 rules between them, 36 packets traced through them.

```
Traces where a later rule never ran      19 of 36
Traces that reached the end of the chain 17 of 36
Rule evaluations skipped entirely        31
```

Over half the traces stop before the end of the chain. That is not because
these examples are contrived; it is what a chain with a DROP in it does. It is
also exactly the situation in which a person adds a rule, reloads, sees no
change, and adds another one.

## The order rule, stated once

Specific before general. Every exception sits above the rule it is an exception
to, and a chain read top to bottom should get narrower as it goes.

Two corollaries that people trip on:

Conntrack goes at the top, or nearly. One of the exercises drops all ICMP above
the conntrack rule, and that catches not just pings but the RELATED ICMP errors
belonging to connections the host opened itself. Which brings down path MTU
discovery, silently: connections establish, small requests work, and anything
large hangs. Moving one line fixes it.

A policy is not optional. A chain with no `-P` set defaults to ACCEPT, so a
tidy list of exactly the three services you meant to expose is a list of things
that were going to be allowed anyway. Every service in the list works, so the
ruleset passes every test anyone thinks to run, and what is missing shows up in
a port scan or in an incident.

## Negation reads backwards

```
# anything not internal should not be here
-A INPUT ! -s 10.0.0.0/8 -j ACCEPT
```

Read it with its target: if the source is not internal, accept it. That is the
exact opposite of the comment above it, and the comment is the part a reviewer
reads.

Negated matches are worth being careful with generally, because they read
naturally in English and invert awkwardly in a chain. `! -s X -j DROP` and
`-s X -j ACCEPT` followed by a drop look equivalent and stop being so the
moment a third rule is involved. With a DROP policy the negated rule is usually
unnecessary anyway: anything the allow rules do not cover is already refused,
and a rule that says so is a line that can be got wrong.

## The exercises are marked on behaviour

Each one is a set of packets and the verdicts they should get. Any chain that
produces them is correct, including a shorter one than mine.

A predicate checking whether the answer contains `--dport 22` would mark the
shape of my solution and fail somebody who found a better one, which is both
unfair and a bad lesson: there is rarely one right ruleset.

## Two checks, because one is not enough

CI replays a working chain for every exercise. It also asserts the starting
chain fails, and that second half is the one worth copying if you build
anything like this. Without it, an exercise that is accidentally already
correct passes forever while marking every reader instantly done.

Neither of those checks the engine, though. If first match wins had broken,
every solution would still solve its exercise against the same broken engine
and CI would be green. So there is also a table of twelve packets with the
verdict and the deciding line number worked out by hand.

I confirmed that half does its job by reversing rule order in the evaluator. It
produced ten failures immediately, which is the only way to know a check works:
break the thing it is supposed to catch and watch it catch it.

## References

- [iptables(8)](https://man.archlinux.org/man/iptables.8)
- [iptables-extensions(8), including conntrack](https://man.archlinux.org/man/iptables-extensions.8)
- [netfilter packet flow](https://en.wikipedia.org/wiki/Netfilter#Packet_flow)
- [RFC 4890, on filtering ICMP safely](https://www.rfc-editor.org/rfc/rfc4890)
- [RFC 1191: path MTU discovery](https://www.rfc-editor.org/rfc/rfc1191)
