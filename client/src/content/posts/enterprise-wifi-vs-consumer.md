
## The core difference

Your WiFi is fine most of the time, and then it is not. A video call drops when someone else starts a download. A laptop carried between rooms clings to the far access point at one bar instead of switching. Somebody suggests spending five times more on an enterprise AP and you want to know what that money buys, because the box says the same 802.11 letters either way.

Consumer WiFi routers are designed for home use: a small number of devices, low density, non-technical users. Enterprise APs are designed for high-density environments with many concurrent users, centralized management, and predictable performance.

The part that is easy to miss is that both categories implement the same standards. The chipsets are frequently from the same handful of vendors. What differs is the radio design, the firmware's willingness to make decisions on your behalf, and whether you get to see and control any of it.

## Airtime is the resource, not bandwidth

Almost every WiFi problem makes sense once you accept one fact: a channel is a single shared half duplex medium, and only one device on it can transmit at a time. Clients and access points take turns using carrier sense with collision avoidance. What you are dividing up is not megabits, it is time.

Three consequences follow directly.

A slow client is expensive for everyone. A device stuck at a low data rate occupies the channel far longer to move the same bytes than a fast client would. One old device in the corner of the building, connected at the lowest legacy rate, measurably degrades the cell for everybody else. This is why enterprise gear lets you disable low data rates entirely and consumer firmware usually does not.

More radios on the same channel do not add capacity. Two access points sharing channel 6 within earshot of each other are one collision domain with extra steps. This is the most common way homelabs make their WiFi worse: adding a second AP without changing the channel plan.

Wider channels are a trade. Doubling channel width roughly doubles peak throughput for a single clean transmission, and it also doubles the spectrum you can collide with. In 2.4 GHz there are only three non-overlapping 20 MHz channels in North America (1, 6 and 11), so a 40 MHz channel there consumes most of the band and is nearly always a mistake. In 5 GHz you have real room, including the DFS channels, and 40 or 80 MHz is reasonable if your neighbours are not already there.

## What enterprise APs do better

**Centralized management:** Enterprise systems (Cisco Meraki, Ubiquiti UniFi, Aruba Instant) provide a single pane of glass for all APs. Push a configuration change and it deploys to every AP in seconds. See per-client statistics, channel utilization, and interference maps from one interface.

The number worth watching in that interface is channel utilization, not signal strength. A client can show an excellent signal and still perform badly if the channel is 80 percent busy. Signal strength tells you whether the client can hear the AP. Utilization tells you whether it will ever get a turn to speak.

**Band steering and load balancing:** Enterprise APs actively steer clients to the optimal band (5GHz preferred over 2.4GHz) and distribute clients across APs based on signal strength and load.

The mechanism explains the failures. The AP cannot force a client anywhere. It can withhold probe responses on 2.4 GHz for a client it has seen on 5 GHz, or refuse an association attempt, and hope the client tries the other band. Devices that handle this badly, and some IoT gear handles it very badly, end up flapping or failing to join at all. That is why the standard advice for stubborn IoT devices is a separate 2.4 GHz only SSID with steering off.

**High-density design:** The antenna arrays, radio configurations, and firmware optimizations in enterprise APs are designed for many simultaneous clients. A $200 consumer router starts degrading noticeably at 30+ active clients. A good enterprise AP handles 200+ without issues.

Underneath that is mostly more spatial streams, MU-MIMO and OFDMA so several clients are served in one transmission opportunity, and enough CPU and memory for the association state of hundreds of clients rather than dozens.

**PoE integration:** Enterprise APs run on PoE, eliminating the need for power outlets at every mounting location.

Check the class before you mount anything. 802.3af provides up to 15.4 W at the switch port, with about 12.95 W guaranteed at the device after cable loss. 802.3at, commonly called PoE+, raises that to 30 W at the port and roughly 25.5 W at the device. 802.3bt goes further, to about 60 W and 90 W at the port for Type 3 and Type 4. A modern tri-band AP given only af power will often boot with a radio disabled or at reduced power, and it will not say so loudly. If an AP underperforms mysteriously, check what the switch is delivering to that port before you blame the radio.

**Seamless roaming (802.11r/k/v):** Clients can move between APs without dropping connections, which matters for voice and video applications.

Each does something different. 802.11k gives the client a neighbour report, so it knows which APs exist and on what channels instead of scanning blindly. 802.11v lets the network suggest a better AP and ask the client to move. 802.11r makes the handoff fast by caching key material, so the client does not repeat the full authentication exchange on every transition. Note what none of them do: the client still decides when to roam. A laptop that has decided it is happy at minus 80 dBm will stay there anyway. Sticky clients are a client behaviour problem, and the network side fix is designing cells so the far AP is genuinely unattractive, not turning power up.

**Real authentication:** Consumer gear gives you a pre-shared key. Everyone shares one secret, and a single leaked password means re-keying every device. Enterprise gear supports 802.1X with a RADIUS server, so each user or device authenticates with its own credential or certificate, gets its own keys, and can be assigned a VLAN dynamically by the RADIUS reply. RADIUS authentication runs on UDP port 1812 and accounting on 1813. This is the biggest security difference between the categories, and the one that never shows up in a throughput comparison.

## The UniFi middle ground

Ubiquiti UniFi occupies an interesting position: professional hardware and management at prices between consumer and full enterprise. For a homelab or small office, UniFi provides most of the enterprise capabilities without the enterprise price tag.

I run UniFi in my lab. The controller software manages all APs from a single interface, provides detailed statistics, and handles automatic firmware updates.

## Checking what you actually have

Before changing anything, measure. On a Linux client, the association state and the current rate are one command away:

```bash
iw dev wlan0 link
```

```
Connected to 04:18:d6:aa:bb:cc (on wlan0)
        SSID: lab-wifi
        freq: 5180
        signal: -52 dBm
        rx bitrate: 780.0 MBit/s VHT-MCS 9 80MHz short GI VHT-NSS 2
        tx bitrate: 650.0 MBit/s VHT-MCS 8 80MHz short GI VHT-NSS 2
```

Read `signal` first. Better than about minus 65 dBm is comfortable for high data rates, minus 70 is workable, and past minus 75 the client drops to slow rates and starts hurting the whole cell. Then read the bitrate: that is the negotiated PHY rate, not throughput, and real TCP throughput lands well below it. Good signal with a low bitrate means interference or a congested channel, not a coverage problem.

To see what else is on the air:

```bash
sudo iw dev wlan0 scan | grep -E 'SSID|freq|signal'
```

Count how many strong neighbours share your channel. If the answer is more than a couple, no amount of new hardware will fix the problem and a channel change will.

Then measure throughput against something on your own wired network, not a speed test site, so you are testing the wireless link and not your internet connection:

```bash
iperf3 -c 10.0.20.50 -t 30
```

Run it from the spot that feels slow, not from next to the AP.

## Common mistakes

**Turning transmit power to maximum.** It feels like more coverage and it creates an asymmetry: the client hears the AP from far away and associates, but the client's own radio is much weaker and the AP cannot hear its replies cleanly. You get connections that show full bars and do not work. Worse, in a multi AP deployment, high power means every AP hears every other one and the cells stop being separate. Turn power down until cells barely overlap, not up.

**Broadcasting five SSIDs from every AP.** Each SSID beacons independently, roughly ten times a second by default, and beacons are sent at a low basic rate so they consume disproportionate airtime. A handful of SSIDs across several APs can burn a noticeable fraction of the channel before a single client sends data. Use VLAN assignment via RADIUS or a small number of SSIDs, not one per purpose.

**Mesh where a cable would work.** A wirelessly backhauled AP repeats every frame on the same radio it serves clients with, which roughly halves usable throughput per hop and adds latency. Mesh is a solution for places you genuinely cannot pull cable. If you can run Ethernet, run Ethernet, and remember the run also carries the power.

**Mounting APs in the wrong place.** A network closet, a metal rack, or a basement corner puts the antennas behind exactly the materials that attenuate the most. APs are designed to be ceiling mounted in the middle of the space they cover. An AP in the right place at low power beats an expensive AP in a closet at full power.


## When consumer is fine

For a home with a handful of devices and no performance-sensitive applications, a good consumer router is perfectly adequate. The investment in enterprise hardware only makes sense when you need the density, management, or reliability features.

The honest test is whether you can name the problem you are solving. "Sometimes it feels slow" is usually a channel or placement problem, and an enterprise AP just relocates the same interference. "I need per-device authentication, VLAN separation for IoT, and clean handoff between three access points" is a real requirement, and consumer firmware will not get you there at any price.

## References

- https://en.wikipedia.org/wiki/IEEE_802.11r-2008
- https://en.wikipedia.org/wiki/IEEE_802.11k-2008
- https://en.wikipedia.org/wiki/IEEE_802.1X
- https://en.wikipedia.org/wiki/Power_over_Ethernet
- https://en.wikipedia.org/wiki/List_of_WLAN_channels
- https://www.rfc-editor.org/rfc/rfc2865
