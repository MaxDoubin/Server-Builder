
## Three Storage Models, Three Contracts

Block, file, and object storage are not three implementations of the same thing. They offer different contracts, and the contract determines what you can build.

**Block storage** hands you an array of fixed size blocks and no opinion about their contents. A filesystem or a database sits on top and imposes structure. It supports arbitrary in place modification, which is what makes it suitable for anything doing random writes. It attaches to one host at a time in the normal case.

**File storage** gives you a hierarchical namespace with directories, permissions, and byte range operations. Multiple clients can mount it simultaneously and the protocol handles locking and coordination. That coordination is exactly what makes distributed filesystems difficult to scale.

**Object storage** gives you a flat keyspace of immutable blobs, each with metadata, addressed over HTTP. No directories. No partial writes. No locking. You PUT an object, you GET an object, you DELETE an object.

Every apparent limitation in that last list is a deliberate trade, and each one buys scalability. No in place modification means no read modify write coordination. No directory tree means no hierarchy to keep consistent across nodes. No locking means no distributed lock manager. Those removals are what let object storage scale to enormous capacity across many nodes, and they are why it behaves badly when you try to use it like a disk.

## What the Object Contract Buys You

The flat namespace is the first thing people fight. Keys look like paths, and tools display them as folders, but `logs/2026/04/app.log` is one string. There is no `logs/` directory object. Listing is a prefix scan, not a directory read.

This matters operationally. Listing a prefix with millions of keys is a paginated scan and it is slow. Designs that list a prefix to find one object are the most common performance mistake, and the fix is always the same: keep an index elsewhere, usually in a database, and use object storage purely for retrieval by known key.

Immutability of a PUT is the second surprise and the biggest gift. Overwriting a key writes a whole new object. There is no way to modify byte 400 of an existing one. That constraint eliminates the entire category of partial write corruption, and it is why object storage suits backups, media, logs, and data lake files so well. Those workloads write once and read many times.

Metadata travels with the object, both system metadata like content type and size, and arbitrary user metadata. This is genuinely useful, because you stop needing a separate place to record what a blob is.

Versioning, when enabled, keeps prior versions of a key rather than discarding them on overwrite. Combined with an object lock that prevents deletion for a retention period, this is the practical foundation of ransomware resistant backups: a compromised host with valid credentials still cannot destroy the earlier versions.

## Durability Comes From Erasure Coding

Replication is the obvious way to survive drive failure and it is expensive. Three copies means three times the raw capacity for one unit of usable capacity.

Erasure coding splits an object into k data fragments and computes m parity fragments, distributing all k plus m across failure domains. Any k fragments reconstruct the object, so the system survives m simultaneous losses while storing only (k+m)/k times the data. A configuration with eight data and four parity fragments tolerates four losses at 1.5 times overhead, which is dramatically better than the 3 times of triple replication for comparable protection.

The costs are real. Reconstruction reads from multiple nodes, so recovery consumes network bandwidth and time. Small objects handle poorly because fragmenting them produces many tiny pieces, which is why systems often replicate small objects and erasure code large ones. And the failure domain layout matters more than the arithmetic: twelve fragments spread across twelve drives in one chassis protects against drive failure and not against losing the chassis.

## Where It Is the Wrong Tool

Object storage is a poor fit for anything requiring low latency random writes. Databases, virtual machine disks, and active filesystems all want block storage. Every attempt to run those on object storage through a translation layer inherits the worst properties of both.

It is also a poor fit for workloads doing many small operations. Each request carries HTTP overhead and a round trip. Ten thousand small objects cost far more in requests than one archive of the same total size, and this shows up as latency and as request charges on metered services.

The mounting question comes up constantly. Tools that present a bucket as a filesystem exist and are genuinely useful for read heavy access to whole objects. They are a bad idea for anything that writes in place, because the translation layer has to download, modify, and re upload the entire object, and concurrent access has no locking underneath it. Use them for reading. Do not build a write path on them.

## Working With It

The API surface is small enough to learn quickly, and the S3 API has become the common dialect that most implementations speak.

```bash
# Basic object operations against any S3-compatible endpoint.
aws --endpoint-url https://s3.internal.example s3 ls s3://backups/

# Sync a directory, then verify rather than assume.
aws --endpoint-url https://s3.internal.example s3 sync \
    /var/backups/ s3://backups/nightly/ --storage-class STANDARD

# Inspect one object's metadata without downloading it.
aws --endpoint-url https://s3.internal.example s3api head-object \
    --bucket backups --key nightly/2026-04-20.tar.zst

# Confirm versioning is actually on before relying on it.
aws --endpoint-url https://s3.internal.example s3api get-bucket-versioning \
    --bucket backups
```

Large uploads should use multipart, which splits the object into parts uploaded independently and reassembled server side. It gives you parallelism and lets a failed part be retried without restarting the whole transfer. Most clients do this automatically above a size threshold, but incomplete multipart uploads consume space invisibly until they are cleaned up, so set a lifecycle rule to abort abandoned ones.

Lifecycle rules generally are the feature most worth configuring early. Expiring old versions, transitioning cold data, and cleaning up incomplete uploads are all policy the storage system enforces for you, rather than a script someone has to remember to run.

## Running It Yourself

Self hosted implementations exist and are a good way to learn the model properly. The important discipline is to treat the endpoint as a real service: give it its own network segment, terminate TLS properly, use per application credentials with narrowly scoped policies instead of one administrative key everywhere, and enable versioning on anything holding backups.

The credential mistake is the one I would flag hardest. A single key with full access, embedded in every application, is the object storage equivalent of every service sharing a root password. Per application credentials with a policy limited to one bucket and one prefix cost a few minutes to create and contain the damage when one application is compromised.

## References

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [Amazon S3 user guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [MinIO documentation](https://min.io/docs/minio/linux/index.html)
- [Ceph object gateway](https://docs.ceph.com/en/latest/radosgw/)
- [Erasure code](https://en.wikipedia.org/wiki/Erasure_code)
