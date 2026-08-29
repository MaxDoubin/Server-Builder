
## Embeddings are coordinates

An embedding model turns a piece of text into a fixed length list of numbers. A few hundred to a few thousand floats, always the same length for a given model. That list is a point in a high dimensional space, and the model is trained so that things with similar meaning land near each other.

That is the whole trick. Once text is coordinates, "find related documents" becomes "find nearby points," which is a geometry problem with decades of prior work behind it. A vector database is a system for storing those points and answering nearest neighbour queries quickly.

Two things worth internalizing early. The coordinates are only meaningful within one model: vectors from two different embedding models are not comparable, ever. And re embedding your corpus is the cost you pay whenever you change models, so pick deliberately.

## Distance metrics

Three metrics cover almost everything.

Cosine similarity measures the angle between two vectors and ignores their length. Euclidean distance measures straight line distance and does care about length. Dot product measures both at once.

For text embeddings, cosine is the usual choice, because the direction carries the meaning and the magnitude often carries something incidental like document length. There is a useful shortcut: if you normalize every vector to unit length when you store it, cosine similarity and dot product become the same computation, and Euclidean distance becomes a monotonic function of both. Normalize on write, use dot product on read, and stop thinking about it.

```python
import numpy as np

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

docs = normalize(np.random.randn(10000, 768).astype("float32"))
query = normalize(np.random.randn(768).astype("float32"))

scores = docs @ query          # cosine, because everything is unit length
top = np.argpartition(-scores, 5)[:5]
print(sorted(top, key=lambda i: -scores[i]))
```

That is a complete exact search engine in six lines. Keep it in mind before you deploy anything.

## Exact search is fine until it is not

Brute force compares the query to every stored vector. It is exact, trivially correct, and its cost is linear in the number of vectors times the dimension count. Ten thousand documents at 768 dimensions is a few million floating point operations, which is nothing.

At a million vectors it is still workable if you batch it. Somewhere past that, latency and memory push you toward an index. The threshold is much higher than most people assume, and I have watched people stand up a whole database service for a corpus that would fit in a numpy array.

## Approximate indexes in plain terms

Approximate nearest neighbour indexes trade a small amount of recall for a large amount of speed. Two families dominate.

HNSW builds a layered graph. Every vector is a node connected to its near neighbours, with sparse long range links in upper layers. A search starts at the top, greedily walks toward the query, drops a layer, and repeats. It is fast, gives high recall, and supports incremental inserts. The costs are memory, because you store the graph as well as the vectors, and build time.

IVF partitions the space into clusters, usually with k means, and stores which vectors belong to which cluster. A query finds the nearest few cluster centroids and only searches inside those. It is cheaper on memory and faster to build, but recall depends on how many clusters you probe, and vectors near a cluster boundary can be missed.

Both expose a knob that trades recall for latency: `ef_search` for HNSW, `nprobe` for IVF. Tune it against a real query set and measure recall, because the default is a guess about someone else's data. Product [quantization](/blog/model-quantization-by-the-bytes) compresses the stored vectors on top of either, saving a lot of memory at some further accuracy cost.

## The filtering trap

Real queries are rarely pure similarity. You want the nearest documents that also belong to a tenant, or are not archived, or are newer than a date.

The naive implementation retrieves the top k by similarity and then filters. If the filter is selective, you can easily get zero results back from a query that had thousands of valid matches, because all your top k belonged to the wrong tenant. This is the single most common bug I see in retrieval systems, and it presents as "the search is bad" rather than as an error.

You want filtering pushed into the search, either by applying the predicate during graph traversal or by partitioning the index so each tenant has its own. Any serious vector store supports one of these. Check which one yours does before you rely on it.

## Do you actually need one?

Honest answer: often not, at first.

Under a few hundred thousand vectors, a Postgres table with `pgvector` is usually the right call. You get similarity search plus real transactions, joins to your existing metadata, backups you already run, and one system to operate instead of two. Add an HNSW index when sequential scans get slow.

If everything fits in memory in one process and the corpus is static, a library index in memory is even simpler.

Reach for a dedicated vector database when you have tens of millions of vectors, need horizontal scaling, or need index features your existing database does not have. Those are real reasons. "It is what people use for this" is not.

## References

- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [Hierarchical navigable small world](https://en.wikipedia.org/wiki/Hierarchical_navigable_small_world)
- [Efficient and robust approximate nearest neighbor search using HNSW graphs](https://arxiv.org/abs/1603.09320)
- [Cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
