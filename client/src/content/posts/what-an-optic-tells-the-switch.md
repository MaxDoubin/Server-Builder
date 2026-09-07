
## The switch is reading the optic's mind

Plug an [SFP+](/blog/sfp-transceivers-explained) into a switch and it knows, within a second, the module's vendor,
its part number, its serial number, the wavelength it transmits on, how far it
is rated to reach, how hot it currently is, what voltage its rail is sitting
at, how much current is going through the laser, how much light is leaving,
and how much light is arriving.

None of that came over the network. It came over two wires, from an EEPROM
the size of a grain of rice inside the module, and the whole arrangement is
described in one document: SFF-8472.

The reason this is worth knowing is that the last figure in the list, how much
light is arriving, is the single most useful number in a fibre plant, and
almost nobody looks at it until something has already broken.

## Two addresses on one bus

The module hangs off a two-wire bus, and it answers at two addresses.

The first, A0h, is the identity page. Vendor, part number, serial, date code,
the transceiver's compliance codes, the nominal bit rate, the wavelength, the
supported link lengths per fibre type. It is static, written at the factory,
and it is what a switch reads to decide whether it likes the optic.

The second is where the interesting part lives. SFF-8472 puts it at

> address 1010001X, commonly referred to as A2h, where X can be 1 for a read
> operation

and that page is not static. It is a live instrument. Byte 96 onward, in the
A2h page, holds five measurements the module takes of itself, each updated
continuously:

| Offset | What | Raw unit |
| --- | --- | --- |
| 96 | Module temperature | 1/256 °C, signed |
| 98 | Supply voltage | 100 µV |
| 100 | Laser bias current | 2 µA |
| 102 | Transmit optical power | 0.1 µW |
| 104 | Receive optical power | 0.1 µW |

Those raw units are not something to take on faith. They are exactly the
divisors `ethtool` applies, and you can read them in its source:

```c
#define PRINT_TEMP(string, temp)  ... (double)(temp / 256.)          /* °C  */
#define PRINT_VCC(string, v)      ... (double)(v / 10000.)           /* V   */
#define PRINT_BIAS(string, b)     ... (double)(b / 500.)             /* mA  */
#define PRINT_xX_PWR(string, var) ... (double)((var) / 10000.)       /* mW  */
```

Read that last one carefully. A sixteen bit unsigned value divided by ten
thousand to get milliwatts means the smallest step is 0.1 microwatts and the
top of the range is about 6.5 milliwatts. Optical power is reported linearly,
in watts, and everybody who works with it thinks in dBm, which is why the
conversion appears in every tool that prints it.

## Why receive power is the number that matters

Every optical link has a budget. The transmitter puts out some amount of
light, the fibre and every connector and splice in between takes some away,
and the receiver needs a minimum amount left to recover the signal. The
difference between what arrives and that minimum is your margin.

A link with two dB of margin and a link with twelve dB of margin both show as
up. They both pass traffic. They both look identical in every dashboard that
reports interface state, because interface state is a boolean and margin is
not.

The two dB link is the one that fails when somebody leans on a patch panel,
or when a connector picks up dust, or when the run warms up in summer. It was
always going to fail, and the module has been telling you the whole time, in
a page most monitoring never reads.

```console
$ ethtool -m enp3s0f0 | grep -E 'power|Temp|bias'
        Laser bias current                        : 6.520 mA
        Laser output power                        : 0.5012 mW / -3.00 dBm
        Receiver signal average optical power     : 0.3311 mW / -4.80 dBm
        Module temperature                        : 41.20 degrees C
```

Take that receive figure, subtract the receiver's rated sensitivity from the
A0h page or the datasheet, and you have the margin in decibels. Do it on the
day you commission the link and write it down, because a single reading tells
you almost nothing and the same reading six months later tells you everything.

## The alarms the module raises on its own

The module also carries thresholds, high and low, alarm and warning, for every
one of those five measurements, and it sets a flag when a value crosses one.
That is forty separate conditions in two bytes:

```c
{ "Laser bias current high alarm",   SFF_A2_ALRM_FLG, (1 << 3) },
{ "Module temperature high warning", SFF_A2_WARN_FLG, (1 << 7) },
{ "Laser rx power low alarm",        SFF_A2_ALRM_FLG + 1, (1 << 6) },
```

The thresholds come from the manufacturer, in the module, and they are the
manufacturer's own opinion about when their part is unhappy. That makes them
better than a threshold you picked, and it makes "any alarm flag set on any
optic" a genuinely useful thing to alert on, because it needs no tuning and
no baseline.

Rising laser bias current at constant output power is the classic one. It
means the laser is being driven harder to produce the same light, which is
what a laser does as it ages. It is one of the few pieces of hardware in a
rack that will tell you it is dying before it dies.

## Calibration, and why two identical optics disagree

There are two flavours of this, and byte 92 of the A0h page says which one
you have.

**Internally calibrated** modules do the arithmetic themselves and hand you
values already in the units above. Most modern optics are this.

**Externally calibrated** modules hand you raw ADC counts and a table of slope
and offset constants, and the host is expected to apply them. `ethtool` does:

```c
/* Calibration slope is a number between 0.0 included and 256.0 excluded. */
#define A2_OFFSET_TO_SLP(offset) \
    (id[SFF_A2_BASE + (offset)] + id[SFF_A2_BASE + (offset) + 1] / 256.)
```

Receive power is the exception even then: its calibration is a fourth order
polynomial with five IEEE-754 coefficients, because a photodiode's response is
not a straight line.

If you are reading this page yourself rather than through a tool, and you skip
the calibration bit, an externally calibrated module will give you numbers
that look plausible and are wrong. That is worse than an error.

## Reading it, on the platforms you actually have

**Linux**, and the reason every figure above is checkable:

```console
$ ethtool -m enp3s0f0            # decoded
$ ethtool -m enp3s0f0 raw on > optic.bin   # both pages, 512 bytes
```

**[Cisco IOS](/blog/cisco-ios-fundamentals)**: `show interfaces transceiver detail` gives you the same five
values with the thresholds beside them.

**Junos**: `show interfaces diagnostics optics ge-0/0/0`.

**MikroTik**: `/interface ethernet monitor sfp1` reports the same page, and
RouterOS is unusually willing to talk to third-party optics, which is a
separate conversation.

The point of listing them together is that they are all reading the same two
bytes at the same offset in the same page of the same EEPROM. The vendor
differences are entirely in the formatting.

## What to actually do with this

**Record receive power at commissioning.** One number per link, on the day it
went in. Everything useful you can say later is a comparison against it.

**Alert on the module's own flags, not on a threshold you invented.** They are
per part, set by the people who built it, and they need no tuning.

**Watch bias current against output power.** Rising bias with flat output is
a laser aging out, and it is one of very few genuinely predictive signals in
a rack.

**Do not trust a single reading.** Temperature moves optical power. A reading
taken at 08:00 in January and one taken at 15:00 in July are not the same
measurement, and the module tells you its temperature precisely so you can
account for that.

## References

- [SFF-8472: Management Interface for SFP+](https://www.snia.org/technology-communities/sff/specifications) (SNIA SFF specification library)
- [ethtool source: sfpdiag.c, the SFF-8472 decoder](https://git.kernel.org/pub/scm/network/ethtool/ethtool.git/plain/sfpdiag.c)
- [ethtool source: sff-common.h, the unit conversions quoted above](https://git.kernel.org/pub/scm/network/ethtool/ethtool.git/plain/sff-common.h)
- [ethtool(8)](https://man7.org/linux/man-pages/man8/ethtool.8.html)
- [Linux kernel networking documentation](https://www.kernel.org/doc/html/latest/networking/index.html)
- [Cisco: show interfaces transceiver](https://www.cisco.com/c/en/us/td/docs/interfaces_modules/transceiver_modules/installation/note/78_15160.html)
- [Juniper: monitoring optical interfaces](https://www.juniper.net/documentation/us/en/software/junos/interfaces-ethernet/index.html)
