
## The thing a vector index is doing

A vector database stores embeddings, fixed length arrays of floats, and answers
the question "which stored vectors are closest to this one." Done exactly, that
is a brute force scan: compute a distance against every vector and keep the top
k. Exact, simple, and linear in the number of vectors.

Approximate nearest neighbour indexes trade a small amount of recall for a large
speedup. The dominant structure right now is HNSW, a hierarchical navigable
small world graph. The idea is a layered proximity graph: each vector is a node
connected to some number of near neighbours, upper layers are sparse and used
for coarse navigation, and a search greedily walks downhill through the layers
toward the query. You get logarithmic-ish behaviour instead of linear, at the
cost of sometimes missing a true nearest neighbour.

It works well. It is also not free, and the costs are not obvious from the API.

## Where the memory goes

Two things consume memory: the vectors themselves and the graph on top of them.

The vectors are straightforward. Dimension times bytes per component times
count. A million 768 dimensional vectors at 4 byte floats is about 3 GB.

The graph is the part that surprises people. Each node stores neighbour lists
for each layer it appears in. With a max connections parameter of M, the base
layer typically allows up to 2M links and upper layers M, and each link is an
integer id. That is real memory, often 20 to 50 percent on top of the raw
vectors depending on M and dimension.

```python
def index_size(n, dim, m, bytes_per_dim=4, id_bytes=4, layer_factor=1.1):
    vectors_gb = n * dim * bytes_per_dim / 1e9
    # base layer up to 2M links, upper layers add roughly 10 percent
    links_per_node = 2 * m * layer_factor
    graph_gb = n * links_per_node * id_bytes / 1e9
    return {
        "vectors_gb": round(vectors_gb, 2),
        "graph_gb": round(graph_gb, 2),
        "total_gb": round(vectors_gb + graph_gb, 2),
    }

print(index_size(1_000_000, 768, 16))
print(index_size(10_000_000, 768, 32))
```

Run the ten million row case and you are talking about a machine, not a
container with a default memory limit. HNSW wants to be resident. If it pages,
the graph walk turns into random disk reads and the latency advantage
evaporates.

## The knobs and what they trade

There are three parameters that matter and they trade against each other in a
predictable way.

**M**, maximum connections per node. Higher M means a denser graph: better
recall, more memory, slower build. This is a build time decision you cannot
change without reindexing.

**ef_construction**, the size of the candidate list while building. Higher means
a better quality graph and a longer build, with no effect on query time memory.
If your data is static, spend here. It is the cheapest quality you will buy.

**ef_search**, the candidate list size at query time. This is the runtime recall
versus latency dial, and it is the only one you can tune after the fact. Raise
it until recall is acceptable, then stop.

In PostgreSQL with the pgvector extension the same concepts show up directly in
DDL:

```sql
CREATE TABLE docs (
    id       bigserial PRIMARY KEY,
    body     text,
    embedding vector(768)
);

CREATE INDEX ON docs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

SET hnsw.ef_search = 100;

SELECT id, body
FROM docs
ORDER BY embedding <=> $1
LIMIT 10;
```

Note the distance operator has to match the operator class you built the index
with. Building a cosine index and then querying with L2 distance silently skips
the index and does a sequential scan, which is one of the most common reasons
somebody's vector search is inexplicably slow.

## Measure recall, do not assume it

Approximate means approximate. The only honest way to know your recall is to
compute exact results on a sample and compare.

```python
def recall_at_k(exact_ids, approx_ids, k=10):
    hits = 0
    for e, a in zip(exact_ids, approx_ids):
        hits += len(set(e[:k]) & set(a[:k]))
    return hits / (k * len(exact_ids))
```

Take a few hundred real queries, brute force them once, and store the answers.
Now every index change has a number attached to it. Without that, tuning
`ef_search` is guessing, and you will not notice when a reindex quietly makes
retrieval worse.

## When you should not use an index at all

If you have fewer than a few hundred thousand vectors, a flat scan with a good
SIMD implementation is often fast enough and it is exact. No build time, no
tuning, no recall question, no memory overhead for the graph. I have seen people
add a whole vector database service to a system holding twenty thousand
documents. A brute force scan over twenty thousand 768 dimensional vectors is a
few milliseconds of arithmetic.

Filtering changes the calculus too. If most queries are heavily filtered, say
"only this tenant's documents," a graph index can perform badly because the
walk keeps landing on nodes that the filter rejects. Some engines handle this
with filtered search modes, others degrade to scanning. Test with your actual
filter selectivity before committing to an architecture.

The general point: an ANN index is a specific optimisation with specific costs.
Reach for it when the scan actually hurts, and know what you gave up when you
do.

## References

- [Hierarchical navigable small world](https://en.wikipedia.org/wiki/Hierarchical_navigable_small_world)
- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [Qdrant indexing documentation](https://qdrant.tech/documentation/concepts/indexing/)
- [OpenSearch k-NN search](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [Faiss project site](https://faiss.ai/)
