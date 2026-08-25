
## A wide, hungry coprocessor

If you are comfortable with servers but accelerators feel like a different planet, the mental model is simpler than the marketing suggests. A GPU is a coprocessor with its own memory, its own scheduler, and thousands of small execution units that are good at doing the same arithmetic to a lot of data at once. It cannot do anything on its own. The CPU stages data, hands off work, and collects results.

Everything that goes wrong in practice comes from four places: memory, the bus, power and cooling, and drivers. Not from the math.

## Memory is the spec that matters

Two numbers describe accelerator memory: capacity and bandwidth.

Capacity is a hard wall. Either your working set fits or the job fails to allocate. There is no swapping to system RAM that keeps performance intact, and the "unified memory" designs that share one pool with the CPU trade the wall for a bandwidth question instead.

Bandwidth is what actually sets throughput for most inference work. A device with plenty of capacity but modest bandwidth will feel sluggish on anything that has to stream large tensors, and no amount of compute headroom fixes that. When I compare two options I look at bandwidth before I look at claimed peak arithmetic throughput, because peak numbers assume a workload that keeps every unit fed and almost nothing does.

## The bus, and when it matters

The accelerator talks to the host over PCIe. What matters is the negotiated link width and generation, not what the slot is physically shaped like. A card in a slot that is mechanically x16 but electrically x4 will work and will quietly be slow at anything transfer heavy.

Check what you actually got:

```bash
# what the device is capable of vs what it negotiated
sudo lspci -vv -s 01:00.0 | grep -E 'LnkCap|LnkSta'

# quick view of every device and its link
sudo lspci -PP -vv 2>/dev/null | grep -E '^[0-9a-f]|LnkSta:' | head -40
```

`LnkCap` is the capability, `LnkSta` is reality. If they disagree, look at slot wiring, bifurcation settings in firmware, riser cables, or a link that dropped to a lower generation because of signal integrity.

The bus matters a lot for training and for multi device work where tensors move between cards. It matters much less for single card inference, where you load the weights once and then mostly leave them there. Do not spend money solving a bus problem you do not have.

## Power and cooling are the real constraints at home

Accelerators are dense loads. Three things bite people:

Connector and supply headroom. High draw cards want dedicated supply rails and the right connectors, not adapters chained off one cable. Transient spikes above the steady state rating are normal, and a supply sized exactly to the average will trip.

Airflow direction. Server chassis are designed around front to back airflow with high static pressure. Consumer cards that dump heat sideways into the case behave badly inside that design, and passively cooled server cards do nothing at all without the chassis fans they expect.

Thermal throttling looks like a software problem. If throughput degrades after a few minutes of load, check clocks and temperature before you rewrite anything.

```bash
# steady state view while a job runs
nvidia-smi --query-gpu=timestamp,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.sm \
  --format=csv -l 5
```

## Drivers and containers, where the boring failures live

The stack is kernel driver, user space runtime libraries, and framework. All three have to agree. Most "it worked yesterday" incidents are a kernel update that rebuilt without the out of tree driver module, or a framework built against a runtime version that is not installed.

Two habits save me time. Pin the driver and hold it across unattended upgrades, so kernel updates never surprise the module. And run the workload in a container with the vendor container runtime so the framework and runtime libraries travel together while the kernel driver stays on the host.

```bash
# smoke test that the container runtime can see the device
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

If that prints the device table, your plumbing is correct and any remaining failure is in your code. If it does not, stop debugging Python.

## What I check before recommending a card

In order: does the working set fit in device memory, what is the memory bandwidth, will the slot give it a full electrical link, can the chassis actually cool it in its intended airflow direction, does the supply have real headroom for transients, and is the driver supported on the distribution I am running. Compute throughput is last on that list, which sounds wrong and is not. The arithmetic is rarely the bottleneck. Feeding it is.

## References

- [PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [NVIDIA System Management Interface](https://developer.nvidia.com/nvidia-system-management-interface)
- [NVIDIA Container Toolkit documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
