
## What a SAN is

Your hypervisors each have local disks, and the moment you want to live-migrate a VM between them you discover the problem: the disk image lives on one host. Shared storage is the answer, and the words that come back at you are SAN, NAS, iSCSI, LUN, and fabric, mostly without definitions.

A Storage Area Network is a dedicated high-speed network that connects servers to storage arrays. Unlike a NAS (Network Attached Storage) that presents files over a network, a SAN presents raw block devices. The server sees the storage as if it were a locally attached disk.

This distinction matters. Block-level access is faster and more flexible than file-level access for most database and virtualization workloads.

## Block versus file, concretely

With a NAS, the storage device owns the filesystem. Your server sends "read this file" over NFS or SMB, and the NAS handles allocation, locking, and metadata. Multiple clients can safely use the same share at once because the server is arbitrating.

With a SAN, the storage array hands out a LUN, which is nothing more than a range of numbered blocks. Your server owns the filesystem, formats those blocks, and caches metadata locally. That is where the performance comes from, and also where the danger comes from: if two servers mount the same LUN with an ordinary filesystem like ext4 or NTFS, each believes it is the sole owner, each caches metadata the other is changing, and the filesystem is destroyed. Not degraded, destroyed, usually within minutes.

Sharing a LUN between hosts requires a clustered filesystem built for it, such as VMFS, GFS2, or OCFS2, or a layer above that coordinates access, which is what a hypervisor cluster provides. Anything else needs exactly one owner at a time.

## Fibre Channel vs iSCSI

Traditional SANs use Fibre Channel (FC), a dedicated network technology optimized for storage. FC requires specialized switches (FC switches or directors) and HBAs (Host Bus Adapters) in the servers. It is expensive but extremely reliable and performant.

iSCSI runs the SCSI storage protocol over standard Ethernet. It is less expensive because it reuses existing network infrastructure, and performance has improved dramatically as 10GbE and 25GbE become standard. Many organizations have moved from FC to iSCSI for new deployments.

The architectural difference underneath is loss. Fibre Channel is a lossless fabric: a port only transmits when the receiver has advertised buffer space for the frame, so congestion causes back pressure rather than drops. SCSI was designed for a cable inside a chassis and does not expect to lose commands, which is why this matters.

iSCSI gets the same guarantee from TCP, which retransmits what the network drops. That works, but a retransmit is far slower than back pressure, so an iSCSI network that drops packets produces latency spikes that look to the application like a failing disk. This is the real reason iSCSI wants its own network rather than sharing with general traffic.

Each FC port has a 64-bit World Wide Name, and the fabric restricts which ports can talk to each other through zoning, configured on the FC switch. Zoning is the FC equivalent of a firewall rule, and it is not optional.

## Targets, initiators, and IQNs

In iSCSI terminology:
- **Target:** The storage device (SAN array)
- **Initiator:** The server connecting to the storage

The initiator connects to targets using iSCSI Qualified Names (IQNs). Once connected and authenticated, the OS sees the target LUNs as local disks.

An IQN follows a fixed shape defined in RFC 3721: `iqn.` then a year and month in `yyyy-mm` form, then the naming authority's domain in reverse, then a colon and any string you like. So `iqn.2024-01.com.storage:array1` reads as: an IQN, from an entity that owned storage.com in January 2024, identifying array1. The date is there so a name stays unique even after a domain changes hands.

iSCSI listens on TCP port 3260 by default. Discovery is a separate step from login: you ask a portal what targets it offers, then log in to the ones you want.

## A worked example on Linux

Set your initiator name first, because the array's access control is keyed to it:

```bash
cat /etc/iscsi/initiatorname.iscsi
# InitiatorName=iqn.2026-08.internal.lab:hv01
sudo systemctl enable --now iscsid
```

Then discover and connect:

```bash
# Discover iSCSI targets
iscsiadm -m discovery -t sendtargets -p 192.168.10.50

# Connect to a target
iscsiadm -m node -T iqn.2024-01.com.storage:array1 -p 192.168.10.50 --login
```

Discovery prints the portal and every target it is willing to tell you about:

```
192.168.10.50:3260,1 iqn.2024-01.com.storage:array1
```

A successful login says so explicitly:

```
Logging in to [iface: default, target: iqn.2024-01.com.storage:array1, portal: 192.168.10.50,3260]
Login to [iface: default, target: iqn.2024-01.com.storage:array1, portal: 192.168.10.50,3260] successful.
```

Now confirm the block device actually appeared, which is the step people skip:

```bash
lsblk --scsi
iscsiadm -m session -P 3 | grep -E "Target|Attached scsi disk|State"
```

Healthy output shows the session `LOGGED_IN` and names the device:

```
Target: iqn.2024-01.com.storage:array1
	iSCSI Session State: LOGGED_IN
	Attached scsi disk sdb		State: running
```

A session that is logged in but has no attached disk means the login succeeded and no LUN was presented to you, which is a masking problem on the array, not a network problem.

## LUN masking and access control

The array decides which initiators may see which LUNs. That is LUN masking, and it is the control that keeps a test server from mounting the production database volume. On a fresh array with masking not yet configured, every host that can reach the portal may see every LUN, and the first host to format one wins.

iSCSI also supports CHAP authentication, in one-way form (target authenticates initiator) or mutual form. Use it. It is weak on its own, since CHAP is a challenge-response over a link that is otherwise cleartext, but combined with a segmented storage network it stops the accident of a wrongly configured host connecting to the wrong array. For real confidentiality on an untrusted path, iSCSI is meant to be carried over IPsec, as described in RFC 3723.

## Network design for iSCSI

Give iSCSI its own VLAN with no default gateway, so storage traffic cannot be routed anywhere and nothing else can reach it. Do not run it across a routed path if you can avoid it.

Jumbo frames help, and the usual MTU is 9000. The catch is that every device on the path must agree, including both hosts, every switch, and the array. One device at 1500 in the middle produces a link that passes pings and stalls on the first large transfer, which is a genuinely miserable thing to debug. Test with a large do-not-fragment ping before trusting it:

```bash
ping -M do -s 8972 192.168.10.50
```

The 8972 is 9000 minus 20 bytes of IP header and 8 bytes of ICMP header. If that succeeds and a 1500-byte ping also succeeds, the path is consistent.

For multipathing, put each path on its own subnet and its own physical NIC. Two paths on the same subnet gives you two ways to reach the same place through one failure domain, which is not redundancy.

## Multipathing

Enterprise storage connects servers via multiple independent paths to eliminate single points of failure. The OS uses multipath software (MPIO on Windows, multipathd on Linux) to manage these paths transparently. If one path fails, I/O continues over the surviving paths.

Without it, two paths to one LUN appear to Linux as two separate block devices, `sdb` and `sdc`, both pointing at the same blocks. Multipath recognises them by their shared WWID and presents a single device under `/dev/mapper/`. Always build filesystems and LVM on the mapper device, never on the underlying `sd` device, or you have gone around the very layer that provides the failover.

```bash
sudo multipath -ll
```

```
mpatha (3600a098038303853572b4b7a4d4f4c31) dm-2 LIO-ORG,storage
size=500G features='0' hwhandler='1 alua' wp=rw
|-+- policy='service-time 0' prio=50 status=active
| `- 7:0:0:0 sdb 8:16 active ready running
`-+- policy='service-time 0' prio=10 status=enabled
  `- 8:0:0:0 sdc 8:32 active ready running
```

Two path groups, both `active ready running`, is the picture you want. A path showing `failed faulty` while the device still works means you are running without redundancy and nothing has alerted you, which is exactly the state a monthly check exists to catch. Test failover deliberately: pull one cable, confirm I/O continues, plug it back in, confirm the path returns to `active ready running`.

## When SANs make sense

SANs make sense when you need shared storage for clustered workloads, high-performance block storage, or centralized storage management at scale. For simpler environments, NFS or direct-attached NVMe may be more appropriate.

Be honest about the failure domain you are creating. A SAN concentrates every server's storage into one system, so the array and the storage network become the thing that takes down everything at once. That trade is worth making when it buys you live migration and clustering, and it is a bad trade when you added it because it seemed like what a real datacenter does.

## What breaks

**Two hosts, one LUN, an ordinary filesystem.** The fastest way to lose data on a SAN. Both hosts cache metadata, neither knows about the other, and the filesystem is corrupt before anyone notices. Use LUN masking to make it impossible, and a clustered filesystem when genuine sharing is required.

**MTU mismatch on the storage path.** Small packets work, large ones vanish, and the symptom is a session that connects and then hangs under load. Verify with `ping -M do -s 8972` on every path before you put a workload on it.

**Filesystems built on the raw `sd` device instead of the mapper device.** Everything works until the path you happened to use fails, and then the mount dies even though multipath is healthy on the other path. Check with `lsblk` that your filesystem sits on `/dev/mapper/mpathX`.

**Both paths through one switch.** Two NICs, two cables, one switch, and the redundancy evaporates when that switch reboots for a firmware update. Independent paths means independent switches, and ideally independent subnets so the host cannot silently route around the failure.

**Nobody watching path state.** Multipath is designed to hide failures, and it is very good at it. A degraded path stays degraded for months because the system kept working. Alert on `multipath -ll` output showing anything other than all paths active, and test failover on a schedule rather than during an outage.

## References

- https://www.rfc-editor.org/rfc/rfc7143
- https://www.rfc-editor.org/rfc/rfc3721
- https://www.rfc-editor.org/rfc/rfc3723
- https://en.wikipedia.org/wiki/Storage_area_network
- https://en.wikipedia.org/wiki/Fibre_Channel
- https://wiki.archlinux.org/title/ISCSI
