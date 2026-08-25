
## The Cheapest Inference Is The One You Skip

Before tuning batch sizes or hunting for a faster runtime, it is worth asking
how many of your requests are repeats. In most applications I have looked at,
more than you would guess. Health checks, retries, a user refreshing a page, a
scheduled job re-processing the same documents, a test suite running the same
fixtures. None of that needs the model to think again.

A cache in front of a model endpoint is ordinary infrastructure work, and the
principles are the ones you already know from HTTP caching. The parts that are
specific to models are the cache key and the honesty about determinism.

## The Cache Key Is The Whole Design

A cache key must cover everything that can change the output. For a model
endpoint that is more than the prompt text.

At minimum: the model identifier including its version or digest, the fully
rendered prompt after template expansion, the system prompt, the sampling
parameters that affect the distribution, the maximum output length, any stop
sequences, and a hash of the tool or function schemas if the request carries
them. Miss the model version and a model upgrade silently serves yesterday's
answers. Miss the system prompt and a prompt change does nothing until the cache
expires.

I also put a schema version in the key, bumped by hand whenever the request
construction logic changes in a way the other fields do not capture. It costs
one integer and saves an incident.

Normalize before hashing, but normalize carefully. Trimming trailing whitespace
and applying Unicode NFC is safe. Lowercasing is not, because case can be
meaningful in the input. Collapsing internal whitespace is not safe either if
you ever send code or indentation sensitive text.

```python
import hashlib, json, unicodedata

CACHE_SCHEMA = 3

def cache_key(req: dict) -> str:
    payload = {
        "v": CACHE_SCHEMA,
        "model": req["model"],            # include the version, not just a family name
        "system": unicodedata.normalize("NFC", req["system"]).strip(),
        "prompt": unicodedata.normalize("NFC", req["prompt"]).strip(),
        "temperature": round(float(req.get("temperature", 0.0)), 4),
        "top_p": round(float(req.get("top_p", 1.0)), 4),
        "max_tokens": int(req.get("max_tokens", 0)),
        "stop": sorted(req.get("stop", [])),
        "tools": hashlib.sha256(
            json.dumps(req.get("tools", []), sort_keys=True).encode()
        ).hexdigest(),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "infer:" + hashlib.sha256(blob).hexdigest()
```

## Caching Changes Behaviour When Sampling Is On

At temperature zero you are approximating a deterministic function, and caching
is a pure optimization. Above zero you are sampling, and a cache turns a
distribution into a fixed draw for the lifetime of the entry. Two users who ask
the same question get the identical answer, and the variety you deliberately
configured disappears for repeat traffic.

That is sometimes fine and sometimes a product bug. Decide on purpose. My rule
is that extraction, classification, and structured output run at temperature
zero and are cached aggressively, while anything where variety is the point is
either not cached or cached with the seed included in the key so that different
seeds are different entries.

## Exact Match First, Similarity Much Later

The tempting next step is a semantic cache: embed the incoming prompt, find the
nearest previously seen prompt, and if the similarity clears a threshold, return
that cached response. It looks like a large win and it introduces a failure mode
that exact matching cannot have, namely returning a confidently wrong answer to
a question nobody asked.

The problem is that embedding similarity is not equivalence. Two prompts
differing only by a negation, a date, an identifier, or a unit are close in
embedding space and mean opposite things. The threshold that catches genuine
paraphrases also catches those.

If you do it anyway, constrain it. Apply it only within a narrow task type, only
where the answer is not user specific, keep the threshold high, and log every
similarity hit with both prompts so you can audit what it decided. Ship exact
matching first, measure the hit rate, and only reach for similarity if the
number justifies the risk.

## Stampedes, Expiry, And What To Measure

A cache in front of an expensive backend has to handle the moment an entry
expires while many requests want it. Without protection, every one of them
misses at once and hits the model together. That is the classic thundering herd,
and on an endpoint with limited concurrency it is how a cache causes an outage
rather than preventing one.

Two mitigations are enough for most systems. Single flight: the first request to
miss takes a short lived lock and computes, while the others wait briefly on the
result. And jittered expiry: add a random fraction to each TTL so that entries
written together do not expire together.

```python
import random, time

BASE_TTL = 3600

def ttl_with_jitter(base: int = BASE_TTL) -> int:
    return int(base * random.uniform(0.85, 1.15))

def get_or_infer(redis, key, infer_fn):
    hit = redis.get(key)
    if hit is not None:
        return hit, True

    lock = key + ":lock"
    if redis.set(lock, "1", nx=True, ex=60):
        try:
            value = infer_fn()
            redis.set(key, value, ex=ttl_with_jitter())
            return value, False
        finally:
            redis.delete(lock)

    # Someone else is computing. Wait briefly, then fall through.
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        hit = redis.get(key)
        if hit is not None:
            return hit, True
        time.sleep(0.05)
    return infer_fn(), False
```

Streaming responses complicate storage, because you only have a complete value
at the end. The workable pattern is to stream to the client and accumulate in
parallel, writing the cache entry only on clean completion. Never cache a
response that was cut short by a client disconnect or a timeout, and never cache
an error.

Then measure three things: hit rate, the latency of hits versus misses, and the
size distribution of stored values. Hit rate tells you whether the key design is
right. If it sits near zero, something volatile is in the key, and a timestamp or
a request id is the usual culprit.

## References

- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [Cache stampede](https://en.wikipedia.org/wiki/Cache_stampede)
- [Thundering herd problem](https://en.wikipedia.org/wiki/Thundering_herd_problem)
- [Cache replacement policies](https://en.wikipedia.org/wiki/Cache_replacement_policies)
- [Redis documentation](https://redis.io/docs/latest/)
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
