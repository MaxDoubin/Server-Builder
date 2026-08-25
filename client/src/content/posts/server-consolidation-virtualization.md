
## The Case for Consolidation

Physical servers are expensive to buy, expensive to power, and expensive to manage. A rack of physical servers, each running at 15 percent CPU utilization, is wasting most of its capacity while still consuming full power and requiring full maintenance.

Virtualization consolidates many workloads onto fewer physical hosts. The same compute, done on fewer machines, with lower cost, lower power, and less physical complexity.

The power argument is stronger than it looks, because an idle server is not a cheap server. A typical two-socket machine draws somewhere between 30 and 50 percent of its peak wattage doing nothing at all, so twenty boxes at 15 percent utilization burn most of the electricity of twenty boxes at full load while doing a fraction of the work. Every watt is also a watt of heat that cooling has to remove, which is why the real saving is always larger than the difference in the servers' own power draw.

## Planning the Consolidation

Start with an inventory of what you are consolidating. For each physical server:
- CPU utilization over time (average and peak)
- Memory utilization
- Storage I/O requirements
- Network throughput
- Any special hardware requirements (GPU, USB passthrough, NUMA sensitivity)

A server running at 20 percent CPU average with 30 percent peak can share a physical host with several other similar workloads. A server running at 80 percent CPU peak needs a dedicated host or careful co-placement planning.

Collect this over at least a full month, and record percentiles rather than averages. A monthly average hides the payroll run, the overnight backup, and the quarter-end report, and those are exactly the events that make a consolidated host fall over. The 95th percentile of a five-minute sample, plus the observed absolute peak, is a far more honest input than a mean. On Linux hosts the data is probably already there if sysstat has been running: `sar` reads daily binary files under `/var/log/sa` and keeps several weeks of them by default.

Two things belong in the inventory that people usually leave out. The first is *when* each workload peaks. Two servers that both peak at 80 percent are a fine pair if one peaks at 09:00 and the other at 02:00, and a disaster if they peak together. The second is what each workload is licensed under, which is discussed at the end and which has killed more consolidation projects than capacity ever has.

## Sizing the New Infrastructure

Rule of thumb: plan for 4:1 to 8:1 VM-to-physical-core ratios for typical workloads, 2:1 for compute-intensive, and 1:1 or even less for databases.

For memory, there is no overcommitment that is safe for production. VM memory should sum to less than physical host memory, with headroom for the hypervisor.

Hypervisors do offer memory reclamation, and it is worth knowing why it does not change that rule. Ballooning has a driver inside the guest allocate pages and hand them back to the host, which works but depends on the guest cooperating and reacting in time. Kernel same-page merging on KVM scans memory for identical pages and collapses them, which genuinely helps when you run forty near-identical virtual desktops and helps almost nothing when you run twelve different server workloads, because their pages are not the same. Both burn CPU to save RAM, and both degrade exactly when the host is already under pressure. Once a host starts swapping guest memory to disk, performance does not degrade gracefully, it falls off a cliff, and the hypervisor rather than you decides which VMs suffer.

Budget the hypervisor's own footprint too. Reserve roughly 10 to 15 percent of host RAM for the hypervisor kernel, the per-VM device model and page tables, and enough free memory that the host is never the thing that runs out.

NUMA is the sizing detail beginners miss entirely. On a two-socket host each CPU owns its own memory, and a core reaching across the interconnect to the other socket's memory pays a latency penalty commonly in the range of 1.5 to 2 times local access. A VM whose vCPU count or memory size exceeds one NUMA node gets split across both and its performance becomes unpredictable. Check the node layout with `lscpu`, then size VMs to fit inside a node wherever you can. A 12 vCPU VM on a host with 16 cores per socket is fine. The same VM on a host with 8 cores per socket is a problem you will spend a week not diagnosing.

The last sizing constraint is the failure domain, and it is the one that actually determines your host count. Consolidating 20 servers onto 2 hosts means one host failure takes out half the estate. If you want N+1, meaning any single host can fail and the survivors absorb its VMs, then across three hosts your steady-state ceiling is about 66 percent utilization, and across four hosts about 75 percent. Sizing three hosts to run at 85 percent each and calling it a cluster produces a cluster that cannot survive the failure it exists to survive.

## Migration Strategy

**Lift and shift:** Convert the existing OS to a VM without changes. Fastest approach, minimal risk, but you carry over any technical debt.

**Rebuild:** Deploy a fresh OS in a VM and reinstall applications. More work but produces a cleaner result.

P2V (physical-to-virtual) tools can automate the lift and shift conversion. VMware vCenter Converter and the open-source Clonezilla are common options.

Be clear about what each tool actually does. `virt-v2v`, part of the libguestfs project, is the actively maintained open-source path for converting a physical machine or a VMware guest into a KVM, Proxmox, or oVirt guest, and it does the important part: it inspects the guest operating system and injects the drivers the new virtual hardware needs. Clonezilla, by contrast, is a disk imaging tool. It will faithfully copy your disk into a virtual one and it will not touch the drivers, which means the copy may well be unbootable.

That driver problem is the number one lift-and-shift failure and it has two recognisable faces. On Windows the VM boots to a bugcheck reading INACCESSIBLE_BOOT_DEVICE, because the image has drivers for a PERC or LSI controller and is now looking at a virtio or LSI Logic SAS device it has never heard of. On Linux the machine drops to an initramfs prompt because `virtio_blk` or `virtio_scsi` was never built into the initrd on a machine that had no use for it. Both are fixable afterwards and both are much easier to avoid: install the virtio drivers on the physical machine before you image it, or let `virt-v2v` do the injection.

Three smaller things reliably bite. The NIC gets a new MAC address, so anything licensed to a MAC stops working and any distribution that pins interface names to hardware comes up with no network. Vendor hardware agents such as OpenManage keep running, keep polling hardware that no longer exists, and fill logs with errors, so uninstall them as part of the cutover. And anything physically plugged into the old machine, a USB license dongle, a serial device, a fax card, either needs passthrough configured or needs a different plan, and passthrough will stop that VM from live migrating.

## Post-Consolidation Monitoring

After consolidation, monitor CPU ready time (VMs waiting to be scheduled), memory balloon and swap activity, and storage latency. These metrics reveal whether your sizing was correct and where you need to rebalance workloads.

Put numbers on those. CPU ready, shown as %RDY in esxtop, is time a vCPU was runnable but had no physical core to run on. Under 5 percent per vCPU is normal, 5 to 10 percent means you are oversubscribed, and above 10 percent means guests are visibly slow for reasons nothing inside the guest can explain. On KVM and Proxmox the equivalent signal is visible from inside the guest as steal time, the `st` column in `vmstat` output, and anything consistently above a few percent means the same thing. Steal time is the metric to teach application owners, because it is the one that answers "the server is slow but the CPU graph looks fine".

Storage is where consolidation surprises people. Ten physical servers each doing tidy sequential reads become, at the array, ten interleaved streams that look like pure random I/O. This is the I/O blender effect, and it is why a datastore that benchmarked beautifully in isolation posts terrible numbers in production. Watch latency rather than IOPS: above roughly 20 ms on spinning disks, or above 2 ms on flash, something is queued behind something else.

Network needs the same rethink. Ten servers with one gigabit each are not replaced by one host with one gigabit. Give consolidated hosts 10 GbE or a LACP bundle, and give backup, live migration, and storage traffic their own capacity rather than letting a migration saturate the link your applications are using.

## When Not To Consolidate

Some workloads should stay on iron. Anything needing a physical device that cannot be passed through cleanly, anything with hard real-time or jitter requirements such as telephony media processing, and anything whose licence makes virtualization ruinous.

That last one is not a technical objection but it is a real one. Windows Server Standard entitles you to run two virtualized instances per licensed host while Datacenter entitles you to unlimited instances, so the crossover point is a specific number of VMs per host that you can calculate before you buy anything. Some database vendors have historically insisted that you license every core a VM could theoretically migrate to, not just the cores it runs on, which turns a four-host cluster into a four-host bill. Work out the licence cost before the hardware cost, because occasionally the answer is that the old physical box was the cheap option all along.

## References

- https://en.wikipedia.org/wiki/Virtualization
- https://en.wikipedia.org/wiki/Non-uniform_memory_access
- https://www.kernel.org/doc/html/latest/admin-guide/mm/ksm.html
- https://pve.proxmox.com/pve-docs/pve-admin-guide.html
- https://libguestfs.org/virt-v2v.1.html
- https://man7.org/linux/man-pages/man8/vmstat.8.html
