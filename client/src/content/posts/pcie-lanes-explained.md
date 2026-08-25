
## Lanes Are a Budget, Not a Feature

Every platform has a fixed number of PCIe lanes. The CPU provides some directly, the chipset provides more behind a link back to the CPU, and that total is the entire budget for every expansion card, NVMe drive, and onboard controller in the system.

This is the mental model that fixes most PCIe confusion. Slots are not independent resources. They are claims on a shared pool, and the motherboard designer already decided how that pool gets divided. When you populate the second full length slot and the first one drops from x16 to x8, nothing broke. You spent lanes.

A physical slot size and an electrical lane count are also different things. An x16 slot may be wired for x4. A card will happily negotiate down to whatever the slot actually provides, and it will do so silently. This is why "it fits" tells you nothing.

## What a Lane Is Worth

A lane is a serial link, and each generation roughly doubles the per lane rate. The useful approximations, per lane, per direction:

| Generation | Transfer rate | Practical throughput per lane | x4 | x8 | x16 |
| --- | --- | --- | --- | --- | --- |
| PCIe 3.0 | 8 GT/s | about 1 GB/s | 4 GB/s | 8 GB/s | 16 GB/s |
| PCIe 4.0 | 16 GT/s | about 2 GB/s | 8 GB/s | 16 GB/s | 32 GB/s |
| PCIe 5.0 | 32 GT/s | about 4 GB/s | 16 GB/s | 32 GB/s | 64 GB/s |

Two things worth noting. The link is full duplex, so those numbers apply in each direction simultaneously. And from 3.0 onward the encoding overhead is small, roughly 1.5 percent, which is why the clean doubling holds.

The immediate consequence is that generation and width trade against each other. A Gen4 x4 link and a Gen3 x8 link carry the same bandwidth. If you are moving an older card into a newer machine, a narrower slot may cost you nothing at all.

## Bifurcation and Switches

Bifurcation is splitting one physical link into several independent narrower links. An x16 slot might be configurable as two x8 links, or four x4 links, usually expressed in firmware as something like x4x4x4x4.

This is how a passive carrier board holding four NVMe drives works in a single slot. There is no chip on the card doing anything clever, it is wiring. The platform has to split the lanes, and if the firmware does not support the split, only the first drive appears. That failure mode confuses a lot of people: three drives simply do not exist, with no error anywhere.

A PCIe switch is the active alternative. It presents more downstream lanes than it has upstream, exactly like an Ethernet switch presents more ports than uplink capacity. Four x4 devices behind an x8 upstream link works fine when they are not all busy at once, and becomes a bottleneck when they are. Whether that oversubscription matters depends entirely on whether your workload drives all the devices simultaneously.

## Checking What You Actually Negotiated

Do not trust the manual. Ask the hardware.

```bash
# List devices with their bus addresses.
lspci

# Capability is what the device supports; status is what it negotiated.
sudo lspci -vv -s 65:00.0 | grep -E 'LnkCap|LnkSta'
```

You are looking for two lines like these:

```
LnkCap: Port #0, Speed 16GT/s, Width x16, ASPM L1, Exit Latency L1 <64us
LnkSta: Speed 16GT/s, Width x8, TrErr- Train- SlotClk+ DLActive- BWMgmt- ABWMgmt-
```

Capability says the device can do Gen4 x16. Status says it negotiated Gen4 x8. That gap is your answer, and now the question is whether the slot is wired x8, whether another slot took the lanes, or whether a firmware setting split them.

A quicker scan across everything in the machine:

```bash
for dev in $(lspci | awk '{print $1}'); do
  cap=$(sudo lspci -vv -s "$dev" 2>/dev/null | grep -oP 'LnkCap:.*Width \Kx\d+' | head -1)
  sta=$(sudo lspci -vv -s "$dev" 2>/dev/null | grep -oP 'LnkSta:.*Width \Kx\d+' | head -1)
  [ -n "$cap" ] && [ "$cap" != "$sta" ] && echo "$dev capable $cap running $sta"
done
```

That prints only the devices running below their capability, which is usually a short and very informative list.

One caveat before you panic at the output: many devices downtrain deliberately when idle to save power, then come back up under load. If a card shows a low speed at rest, generate some traffic and check again before concluding anything.

## When Lanes Matter and When They Do Not

They matter for anything that moves bulk data continuously. Accelerators loading large models across the bus, high speed network adapters, storage controllers fronting many drives, and capture cards all have a genuine sustained appetite.

They matter far less than people assume for a lot of common hardware. A single NVMe drive at Gen4 x4 already exceeds what most workloads request. A 10 gigabit network adapter needs about 1.25 GB/s per direction, which a single Gen3 lane nearly covers, and two lanes cover comfortably. Putting that card in an x8 slot buys you nothing.

The way I plan a build is to write down the sustained bandwidth each device actually needs, total it, and compare against the platform budget before choosing slots. That exercise usually reveals that one or two devices dominate the requirement and everything else can go anywhere. It takes ten minutes and it prevents the much longer exercise of discovering after assembly that populating the last slot cut your accelerator link in half.

## The Short Version

Lanes are finite and shared. Physical slot size is not electrical width. Generation and width trade off cleanly, so a newer narrow link often matches an older wide one. Bifurcation is a firmware setting that silently loses devices when it is wrong. And `lspci -vv` comparing LnkCap to LnkSta answers almost every question you will have, in about five seconds.

## References

- [PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [M.2](https://en.wikipedia.org/wiki/M.2)
- [Non-Volatile Memory Express](https://en.wikipedia.org/wiki/NVM_Express)
