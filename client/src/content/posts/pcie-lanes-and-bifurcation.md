
## Physical size is not electrical width

The most common hardware disappointment I see is somebody putting a card in a
full length slot and finding it runs at a quarter of the expected speed. The
slot was physically x16 and electrically x4. Boards do this on purpose, because
an open ended or full length connector accepts more cards, and lanes are
expensive.

PCI Express is a point to point serial interconnect. A link is made of lanes,
each lane is a pair of differential pairs, one direction each. Links come in
widths of x1, x4, x8, and x16. Bandwidth scales roughly linearly with width and
doubles with each generation, so an x4 link at one generation is comparable to
an x8 link at the generation before it. That equivalence is genuinely useful:
a newer, narrower slot is often fine.

## Lanes are a budget

Your CPU provides a fixed number of lanes. Consumer platforms provide relatively
few, most of which are already committed to the primary graphics slot and one or
two NVMe drives. Server platforms provide many more, which is a large part of
what you are paying for.

The chipset complicates it. Lanes hanging off the chipset are not direct CPU
lanes: they share a single uplink back to the CPU. Four NVMe drives on chipset
lanes all contend for that uplink. For a boot drive nobody cares. For a storage
array or a network card doing line rate, that shared uplink is a real
bottleneck, and it is invisible unless you go looking at the topology.

This is the thing to internalise: adding a card does not just consume a slot, it
consumes lanes from a pool, and where those lanes come from changes the
performance.

## Reading what you actually have

Linux will tell you the truth if you ask correctly.

```bash
# capability versus current negotiated link for every device
lspci -vv 2>/dev/null | grep -E '^[0-9a-f]|LnkCap:|LnkSta:' | \
  grep -B2 LnkSta | head -60

# a single device, clean
sudo lspci -vv -s 0000:41:00.0 | grep -E 'LnkCap|LnkSta'

# topology: what hangs off what
lspci -tv
```

`LnkCap` is what the device is capable of. `LnkSta` is what it negotiated. If
`LnkCap` says Width x16 and `LnkSta` says Width x4, you are in a slot that is
electrically narrower, or lanes were reallocated when you populated another
slot. If `LnkSta` shows a lower speed than `LnkCap`, either the slot is an older
generation, the device is in a power saving state, or there is a signal
integrity problem, and riser cables are a frequent cause of that last one.

Also worth knowing: some devices deliberately downtrain when idle and come back
up under load, so check under load before you file a bug against your own
motherboard.

## Bifurcation

Bifurcation is the board splitting one x16 link into multiple independent links,
typically x8/x8 or x4/x4/x4/x4. This is what makes passive multi drive NVMe
carrier cards work: the card has no switch chip, it just wires four M.2 slots to
four groups of four lanes and relies on the host to present them as four
separate links.

Two consequences follow:

- If the board does not support bifurcation on that slot, a passive carrier card
  will show exactly one drive. The card is not broken.
- Cards with an onboard PCIe switch work without bifurcation support, because
  the switch does the splitting. They cost more and add a small amount of
  latency, and they let every downstream device share the upstream link.

Bifurcation is usually a firmware setting, per slot, and it is often buried
under a menu that does not use the word bifurcation. Server firmware tends to
expose it cleanly. Consumer firmware is a lottery.

## Where this intersects with virtualization

If you plan to pass a device through to a VM, lanes are only half the story. The
IOMMU groups devices according to how they are physically connected, and you can
only pass through a complete group. Two devices sharing a group means passing
both or neither.

```bash
for d in /sys/kernel/iommu_groups/*/devices/*; do
  n=${d#*/iommu_groups/}; n=${n%%/*}
  printf 'group %s: %s\n' "$n" "$(lspci -nns ${d##*/})"
done | sort -V
```

Clean groups are largely a function of how the board wires slots to the root
complex. Slots connected directly to CPU lanes tend to isolate well. Chipset
slots frequently share a group with a pile of onboard controllers. If
passthrough is in your plans, this output is more important than the slot count
on the box.

## How I decide what goes where

My priority order for a limited lane budget is simple, and it comes from asking
what each card actually needs sustained rather than what it can theoretically
burst.

A high speed network card needs real bandwidth and needs it consistently, so it
gets direct CPU lanes. Storage controllers fronting many drives get direct lanes
too. An accelerator gets whatever width it needs for its workload, which for
inference is less than people assume because the weights load once and stay
resident. Anything low bandwidth, a serial card, a management card, a sound
card, goes on chipset lanes without a second thought.

Then I verify with `lspci -vv` rather than trusting the manual, because board
manuals are frequently wrong about which slot loses lanes when another is
populated. Five minutes of reading `LnkSta` has saved me from more than one
wrong conclusion about why something was slow.

## References

- [PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [IOMMU](https://en.wikipedia.org/wiki/IOMMU)
- [Linux PCI SR-IOV HOWTO](https://docs.kernel.org/PCI/pci-iov-howto.html)
