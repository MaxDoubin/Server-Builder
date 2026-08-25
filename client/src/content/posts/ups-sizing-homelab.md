
## Why You Need a UPS

A UPS (Uninterruptible Power Supply) sits between your servers and the wall outlet. When power drops, the UPS battery kicks in immediately, keeping your servers running long enough to shut down gracefully. Without one, a power outage means your servers lose power instantly, which can corrupt filesystems, damage databases, and kill drives mid-write.

I learned this the hard way early on. A brief power flicker corrupted a ZFS pool that took hours to repair. After that, I invested in proper UPS protection for every piece of equipment in the rack.

## Calculating Your Needs

Step one is measuring your actual power consumption. I use a Kill-A-Watt meter on each server to measure draw under normal load and under peak load. Here is what my rack pulls:

- 2x Dell R740: ~450W each under typical load
- 1x Mac Pro: ~300W under typical load
- 1x Mikrotik switch: ~30W
- Miscellaneous (patch panel lighting, cooling fan): ~50W
- Total typical load: ~1,280W
- Total peak load: ~1,800W

## VA vs Watts

UPS capacity is rated in VA (Volt-Amps) and Watts. They are not the same thing. VA is apparent power, and Watts is real power. For server loads (which are mostly resistive), the power factor is typically around 0.8 to 0.9. That means a 2000VA UPS delivers about 1600 to 1800 watts of real power.

Always size based on watts, not VA. And always leave headroom. I target 70% utilization, so for my 1,800W peak load, I need a UPS rated for at least 2,600W (or about 3,000VA).

## Runtime

Runtime is how long the UPS can keep your servers running on battery. For a homelab, you probably do not need hours of runtime. You need enough time for your servers to detect the outage and shut down gracefully. Five to ten minutes is usually sufficient.

I have my servers configured to start a clean shutdown when the UPS signals a power loss. The UPS communicates via USB using NUT (Network UPS Tools) on Linux. The shutdown process takes about two minutes, so my UPS needs to provide at least three to four minutes of runtime at full load.

## My Setup

I run an APC Smart-UPS 3000VA rack-mount unit. It provides about 8 minutes of runtime at my typical load, which is plenty for graceful shutdowns. The rack-mount form factor keeps everything neat, and the network management card lets me monitor it remotely.

The total cost was significant, but it has already saved my data at least three times during power outages. That makes it one of the best investments in the entire lab.
