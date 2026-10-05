
## Lanes Are a Budget, Not a Feature

Every platform has a fixed number of PCIe lanes. The CPU provides some directly, the chipset provides more behind a link back to the CPU, and that total is the entire budget for every expansion card, NVMe drive, and onboard controller in the system. Consumer platforms have relatively few, and most of those are already committed to the primary graphics slot and one or two NVMe drives. Server platforms have many more, which is a large part of what you are paying for.

This is the mental model that fixes most PCIe confusion. Slots are not independent resources. They are claims on a shared pool, and the motherboard designer already decided how that pool gets divided. When you populate the second full length slot and the first one drops from x16 to x8, nothing broke. You spent lanes.

Where a lane comes from matters as much as how many you have. CPU lanes come straight off the processor's root complex: direct, uncontended, full bandwidth to memory. Chipset lanes all share the chipset's single uplink to the CPU. A boot drive back there will never notice. A few NVMe drives behind the chipset can saturate that uplink together and starve each other, a fast NIC behind it competes with all of them, and nothing tells you so unless you look at the topology.

A physical slot size and an electrical lane count are also different things. An x16 slot may be wired for x4. A card will happily negotiate down to whatever the slot actually provides, and it will do so silently. This is why "it fits" tells you nothing. Boards do this on purpose, because a full length or open ended connector accepts more cards, and lanes are expensive.

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

This is how a passive carrier board holding four NVMe drives works in a single slot. There is no chip on the card doing anything clever, it is wiring: four M.2 sockets, each connected to its own group of four lanes. The platform has to split the lanes, and if the firmware does not support the split, only the first drive appears. That failure mode confuses a lot of people: three drives simply do not exist, with no error anywhere, and the card is not broken.

Bifurcation is a capability of the board and its firmware, configured per slot, so check the manual's bifurcation options for the exact slot before buying a passive carrier. The setting is often buried under a menu that never uses the word bifurcation. Server firmware tends to expose it cleanly. Consumer firmware is a lottery.

A PCIe switch is the active alternative. It presents more downstream lanes than it has upstream, exactly like an Ethernet switch presents more ports than uplink capacity. Four x4 devices behind an x8 upstream link works fine when they are not all busy at once, and becomes a bottleneck when they are. Whether that oversubscription matters depends entirely on whether your workload drives all the devices simultaneously.

Carrier cards with a switch chip work in slots without bifurcation support, because the switch does the splitting. You pay for that in cost, heat, a little added latency, and the shared upstream link. Some server drive backplanes use switches the same way.

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

Capability says the device can do Gen4 x16. Status says it negotiated Gen4 x8. That gap is your answer, and now the question is whether the slot is wired x8, whether another slot took the lanes, or whether a firmware setting split them. If none of those explain it, suspect a card that is not fully seated or a riser wired for fewer lanes than the slot.

A quicker scan across everything in the machine, comparing both speed and width:

```bash
for dev in $(lspci -D | awk '{print $1}'); do
  vv=$(sudo lspci -vv -s "$dev" 2>/dev/null)
  cap=$(grep -m1 'LnkCap:' <<< "$vv" | grep -oP 'Speed \K[0-9.]+GT/s|Width \Kx\d+' | xargs)
  sta=$(grep -m1 'LnkSta:' <<< "$vv" | grep -oP 'Speed \K[0-9.]+GT/s|Width \Kx\d+' | xargs)
  [ -n "$cap" ] && [ "$cap" != "$sta" ] && echo "$dev capable $cap running $sta"
done
```

That prints only the devices running below their capability, which is usually a short and very informative list. Not every entry is a fault. A Gen4 card in a Gen3 slot is expected to show up, and so are root ports and bridges with a slower or narrower card below them.

One caveat before you panic at the output: many devices downtrain deliberately when idle to save power, then come back up under load. If a card shows a low speed at rest, generate some traffic and check again before concluding anything. A speed that stays low under load points at signal integrity instead, and riser cables are a frequent cause.

To see what hangs off what, including which devices sit behind the chipset or a switch:

```bash
lspci -tv
```

That tree view is how you spot three drives sharing one upstream port.

Check again after every hardware change. A reseat, a firmware update, or a new riser can silently change a negotiated link, and the only symptom is that something got slower.

## When Lanes Matter and When They Do Not

They matter for anything that moves bulk data continuously. Accelerators loading large models across the bus, high speed network adapters, storage controllers fronting many drives, and capture cards all have a genuine sustained appetite.

They matter far less than people assume for a lot of common hardware. A single NVMe drive at Gen4 x4 already exceeds what most workloads request. A 10 gigabit network adapter needs about 1.25 GB/s per direction, which a single Gen3 lane nearly covers, and two lanes cover comfortably. Putting that card in an x8 slot buys you nothing. Inference on a single accelerator is similar once the model is loaded: if the whole model fits in the card's memory, the weights cross the bus once and stay resident, so a narrower link mostly costs you load time.

The arithmetic cuts the other way at the top end. A 100 gigabit adapter needs about 12.5 GB/s per direction at line rate. That does not fit in Gen3 x8, which carries about 8 GB/s. It needs Gen3 x16 or Gen4 x8. In a Gen3 x8 slot it will link up, pass traffic, and quietly cap out well below line rate.

The way I plan a build is to write down the sustained bandwidth each device actually needs, total it, and compare against the platform budget before choosing slots. That exercise usually reveals that one or two devices dominate the requirement and everything else can go anywhere. It takes ten minutes and it prevents the much longer exercise of discovering after assembly that populating the last slot cut your accelerator link in half.

Placement follows from the list. The devices with a sustained appetite (usually the primary NIC, storage controllers fronting many drives, and whatever backs your VMs) get CPU lanes. The boot drive, the management NIC, a serial card, and anything else slow or bursty go behind the chipset without a second thought. Plan from the slot table in the board manual rather than the physical connectors, then confirm with `lspci` after assembly, because manuals are not always right about which slot loses lanes when another is populated.

## Passthrough and IOMMU Groups

If you plan to pass a device through to a VM, lanes are only half the story. The kernel sorts devices into IOMMU groups according to how they are physically connected, and a group is the smallest unit you can pass through. Two devices sharing a group means passing both or neither.

```bash
for d in /sys/kernel/iommu_groups/*/devices/*; do
  n=${d#*/iommu_groups/}; n=${n%%/*}
  printf 'group %s: %s\n' "$n" "$(lspci -nns ${d##*/})"
done | sort -V
```

Clean groups are largely a function of how the board wires slots to the root complex. Slots on CPU lanes tend to isolate well. Chipset slots frequently share a group with a pile of onboard controllers. If passthrough is in your plans, this output matters more than the slot count on the box.

## The Short Version

Lanes are finite and shared, and chipset lanes share one uplink on top of that. Physical slot size is not electrical width. Generation and width trade off cleanly, so a newer narrow link often matches an older wide one. Bifurcation is a firmware setting that silently loses devices when it is wrong. And `lspci -vv` comparing LnkCap to LnkSta answers almost every question you will have, in about five seconds.

## References

- [PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [M.2](https://en.wikipedia.org/wiki/M.2)
- [Non-Volatile Memory Express](https://en.wikipedia.org/wiki/NVM_Express)
- [IOMMU](https://en.wikipedia.org/wiki/IOMMU)
