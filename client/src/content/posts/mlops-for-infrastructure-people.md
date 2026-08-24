
## The Same Job With Extra State

Every time I read about MLOps as a separate discipline, the parts that are actually novel turn out to be small. Deployment, versioning, rollback, monitoring, and reproducibility are the same problems that operations has always had.

There is one genuine difference, and everything else follows from it. In ordinary software, behaviour is determined by code. Pin the commit and the container image and you can recreate what ran. In a machine learning system, behaviour is determined by code, data, and a training process that is often nondeterministic. Pinning the commit gets you a third of the way.

That is the whole difficulty, stated plainly: the artifact depends on inputs that are large, changing, and much harder to version than source code.

## Three Artifacts, Not One

A deployed model is the product of three things that must be tracked together, because any one of them changing produces different behaviour.

**Code** is the easy one. Training scripts, preprocessing, and serving code all live in version control and you already know how to manage them.

**Data** is the hard one. Training datasets are large, they change, and they frequently cannot simply be copied for every experiment. Storing a full snapshot per run is often impractical, so the usual approach is to record a content hash of the dataset plus the query or the filter that produced it, and to keep the underlying store append only so that a historical view can be reconstructed. Immutable, timestamped storage matters here far more than a clever tool.

**Weights** are the output, and they are binary blobs, sometimes very large ones. Version control designed for text is the wrong home. Object storage with versioning enabled, addressed by content hash, is the right one.

The practical implementation is a manifest that ties all three together and travels with the model. This is the artifact I would insist on before anything goes to production.

```yaml
# model-manifest.yaml, written by the training job, stored beside the weights
model:
  name: ticket-classifier
  version: "2026.04.14-a91f3c2"
  task: multiclass-classification
  artifact_uri: s3://models/ticket-classifier/2026.04.14-a91f3c2/model.safetensors
  artifact_sha256: 8f14e45fceea167a5a36dedd4bea2543b1c2b0f7a89e6f2e0d1c9b7a4e3f2d10

source:
  repo: git@internal.example:ml/ticket-classifier.git
  commit: a91f3c2d4e5b6789012345678901234567890abc
  dirty: false

data:
  dataset_uri: s3://datasets/tickets/snapshot-2026-04-01/
  dataset_sha256: 3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c
  rows: 184230
  filter: "created_at < '2026-04-01' AND label IS NOT NULL"
  split_seed: 42

environment:
  image: registry.internal.example/ml/train:2026.03.18
  python: "3.12.4"
  accelerator: single-device
  seed: 42
  deterministic_ops: true

evaluation:
  holdout_uri: s3://datasets/tickets/holdout-v3/
  macro_f1: 0.871
  accuracy: 0.904
  evaluated_at: "2026-04-14T09:12:44Z"

approval:
  promoted_by: platform-team
  promoted_at: "2026-04-14T15:03:00Z"
```

If you cannot produce that manifest for a model currently serving traffic, you cannot answer basic questions when it starts behaving badly, and you cannot rebuild it. That is the same position as running a binary in production with no idea which commit produced it.

## Reproducibility Means Pinning Everything

Reproducibility in machine learning is harder than in ordinary software, and it is worth being honest about how far you can actually get.

Random seeds must be set for every source of randomness: data shuffling, weight initialisation, dropout, augmentation. Setting one library's seed and assuming that covers it is a common mistake.

Environments must be pinned exactly, and that means the container image by digest rather than by tag, because a tag is a moving pointer.

Hardware nondeterminism is the part you cannot fully eliminate. Some accelerator operations are nondeterministic by default because the fast implementations use nondeterministic reduction orders. Most frameworks offer a deterministic mode, and it is usually slower, sometimes considerably. That is a real tradeoff and I would make it deliberately: deterministic for anything whose result you need to defend, fast for exploration.

The standard I aim for is that the manifest lets someone rebuild a model that is functionally equivalent, and that every input is identified precisely. Bit for bit identical output is a stronger goal that is sometimes not worth what it costs.

## Deployment: Shadow, Canary, Rollback

The deployment patterns are the ones you already use, with one addition that is specific to this domain.

Shadow deployment sends real traffic to the new model in parallel with the current one, serves the old model's response to users, and logs both. This is the addition worth knowing about, because model quality is hard to assess from a test set and easy to assess from real traffic. You get a comparison on genuine inputs with zero user risk. It costs double inference for the shadow period, which is usually a bargain.

Canary and gradual rollout work exactly as they do elsewhere: a small share of traffic, watched, then expanded.

Rollback needs one specific property that people forget: keep the previous model artifact and its manifest available and loadable at all times. Rolling back should be a configuration change pointing at the previous version, not a retraining job. A rollback that requires retraining is not a rollback.

The failure mode unique to this domain is that a bad model does not crash. It returns confident, plausible, wrong answers with normal latency and a normal error rate. Every conventional health check passes. This is why the monitoring has to be different.

## Monitoring a Thing That Degrades Quietly

Service level monitoring, meaning latency, error rate, throughput, and saturation, is necessary and completely insufficient. It tells you the model is responding. It says nothing about whether the responses are any good.

Three additional things are worth tracking.

Prediction distribution. Track the distribution of outputs over time. If a classifier that normally predicts one class 20 percent of the time suddenly predicts it 60 percent of the time, something changed, and you want to know that before a user reports it.

Input distribution. Compare live input features against the training distribution. Drift here is the leading indicator, because it usually precedes the quality drop rather than following it.

Ground truth, whenever you can get it. Sometimes labels arrive naturally with a delay: the ticket eventually gets categorised by a human, the flagged transaction is eventually confirmed or not. Capturing those delayed labels and computing real accuracy on a rolling window is the only direct measure of whether the model still works.

When no ground truth is available, proxy signals help: how often users override the model, how often they rephrase and retry, how often a downstream process rejects the output.

## What I Would Tell an Infrastructure Person

You already have most of this. Version control, artifact registries, immutable infrastructure, progressive delivery, and observability are the same tools with different payloads.

Focus on the parts that are genuinely different: version the data as carefully as you version the code, keep a manifest that ties all three artifacts together, and build monitoring that can detect silent quality degradation rather than only detecting outages. Those three habits cover most of what separates a machine learning system that can be operated from one that merely runs.

## References

- [MLOps](https://en.wikipedia.org/wiki/MLOps)
- [MLflow documentation](https://mlflow.org/docs/latest/index.html)
- [DVC documentation](https://dvc.org/doc)
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/)
- [Concept drift](https://en.wikipedia.org/wiki/Concept_drift)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
