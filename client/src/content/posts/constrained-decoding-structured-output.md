
## Asking Nicely Is Not A Guarantee

The first version of every pipeline that needs structured output from a model
looks the same. You write "respond only with JSON matching this schema" in the
prompt, you parse the result, and it works in testing. Then it runs on real
input and you start collecting failure modes: a leading sentence of
explanation, a fenced code block wrapper, a trailing comma, a truncated object
because the output hit the token limit mid string, a field name that is close
to yours but not yours.

None of this is the model being difficult. Sampling picks a token at a time
from a probability distribution, and nothing in that loop knows what a valid
document looks like. The prompt shifts the distribution toward well formed JSON.
It does not make malformed JSON impossible, and at scale, anything not
impossible happens.

## What Constrained Decoding Actually Does

The mechanism is simpler than the name suggests. At every decoding step, the
model produces a score for every token in the vocabulary. Normally you sample
from that distribution. Constrained decoding inserts one step: before sampling,
set the score of every token that cannot legally come next to negative
infinity, so its probability after the softmax is zero.

To know which tokens are illegal, you need a machine that tracks where you are
in the output. If you have emitted `{"status": ` then the legal continuations
are a quote, a digit, `t`, `f`, `n`, `{`, or `[`, and nothing else. A closing
brace is illegal there. You mask it, and the model cannot produce it no matter
what it wanted.

The result is a hard guarantee rather than a strong tendency. Output that
violates the grammar is not unlikely, it is unreachable.

## Grammars, Schemas, And State Machines

Underneath, three related formalisms show up.

A **regular grammar** compiles to a finite state machine. This covers a lot of
useful cases: an enum of allowed values, a date format, a fixed set of labels.
Masking is cheap because you can precompute, for each state, the set of
vocabulary tokens that keep you legal.

A **context free grammar** with a pushdown automaton handles nesting, which is
what JSON actually needs, because brace and bracket depth is unbounded. The
stack tracks how many closers you still owe.

A **JSON Schema** is neither of those on its own, but the structural parts of
it, required keys, types, enums, array bounds, compile down into a grammar. The
semantic parts, such as a numeric range or a string pattern that is genuinely
about meaning, generally do not, and those you still validate afterward.

The awkward part is that the machine operates on characters while the model
operates on tokens, and a single token often spans several characters and can
straddle a grammar boundary. Reconciling the two is the fiddly engineering
inside any constrained decoding implementation, and it is why compiling a
grammar against a specific tokenizer takes real work and gets cached.

## What It Costs

Constrained decoding is not free and it is not always the right call.

**Compile time.** Turning a schema into a token level automaton takes time
proportional to schema complexity and vocabulary size. Do it once per schema
and cache it, not once per request.

**Per step overhead.** You compute a mask every step. Implementations keep this
small, but it is not zero, and a pathological grammar can make it noticeable.

**Over constraining hurts quality.** This is the failure people do not expect.
If you force the model into a structure that fights the way it wants to
express the answer, you can get worse content inside a perfectly valid
envelope. The classic case is demanding a single terse field when the model
would have reasoned its way to a better answer given room. If you need the
reasoning, give the schema a field for it, ordered before the conclusion, so
the constrained path still allows the model to work.

**It cannot make the answer correct.** A schema guarantees the shape. It says
nothing about whether the value is right. Valid JSON containing a wrong
hostname is still wrong.

## The Layers I Actually Use

I treat this as defense in depth rather than one mechanism.

```python
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class Triage(BaseModel):
    reasoning: str = Field(max_length=600)
    severity: Literal["low", "medium", "high", "critical"]
    affected_host: str = Field(pattern=r"^[a-z0-9-]{1,63}$")
    needs_human: bool

def parse_triage(raw: str) -> Triage | None:
    # Layer 3: the model is constrained, but never trust the wire format.
    try:
        return Triage.model_validate_json(raw)
    except ValidationError as exc:
        log_rejected(raw, exc.errors())
        return None

def triage(alert: str, attempts: int = 2) -> Triage | None:
    schema = Triage.model_json_schema()
    for _ in range(attempts):
        raw = generate(prompt=build_prompt(alert), json_schema=schema)
        result = parse_triage(raw)
        if result is not None:
            return result
    return None   # fall through to the human queue, do not guess
```

Layer one is the prompt, which still matters because it steers content even
when structure is enforced. Layer two is the grammar constraint at decode time,
which makes malformed output impossible. Layer three is validation in your own
code, because the constraint enforced JSON Schema structure and not your
business rules, and because you may swap the serving stack tomorrow.

Layer four is the one people skip: define what happens when all of that fails.
A bounded number of retries, then a deterministic fallback path. Never an
infinite loop, and never a silently swallowed exception that leaves a half
processed record behind.

Think of it the way you think of input validation anywhere else. The client can
be as well behaved as you like; the server validates anyway. A language model is
just an unusually eloquent client.

## References

- [JSON Schema](https://json-schema.org/)
- [RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259.html)
- [Context-free grammar](https://en.wikipedia.org/wiki/Context-free_grammar)
- [Finite-state machine](https://en.wikipedia.org/wiki/Finite-state_machine)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
