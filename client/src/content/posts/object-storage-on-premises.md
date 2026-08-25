
## Objects are not files

The most useful thing to understand about object storage is what it removed.
There is no directory tree, no rename, no partial write, no file handle, no
seek. An object is a blob of bytes, an immutable key, and some metadata. You
PUT the whole thing or you GET the whole thing.

The slashes in `logs/2026/08/app.log` are just characters in the key. There is
no directory. Listing "a folder" is a prefix scan, which is why listing a bucket
with millions of keys under one prefix is slow and why key design matters more
than people expect.

That constraint is the entire point. Dropping the filesystem semantics is what
lets the system scale horizontally, replicate freely, and serve over plain HTTP
without a stateful protocol. You give up rename and random writes; you get
something you can grow by adding nodes.

## The API is the actual product

S3 compatibility means implementing an HTTP API that a very large amount of
existing software already speaks. That is worth more than any individual
feature, because it means your backup tool, your CI cache, your database's
archive target, and your log shipper all work without modification.

The parts of that API worth knowing:

**Multipart upload.** Large objects are uploaded in parts, in parallel, and
assembled server side. This is how you get throughput on a big file and how you
resume after a failed part instead of restarting a ten gigabyte upload.

**Presigned URLs.** A time limited signed URL lets a client upload or download
directly without your application proxying the bytes or holding credentials.
This one feature removes an enormous amount of plumbing.

```python
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="https://objects.lab.internal:9000",
    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

url = s3.generate_presigned_url(
    "put_object",
    Params={"Bucket": "uploads", "Key": "reports/q3.pdf",
            "ContentType": "application/pdf"},
    ExpiresIn=900,
)
```

Note `addressing_style: path`. Self hosted endpoints usually cannot do virtual
host style addressing without a wildcard DNS entry and a matching wildcard
certificate, and this is the single most common reason a client that works
against a cloud endpoint fails against a local one.

**Versioning and object lock.** Versioning keeps prior copies on overwrite and
delete. Object lock enforces retention such that even an administrator cannot
delete within the window. That second one is the meaningful ransomware control:
an attacker with your credentials still cannot destroy locked objects.

**Lifecycle rules.** Server side policies that expire old versions or transition
data between tiers, so cleanup is declarative instead of a cron job you forget
to monitor.

## Durability: replication versus erasure coding

Replication stores N complete copies. Simple, fast to repair, and it costs N
times the raw capacity.

Erasure coding splits an object into k data shards plus m parity shards, and any
k of the k+m shards reconstruct it. Storage overhead is `(k+m)/k`, so a 8+4
scheme survives any four losses at 1.5x overhead where triple replication would
cost 3x for similar protection. The costs are CPU for encode and decode, higher
latency on small objects, and a repair process that reads from many nodes.

Small objects are where erasure coding gets uncomfortable, because sharding a 4
KB object across twelve devices means twelve tiny IOs to read it back. Most
systems handle this by inlining objects below a threshold. Worth checking, if
your workload is millions of small objects.

Two things people confuse: durability is not availability, and neither is
backup. Erasure coding protects against device failure inside one system. It
does nothing about the site burning down, the cluster software corrupting data,
or someone with valid credentials deleting a bucket. Object lock plus a copy
somewhere else covers those.

## Where it is the wrong answer

I would not put these on object storage:

- **Anything expecting POSIX semantics.** A database's data directory, a build
  workspace, anything doing random writes or relying on locking. Filesystem
  gateways over object stores exist and they are a reliable source of pain.
- **Small, frequently mutated files.** Every change rewrites the whole object.
  Configuration that changes constantly belongs somewhere else.
- **Latency sensitive small reads.** An HTTP round trip with signature
  verification is fine at tens of milliseconds and wrong for a hot path
  expecting microseconds.

Where it is the right answer: backups and archives, media and static assets,
data lake files, container registry layers, build and dependency caches, log
retention. The common thread is write once, read many, large objects, and
tolerance for HTTP latency.

## Running one at home

The realistic reasons to self host are learning the API properly, keeping data
local, and having an S3 target for tools that only speak S3. There are solid
open source implementations that run as a single process for a lab and cluster
for real deployments.

Things I would insist on from the start: TLS with a certificate your clients
actually trust, since self signed certs cause endless client failures. A real
access key per application rather than a shared root credential, with a policy
scoped to one bucket. Versioning on anything you care about. And a periodic
restore test, because an S3 endpoint that accepts writes and cannot serve reads
back correctly is a failure mode you want to discover on your schedule rather
than during an incident.

## References

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [Amazon S3 user guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [Boto3 documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)
- [MinIO](https://github.com/minio/minio)
- [Erasure code](https://en.wikipedia.org/wiki/Erasure_code)
- [Object storage](https://en.wikipedia.org/wiki/Object_storage)
