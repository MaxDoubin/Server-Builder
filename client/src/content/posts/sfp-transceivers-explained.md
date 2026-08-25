
## What transceivers do

You bought a switch with SFP+ cages, a NIC with SFP+ cages, and now you are staring at a page of part numbers where every option is either three dollars or three hundred and nothing explains the difference. The question underneath is always the same: what actually has to match at both ends for the link to come up.

Network transceivers convert electrical signals from your switch or NIC into optical signals for fiber cables (or into electrical signals for copper cables). They plug into SFP (Small Form-factor Pluggable) slots on your networking equipment and provide the physical layer connection.

A transceiver is a small computer in its own right. It contains the laser or the copper driver, the receive photodiode and amplifier, and an EEPROM holding its identity: vendor, part number, serial, supported speeds, wavelength, and rated distance. The host switch reads that EEPROM over an I2C bus the instant you insert the module, which is how a port knows what it is holding before a single frame crosses it. The form factors are defined by multi-source agreements between manufacturers rather than by IEEE, which is why they interoperate widely but also why vendor lock-in games are possible at all.

## SFP vs SFP+ vs QSFP28

**SFP** supports speeds up to 1 Gbps. This is the original standard, still used for 1 gigabit fiber connections and some legacy equipment.

**SFP+** supports speeds up to 10 Gbps. This is what most 10GbE networking uses. SFP+ slots are backward-compatible with SFP modules, but not the other way around.

**QSFP28** supports 100 Gbps. This is used for spine/leaf datacenter fabrics and high-performance computing. A single QSFP28 port can also be broken out into 4x25 Gbps connections.

Two more you will meet. **SFP28** is the same physical cage as SFP+ running a single 25 Gbps lane, and it is the building block that QSFP28 breaks out into. **QSFP+** is the 40 Gbps generation, four lanes of 10 Gbps, which breaks out to 4x10 Gbps the same way.

The pattern is worth internalising: SFP-family cages carry one lane, QSFP-family cages carry four. A QSFP port's total speed is just its lane rate times four, and breakout cables exist because four lanes can be split apart into four independent links when the switch supports it. Not every port supports breakout, and on many switches enabling it consumes neighbouring port numbers, so check the platform's documentation before buying the cable.

## Reading the part number

Most of the information you need is encoded in the optic's designation, and it follows a consistent grammar. Take 10GBASE-SR: the 10G is the speed, BASE means baseband signalling, and the suffix is the medium and reach.

- **SR (short reach)** uses 850 nm light on multimode fiber. At 10 Gbps that reaches 300 m on OM3 and 400 m on OM4, and much less on the older OM1 and OM2 grades.
- **LR (long reach)** uses 1310 nm on single-mode fiber for 10 km.
- **ER (extended reach)** uses 1550 nm on single-mode for 40 km.

Both ends of a link must agree on speed, wavelength, and fiber type. An SR module will not talk to an LR module, not because of vendor politics but because one is shouting 850 nm into multimode and the other is listening for 1310 nm from single-mode. This is the single most common reason a fiber link stays dark.

## Fiber vs copper

For distances under 5 meters, DAC (Direct Attach Copper) cables are the cheapest and simplest option. A DAC cable has transceivers permanently attached to both ends. They are passive, require no configuration, and work in any SFP+ slot.

For distances between 5 and 300 meters, multimode fiber with SR (Short Range) transceivers is the standard. You need separate transceivers for each end and a fiber patch cable between them.

For distances over 300 meters, single-mode fiber with LR (Long Range) transceivers is required. These are more expensive but can reach up to 10 kilometers.

Between passive DAC and fiber there are two intermediate options. Active DAC includes signal conditioning electronics in the ends and stretches the copper reach roughly double that of passive. Active optical cable (AOC) is a fiber cable with the optics permanently bonded to both ends: it has the reach of fiber and the plug-and-play simplicity of DAC, at the cost of not being able to replace either end independently.

10GBASE-T over Cat6a is the other copper option, and it reaches 100 m, but it draws noticeably more power per port than SFP+ and adds latency measured in microseconds because of the block-based error correction it uses. For in-rack links, DAC wins on cost, power, and latency at once.

## Connectors and fiber grades

Duplex fiber for SFP and SFP+ terminates in LC connectors, two ferrules in a clip, one for transmit and one for receive. QSFP optics that use parallel fiber terminate in MPO or MTP connectors carrying 12 or 8 fibers in one rectangular ferrule.

Multimode fiber is graded OM1 through OM5, and the grade sets the distance. OM3 and OM4 are the ones you want for 10 Gbps and above; OM1 orange fiber pulled out of a box of old patch leads will link at 10 Gbps only over very short runs, if at all. Single-mode is yellow, has a much smaller core, and does not have equivalent grading in the same way.

Fiber ends are the most common physical failure and the easiest to fix. A fingerprint on a ferrule attenuates the signal enough to cause errors under load while still showing a link light. Keep the dust caps on until the moment you plug the cable in, and clean the ends with a proper fiber cleaner rather than a shirt sleeve.

## Third-party vs OEM

Cisco, Juniper, and other vendors sell their own branded transceivers at premium prices. Third-party transceivers from companies like Finisar (now II-VI) or generic options from Amazon work identically in most cases at a fraction of the cost.

Some switches check for OEM transceivers and will display warnings or refuse to use third-party modules. Cisco is notorious for this. The workaround is usually a CLI command to accept non-certified transceivers:

```
service unsupported-transceiver
```

What the switch is doing is reading the vendor name and part number out of that EEPROM and comparing them against a list. Reputable third-party suppliers will code the EEPROM for the platform you tell them you are using, which is why the same physical module is sold as "Cisco coded" or "Arista coded" at the same price. The optics are frequently made in the same factories as the branded ones.

## Reading the diagnostics with ethtool

Optics that support digital diagnostics (nearly all of them) report their own temperature, supply voltage, laser bias, transmit power, and receive power. On Linux this is one command:

```bash
sudo ethtool -m enp1s0f0
```

Useful output looks like this:

```
	Identifier                                : 0x03 (SFP)
	Transceiver type                          : 10G Ethernet: 10G Base-SR
	Laser wavelength                          : 850nm
	Module temperature                        : 34.62 degrees C
	Laser output power                        : 0.5623 mW / -2.50 dBm
	Receiver signal average optical power     : 0.4074 mW / -3.90 dBm
```

Receive power is the number that matters. On a 10GBASE-SR link, a reading in the region of -2 to -8 dBm is a healthy short run, and the receiver runs out of sensitivity somewhere around -11 dBm. A reading of -40 dBm, or a field showing no signal at all, means no light is arriving: the far end is down, the transmit and receive strands are swapped, or a connector is not seated. A reading that has drifted down by several dB since installation usually means a dirty or damaged connector rather than a dying laser.

`ethtool -m` on a DAC reports the cable's EEPROM but no optical power, because there is no light involved. That is expected and not a fault.

## My setup

In my homelab, I use Mellanox ConnectX-3 NICs with generic DAC cables. Everything is within a single rack, so DAC is perfect. The total cost for 10GbE connectivity was a fraction of what it would cost with fiber and OEM transceivers. For a homelab, there is no reason to pay more.

## What breaks

**Mismatched optics at the two ends.** SR to LR will never link, and neither will 850 nm into single-mode fiber. Check the transceiver type on both ends with `ethtool -m` before you go looking for a switch configuration problem.

**Transmit and receive swapped on a duplex patch.** LC pairs can be inserted either way round, and one end's transmit must land on the other end's receive. The symptom is both sides reporting healthy transmit power and no receive power at all. Reverse the pair at one end only.

**A DAC that is fine electrically and rejected administratively.** The link stays down and the log complains about an unsupported or unauthorised module. This is the EEPROM check, not the cable. Either use a module coded for the platform, or enable the unsupported-transceiver setting where the vendor provides one.

**Dirty connectors that pass a link test and fail under load.** Contamination raises attenuation enough to push receive power toward the sensitivity limit. The link comes up, light traffic works, and a sustained transfer produces CRC errors. Compare the current receive power against what the same link reported when it was new.

**Assuming the cage speed is the port speed.** An SFP+ cage will happily accept a 1 Gbps SFP module and run the port at 1 Gbps. If a "10 gig" link is inexplicably slow, confirm the negotiated speed with `ethtool enp1s0f0` before blaming anything else, because the cage and the module are two different things.

## References

- https://en.wikipedia.org/wiki/Small_Form-factor_Pluggable
- https://en.wikipedia.org/wiki/10_Gigabit_Ethernet
- https://en.wikipedia.org/wiki/100_Gigabit_Ethernet
- https://en.wikipedia.org/wiki/Multi-mode_optical_fiber
- https://en.wikipedia.org/wiki/Single-mode_optical_fiber
- https://man7.org/linux/man-pages/man8/ethtool.8.html
