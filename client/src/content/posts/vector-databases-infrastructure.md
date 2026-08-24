
## What is actually being stored

Strip away the branding and a vector database holds a big array of fixed length float arrays, plus an index structure that lets you find the nearest ones to a query vector without comparing against all of them, plus usually some metadata you want to filter on.

That is it. Every operational property follows from those three parts: the raw vectors are your baseline memory cost, the index is your speed and your overhead, and the metadata filtering is where most real world designs get complicated.

## Three index families and their profiles

**Flat, or brute force.** Compare the query against every vector. Exact results, zero index build time, memory is just the vectors. Latency grows linearly with collection size. This is genuinely the right answer below roughly a hundred thousand vectors, and people skip past it far too fast.

**Inverted file, or IVF.** Cluster the vectors, then search only the clusters nearest the query. One knob controls how many clusters you probe, trading recall for speed. Modest memory overhead. Needs a training step on a representative sample, and the clustering degrades if your data distribution shifts substantially after training.

**Graph based, typically HNSW.** Build a navigable graph where each vector links to neighbors, then greedily walk it. Excellent latency and recall, which is why it is the default nearly everywhere. The costs: significant memory overhead for the graph edges, slow to build, and deletion is awkward because removing a node damages connectivity. Most implementations tombstone deletes and reclaim on a rebuild.

## Sizing memory honestly

```python
GIB = 1024 ** 3

def index_gib(n_vectors, dim, dtype_bytes=4, graph_neighbors=None):
    raw = n_vectors * dim * dtype_bytes
    overhead = 0
    if graph_neighbors:
        # Each node stores neighbor ids (4 bytes each) per layer; the
        # base layer dominates and holds roughly 2x the configured M.
        overhead = n_vectors * graph_neighbors * 2 * 4
    return (raw + overhead) / GIB

for n in (100_000, 1_000_000, 10_000_000):
    flat = index_gib(n, 768)
    hnsw = index_gib(n, 768, graph_neighbors=32)
    half = index_gib(n, 768, dtype_bytes=2, graph_neighbors=32)
    print(f"{n:>10,} x 768d   flat {flat:6.2f} GiB   "
          f"hnsw {hnsw:6.2f} GiB   hnsw+fp16 {half:6.2f} GiB")
```

Two levers jump out. Dimensionality is a direct multiplier, so a model producing shorter embeddings can halve your footprint before you tune anything. And storing vectors at reduced precision cuts the dominant term, usually with negligible recall impact, because approximate search is already approximate.

## Recall is a number you have to measure

This is the part I see skipped constantly. Approximate nearest neighbor search is approximate. You do not know how approximate until you measure it on your own data.

The method is simple: take a sample of real queries, compute exact nearest neighbors with brute force to get ground truth, then measure what fraction of the true top k your configured index returns. Sweep the speed knob and plot recall against latency. Pick a point deliberately.

Do this once per collection and again whenever the data distribution changes meaningfully. A recall number from someone else's benchmark on someone else's data tells you nothing about yours.

## The operational parts nobody writes about

**Rebuild time.** Know how long a full index rebuild takes before you need one at 2am. For graph indexes at scale this can be hours, and it is CPU bound.

**Deletes and updates.** An update is usually a delete plus an insert. Tombstoned deletes accumulate, memory does not come back, and recall drifts as the graph fills with dead nodes. Plan a periodic compaction and monitor the tombstone ratio.

**Persistence and restart.** Some engines memory map from disk and start fast. Others rebuild in memory on startup, which turns a routine restart into a long outage. Find out which yours does before you find out the hard way.

**Backups.** The embeddings are derived data. You can always regenerate them from source documents, but regenerating ten million embeddings costs real time and, if you use a hosted embedding API, real money. Back up the index, and separately keep the source documents plus a record of exactly which embedding model version produced the vectors. Mixing vectors from two model versions in one index silently ruins your results.

**Filtering.** This is the real architecture decision. Filtering before the search shrinks the candidate set but breaks the index structure. Filtering after the search is easy but can return almost nothing when the filter is selective. How your engine handles combined filter plus vector queries should drive your choice of engine more than any raw benchmark.

## Do you even need a separate system

If your vectors already live next to relational data you filter on, a vector extension in your existing database is often the better engineering decision. One system to back up, one to monitor, transactional consistency between the metadata and the vectors, and joins that work.

I would reach for a dedicated vector engine when the collection outgrows what the general purpose database handles comfortably, or when I need index features it does not offer. Not before. The operational cost of a second stateful system is real and it is paid every week.

## References

- [pgvector](https://github.com/pgvector/pgvector)
- [FAISS](https://github.com/facebookresearch/faiss)
- [FAISS wiki: guidelines to choose an index](https://github.com/facebookresearch/faiss/wiki)
- [Nearest neighbor search on Wikipedia](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
