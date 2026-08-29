
## The problem

You need macOS in a rack. Maybe it is a build machine, maybe it is a transcode node, maybe you just want to know whether Apple hardware can live alongside real servers. The rack-mount Mac Pro is the only first-party answer, and almost everything written about it is either a review of the tower or a price complaint. This is what it is actually like to run one next to PowerEdges.

## Why a Mac Pro in a server rack

Most people do not think of Apple hardware when they think of server rooms. But the 2019 Mac Pro in rack-mount configuration is a legitimate piece of enterprise hardware. It is designed to be mounted in a standard 19-inch rack, it supports ECC memory, and it was built for sustained heavy workloads.

I picked one up because I wanted to see how it holds up in a real lab environment next to my Dell PowerEdge systems. The short answer: it is excellent at certain things and completely wrong for others.

## The hardware

The rack-mount Mac Pro I run has a 28-core Intel Xeon W, 384 GB of ECC DDR4, and dual AMD Radeon Pro Vega II GPUs. Apple designed the internal layout around airflow, with three massive fans pulling air across the entire system. It is quiet for what it is, and thermals stay very manageable even under sustained loads.

The build quality is on another level compared to typical server hardware. Everything about the chassis feels overengineered. The handles, the mounting rails, the internal PCIe card cages. It is clearly built for a different audience than a PowerEdge, but the precision is impressive.

Physically it is a 5U unit in a 19-inch rack. A rack unit is 1.75 inches by the EIA-310 standard, so at 8.58 inches tall this machine occupies five of them. That is two and a half times the height of a 2U server, which is the first thing to plan for. In a 42U cabinet you fit eight of these where you would fit twenty R740s. Airflow is front-to-back, which is the right direction and lines up correctly with hot and cold aisle layout, so at least it plays well with the rest of the rack thermally.

## Where it fits

The Mac Pro handles media-heavy workloads that my Dell servers would struggle with. Video transcoding, Xcode builds, and GPU-accelerated compute tasks all benefit from the hardware. If you are running Final Cut Pro pipelines or Compressor jobs in a production environment, the rack-mount Mac Pro makes a lot of sense.

The real justification, though, is licensing rather than performance. macOS may only legally be virtualised on Apple hardware, and Apple's licence permits at most two additional macOS virtual instances per Mac. If you need to build and sign iOS or macOS software in CI, there is no cloud shortcut around owning Apple hardware, and this is the densest first-party way to own it in a rack. That constraint, not the GPU, is why these machines exist in datacenters.

For general server workloads like virtualization, storage, and networking, Dell wins every time. The PowerEdge line is designed for exactly that, and the price-to-performance ratio is not even close. But the Mac Pro fills a gap that Dell cannot, and having both in the same rack gives me flexibility.

## Making it survive without a keyboard

Everything below is what turns a workstation into something you can leave alone. Run it once, on the console, before you rack the machine.

```bash
sudo systemsetup -setremotelogin on
sudo systemsetup -setwakeonnetworkaccess on
sudo systemsetup -setusingnetworktime on
sudo pmset -a sleep 0 disksleep 0 displaysleep 0 womp 1 autorestart 1
```

`autorestart 1` is the important one. It tells the machine to power itself back on after a power failure, which is the default behaviour you get for free on every server and do not get here. `womp 1` enables wake on LAN. `sleep 0` stops macOS from suspending a machine that looks idle because nobody is typing on it.

Verify:

```bash
pmset -g | grep -E 'sleep|womp|autorestart'
```

Correct output has zeros for the sleep values and ones for the other two:

```
 sleep                0
 disksleep            0
 displaysleep         0
 womp                 1
 autorestart          1
```

Then turn on remote screen access, which is a single documented command rather than a trip through System Settings:

```bash
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
  -activate -configure -access -on -restart -agent -privs -all
```

Confirm both services are actually listening:

```bash
sudo lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(22|5900)'
```

You should see `sshd` bound to port 22 and a screen sharing process bound to port 5900. Those two ports are your entire management surface. There is no third one.

## Watching thermals and fans

There is no BMC to ask, but the SMC exposes the same sensors macOS uses:

```bash
sudo powermetrics --samplers smc -i 1000 -n 1
```

Correct output looks like this:

```
**** SMC sensors ****

CPU Thermal level: 0
IO Thermal level: 0
Fan: 793 rpm
CPU die temperature: 45.12 C
```

A thermal level of 0 means no throttling. If you see a non-zero thermal level under sustained load, check `pmset -g therm`, which reports the scheduler and speed limits macOS is applying. On my machine the fans sit under 1000 rpm at idle and the die stays comfortable under load, which is the whole payoff of the oversized cooling design. Log that command from `launchd` on an interval and you have crude but real trend data.

## The reality

Running macOS Server alongside Linux VMs is not as smooth as you might hope. Apple has been slowly pulling back from the server space for years. The Server app had most of its services stripped out in 2018 and Apple stopped selling it entirely in 2022, so "macOS Server" is now just macOS with file sharing and a caching service.

There is no iDRAC equivalent, no [IPMI](/blog/ipmi-remote-management), and remote management is limited compared to what Dell offers. This is the difference that shapes daily operations. On a PowerEdge, iDRAC has its own network port, its own processor, and its own power domain, so I can watch POST, mount an ISO over the network, read hardware logs, and force a power cycle while the operating system is completely dead. On the Mac Pro, every one of those capabilities requires macOS to be running and on the network. When it is not, someone walks to the rack.

The workaround I use is to rebuild the pieces out of separate boxes. A switched PDU gives me remote power cycling per outlet, which covers the single most common recovery action. A KVM-over-IP appliance on the Mac's HDMI output and a USB port gives me console access at boot. Neither is as good as a BMC and together they cost rack space and money, but they turn "drive to the rack" into "open a browser".

The other thing to internalise is that the power supply is single and not hot-swappable. Every server in the rack next to it has two supplies fed from two different circuits. The Mac Pro has one. If that supply dies, the machine is down until a part arrives.

You are also locked into Apple's hardware ecosystem for upgrades. But for specific use cases, the rack-mount Mac Pro is hard to beat. It is the best way to run macOS workloads in a rack, and if you need that, nothing else really competes.

## What breaks

**FileVault on a headless machine.** This is the one that catches everybody. After an unplanned power loss, a FileVault-encrypted Mac boots to the unlock screen before the network stack comes up, so it is unreachable and `autorestart` has not helped you at all. For a planned reboot, `sudo fdesetup authrestart` stores the key for exactly one restart and gets you back. For a power cut, someone needs hands on it. Decide deliberately whether the rack is physically secure enough to run without FileVault.

**Treating Screen Sharing as out-of-band.** It is in-band. It dies with the OS, with the network stack, and with a kernel panic. Do not build a recovery plan on it.

**Forgetting `autorestart`.** Default behaviour after a power cut is to stay off. The UPS does its job, the power comes back, the PowerEdges boot, and the Mac sits there dark. One `pmset` flag, easy to miss, very annoying to discover remotely.

**Unattended OS updates.** There is no `unattended-upgrades` equivalent that reliably survives a major macOS release. Updates want a reboot, sometimes want a click, and can leave a headless machine sitting at a setup or migration prompt. Schedule macOS patching as attended work.

**Power planning on a 120 V circuit.** The supply is rated at 1.4 kW. A 15 A, 120 V branch circuit carries 1440 VA continuously under the 80 percent rule, so one loaded Mac Pro can effectively own a circuit. Check what else is on that breaker before you rack it.

## References

- https://en.wikipedia.org/wiki/19-inch_rack
- https://en.wikipedia.org/wiki/Rack_unit
- https://en.wikipedia.org/wiki/Mac_Pro
- https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface
- https://en.wikipedia.org/wiki/Virtual_Network_Computing
- https://developer.apple.com/documentation/virtualization
