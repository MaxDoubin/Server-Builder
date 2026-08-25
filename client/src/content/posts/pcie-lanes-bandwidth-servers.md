
## The mistake I keep seeing

Someone buys a fast NIC and a fast NVMe drive, installs both, and gets maybe half the throughput they expected. The cards are fine. The cables are fine. What went wrong is that a server has a finite number of PCI Express lanes, they come from specific places, and a slot that is physically x16 is not necessarily wired x16 or fed x16.

Lanes are a budget. Nobody checks the budget.

## What a lane is worth

A PCIe lane is a differential pair in each direction. Per lane, per direction, the approximate usable bandwidth is:

- Gen 3: about 1 GB/s
- Gen 4: about 2 GB/s
- Gen 5: about 4 GB/s

Multiply by the negotiated width. A Gen 3 x8 link is roughly 8 GB/s each way. A Gen 4 x4 link is also roughly 8 GB/s each way. Same bandwidth, half the lanes, which is exactly why newer generations let you do more with less physical wiring.

Now convert to the units the rest of your stack uses. A 100 gigabit NIC needs about 12.5 GB/s each way at line rate. That does not fit in Gen 3 x8. It fits in Gen 3 x16 or Gen 4 x8. If you put that NIC in a Gen 3 x8 slot it will link up, it will pass traffic, and it will quietly cap out well below line rate.

## Where lanes come from

Two sources, and they are not equal.

**CPU lanes** come straight off the processor's root complex. These are the good ones: direct, uncontended, full bandwidth to memory.

**Chipset lanes** hang off a southbridge or platform controller that itself connects to the CPU over a single uplink. Every device behind the chipset shares that uplink. Three NVMe drives on chipset lanes can saturate the uplink and starve each other, and nothing in the topology tells you that unless you go looking.

**Switch chips** on carrier boards and some server backplanes fan a small number of upstream lanes into many downstream ports. That is oversubscription, same idea as a network access switch. Fine for drives with bursty access, bad for anything that wants sustained line rate simultaneously.

## Bifurcation

Bifurcation is the firmware splitting one x16 slot into independent links, typically x8/x8 or x4/x4/x4/x4. Passive carrier cards that hold multiple NVMe drives depend on it entirely: without bifurcation support in firmware, only the first drive appears. Carrier cards with an onboard switch chip do not need bifurcation but add cost, heat, and a shared upstream link.

Before buying a multi drive carrier, check the board's manual for the bifurcation options per slot. It is a firmware capability, not something you can add later.

## Reading the truth on Linux

The device tells you what it can do and what it actually got. Compare `LnkCap` against `LnkSta`.

```bash
#!/usr/bin/env bash
# Compare PCIe link capability against negotiated status for every device.
lspci -D | awk '{print $1}' | while read -r dev; do
  vv=$(sudo lspci -s "$dev" -vv 2>/dev/null)
  cap=$(printf '%s\n' "$vv" | grep -m1 'LnkCap:' \
        | sed -n 's/.*Speed \([^,]*\), Width \(x[0-9]*\).*/\1 \2/p')
  sta=$(printf '%s\n' "$vv" | grep -m1 'LnkSta:' \
        | sed -n 's/.*Speed \([^,]*\), Width \(x[0-9]*\).*/\1 \2/p')
  [ -z "$cap" ] && continue
  name=$(lspci -s "$dev" | cut -d' ' -f2-)
  if [ "$cap" != "$sta" ]; then
    printf 'DOWNGRADED %s  cap=%-14s sta=%-14s %s\n' "$dev" "$cap" "$sta" "$name"
  fi
done
```

Anything printed by that script is a device running below its own capability. Sometimes that is correct and intentional, for example a Gen 4 card in a Gen 3 slot. Sometimes it is a card that is not seated properly, a riser that is only wired for half the lanes, or aggressive link power management downshifting the link at idle.

To see the topology, including what sits behind which bridge:

```bash
lspci -tvPP
```

That tree view is how you spot three drives sharing one upstream port.

## The rules I follow

Plan lanes before you plan cards. Write down every device, the width and generation it wants, and where those lanes come from. If the total exceeds what the CPU provides, decide deliberately what goes behind the chipset rather than discovering it later.

Put the bandwidth hungry, latency sensitive devices on CPU lanes. That is usually the primary NIC and the storage that backs your VMs. Put the management NIC, the boot device, and anything bursty behind the chipset.

Check the slot table in the board manual, not the physical connector. Open ended and mechanically x16 slots that are electrically x4 are common and completely legitimate.

Re-verify after every hardware change. A reseat, a firmware update, or a new riser can silently change a negotiated width, and the symptom is always "it got slower and nobody knows why."

## References

- [PCI Express on Wikipedia](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [The Linux kernel PCI subsystem documentation](https://www.kernel.org/doc/html/latest/PCI/index.html)
- [NVM Express specifications](https://nvmexpress.org/specifications/)
