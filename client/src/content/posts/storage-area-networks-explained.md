
## What a SAN Is

A Storage Area Network is a dedicated high-speed network that connects servers to storage arrays. Unlike a NAS (Network Attached Storage) that presents files over a network, a SAN presents raw block devices. The server sees the storage as if it were a locally attached disk.

This distinction matters. Block-level access is faster and more flexible than file-level access for most database and virtualization workloads.

## Fibre Channel vs iSCSI

Traditional SANs use Fibre Channel (FC), a dedicated network technology optimized for storage. FC requires specialized switches (FC switches or directors) and HBAs (Host Bus Adapters) in the servers. It is expensive but extremely reliable and performant.

iSCSI runs the SCSI storage protocol over standard Ethernet. It is less expensive because it reuses existing network infrastructure, and performance has improved dramatically as 10GbE and 25GbE become standard. Many organizations have moved from FC to iSCSI for new deployments.

## How Targets and Initiators Work

In iSCSI terminology:
- **Target:** The storage device (SAN array)
- **Initiator:** The server connecting to the storage

The initiator connects to targets using iSCSI Qualified Names (IQNs). Once connected and authenticated, the OS sees the target LUNs as local disks.

```bash
# Discover iSCSI targets
iscsiadm -m discovery -t sendtargets -p 192.168.10.50

# Connect to a target
iscsiadm -m node -T iqn.2024-01.com.storage:array1 -p 192.168.10.50 --login
```

## Multipathing

Enterprise storage connects servers via multiple independent paths to eliminate single points of failure. The OS uses multipath software (MPIO on Windows, multipathd on Linux) to manage these paths transparently. If one path fails, I/O continues over the surviving paths.

## When SANs Make Sense

SANs make sense when you need shared storage for clustered workloads, high-performance block storage, or centralized storage management at scale. For simpler environments, NFS or direct-attached NVMe may be more appropriate.
