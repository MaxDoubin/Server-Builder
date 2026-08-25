
## The arithmetic that makes adapters interesting

A full fine tune updates every weight in the model and produces a complete new set of weights. If the base model is tens of gigabytes, every fine tune is tens of gigabytes, and every experiment is a new artifact of that size. That is a storage and distribution problem before it is a machine learning problem.

Low rank adaptation takes a different approach. Freeze the original weight matrix `W` of shape `(d_out, d_in)`, and learn a small update expressed as the product of two thin matrices: `B` of shape `(d_out, r)` and `A` of shape `(r, d_in)`, with `r` much smaller than either dimension. At inference the effective weight is `W + (alpha / r) * B @ A`. Only `A` and `B` are trained.

The parameter count tells the whole story:

```python
def lora_params(d_in, d_out, rank):
    return rank * (d_in + d_out)

def full_params(d_in, d_out):
    return d_in * d_out

d_in = d_out = 4096
for r in (4, 8, 16, 32, 64):
    lp = lora_params(d_in, d_out, r)
    fp = full_params(d_in, d_out)
    print(f"rank {r:>3}: {lp:>10,} params  =  {100 * lp / fp:6.3f}% of the full matrix")
```

A rank 16 adapter on a 4096 by 4096 matrix is around 131,000 parameters against roughly 16.8 million. Applied across the attention projections of a whole model, an adapter is typically a file measured in megabytes rather than gigabytes. That is the operational unlock: a fine tune becomes something you can store hundreds of, diff, and ship in a container layer.

## The two knobs, and what they mean

`r` is the rank, and it bounds how much the adapter can change. Low rank means the update is constrained to a small subspace. That is a feature for style, format, and domain vocabulary adaptation, and a limitation if you are trying to teach genuinely new capability. Higher rank means more capacity and a bigger file, with more risk of overfitting a small dataset.

`alpha` is a scaling factor, and the effective scale of the update is `alpha / r`. This trips people up: raising the rank while keeping alpha fixed lowers the per unit contribution. Many setups keep `alpha` at some multiple of `r` so the scale stays stable across rank sweeps. Whatever convention you pick, write it down, because a comparison between two adapters trained with different conventions is not a comparison.

Which modules get adapters is the third decision. Attention projections are the common default. Adding the feed forward layers increases capacity and file size. There is no universal right answer, which is exactly why the configuration belongs in version control:

```python
from peft import LoraConfig, get_peft_model

config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)

model = get_peft_model(base_model, config)
model.print_trainable_parameters()
```

## Serving: merged or not

At inference you have two options, and the choice is an infrastructure decision.

**Merged.** Fold `(alpha / r) * B @ A` into `W` once, save the result, and serve it as an ordinary model. There is zero runtime overhead because the arithmetic happened offline. The cost is that you are back to a full sized artifact per variant, and you lose the ability to switch behaviour without loading a different model.

**Unmerged.** Keep the adapter separate and apply it during the forward pass. Now one copy of the base model in memory can serve several adapters, and swapping which one applies is cheap. The cost is a small amount of extra computation per layer and more complexity in the serving path.

The rule I use: merge when a variant is the only thing a deployment serves and latency is the priority. Keep adapters separate when one deployment serves several variants, or when you expect to iterate quickly, because being able to roll back by pointing at a previous adapter file is worth a great deal.

## Treat adapters like build artifacts

The failure mode I watch for is an adapter that exists as a file on someone's machine with no record of how it was produced. An adapter is only meaningful relative to an exact base model. Apply one to a different base, even a different quantization of the same base, and you get output that is subtly wrong rather than loudly broken. That is the worst kind of wrong.

So every adapter I would consider deploying carries a manifest next to it:

```json
{
  "adapter_id": "support-tone-2026-07-08",
  "base_model": "org/base-model-name",
  "base_model_sha256": "6f1c...",
  "rank": 16,
  "alpha": 32,
  "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj"],
  "dataset_ref": "internal/support-threads@v4",
  "dataset_rows": 3821,
  "train_config_ref": "configs/lora-support.yaml",
  "eval_suite": "evals/support-v2",
  "notes": "Format and tone only. Not intended to add product knowledge."
}
```

The base model hash is the field that saves you. Everything else is documentation, but that one is a correctness check the loader can enforce.

## What can go wrong

Adapters are cheap to make, which means it is cheap to make a lot of bad ones. Three failure patterns show up repeatedly.

Catastrophic narrowing: a model fine tuned hard on one narrow format gets worse at everything else. The adapter did what you asked. You have to check the things you did not ask about, which means keeping a general evaluation set alongside your task specific one and running both.

Silent base drift: the base model gets updated, deployments pick up the new one, and the adapter is now sitting on top of weights it was never trained against. Pin the base explicitly.

Stacking: applying multiple adapters at once sometimes works and sometimes produces nonsense, because nothing guarantees two low rank updates compose cleanly. If you plan to stack, test that specific combination rather than assuming it.

None of these are exotic. They are the same configuration management and regression testing problems as any other deployed artifact. Adapters just made it cheap enough to have hundreds of them, which means the discipline has to arrive earlier than it used to.

## References

- https://huggingface.co/docs/peft/index
- https://huggingface.co/docs/transformers/index
- https://pytorch.org/docs/stable/index.html
- https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)
- https://en.wikipedia.org/wiki/Low-rank_approximation
