
## Tokens Are Not Words

The first time I built anything on top of a language model, I budgeted context
the way I budget disk: count the words, multiply by something, done. That
estimate was wrong in both directions depending on what I fed it, and the
places it was wrong turned out to be the interesting part.

A tokenizer is not a dictionary lookup and it is not a word splitter. It is a
learned compression scheme over bytes. Somebody ran an algorithm across a large
pile of text, found the sequences that repeat most, and froze the result into a
vocabulary file of some fixed size. Every piece of text you send gets encoded
into IDs from that vocabulary before the model sees anything. The model has no
concept of a word. It has a concept of token 4712.

That distinction explains almost every surprise. Text that looks like the
tokenizer's training data compresses well. Text that does not looks expensive.

## Byte Pair Encoding In One Paragraph

Most modern tokenizers are some variant of byte pair encoding. You start with
the raw bytes as your alphabet, then repeatedly find the most frequent adjacent
pair in the corpus and merge it into a new symbol. Do that a few tens of
thousands of times and you end up with a vocabulary where common English words
are single tokens, common suffixes are single tokens, and anything unusual
falls back to smaller pieces or individual bytes.

The important property is that the merge list is ordered and fixed. Encoding is
deterministic and greedy: apply the merges in learned order until nothing more
merges. There is no semantics involved. The tokenizer does not know that
`server` and `servers` are related. It knows that the merge for `s` onto
`server` happened to be learned, so the plural is two tokens and not one.

## Where The Surprises Actually Come From

Five patterns cover most of what I have run into.

**Leading whitespace is part of the token.** In most byte pair encoding
vocabularies, ` the` with a leading space and `the` at the start of a line are
different tokens. This is why joining strings without spaces, or stripping
whitespace before you count, changes your number.

**Numbers tokenize badly.** Depending on the vocabulary, a long number may
split into groups of one to three digits with no relationship to place value.
A table of timestamps or IDs costs far more than its character count suggests,
and it is a real reason arithmetic on long numbers is hard for these models.

**Non-English text costs more.** Vocabularies built on web text that skews
English give English the best compression. The same sentence in a language with
less representation, or in a script outside Latin, can take several times as
many tokens for the same meaning. If your application is multilingual, your
per-request budget is not uniform across users.

**Structure is expensive.** JSON, XML, and heavily indented code are full of
punctuation and whitespace runs. Braces, quotes, colons, and newline plus
indentation sequences all consume tokens. A payload that is 60 percent
scaffolding pays for that scaffolding on every single request.

**Odd Unicode falls back to bytes.** Emoji, unusual symbols, and rare
characters may not be in the vocabulary at all, so they encode as several raw
byte tokens. One visible character can be four tokens. Text that has been
mangled through a bad encoding round trip is the worst case I have seen: it
looks like garbage and it tokenizes like garbage.

## Measure, Do Not Estimate

The fix is boring: count with the actual tokenizer for the actual model, and
count in the same place you enforce limits. Rules of thumb like "four
characters per token" are fine for a back of the envelope and useless for a
guardrail.

```python
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("bert-base-uncased")

samples = {
    "english": "The switch dropped the uplink at 3 a.m.",
    "digits": "Request 8172640913 failed at 1748302911",
    "json": '{"host": "edge-01", "state": "down", "since": 1748302911}',
}

for name, text in samples.items():
    ids = tok.encode(text, add_special_tokens=False)
    ratio = len(text) / max(len(ids), 1)
    print(f"{name:8} chars={len(text):4} tokens={len(ids):4} chars/token={ratio:.2f}")

# Look at the actual pieces when a number surprises you.
print(tok.convert_ids_to_tokens(tok.encode("8172640913", add_special_tokens=False)))
```

Run that against your own real traffic, not against a sentence you invented.
The distribution of your production inputs is the only distribution that
matters, and it usually has a long tail of pathological documents.

## What I Changed Once I Understood This

Three things, all cheap.

I started logging token counts as a first class metric next to latency and
status code, split by input and output. Cost and context pressure are both
downstream of that number, and you cannot manage what you do not record.

I started normalizing input before encoding. Collapsing runs of whitespace,
stripping the decorative parts of scraped HTML, and dropping fields nothing
reads shaved a real percentage off every request without touching quality.

I stopped putting large structured blobs in the prompt when a compact
representation would do. If the model needs three fields from a record, send
three fields. The JSON envelope is for machines talking to machines, and the
tokenizer charges you for every brace.

The underlying lesson generalizes past language models. Any time a system has a
unit of accounting that is not the unit humans think in, the gap between those
two units is where the surprises live. Sectors versus files, frames versus
packets, tokens versus words. Learn the machine's unit.

## References

- [Byte pair encoding](https://en.wikipedia.org/wiki/Byte_pair_encoding)
- [Hugging Face Tokenizers documentation](https://huggingface.co/docs/tokenizers/index)
- [UTF-8](https://en.wikipedia.org/wiki/UTF-8)
- [Unicode Standard Annex 29: Text Segmentation](https://www.unicode.org/reports/tr29/)
- [Large language model](https://en.wikipedia.org/wiki/Large_language_model)
