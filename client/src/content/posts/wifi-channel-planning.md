
## Airtime Is The Resource, Not Bandwidth

The single idea that fixed wireless for me is that Wi-Fi is a half duplex shared
medium governed by listen before talk. Under CSMA/CA, a station that wants to
transmit first checks whether the channel is busy. If it is, the station waits.
Every device on a given channel within earshot of every other device is taking
turns in one queue.

That reframes the whole problem. The number you are budgeting is not megabits,
it is airtime. A slow client transmitting a small frame at a low data rate
occupies the channel for far longer than a fast client moving the same payload,
and while it does, nobody else transmits. One old device can consume a
disproportionate share of a channel's capacity, which is why "the network is
slow" often has nothing to do with the uplink.

## Why Wider Channels Frequently Go Slower

Doubling channel width doubles the theoretical rate and also doubles the amount
of spectrum you are contending for. Two effects work against you.

The first is that wide channels reduce the number of non overlapping channels
available, so more of your access points end up sharing one. Two access points
on the same channel do not interfere in the destructive sense; they politely
take turns, which halves the airtime each one gets. That is co-channel
contention, and it is the most common self inflicted wireless problem I see.

The second is the noise floor. Widening the channel spreads the same transmit
power over more spectrum and takes in more noise, so the signal to noise ratio
at the receiver drops. Lower SNR means the link negotiates a less aggressive
modulation, which partly cancels the gain from the extra width.

There is also a practical asymmetry: the access point may support a wide
channel, but if a neighbouring network occupies part of it, the channel is busy
whenever that neighbour transmits. A narrow clean channel beats a wide dirty
one nearly every time.

My default is 20 MHz on 2.4 GHz, 40 MHz on 5 GHz in a dense environment and 80
MHz only where I have verified the spectrum is clear, and 80 MHz or wider on 6
GHz where there is room.

## The Three Bands, Honestly

2.4 GHz gives you three non overlapping 20 MHz channels in most regulatory
domains: 1, 6, and 11. That is the entire plan. There is no clever alternative.
Anything on channels 2 through 5 or 7 through 10 partially overlaps two of the
three and makes life worse for everyone, including the person who chose it,
because partially overlapping signals are heard as noise rather than as a busy
channel, so listen before talk does not protect against them. Keep 2.4 GHz for
devices that cannot do better, and keep it narrow.

5 GHz gives you real room, but a large part of it is shared with radar under
Dynamic Frequency Selection. An access point on a DFS channel must perform a
channel availability check before transmitting, must monitor continuously, and
must vacate promptly if it detects a radar pattern. The check takes on the order
of a minute, and longer on the weather radar subband. DFS channels are genuinely
useful and often much quieter than the non DFS ones, but a false detection drops
every client on that radio, so I do not put anything latency sensitive on them
without knowing the local radar environment.

6 GHz adds a large contiguous block of spectrum where regulators have opened it,
which finally makes wide channels reasonable. The tradeoffs are shorter
effective range at the same power for standard power devices, indoor power
restrictions in some classes, and the requirement that clients support the band
at all. Treat it as capacity for modern devices, not as coverage.

## Reading The Air Before You Choose

Guessing is optional. Linux will tell you what is out there and, more usefully,
how busy each channel actually is.

```bash
# What networks exist, on what frequencies, at what signal level.
sudo iw dev wlan0 scan | awk '
  /^BSS/       {bss=$2}
  /SSID:/      {ssid=$2}
  /freq:/      {freq=$2}
  /signal:/    {print freq, $2, ssid, bss}' | sort -n

# Channel occupancy. This is the number that matters.
sudo iw dev wlan0 survey dump | grep -A5 "in use"
# Compare "channel busy time" against "channel active time".
# Busy above roughly 40 percent means contention, whoever is causing it.
```

The scan tells you who your neighbours are. The survey tells you how much of the
channel is already spoken for, including energy from sources that are not Wi-Fi
at all and therefore never show up in a scan list.

## The Procedure I Follow

Start with coverage, not count. Place access points so that every area you care
about has a strong primary signal, then stop. Adding another access point to a
room that already has coverage adds contention, not capacity, unless you
separate them in frequency.

Set the plan by hand. Automatic channel selection is reasonable at first boot
and unreasonable afterward, because it reacts to transient conditions and can
reshuffle your entire estate at an inconvenient moment. Assign channels
manually, write them down, and change them deliberately.

Turn transmit power down, not up. A loud access point is heard by more distant
access points, which enlarges the contention domain, and it encourages clients
to stay associated to a far away radio instead of roaming to a near one. Clients
transmit at their own power regardless, so a one sided increase just creates a
link the client cannot sustain.

Disable the lowest legacy data rates so that management frames such as beacons
are not sent at the slowest possible speed. Beacons go out several times a
second per SSID, and at the lowest rate they eat a surprising amount of airtime.
That is also the reason to run few SSIDs rather than many.

Finally, verify with the survey rather than with a speed test. A speed test on
an idle network tells you about the link. Busy time under load tells you about
the plan.

## References

- [IEEE 802.11ax](https://en.wikipedia.org/wiki/IEEE_802.11ax)
- [List of WLAN channels](https://en.wikipedia.org/wiki/List_of_WLAN_channels)
- [Dynamic frequency selection](https://en.wikipedia.org/wiki/Dynamic_frequency_selection)
- [Carrier-sense multiple access with collision avoidance](https://en.wikipedia.org/wiki/Carrier-sense_multiple_access_with_collision_avoidance)
- [Orthogonal frequency-division multiple access](https://en.wikipedia.org/wiki/Orthogonal_frequency-division_multiple_access)
- [Wi-Fi 6E](https://en.wikipedia.org/wiki/Wi-Fi_6E)
