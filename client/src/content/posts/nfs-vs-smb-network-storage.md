
## The Basic Difference

NFS (Network File System) is a Unix/Linux protocol. SMB (Server Message Block, also called CIFS) is a Windows protocol. Both allow clients to mount remote filesystems as if they were local, but they have different strengths and trade-offs.

The version you are running matters more than the protocol family. NFSv3 is specified in RFC 1813 and is stateless, with locking bolted on as a separate service. NFSv4.0 (RFC 7530) folded locking, mounting, and ACLs into a single stateful protocol on one port. NFSv4.1 (RFC 8881) added sessions and exactly-once semantics, and NFSv4.2 (RFC 7862) added server-side copy and sparse file support. SMB1 is dead and disabled by default in Windows since 1709. SMB 3.1.1, the version in current Windows, added AES-GCM encryption and pre-authentication integrity. If someone says "we use NFS" without a version number, you do not yet know what you are dealing with.

## When to Use NFS

NFS is the right choice for Linux-to-Linux file sharing. It is the standard for NAS shares in Linux environments, VM storage, and shared filesystems in HPC (high-performance computing) clusters.

**Advantages:**
- Very low overhead, efficient for large file I/O
- Native integration with Linux permissions and UID/GID mapping
- Excellent performance for sequential workloads
- NFSv4 adds strong security, locking, and delegation

**Limitations:**
- Not natively supported on Windows (requires additional software)
- User ID mapping can be complex in mixed environments

```bash
# Mount an NFS share on Linux
mount -t nfs 192.168.1.50:/data /mnt/data

# Permanent mount in /etc/fstab
192.168.1.50:/data  /mnt/data  nfs  defaults,_netdev  0  0
```

The `_netdev` flag in that fstab line is not decoration. It tells the init system this mount needs the network, so systemd orders it after `network-online.target` instead of trying to mount during early boot and failing. A machine that boots to an emergency shell after you add an NFS mount is usually missing it.

## Ports, and Why NFSv3 Hates Firewalls

NFSv4 uses exactly one port: TCP 2049. That is the whole conversation, and it makes firewall rules trivial.

NFSv3 is a different story. It needs rpcbind on port 111 to find everything else, and then `mountd`, `statd`, and `lockd` bind to whatever ports the portmapper hands them at startup. Those change across reboots. The symptom is a share that mounts fine today and hangs after the NAS reboots, with the mount succeeding but every file operation blocking. If you are stuck on v3, pin the ports explicitly in `/etc/nfs.conf` so you can write firewall rules that stay true.

SMB is simpler: TCP 445. The legacy NetBIOS ports 137 through 139 are only needed for pre-SMB2 name resolution, and blocking them outright is usually correct.

## The nobody:nobody Problem

This is the single most common NFSv4 support question, and it looks like the filesystem is broken. You mount the share, run `ls -l`, and every file is owned by `nobody:nobody` even though the UIDs match on both machines.

NFSv4 identifies users as `user@domain` strings rather than raw numbers, and the domain comes from the `Domain` setting in `/etc/idmapd.conf`. If the client and server disagree, the mapping fails and the client falls back to the anonymous user. Setting the same `Domain` on both ends fixes it.

Modern Linux sidesteps this for the common case: with `sec=sys`, both the client and server default to `nfs4_disable_idmapping=Y` and pass numeric IDs directly. That is why Linux-to-Linux usually just works and why the problem reappears the moment you introduce Kerberos or a non-Linux server. When it does, the fix is the domain setting, not `chown`.

The other permission surprise is `root_squash`, which is on by default in `exports(5)`. Root on the client is mapped to the anonymous account, conventionally uid 65534, so root cannot read a 0600 file it does not own and files it creates come out owned by nobody. This is correct behavior and you should think hard before setting `no_root_squash`, because that option means root on any client machine is root on your storage.

## Security Is the Real Difference

This is the trade-off the feature comparisons skip, and it should probably drive the decision more than throughput does.

NFS with `sec=sys` uses AUTH_SYS, which means the client simply asserts its own UID and GID in each request, and the server believes it. Anyone with root on any machine that can reach port 2049 can become any user and read any file on the export. There is no authentication in the protocol at all. The `/etc/exports` host list is the only control, and IP addresses are not an authentication mechanism.

That is not a reason to avoid NFS, but it is a reason to be deliberate. Either put NFS on a storage VLAN that only trusted hosts reach, or use `sec=krb5p`, which authenticates with Kerberos and encrypts the payload. `sec=krb5` authenticates only, and `sec=krb5i` adds integrity checking.

SMB has the opposite default posture. Every connection authenticates a user, and SMB 3.1.1 supports AES-128-GCM encryption per share. Recent Windows releases also require SMB signing by default: a NAS or Samba server with signing disabled will stop accepting connections from an updated Windows client, and the error message rarely says why.

## When to Use SMB

SMB is the right choice when Windows clients are involved. It is the native protocol for Windows file sharing and is well-supported on macOS as well. Samba implements SMB on Linux, allowing Linux servers to serve files to Windows clients.

**Advantages:**
- Native on Windows and macOS
- Supports Windows ACLs and Active Directory integration
- Works well across mixed environments

**Limitations:**
- Higher overhead than NFS for Linux-only environments
- Active Directory integration requires additional configuration

The case sensitivity mismatch deserves its own warning. Linux filesystems are case sensitive and Windows clients assume they are not. Samba defaults to `case sensitive = no`, which makes it scan the directory to find a case-insensitive match, so a large directory gets slower on every miss. Worse, if both `Report.txt` and `report.txt` exist in one directory, Windows clients can only ever see one of them.

## Mount Options That Matter

`hard` is the default and it is the right default. A hard mount retries forever when the server is unreachable, so an interrupted NFS server produces a paused application rather than a corrupted file. `soft` returns an I/O error after the timeout instead, and `nfs(5)` warns directly that this risks data corruption on anything but read-only mounts. The `intr` option people still recommend has been a no-op since kernel 2.6.25.

The cost of `hard` is the classic hung-NFS symptom: processes stuck in D state, uninterruptible sleep, load average climbing into double digits with zero CPU usage, and `df` hanging along with them. `umount -l` on the mount point is the escape hatch that does not require a reboot.

The performance option most people miss is `nconnect`. A single NFS mount uses exactly one TCP connection by default, which means a single client cannot exceed what one connection and one server thread can push, no matter how many NICs it has. `nconnect=8` opens multiple connections for the same mount, and `nfs(5)` caps it at 16. On the SMB side, SMB Multichannel does the equivalent automatically.

Leave `rsize` and `wsize` alone unless you have measured something. The Linux client negotiates up to 1 MiB and picks the largest value the server supports, and shrinking them to numbers copied from a 2008 forum post is a common way to make things slower.

One export option to avoid: `async`. It lets the server acknowledge writes before they reach stable storage, which is a real speedup and which `exports(5)` warns will cause data corruption if the server crashes. The default is `sync`, and the default is right.

## Performance Comparison

For pure Linux workloads, NFS consistently outperforms SMB for large sequential reads and writes. For random I/O with many small files, the difference narrows. For mixed environments with Windows clients, SMB is the practical choice regardless of the performance difference.

It helps to know why small files are slow on both, because the instinct is to buy a faster link. A 10 GbE link carries about 1.1 GB/s of payload, and a large sequential read will get close to that. A small-file workload is not bandwidth-bound, it is round-trip-bound. Every file costs several operations: LOOKUP, OPEN, READ, CLOSE. At a modest 0.2 ms of round-trip latency per operation, one thread tops out near 5,000 operations per second, which is a few hundred files per second no matter what the link speed is.

The consequence: to go faster with small files you add concurrency, not bandwidth. More threads, `nconnect`, or restructuring the workload to move a tar archive instead of 100,000 individual files. Upgrading from 1 GbE to 10 GbE will do almost nothing for that workload.

Server restarts have a latency of their own. The Linux NFS server's default v4 lease time is 90 seconds, and after a reboot it observes a grace period of the same length during which clients reclaim their locks and no new locks are granted. So a NAS that reboots in 40 seconds still gives clients well over a minute of stalled I/O.

## What Neither Protocol Does Well

Neither NFS nor SMB is a cluster filesystem. Two hosts writing to the same file at the same time is coordinated only as well as the applications coordinate themselves, and byte-range locking over the network is advisory in practice. If you need genuine concurrent shared-block access, that is CephFS, GFS2, or OCFS2 territory.

Databases over network filesystems are possible and are a support minefield. The problem is that correctness depends on the write actually being durable when `fsync()` returns, and that guarantee crosses the server's export options, the client's mount options, and the storage's own cache. Vendors publish exact supported configurations for a reason. If you are not going to follow one, use block storage.

And neither protocol likes the WAN. Both are chatty and latency-sensitive. At 60 ms of round-trip latency, an operation that takes seconds on a LAN takes minutes. Object storage or a sync tool is the right tool across a WAN, not a mounted share.

## My Setup

I use NFS for VM storage and Linux data shares in my lab. Windows VMs that need shared storage use SMB served from TrueNAS, which supports both protocols from the same storage pool.

Serving the same dataset over both protocols at once is the one thing I would tell people to be careful with. The permission models do not map cleanly onto each other, and a directory whose ownership is being rewritten by both a POSIX client and a Windows ACL client will eventually confuse one of them. I keep the datasets separate by protocol and accept the small duplication.

## References

- https://www.rfc-editor.org/rfc/rfc8881
- https://www.rfc-editor.org/rfc/rfc1813
- https://man7.org/linux/man-pages/man5/nfs.5.html
- https://man7.org/linux/man-pages/man5/exports.5.html
- https://learn.microsoft.com/en-us/windows-server/storage/file-server/file-server-smb-overview
- https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html
