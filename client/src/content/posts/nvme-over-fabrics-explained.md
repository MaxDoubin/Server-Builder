
## The problem with the old translation

For years, network block storage meant taking a request, wrapping it in SCSI, and shipping it somewhere. iSCSI put SCSI inside TCP. Fibre Channel put SCSI on its own fabric. Both work, both are deployed everywhere, and both inherited a command model designed around devices with a single deep queue and a spinning platter behind it.

Flash broke that assumption. An NVMe device is not one queue, it is many independent submission and completion queue pairs, so different CPU cores can issue work without fighting over a shared lock. The whole point of the NVMe command set is parallelism and a short path from application to media. Translating that into SCSI to cross a network throws away the exact property that made it fast.

NVMe over Fabrics keeps the model. The host still creates queue pairs, still submits NVMe commands, still reaps completions. The difference is that the queue pair lives across a network transport instead of across a PCIe link. That is the whole idea, and everything else follows from it.

## Transports and what each one asks of you

The specification defines a transport abstraction, and the common bindings are RDMA, Fibre Channel, and TCP.

RDMA transports let the network adapter place data directly into host memory without the CPU copying it. Over Ethernet that usually means RoCE, which needs a lossless or near lossless fabric to behave, so priority flow control and usually explicit congestion notification must be configured consistently on every switch in the path. It is fast and unforgiving. One misconfigured port turns great performance into pause storms.

Fibre Channel keeps the existing fabric, zoning model, and operational habits of a shop that already runs FC and swaps the command set underneath. If you have that infrastructure and staff who understand it, this is the low drama path.

TCP is the interesting one for everyone else. It runs on ordinary switches with no special fabric configuration, it routes, and it is the reason NVMe over Fabrics stopped being an exotic thing that only appeared in reference architectures. You pay a CPU cost for the network stack and you accept TCP congestion behavior, but the deployment story is dramatically simpler.

## Naming, discovery, and connecting

Everything is addressed by NQN, the NVMe Qualified Name, which plays roughly the role IQN plays in iSCSI. A subsystem exposes namespaces, a host presents its own NQN, and the subsystem decides which hosts may see which namespaces. A discovery service can list what a target offers so you do not hardcode every subsystem.

```bash
# What does this target offer?
nvme discover -t tcp -a 10.20.0.10 -s 4420

# Connect to one subsystem
nvme connect -t tcp \
  -n nqn.2026-01.lab.internal:pool0 \
  -a 10.20.0.10 -s 4420 \
  --hostnqn "$(cat /etc/nvme/hostnqn)"

# Confirm the namespace appeared and inspect paths
nvme list
nvme list-subsys

# Clean disconnect
nvme disconnect -n nqn.2026-01.lab.internal:pool0
```

Port 4420 is the registered default for NVMe over TCP. The host NQN in `/etc/nvme/hostnqn` is generated at install time on most distributions, and it is worth treating as identity. Clone a virtual machine without regenerating it and the target will be confused about who is who.

## Multipath is not optional

Two networks, two target ports, two paths. Native NVMe multipathing handles this inside the NVMe subsystem rather than through a generic device mapper layer, using Asymmetric Namespace Access to describe which paths are optimized. Set it up before you need it, then test it the only way that counts: pull a cable during live I/O and watch whether the application notices.

Failover timers matter more here than people expect. Defaults are chosen to be safe rather than fast, and a controller loss timeout that outlives your application's patience produces an outage that looks like a storage failure but is really a tuning choice.

## Where I think it fits

I would reach for NVMe over TCP when I want block storage across a network and I want the flash to behave like flash. Virtualization hosts pulling from a shared flash pool is the obvious case. Databases with real latency requirements are another, provided the fabric between them is boring and predictable.

I would stay with iSCSI when the workload is not latency sensitive, when the backing store is spinning disk or a modest SSD tier, or when operational familiarity is worth more than the difference. There is no prize for replacing something that is not the bottleneck.

And I would think hard before choosing an RDMA transport unless the entire path is under my control and I am prepared to configure and monitor flow control end to end. The performance ceiling is higher and so is the operational floor.

## Testing it honestly

Whatever you build, measure with a tool that can generate the queue depth and parallelism your real workload has. A single threaded sequential read tells you almost nothing about a protocol whose main advantage is parallelism.

```bash
fio --name=randread --filename=/dev/nvme1n1 --direct=1 \
    --rw=randread --bs=4k --ioengine=libaio \
    --iodepth=32 --numjobs=4 --runtime=60 --time_based \
    --group_reporting
```

Run the same profile against the device locally and then across the fabric. The delta is what the network cost you, and that one number is worth more than any comparison chart.

## References

- [NVM Express specifications](https://nvmexpress.org/specifications/)
- [NVM Express overview](https://en.wikipedia.org/wiki/NVM_Express)
- [RFC 7143: iSCSI protocol](https://datatracker.ietf.org/doc/html/rfc7143)
- [nvme-cli project](https://github.com/linux-nvme/nvme-cli)
- [fio documentation](https://fio.readthedocs.io/en/latest/)
