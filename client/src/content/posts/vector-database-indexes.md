
## The only hard problem in a vector database

Strip away the API and a vector database does one thing: given a query vector, return the stored vectors closest to it under some distance metric. The naive implementation is a loop over everything you have, and it is exactly correct. It is also linear in the number of vectors and in dimensionality, which means it stops being usable at a size that arrives sooner than people expect.

So every real system approximates. The trade is always the same three way tension between recall, latency, and memory. You can have any two comfortably. Understanding which index type sacrifices what is the difference between tuning a system and randomly changing parameters until the demo feels better.

### Flat search, and why it is not a joke

Brute force over every vector, usually called a flat index, gives exact results and needs no build step. For a few tens of thousands of vectors on a modern CPU with a vectorized distance kernel, it is fast enough that reaching for anything else is premature.

I say this because a lot of small projects deploy a distributed vector store to hold a corpus that would fit in one array in memory. Start flat. Move when you measure a problem. You want a flat index around later anyway, because it is your ground truth for measuring the recall of whatever approximation you adopt.

## IVF: partition the space, search a few cells

An inverted file index runs a clustering pass over your vectors, usually k-means, and assigns each vector to its nearest centroid. At query time you compare the query against the centroids only, pick the closest few, and search exhaustively inside just those lists.

Two parameters run it. The number of clusters controls how finely you chop the space. The number of lists probed at query time, usually called nprobe, controls how much of the space you actually look at. Probe one list and you are fast and lossy. Probe many and you converge on exact search along with its cost.

The characteristic failure mode is a query sitting near a cluster boundary. Its true nearest neighbor may live in a cell you did not probe, and no amount of retrying fixes it, because the miss is structural. That is what recall measurement is for.

## HNSW: a navigable graph with express lanes

Hierarchical navigable small world indexes build a layered proximity graph. The bottom layer connects every vector to a set of near neighbors. Each layer above holds a sampled subset with longer range links. Search enters at the top, greedily walks toward the query using sparse long links, drops a layer, and repeats, so coarse layers cover distance quickly and the dense bottom layer refines.

Its parameters are worth knowing by name because they appear in every implementation. M controls how many neighbors each node keeps, which sets both graph quality and memory per vector. efConstruction controls how hard the builder searches while inserting, trading build time for graph quality. efSearch controls how wide the search beam is at query time, and it is the knob you actually turn in production to trade latency for recall.

HNSW typically gives the best recall at a given latency, which is why it became the default in so many systems. Its cost is memory, since the graph sits on top of the vectors and is not small. It also handles deletion awkwardly, because removing a node can disconnect part of the graph, so most implementations tombstone and rebuild periodically. If your corpus churns constantly, ask how the system handles that before you commit.

## Product quantization: make the vectors smaller

The other lever is not how you search but what you store. Product quantization splits each vector into subvectors, learns a small codebook for each slice, and stores a codebook index instead of raw floats. A vector that was kilobytes becomes tens of bytes.

Distances are then computed against the compressed codes using a precomputed lookup table, which is both memory efficient and fast. The cost is precision: you are comparing against an approximation, so ranking degrades. The standard fix is a two stage search. Use the compressed index to get a generous candidate list, then rescore those candidates against full precision vectors, which you can afford because there are only a few hundred of them.

## Measuring what you actually chose

Never accept an index configuration you have not measured. The measurement is simple and takes about an hour.

```python
import time


def recall_at_k(approx, exact, queries, k=10):
    """Fraction of true top-k neighbors the approximate index returns."""
    hits = 0
    for q in queries:
        truth = set(exact.search(q, k))
        got = set(approx.search(q, k))
        hits += len(truth & got)
    return hits / (len(queries) * k)


for ef in (16, 32, 64, 128, 256):
    index.set_ef(ef)
    start = time.perf_counter()
    r = recall_at_k(index, flat, sample_queries, k=10)
    per_query_ms = (time.perf_counter() - start) / len(sample_queries) * 1000
    print(f"ef={ef:4d}  recall@10={r:.3f}  {per_query_ms:.2f} ms/query")
```

Print that table, pick the row where recall stops improving meaningfully, and you have made an engineering decision instead of a guess.

## The part that is not the index

One more thing, because it causes more bad results than any index choice: the distance metric and normalization must match how the embedding model was trained. If the model was trained for cosine similarity and you index unnormalized vectors under Euclidean distance, your neighbors will be subtly wrong in a way that looks like a bad model. Normalize at write time, record the choice in your schema, and test that a document retrieves itself as its own top hit. If it does not, stop tuning and fix the pipeline.

## References

- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [k-means clustering](https://en.wikipedia.org/wiki/K-means_clustering)
- [Faiss wiki](https://github.com/facebookresearch/faiss/wiki)
- [hnswlib](https://github.com/nmslib/hnswlib)
- [pgvector](https://github.com/pgvector/pgvector)
