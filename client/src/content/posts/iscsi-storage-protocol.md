
## iSCSI Basics

iSCSI encapsulates SCSI commands in TCP/IP packets, allowing servers to access block storage devices over a standard network. From the operating system's perspective, an iSCSI volume looks and behaves like a locally attached disk. You can format it with any filesystem, use it for VMs, or run a database directly on it.

The protocol is specified in RFC 7143, which consolidated the original RFC 3720 and its several updates into one document. It listens on TCP port 3260 by default. The word "block" in "block storage" is the whole story: iSCSI moves numbered 512-byte or 4096-byte blocks and nothing else. It has no concept of a file, a directory, or a user. Everything above the block layer, including the filesystem and its cache, lives on the initiator.

## IQNs and Discovery

Every initiator and target has a name. The usual form is an iSCSI Qualified Name, defined in RFC 3721:

```
iqn.2024-01.com.truenas:data
```

Read it as four parts: the literal `iqn.`, a year and month during which the naming authority owned the domain, the domain name reversed, and a colon plus whatever string the owner likes. The date is not the date you created the LUN, it is there so that a domain changing hands does not create name collisions. Nothing enforces any of it, but two devices with the same IQN on one target will confuse the target's session tracking, which is a genuinely miserable thing to debug. Your initiator's name lives in `/etc/iscsi/initiatorname.iscsi`, and cloning a VM template without changing it is the usual way to end up with duplicates.

Discovery is a separate step from login. `-t st` is short for SendTargets, in which the initiator asks a portal "what targets do you have?" and gets a list back. The results are cached under `/etc/iscsi/nodes`, which matters because a target you removed from the server keeps being retried by the initiator until you delete the node record with `iscsiadm -m node -o delete`.

## Setting Up a Target (TrueNAS)

TrueNAS is a popular option for an iSCSI target in a homelab:

1. Create a storage pool and a block zvol
2. Enable the iSCSI service
3. Create a portal (IP/port combination to listen on)
4. Create an initiator group (which IQNs or IP ranges can connect)
5. Create a target and associate it with the portal
6. Create an extent linked to your zvol
7. Associate the extent with the target

Set the extent's logical block size deliberately. A zvol created with a 16K volblocksize serving a LUN advertised as 512-byte blocks means every small write from the guest turns into a read-modify-write of a 16K record. For general VM storage, a 16K volblocksize with a 4096-byte logical block size on the extent is a reasonable starting point, and matching the guest filesystem's block size to it is better than guessing.

If the zvol is thin provisioned, watch the pool. When a ZFS pool fills, writes fail, and the initiator experiences that as SCSI errors on a disk it believes is perfectly healthy. ZFS also slows down noticeably as it approaches full, so treat roughly 80 percent pool capacity as the point where you act rather than the point where you start worrying.

## Connecting from Linux

```bash
# Install the initiator
apt install open-iscsi

# Discover targets on the storage server
iscsiadm -m discovery -t st -p 192.168.10.50:3260

# Log into a target
iscsiadm -m node -T iqn.2024-01.com.truenas:data -p 192.168.10.50:3260 --login

# The disk should now appear
lsblk
```

Two configuration items in `/etc/iscsi/iscsid.conf` decide how this behaves after a reboot. `node.startup = automatic` logs the session back in at boot. And any filesystem on an iSCSI LUN needs `_netdev` in its `/etc/fstab` options, or systemd will try to mount it before the network exists and drop the machine into emergency mode. That single missing option is the most common way a working iSCSI setup becomes an unbootable server.

## The Timeout That Decides Everything

The default `node.session.timeo.replacement_timeout` is 120 seconds. When the path to the target drops, the initiator queues I/O silently for two minutes before it returns errors upward. Path failure itself is detected faster: `node.conn[0].timeo.noop_out_interval` and `noop_out_timeout` both default to 5 seconds, so a dead connection is noticed in about ten.

Which value you want depends entirely on whether you have multipath.

With multipath, set it low, commonly 5 seconds. The point is to fail the path quickly so device-mapper can route I/O down the surviving path. Leaving it at 120 means a two minute stall on every path failure, which defeats the purpose of having two paths.

Without multipath, leave it high. A single path with a 5 second timeout turns a brief switch reboot into I/O errors, and I/O errors on a mounted filesystem are not gentle: ext4 defaults to `errors=remount-ro` and XFS shuts the filesystem down entirely. The VM does not pause, it goes read-only mid-write.

## Performance Considerations

iSCSI performance depends heavily on network quality. Use a dedicated storage network, enable jumbo frames (MTU 9000) consistently across the path, and consider multipath for both performance and redundancy.

```bash
# Install multipath tools
apt install multipath-tools
systemctl enable multipathd
```

"Consistently across the path" is doing a lot of work in that sentence. Every switch port, every VLAN interface, and both hosts have to agree on 9000, and one device left at 1500 produces a link that passes pings and small I/O perfectly and stalls on large transfers. Verify with an unfragmentable ping sized for the payload:

```bash
ping -M do -s 8972 192.168.10.50
```

8972 is 9000 minus the 20 byte IP header and the 8 byte ICMP header. If that fails and `ping -s 1472` succeeds, you have a jumbo frame gap somewhere in the middle.

Know what the ceiling is before you tune. A 1 GbE link tops out around 110 to 118 MB/s of payload, and no amount of jumbo frames or queue depth changes that; if you want more, the answer is 10 GbE or bonding with multipath, not tuning. On 10 GbE you can expect roughly 1.1 GB/s. Latency is the part people forget: an iSCSI round trip over a healthy 10 GbE LAN adds something in the region of a tenth of a millisecond to a few tenths, against a local NVMe drive well under that. For streaming throughput the difference is invisible. For a database doing small synchronous writes it is the entire performance story.

Note also that LACP does not help a single iSCSI session, because one TCP connection hashes to one physical link. Linux open-iscsi does not implement multiple connections per session, so the way to use two links is two sessions and device-mapper multipath on top, not a bigger bond.

For multipath, two settings matter. Blacklist your local disks so `multipathd` does not claim the boot device, and choose `no_path_retry` on purpose: a number retries that many times then fails I/O, while `queue` blocks forever, which protects data during a long outage and can also wedge every process touching the filesystem, including the ones you need to fix it.

## CHAP Authentication

CHAP (Challenge Handshake Authentication Protocol) adds authentication to iSCSI connections. Configure CHAP credentials on both the target and the initiator. Always use CHAP in any shared environment.

Be precise about what it protects. CHAP, from RFC 1994, is a challenge and response over a shared secret, so the secret is not sent in the clear. Everything else in the session is: the SCSI commands and every block of your data cross the wire unencrypted and unauthenticated. RFC 3723 specifies IPsec as the mechanism for confidentiality and integrity for block storage over IP, and if the traffic leaves a trusted segment that is what you need, not CHAP.

Two practical notes. One-way CHAP authenticates the initiator to the target; mutual CHAP additionally authenticates the target to the initiator, which is the half that stops a rogue target from impersonating your storage. And the secret has a length requirement: the specification calls for at least 96 bits when IPsec is not in use, which is why the Microsoft initiator refuses anything shorter than 12 characters. Discovery authentication and session authentication are configured separately in `iscsid.conf`, under `discovery.sendtargets.auth.*` and `node.session.auth.*`, so setting one and not the other produces a login that succeeds and a discovery that fails, or the reverse.

## What iSCSI Cannot Do

**It cannot be shared between two hosts with an ordinary filesystem.** This is the mistake that destroys data. Mount the same LUN read-write on two machines running ext4, XFS, or NTFS and both will cache metadata independently, both will write to the same blocks, and the filesystem is corrupt within seconds. There is no lock, no warning, and no recovery. Sharing a LUN requires a cluster-aware filesystem such as GFS2, OCFS2, or VMFS, or a layer above that arbitrates ownership.

**It cannot give you per-user permissions or file locking.** Access control is per-LUN, granted to an initiator. If what you want is a shared home directory or a departmental file share, NFS or SMB are the right protocols and iSCSI is not.

**It cannot hide the network.** iSCSI runs over TCP, so a lossy or congested link produces retransmissions, and retransmissions on a storage path look like a slow disk to everything above. Sharing the storage VLAN with user traffic is a reliable way to make your storage mysteriously slow at 4pm.

When the SCSI translation overhead itself is the bottleneck, NVMe over Fabrics, particularly NVMe/TCP, is the modern answer for flash-backed storage. It runs on the same Ethernet and skips a protocol layer designed around spinning disks.

## Practical Uses in a Lab

I use iSCSI to provide shared storage for my Proxmox cluster. All nodes can access the same iSCSI volumes from TrueNAS, which enables live VM migration and HA failover. The setup takes about an hour to configure properly, and once it is running it is very reliable.

The way that works is worth spelling out, because it is the answer to the sharing problem above. Proxmox does not put a normal filesystem on the shared LUN. It puts LVM on it and uses the cluster's own locking to make sure only one node has a given logical volume active at a time, so each VM disk has exactly one writer. That gets you live migration, and it costs you snapshots: LVM on a shared LUN in Proxmox is thick provisioned and does not support VM snapshots. If snapshots matter more than shared block storage, NFS from the same TrueNAS box with qcow2 images is the trade to consider instead.

## References

- https://www.rfc-editor.org/rfc/rfc7143
- https://www.rfc-editor.org/rfc/rfc3721
- https://www.rfc-editor.org/rfc/rfc3723
- https://www.rfc-editor.org/rfc/rfc1994
- https://man.archlinux.org/man/iscsiadm.8
- https://man.archlinux.org/man/multipath.conf.5
