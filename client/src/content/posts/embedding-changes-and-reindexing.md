
## A Vector Only Means Something Inside One Model

Here is the fact that everything else follows from: an embedding is a set of
coordinates in a space that one specific model invented. Dimension 412 is not
"formality" or "topic," it is whatever that model's training happened to put
there. Two different models produce coordinates that are not comparable, even
when the vectors are the same length.

That means you cannot mix embeddings from two models in one index. Not "you
should not." The distance function will happily compute a number for any two
vectors of matching dimension, and the number will be meaningless. The system
does not error. It just quietly returns bad neighbours, which is the worst
failure mode there is, because nothing alerts and quality degrades in a way
that only shows up as users complaining that search got worse.

Same model, same version, same pooling strategy, same normalization, or rebuild
everything. There is no partial migration.

## Three Different Things People Call Drift

"Drift" gets used for at least three unrelated problems in retrieval systems,
and they have different fixes.

**Model change.** You upgrade to a better embedding model, or a hosted one
changes underneath you. The space itself moved. Everything must be re-embedded.
This is not gradual and it cannot be managed incrementally.

**Corpus drift.** Your documents change over time. New products, new
terminology, new document types nobody anticipated. The embeddings are still
valid, but the index is missing or misrepresenting the new material. Fix by
ingesting continuously and periodically re-chunking things whose structure
changed.

**Query drift.** What users ask changes even when the corpus does not. A
retrieval setup tuned for keyword-like lookups performs differently when
everyone starts asking full questions. Nothing about your vectors is wrong; your
evaluation set is stale.

Only the first requires a full rebuild. Conflating them leads people to
re-embed a whole corpus when the real problem was that nobody had looked at
what users were actually asking in six months.

## Reindexing Without Downtime

Because a model change is all or nothing, the operational pattern is a blue
green swap rather than an in place migration. The shape is the same one you use
for a schema change on a live database.

1. **Build alongside.** Create a second index with the new model. Do not touch
   the live one. This costs storage for the duration, which is the price of not
   having an outage.
2. **Backfill.** Re-embed the corpus into the new index. This is the expensive
   step, and it is embarrassingly parallel, so it is a batch job on whatever
   capacity you have spare, not something you rush.
3. **Dual write.** From the moment the backfill starts, every new or changed
   document goes into both indexes. Otherwise the new index is stale by exactly
   the length of the backfill, and backfills are long.
4. **Shadow read.** Send a copy of live queries to the new index, keep the old
   index's results, and log both. Now you are comparing on real traffic before
   anything is at stake.
5. **Swap the alias.** Applications should query a name that points at an index,
   never the index directly. The cutover is a pointer change.
6. **Keep the old one.** For at least one full evaluation cycle. Rollback should
   be another pointer change, not another backfill.

The two steps people skip are dual write and the alias indirection, and both
skips have the same consequence: the rollback path stops existing.

## Record Provenance Or You Cannot Reason About Any Of This

The reason reindexing turns into a crisis is almost always that nobody can
answer "which model produced this vector." Store it with the record. Every
field below has earned its place by being the thing somebody needed at an
awkward moment.

```json
{
  "chunk_id": "doc-4821:c07",
  "doc_id": "doc-4821",
  "doc_version": "2026-05-14T09:12:00Z",
  "source_sha256": "6b3f...c19a",
  "chunk_index": 7,
  "chunk_strategy": "heading-split-v3",
  "chunk_tokens": 412,
  "embedding_model": "example-embed-base",
  "embedding_model_version": "1.4.0",
  "embedding_dim": 768,
  "normalized": true,
  "distance_metric": "cosine",
  "embedded_at": "2026-05-14T09:31:22Z",
  "index_name": "kb-v3"
}
```

With that in place, useful things become one query. Which chunks were embedded
with the old model. Which documents changed since their chunk was embedded, by
comparing `source_sha256` against the current file. How much of the index is
stale right now. Whether an experiment used the chunking strategy you think it
did.

Without it, the only honest answer to any of those questions is "rebuild
everything and find out," which is exactly the expensive operation you were
trying to scope.

## The Discipline That Makes This Boring

Three habits, and then this stops being scary.

**Version the whole pipeline, not just the model.** Chunk size, overlap,
splitting rule, whether you prepend the document title, and any text
normalization all change the vectors as surely as the model does. If your
chunking script changed and your metadata does not record it, your index is a
mix of two things and you cannot tell.

**Keep a frozen evaluation set.** A few dozen real queries with judged relevant
documents, stored in version control, never regenerated casually. Without it,
"the new model is better" is a vibe. With it, it is a number you can put next
to the migration cost. Recall at k on that set, before and after, is the entire
justification for a rebuild.

**Budget the rebuild before you adopt the model.** Corpus size times chunks per
document times cost per embedding, plus the storage for running two indexes,
plus the engineering time for the swap. Sometimes the honest conclusion is that
a modestly better model is not worth the migration this quarter. That is a fine
answer, and it is only available to you if you did the arithmetic.

Retrieval systems are not hard because vector math is hard. They are hard
because they are stateful systems whose state is expensive to regenerate, and
almost nobody treats them with the care they would give a database of the same
size.

## References

- [Word embedding](https://en.wikipedia.org/wiki/Word_embedding)
- [Concept drift](https://en.wikipedia.org/wiki/Concept_drift)
- [Cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [PostgreSQL indexes documentation](https://www.postgresql.org/docs/current/indexes.html)
- [OpenSearch documentation](https://opensearch.org/docs/latest/)
