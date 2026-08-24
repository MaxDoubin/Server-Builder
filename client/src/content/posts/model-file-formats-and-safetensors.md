
## A Model Is A Bag Of Tensors Plus Metadata

Strip away the mystique and a trained model on disk is two things. There is a
dictionary mapping names like `layers.14.attn.q_proj.weight` to
multidimensional arrays of numbers, and there is a description of the
architecture that tells you how to wire those arrays together. Everything
interesting about model file formats comes down to how those two things get
written down.

That framing helps because it makes the questions concrete. How are the numbers
laid out? Is the dtype recorded? Can I read one tensor without reading the
whole file? Can I map the file into memory instead of copying it? And, the one
people skip: what code runs when I open this?

## Why Pickle Became A Problem

Python's default serialization is `pickle`, and for years the standard way to
save a model was to pickle a dictionary of arrays. It is convenient because it
serializes almost any object graph without you describing the schema.

It is also, by design, a small stack based virtual machine. A pickle stream
contains opcodes, and some of those opcodes tell the interpreter to import a
module and call something in it. Unpickling untrusted data is not parsing, it
is execution. The Python documentation says this at the top of the page in a
warning box, and it is not hypothetical: the attack is a few lines of code and
it runs with the privileges of whatever process loaded the model.

This matters more than it used to because models are now distributed the way
software packages are. People download weights from a hub, from a colleague,
from a link in a forum. If your loading path can execute code, then your model
supply chain is a code supply chain, and it deserves the same suspicion you
apply to a random binary. CWE-502, deserialization of untrusted data, has been
on the classic weakness lists for a long time. Machine learning just gave it a
new delivery vehicle.

## What Safetensors Does Differently

The safetensors format is a deliberate reaction to that. The layout is about as
simple as a binary format gets:

- 8 bytes: little endian unsigned integer, the length of the header
- N bytes: a JSON header
- the rest: raw tensor bytes, back to back

The JSON header maps each tensor name to its dtype, its shape, and a byte
offset pair into the data region. There are no opcodes. Parsing it is reading
JSON and then doing pointer arithmetic. There is nothing in the format that can
tell your process to import anything.

Two practical consequences fall out of that layout. First, you can read a
single tensor without touching the rest of the file, because you know exactly
where it lives. Second, you can memory map the file and hand the mapped region
straight to the tensor objects, so loading a large checkpoint becomes page
faults driven by actual use rather than a full copy through userspace. On a
machine where the model is larger than comfortable, that difference is the
difference between a fast start and swapping.

The tradeoff is that safetensors stores tensors and a small string to string
metadata map, and nothing else. The architecture definition lives beside it,
usually as a config file, and the code that builds the graph lives in a
library. That separation is a feature. The data file is inert.

## Other Formats And What They Optimize For

**NumPy's .npy and .npz** are worth understanding because they are the same
idea at a smaller scale: a short header describing dtype, shape, and memory
order, then the raw buffer. If you can read the `.npy` spec you can read
safetensors, and the reverse.

**ONNX** solves a different problem. It is a graph format: it serializes the
operations as well as the weights, so a runtime that has never seen your
training framework can execute the model. That portability is the point, and
the cost is that the graph is a fixed lowering of what your framework did.

**Single file quantized formats** such as GGUF exist to make a model one
self-contained artifact for a specific runtime. Weights, quantization scheme,
tokenizer, and a key value metadata block travel together, which is exactly
what you want when the deployment target is somebody's laptop and there is no
package manager involved.

None of these is universally right. Training checkpoints, distribution
artifacts, and runtime artifacts have genuinely different requirements.

## How I Handle Model Files

Rules I follow in the lab, none of them clever:

```bash
# 1. Record what you downloaded, before you load it.
sha256sum model.safetensors | tee model.safetensors.sha256

# 2. Inspect the header without loading a single weight.
python3 - <<'EOF'
import json, struct
with open("model.safetensors", "rb") as f:
    n = struct.unpack("<Q", f.read(8))[0]
    header = json.loads(f.read(n))
meta = header.pop("__metadata__", {})
total = sum(
    (v["data_offsets"][1] - v["data_offsets"][0]) for v in header.values()
)
print(f"tensors={len(header)} header_bytes={n} data_bytes={total}")
for name in list(header)[:5]:
    e = header[name]
    print(f"  {name}: dtype={e['dtype']} shape={e['shape']}")
print("metadata:", meta)
EOF
```

Prefer a format that cannot execute. If a project only ships pickled weights
and I actually need it, it loads in a container with no network, a read only
root filesystem, and a non privileged user, and I convert it once to something
inert. Pin and record hashes, because "the same model" is not a meaningful
statement without one. Store the config, the tokenizer, and the weights
together as one versioned unit, since a checkpoint paired with the wrong
tokenizer fails in ways that look like the model got dumber rather than like an
error.

None of this is exotic security work. It is the same instinct that stops you
from piping an unknown URL into a shell. Model files earned their way onto that
list.

## References

- [Python pickle module documentation](https://docs.python.org/3/library/pickle.html)
- [CWE-502: Deserialization of Untrusted Data](https://cwe.mitre.org/data/definitions/502.html)
- [Safetensors documentation](https://huggingface.co/docs/safetensors/index)
- [NumPy .npy format specification](https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html)
- [ONNX documentation](https://onnx.ai/onnx/)
- [Serialization](https://en.wikipedia.org/wiki/Serialization)
