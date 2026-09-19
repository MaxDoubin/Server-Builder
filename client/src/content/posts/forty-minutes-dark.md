## A third of the office, and nobody could say why

The DHCP server is a small virtual machine that nobody thinks about. It gets
patched on a Saturday morning, reboots, waits on a storage array that is
slower than usual, and comes back forty minutes later. By Monday there is a
helpdesk ticket saying the network went down during the patch window, and
another one, from a different floor, saying it did not.

Both are true. Of three hundred machines, almost exactly one hundred lost
their address and two hundred never noticed. Not a random hundred either. The
number is a third because the lease was an hour and the outage was forty
minutes, and if the outage had been thirty minutes it would have been zero,
and if it had been an hour it would have been all three hundred.

That is worth knowing before the maintenance window rather than after, and it
takes two numbers out of the lease to work out.

## What a lease actually promises

RFC 2131 gives a client three moments, all counted from the instant the server
said yes.

The lease time, option 51, is the promise: until this many seconds have
passed, the address is yours. A client holds it whether or not the server is
still there. This is the part everyone knows, and it is why a DHCP outage
does not take a network down.

The T1 renewal timer, option 58, is when the client starts trying to extend
the promise. It sends a DHCPREQUEST by unicast to the server that granted the lease, and if
the server answers, the whole clock resets: a fresh lease of the full length,
starting now. The default is half the lease.

The T2 rebinding timer, option 59, is when the client gives up on that
particular server and broadcasts a DHCPREQUEST to any server that will listen. The default is seven
eighths of the lease. If a second DHCP server serves the same pool, the window
between T2 and expiry is the time it has to notice and answer.

At the end of the lease the client, in the specification's words, must stop
using the address. It goes back to INIT and starts discovering from nothing.

## Why the answer is a third

Put the three hundred machines on one axis and the time remaining in their
current lease on the other.

A machine that renewed a moment ago has a full hour in hand. A machine that
is about to renew has half an hour, because T1 is thirty minutes and it
renews there. No renewing machine ever has less than thirty minutes, and none
ever has more than sixty. Since machines came online at whatever times people
walked into the building, the room is spread evenly across that band.

Now take the server away for forty minutes. A machine with fifty minutes in
hand is fine. A machine with thirty-five is not: it will pass T1, get no
answer, keep retrying, pass T2, broadcast, get no answer, and hit expiry five
minutes before the server comes back. The ones that are lost are the ones
holding less than forty minutes, and in a band that runs from thirty to
sixty, that is the slice from thirty to forty. Ten minutes of a thirty minute
band. One third.

The arithmetic generalizes to one line. Call the lease `L` and the renewal
timer `T1`. A renewing client's remaining time is uniform on the band from
`L - T1` up to `L`, and an outage of `D` seconds takes the fraction

```
(D - (L - T1)) / T1
```

clamped to zero below and one above. With the defaults, `T1` is `L/2` and
that collapses to `(2D - L) / L`: nobody until the outage passes half the
lease, everybody when it reaches the whole lease, and a straight line in
between. Forty minutes on an hour lease is `(80 - 60) / 60`, a third.

## The number that matters is not the lease length

Read that formula again and notice which quantity decides whether anybody is
lost at all. It is `L - T1`, the gap between the renewal timer and the
expiry. That is the shortest remaining time any renewing client can have, and
an outage shorter than it costs nothing.

With the defaults, `L - T1` is half the lease, so people reach for the lease
length as the dial: double the lease, double the tolerance. It works, and it
is the expensive way to do it, because the lease is also what the pool pays
for every address.

The cheap way is option 58. Set the lease to an hour and T1 to five minutes
and clients renew twelve times an hour, which is nothing on the wire, and the
guaranteed remainder becomes fifty-five minutes. The same forty minute outage
now costs nobody. The lease did not change at all. A lease is a promise to
the client; T1 is how often the client asks for that promise to be renewed,
and those are separate knobs that the defaults happen to tie together.

There is a limit to it. Renewals are unicast to one server, so twelve
thousand clients renewing every five minutes is forty requests a second,
which a modern server does not notice but an appliance from 2011 might.
Measure before choosing five minutes for a campus.

## The other half of the lease: the pool

Everything above is about an outage. The far more common lease problem is a
pool that runs out, and it has the same root: the server has no idea when a
device leaves.

A phone joins the guest network at nine in the morning, gets an address on a
twenty-four hour lease, drinks a coffee, and leaves at nine fifteen. The
address is unavailable until nine the next morning. There is no goodbye
packet. DHCPRELEASE exists in the specification, and in practice almost
nothing sends it: phones sleep, laptops close their lids, and the only device
in most buildings that reliably releases is one somebody shut down properly.

So the number of addresses in use is not the number of devices present. It is
the arrival rate times the lease length. That is Little's law, the plainest
result in queueing theory, doing a shift in a wiring closet: things in the
system equal arrivals per unit time multiplied by time in the system, and the
time in the system is the whole lease whether the device stays or not.

A coffee shop with forty new devices an hour and a twenty-four hour lease
wants 960 addresses. It has 254, if it has a /24, and 200 of them in the
dynamic range. The pool drains at forty an hour with nothing coming back for
a day, so it is empty five hours after opening, every day, and by mid
afternoon new customers cannot get on. The staff's theory is that the
Wi-Fi is weak at the back.

Buying a bigger pool is the wrong fix and an expensive one: 960 addresses is
four /24s for a room that never holds more than forty phones. Cutting the
lease to two hours brings steady-state demand to eighty, which fits inside
the 200 with more than half free at all times, and every address comes back
within two hours of its device leaving. The dial is the lease, and pointing
it at the length of an actual visit is the whole technique.

## Where the two halves pull against each other

Short leases recycle addresses quickly and shrink the pool you need. Short
leases also shrink the outage you survive, because the guaranteed remainder
is a fraction of the lease.

A lab that set its lease to ten minutes for fast recycling gets an eight
minute container restart and loses three fifths of the room: T1 is five
minutes, the band runs from five to ten, and eight catches everything under
eight. The same restart on a one hour lease costs nobody.

Those two pressures are what option 58 exists to separate. A long lease with
a short T1 gives fast failure detection and a long guaranteed remainder, and
costs only renewal traffic. It does not help the pool: the pool is charged
for the lease length, not the renewal interval, because an address is out on
loan until the lease ends regardless of how often the borrower checks in. For
the pool the only dial is the lease.

So: guest networks get short leases because the population turns over and
nobody minds a brief outage. Office networks get long leases with a short T1
because the population is stable, the pool is oversized for it, and the
server is the thing you expect to lose. They can be the same server; the
lease is a property of the pool.

## The device that came back to a different address

One more consequence, because it produces the most confusing ticket of the
three.

A printer is unplugged on Friday for a desk move and plugged back in on
Monday. It comes up with a different address, and every desktop that had its
old address in a print queue now prints to something else, or to nothing.

A DHCP server does try to give a returning client the address it had. It
keeps the binding, it prefers it, and on a quiet network the printer would
have got its old address back. This network is not quiet: twelve new or
returning devices an hour on a day lease is 288 addresses wanted from a pool
of 254, so the pool is under pressure and expired bindings get handed out
again within hours. Three days away on a one day lease is two days expired,
and the address went to a laptop on Saturday.

The lesson is not about DHCP. It is that a lease is a promise to the client
and to nobody else. Anything that other systems reach by IP address, rather
than by name, needs a reservation or a static address, because those systems
were never party to the promise.

## The infinite lease is not the fix

The tempting response to the printer is to set the lease time to infinite.
RFC 2131 reserves 0xffffffff, all ones, for exactly that, and it does what it
says: no T1, no T2, no expiry, nothing ever renews and nothing is ever
returned.

Every device that has ever appeared on that network holds its address until
somebody deletes the binding by hand. At twelve arrivals an hour, a /24 is
gone in about twenty-one hours and stays gone, and the thing that finally
fails is a laptop that cannot get an address at all. The printer problem was
that one lease expired. The infinite lease solves it by making every device a
printer.

Infinite leases belong on networks where the set of devices genuinely never
changes, which in practice means point-to-point links and a handful of
appliances. Everywhere else, the pair of tools is a reservation for the
things that need a fixed address and a finite lease for everything else.

## The questions, in order

1. What is the lease, and what is T1? If the server does not set option 58,
   T1 is half the lease and the guaranteed remainder is the other half.
2. How long is the longest outage you intend to survive? If it is longer than
   the lease less T1, size one of the two against it, and prefer T1.
3. How many new devices arrive per hour, and how long is the lease in hours?
   Their product is the addresses you need, and it has nothing to do with how
   many devices are in the room.
4. Is the pool bigger than that product? If not, the lease is too long for
   the population, and a bigger pool is the expensive way to fix it.
5. Does anything address this device by IP? Then it needs a reservation, and
   a lease is not a promise to the things that talk to it.

## References

- [RFC 2131, Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131), for the client state machine, T1 and T2 in section 4.4.5, and the infinite lease in section 3.3
- [RFC 2132, DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132), for options 51, 58 and 59 and their encoding
- [ISC dhcpd.conf(5)](https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcpdconf), for default-lease-time, max-lease-time and how a server sets the renewal timers
- [ISC dhclient.leases(5)](https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhclientleases), for the lease database a client keeps and the fields quoted above
- [RFC 4361, Node-specific Client Identifiers for DHCPv4](https://www.rfc-editor.org/rfc/rfc4361), for what a server actually keys a binding on, which is not always the MAC address
- [Little's law](https://www.jstor.org/stable/167570), the 1961 proof that things in the system equal arrival rate times time in the system, which is the pool calculation
- [RFC 8415, DHCP for IPv6](https://www.rfc-editor.org/rfc/rfc8415), for the same two timers under the names T1 and T2 on identity associations, with the same defaults