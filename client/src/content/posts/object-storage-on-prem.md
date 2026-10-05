
## Why not just use a file share

A file share gives you a hierarchy, partial writes, locking, and POSIX semantics. That is a lot of machinery, and it is the reason file shares are hard to scale and unpleasant to use across a network you do not control.

Object storage throws most of it away. An object has a key, some bytes, and metadata. You put the whole thing or you get the whole thing. There is no directory tree, only keys that contain slashes and a listing API that pretends. There is no partial update, no locking, no rename.

Losing those features is the point. Without them a system can spread objects across many machines, replicate them, and serve them over plain HTTP without coordination. Because an overwrite writes a complete new object, there is also no partially written file to find after a crash. If your workload is "write a file once, read it many times, never modify it in place," object storage fits it exactly. Backups, artifacts, media, logs, dataset snapshots, and model weights are all that shape.

The pretend directories deserve a warning. `logs/2026/04/app.log` is one string, and there is no `logs/` object behind it, so listing "a folder" is a prefix scan, not a directory read. A prefix holding millions of keys is a long paginated scan, and a design that lists a prefix to find one object is the classic performance mistake. The fix is always the same: keep an index somewhere else, usually a database, and use the object store purely for retrieval by known key.

## The API is the product

The reason to run something S3 compatible rather than inventing your own is that the S3 API is effectively the interface every tool already speaks. Backup software, container registries, log shippers, database dump tools, CI systems, and every cloud SDK can point at an endpoint and a set of credentials.

That is real leverage. You configure a backup tool to write to your own hardware today, and the same configuration points at a cloud provider tomorrow with a URL change.

```bash
aws --endpoint-url https://s3.lab.example.net s3 mb s3://backups
aws --endpoint-url https://s3.lab.example.net s3 cp ./dump.sql.zst s3://backups/db/
aws --endpoint-url https://s3.lab.example.net s3api put-bucket-versioning \
  --bucket backups --versioning-configuration Status=Enabled

# Verify rather than assume: is versioning actually on?
aws --endpoint-url https://s3.lab.example.net s3api get-bucket-versioning --bucket backups

# Read one object's metadata without downloading it
aws --endpoint-url https://s3.lab.example.net s3api head-object \
  --bucket backups --key db/dump.sql.zst
```

Note the moving parts: an endpoint, a bucket, a key, and a credential pair. That is the whole model.

Two more pieces of the API earn their keep early. Multipart upload splits a large object into parts that upload in parallel and are assembled server side, which gets you throughput on a big file and lets you retry one failed part instead of restarting a ten gigabyte upload. Most clients switch to it automatically above a size threshold. Presigned URLs hand a client a time limited, signed link to upload or download one object directly, so your application neither proxies the bytes nor gives out credentials.

```python
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.lab.example.net",
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

url = s3.generate_presigned_url(
    "put_object",
    Params={"Bucket": "uploads", "Key": "reports/q3.pdf",
            "ContentType": "application/pdf"},
    ExpiresIn=900,
)
```

Note `addressing_style: path`. Virtual host style addressing puts the bucket in the hostname, which a self hosted endpoint can only serve with a wildcard DNS entry and a matching wildcard certificate. Path style keeps the bucket in the URL path. That mismatch is a common reason a client that works against a cloud endpoint fails against a local one, and it is the fine print on "a URL change."

## Durability: replication versus erasure coding

Two ways to survive a failed disk.

Replication stores N full copies. Simple, fast to read, fast to repair, and it costs N times the raw capacity. Three copies means you use three terabytes to store one.

Erasure coding splits an object into K data fragments plus M parity fragments and spreads all of them across devices. Any K of the K+M fragments reconstruct the object, so you survive M failures. The overhead is (K+M)/K, so an 8+4 scheme survives four failures at 1.5x the raw capacity instead of the 5x that five replicas would cost.

Erasure coding is the better deal on space and the worse deal on CPU, small object efficiency, and repair time. Reconstructing an object requires reading fragments from many devices, so rebuilds are IO heavy. Small objects fragment poorly, since fragment count is fixed regardless of size: reading back a 4 KB object sharded across twelve devices means twelve tiny IOs. Many systems inline or replicate objects below a size threshold for exactly this reason, which is worth checking if your workload is millions of small objects.

Where the fragments land matters more than the arithmetic. Twelve fragments on twelve drives in one chassis protect you against a drive failing, not against losing the chassis.

The thing to understand clearly: neither is a backup. Both protect against device failure inside one system. Neither protects against a mistaken delete, a bad script, ransomware, a bug in the storage software itself, or the building. Versioning, object lock, and cross site replication do that.

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

Versioning keeps old copies when an object is overwritten or deleted, which turns "someone deleted the backups" from an incident into an inconvenience. Object lock goes further and makes objects immutable for a retention period, so even an administrator credential cannot remove them until it expires (in compliance mode; governance mode lets a user holding a bypass permission remove them). For backups exposed to any machine that could be compromised, that is the control worth having.

The obvious catch is that versions and locked objects consume space forever unless you manage them. Lifecycle rules expire noncurrent versions after a set number of days, and they are not optional at any real scale. Set them at the same time you turn versioning on, not later, because later is after the disks fill. Add a rule that aborts incomplete multipart uploads while you are there: an upload that dies partway leaves its parts behind, taking up space that an ordinary listing never shows (`s3api list-multipart-uploads` does).

## Running it yourself

Solid open source implementations run as a single process for a lab and as a cluster for real deployments. Either way, treat the endpoint as a real service from day one. Give it its own network segment. Terminate TLS with a certificate your clients actually trust, because a self signed certificate has to be trusted separately in every SDK, CLI, and backup agent, and the one you miss is the one that fails. And schedule restore tests: an endpoint that accepts writes and cannot serve them back correctly is a failure you want to find on your schedule rather than during an incident.

## Where it does not fit

Object storage is a bad database, a bad home directory, and a bad place for anything that needs in place modification, byte range writes, or file locking. Do not put a VM disk image on it and expect it to behave. Do not use it for a working directory where files change constantly, because every change writes a whole new object. Databases and VM disks want block storage underneath them.

The same goes for tools that mount a bucket as a filesystem. They are genuinely useful for read heavy access to whole objects and a reliable source of pain for anything that writes in place, because the translation layer has to download, modify, and upload the entire object again, with no locking underneath for concurrent writers. Read through them. Do not build a write path on them.

It is also not automatically fast for small objects. Each operation is an HTTP request with its own round trip and authentication. That is fine for a workload that tolerates tens of milliseconds and wrong for a hot path expecting microseconds, and a workload that writes ten thousand tiny files will be dominated by per request overhead (and, on a metered cloud service, by request charges). Batch small things into archives before uploading.

Used for what it is good at, it is one of the most useful services you can run on your own hardware, mostly because of how much software already knows how to talk to it.

## References

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [Amazon S3 user guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [Boto3 documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
- [MinIO documentation](https://min.io/docs/minio/linux/index.html)
- [MinIO](https://github.com/minio/minio)
- [Ceph object gateway](https://docs.ceph.com/en/latest/radosgw/)
- [Object storage](https://en.wikipedia.org/wiki/Object_storage)
- [Erasure code](https://en.wikipedia.org/wiki/Erasure_code)
