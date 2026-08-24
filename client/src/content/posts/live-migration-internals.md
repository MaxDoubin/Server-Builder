
## The problem statement

You want to move a running virtual machine from host A to host B without the workload noticing. The VM's state is its memory, its CPU registers, its device state, and its storage. Memory is the hard part, because it is large and because the guest keeps changing it while you copy.

That last clause is the whole engineering problem. Copying a static several gigabyte memory image is trivial. Copying it while a guest actively dirties pages is a race.

## Pre-copy, the default approach

Nearly every hypervisor defaults to pre-copy migration, which works in three phases.

**Phase one: setup.** The destination allocates memory and prepares an identical virtual machine shell. The two hosts negotiate capabilities and confirm the guest CPU model is satisfiable on the destination.

**Phase two: iterative copy.** The source enables dirty page tracking, typically by write protecting guest memory so the hypervisor gets a fault and can mark the page dirty. Then it copies all memory to the destination while the VM keeps running. Some of those pages get modified during the copy, so the source does another pass, sending only the pages dirtied since the last one. Then another. Each pass should be smaller than the last.

**Phase three: stop and copy.** When the remaining dirty set is small enough to transfer within the downtime target, the source pauses the VM, sends the last dirty pages plus CPU and device state, and the destination resumes. Total guest visible downtime is the length of this final step, ideally tens of milliseconds.

## Dirty rate is the whole game

Convergence happens only if the guest dirties memory more slowly than you can send it. If the guest writes 2 GB per second and your link moves 1 GB per second, the dirty set never shrinks and the migration iterates forever.

Three ways out, in increasing order of aggression:

**More bandwidth.** Raise the migration bandwidth cap or use a dedicated, faster migration network. Often the cap is set conservatively and simply raising it fixes everything.

**Auto convergence.** The hypervisor deliberately throttles the guest's vCPUs, slowing the rate at which it can dirty pages until the copy catches up. The guest gets slower during migration but the migration finishes. This is usually the right trade.

**Post-copy.** Change the algorithm. Pause the VM early, send the minimum state, and resume it on the destination immediately. Pages that have not arrived yet are fetched on demand when the guest touches them, causing a fault across the network.

Post-copy converges in bounded time regardless of dirty rate, which is its entire appeal. The cost is real: during the fetch phase the guest runs with degraded memory latency, and if the network fails midway, the VM's memory is split across two hosts and the VM is unrecoverable. Pre-copy failure just means the migration aborts and the VM keeps running happily on the source. That asymmetry is why pre-copy is the default and post-copy is the escape hatch.

A common hybrid: start with pre-copy, and if it fails to converge after a set number of iterations, switch to post-copy.

## Storage and the network handoff

If both hosts see the same shared storage, the disk does not move and there is nothing to do. This is why shared storage is effectively a prerequisite for casual live migration.

Without it, you migrate the disk too, usually by mirroring writes to both copies while a background copy runs, then cutting over. This works and it multiplies the data volume and duration substantially.

The network handoff is delightfully low tech. When the VM resumes on the destination, its MAC address is suddenly behind a different physical port. The switch does not know that. So the destination host emits a gratuitous ARP or RARP announcement on behalf of the guest, the switches update their MAC address tables, and traffic follows. If you have ever seen a migrated VM unreachable for a second or two, this is usually why, and the culprit is often port security, a MAC move policy, or a slow spanning tree convergence on the destination port.

## Why migrations fail

**CPU model mismatch.** The guest was booted seeing a set of CPU features. If the destination lacks one, the guest could execute an illegal instruction after resuming, so the hypervisor refuses upfront. The fix is to define a common baseline CPU model across the cluster rather than exposing host passthrough. You give up a little performance and gain the ability to move anything anywhere.

**Passthrough devices.** A VM with a physical device assigned to it generally cannot migrate, because that device's state lives in hardware the destination does not have.

**Non convergence.** Covered above. A busy in memory database is the classic offender.

**Version skew.** The destination hypervisor being older than the source frequently blocks migration, which is why rolling upgrades go in a specific direction.

**Huge pages and memory backing** mismatches between hosts.

## Practical settings and pre-flight checks

```bash
# libvirt: migrate with a bandwidth cap, auto-convergence, compression,
# and post-copy available as a fallback.
virsh migrate --live --auto-converge --postcopy \
  --persistent --undefinesource \
  --bandwidth 5000 \
  --timeout 300 --timeout-postcopy \
  app-vm-01 qemu+ssh://host-b.internal/system

# Watch progress: remaining, processed, and the current dirty rate
watch -n1 'virsh domjobinfo app-vm-01'

# If it is clearly never converging, force the switch
virsh migrate-postcopy app-vm-01

# Or give up cleanly. Pre-copy abort is safe: the VM stays on the source.
virsh domjobabort app-vm-01
```

`--timeout 300 --timeout-postcopy` is the hybrid: try pre-copy for five minutes, then switch rather than iterating forever.

Before a real maintenance window, I test the migration path with a low value VM first, on the same network and storage the real ones will use. Confirm the cluster CPU baseline is uniform. Put migration traffic on its own VLAN so a large transfer does not compete with production. And know the abort command before you need it, because a stuck migration during a maintenance window is a much calmer event when you know that aborting a pre-copy is completely safe.

## References

- [libvirt migration documentation](https://libvirt.org/migration.html)
- [QEMU documentation](https://www.qemu.org/docs/master/)
- [Live migration on Wikipedia](https://en.wikipedia.org/wiki/Live_migration)
- [Proxmox VE wiki](https://pve.proxmox.com/wiki/Main_Page)
- [KVM project](https://www.linux-kvm.org/page/Main_Page)
