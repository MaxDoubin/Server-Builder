
## A rack diagram is a claim that something can be built

I keep a library of rack elevations on this site, sixteen of them, each one a
list of devices and the units they occupy. They are drawn to be read: this is
what a service provider edge looks like, this is what a storage rack looks
like, here is where the weight goes.

Going through them properly, I found that five of the sixteen described a
rack that could not have been switched on, and one described a blade chassis
that had nothing to switch it on with. None of it was a rendering fault or a
typo. Every one was a device that was missing because it is the kind of
device nobody puts in a diagram.

## The blade chassis with nothing behind it

The Cisco rack held a UCS 5108. Six rack units, eight half width blades, four
power supplies, and a front with no network ports on it at all.

That last part is the point, and Cisco are direct about it. The 5108 has

> a passive midplane

and, in the sentence that matters most,

> the chassis uses fewer physical components, has no need for independent
> management, and enables greater energy efficiency than traditional blade
> server chassis

No need for independent management is not a boast about simplicity in the
abstract. It means the management is somewhere else. The chassis has two I/O
bays, and what goes in them is a fabric extender: a device that presents the
blades' interfaces to something upstream rather than switching between them
itself. Upstream is a pair of fabric interconnects, which is where UCS
Manager actually runs and where every blade's uplink actually terminates.

My rack had the chassis and no interconnects. Not a missing cable, a missing
device, and one that occupies rack units and draws power.

**The honest caveat**, because the first version of this note in my own
generator overstated it: those same I/O bays will also take a UCS 6324,
which is a fabric interconnect small enough to live inside the chassis. Cisco
list both options in the same paragraph:

> can support either Cisco UCS 2000 Series Fabric Extenders or the Cisco UCS
> 6324 Fabric Interconnect

So "a 5108 cannot run alone" is too strong. What is true is that it needs one
of those two arrangements, and my rack had neither. I wrote the stronger
version into a code comment before I had read the datasheet closely enough,
which is a small example of the same failure this whole article is about.

## Five racks with a UPS and no PDU

The other five were duller and more embarrassing.

A rack UPS in this library is a 2U line interactive unit. It has a handful of
outlets on the back, four or eight. Five of my racks held one of those, held
between three and eleven other powered devices, and held nothing to
distribute power with. One of them, a 9U MikroTik stack, had neither a PDU
nor a UPS, and on top of that declared six units of hardware in a nine unit
frame, so three units of it were open rack that nothing in the definition
accounted for.

I do not think this happened because I do not know what a PDU is. It happened
because a PDU is the least interesting object in a rack. It has no ports
worth drawing, no model number anybody recognises, and no role in the story
the rack is telling. When you sit down to describe a service provider edge,
you think about the MX240 and the leaf pair and the firewall, and the strip
that feeds all of them is furniture.

Which is exactly why it goes missing, and exactly why nobody notices.

## The general shape of the fault

Once I had a name for it, the same fault turned up in three more places, all
of them dependency omissions rather than mistakes:

**A tape library with no host.** The storage rack held a 4U LTO library and
nothing to drive it. A library is a robot and some drives; something has to
stage backups to disk and stream them out, and that something is a media
server full of spinning disk.

**A protection chain with a hole in the middle.** The same rack held disk and
it held tape and nothing joined them. Without a deduplicating target, the
daily full that is almost entirely the same as yesterday's is written out in
full, and the library stops being a second copy and becomes the only copy
somebody can afford to keep.

**Eight servers and nowhere to land a management port.** The Dell rack had
two top of rack switches carrying data, eight PowerEdge nodes and an MX7000
enclosure, and every one of those presents an iDRAC or an OME port that has
to go somewhere. There was no management switch. In a row rack this is the
one omission that costs you everything at once, because everything in the
rack is reached the same way.

What all of these have in common is that the missing thing is the *support*
for the interesting thing. A diagram drawn from the top down, starting with
what the rack is for, reliably produces the interesting things and reliably
loses the ones that only exist to make them work.

## Checking it instead of remembering it

The fix for each rack was a device. The fix for the class is a check, and the
useful realisation was that most of these can be stated as an invariant over
the device list rather than as knowledge about hardware.

Three now run on every build of this site:

**A rack must fill its frame.** Contents that add up to more than the frame
is a drawing of something that cannot be built. Contents that add up to less
means units the elevation draws as nothing and the definition never mentions.
That second half is the one that caught the 9U stack, and the reason it took
so long is that the equivalent check already existed and only ran for racks
with a 3D model. It is the small racks, drawn only as elevations, that nobody
counts by hand.

**A rack with a UPS and more than two powered devices must have a PDU.** Not
a style rule. It is a statement about outlet counts, and it is false in
exactly the cases where somebody forgot the strip.

**Every device in the model must be a device in the list, and the reverse.**
The oldest of the three, and the one that catches a generator drifting from
the definition it is supposed to be drawing.

None of these encode taste. Each one is a fact about whether the thing
described could exist, which is the only kind of rule worth putting in a
build.

## What I would check in your diagrams

Not a checklist so much as a set of questions that each found something here:

**What manages this?** For every chassis, appliance and enclosure, name the
thing that configures it and find that thing in the rack or say deliberately
that it is elsewhere. Blade chassis and disk shelves are the usual offenders
because both are designed to be dependent.

**What powers it, and through what?** Count the outlets you have drawn
against the devices you have drawn. A UPS is not a PDU.

**What reaches it when the network is broken?** Console access is the thing
you only need on the day you cannot get it any other way, and a rack that
has it is a rack somebody has already had a bad night in.

**Does it add up?** Sum the rack units. It is the cheapest check available
and it caught a rack of mine that was a third empty in a way nothing rendered
as an error.

**And what is the least interesting device that should be here?** That is the
one that is missing.

## References

- [Cisco UCS 5100 Series Blade Server Chassis datasheet](https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-5100-series-blade-server-chassis/data_sheet_c78-526830.html)
- [Cisco UCS 6536 Fabric Interconnect datasheet](https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.html)
- [The rack library these were found in](/racks)
- [The published rack dataset, every device in every rack](/data/rack-library.json)
