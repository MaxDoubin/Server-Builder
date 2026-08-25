
## Why 10GbE

Gigabit Ethernet was fine for a while. But once you start moving large VM images, running iSCSI or NFS storage, or doing bulk data transfers between servers, 1 Gbps becomes a real bottleneck. I was regularly saturating my gigabit links during backup windows and VM migrations.

10GbE gives you ten times the bandwidth, obviously, but the practical improvement is even bigger than that sounds. Operations that used to take minutes now take seconds. VM live migrations that were unreliable over gigabit become smooth and fast.

## The Hardware

For the network side, I picked up a used Mellanox ConnectX-3 SFP+ card for each server. These are dual-port 10GbE cards that you can find for very little money on the used market. They are well-supported in Linux with the mlx4 driver and work out of the box on most distributions.

For switching, I am using a Mikrotik CRS309-1G-8S+IN. It has eight SFP+ ports and one gigabit copper port for management. It is not a full L3 switch, but for a homelab it handles 10GbE switching at wire speed and costs a fraction of what Cisco or Arista would charge.

I am using DAC (Direct Attach Copper) cables between the switch and servers. DACs are cheaper than optical transceivers for short runs and work perfectly in a single-rack setup.

## Configuration

The nice thing about 10GbE with SFP+ is that it works exactly like gigabit Ethernet at the OS level. Assign an IP, set up your routes, and go. There is no special configuration needed beyond installing the NIC and connecting the cables.

I did set up jumbo frames (MTU 9000) across the 10GbE network to reduce overhead for large transfers. This requires consistent MTU settings on every device in the path, including the switch, or you will get fragmentation issues that are painful to debug.

## What Changed

The biggest quality-of-life improvement is VM storage. I run NFS datastores for some of my virtualization hosts, and going from gigabit to 10GbE made NFS feel local. Boot times dropped, snapshot operations got faster, and I stopped worrying about storage I/O being a bottleneck.

Backup windows also shrank significantly. A full backup that took 45 minutes over gigabit now finishes in about 5 minutes. That means I can take more frequent backups without impacting other workloads.
