
## Start by naming what it is

A set of model weights is a multi gigabyte binary blob, fetched over the
network, written to disk, and then loaded into a long lived process that
usually has GPU access, often has network access, and sometimes has
credentials. Every other artifact matching that description gets a checksum, a
version, a provenance record, and a review. Model files frequently get a
`curl` and a hope.

I am not making a dramatic claim about anyone's specific model. I am making a
boring claim about categories: this is a build input, and build inputs have an
established set of controls. Applying them costs almost nothing and removes a
whole class of problems.

## Some formats execute code when you load them

The first thing to know is that serialization format is a security property.

Python's pickle format is not data. It is a small stack based program that the
unpickler executes, and that includes constructing arbitrary objects and
calling arbitrary callables. The standard library documentation says so in a
warning at the top of the page. Any checkpoint format that wraps pickle
inherits that behaviour, which means loading a checkpoint from an untrusted
source is running code from an untrusted source, with whatever privileges the
serving process has.

Formats designed for weights avoid this. A safetensors file, for example, is a
JSON header describing tensor names, dtypes, and byte offsets, followed by the
raw tensor bytes. There is nothing in the format that can call anything. It
also memory maps cleanly, which is a performance benefit as well as a security
one.

My rule is simple: prefer a format that cannot execute code. If you must load
a pickle based checkpoint, do it once, in a throwaway sandbox with no network
and no credentials, convert it, checksum the result, and never load the
original again.

## Integrity and provenance

Once the format is settled, the questions are the ordinary supply chain ones.
Where did this come from, is it the same bytes as when I reviewed it, and can
I get it again.

```bash
# After downloading, record what you got
cd /srv/models/example-model/2026-05-01
sha256sum *.safetensors *.json > SHA256SUMS
chmod -R a-w .

# Before every deploy, and in CI, verify
sha256sum -c SHA256SUMS || { echo "artifact mismatch, refusing to serve"; exit 1; }
```

Three practices follow from that.

**Mirror it.** An upstream that disappears, gets renamed, or silently
republishes different bytes under the same name will break a rebuild months
later at the worst time. Pull once into storage you control and serve from
there.

**Version by content, not by name.** Directory names like `latest` and
`current` guarantee that nobody can answer "which weights produced this
output". Name directories by version or by hash, make them immutable, and let
the running service point at one through a symlink you swap. Rollback then
becomes changing a symlink and restarting, which is a thirty second operation
instead of a re-download.

**Log the identity with the work.** Every response the service produces should
be traceable to a model identifier and artifact hash recorded in the request
log. Without it, a quality regression after a model swap is unfalsifiable.

## Storage behaviour is worth designing

Weights files have an unusual access pattern: enormous sequential reads at
startup, then almost nothing. That has practical consequences.

Cold start time is dominated by how fast you can get bytes off storage and into
memory, so local NVMe beats a network filesystem for anything latency
sensitive, and a shared filesystem serving many nodes starting at once turns
into a thundering herd on your storage rather than a model problem.

After the first load the file sits in the page cache, so a restart is much
faster than a boot. That difference confuses people benchmarking startup: the
first measurement and the second measure different systems. Drop caches or
reboot if you want the honest number.

Because the files are immutable and read only, they are excellent candidates
for a read only bind mount, a separate filesystem, or storage with different
snapshot and backup policy than your writable data. There is no reason for a
serving process to have write access to its own weights, and taking that away
is a one line change.

## Treat the whole thing as one pipeline

The end state I aim for looks like any other artifact pipeline. A download step
runs as an unprivileged user with no access to the serving environment. It
verifies signatures where the publisher provides them, records hashes and the
exact upstream revision, captures the licence text next to the weights, and
converts anything unsafe into a format that cannot execute. A promotion step
moves an approved, hashed directory into the path the serving hosts read. The
serving step verifies the hash before load, mounts the directory read only, and
logs the artifact identity with every request.

None of that is exotic and none of it is specific to machine learning. It is
the same discipline you would apply to a container base image or a vendor
binary. The only genuinely new part is scale: these artifacts are large enough
that the shortcuts are tempting, and the format question is real in a way it
usually is not.

If you do one thing from this post, do the checksum manifest. It is two
commands, it costs nothing, and it converts a silent class of failure into a
loud one.

## References

- [Python documentation: pickle, with security warning](https://docs.python.org/3/library/pickle.html)
- [OWASP Deserialization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html)
- [NIST Secure Software Development Framework (SSDF)](https://csrc.nist.gov/projects/ssdf)
- [safetensors documentation](https://huggingface.co/docs/safetensors/index)
- [sha256sum(1) manual page](https://man7.org/linux/man-pages/man1/sha256sum.1.html)
