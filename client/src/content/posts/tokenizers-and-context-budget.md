
## A token is a byte sequence

The unit a language model works in is not a word, a character, or a syllable.
It is an entry in a fixed vocabulary that was built by a compression algorithm
before the model was ever trained, and the most common way to build it is byte
pair encoding.

BPE starts by treating text as raw bytes, so every possible input is
representable and nothing is out of vocabulary. Then it repeatedly finds the
most frequent adjacent pair of symbols in the training corpus and merges them
into a new symbol. Do that a few tens of thousands of times and you get a
vocabulary where common English words are single tokens, common prefixes and
suffixes are tokens, and anything unusual falls back to smaller pieces.

The whole algorithm is about a page of code:

```python
from collections import Counter


def count_pairs(ids):
    return Counter(zip(ids, ids[1:]))


def merge(ids, pair, new_id):
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and (ids[i], ids[i + 1]) == pair:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out


def train(text, num_merges):
    '''Return the encoded ids and the learned merge table.'''
    ids = list(text.encode("utf-8"))     # start from bytes: 0..255
    merges = {}
    for k in range(num_merges):
        pairs = count_pairs(ids)
        if not pairs:
            break
        best = max(pairs, key=pairs.get)
        if pairs[best] < 2:
            break
        new_id = 256 + k
        ids = merge(ids, best, new_id)
        merges[best] = new_id
    return ids, merges


sample = "the theory of the thermostat is the theory of the thing" * 20
ids, merges = train(sample, num_merges=30)
print(len(sample.encode("utf-8")), "bytes ->", len(ids), "tokens")
```

Run it and the compression is visible. Everything else about tokenizers is
detail on top of this: a pre-tokenization step that decides where merges are
allowed to cross, special tokens for structure, and a fixed merge order so
encoding is deterministic.

## Why the same sentence costs different amounts

Because the vocabulary was learned from a corpus, cost tracks how well your
text resembles that corpus.

Ordinary English prose is dense in the vocabulary, so it compresses well. A
rough ballpark people use is three to four characters per token, but treat that
as a sanity check, never as a budget.

Text in a script that was less represented in training compresses far worse,
sometimes down to a token or two per character, and non-Latin scripts also cost
more UTF-8 bytes per character before merging even starts. The same document
translated into two languages does not cost the same.

Code sits somewhere else again. Keywords and common identifiers are single
tokens, but a long snake_case name splits into pieces, indentation costs
tokens, and heavily punctuated formats like JSON spend a surprising fraction of
the budget on braces, quotes, and colons. Minifying JSON before sending it is
one of the few free wins available.

Random strings are the worst case. UUIDs, hashes, and base64 have no structure
the merges can exploit, so they cost close to one token per character or two.
A log line with three UUIDs in it is not the cheap input it looks like.

## Where this shows up in infrastructure

The context window is a fixed budget shared by everything: instructions,
whatever documents you pasted in, conversation history, and the space the
output needs. Output space is the one people forget to reserve, and the
symptom is a response that stops mid sentence.

Cost and latency scale with tokens, not characters, so any estimate based on
string length is wrong in exactly the cases that matter. Count tokens with the
same tokenizer the model uses, and log the count on every request. That single
field turns "why did this one get truncated" from an investigation into a
lookup.

Truncation is where the real bugs are. Cutting a string by characters can slice
through the middle of a multi byte UTF-8 sequence and produce something that
does not decode. Cutting by tokens and decoding back gives valid text. Split on
boundaries you control, measure in tokens, and never assume a character budget
is a safe proxy.

Pin the tokenizer version alongside the model. Change the tokenizer and every
offset, budget, and cached count you stored is subtly wrong, and nothing
crashes to tell you.

## The part with security consequences

Tokenization is a text transformation, and text transformations are where
filters get bypassed.

Unicode gives many ways to write things that look identical. Homoglyphs from
different scripts, invisible formatting characters, and the fact that the same
string can exist in several normalization forms all mean that a filter matching
on characters can be walked around by an input that tokenizes to something the
filter never saw. Normalize input to a single form before you compare, hash, or
match on it, and decide deliberately whether to strip control and formatting
characters.

The general principle is one I keep coming back to across security work: any
time two components disagree about what a string is, that disagreement is the
vulnerability. A validator that sees characters and a model that sees tokens
are two components with different views of the same bytes, and the space
between them is worth thinking about before somebody else does.

## References

- [Byte pair encoding](https://en.wikipedia.org/wiki/Byte_pair_encoding)
- [UTF-8](https://en.wikipedia.org/wiki/UTF-8)
- [RFC 3629: UTF-8, a transformation format of ISO 10646](https://www.rfc-editor.org/rfc/rfc3629)
- [Unicode Standard Annex 15: Unicode Normalization Forms](https://www.unicode.org/reports/tr15/)
- [Unicode Standard Annex 29: Unicode Text Segmentation](https://www.unicode.org/reports/tr29/)
- [Hugging Face Tokenizers documentation](https://huggingface.co/docs/tokenizers/index)
