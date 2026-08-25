
## The gap in reproducibility

Say a model behaves differently than it did last month. You check out the
commit, install the pinned dependencies, and run the same script. It still
does not match. The usual reason is that the one input nobody versioned is the
one that changed: the data.

Data drifts in ways code does not. Files get appended to a directory. A
labeling pass corrects entries in place. Someone regenerates a preprocessing
output with a slightly different script. A source system backfills records
with earlier timestamps. None of it produces a diff anyone reviews, and all of
it changes the model.

A dataset version is not a folder name with a date on it. It is a
cryptographic statement about exactly which bytes were used.

## Content addressing is the whole idea

Name data by the hash of its contents rather than by a path. Two files with
the same hash are the same file, anywhere, forever. A file whose hash changed
is a different file even if the name did not move.

That single property gives you a lot. Deduplication is automatic. Integrity
checking is automatic. And a manifest listing hashes is a complete, verifiable
description of a dataset that fits in your code repository even when the data
itself is terabytes.

```python
import hashlib, json, os
from pathlib import Path

def file_digest(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()

def build_manifest(root):
    root = Path(root)
    entries = []
    for p in sorted(root.rglob("*")):
        if p.is_file():
            entries.append({
                "path": str(p.relative_to(root)),
                "bytes": p.stat().st_size,
                "sha256": file_digest(p),
            })
    body = json.dumps(entries, sort_keys=True, separators=(",", ":"))
    return {
        "dataset_id": hashlib.sha256(body.encode()).hexdigest()[:16],
        "file_count": len(entries),
        "total_bytes": sum(e["bytes"] for e in entries),
        "files": entries,
    }

if __name__ == "__main__":
    m = build_manifest("data/raw/support-tickets")
    Path("manifests/support-tickets.json").write_text(json.dumps(m, indent=2))
    print(m["dataset_id"], m["file_count"], m["total_bytes"])
```

Sorting the paths and using stable JSON separators matters. If the manifest
serialization is not deterministic, the dataset id changes for reasons that
have nothing to do with the data, and the whole scheme stops meaning anything.

Commit the manifest. Do not commit the data. The manifest is small, diffable,
and reviewable, and it names exactly what a training run consumed.

## Append-only storage, immutable versions

Store the actual bytes in a content-addressed layout, keyed by digest, and
never modify a stored object. Corrections do not overwrite: they create a new
object and a new manifest that points at it. The old version stays resolvable
because some model out there was trained on it and you will eventually need to
explain that model.

This is where a lot of well-intentioned setups fail. Someone fixes bad labels
in place because it feels like an obvious improvement. Now every earlier
manifest referencing that path is a lie, and there is no way to detect it
except by verifying hashes, which is exactly why you should verify hashes as a
routine step before training rather than only when investigating a problem.

Store derived artifacts the same way. If a training run reads a tokenized or
preprocessed form, that form gets its own manifest and its own id, plus a
record of which raw dataset id and which processing code version produced it.
Otherwise you can reproduce the raw input but not what the model actually saw.

## Splits are part of the version

Train, validation, and test membership belongs in the version, not in a random
seed at runtime. Two reasons.

Leakage. If splits are recomputed each run and the dataset grew, a record that
was in test last time can be in train this time, and your evaluation number
quietly becomes optimistic. This is one of the easiest ways to fool yourself
and one of the hardest to notice, because the metric moves in the direction
you were hoping for.

Comparability. Comparing two models is only meaningful if they were evaluated
on the same held-out records. Freezing the test set membership as an explicit
list of record identifiers, stored and hashed alongside the data, is what
makes a leaderboard mean anything.

Prefer deterministic assignment over a shuffle: hash a stable record
identifier and bucket on the result. New records land in a split without
disturbing where existing records already went.

## The record that ties it together

Every trained model should carry a small provenance record, and it should be
machine-readable rather than a note in a document:

```json
{
  "model_id": "ticket-classifier-2026-07-30-a",
  "code_commit": "4c1f9ab",
  "raw_dataset_id": "b7d2f10c9e441a53",
  "processed_dataset_id": "1e8a34cc70b9f2d6",
  "split_manifest_sha256": "9c0b...",
  "framework": "torch 2.4.1",
  "seed": 20260730
}
```

Written at training time, stored next to the weights, and never edited. When
someone asks in six months why two models disagree, this turns an
archaeological dig into a diff of two JSON files.

The habit I try to hold: if I cannot name the exact bytes a result came from,
I do not really have a result. I have an anecdote about one afternoon.

## References

- https://en.wikipedia.org/wiki/Content-addressable_storage
- https://en.wikipedia.org/wiki/SHA-2
- https://man7.org/linux/man-pages/man1/sha256sum.1.html
- https://huggingface.co/docs/datasets/index
- https://parquet.apache.org/docs/
