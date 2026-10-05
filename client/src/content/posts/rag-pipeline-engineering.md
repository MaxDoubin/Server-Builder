
## Retrieval Is an Infrastructure Problem

A retrieval augmented generation demo takes an afternoon. You embed some documents, store the vectors, embed the question, pull the nearest chunks, and paste them into a prompt. It works immediately and it feels like magic.

Then you point it at real documents and quality falls apart. Not because the model is bad and not because the vector store is bad, but because everything around them is doing a poor job of deciding what text to hand the model. The retriever returns the wrong passages, the right passages get truncated out of the prompt, or chunking has already destroyed the context the answer needed.

That surrounding work is the actual engineering, and almost none of it involves machine learning. It is parsing, data modeling, indexing, ranking, and measurement. If you are comfortable operating systems, you already have the instincts for it.

## Ingestion: Parsing, Chunking, Metadata

The first place quality dies is document parsing. PDFs are the worst offender. A two column layout extracted naively interleaves the columns line by line and produces text that means nothing. Tables flatten into a run of numbers with no headers. Headers and footers repeat on every page and pollute every chunk. Scanned documents, and slide decks where the meaning lives in the layout, are close behind.

Before doing anything sophisticated, read a random sample of your extracted text with your own eyes. If a human cannot follow it, no retrieval system will rescue it.

Chunking is the next decision, and the naive approach of splitting every 500 characters is genuinely bad because it cuts sentences in half and separates a claim from its qualifier. Better rules, in order of preference:

Split on structure first. Headings, sections, and paragraphs are boundaries the author already chose for you. Respect them.

Keep chunks in a range rather than at a fixed size. Something in the region of a few hundred to a thousand tokens works for most prose. Below that you lose context, above it you dilute the embedding across too many ideas.

Overlap modestly so a fact that straddles a boundary appears whole in at least one chunk.

Carry metadata on every chunk: source document, section heading, page or anchor, a timestamp, and whatever access control identifier applies. This is not bookkeeping, it is functional. Metadata is how you filter, how you cite, and how you expire stale content. The access control field belongs in the retrieval query itself, filtered on the requesting user's identity, because who may see a document is a [trust boundary](/blog/prompt-injection-trust-boundaries) and the model must never be the thing enforcing it.

```python
from dataclasses import dataclass, field

@dataclass
class Chunk:
    text: str
    doc_id: str
    heading: str
    ordinal: int
    updated_at: str
    tokens: int = 0

def chunk_sections(sections, target=700, overlap=100):
    """sections: list of (heading, paragraphs). Packs paragraphs up to
    `target` tokens, never splitting a paragraph, with a small carry-over."""
    out, ordinal = [], 0
    for heading, paragraphs in sections:
        buf, size = [], 0
        for para in paragraphs:
            n = len(para.split())
            if size + n > target and buf:
                out.append((heading, " ".join(buf), ordinal)); ordinal += 1
                carry, csize = [], 0
                for prev in reversed(buf):
                    if csize >= overlap:
                        break
                    carry.insert(0, prev); csize += len(prev.split())
                buf, size = carry, csize
            buf.append(para); size += n
        if buf:
            out.append((heading, " ".join(buf), ordinal)); ordinal += 1
    return out
```

Prepending the document title and section heading to each chunk before embedding is a small change with a large effect. It gives an otherwise context free paragraph something to anchor to.

The packer counts words as a stand-in for tokens, which is fine for sizing chunks. Near a hard context limit, count with the tokenizer your model actually uses, because [token counts rarely match word counts](/blog/why-token-counts-surprise-you).

## Embedding Is a Batch Job

Embedding is the least interesting stage and the easiest to get operationally wrong. Treat it as an ETL job: batched, resumable, and idempotent.

Batch the calls. An embedding API or a local model will happily take a hundred chunks at once, and embedding a large corpus one chunk at a time is the difference between minutes and hours.

Make it content addressed, which also makes it resumable. Hash each source document and skip re-embedding anything whose hash has not changed, because you will rerun this pipeline more times than you expect.

Normalize vectors on write so similarity is a plain dot product, and store the embedding model version alongside every vector. Then make the query path refuse a version mismatch. That guard is what stops a partial re-embed from quietly mixing two models in one index.

## Retrieval: Hybrid Search and Reranking

Pure vector search has a specific weakness. It is good at meaning and bad at exact tokens. Ask for a specific error code, part number, or configuration key and semantic similarity will confidently return things that are about the same topic while missing the document that literally contains the string.

Keyword search has the opposite profile. It nails exact terms and misses paraphrase entirely.

Running both and merging is the fix, and it is a bigger quality win than tuning either one alone. The merge does not need to be clever: take the top results from each, combine them by rank rather than by score, since the two systems produce scores on incomparable scales, and pass the union forward. Reciprocal rank fusion is the standard way to do it, in about ten lines:

```python
from collections import defaultdict

def reciprocal_rank_fusion(result_lists, k=60, top_n=20):
    # result_lists: list of ranked lists of chunk ids, best first.
    # k = 60 is the usual constant; it keeps any one list's top ranks
    # from dominating, so chunks both systems rank well rise.
    scores = defaultdict(float)
    for ranked in result_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] += 1.0 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)[:top_n]


dense = vector_index.search(query_embedding, top_k=50)   # list of ids
sparse = keyword_index.search(query_text, top_k=50)      # list of ids
candidates = reciprocal_rank_fusion([dense, sparse], top_n=50)
```

Then rerank. A cross encoder scores the query and each candidate together rather than comparing two independently computed vectors, which makes it much more accurate and much slower. That combination is exactly right for a second stage: retrieve fifty candidates cheaply, rerank them properly, keep the best handful. Your evaluation set tells you when this is the fix: if the right passage reaches the top fifty but not the top five, a reranker is the single highest leverage addition you can make.

## Assembly: Spending the Token Budget

The last step is a budget. You have a finite context window and every extra chunk costs latency and dilutes attention. Decide how many chunks you will include and enforce it, rather than stuffing in everything above a similarity threshold. Make the allocation explicit code instead of string concatenation and hope:

```python
def assemble(system_prompt, question, chunks, budget_tokens, count_tokens):
    fixed = count_tokens(system_prompt) + count_tokens(question)
    remaining = budget_tokens - fixed - 512  # reserve room for the answer

    included, dropped = [], []
    for c in chunks:                        # already reranked, best first
        cost = count_tokens(c.text) + 32    # citation header overhead
        if cost <= remaining:
            included.append(c)
            remaining -= cost
        else:
            dropped.append((c.doc_id, c.ordinal))

    context = "\n\n".join(
        f"[{i + 1}] source={c.doc_id} section={c.heading}\n{c.text}"
        for i, c in enumerate(included)
    )
    return context, [(c.doc_id, c.ordinal) for c in included], dropped
```

Log `dropped` every time. Silent truncation is behind a lot of "it knew this yesterday" reports, and without that log you will never see it. Pair the context with a plain instruction to answer only from the provided material and to say so when the material does not contain the answer.

## Evaluation Before Vibes

This is the part teams skip, and it is the part that determines whether the system improves over time or just changes.

Build a small evaluation set. A hundred real questions with the document or chunk that should answer each one is enough to be useful. Write them from actual usage or actual need, not from imagination.

Then measure retrieval separately from generation. Retrieval quality is answered by: was the correct chunk in the top k. That is a single number, it is cheap to compute, and it isolates the half of the system you can actually fix with engineering. If the right chunk was never retrieved, no amount of prompt work will save the answer.

With that number in hand, change one thing at a time and rerun it: chunk size, then hybrid search, then reranking.

Only once retrieval is solid does it make sense to evaluate the generated answer, which is harder and fuzzier. Getting the ordering right saves enormous amounts of wasted effort.

## Operating It

RAG systems have an operational property that catches people out: they decay. Documents change, the corpus grows, and the index quietly drifts out of date.

Reindexing needs to be a scheduled, monitored job with alerting, not something someone runs manually. Track chunk counts and index freshness the same way you track disk usage.

Changing the embedding model means reindexing everything. Vectors from different models are not comparable, and mixing them produces a corpus where similarity scores are meaningless. Plan that migration as a full rebuild with a cutover, and keep the old index serving until the new one is verified.

And log what the model was given alongside every answer: the query, the retrieved chunk identifiers with their scores at each stage, what survived assembly, what was dropped, and the token counts. When someone reports a wrong response, the first question is always what the model was shown, and that log lets you replay it exactly instead of guessing. This is the RAG equivalent of keeping request logs, and skipping it makes debugging guesswork.

## What I Would Tell Someone Starting

Spend your time on ingestion and evaluation. Those two get the least attention and produce the most improvement. The retrieval algorithm is the part with the interesting name and the smallest marginal return once you have hybrid search and a reranker in place.

## References

- [Retrieval-augmented generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)
- [Okapi BM25](https://en.wikipedia.org/wiki/Okapi_BM25)
- [Apache Lucene documentation](https://lucene.apache.org/core/documentation.html)
- [OpenSearch documentation](https://opensearch.org/docs/latest/)
- [pgvector](https://github.com/pgvector/pgvector)
- [FAISS](https://github.com/facebookresearch/faiss)
- [Word embedding](https://en.wikipedia.org/wiki/Word_embedding)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Precision and recall](https://en.wikipedia.org/wiki/Precision_and_recall)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
