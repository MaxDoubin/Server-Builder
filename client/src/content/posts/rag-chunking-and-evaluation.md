
## The one paragraph version

Retrieval augmented generation means: before you ask the model a question, go find relevant text and paste it into the prompt. That is it. There is no special model architecture involved. You are building a search engine whose results happen to be consumed by a language model instead of a human.

Which means the quality of a RAG system is mostly the quality of the search. When people say their RAG deployment gives bad answers, the retrieval is wrong roughly every time and the generation is fine.

## Ingestion, where the actual work is

Parsing is the least discussed and most expensive part. Real corpora are PDFs with two column layouts, scanned documents, spreadsheets, wiki pages with tables, and slide decks where the meaning is in the arrangement.

Getting clean text out of those is a grind. Bad extraction shows up downstream as chunks that read like word salad, and no amount of clever retrieval recovers from that. Before I build anything else, I dump a random sample of extracted text and read it. If a human cannot follow it, the pipeline is broken and nothing after this point matters.

Keep metadata while you are here: source, title, section heading, page, modified date, and whatever access control identifier applies. You will need every one of those later for filtering and for citations.

## Chunking is a retrieval decision

Chunking is where most quality is won or lost, and people treat it as a formatting step.

The tension is simple. Small chunks retrieve precisely but lose context, so the model gets a fragment that answers nothing. Large chunks carry context but dilute the embedding, because one vector now has to represent several unrelated ideas, and it ends up near nothing in particular.

What works for me: split on structure first, meaning headings, sections, and paragraph boundaries, and only fall back to a fixed size window when a section is too long. Overlap consecutive chunks slightly so a sentence that straddles a boundary appears in both. Prepend the document title and section heading to the chunk text before embedding, so an isolated paragraph still carries what it is about.

```python
def chunk(text, title, heading, max_chars=1200, overlap=150):
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    out, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 2 > max_chars and buf:
            out.append(buf)
            buf = buf[-overlap:] + "\n\n" + p
        else:
            buf = (buf + "\n\n" + p).strip()
    if buf:
        out.append(buf)
    prefix = f"{title} > {heading}\n\n"
    return [prefix + c for c in out]
```

Character counts are a rough proxy for tokens. If you are near a hard context limit, count tokens with the tokenizer your model actually uses.

## Embedding and indexing

Pick one embedding model and stay on it, because changing it means re embedding everything. Normalize vectors on write so similarity is a dot product. Store the chunk text, the vector, and all that metadata together so a retrieval result is immediately usable.

Batch your embedding calls. Embedding a large corpus one chunk at a time is the difference between minutes and hours, and the API or local model will happily take a hundred at once.

Make ingestion idempotent and content addressed. Hash the source document, and skip re embedding anything whose hash has not changed. You will re run this pipeline more times than you expect.

## Retrieval, reranking, and the context budget

Pure vector search misses exact terms. Someone searching for an error code or a product identifier wants a literal match, and embeddings are bad at those. Run keyword search alongside vector search and merge the results. Hybrid retrieval is a bigger quality improvement than almost anything else you can do.

Then rerank. Retrieve more candidates than you need, say twenty, run a cross encoder or a cheap scoring pass over them, and keep the best handful. Reranking is more accurate than the first stage because it looks at query and document together instead of comparing two independent vectors.

Finally, respect the context budget. Filling the prompt with everything you found is worse than sending three good chunks. Send the text, the source, and a clear instruction to answer only from the provided material and to say so when the material does not contain the answer.

## Evaluate retrieval separately

This is the discipline that separates a system that improves from one that just changes.

Build a small evaluation set: real questions with the chunk or document that should be retrieved. Fifty is enough to be useful. Then measure recall at k, meaning how often the right material appears in the top k results, and do it as a plain number you can track.

Now you can tune. Change chunk size, measure. Add hybrid search, measure. Add reranking, measure. If retrieval recall is high and answers are still bad, only then is it a prompting or model problem. Without this split you are guessing, and guessing at two coupled systems at once never converges.

## References

- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [pgvector and PostgreSQL documentation](https://www.postgresql.org/docs/current/)
- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [Word embedding](https://en.wikipedia.org/wiki/Word_embedding)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
