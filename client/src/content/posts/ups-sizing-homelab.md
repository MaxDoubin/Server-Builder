
## Why You Need a UPS

A UPS (Uninterruptible Power Supply) sits between your servers and the wall outlet. When power drops, the UPS battery kicks in immediately, keeping your servers running long enough to shut down gracefully. Without one, a power outage means your servers lose power instantly, which can corrupt filesystems, damage databases, and kill drives mid-write.

I learned this the hard way early on. A brief power flicker corrupted a ZFS pool that took hours to repair. After that, I invested in proper UPS protection for every piece of equipment in the rack.

The flicker is the part people underestimate. A full outage is obvious and rare. A brownout, a transfer to a generator down the street, or a compressor kicking on in the same building produces a sag of a few cycles, which is far too short to notice and far too long for a power supply holding roughly 20 milliseconds of energy in its capacitors.

## The three topologies, and why it matters which one you buy

Not all UPS units do the same job, and the cheapest ones do the least.

**Standby (offline).** The load runs straight from the wall. When the UPS detects the voltage leaving tolerance it switches to the inverter, typically in 2 to 10 milliseconds. That transfer time is usually inside what a server power supply can ride through, but only just, and the unit does nothing about voltage that is merely bad rather than absent.

**Line interactive.** Same idea, plus an autotransformer that can buck or boost the incoming voltage without going to battery. This is the important upgrade for a homelab, because most real power problems are sags and swells rather than outages, and a standby unit answers every one of them by discharging the battery. A line interactive unit corrects them and saves the cycles.

**Double conversion (online).** Mains is rectified to DC and inverted back to AC continuously, so the load never sees utility power directly and transfer time is zero. It is the right answer in a data hall and usually the wrong one in a house: the conversion runs at maybe 90 to 94 percent efficiency, so it burns real money as heat all year, and the fans are audible.

For a rack in a house, line interactive is the sweet spot. I would not spend the extra on double conversion unless something in the rack is genuinely intolerant of a 4 millisecond gap, and almost nothing is.

## Calculating Your Needs

Step one is measuring your actual power consumption. I use a Kill-A-Watt meter on each server to measure draw under normal load and under peak load. Here is what my rack pulls:

- 2x Dell R740: ~450W each under typical load
- 1x Mac Pro: ~300W under typical load
- 1x Mikrotik switch: ~30W
- Miscellaneous (patch panel lighting, cooling fan): ~50W
- Total typical load: ~1,280W
- Total peak load: ~1,800W

Measure, do not add up the labels. A power supply's nameplate is what it can deliver, not what the machine draws, and the gap is enormous: an 1,100W supply in a lightly loaded R740 might pull 150W at idle. Sizing from nameplates leads people to buy two or three times the UPS they need.

Do measure at boot, though. Spinning rust is the exception to everything above, because a drive draws two to three times its running current while the platters spin up. A shelf of twelve disks starting at once is a genuine surge, which is why staggered spin-up exists in the HBA firmware and why it is worth turning on.

## VA vs Watts

UPS capacity is rated in VA (Volt-Amps) and Watts. They are not the same thing. VA is apparent power, and Watts is real power. For server loads (which are mostly resistive), the power factor is typically around 0.8 to 0.9. That means a 2000VA UPS delivers about 1600 to 1800 watts of real power.

Where the two diverge is power factor, the ratio of real to apparent power. A modern server supply with active power factor correction runs at 0.95 or better, which is why the old assumption of 0.6 baked into cheap UPS ratings is pessimistic for a rack full of enterprise gear and optimistic for a shelf of consumer bricks.

Always size based on watts, not VA. And always leave headroom. I target 70% utilization, so for my 1,800W peak load, I need a UPS rated for at least 2,600W (or about 3,000VA).

The headroom is not superstition. Batteries lose capacity as they age, so a unit sized to exactly your load on day one is undersized by year three. Running at 70 percent also keeps the inverter out of the part of its efficiency curve where it makes the most heat.

## Runtime

Runtime is how long the UPS can keep your servers running on battery. For a homelab, you probably do not need hours of runtime. You need enough time for your servers to detect the outage and shut down gracefully. Five to ten minutes is usually sufficient.

Runtime is also badly nonlinear, which trips people up. Lead acid batteries deliver less total energy the faster you discharge them, so halving the load more than doubles the runtime. A unit rated for 5 minutes at full load might give 20 at a quarter load. Read the manufacturer's runtime chart at your actual measured draw rather than interpolating from the headline number.

## Talking to it

A UPS nobody is listening to is a battery that delays the crash by eight minutes. The point is the graceful shutdown, and that needs software.

I have my servers configured to start a clean shutdown when the UPS signals a power loss. The UPS communicates via USB using NUT (Network UPS Tools) on Linux. The shutdown process takes about two minutes, so my UPS needs to provide at least three to four minutes of runtime at full load.

NUT splits into a driver that talks to the hardware, a network daemon, and clients that act on the state. One machine owns the USB cable and runs the daemon; everything else in the rack is a client over the network, which is what lets a single UPS shut down four machines. Set the low battery threshold well above the point of no return, and set the machine that owns the cable to shut down last.

Then test it. Pull the plug on a Saturday afternoon and watch what happens, because the failure modes only show up in a real transfer: a client that never got the credentials, a shutdown script that hangs on an NFS mount that went away with the switch, a machine set to stay off when power returns. I have found all three that way.

## Batteries are consumables

Sealed lead acid cells last three to five years and fail closed, meaning the UPS reports itself healthy right up until the moment it is asked to do the one thing it exists for. Run the self test monthly, and replace on age rather than on symptoms. Heat is what kills them, so a UPS at the bottom of a warm rack ages faster than the datasheet suggests.

## My Setup

I run an APC Smart-UPS 3000VA rack-mount unit. It provides about 8 minutes of runtime at my typical load, which is plenty for graceful shutdowns. The rack-mount form factor keeps everything neat, and the network management card lets me monitor it remotely.

The total cost was significant, but it has already saved my data at least three times during power outages. That makes it one of the best investments in the entire lab.

## What a UPS will not do

It will not fix an undersized circuit. A 15A 120V branch is 1,800W and should be loaded to 80 percent continuous, which is 1,440W, and no UPS changes that arithmetic; it just fails differently when you exceed it.

It will not run your air conditioning, so a long outage in a warm room ends in a thermal shutdown whether or not the servers still have power.

And it is not a generator. Sizing for hours of runtime on batteries is almost always the wrong purchase. Buy enough minutes to shut down cleanly, spend the rest on the monitoring that makes sure the shutdown actually happens.

## References

- https://en.wikipedia.org/wiki/Uninterruptible_power_supply
- https://en.wikipedia.org/wiki/Power_factor
- https://en.wikipedia.org/wiki/Volt-ampere
- https://networkupstools.org/docs/user-manual.chunked/index.html
- https://man.archlinux.org/man/ups.conf.5
- https://man.archlinux.org/man/upsc.8
