
## Why not just use a file share

A file share gives you a hierarchy, partial writes, locking, and POSIX semantics. That is a lot of machinery, and it is the reason file shares are hard to scale and unpleasant to use across a network you do not control.

Object storage throws most of it away. An object has a key, some bytes, and metadata. You put the whole thing or you get the whole thing. There is no directory tree, only keys that contain slashes and a listing API that pretends. There is no partial update, no locking, no rename.

Losing those features is the point. Without them a system can spread objects across many machines, replicate them, and serve them over plain HTTP without coordination. If your workload is "write a file once, read it many times, never modify it in place," object storage fits it exactly. Backups, artifacts, media, logs, dataset snapshots, and model weights are all that shape.

## The API is the product

The reason to run something S3 compatible rather than inventing your own is that the S3 API is effectively the interface every tool already speaks. Backup software, container registries, log shippers, database dump tools, CI systems, and every cloud SDK can point at an endpoint and a set of credentials.

That is real leverage. You configure a backup tool to write to your own hardware today, and the same configuration points at a cloud provider tomorrow with a URL change.

```bash
aws --endpoint-url https://s3.lab.example.net s3 mb s3://backups
aws --endpoint-url https://s3.lab.example.net s3 cp ./dump.sql.zst s3://backups/db/
aws --endpoint-url https://s3.lab.example.net s3api put-bucket-versioning \
  --bucket backups --versioning-configuration Status=Enabled
```

Note the moving parts: an endpoint, a bucket, a key, and a credential pair. That is the whole model.

## Durability: replication versus erasure coding

Two ways to survive a failed disk.

Replication stores N full copies. Simple, fast to read, fast to repair, and it costs N times the raw capacity. Three copies means you use three terabytes to store one.

Erasure coding splits an object into K data fragments plus M parity fragments and spreads all of them across devices. Any K of the K+M fragments reconstruct the object, so you survive M failures. The overhead is (K+M)/K, so an 8+4 scheme survives four failures at 1.5x the raw capacity instead of the 5x that five replicas would cost.

Erasure coding is the better deal on space and the worse deal on CPU, small object efficiency, and repair time. Reconstructing an object requires reading fragments from many devices, so rebuilds are IO heavy. Small objects fragment poorly, since fragment count is fixed regardless of size.

The thing to understand clearly: neither is a backup. Both protect against device failure inside one system. Neither protects against a mistaken delete, a bad script, ransomware, or the building. Cross site replication and versioning do that.

## Buckets, policies, and keys

Access is a bucket policy plus an access key and secret. The mistakes are always the same two: one credential pair used everywhere, and a policy that grants more than the client needs.

Give every consumer its own credential, scoped to its own bucket or key prefix, with only the actions it uses. A backup agent needs to put objects and probably list them. It does not need to delete them, and denying delete is a meaningful defense against a compromised host wiping its own backups.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::backups",
        "arn:aws:s3:::backups/host-a/*"
      ]
    }
  ]
}
```

Note that `ListBucket` applies to the bucket resource while object actions apply to the key pattern. Getting that split wrong is the most common reason a policy silently does not work.

## Versioning, object lock, and lifecycle

Versioning keeps old copies when an object is overwritten or deleted, which turns "someone deleted the backups" from an incident into an inconvenience. Object lock goes further and makes objects immutable for a retention period, so even an administrator credential cannot remove them until it expires. For backups exposed to any machine that could be compromised, that is the control worth having.

The obvious catch is that versions and locked objects consume space forever unless you manage them. Lifecycle rules expire noncurrent versions after a set number of days, and they are not optional at any real scale. Set them at the same time you turn versioning on, not later, because later is after the disks fill.

## Where it does not fit

Object storage is a bad database, a bad home directory, and a bad place for anything that needs in place modification, byte range writes, or file locking. Do not put a VM disk image on it and expect it to behave. Do not use it for a working directory where files change constantly, because every change writes a whole new object.

It is also not automatically fast for small objects. Each operation is an HTTP request with its own round trip and authentication, so a workload that writes ten thousand tiny files will be dominated by per request overhead. Batch small things into archives before uploading.

Used for what it is good at, it is one of the most useful services you can run on your own hardware, mostly because of how much software already knows how to talk to it.

## References

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [MinIO documentation](https://min.io/docs/minio/linux/index.html)
- [Object storage](https://en.wikipedia.org/wiki/Object_storage)
- [Erasure code](https://en.wikipedia.org/wiki/Erasure_code)
