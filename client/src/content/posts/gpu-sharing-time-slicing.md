
## One card, several tenants

An accelerator sitting idle between jobs is expensive. So the obvious move is
to let more than one workload use it. The word people use for that is
"sharing," and it hides at least three mechanisms with completely different
isolation properties.

The way I keep them straight: ask what happens to memory. Compute can be
interleaved in time. Memory cannot. That single asymmetry explains most of the
behavior you will see.

## Time slicing

The simplest form. The scheduler runs one context, switches, runs the next,
switches back. Each process believes it has the card.

Time slicing is a compute-sharing mechanism only. Every context keeps its own
allocations resident the entire time, because there is no swapping of device
memory out to make room. Four processes each holding a quarter of the card's
memory works. Four processes each wanting three quarters does not, and the
failure is an allocation error, not a slowdown.

The other property to internalize is that context switching is not free and
not instantaneous. A workload gets the whole device for its slice, so a long
kernel from one tenant delays everyone. Latency becomes bursty and unpredictable
in a way that averages hide. Two batch training jobs sharing a card by time
slicing is reasonable. An interactive endpoint sharing with a batch job is
usually not, because the interactive one inherits the batch job's tail.

There is also no memory protection between time-sliced contexts beyond what
the driver enforces. It is a fairness mechanism, not a security boundary.

## Multi-process service

The second mechanism lets kernels from several processes run concurrently
rather than taking turns. Instead of interleaving contexts in time, the work
from multiple clients is funnelled through a single server context and can
occupy the device simultaneously.

This is the right tool when each individual workload is too small to fill the
card. Many inference processes each launching narrow kernels will leave most
of the compute units idle under time slicing, because only one context runs at
a time and that context cannot fill the machine. Running them concurrently
fills the gaps.

The cost is isolation. Sharing one context means a fault in one client can
affect others, and there is no hard partition of resources unless you
configure per-client limits. Memory is still not overcommitted: everybody's
allocations coexist and the total is bounded by the physical capacity.

```bash
# start the control daemon, then launch clients normally
export CUDA_VISIBLE_DEVICES=0
nvidia-cuda-mps-control -d

# optional: cap one client to a fraction of the compute units
export CUDA_MPS_ACTIVE_THREAD_PERCENTAGE=25
python serve_small_model.py

# tear it down
echo quit | nvidia-cuda-mps-control
```

## Hardware partitioning

The third mechanism splits the physical device into smaller independent
instances, each with its own slice of memory, its own compute units, and its
own path to memory bandwidth and cache. Multi-Instance GPU is the well-known
implementation of this idea.

This is the only one of the three that gives you real isolation. A partition
has a fixed memory capacity, and a noisy tenant in one partition cannot take
bandwidth from another because they are not sharing the same hardware paths.
Predictable latency comes from the partitioning, not from a scheduler policy.

The tradeoffs are equally real. Partitions come in fixed, supported
geometries, not in arbitrary sizes. Reconfiguring the layout usually requires
draining every workload on the device. And a partition is a smaller device in
every respect, so a model that needed the full card's memory now does not fit
anywhere. You have traded flexibility for predictability.

## Choosing between them

The question I ask, in order:

Does the workload need the whole card's memory? Then it does not share, full
stop. Nothing here overcommits memory.

Do tenants need to be isolated from each other for latency or for trust
reasons? Then hardware partitioning, if the device supports it, and separate
devices if it does not.

Are the workloads individually too small to fill the device, and mutually
trusted? Then concurrent execution through a multi-process service, which is
the case where sharing actually increases total throughput rather than just
dividing it.

Are they batch jobs that only need to eventually finish? Time slicing is fine
and it is the least work to set up.

Full device passthrough to a virtual machine sits outside this list. It gives
one tenant the entire device with the strongest isolation available, and by
definition it is not sharing.

## Making it visible to a scheduler

If an orchestrator hands out devices, it needs to be told a device is
shareable. Kubernetes exposes accelerators through device plugins, and the
plugin advertises capacity. A time-slicing configuration typically looks like
advertising more units than physically exist:

```yaml
version: v1
sharing:
  timeSlicing:
    resources:
      - name: nvidia.com/gpu
        replicas: 4
```

Understand exactly what that says. It advertises four schedulable units on one
physical device. It does not create four gigabytes-worth of anything. Four
pods land on the card, all four allocate memory from the same pool, and the
fourth one fails if the first three were greedy. The scheduler is counting
tokens, not enforcing capacity.

That is the recurring theme of accelerator sharing. The scheduling layer is
happy to overcommit compute and will let you believe it can overcommit memory
too. Set per-workload memory expectations yourself, and size the number of
tenants from memory first, then check whether the compute split makes sense.

## References

- https://docs.nvidia.com/datacenter/tesla/mig-user-guide/
- https://docs.nvidia.com/deploy/mps/
- https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/
- https://en.wikipedia.org/wiki/Time-sharing
- https://en.wikipedia.org/wiki/Context_switch
