
## The cost of the virtual switch

In a normal virtualized setup, a guest's packets go from the guest driver to the
hypervisor, through a software switch, out the physical card, and the same path
in reverse on the way back. Modern paravirtualized drivers make this efficient,
but it is still host CPU cycles per packet and still adds latency and jitter.

For most workloads that is entirely fine. For a firewall VM, a storage target, a
latency sensitive service, or anything pushing near line rate on fast links, the
software path becomes the bottleneck, and you end up buying CPU to move packets
rather than to run applications.

Single root I/O virtualization is the hardware answer. A capable PCIe device
advertises itself as one physical function plus a configurable number of virtual
functions. Each virtual function has its own PCI address, its own queues, and
its own MAC. Assign one to a guest and that guest talks to silicon, with the
hypervisor out of the data path entirely.

## Turning it on

Three layers have to agree: firmware, kernel, and driver.

```bash
# 1. IOMMU must be enabled in firmware and on the kernel command line
#    intel_iommu=on  or  amd_iommu=on, plus iommu=pt for passthrough mode
grep -o 'i[o]mmu=[^ ]*' /proc/cmdline
dmesg | grep -iE 'DMAR|IOMMU' | head

# 2. Does the device support it, and how many VFs can it create?
lspci -vv -s 0000:41:00.0 | grep -A3 'SR-IOV'
cat /sys/class/net/ens1f0/device/sriov_totalvfs

# 3. Create virtual functions
echo 8 > /sys/class/net/ens1f0/device/sriov_numvfs
ip link show ens1f0
```

Writing to `sriov_numvfs` is not persistent. Set it back to 0 before changing
it, and make it survive reboot with a udev rule or a systemd unit ordered before
whatever consumes the functions:

```ini
[Unit]
Description=Create SR-IOV VFs on ens1f0
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'echo 0 > /sys/class/net/ens1f0/device/sriov_numvfs'
ExecStart=/bin/sh -c 'echo 8 > /sys/class/net/ens1f0/device/sriov_numvfs'

[Install]
WantedBy=multi-user.target
```

## Configuring the functions from the host

This is the part people miss. The host retains control of each virtual function
even though the guest drives the data path, and that control is where your
security boundary lives.

```bash
# pin a MAC so the guest cannot choose its own
ip link set ens1f0 vf 0 mac 52:54:00:11:22:33

# force a VLAN: the guest sends untagged, hardware tags it
ip link set ens1f0 vf 0 vlan 40

# stop the guest from changing its MAC or entering promiscuous mode
ip link set ens1f0 vf 0 spoofchk on trust off

# rate limit
ip link set ens1f0 vf 0 max_tx_rate 1000
```

Setting the VLAN on the virtual function from the host is the equivalent of an
access port on a switch. The guest cannot escape its VLAN by sending tagged
frames, because the hardware enforces the tag. With `spoofchk on`, it cannot
forge a source MAC either. Without those two settings you have handed a guest a
trunk port, which is a segmentation failure dressed up as a performance
optimisation.

Then bind the function to the passthrough driver and hand it to the guest:

```bash
lspci -nn | grep 'Virtual Function'
echo 0000:41:10.0 > /sys/bus/pci/devices/0000:41:10.0/driver/unbind
echo 8086 154c > /sys/bus/pci/drivers/vfio-pci/new_id
```

## IOMMU groups decide what is possible

The IOMMU is what makes any of this safe. It translates device initiated memory
accesses, so a device assigned to a guest can only reach that guest's memory. It
also groups devices by isolation domain, and a group is the smallest unit you
can assign.

```bash
for d in /sys/kernel/iommu_groups/*/devices/*; do
  g=${d#*/iommu_groups/}; g=${g%%/*}
  echo "group $g: $(lspci -nns ${d##*/})"
done | sort -V
```

If the device you want shares a group with a controller the host needs, you
cannot pass it through cleanly. Group composition is a function of how the board
wires slots, so it is a hardware purchasing consideration, not something you fix
in software.

## What you give up

Passthrough is not free, and the losses are all in flexibility.

**Live migration.** A guest with direct hardware assigned has device state the
hypervisor cannot see or serialise. Some stacks have migration support for
specific devices with driver cooperation, but the general answer is that
passthrough and live migration do not mix. If your availability plan depends on
moving guests between hosts without downtime, this is a serious constraint.

**Snapshots with memory state.** Same reason.

**Host visibility.** Traffic on a virtual function does not traverse the host
software switch, so host side capture, mirroring, and flow accounting do not see
it. Monitoring has to move to the physical switch or into the guest, and that is
a change to your operational model you should plan before you deploy, not after
someone asks for a packet capture.

**Fixed limits.** The number of virtual functions is a hardware property. You
cannot oversubscribe past it the way you can with a software switch.

**Coupling to hardware.** The guest needs a driver for the specific virtual
function type, and the guest becomes tied to that hardware family.

## How I decide

My default is the software path, because flexibility is worth more than a few
percent of CPU for almost everything. I reach for SR-IOV when a specific guest
has a measured, sustained networking bottleneck that the software switch is
causing, and when that guest is one I am content to pin to a host.

When I do use it, the host side settings are not optional: MAC pinned, VLAN
forced, spoof checking on, trust off. Direct hardware access to a guest is a
privilege, and the whole reason the physical function keeps that control surface
is so you can constrain what you handed out.

## References

- [Linux PCI SR-IOV HOWTO](https://docs.kernel.org/PCI/pci-iov-howto.html)
- [Single-root input/output virtualization](https://en.wikipedia.org/wiki/Single-root_input/output_virtualization)
- [IOMMU](https://en.wikipedia.org/wiki/IOMMU)
- [ip-link(8) manual page](https://man7.org/linux/man-pages/man8/ip-link.8.html)
- [Linux network scaling documentation](https://docs.kernel.org/networking/scaling.html)
