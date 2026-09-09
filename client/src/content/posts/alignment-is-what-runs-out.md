## The mistake that is not arithmetic

Take a /24 and four [VLANs](/blog/vlan-segmentation-guide): 100 hosts, 60, 12, 10. That is 182 hosts in 254
addresses and it fits with room to spare.

Now place the printers first, at 192.168.10.0/28. Then the switches, at
192.168.10.16/28. Then the wifi, at 192.168.10.32/26. There are 160 addresses
left, which is more than the 100 the staff VLAN needs, and there is nowhere to
put it.

```
192.168.10.0/28    printers      .0   to .15
192.168.10.16/28   switches      .16  to .31
192.168.10.32/26   wifi          .32  to .95
                   96 free addresses, and a /25 cannot start at .96
```

A /25 has to begin at .0 or .128. Both are taken or straddled. The space
exists and it is unusable, and no amount of adding up host counts predicts
that, because addition does not know about boundaries.

Descending order fixes it and the reason is worth stating properly rather than
learning as folklore. A block of size 2^n placed immediately after a block of
size 2^m where m is greater than or equal to n always begins on a multiple of
2^n, because the previous block ended on one. Sort largest first, pack with no
gaps, and every allocation is aligned without anyone checking.

## Six plans and what they cost

I built six of these as exercises with a map that draws the block to scale, and
the thing the map shows that a spreadsheet cannot is how much of the block a
correct plan leaves alone.

```
Point to point links, all /31          100%
One inherited /24 rebuilt               94%
One building, four VLANs                88%
A /22 behind one summary route          67%
Six sites in a /16, sized to double     13%
```

The 13% is not waste. That plan gives six sites a summarisable block each,
sized for double their current population, and spends 8192 of 65536 addresses
doing it. Filling the rest would mean either oversizing every site or handing
the space to something that then cannot be summarized, and the first
acquisition after that lands on an unrelated block nobody can advertise as one
route.

The 100% is the interesting one in the other direction. Eight point-to-point
links in a /28 only fits if the links are /31s, and it fits exactly.

## The /31 that people do not use

A point-to-point link has two ends. Under the classic rule a subnet spends one
address on the network and one on the broadcast, so two usable addresses means
a /30 and four addresses total. Eight links is 32 addresses for 16 interfaces.

RFC 3021 removes both. On a link with exactly two interfaces there is no
broadcast worth having, because everything you send reaches precisely one other
device whether you address it or not. A /31 gives both addresses to hosts.
Eight links becomes 16 addresses, which is half.

The habit of using /30 comes from equipment that predates the RFC, and it is
worth actually checking rather than assuming either way. Support is close to
universal on anything current and genuinely absent on some old and some
embedded gear, which is exactly where discovering it at cutover costs the most.

## An overlap does not look like an overlap

This is the one I would most like people to take away, because it is invisible
in the format everybody uses.

```
Data     192.168.30.0/25
Voice    192.168.30.64/26
```

Two lines, two different numbers, and the second is entirely inside the first.
A /25 at .0 covers .0 to .127. A /26 at .64 covers .64 to .127.

Written as ranges it is impossible to miss:

```
Data     192.168.30.0    to 192.168.30.127
Voice    192.168.30.64   to 192.168.30.127
```

The symptom of shipping the first version is intermittent, which is why it
survives testing. Whichever DHCP pool hands out an address first wins, and the
collision surfaces weeks later as one user with a duplicate address complaint
that nobody can reproduce.

Write plans as ranges. It costs one extra column and it makes a whole class of
error visible at a glance.

## A summary route spends the whole block

If a core switch advertises one route for a set of subnets, the block behind
that route is spent the moment the advertisement exists, whether or not the
subnets fill it.

One of the exercises has three subnets summarized into a /22. They use about
900 of its 1024 addresses. The remaining 124 are inside the advertisement and
inside the firewall object written against it, and anything dropped there later
inherits reachability and permissions that nobody granted it.

That is not a reason to avoid summarizing. It is a reason to record the
reservation somewhere a person will find it before they put a test VLAN in the
gap, which is the actual failure and which happens about eighteen months later.

## What CI checks

Each exercise ships a plan that satisfies it and CI replays that plan, and it
also checks that the starting state does not, because an exercise that is
accidentally already solved passes forever while marking every reader instantly
done.

The more useful check turned out to be feasibility, computed without reference
to my solution. Sum the rounded-up block size for every requirement and compare
against the block, and again against each summary constraint separately. If the
minimum exceeds the space, no arrangement fits and the problem is broken rather
than hard.

It caught one immediately: 600 hosts of wireless summarized into a /23 that
holds 510 usable. I had written it, failed to solve it, and quietly put
placeholder /32s in the solution rather than noticing what that meant. The
exercise now widens the reservation to a /22 and keeps the failed /23 as the
point, because working out that a set of requirements cannot be met is a real
skill and doing it before deployment is very much cheaper than after.

It also caught me asserting that one host needs a /31. One host needs a /32.

## References

- [RFC 3021: using 31-bit prefixes on IPv4 point-to-point links](https://www.rfc-editor.org/rfc/rfc3021)
- [RFC 1918: address allocation for private internets](https://www.rfc-editor.org/rfc/rfc1918)
- [RFC 4632: classless inter-domain routing](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 1878: variable length subnet table](https://www.rfc-editor.org/rfc/rfc1878)
