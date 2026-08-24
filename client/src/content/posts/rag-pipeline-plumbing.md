
## The uncomfortable summary

Retrieval augmented generation gets discussed as a model technique. Operationally it is a search pipeline with a text generator bolted on at the end, and when it produces bad answers the model is usually not the reason. The retriever handed it the wrong passages, or the right passages got truncated out of the prompt, or the chunking destroyed the context the answer needed.

Debug it like a data pipeline, because that is what it is.

## Stage one: ingestion and chunking

Documents come in, text comes out, text gets split. Both halves are underestimated.

Extraction is where the silent damage happens. PDFs with two column layouts get read across the columns. Tables collapse into word soup. Headers and footers repeat on every page and pollute every chunk. Before tuning anything downstream, dump a hundred random extracted documents and read them. I have found more retrieval bugs there than anywhere else.

Chunking is a tradeoff with no universally right answer. Small chunks retrieve precisely but lose surrounding context. Large chunks carry context but dilute the embedding, so a chunk about ten topics matches none of them strongly. My defaults: split on structure first (headings, sections, paragraphs) rather than a fixed character count, keep chunks in the few hundred token range, overlap slightly so a sentence spanning a boundary survives, and always attach metadata: source document, section heading, position, and a stable identifier.

That metadata is not optional. It is how you cite, how you filter, and how you debug.

## Stage two: embedding is a batch job

Embedding is the least interesting stage and the easiest to get operationally wrong. Treat it as an ETL job: batched, resumable, idempotent, with the model version recorded alongside every vector.

That last point deserves emphasis. If you re-embed part of a collection with a different model version, you now have two incompatible geometries in one index and your similarity scores are meaningless across them. Store the model identifier with each vector and refuse to query across mismatches.

## Stage three: retrieval and reranking

Dense vector search is good at meaning and bad at exact tokens. Ask it for an error code, a part number, a specific function name, or a rare proper noun, and it will happily return semantically similar passages that do not contain the thing you asked for.

Keyword search has the opposite profile. So run both and fuse the results. Reciprocal rank fusion is the standard approach and it is about ten lines of code:

```python
from collections import defaultdict

def reciprocal_rank_fusion(result_lists, k=60, top_n=20):
    # result_lists: list of ranked lists of chunk ids, best first.
    # k dampens the contribution of low-ranked items.
    scores = defaultdict(float)
    for ranked in result_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] += 1.0 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)[:top_n]


dense = vector_index.search(query_embedding, top_k=50)   # list of ids
sparse = keyword_index.search(query_text, top_k=50)      # list of ids
candidates = reciprocal_rank_fusion([dense, sparse])
```

It needs no score normalization between the two systems, which is exactly why it is so widely used.

Retrieval optimizes for recall over a large candidate set. Reranking optimizes for precision over a small one. A cross encoder that scores each query and passage pair jointly is far more accurate than comparing independent embeddings, and far too slow to run over a whole collection. So you retrieve fifty candidates cheaply and rerank them expensively down to five.

If your pipeline gets the right passage into the top fifty but not the top five, reranking is the single highest leverage addition you can make.

## Stage four: prompt assembly and the token budget

The final stage is a budget allocation problem, and it should be explicit code rather than string concatenation and hope.

```python
def assemble(system_prompt, question, passages, budget_tokens, count_tokens):
    fixed = count_tokens(system_prompt) + count_tokens(question)
    remaining = budget_tokens - fixed - 512  # reserve room for the answer

    included, dropped = [], []
    for p in passages:                      # already reranked, best first
        cost = count_tokens(p.text) + 32    # citation header overhead
        if cost <= remaining:
            included.append(p)
            remaining -= cost
        else:
            dropped.append(p.id)

    context = "\n\n".join(
        f"[{i + 1}] source={p.source} section={p.section}\n{p.text}"
        for i, p in enumerate(included)
    )
    return context, [p.id for p in included], dropped
```

Log `dropped` every time. Silent truncation is the most common cause of "it knew this yesterday" reports, and without that log you will never see it.

## What to instrument

Log the query, the retrieved ids with scores at each stage, what survived assembly, what got dropped, and the token counts. When someone reports a bad answer, you should be able to replay exactly what the model was shown without guessing.

Then evaluate the retriever separately from the generator. Build a small set of questions with known correct source passages and measure whether retrieval found them at all. If recall at ten is poor, no amount of prompt engineering will save the answer, and you have saved yourself a week of tuning the wrong stage.

## References

- [pgvector](https://github.com/pgvector/pgvector)
- [FAISS](https://github.com/facebookresearch/faiss)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Apache Lucene documentation](https://lucene.apache.org/core/documentation.html)
