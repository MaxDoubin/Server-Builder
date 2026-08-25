
## The Case for Consolidation

Physical servers are expensive to buy, expensive to power, and expensive to manage. A rack of physical servers, each running at 15 percent CPU utilization, is wasting most of its capacity while still consuming full power and requiring full maintenance.

Virtualization consolidates many workloads onto fewer physical hosts. The same compute, done on fewer machines, with lower cost, lower power, and less physical complexity.

## Planning the Consolidation

Start with an inventory of what you are consolidating. For each physical server:
- CPU utilization over time (average and peak)
- Memory utilization
- Storage I/O requirements
- Network throughput
- Any special hardware requirements (GPU, USB passthrough, NUMA sensitivity)

A server running at 20 percent CPU average with 30 percent peak can share a physical host with several other similar workloads. A server running at 80 percent CPU peak needs a dedicated host or careful co-placement planning.

## Sizing the New Infrastructure

Rule of thumb: plan for 4:1 to 8:1 VM-to-physical-core ratios for typical workloads, 2:1 for compute-intensive, and 1:1 or even less for databases.

For memory, there is no overcommitment that is safe for production. VM memory should sum to less than physical host memory, with headroom for the hypervisor.

## Migration Strategy

**Lift and shift:** Convert the existing OS to a VM without changes. Fastest approach, minimal risk, but you carry over any technical debt.

**Rebuild:** Deploy a fresh OS in a VM and reinstall applications. More work but produces a cleaner result.

P2V (physical-to-virtual) tools can automate the lift and shift conversion. VMware vCenter Converter and the open-source Clonezilla are common options.

## Post-Consolidation Monitoring

After consolidation, monitor CPU ready time (VMs waiting to be scheduled), memory balloon and swap activity, and storage latency. These metrics reveal whether your sizing was correct and where you need to rebalance workloads.
