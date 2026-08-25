
## Nearest neighbour is the whole problem

A vector database is a system for answering one question quickly: given this
vector, which of my stored vectors are closest to it. Everything else, the
metadata filters, the collections, the REST API, is packaging around that
one operation.

The vectors themselves come from an embedding model that maps text, images,
or whatever else into a fixed length array of floats, typically a few hundred
to a couple of thousand dimensions, arranged so that similar inputs land near
each other. Similarity is usually cosine similarity or inner product. If you
normalise your vectors to unit length, those two become the same ranking, and
a lot of implementation detail simplifies.

## Brute force is not always wrong

Exact search is a single matrix multiply followed by a top-k selection:

```python
import numpy as np


def search(query, matrix, k=5):
    # Exact cosine top-k. matrix is (n_docs, dim).
    q = query / np.linalg.norm(query)
    m = matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
    scores = m @ q
    idx = np.argpartition(-scores, k)[:k]
    return idx[np.argsort(-scores[idx])], scores


docs = np.random.rand(50_000, 768).astype("float32")
hits, scores = search(np.random.rand(768).astype("float32"), docs)
print(hits, scores[hits])
```

Fifty thousand vectors at 768 dimensions in float32 is about 150 MB, and a
modern CPU will scan it in a small number of milliseconds. That is fine for
an internal documentation search, a personal notes corpus, or most lab
projects. I have watched people reach for a distributed vector store to hold
a few thousand documents. The index is not the hard part at that scale, and
exact search has perfect recall, which is a real advantage while you are
still debugging your chunking.

The reason approximate indexes exist is that this scan is linear. At tens of
millions of vectors with a latency budget, linear stops working.

## Graph indexes, in plain terms

The dominant approach today is a navigable small world graph, usually the
hierarchical variant known as HNSW. The idea is easier than the name.

Build a graph where each vector is a node connected to some of its near
neighbours. To search, start somewhere and greedily walk to whichever
neighbour is closer to the query, repeating until no neighbour improves.
Pure greedy walks get stuck in local minima, so two things are added: you
keep a candidate list of several promising nodes rather than one, and you
build multiple layers, where upper layers are sparse and let you take long
jumps across the space before descending to a dense bottom layer for the fine
grained search.

The knobs you actually tune:

- **M**, how many neighbours each node keeps. Higher means better recall and
  more memory, since the graph edges are stored alongside the vectors.
- **efConstruction**, how hard the builder searches while inserting. Higher
  means a better graph and slower builds.
- **ef** at query time, how wide the candidate list is. This is the runtime
  recall/latency dial, and it is the one you should expose to yourself in
  config.

The costs people underestimate: the graph lives in memory along with the
vectors, deletions are usually tombstones rather than real removals, and
heavy churn degrades graph quality until you rebuild.

## Inverted files and quantization

The other family partitions the space. Cluster the vectors, keep a centroid
list, and at query time only scan the few partitions whose centroids are
closest to the query. That is the inverted file approach, and its dial is
how many partitions you probe.

Layered on top is product quantization, which splits each vector into
subvectors, learns a small codebook for each slice, and stores the codebook
index instead of the raw floats. A vector that was a few kilobytes becomes a
few dozen bytes. You lose precision, so the usual pattern is to retrieve a
larger candidate set from the compressed index and then rescore those
candidates against full precision vectors.

The rule of thumb: graph indexes tend to win on recall at a given latency,
partition plus quantization tends to win on memory footprint at very large
scale. Both are approximate, which means both have a recall number, and if
your vendor does not publish one for your parameters, measure it yourself
against exact search on a sample.

## Operating one

Things I check before putting a vector index into anything I care about:

1. **Recall against ground truth.** Compute exact top-k for a few hundred
   sampled queries and measure overlap with what the index returns. Recall at
   10 below roughly 0.9 usually shows up as visibly worse answers downstream.
2. **Filtered search behaviour.** Combining a metadata filter with a vector
   search is the classic sharp edge. Pre-filtering can leave the graph
   disconnected, post-filtering can return fewer results than requested. Know
   which one your system does.
3. **Memory math.** Vectors plus graph edges plus any cached payloads. It is
   an in-memory system with a disk backup, not a disk system with a cache,
   and budgeting it like a normal database leads to surprises.
4. **Rebuild story.** Changing the embedding model means re-embedding
   everything. Keep the source documents and the ingest pipeline
   reproducible, because you will re-run it.
5. **Hybrid retrieval.** Dense vectors are bad at exact identifiers, error
   codes, and rare proper nouns. Keyword scoring such as BM25 is good at
   exactly those. Running both and fusing the ranks is usually a bigger
   quality win than tuning either one.

Start with exact search, prove the pipeline works, and add an approximate
index when the scan time actually shows up in your latency budget. Doing it
in the other order means debugging your retrieval quality and your index
parameters at the same time, which is not a good afternoon.

## References

- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [Hierarchical navigable small world](https://en.wikipedia.org/wiki/Hierarchical_navigable_small_world)
- [Locality-sensitive hashing](https://en.wikipedia.org/wiki/Locality-sensitive_hashing)
- [Faiss](https://faiss.ai/)
- [Okapi BM25](https://en.wikipedia.org/wiki/Okapi_BM25)
