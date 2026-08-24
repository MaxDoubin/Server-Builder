
## Why passthrough is worth understanding properly

Passing a physical device into a virtual machine is one of those tasks where copying a forum post works about half the time and teaches you nothing either way. The pieces are not complicated once you know what each one is for, and knowing that turns a night of blind reboots into a ten minute checklist.

The goal is to take a PCIe device away from the host kernel and hand it, with its own DMA translations, to a guest. Three things make that possible: an IOMMU that can give the guest a private address space, a stub driver on the host so nothing else claims the card, and a guest that can drive the hardware directly.

## Step one: is the IOMMU on and grouping sanely

The IOMMU exists so a device can do DMA using guest physical addresses without being able to scribble anywhere in host memory. Without it, passthrough would be a security hole with a nice UI.

Enable it on the kernel command line, then reboot and verify rather than assume.

```bash
# Intel hosts
intel_iommu=on iommu=pt
# AMD hosts
amd_iommu=on iommu=pt

# After reboot, confirm the kernel actually brought it up
dmesg | grep -e DMAR -e IOMMU | head

# Walk the groups
for g in /sys/kernel/iommu_groups/*; do
  echo "Group ${g##*/}:"
  for d in "$g"/devices/*; do
    echo -n "  "
    lspci -nns "${d##*/}"
  done
done
```

That loop is the single most useful command in the whole exercise. An IOMMU group is the smallest unit the hardware can isolate, so everything in a group moves together. If your graphics card shares a group with a storage controller the host is using, you cannot pass just the card. Either move it to a different physical slot, which often lands it behind a different root port, or accept that the group goes as a unit.

There is a kernel patch commonly called the ACS override that splits groups the hardware does not actually guarantee are isolated. It frequently works. It also removes the isolation guarantee you enabled the IOMMU to get. On a lab box where you understand the tradeoff, fine. On anything holding data I care about, I would rather move the card.

## Step two: take the device away from the host

The host must not have a driver bound to the card at the moment the guest starts. The clean way is to bind the vendor and device IDs to vfio-pci early in boot.

```bash
lspci -nn | grep -Ei 'vga|3d|audio device'
# 01:00.0 VGA compatible controller [0300]: ... [10de:xxxx]
# 01:00.1 Audio device [0403]: ... [10de:yyyy]

printf 'options vfio-pci ids=10de:xxxx,10de:yyyy disable_vga=1\n' \
  > /etc/modprobe.d/vfio.conf
printf 'blacklist nouveau\nblacklist nvidia\n' \
  > /etc/modprobe.d/blacklist-gpu.conf
update-initramfs -u -k all
reboot
```

Two details matter. First, pass every function of the device, not just the display function. Graphics cards usually present an audio function too, and sometimes USB and serial functions. They share the group and they all go together. Second, verify the binding after reboot.

```bash
lspci -nnk -s 01:00.0
# Kernel driver in use: vfio-pci        <- what you want
```

If a host driver still owns it, the blacklist did not take effect or the initramfs was not rebuilt.

## Step three: the guest side

Use a UEFI machine type with an EFI disk, choose a modern emulated chipset, and add the device as a whole PCI function with the all functions option so the audio companion comes along. For a card that will drive the guest console, mark it as the primary display and give the guest no emulated adapter, otherwise the guest cheerfully renders to the fake one.

The other setting worth knowing is CPU type. Passing host CPU features avoids a class of driver complaints, and on hosts where a guest driver historically objected to running under a hypervisor, hiding the hypervisor flag was the standard workaround. Treat that as a lever to reach for when you see the specific symptom, not as something to set preemptively.

## The failure modes, in the order I check them

**The VM starts but the guest shows an error code on the device.** Usually a driver refusing to initialize under virtualization, a missing function from the group, or a card that needs its firmware ROM supplied because the host initialized it first at boot.

**The host locks up when the VM starts.** Almost always the host was still using the card, often because it is the boot display and the console framebuffer is attached to it. Move the console to another adapter or to serial.

**It works once, then not after a guest reboot.** The card did not reset cleanly. Some devices implement function level reset poorly, and until the slot is power cycled the device stays in a bad state. Check whether the device exposes a reset method, and if not, plan on cold boots.

**Everything binds correctly but performance is poor.** Look at whether guest memory is backed by hugepages, whether the VM is pinned to cores on the same NUMA node as the slot, and whether the link trained at full width. A card that negotiated a narrow link because of a riser will quietly halve your bandwidth.

```bash
lspci -vv -s 01:00.0 | grep -E 'LnkCap|LnkSta'
```

## The habit that saves the most time

Change one variable, reboot, verify with a command, write down the result. Passthrough problems look mysterious mainly because people change four things at once and then cannot tell which one helped. The stack is deterministic. Group, binding, guest config, driver. Walk it in order and it stops being folklore.

## References

- [Linux kernel VFIO documentation](https://www.kernel.org/doc/html/latest/driver-api/vfio.html)
- [Proxmox VE PCI passthrough wiki](https://pve.proxmox.com/wiki/PCI_Passthrough)
- [Proxmox VE administration guide](https://pve.proxmox.com/pve-docs/)
- [Kernel command line parameters](https://www.kernel.org/doc/html/latest/admin-guide/kernel-parameters.html)
- [IOMMU](https://en.wikipedia.org/wiki/IOMMU)
