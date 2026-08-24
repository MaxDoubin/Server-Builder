/**
 * Attribution for a cover image sourced from someone else.
 *
 * Every licence we accept for third-party covers (CC BY, CC BY-SA) requires
 * credit and a link to the licence, so this travels with the post and is
 * rendered next to the image. Posts using original artwork omit it.
 */
export interface CoverCredit {
  /** Author as named by the source, plain text. */
  author: string;
  /** Human-readable licence, e.g. "CC BY-SA 4.0". */
  license: string;
  /** Canonical licence deed. */
  licenseUrl: string;
  /** The file's description page at the source. */
  sourceUrl: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  coverImage: string;
  coverCredit?: CoverCredit;
  draft?: boolean;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "running-llms-locally-hardware",
    title: "What Running a Model Locally Asks of Your Hardware",
    date: "2026-05-14",
    tags: ["ai", "hardware", "homelab"],
    excerpt:
      "Local inference is not a mystery box. It comes down to memory capacity, memory bandwidth, and compute, and one of those three is almost always your bottleneck.",
    coverImage: "/images/blog/running-llms-locally-hardware.jpg",
    coverCredit: {
      author: "viagallery.com",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/15932083@N05/3594287535",
    },
    content: `
## Why run a model on your own gear

I run models locally for the same reason I run my own DNS and my own hypervisor: I learn more when I own the failure. A hosted endpoint hides the interesting part. When the tokens come out slowly on my own box, I can go find out exactly why, and that answer turns out to be a hardware lesson, not a machine learning lesson.

This post is the mental model I use before I try to run anything. It is deliberately vendor neutral, because the arithmetic does not care whose logo is on the card.

## The three numbers that decide everything

Every local inference question reduces to three quantities.

**Memory capacity** decides whether the model runs at all. Weights have to live somewhere the accelerator can reach. If they do not fit, you either spill to system RAM or you do not run.

**Memory bandwidth** decides how fast a single stream of tokens comes out. This is the one people miss. Generating one token requires reading essentially the whole active weight set once. So the ceiling on tokens per second is bandwidth divided by the bytes you have to read, not the raw FLOPs on the spec sheet.

**Compute throughput** decides prefill speed and batch throughput. Processing a long prompt is a big matrix multiply and it is genuinely compute bound. Generating token 1,001 is not.

That split is why a machine can chew through a 20,000 token prompt quickly and then dribble out the response. Two different bottlenecks, one after the other.

## Doing the arithmetic before you buy anything

Here is the estimate I run first. It is rough on purpose, but it gets you inside a factor of two, which is enough to reject bad plans.

\`\`\`python
GIB = 1024 ** 3

def weight_bytes(params_billions, bits):
    # Bytes of weights at a given quantization level.
    return params_billions * 1e9 * (bits / 8)

def decode_ceiling(params_billions, bits, bandwidth_gb_s, efficiency=0.7):
    # Upper bound on single-stream tokens/sec. Memory bound, not FLOP bound.
    gb_read_per_token = weight_bytes(params_billions, bits) / 1e9
    return (bandwidth_gb_s * efficiency) / gb_read_per_token

for bits in (16, 8, 4):
    size = weight_bytes(8, bits) / GIB
    for bw in (100, 400, 900):
        print(f"8B @ {bits:2d}-bit  {size:5.1f} GiB  "
              f"{bw:3d} GB/s -> ~{decode_ceiling(8, bits, bw):5.1f} tok/s")
\`\`\`

Two things fall out of this immediately. First, a system with lots of slow memory will load a big model and then generate at a speed you will hate. Second, halving the bit width roughly doubles your ceiling, because you halved the bytes read per token.

## Quantization is a memory trick first

People talk about quantization as a quality tradeoff, which it is, but operationally it is a bandwidth trick. Going from 16 bit to 8 bit weights halves the footprint and halves the bytes read per token. Going to 4 bit halves it again.

The quality cost is not linear and it is not uniform across models. Some layers tolerate aggressive quantization and some do not, which is why modern quantization schemes keep certain tensors at higher precision and why calibration data matters. My rule: quantize until the outputs stop being useful for my actual task, measured on my own prompts, not on somebody else's leaderboard.

Note that the KV cache is separate from the weights and often is not quantized by default. On long contexts it can rival the weights for memory. That deserves its own post.

## CPU, accelerator, and the unified memory middle

Three shapes of machine, three profiles.

A CPU with several memory channels gives you a lot of capacity for very little money and comparatively little bandwidth. It will run large models. It will run them slowly, and adding cores past a point does nothing because you are waiting on DRAM, not on arithmetic.

A discrete accelerator gives you an order of magnitude more bandwidth in a much smaller capacity envelope. This is the right shape for interactive use, right up until the model does not fit, at which point the offloaded layers drag the whole thing down to system memory speed.

Unified memory designs sit in between: capacity closer to a CPU, bandwidth well above DDR but below a high end discrete card. They are genuinely useful for large models at modest speeds.

## The checks I run, and what they change

Before I blame software, I confirm what the hardware is doing.

\`\`\`bash
# Memory geometry: channels, speed, and populated slots drive bandwidth
sudo dmidecode -t memory | grep -E 'Size:|Speed:|Locator:' | grep -v 'No Module'

# CPU cache and core topology
lscpu | grep -E 'Model name|Socket|Core|Thread|NUMA'

# Free system memory, minus the cache lie
free -g

# If there is an accelerator, confirm it is on the bus at full width
sudo lspci -vv | grep -A2 -E 'VGA|3D controller' | grep -E 'LnkSta|LnkCap'
\`\`\`

That last one has caught me more than once. A card negotiating a narrower link than it advertises turns a bandwidth problem into a mystery until you look.

All of which changes how I plan. I stopped asking "can I run this model" and started asking "at what precision, at what context length, and at what tokens per second do I stop caring." Those three answers pick the hardware for you. Everything else is tuning.

## References

- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
`,
  },
  {
    slug: "pcie-lanes-bandwidth-servers",
    title: "PCIe Lanes Are the Budget Nobody Checks",
    date: "2026-05-15",
    tags: ["hardware", "servers", "homelab"],
    excerpt:
      "Slots are physical, lanes are a budget, and the two do not always match. How to figure out what your cards actually negotiated and why it matters.",
    coverImage: "/images/blog/pcie-lanes-bandwidth-servers.jpg",
    coverCredit: {
      author: "instaSHINOBI",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/21050065@N06/6114414289",
    },
    content: `
## The mistake I keep seeing

Someone buys a fast NIC and a fast NVMe drive, installs both, and gets maybe half the throughput they expected. The cards are fine. The cables are fine. What went wrong is that a server has a finite number of PCI Express lanes, they come from specific places, and a slot that is physically x16 is not necessarily wired x16 or fed x16.

Lanes are a budget. Nobody checks the budget.

## What a lane is worth

A PCIe lane is a differential pair in each direction. Per lane, per direction, the approximate usable bandwidth is:

- Gen 3: about 1 GB/s
- Gen 4: about 2 GB/s
- Gen 5: about 4 GB/s

Multiply by the negotiated width. A Gen 3 x8 link is roughly 8 GB/s each way. A Gen 4 x4 link is also roughly 8 GB/s each way. Same bandwidth, half the lanes, which is exactly why newer generations let you do more with less physical wiring.

Now convert to the units the rest of your stack uses. A 100 gigabit NIC needs about 12.5 GB/s each way at line rate. That does not fit in Gen 3 x8. It fits in Gen 3 x16 or Gen 4 x8. If you put that NIC in a Gen 3 x8 slot it will link up, it will pass traffic, and it will quietly cap out well below line rate.

## Where lanes come from

Two sources, and they are not equal.

**CPU lanes** come straight off the processor's root complex. These are the good ones: direct, uncontended, full bandwidth to memory.

**Chipset lanes** hang off a southbridge or platform controller that itself connects to the CPU over a single uplink. Every device behind the chipset shares that uplink. Three NVMe drives on chipset lanes can saturate the uplink and starve each other, and nothing in the topology tells you that unless you go looking.

**Switch chips** on carrier boards and some server backplanes fan a small number of upstream lanes into many downstream ports. That is oversubscription, same idea as a network access switch. Fine for drives with bursty access, bad for anything that wants sustained line rate simultaneously.

## Bifurcation

Bifurcation is the firmware splitting one x16 slot into independent links, typically x8/x8 or x4/x4/x4/x4. Passive carrier cards that hold multiple NVMe drives depend on it entirely: without bifurcation support in firmware, only the first drive appears. Carrier cards with an onboard switch chip do not need bifurcation but add cost, heat, and a shared upstream link.

Before buying a multi drive carrier, check the board's manual for the bifurcation options per slot. It is a firmware capability, not something you can add later.

## Reading the truth on Linux

The device tells you what it can do and what it actually got. Compare \`LnkCap\` against \`LnkSta\`.

\`\`\`bash
#!/usr/bin/env bash
# Compare PCIe link capability against negotiated status for every device.
lspci -D | awk '{print $1}' | while read -r dev; do
  vv=$(sudo lspci -s "$dev" -vv 2>/dev/null)
  cap=$(printf '%s\\n' "$vv" | grep -m1 'LnkCap:' \\
        | sed -n 's/.*Speed \\([^,]*\\), Width \\(x[0-9]*\\).*/\\1 \\2/p')
  sta=$(printf '%s\\n' "$vv" | grep -m1 'LnkSta:' \\
        | sed -n 's/.*Speed \\([^,]*\\), Width \\(x[0-9]*\\).*/\\1 \\2/p')
  [ -z "$cap" ] && continue
  name=$(lspci -s "$dev" | cut -d' ' -f2-)
  if [ "$cap" != "$sta" ]; then
    printf 'DOWNGRADED %s  cap=%-14s sta=%-14s %s\\n' "$dev" "$cap" "$sta" "$name"
  fi
done
\`\`\`

Anything printed by that script is a device running below its own capability. Sometimes that is correct and intentional, for example a Gen 4 card in a Gen 3 slot. Sometimes it is a card that is not seated properly, a riser that is only wired for half the lanes, or aggressive link power management downshifting the link at idle.

To see the topology, including what sits behind which bridge:

\`\`\`bash
lspci -tvPP
\`\`\`

That tree view is how you spot three drives sharing one upstream port.

## The rules I follow

Plan lanes before you plan cards. Write down every device, the width and generation it wants, and where those lanes come from. If the total exceeds what the CPU provides, decide deliberately what goes behind the chipset rather than discovering it later.

Put the bandwidth hungry, latency sensitive devices on CPU lanes. That is usually the primary NIC and the storage that backs your VMs. Put the management NIC, the boot device, and anything bursty behind the chipset.

Check the slot table in the board manual, not the physical connector. Open ended and mechanically x16 slots that are electrically x4 are common and completely legitimate.

Re-verify after every hardware change. A reseat, a firmware update, or a new riser can silently change a negotiated width, and the symptom is always "it got slower and nobody knows why."

## References

- [PCI Express on Wikipedia](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [PCI-SIG specifications](https://pcisig.com/specifications)
- [NVM Express specifications](https://nvmexpress.org/specifications/)
`,
  },
  {
    slug: "gpu-memory-math-inference",
    title: "Doing the VRAM Math Before You Buy the Accelerator",
    date: "2026-05-16",
    tags: ["ai", "hardware", "ml"],
    excerpt:
      "Weights are the part everyone budgets for. The KV cache is the part that blows the budget. Here is the arithmetic I do first.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Three consumers, not one

Accelerator memory during inference gets eaten by three things, and only one of them is on the model card.

1. **Weights.** Parameter count times bytes per parameter. Predictable, static, easy.
2. **The KV cache.** Grows with context length and with concurrency. This is the one that surprises people.
3. **Everything else.** Runtime context, activation buffers for the current forward pass, workspace for the attention kernels, and allocator fragmentation. Budget headroom for it rather than trying to compute it exactly.

If you only budget for item one, you will build a machine that loads the model and then falls over the first time somebody pastes in a long document.

## The KV cache formula

During generation, the model caches the key and value projections for every token it has already seen, for every layer, so it does not have to recompute them. That cache is linear in sequence length and linear in batch size.

\`\`\`python
def kv_cache_bytes(layers, kv_heads, head_dim, seq_len, batch=1, dtype_bytes=2):
    # Two tensors (K and V) per layer, per KV head, per token.
    # kv_heads is the number of key/value heads, which under grouped-query
    # attention is smaller than the number of query heads.
    return 2 * layers * kv_heads * head_dim * seq_len * batch * dtype_bytes


def report(name, layers, kv_heads, head_dim, params_b, weight_bits):
    gib = 1024 ** 3
    weights = params_b * 1e9 * weight_bits / 8 / gib
    print(f"{name}: weights {weights:.1f} GiB @ {weight_bits}-bit")
    for ctx in (4096, 16384, 65536):
        for batch in (1, 8, 32):
            kv = kv_cache_bytes(layers, kv_heads, head_dim, ctx, batch) / gib
            print(f"   ctx={ctx:6d} batch={batch:3d}  KV {kv:8.2f} GiB  "
                  f"total ~{weights + kv:8.2f} GiB")

# Hypothetical mid-size model: 32 layers, 8 KV heads, head_dim 128
report("example-8B", layers=32, kv_heads=8, head_dim=128,
       params_b=8, weight_bits=4)
\`\`\`

Run that and watch what happens. The weights stay put. The KV cache goes from a rounding error at short context and batch one to larger than the weights themselves at long context with real concurrency.

Grouped-query attention is the reason modern models are tolerable here. Sharing key and value heads across multiple query heads cuts the cache by the grouping factor directly. When you are comparing two models of similar size, the KV head count is a more important operational number than the parameter count.

## Concurrency is a memory decision

This is the part that trips up people coming from web services. In a normal API you scale concurrency with CPU and connection limits. In an inference server, each concurrent request holds its own KV cache for as long as it is generating. Concurrency is bought with memory.

That means your maximum batch size is not a throughput tuning parameter you can set freely. It is bounded by:

\`\`\`
usable_memory - weights - runtime_overhead >= batch * per_request_kv
\`\`\`

And per request KV depends on how long that request's context gets. A serving stack that assumes worst case context for every slot will admit far fewer requests than one that allocates cache in pages as the sequence grows, which is exactly why paged attention style allocators matter: they cut the waste from over provisioning, they do not change the underlying arithmetic.

## The order I turn the knobs

When a configuration does not fit, I work through these in order, cheapest quality cost first.

**Cap the context length.** Most workloads do not need the maximum the model supports. Setting a realistic ceiling is free and it is the single biggest lever.

**Quantize the KV cache.** Going from 16 bit to 8 bit cache halves the biggest variable term. Quality impact is usually smaller than quantizing the weights by the same amount.

**Lower the batch ceiling.** Costs throughput, not quality. Fine if your workload is latency sensitive and low concurrency anyway.

**Quantize the weights.** Real quality tradeoff, measure it on your own prompts.

**Shard across devices.** Tensor parallelism splits weights and cache across accelerators but adds interconnect traffic on every layer, so it wants a fast link between them.

**Offload layers to system memory.** Last resort. It works, and it drops you to system memory bandwidth for the offloaded portion, which you will feel on every single token.

## Leave headroom on purpose

I plan to about 85 percent of physical memory, not 100. Allocator fragmentation is real, kernel workspaces vary with sequence length, and an out of memory error mid generation takes down the request that triggered it plus, depending on the server, the ones sharing the batch. The last 15 percent buys you a service that degrades instead of crashing.

Measure the real thing once it is running. Steady state memory after a load test tells you more than any formula, and the formula's job is only to stop you from buying the wrong hardware.

## References

- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
`,
  },
  {
    slug: "jumbo-frames-path-mtu",
    title: "Jumbo Frames, MTU, and the Ping That Tells the Truth",
    date: "2026-05-17",
    tags: ["networking", "storage", "operations"],
    excerpt:
      "Jumbo frames are easy to enable and easy to half enable. One device left at the default turns a performance tweak into an intermittent outage.",
    coverImage: "/images/blog/jumbo-frames-path-mtu.jpg",
    coverCredit: {
      author: "sampsyo",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/48889110751@N01/8271860",
    },
    content: `
## MTU in one paragraph

The maximum transmission unit is the largest payload a link will carry in a single frame. Classic Ethernet is 1500 bytes. Anything larger has to be fragmented by the sender, or dropped with a notification, or dropped silently. Which of those three happens is the entire subject of this post.

Jumbo frames raise that number, commonly to 9000 bytes. The benefit is fewer frames for the same bytes: fewer interrupts, fewer header overheads, less per packet processing. For bulk transfer paths like storage replication and backups, it is a real if modest win. For general user traffic it is close to noise.

## Why it goes wrong

Enabling jumbo frames means every device in the path has to agree. Every switch, every router hop inside the segment, both hosts, and both virtual switches if hypervisors are involved. Miss one and you get the worst possible failure mode: small packets work perfectly, so ping succeeds, SSH succeeds, the web UI loads, and then any large transfer stalls.

That asymmetry is what makes it maddening. Every basic test passes. The thing that fails is a bulk copy that hangs at a random percentage.

## Proving it with ping

The test is a ping with the do-not-fragment bit set and an explicit payload size. On Linux:

\`\`\`bash
# 8972 payload + 8 ICMP header + 20 IPv4 header = 9000 byte frame payload
ping -M do -s 8972 -c 3 10.20.30.40

# Confirm the standard size works, to prove the host is reachable at all
ping -M do -s 1472 -c 3 10.20.30.40

# Binary search the actual usable size when the above fails
for size in 1472 2972 4472 5972 7972 8972; do
  if ping -M do -s "$size" -c 1 -W 1 10.20.30.40 >/dev/null 2>&1; then
    echo "OK    payload=$size  frame=$((size + 28))"
  else
    echo "FAIL  payload=$size  frame=$((size + 28))"
  fi
done
\`\`\`

The largest size that succeeds, plus 28, is your real path MTU for IPv4. Remember the arithmetic: the \`-s\` value is the ICMP payload, and you add 8 bytes of ICMP header and 20 bytes of IPv4 header to get the IP packet size.

Check the interface side too:

\`\`\`bash
ip -br link show          # MTU column per interface
ip route get 10.20.30.40  # route-specific MTU, if one is pinned
ethtool eth0 | grep -i speed
\`\`\`

## Path MTU discovery and the ICMP you must not block

When a router receives a packet too large for the next hop with the do-not-fragment bit set, it is supposed to drop the packet and return an ICMP message: destination unreachable, fragmentation needed. The sender learns the smaller MTU and adjusts.

That mechanism only works if the ICMP message gets back. A firewall that blocks ICMP wholesale creates a path MTU discovery black hole. The sender never learns, keeps retransmitting oversized packets, and the connection hangs rather than failing cleanly.

If you take one operational rule from this post: do not blanket block ICMP. Filter deliberately, and always permit fragmentation needed messages inbound. The IPv6 equivalent matters even more, because IPv6 routers do not fragment at all and rely entirely on the packet too big message.

There is also a packetization layer approach that probes for the working size at the transport layer instead of trusting ICMP, which is what saves you on networks you do not control. Good to know it exists, not a reason to keep blocking ICMP on networks you do.

## MSS clamping for tunnels

Any encapsulation, a VPN, a GRE tunnel, an overlay, eats bytes from the payload. Hosts inside do not know. The standard fix is to rewrite the TCP maximum segment size during the handshake so both ends negotiate something that actually fits:

\`\`\`bash
# On the tunnel endpoint, clamp MSS to whatever the path can carry
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \\
  -j TCPMSS --clamp-mss-to-pmtu
\`\`\`

This only helps TCP. UDP based protocols have to handle it themselves, which is one reason modern UDP transports do their own path probing.

## How I decide whether to bother

I enable jumbo frames on segments where I control every device and the traffic is bulk: storage networks, backup targets, replication links, hypervisor migration networks. Those are isolated VLANs with a known device list, so the "every device must agree" requirement is actually checkable.

I leave general purpose and client VLANs at 1500. The gain is small, the blast radius of one misconfigured device is large, and client devices come and go without asking me.

And whatever I choose, I document the MTU in the VLAN table next to the subnet and the gateway. An undocumented MTU is a trap you set for yourself six months out.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [ping(8) manual page](https://man7.org/linux/man-pages/man8/ping.8.html)
- [Maximum transmission unit on Wikipedia](https://en.wikipedia.org/wiki/Maximum_transmission_unit)
`,
  },
  {
    slug: "training-vs-inference-profiles",
    title: "Training and Inference Want Different Machines",
    date: "2026-05-18",
    tags: ["ai", "ml", "servers"],
    excerpt:
      "The same model has two completely different infrastructure profiles depending on whether you are teaching it or asking it. Memory, interconnect, and storage all change.",
    coverImage: "/images/blog/training-vs-inference-profiles.jpg",
    coverCredit: {
      author: "NeoSpire",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/39131599@N06/3594831417",
    },
    content: `
## Same model, two different problems

People say "AI hardware" as if it is one category. It is two. A machine built to train a model and a machine built to serve one have different memory profiles, different network requirements, different storage patterns, and different failure modes. Buying one when you need the other is an expensive mistake.

Here is how I separate them.

## What training holds in memory

Inference needs the weights. Training needs the weights plus everything required to compute and apply an update.

- The parameters themselves.
- A gradient for every parameter.
- Optimizer state. Adam style optimizers keep two running moments per parameter.
- Saved activations from the forward pass, because the backward pass needs them.
- Often a higher precision master copy of the weights for the update step.

\`\`\`python
GIB = 1024 ** 3

def training_state_gib(params_b, param_bytes=2, grad_bytes=2,
                       master_bytes=4, moment_bytes=8):
    # A common mixed-precision layout: bf16 params and grads, fp32 master
    # weights, fp32 first and second moments. Exact numbers vary by
    # optimizer and framework, so treat this as an order-of-magnitude tool.
    per_param = param_bytes + grad_bytes + master_bytes + moment_bytes
    return params_b * 1e9 * per_param / GIB

def inference_gib(params_b, weight_bits=16):
    return params_b * 1e9 * weight_bits / 8 / GIB

for p in (1, 7, 13, 70):
    print(f"{p:3d}B params: inference(16-bit) {inference_gib(p):7.1f} GiB   "
          f"training state {training_state_gib(p):7.1f} GiB")
\`\`\`

The ratio is the point. Before you have stored a single activation, training state is several times the inference footprint. Add activations, which scale with batch size and sequence length, and the gap widens further. Activation checkpointing trades compute for memory to claw some of it back, and that tradeoff is one of the main tuning dials in training.

## Interconnect is where they truly diverge

This is the difference that costs money.

Data parallel training synchronizes gradients across all workers every step. That is an all-reduce over a tensor the size of the model, at every step, for the entire run. The interconnect is in the critical path of every iteration, so a slow link does not just reduce throughput a little, it can dominate the step time entirely. This is why training clusters use specialized high bandwidth fabrics between accelerators and why topology and placement matter so much.

Inference replicas, by contrast, are usually independent. Each one holds the full model and answers requests on its own. They talk to a load balancer, not to each other. Ordinary datacenter networking is completely adequate.

The exception is a model too large for one device, where tensor parallelism splits each layer across accelerators. Now there is a collective operation inside every forward pass and the interconnect matters again, though the volume is smaller than a gradient all-reduce.

Practical rule: independent inference replicas run fine on a normal network. Anything that shards a single model, training or serving, wants the fastest link you can put between those devices.

## Storage and the data pipeline

Training is read heavy and sustained. It wants high throughput sequential reads, and it wants them shuffled, which is exactly the access pattern that punishes naive storage layouts. Storing a dataset as millions of individual small files makes the filesystem the bottleneck. Packing into large sharded archives read sequentially with a shuffle buffer fixes it. Training also writes checkpoints periodically, which is a large bursty write that can stall the whole job if the storage cannot absorb it.

Inference reads the model once at startup and then essentially nothing. The storage question becomes cold start time: how fast can a new replica load weights and become ready. That matters for autoscaling and for rolling restarts, and it is a completely different requirement than dataset throughput.

## Utilization and thermals

A training run is a long, steady, near constant load. Every accelerator is busy, drawing near peak power, for hours or days. That is a sustained thermal and power problem, and the practical consequence is that your cooling and your power delivery need to handle the steady state, not the average.

Inference is spiky and latency sensitive. You provision headroom you deliberately do not use, because using it would blow your tail latency. A serving fleet running at 90 percent utilization is a serving fleet about to miss its latency target.

Also: training tolerates interruption if you checkpoint. Inference does not tolerate interruption at all, because there is a user waiting. That single difference reshapes how you do maintenance on each.

## How I would size each

For a training box, I would prioritize accelerator memory capacity first, interconnect between accelerators second, and dataset read throughput third. Core count on the host CPU matters mostly for data loading and preprocessing, which is a real bottleneck people underestimate.

For a serving box, I would prioritize memory bandwidth first, memory capacity second (enough for weights plus your worst case KV cache), and then boring reliability: redundant power, health checks, and the ability to drain a node without dropping requests.

Most homelabs and most small teams are doing inference, occasionally fine tuning something small. Build for that, and rent the training machine on the rare occasions you genuinely need one.

## References

- [PyTorch documentation](https://pytorch.org/docs/stable/index.html)
- [PyTorch distributed overview](https://pytorch.org/docs/stable/distributed.html)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
`,
  },
  {
    slug: "threat-modeling-a-project",
    title: "Threat Modeling Without a Whiteboard Full of Buzzwords",
    date: "2026-05-19",
    tags: ["security", "cybersecurity", "learning"],
    excerpt:
      "Threat modeling is four questions and a drawing. Here is the lightweight version I run on my own projects before I write the first line of code.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Four questions

Every threat modeling framework I have read boils down to the same four questions:

1. What are we building?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good job?

Everything else is scaffolding to help you answer those honestly. You do not need a tool, a license, or a two day workshop. You need a drawing and about an hour.

## Question one: draw the data flow

Not an architecture diagram. A data flow diagram. The difference matters: an architecture diagram shows boxes you own, a data flow diagram shows data moving between them, and attacks happen to data in motion and at rest.

Draw four kinds of thing:

- **External entities**: users, third party APIs, anything you do not control.
- **Processes**: your services, your scripts, your jobs.
- **Data stores**: databases, object storage, log files, that config file with the token in it.
- **Data flows**: arrows, labeled with what is actually traveling and over what protocol.

If you cannot label an arrow, you do not understand your own system yet. That discovery alone justifies the exercise.

## Question two: trust boundaries and the STRIDE prompt list

A trust boundary is any line where data crosses from something you trust less to something you trust more. Browser to server. Internet to DMZ. DMZ to internal VLAN. Unprivileged process to privileged daemon. Third party API response into your parser.

Draw those boundaries on the diagram as dashed lines. Now here is the useful part: almost every interesting vulnerability lives on a boundary crossing. If you are short on time, ignore everything else and interrogate the crossings.

For each crossing ask: what does the receiving side assume about this data, and what happens if that assumption is false?

Then walk the crossing through STRIDE, which is a mnemonic for six categories of thing that go wrong. I use it as a checklist against each element of the diagram, not as a taxonomy to argue about.

- **Spoofing**: can someone claim to be someone else? (authentication)
- **Tampering**: can data be modified in flight or at rest? (integrity)
- **Repudiation**: can someone deny doing it? (logging)
- **Information disclosure**: can data leak? (confidentiality)
- **Denial of service**: can someone make it unavailable? (availability)
- **Elevation of privilege**: can someone do more than they should? (authorization)

Walk each box and arrow and ask all six. Most will not apply. The ones that do will surprise you, and it takes ten minutes.

## Question three: rank by loss, not by cleverness

New security students, myself very much included at the start, rank threats by how cool the attack is. That is backwards. Rank by what you actually lose.

I score two axes crudely: impact if it happens, and how hard it is to pull off. High impact and easy gets fixed now. High impact and hard gets a documented mitigation and a note. Low impact and easy gets fixed if it is cheap. Low impact and hard gets written down and explicitly accepted.

That last category matters. Writing "we accept this risk, here is why" is a legitimate outcome. Silently ignoring it is not.

## Write it down where it will be read

I keep the model in the repo, next to the code, in version control. It changes when the code changes, and the diff shows up in review.

\`\`\`yaml
# threat-model.yml
system: internal metrics dashboard
last_reviewed: 2026-05-19

boundaries:
  - name: internet-to-dmz
    from: untrusted browser
    to: reverse proxy
  - name: app-to-db
    from: dashboard service
    to: metrics database

threats:
  - id: T-001
    boundary: internet-to-dmz
    category: spoofing
    description: >
      Session cookie is accepted without binding to any client property,
      so a stolen cookie is a full account takeover.
    impact: high
    difficulty: low
    status: mitigated
    mitigation: >
      Short session lifetime, Secure and HttpOnly and SameSite=Lax flags,
      rotation on privilege change.

  - id: T-002
    boundary: app-to-db
    category: elevation_of_privilege
    description: >
      Dashboard service connects with a database account that can write
      and drop tables, but the dashboard only ever reads.
    impact: high
    difficulty: medium
    status: mitigated
    mitigation: read-only database role, verified in CI

  - id: T-003
    boundary: internet-to-dmz
    category: denial_of_service
    description: Expensive aggregate query reachable with no rate limit.
    impact: medium
    difficulty: low
    status: accepted
    rationale: >
      Internal-only exposure behind VPN, query timeout capped at 5s.
      Revisit if this is ever published externally.
\`\`\`

## Question four: did we do a good job?

Check two things later. Did the mitigations actually get built, and do they actually work? A mitigation listed in a YAML file and never implemented is worse than no mitigation, because it stops you from worrying about a threat that is still live.

The version I run on a school project takes under an hour and it consistently finds one thing I would otherwise have shipped. That is a good return on an hour.

## References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [Threat model on Wikipedia](https://en.wikipedia.org/wiki/Threat_model)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
`,
  },
  {
    slug: "vector-databases-infrastructure",
    title: "Vector Databases From the Operations Side",
    date: "2026-05-20",
    tags: ["ai", "storage", "ml"],
    excerpt:
      "Forget the marketing. A vector database is an index with a memory footprint, a build cost, and a recall dial you have to measure yourself.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What is actually being stored

Strip away the branding and a vector database holds a big array of fixed length float arrays, plus an index structure that lets you find the nearest ones to a query vector without comparing against all of them, plus usually some metadata you want to filter on.

That is it. Every operational property follows from those three parts: the raw vectors are your baseline memory cost, the index is your speed and your overhead, and the metadata filtering is where most real world designs get complicated.

## Three index families and their profiles

**Flat, or brute force.** Compare the query against every vector. Exact results, zero index build time, memory is just the vectors. Latency grows linearly with collection size. This is genuinely the right answer below roughly a hundred thousand vectors, and people skip past it far too fast.

**Inverted file, or IVF.** Cluster the vectors, then search only the clusters nearest the query. One knob controls how many clusters you probe, trading recall for speed. Modest memory overhead. Needs a training step on a representative sample, and the clustering degrades if your data distribution shifts substantially after training.

**Graph based, typically HNSW.** Build a navigable graph where each vector links to neighbors, then greedily walk it. Excellent latency and recall, which is why it is the default nearly everywhere. The costs: significant memory overhead for the graph edges, slow to build, and deletion is awkward because removing a node damages connectivity. Most implementations tombstone deletes and reclaim on a rebuild.

## Sizing memory honestly

\`\`\`python
GIB = 1024 ** 3

def index_gib(n_vectors, dim, dtype_bytes=4, graph_neighbors=None):
    raw = n_vectors * dim * dtype_bytes
    overhead = 0
    if graph_neighbors:
        # Each node stores neighbor ids (4 bytes each) per layer; the
        # base layer dominates and holds roughly 2x the configured M.
        overhead = n_vectors * graph_neighbors * 2 * 4
    return (raw + overhead) / GIB

for n in (100_000, 1_000_000, 10_000_000):
    flat = index_gib(n, 768)
    hnsw = index_gib(n, 768, graph_neighbors=32)
    half = index_gib(n, 768, dtype_bytes=2, graph_neighbors=32)
    print(f"{n:>10,} x 768d   flat {flat:6.2f} GiB   "
          f"hnsw {hnsw:6.2f} GiB   hnsw+fp16 {half:6.2f} GiB")
\`\`\`

Two levers jump out. Dimensionality is a direct multiplier, so a model producing shorter embeddings can halve your footprint before you tune anything. And storing vectors at reduced precision cuts the dominant term, usually with negligible recall impact, because approximate search is already approximate.

## Recall is a number you have to measure

This is the part I see skipped constantly. Approximate nearest neighbor search is approximate. You do not know how approximate until you measure it on your own data.

The method is simple: take a sample of real queries, compute exact nearest neighbors with brute force to get ground truth, then measure what fraction of the true top k your configured index returns. Sweep the speed knob and plot recall against latency. Pick a point deliberately.

Do this once per collection and again whenever the data distribution changes meaningfully. A recall number from someone else's benchmark on someone else's data tells you nothing about yours.

## The operational parts nobody writes about

**Rebuild time.** Know how long a full index rebuild takes before you need one at 2am. For graph indexes at scale this can be hours, and it is CPU bound.

**Deletes and updates.** An update is usually a delete plus an insert. Tombstoned deletes accumulate, memory does not come back, and recall drifts as the graph fills with dead nodes. Plan a periodic compaction and monitor the tombstone ratio.

**Persistence and restart.** Some engines memory map from disk and start fast. Others rebuild in memory on startup, which turns a routine restart into a long outage. Find out which yours does before you find out the hard way.

**Backups.** The embeddings are derived data. You can always regenerate them from source documents, but regenerating ten million embeddings costs real time and, if you use a hosted embedding API, real money. Back up the index, and separately keep the source documents plus a record of exactly which embedding model version produced the vectors. Mixing vectors from two model versions in one index silently ruins your results.

**Filtering.** This is the real architecture decision. Filtering before the search shrinks the candidate set but breaks the index structure. Filtering after the search is easy but can return almost nothing when the filter is selective. How your engine handles combined filter plus vector queries should drive your choice of engine more than any raw benchmark.

## Do you even need a separate system

If your vectors already live next to relational data you filter on, a vector extension in your existing database is often the better engineering decision. One system to back up, one to monitor, transactional consistency between the metadata and the vectors, and joins that work.

I would reach for a dedicated vector engine when the collection outgrows what the general purpose database handles comfortably, or when I need index features it does not offer. Not before. The operational cost of a second stateful system is real and it is paid every week.

## References

- [pgvector](https://github.com/pgvector/pgvector)
- [FAISS](https://github.com/facebookresearch/faiss)
- [FAISS wiki: guidelines to choose an index](https://github.com/facebookresearch/faiss/wiki)
- [Nearest neighbor search on Wikipedia](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
`,
  },
  {
    slug: "linux-page-cache-and-io",
    title: "The Page Cache Is Doing More Than You Think",
    date: "2026-05-21",
    tags: ["linux", "storage", "servers"],
    excerpt:
      "Half the performance mysteries I have chased on Linux servers came down to misreading memory, dirty page writeback, or double caching. Here is the model.",
    coverImage: "/images/blog/linux-page-cache-and-io.jpg",
    coverCredit: {
      author: "barnoid",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/50359335@N00/151529520",
    },
    content: `
## The output everyone misreads

Someone runs \`free -h\` on a server, sees almost no free memory, and panics. Then they add RAM, or worse, they start killing services.

The page cache is not wasted memory. Linux keeps recently read file data in RAM because unused RAM does nothing for you. That cache is instantly reclaimable when a process actually needs the memory. The column that answers "how much can I still allocate" is \`available\`, not \`free\`.

\`\`\`bash
free -h
#               total   used   free   shared  buff/cache   available
# Mem:           125Gi   38Gi  1.2Gi    1.1Gi        86Gi        84Gi
\`\`\`

Read that as: 38 GiB genuinely in use, 86 GiB holding cached file data, and about 84 GiB obtainable right now by a process that asks. A server in that state is healthy. A server with high \`used\` and low \`available\` is the one to worry about.

## The read path

When a process reads a file, the kernel checks the page cache first. Hit, and the data is a memcpy away. Miss, and it goes to the block device, stores the result in the cache, and hands it over.

The kernel also reads ahead: on a detected sequential pattern it pulls in more than you asked for, betting you will want the next chunk. This is why a sequential read of a large file is dramatically faster than random reads of the same total volume, even on flash.

You can see readahead and change it per device:

\`\`\`bash
blockdev --getra /dev/sda        # sectors of readahead
blockdev --setra 256 /dev/sda    # 128 KiB
\`\`\`

Raising it helps large sequential workloads like backups and media. Lowering it helps random small read workloads, where aggressive readahead is pure waste. Databases usually want it low, since they do their own caching and their own prefetching.

## The write path is where surprises live

Writes go into the page cache and are marked dirty. The write syscall returns as soon as it lands in memory. The kernel flushes dirty pages to the device later, in the background.

That is fast and it is a lie about durability, which is fine as long as you know it. The moment you actually need the data on stable storage, you call \`fsync\`, and that is where the real cost appears.

Two sets of knobs govern the flushing:

\`\`\`bash
# Percentages of available memory
sysctl vm.dirty_background_ratio   # start flushing in the background
sysctl vm.dirty_ratio              # block writers until flushed

# Or absolute byte thresholds, better on large-memory machines
sysctl vm.dirty_background_bytes
sysctl vm.dirty_bytes

sysctl vm.dirty_expire_centisecs   # age at which a page must be written
\`\`\`

The classic pathology: on a machine with a lot of RAM, the default ratio based thresholds allow an enormous pool of dirty pages to accumulate. Everything is fast, then the threshold is hit and every writer stalls at once while gigabytes flush to a device that cannot absorb them quickly. The symptom is periodic, seconds long, whole system freezes with no obvious trigger.

The fix is to set the byte based limits to something the storage can actually flush in a couple of seconds, so writeback is continuous rather than catastrophic.

## Watching it happen

\`\`\`bash
# Dirty and in-flight bytes, right now
grep -E '^(Dirty|Writeback|MemAvailable):' /proc/meminfo

# Blocks in and out per second, plus io wait
vmstat 1 10

# Per-device queue depth, utilization, and await
iostat -x 2

# Who is doing the writing
sudo iotop -oPa
\`\`\`

The number I watch first is \`Dirty\` in \`/proc/meminfo\` during the problem. If it climbs into the gigabytes before collapsing, you have found your stall. If \`iostat\` shows \`%util\` pinned at 100 with a large \`aqu-sz\` and rising \`await\`, the device is simply saturated and no amount of tuning fixes it.

## Direct I/O and double caching

Databases and some storage systems open files with \`O_DIRECT\` to bypass the page cache entirely. They do this because they maintain their own buffer pool and know their access patterns better than the kernel does. Caching the same data twice wastes memory and adds a copy.

The same argument applies one level up. ZFS keeps its own ARC, which is separate from the page cache, so on a ZFS system you are budgeting two caches and you need to cap the ARC deliberately rather than letting it and the page cache fight over the same RAM. Virtual machines create the same shape of problem: the guest caches, the host caches, and the same block sits in memory twice. Hypervisor cache mode settings exist exactly to control which layer is allowed to cache.

## The rules I follow

Do not tune anything until you have a measurement showing which path is the problem. Read stalls and write stalls have different fixes and identical complaints from users.

Set dirty limits in bytes, not percentages, on any machine with a lot of memory. Size them to roughly one or two seconds of your storage's real write throughput.

Pick one caching layer per data path and turn the others down. Double caching is invisible until you are short on memory, and then it is the whole problem.

And leave the page cache alone otherwise. Dropping caches to make \`free\` look nicer is a way to make your server slower for the next several minutes and learn nothing.

## References

- [Linux kernel: virtual memory sysctl documentation](https://docs.kernel.org/admin-guide/sysctl/vm.html)
- [proc(5) manual page](https://man7.org/linux/man-pages/man5/proc.5.html)
- [open(2) manual page, including O_DIRECT](https://man7.org/linux/man-pages/man2/open.2.html)
- [vmstat(8) manual page](https://man7.org/linux/man-pages/man8/vmstat.8.html)
- [Page cache on Wikipedia](https://en.wikipedia.org/wiki/Page_cache)
`,
  },
  {
    slug: "rag-pipeline-plumbing",
    title: "RAG Is Mostly Plumbing",
    date: "2026-05-22",
    tags: ["ai", "ml", "tools"],
    excerpt:
      "Retrieval augmented generation is a search system with a language model on the end. Almost every failure I have debugged was in the search half.",
    coverImage: "/images/blog/rag-pipeline-plumbing.jpg",
    coverCredit: {
      author: "Me in ME",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/12357841@N02/49215624152",
    },
    content: `
## The uncomfortable summary

Retrieval augmented generation gets discussed as a model technique. Operationally it is a search pipeline with a text generator bolted on at the end, and when it produces bad answers the model is usually not the reason. The retriever handed it the wrong passages, or the right passages got truncated out of the prompt, or the chunking destroyed the context the answer needed.

Debug it like a data pipeline, because that is what it is.

## Stage one: ingestion and chunking

Documents come in, text comes out, text gets split. Both halves are underestimated.

Extraction is where the silent damage happens. PDFs with two column layouts get read across the columns. Tables collapse into word soup. Headers and footers repeat on every page and pollute every chunk. Before tuning anything downstream, dump a hundred random extracted documents and read them. I have found more retrieval bugs there than anywhere else.

Chunking is a tradeoff with no universally right answer. Small chunks retrieve precisely but lose surrounding context. Large chunks carry context but dilute the embedding, so a chunk about ten topics matches none of them strongly. My defaults: split on structure first (headings, sections, paragraphs) rather than a fixed character count, keep chunks in the few hundred token range, overlap slightly so a sentence spanning a boundary survives, and always attach metadata: source document, section heading, position, and a stable identifier.

That metadata is not optional. It is how you cite, how you filter, and how you debug.

## Stage two: embedding is a batch job

Embedding is the least interesting stage and the easiest to get operationally wrong. Treat it as an ETL job: batched, resumable, idempotent, with the model version recorded alongside every vector.

That last point deserves emphasis. If you re-embed part of a collection with a different model version, you now have two incompatible geometries in one index and your similarity scores are meaningless across them. Store the model identifier with each vector and refuse to query across mismatches.

## Stage three: retrieval and reranking

Dense vector search is good at meaning and bad at exact tokens. Ask it for an error code, a part number, a specific function name, or a rare proper noun, and it will happily return semantically similar passages that do not contain the thing you asked for.

Keyword search has the opposite profile. So run both and fuse the results. Reciprocal rank fusion is the standard approach and it is about ten lines of code:

\`\`\`python
from collections import defaultdict

def reciprocal_rank_fusion(result_lists, k=60, top_n=20):
    # result_lists: list of ranked lists of chunk ids, best first.
    # k dampens the contribution of low-ranked items.
    scores = defaultdict(float)
    for ranked in result_lists:
        for rank, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] += 1.0 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)[:top_n]


dense = vector_index.search(query_embedding, top_k=50)   # list of ids
sparse = keyword_index.search(query_text, top_k=50)      # list of ids
candidates = reciprocal_rank_fusion([dense, sparse])
\`\`\`

It needs no score normalization between the two systems, which is exactly why it is so widely used.

Retrieval optimizes for recall over a large candidate set. Reranking optimizes for precision over a small one. A cross encoder that scores each query and passage pair jointly is far more accurate than comparing independent embeddings, and far too slow to run over a whole collection. So you retrieve fifty candidates cheaply and rerank them expensively down to five.

If your pipeline gets the right passage into the top fifty but not the top five, reranking is the single highest leverage addition you can make.

## Stage four: prompt assembly and the token budget

The final stage is a budget allocation problem, and it should be explicit code rather than string concatenation and hope.

\`\`\`python
def assemble(system_prompt, question, passages, budget_tokens, count_tokens):
    fixed = count_tokens(system_prompt) + count_tokens(question)
    remaining = budget_tokens - fixed - 512  # reserve room for the answer

    included, dropped = [], []
    for p in passages:                      # already reranked, best first
        cost = count_tokens(p.text) + 32    # citation header overhead
        if cost <= remaining:
            included.append(p)
            remaining -= cost
        else:
            dropped.append(p.id)

    context = "\\n\\n".join(
        f"[{i + 1}] source={p.source} section={p.section}\\n{p.text}"
        for i, p in enumerate(included)
    )
    return context, [p.id for p in included], dropped
\`\`\`

Log \`dropped\` every time. Silent truncation is the most common cause of "it knew this yesterday" reports, and without that log you will never see it.

## What to instrument

Log the query, the retrieved ids with scores at each stage, what survived assembly, what got dropped, and the token counts. When someone reports a bad answer, you should be able to replay exactly what the model was shown without guessing.

Then evaluate the retriever separately from the generator. Build a small set of questions with known correct source passages and measure whether retrieval found them at all. If recall at ten is poor, no amount of prompt engineering will save the answer, and you have saved yourself a week of tuning the wrong stage.

## References

- [pgvector](https://github.com/pgvector/pgvector)
- [FAISS](https://github.com/facebookresearch/faiss)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Apache Lucene documentation](https://lucene.apache.org/core/documentation.html)
`,
  },
  {
    slug: "systemd-units-that-behave",
    title: "Writing systemd Units That Behave",
    date: "2026-05-23",
    tags: ["linux", "operations", "automation"],
    excerpt:
      "A service that restarts forever, starts before the network, and runs as root is three unit file directives away from being fixed.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The unit file is a contract

Most self hosted services I see are wrapped in a systemd unit that was copied from a forum post, has \`Type=simple\`, \`Restart=always\`, runs as root, and orders itself after \`network.target\`. Every one of those four choices is probably wrong, and each has a real consequence.

A unit file is a contract with the init system: here is how to start me, here is how to know I am ready, here is what to do when I die, here is what I am allowed to touch. Fill it in properly once and you stop babysitting the service.

## Type= and Restart=, the two that matter most

\`Type=\` tells systemd when to consider the service started, which is what everything ordered after it waits on.

- \`simple\`: considered started the instant the process is forked. Almost always wrong for anything else that depends on it, because the process has not bound its socket yet.
- \`exec\`: started once the binary has actually been executed successfully. A strictly better default than \`simple\`.
- \`forking\`: for daemons that background themselves. Needs \`PIDFile=\`. Avoid writing new services this way.
- \`notify\`: the service tells systemd when it is ready via the notify socket. This is the correct answer if your software supports it.
- \`oneshot\`: runs to completion. Pair with \`RemainAfterExit=yes\` for setup tasks.

If a dependent service intermittently fails at boot but works fine when you start it by hand, this directive is where to look.

The other high value directive is the restart policy. \`Restart=always\` on a service with a config error gives you an infinite crash loop that fills the journal. Use \`on-failure\`, and set rate limits so systemd gives up and tells you instead of hammering forever.

\`\`\`ini
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
\`\`\`

That means: five failures in five minutes and the unit goes into a failed state and stays there. Which is what you want, because a service flapping silently is worse than a service that is clearly down.

## Ordering versus requirement

These are two independent things and conflating them causes most boot ordering bugs.

- \`After=\` and \`Before=\` control **order only**. They do not pull anything in.
- \`Wants=\` pulls a unit in but does not fail if it fails. The soft dependency.
- \`Requires=\` pulls it in and fails your unit if it fails. Note this still says nothing about order, so you nearly always want \`Requires=\` plus \`After=\` together.
- \`BindsTo=\` is \`Requires=\` plus: your unit stops if the other one stops later.

On networking specifically, \`network.target\` means "the network stack is being brought up", not "you have an IP address". If your service binds to a specific address at startup, you want \`network-online.target\`, and that target only works if the corresponding wait service is enabled.

## A unit I would actually ship

\`\`\`ini
# /etc/systemd/system/metrics-collector.service
[Unit]
Description=Metrics collector
Documentation=https://example.internal/runbooks/metrics-collector
Wants=network-online.target
After=network-online.target
Requires=postgresql.service
After=postgresql.service

[Service]
Type=exec
User=metrics
Group=metrics
WorkingDirectory=/opt/metrics-collector
EnvironmentFile=/etc/metrics-collector/env
ExecStart=/opt/metrics-collector/bin/collector --config /etc/metrics-collector/config.yml
ExecReload=/bin/kill -HUP $MAINPID

Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
TimeoutStopSec=30

# Sandboxing: cheap, effective, and almost nobody sets it
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
ReadWritePaths=/var/lib/metrics-collector

# Resource ceilings so one service cannot take the host down
MemoryMax=2G
TasksMax=256

[Install]
WantedBy=multi-user.target
\`\`\`

Those sandboxing directives are free security. \`ProtectSystem=strict\` makes the entire filesystem read only except what you list in \`ReadWritePaths=\`. \`SystemCallFilter=@system-service\` blocks whole categories of syscalls a normal daemon never needs.

Grade your work:

\`\`\`bash
systemd-analyze security metrics-collector.service
\`\`\`

It scores each unit and lists exactly which directive would improve it. It is the fastest security win available on a Linux box.

## Timers instead of cron

For anything scheduled that matters, timers beat cron: they log to the journal, they inherit all the sandboxing above, they can catch up on missed runs, and they will not stampede.

\`\`\`ini
# /etc/systemd/system/backup-verify.timer
[Unit]
Description=Verify backup integrity nightly

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=900
AccuracySec=1m

[Install]
WantedBy=timers.target
\`\`\`

\`Persistent=true\` runs the job on next boot if the machine was off at the scheduled time. \`RandomizedDelaySec\` spreads load so twenty machines do not all hit the backup target at 03:30:00 exactly.

Check schedules with \`systemctl list-timers --all\`, and test a calendar expression before trusting it with \`systemd-analyze calendar "*-*-* 03:30:00"\`.

## The habits that stick

Put a \`Documentation=\` line pointing at the runbook in every unit. Future you, at 3am, will follow that link.

Use drop ins rather than editing packaged units: \`systemctl edit foo.service\` creates an override that survives package upgrades.

Always run \`systemd-analyze verify\` on a new unit before enabling it, and always \`systemctl daemon-reload\` after editing. Half of "my change did nothing" is a forgotten reload.

## References

- [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.exec(5), sandboxing directives](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [systemd.unit(5), dependencies and ordering](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)
- [systemd.timer(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- [systemd.resource-control(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
`,
  },
  {
    slug: "llm-application-attack-surface",
    title: "The Attack Surface of an LLM Application",
    date: "2026-05-24",
    tags: ["security", "ai", "cybersecurity"],
    excerpt:
      "The model is not a security boundary. Once you accept that, the rest of securing an LLM app looks like ordinary input validation and least privilege.",
    coverImage: "/images/blog/llm-application-attack-surface.jpg",
    coverCredit: {
      author: "Visual Content",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/143601516@N03/29723649810",
    },
    content: `
## Start from the right premise

Here is the sentence that makes the rest of this straightforward: **the model is not a security boundary.**

A language model takes text and produces text. It cannot reliably distinguish instructions you wrote from instructions embedded in data it was handed, because at the token level there is no distinction. Any control that depends on the model choosing to obey your system prompt over attacker supplied text is a control you cannot rely on.

That is not a defeatist position. It just relocates the security work to where it belongs: the boundaries around the model.

## Prompt injection is a data flow problem

Direct prompt injection is a user typing "ignore your instructions". That is the boring case, and it mostly only harms the user themselves.

Indirect prompt injection is the real one. Your application retrieves a document, fetches a web page, reads an email, or parses a support ticket, and that content contains instructions. The model has no way to know that text is data rather than direction. Now attacker text is influencing an application that is authenticated as your user.

Draw the data flow. Every arrow that brings text from somewhere you do not control into the prompt is an injection vector. In most real systems there are more of these than people expect: file uploads, scraped pages, third party API responses, tool outputs, even the model's own prior turns after it has been influenced once.

## Tools turn text into actions

A model that only emits text into a chat window has limited blast radius. The moment you give it tools, generated text becomes function calls, and every tool is a capability an attacker may be able to reach by getting text into the context.

So treat the tool layer like an authorization layer, because it is one.

\`\`\`python
ALLOWED_TOOLS = {
    "search_docs":   {"side_effects": False, "confirm": False},
    "read_ticket":   {"side_effects": False, "confirm": False},
    "post_comment":  {"side_effects": True,  "confirm": True},
    "close_ticket":  {"side_effects": True,  "confirm": True},
}

def authorize(call, user, session):
    spec = ALLOWED_TOOLS.get(call.name)
    if spec is None:
        raise PermissionError(f"tool not in allowlist: {call.name}")

    # Authorization is checked against the human, never against the model.
    if not user.can(call.name, call.args.get("resource_id")):
        raise PermissionError(f"{user.id} lacks permission for {call.name}")

    # Anything with side effects gets an explicit human confirmation,
    # and the confirmation shows the resolved arguments, not the intent.
    if spec["side_effects"] and not session.confirmed(call.fingerprint()):
        raise ConfirmationRequired(call)

    audit.log(user=user.id, tool=call.name, args=call.args,
              session=session.id, source="model")
    return call
\`\`\`

Three rules encoded there. Tools are an explicit allowlist, never a dynamic dispatch on whatever name the model produced. Permission is evaluated against the authenticated human, never inherited from the service account. Side effecting actions require a human to see the actual resolved arguments and approve them.

## Trust the output like you trust user input

Model output is untrusted input to whatever consumes it next. This gets forgotten constantly because the output feels like it came from your own system.

If you render it as HTML or markdown, you have a cross site scripting sink. Sanitize it, and remember that markdown images and links can carry an attacker controlled URL, which is a quiet exfiltration channel: the model is convinced to embed sensitive text into a URL, the client renders the image, the data leaves.

If it becomes a database query, parameterize it. If it becomes a shell command, do not. If it becomes a URL your backend fetches, you have built a server side request forgery primitive that an attacker can point at cloud metadata endpoints and internal services, so restrict outbound requests to an allowlist and block internal address ranges.

## Retrieval is an exfiltration path

In a multi tenant retrieval system, the access control decision must happen in the query, as a filter the search engine enforces, not as an instruction in the prompt telling the model which documents it may use.

I have seen "only answer using documents belonging to the current customer" written in a system prompt, with the retriever returning everything. That is not access control. That is a request.

Filter at retrieval time on an identity derived from the authenticated session, and verify the filter in tests with a user who should see nothing.

## Cost, availability, and the controls that help

Two things static apps do not have to think about. Inference is expensive per request, so an unauthenticated or unmetered endpoint is a direct financial denial of service. And a long context request with a large generation can occupy a serving slot for a long time, so a handful of them can starve everyone else.

Rate limit per authenticated user, cap max tokens in and out, cap tool call iterations per request so an agent loop cannot run forever, and set a hard wall clock timeout.

Putting it together, the controls I would actually build are these. Least privilege on every credential the application holds, scoped to the human on whose behalf it is acting. Egress filtering, so a compromised prompt cannot reach arbitrary destinations. An allowlist of tools with confirmation on anything destructive. Output sanitization at every rendering point. Retrieval filtered by identity at query time. Full audit logging of prompts, retrieved context, tool calls, and results, so an incident is investigable. And limits on tokens, iterations, and time.

Notice how little of that is AI specific. It is input validation, least privilege, output encoding, and logging. The novel part is only that the untrusted input can arrive through a channel that looks like your own configuration.

## References

- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [MITRE ATLAS](https://atlas.mitre.org/)
`,
  },
  {
    slug: "load-balancing-l4-vs-l7",
    title: "Layer 4 and Layer 7 Load Balancing",
    date: "2026-05-25",
    tags: ["networking", "operations", "tools"],
    excerpt:
      "One forwards connections, the other understands requests. That single difference determines your health checks, your TLS design, and your failure behavior.",
    coverImage: "/images/blog/load-balancing-l4-vs-l7.jpg",
    coverCredit: {
      author: "dmitrybarsky",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/84816487@N00/2262194756",
    },
    content: `
## The distinction in one line

A layer 4 load balancer forwards connections. A layer 7 load balancer understands requests.

Everything else follows from that. What it can route on, how well it can health check, whether it can retry, what it does to TLS, and how much it costs you in latency and CPU.

## What each layer sees

At layer 4 the balancer picks a backend based on the connection's five tuple: source address and port, destination address and port, protocol. It then forwards packets. It does not parse the payload, and for most designs it does not need to.

Consequences:

- Very fast and cheap, since there is no parsing and often no re-assembly.
- Protocol agnostic. It will balance anything over TCP or UDP, not just HTTP.
- Once a connection is established it is pinned to one backend for its lifetime. A long lived connection cannot be rebalanced.
- Health checks can only be shallow. "Does the port accept a connection" is not the same question as "is the application working", and a backend that accepts connections while returning errors will keep getting traffic.
- No retries. If a backend fails mid connection, the client sees the failure.

At layer 7 the balancer terminates the client connection, parses the request, and makes a routing decision with full knowledge of it. For HTTP that means path, host header, method, cookies, and headers.

Consequences:

- Routing by content: send \`/api/\` to one pool and \`/static/\` to another.
- Real health checks: request a specific endpoint, check the status code and optionally the body.
- Retries and failover on a per request basis, so a single backend failure can be invisible to the client.
- Per request load balancing, which matters enormously for multiplexed protocols where one connection carries many requests. At layer 4, ten requests over one connection all land on the same backend.
- Header manipulation, compression, rate limiting, and request logging with real detail.
- Cost: it terminates and re-establishes connections, parses everything, and uses meaningfully more CPU.

## Health checks are the actual product

I would argue the health check is the most important thing a load balancer does, more than the balancing algorithm. Round robin versus least connections rarely decides an outage. Sending traffic to a broken backend always does.

Three levels, and pick deliberately:

- **Port check**: the socket accepts. Detects a dead process. Misses everything else.
- **Application check**: an HTTP endpoint returns 200. Detects a process that is up but broken.
- **Deep check**: the endpoint verifies the backend's own dependencies, database connectivity and so on, before answering.

Deep checks have a trap. If every backend deep checks the same shared database and that database has a blip, every backend fails its check simultaneously and the load balancer removes the entire pool. Now a degraded system is a completely dead system. I keep the load balancer check shallow enough that it never removes everything, and I separate "should I get traffic" from "am I fully healthy" into two different endpoints.

## Both modes, one config

HAProxy makes the difference explicit, since \`mode tcp\` and \`mode http\` are the same software behaving as either kind of balancer.

\`\`\`
global
    log stdout format raw local0 info
    maxconn 20000

defaults
    log     global
    timeout connect 5s
    timeout client  60s
    timeout server  60s
    retries 3

# Layer 4: pass an arbitrary TCP protocol through, TLS untouched.
frontend pg_read
    bind 10.10.0.5:5432
    mode tcp
    option tcplog
    default_backend pg_replicas

backend pg_replicas
    mode tcp
    balance leastconn
    option tcp-check
    server pg1 10.10.1.11:5432 check inter 3s fall 3 rise 2
    server pg2 10.10.1.12:5432 check inter 3s fall 3 rise 2

# Layer 7: terminate TLS, route by path, retry idempotent requests.
frontend web
    bind 10.10.0.5:443 ssl crt /etc/haproxy/certs/site.pem alpn h2,http/1.1
    mode http
    option httplog
    http-request set-header X-Forwarded-Proto https
    http-request set-header X-Forwarded-For %[src]
    acl is_api path_beg /api/
    use_backend api_pool if is_api
    default_backend web_pool

backend api_pool
    mode http
    balance leastconn
    option httpchk GET /healthz
    http-check expect status 200
    retry-on all-retryable-errors
    server api1 10.10.2.21:8080 check inter 2s fall 3 rise 2
    server api2 10.10.2.22:8080 check inter 2s fall 3 rise 2

backend web_pool
    mode http
    balance roundrobin
    option httpchk GET /healthz
    http-check expect status 200
    server web1 10.10.2.31:8080 check inter 2s fall 3 rise 2
    server web2 10.10.2.32:8080 check inter 2s fall 3 rise 2
\`\`\`

Note \`fall 3 rise 2\`: three consecutive failures to remove a backend, two successes to bring it back. Asymmetric on purpose. Slow to eject on a transient blip, and cautious about returning a backend that just came back.

## TLS: terminate, re-encrypt, or pass through

**Terminate** at the balancer. Simplest, gives you full layer 7 features, centralizes certificates, and leaves traffic in the clear behind the balancer.

**Re-encrypt**: terminate, inspect, then open a new TLS connection to the backend. Full features plus encryption on the internal hop. Costs double the crypto work.

**Pass through**: forward the encrypted stream untouched at layer 4. End to end encryption and backends see real client certificates, but you get no layer 7 features at all, because you cannot read what you are forwarding.

You cannot have both content routing and untouched end to end TLS. That is not a product limitation, it is arithmetic.

## How I choose

If it speaks HTTP and I want observability, retries, and path routing, layer 7. If it is a database protocol, a game server, or anything where I need raw throughput and end to end encryption, layer 4. Plenty of real deployments run both, with a fast layer 4 tier in front distributing to layer 7 proxies behind it.

## References

- [HAProxy documentation](https://docs.haproxy.org/)
- [nginx stream module documentation](https://nginx.org/en/docs/stream/ngx_stream_core_module.html)
- [nginx upstream module documentation](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Load balancing on Wikipedia](https://en.wikipedia.org/wiki/Load_balancing_(computing))
`,
  },
  {
    slug: "how-to-read-an-rfc",
    title: "How I Read an RFC",
    date: "2026-05-26",
    tags: ["learning", "networking", "tools"],
    excerpt:
      "RFCs are the actual source of truth for how the internet works, and they are far more readable than their reputation suggests once you know the structure.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why go to the source

Most of what people know about protocols comes from tutorials, and tutorials are lossy. They tell you what usually happens. The RFC tells you what is required, what is optional, what happens in the cases the tutorial skipped, and, critically, why the design is the way it is.

When I got serious about networking, reading the actual documents was the single biggest jump in my understanding. Nothing else was close. They are also free, permanently available, and unusually well written for technical specifications.

## What an RFC is and is not

The biggest misconception: an RFC is not automatically a standard. The series includes proposed standards, internet standards, best current practice documents, informational notes, experimental protocols, historic documents, and the occasional April Fools joke that people have unfortunately cited in earnest.

So read the metadata block before the content. At the top of every document you get:

- **Category** or status. Standards Track, Informational, Experimental, Best Current Practice.
- **Obsoletes** and **Updates**. This document replaces or amends earlier ones.
- **Obsoleted by** and **Updated by**, added later. This is the important one: it tells you that you are reading something superseded.

If a document says it has been obsoleted, stop and go read the replacement. People quote outdated RFCs constantly because they found them first in a search engine.

Also note that many protocols are not one document. They are a base specification plus a decade of extensions. Modern TCP, for example, is a consolidated core document plus separate documents for extensions and congestion control. The consolidated versions that fold years of amendments into one document are a genuine gift and worth seeking out.

## The reading order I use

I do not read front to back. I read:

1. **The abstract.** Thirty seconds, tells me if this is even the right document.
2. **The introduction.** Usually contains the motivation, which is the part tutorials never explain.
3. **The terminology section.** Non negotiable. These documents define words precisely and often not the way you use them casually.
4. **The specific section I came for.** Use the table of contents.
5. **Security considerations.** Mandatory in every RFC, and frequently the most interesting section. It is where the authors admit what the protocol does not protect against.
6. **IANA considerations.** Boring until you need to know which registry holds the code points, and then essential.
7. **Examples and appendices.** Many RFCs include worked message exchanges that make the abstract text click instantly.

## The notation: keywords and ABNF

The capitalized words are defined terms, not emphasis. MUST is an absolute requirement. MUST NOT is an absolute prohibition. SHOULD means there may be valid reasons to deviate but you had better understand them. MAY is truly optional.

This is defined in RFC 2119, later clarified so that the keywords only carry that meaning when they appear in capitals. When you are implementing something, the MUST statements are your test suite. I have literally built checklists by grepping a document for them.

Message formats themselves are usually specified in Augmented Backus-Naur Form. It looks intimidating for about ten minutes and then it is just notation:

\`\`\`abnf
; A small example in the style used throughout the RFC series
message      = start-line CRLF *( header CRLF ) CRLF [ body ]
start-line   = method SP request-target SP version
header       = field-name ":" OWS field-value OWS
field-name   = 1*token-char
OWS          = *( SP / HTAB )   ; optional whitespace
CRLF         = %x0D.0A
\`\`\`

The pieces: \`*\` means zero or more, \`1*\` means one or more, \`[ ]\` means optional, \`/\` is alternation, \`%x\` is a hex literal, and \`;\` starts a comment. That is nearly all of it. Learn those six things and every message format specification opens up.

## Pair it with a packet capture

This is the trick that made it stick for me. Read a section of the specification, then capture the real protocol and match the bytes to the text.

\`\`\`bash
# Capture a small sample of the protocol you are studying
sudo tcpdump -i any -c 200 -w /tmp/study.pcap 'tcp port 853 or udp port 53'

# Then walk fields with tshark and compare against the spec
tshark -r /tmp/study.pcap -V -c 5

# Or pull specific fields to see how a header is actually populated
tshark -r /tmp/study.pcap -T fields \\
  -e frame.number -e ip.src -e ip.dst -e dns.flags -e dns.qry.name
\`\`\`

Seeing a flag you just read about set to 1 in a real packet is worth an hour of reading on its own.

## Errata, and where to start

Published RFCs are immutable. They are never edited. Corrections are filed as errata against the document, and verified errata are things the authors got wrong. Before implementing anything closely, check whether errata exist. It is a short list and it will save you from faithfully implementing a typo.

As for where to begin: pick a protocol you already use and read its specification. DNS, ARP, ICMP, and HTTP are all approachable. The ARP document is famously short and readable, and finishing an actual internet standard in one sitting is a good confidence builder.

Then read one security considerations section a week from any document that interests you. It is the highest density source of practical security thinking I have found, and it is written by the people who designed the thing.

## References

- [RFC Editor](https://www.rfc-editor.org/)
- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174: Ambiguity of uppercase vs lowercase in RFC 2119 key words](https://www.rfc-editor.org/rfc/rfc8174.html)
- [RFC 5234: Augmented BNF for Syntax Specifications](https://www.rfc-editor.org/rfc/rfc5234.html)
- [RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.html)
- [tshark manual page](https://www.wireshark.org/docs/man-pages/tshark.html)
`,
  },
  {
    slug: "smart-data-drive-failure",
    title: "Reading SMART Data Before the Drive Reads You Its Last Rites",
    date: "2026-05-27",
    tags: ["storage", "monitoring", "hardware"],
    excerpt:
      "SMART will not reliably tell you a drive is about to die, but a few specific attributes are worth acting on immediately. Here is which ones and why.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What SMART is good for

Self-Monitoring, Analysis and Reporting Technology is a set of counters and thresholds a drive maintains about itself. Every modern drive exposes it. It is genuinely useful and it is genuinely oversold.

The honest summary: a large fraction of drives fail with no prior SMART warning at all, so a clean SMART report is weak evidence of health. But when specific attributes start moving, that is strong evidence of trouble. SMART is a smoke detector, not a crystal ball. Asymmetric information is still information.

## The attributes that matter on spinning disks

Ignore most of the list. These are the ones I act on:

- **Reallocated Sector Count (5).** Sectors that failed and were remapped to spares. Any nonzero value means the drive has already had unrecoverable media problems. A stable small number is tolerable. A number that is climbing is a drive on its way out.
- **Current Pending Sector Count (197).** Sectors that failed to read and are waiting to be reallocated on the next write. This is the one I care about most. Pending sectors are data you may not be able to read back.
- **Offline Uncorrectable (198).** Sectors the drive could not correct during its own offline scan.
- **Reported Uncorrectable Errors (187).** Errors the drive could not fix with error correction.
- **Command Timeout (188).** Commands that did not complete in time. Often cabling, backplane, or power rather than the drive, so check the physical path before condemning the disk.
- **Spin Retry Count (10).** The motor struggling to spin up. Mechanical, and rarely improves.

Raw values are vendor specific and the normalized values are frequently useless. Watch the direction of travel, not the absolute number. A drive going from 0 to 8 pending sectors in a week matters far more than a drive that has sat at 24 reallocated sectors for two years.

## Flash speaks a different language

For SSDs and NVMe the vocabulary changes entirely:

- **Percentage Used** or media wearout indicator. An estimate of consumed write endurance. Crossing 100 does not mean immediate death, it means the drive is past its rated endurance.
- **Available Spare** and its threshold. The pool of replacement blocks. Falling toward the threshold is a genuine warning.
- **Media and Data Integrity Errors.** Uncorrectable errors reported to the host. Should be zero. Any nonzero value is worth investigating.
- **Unsafe Shutdowns.** High counts point at a power problem, not a drive problem, and power problems eat data.
- **Data Units Written.** Use it to compute your actual write rate and project when endurance runs out.

## The commands

\`\`\`bash
# Full report, human readable. -x is the everything view.
sudo smartctl -x /dev/sda

# NVMe health log, which is where the flash counters live
sudo smartctl -a /dev/nvme0
sudo nvme smart-log /dev/nvme0

# Kick off tests: short is a couple of minutes, long reads the whole surface
sudo smartctl -t short /dev/sda
sudo smartctl -t long  /dev/sda

# Results of past self tests, newest first
sudo smartctl -l selftest /dev/sda

# Drives behind a RAID controller need the device type specified
sudo smartctl -a -d megaraid,0 /dev/sda
\`\`\`

That last one catches people out. A hardware RAID controller hides the physical drives, and without the right \`-d\` flag you get nothing useful. Check what your controller needs.

## Automate it or it will not happen

Nobody remembers to run \`smartctl\` by hand. Let the daemon do it.

\`\`\`ini
# /etc/smartd.conf
# -a           all standard checks
# -o on        enable automatic offline testing
# -S on        enable attribute autosave
# -s (S/../.././02|L/../../6/03)  short test daily at 02:00,
#              long test Saturday at 03:00
# -W 4,45,55   report temp change of 4C, warn at 45C, critical at 55C
# -m           where to send warnings
# -M exec      run a script on any warning

/dev/sda -a -o on -S on -s (S/../.././02|L/../../6/03) -W 4,45,55 \\
  -m root -M exec /usr/local/sbin/smart-alert.sh

DEVICESCAN -a -o on -S on -s (S/../.././02|L/../../6/03) -W 4,45,55 \\
  -m root -M exec /usr/local/sbin/smart-alert.sh
\`\`\`

Better still, export the values into your existing metrics system so you get history and can see the slope. A single reading tells you a number. A graph tells you whether it is moving, and moving is the whole signal.

\`\`\`bash
#!/usr/bin/env bash
# Emit key attributes as Prometheus textfile metrics
out=/var/lib/node_exporter/textfile_collector/smart.prom
: > "$out.tmp"
for d in /dev/sd?; do
  n=$(basename "$d")
  sudo smartctl -A "$d" | awk -v dev="$n" '
    $1 == 5   { printf "smart_reallocated_sectors{device=\\"%s\\"} %d\\n", dev, $10 }
    $1 == 197 { printf "smart_pending_sectors{device=\\"%s\\"} %d\\n",     dev, $10 }
    $1 == 198 { printf "smart_offline_uncorrectable{device=\\"%s\\"} %d\\n", dev, $10 }
  ' >> "$out.tmp"
done
mv "$out.tmp" "$out"
\`\`\`

## What I do with a suspect drive

First, check the physical path. Timeouts and reset storms are often a cable, a backplane slot, or marginal power. Reseat and swap the cable before ordering a replacement.

Second, verify redundancy right now. Confirm the array is healthy and the backup is current before touching anything. The most dangerous moment in a drive's life is the rebuild after a sibling failed, because that is when every remaining drive gets read end to end and latent bad sectors surface all at once.

Third, act on pending sectors. Rising pending sectors on a drive holding data I care about means it gets replaced. The cost of a drive is trivially less than the cost of a rebuild that fails halfway.

Fourth, scrub regularly. A monthly scrub or patrol read finds latent errors while you still have redundancy to repair them from, instead of during a rebuild when you do not. This is the single highest value habit on the list, and it is the one most people skip.

And keep believing your backups more than your SMART data. SMART is one signal. Redundancy plus tested restores is the actual plan.

## References

- [smartmontools](https://www.smartmontools.org/)
- [S.M.A.R.T. on Wikipedia](https://en.wikipedia.org/wiki/S.M.A.R.T.)
- [NVM Express specifications](https://nvmexpress.org/specifications/)
- [Prometheus node exporter](https://github.com/prometheus/node_exporter)
`,
  },
  {
    slug: "ai-in-network-operations",
    title: "Where I Think AI Actually Helps Network Operations",
    date: "2026-05-28",
    tags: ["ai", "networking", "operations", "monitoring"],
    excerpt:
      "My opinion, clearly labeled: language models are useful in the ops loop as a reading and drafting tool, and a bad idea anywhere near an unsupervised config push.",
    coverImage: "/images/blog/ai-in-network-operations.jpg",
    coverCredit: {
      author: "USDAgov",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://www.flickr.com/photos/41284017@N08/49392119033",
    },
    content: `
## This is an opinion piece

Everything below is how I currently think about this, not a report on what anyone has shipped. I am a student running a lab, not an operator of a production network at scale, and I would rather be clear about that than pretend otherwise. Take it as a framework for evaluating claims, including my own.

## The unglamorous prerequisite

Before any of this is worth discussing: if your inventory is a spreadsheet somebody last updated in the fall, your device naming is inconsistent, your configs are not in version control, and your logs are not centralized, then adding a model to your operation changes nothing. It will produce confident output derived from bad data.

Every genuinely useful application I can think of depends on structured, current, machine readable knowledge of the network. Which means the boring work, source of truth inventory, config in git, centralized logging with consistent fields, is the prerequisite and also the part that delivers most of the value on its own.

That is not a dodge. It is the actual finding. The data plumbing is the project.

## Where I think it fits

**Log and alert triage.** A model summarizing three hundred correlated syslog lines into "these forty messages are one interface flapping, here is the interface" is doing something genuinely hard for a human at 3am and easy for a language model. It is a reading comprehension task over text, which is exactly the shape of the problem these models are good at.

**Explaining a config diff.** A diff of two device configurations is precise and unreadable. "This change adds VLAN 40 to the trunk on ports 1 through 8 and removes the storm control threshold" is a summary a reviewer can act on. The diff remains the source of truth. The summary is a reading aid.

**First drafts of runbooks and documentation.** Documentation does not get written because writing it is tedious. A generated first draft that a human corrects is much more likely to exist than a blank page. The correction step is not optional.

**Querying inventory in plain language.** Translating "which access switches are still running the old firmware and have uplinks to the distribution layer" into a query against a structured source of truth. Notice this is a translation task producing a query that runs deterministically. The model does not answer the question, it writes the lookup.

**Baselining and anomaly surfacing.** Worth separating: most of the good anomaly detection in network operations is classical statistics and time series work, not language models. Where a model helps is at the end, turning a flagged anomaly into a readable explanation with context attached.

## Where I would not put it

**Autonomous configuration change.** Not because the model cannot generate valid configuration, it usually can, but because the failure mode is unbounded. A bad access control entry or a routing change can partition a network from the very management plane you would use to fix it. Generation, yes. Review and approval by a human, always.

**As the only thing looking at an alert.** Deterministic thresholds and rules should still exist. A model summarizing on top of them is an improvement. A model replacing them means your monitoring is now nondeterministic, and you cannot write a test for it.

**Anywhere a precise audit trail is required.** Change control wants to know exactly what was done and why. "The assistant suggested it" is not an answer that survives a post incident review.

**Anything involving secrets in the prompt.** Device configs are full of credentials, community strings, and keys. If they go into a prompt, know exactly where that prompt goes and who retains it. Strip secrets during collection, not later.

## Guardrails I would insist on

If I were putting an assistant anywhere near a network, I would write the policy before the code.

\`\`\`yaml
# ops-assistant-policy.yml
identity:
  # The assistant never has its own standing privileges.
  credentials: per-operator, short-lived, no shared service account

capabilities:
  read:
    allowed: [inventory, config_repo, syslog_index, metrics]
    redact: [passwords, snmp_communities, psk, api_keys, certificates]
  write:
    allowed: []          # nothing writes directly to a device
    proposal_only: true  # output is a pull request, never a push

change_flow:
  - assistant generates candidate config as a diff
  - diff runs through the existing linter and policy checks
  - diff applied in a lab or dry-run mode first
  - named human approves in the normal change process
  - deployment executed by the existing automation, not the assistant

limits:
  max_tool_calls_per_request: 12
  wall_clock_timeout_seconds: 120
  blast_radius: single device per proposal

audit:
  log: [prompt, retrieved_context, tool_calls, output, approver]
  retention_days: 400
  egress: allowlist only, no arbitrary outbound requests
\`\`\`

The core idea in that file: the assistant proposes, the existing pipeline disposes. Everything already built for safe change, linting, staging, review, rollback, stays in the path. You are adding a drafting step at the front, not replacing the machinery.

## How I would evaluate a claim, and where I land

When something promises AI powered network operations, these are the questions I would ask.

What is the false positive rate, measured on a network like mine? What happens when it is wrong, and who notices? Does it need write credentials, and can it work read only? Where does my configuration data go, and is it retained or used for training? Can I reproduce a given output later for a post incident review? What does it do when the data it depends on is stale, and does it say so or does it guess?

If the answers are vague, the product is probably a wrapper around a prompt, and I can write that myself with better guardrails.

So the honest position. I think the reading, summarizing, and drafting applications are real and available to anyone with clean data. I think autonomous operation is a bad trade for the foreseeable future, because the value is convenience and the risk is a network partition. And I think most of the benefit people attribute to the model actually comes from the data hygiene they had to do first.

## References

- [Prometheus documentation](https://prometheus.io/docs/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NetBox documentation](https://netboxlabs.com/docs/netbox/)
- [Ansible documentation](https://docs.ansible.com/)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
`,
  },
  {
    slug: "live-migration-internals",
    title: "How Live Migration Actually Moves a Running VM",
    date: "2026-05-29",
    tags: ["virtualization", "servers", "operations"],
    excerpt:
      "Moving a running virtual machine between hosts with milliseconds of downtime is a neat trick built on dirty page tracking and a race you can lose.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The problem statement

You want to move a running virtual machine from host A to host B without the workload noticing. The VM's state is its memory, its CPU registers, its device state, and its storage. Memory is the hard part, because it is large and because the guest keeps changing it while you copy.

That last clause is the whole engineering problem. Copying a static several gigabyte memory image is trivial. Copying it while a guest actively dirties pages is a race.

## Pre-copy, the default approach

Nearly every hypervisor defaults to pre-copy migration, which works in three phases.

**Phase one: setup.** The destination allocates memory and prepares an identical virtual machine shell. The two hosts negotiate capabilities and confirm the guest CPU model is satisfiable on the destination.

**Phase two: iterative copy.** The source enables dirty page tracking, typically by write protecting guest memory so the hypervisor gets a fault and can mark the page dirty. Then it copies all memory to the destination while the VM keeps running. Some of those pages get modified during the copy, so the source does another pass, sending only the pages dirtied since the last one. Then another. Each pass should be smaller than the last.

**Phase three: stop and copy.** When the remaining dirty set is small enough to transfer within the downtime target, the source pauses the VM, sends the last dirty pages plus CPU and device state, and the destination resumes. Total guest visible downtime is the length of this final step, ideally tens of milliseconds.

## Dirty rate is the whole game

Convergence happens only if the guest dirties memory more slowly than you can send it. If the guest writes 2 GB per second and your link moves 1 GB per second, the dirty set never shrinks and the migration iterates forever.

Three ways out, in increasing order of aggression:

**More bandwidth.** Raise the migration bandwidth cap or use a dedicated, faster migration network. Often the cap is set conservatively and simply raising it fixes everything.

**Auto convergence.** The hypervisor deliberately throttles the guest's vCPUs, slowing the rate at which it can dirty pages until the copy catches up. The guest gets slower during migration but the migration finishes. This is usually the right trade.

**Post-copy.** Change the algorithm. Pause the VM early, send the minimum state, and resume it on the destination immediately. Pages that have not arrived yet are fetched on demand when the guest touches them, causing a fault across the network.

Post-copy converges in bounded time regardless of dirty rate, which is its entire appeal. The cost is real: during the fetch phase the guest runs with degraded memory latency, and if the network fails midway, the VM's memory is split across two hosts and the VM is unrecoverable. Pre-copy failure just means the migration aborts and the VM keeps running happily on the source. That asymmetry is why pre-copy is the default and post-copy is the escape hatch.

A common hybrid: start with pre-copy, and if it fails to converge after a set number of iterations, switch to post-copy.

## Storage and the network handoff

If both hosts see the same shared storage, the disk does not move and there is nothing to do. This is why shared storage is effectively a prerequisite for casual live migration.

Without it, you migrate the disk too, usually by mirroring writes to both copies while a background copy runs, then cutting over. This works and it multiplies the data volume and duration substantially.

The network handoff is delightfully low tech. When the VM resumes on the destination, its MAC address is suddenly behind a different physical port. The switch does not know that. So the destination host emits a gratuitous ARP or RARP announcement on behalf of the guest, the switches update their MAC address tables, and traffic follows. If you have ever seen a migrated VM unreachable for a second or two, this is usually why, and the culprit is often port security, a MAC move policy, or a slow spanning tree convergence on the destination port.

## Why migrations fail

**CPU model mismatch.** The guest was booted seeing a set of CPU features. If the destination lacks one, the guest could execute an illegal instruction after resuming, so the hypervisor refuses upfront. The fix is to define a common baseline CPU model across the cluster rather than exposing host passthrough. You give up a little performance and gain the ability to move anything anywhere.

**Passthrough devices.** A VM with a physical device assigned to it generally cannot migrate, because that device's state lives in hardware the destination does not have.

**Non convergence.** Covered above. A busy in memory database is the classic offender.

**Version skew.** The destination hypervisor being older than the source frequently blocks migration, which is why rolling upgrades go in a specific direction.

**Huge pages and memory backing** mismatches between hosts.

## Practical settings and pre-flight checks

\`\`\`bash
# libvirt: migrate with a bandwidth cap, auto-convergence, compression,
# and post-copy available as a fallback.
virsh migrate --live --auto-converge --postcopy \\
  --persistent --undefinesource \\
  --bandwidth 5000 \\
  --timeout 300 --timeout-postcopy \\
  app-vm-01 qemu+ssh://host-b.internal/system

# Watch progress: remaining, processed, and the current dirty rate
watch -n1 'virsh domjobinfo app-vm-01'

# If it is clearly never converging, force the switch
virsh migrate-postcopy app-vm-01

# Or give up cleanly. Pre-copy abort is safe: the VM stays on the source.
virsh domjobabort app-vm-01
\`\`\`

\`--timeout 300 --timeout-postcopy\` is the hybrid: try pre-copy for five minutes, then switch rather than iterating forever.

Before a real maintenance window, I test the migration path with a low value VM first, on the same network and storage the real ones will use. Confirm the cluster CPU baseline is uniform. Put migration traffic on its own VLAN so a large transfer does not compete with production. And know the abort command before you need it, because a stuck migration during a maintenance window is a much calmer event when you know that aborting a pre-copy is completely safe.

## References

- [libvirt migration documentation](https://libvirt.org/migration.html)
- [QEMU documentation](https://www.qemu.org/docs/master/)
- [Live migration on Wikipedia](https://en.wikipedia.org/wiki/Live_migration)
- [Proxmox VE wiki](https://pve.proxmox.com/wiki/Main_Page)
- [KVM project](https://www.linux-kvm.org/page/Main_Page)
`,
  },
  {
    slug: "certifications-vs-projects",
    title: "Certs, Projects, and What I Actually Learn From Each",
    date: "2026-05-30",
    tags: ["career", "learning", "cybersecurity"],
    excerpt:
      "The question I get asked most by other students: should I study for a certification or build something? They teach different things, and the order matters.",
    coverImage: "/images/blog/certifications-vs-projects.jpg",
    coverCredit: {
      author: "wyldvision",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/126767021@N06/15882717591",
    },
    content: `
## The question

Every few weeks another student asks me some version of this. Should I grind a certification, or should I build a lab and put projects on my resume?

The framing is wrong, because they teach genuinely different skills and neither substitutes for the other. Here is what each one actually gave me.

## What the certification gave me

I hold CompTIA Tech+, and studying for it did three things that building alone would not have.

**Vocabulary.** Before, I knew how things worked in the specific way I had encountered them. After, I knew what those things were called. That sounds trivial and it is not: the correct term is the key that unlocks documentation, error message searches, and conversations with people who know more than you. You cannot look up a concept you cannot name.

**Coverage of things I would have skipped.** Left alone, I build what interests me. An exam objectives list does not care what interests me. It made me learn areas I had been quietly routing around, and a few of those turned out to matter a lot.

**A deadline.** Self directed learning has no forcing function. A scheduled exam does. That is a boring benefit and it is real.

What it did not give me: any ability to fix something that is broken in a way the exam did not anticipate. Multiple choice questions have a correct answer that exists. Broken infrastructure often does not, at least not until you go find it.

## What the lab gave me

Running actual infrastructure taught me the thing no exam tests: what to do when it does not work and nobody has written down why.

Nothing in a study guide prepares you for a service that works fine for a week and fails every Tuesday. Nothing teaches you to check physical layer before protocol layer except having wasted three hours on a routing config when the real problem was a cable. Nothing teaches you to change one variable at a time except having changed four and lost the thread completely.

The lab also taught me the operational habits that separate a hobby from a practice. Document as you go, because you will not remember in six months. Change one thing at a time. Have a rollback before you have a change. Monitor the thing before you need the monitoring. Every one of those I learned by getting burned.

And it taught me that most of the job is not the interesting part. It is labeling, backups, patching, and writing down what you did. Certifications do not test that because you cannot test it in ninety minutes.

## What competition gave me

Competing in the National Cyber League has been the third leg, and it teaches something both of the others miss: speed under pressure with incomplete information.

Placing in the top 1 percent individually and seventh nationally as a team was not about knowing more than everyone else. It was about tool fluency, reading a problem quickly enough to decide whether it is worth your remaining time, and not rabbit holing. In a timed event, recognizing "I cannot solve this in the time I have" and moving on is worth more than any single technique.

That skill transfers directly to incident response, which is also a timed event with incomplete information and a cost to going down the wrong path.

## The sequence I would recommend

If I were starting over, I would interleave rather than pick.

Start with a small project, something that works end to end, however basic. You need something concrete to attach vocabulary to, or the terms stay abstract and slide out of your head.

Then take a foundational certification. Now the terminology has hooks to hang on, and studying goes several times faster because you are naming things you have already touched.

Then build something harder, deliberately using the areas the exam covered that you had been avoiding. This is where the coverage benefit pays off.

Then compete, or contribute, or teach. Something with an external standard, where you find out whether you actually know it or only think you do.

Then repeat with a deeper certification.

The order matters because each stage makes the next one cheaper. Certifications before any hands on work is the expensive path: you memorize terms with nothing underneath them and forget most of it.

## Teaching and writing are the accelerators

Running the Cyber Club and teaching youth coding camps has taught me more per hour than anything else on this list.

Explaining subnetting to someone who has never seen it forces you to discover which parts you understood and which parts you had memorized. Every gap in your model becomes visible the instant a beginner asks the obvious question you had never thought to ask. I have rebuilt my understanding of several fundamentals purely because a middle schooler asked why.

You do not need a club. Write a post, answer a question in a forum, walk a friend through something. The mechanism is the same.

The written form of the same habit is the highest return thing I do: write down what I built and why, while I am building it.

It compounds in three directions. It makes the work reusable, because six months later I can rebuild it without re-deriving everything. It makes the work legible, because a hiring manager or a teacher can see what you did rather than taking your word for it. And the act of writing it forces you to find the parts you cannot explain, which are exactly the parts you did not really understand.

An undocumented lab is a hobby. A documented one is a portfolio, and the difference is a few hours of writing.

The format barely matters as long as it is consistent. I keep one small record per project, in the repo, in a shape I can grep later:

\`\`\`yaml
# projects/vlan-segmentation/record.yml
project: lab network segmentation
started: 2026-02-03
status: running

goal: >
  Separate management, storage, and untrusted client traffic so a
  compromised client device cannot reach a hypervisor management port.

skills_practiced:
  - vlan design and trunk configuration
  - firewall policy between zones
  - documenting a working state before changing it

what_broke:
  - description: management access lost after tagging the uplink
    cause: native vlan mismatch between switch and firewall
    fix: set the native vlan explicitly on both ends, then re-test
    lesson: always keep one out-of-band path before touching a trunk

verify:
  - command: ping -c1 10.20.0.1
    expect: reachable only from the management vlan
  - command: nmap -Pn -p 22,443 10.30.0.10
    expect: filtered from the client vlan

next: add 802.1X so port assignment is identity driven, not static
\`\`\`

The \`what_broke\` section is the one I reread. It is a record of my own mistakes, and it is worth more than the rest of the file combined.

To sum it up: certifications teach you the map. Projects teach you the terrain. Competition teaches you to move fast on unfamiliar ground. Teaching shows you which parts of the map you were only pretending to read.

Do all four, in that order, on a loop.

## References

- [CompTIA](https://www.comptia.org/)
- [National Cyber League](https://nationalcyberleague.org/)
- [NIST NICE Cybersecurity Workforce Framework](https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resources)
- [CISA cybersecurity education and career development](https://www.cisa.gov/cybersecurity-training-exercises)
`,
  },
  {
    slug: "local-llm-memory-math",
    title: "Local LLM Memory Math: Will This Model Actually Fit?",
    date: "2026-05-31",
    tags: ["ai", "ml", "hardware", "homelab"],
    excerpt:
      "Parameter count is only the first term. Here is the arithmetic I run before I try to load a model on hardware I already have.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The question everyone asks wrong

The first thing people ask about running a model locally is "how many parameters." That number tells you almost nothing on its own. What you actually need is bytes of memory in three buckets: the weights, the key/value cache, and the runtime slop around both. If you can do that arithmetic on paper, you stop guessing and you stop downloading twenty gigabytes to find out it will not load.

I do this math before I touch a download, because it also tells me the second thing I care about: how fast the thing will be. Memory capacity decides whether it runs. Memory bandwidth decides whether it is usable.

## Bucket one: weights

Weight memory is parameters times bytes per parameter. That is the whole formula.

At 16-bit precision each parameter is two bytes, so a 7 billion parameter model wants roughly 14 GB just to sit in memory. At 8-bit it is roughly 7 GB. At 4-bit it is roughly 3.5 GB, plus a bit of overhead because quantized formats store scale and zero point metadata per block of weights. Call it 10 to 20 percent above the naive number and you will not be surprised.

Quantization is not free. Reducing precision loses information, and how much that hurts depends on the format and on what you are asking the model to do. My rule is that 8-bit is close to invisible for most tasks, 4-bit is usually fine for chat and summarizing, and anything below 4-bit is a science experiment I would not put behind a service.

## Bucket two: the KV cache

This is the bucket that surprises people, because it grows with usage rather than sitting still.

During generation, the model caches a key and a value vector for every token, in every layer, for every attention head that has its own key/value projection. The size is:

    2 * layers * kv_heads * head_dim * bytes_per_element * sequence_length * batch_size

The leading 2 is because you store both K and V. Models using grouped query attention share key/value projections across several query heads, which is why \`kv_heads\` is often much smaller than the total attention head count, and why the cache is far cheaper on those models than it used to be.

The important property is that this term is linear in context length and linear in concurrent requests. A long context feature is a memory feature, not just a config flag.

## Bucket three: everything else

Then there is the slop: the framework's CUDA or Metal context, activation buffers for the forward pass, the allocator's fragmentation, and whatever the serving layer reserves up front. I budget 1 to 2 GB of headroom on a dedicated accelerator and more if I am also driving a display from the same device. If you fill memory to 99 percent you will get an allocation failure on a long prompt at 2 in the morning instead of at your desk.

Putting all three buckets in one function makes the trade offs visible:

\`\`\`python
def model_memory_gb(params_b, bits, layers, kv_heads, head_dim,
                    ctx=8192, batch=1, kv_bits=16, overhead_gb=1.5):
    gib = 1024 ** 3
    weights = params_b * 1e9 * (bits / 8) * 1.10        # +10% for quant metadata
    kv = 2 * layers * kv_heads * head_dim * (kv_bits / 8) * ctx * batch
    return {
        "weights_gb": round(weights / gib, 2),
        "kv_cache_gb": round(kv / gib, 2),
        "total_gb": round((weights + kv) / gib + overhead_gb, 2),
    }

# a 7B-class model, 32 layers, 8 KV heads, head_dim 128, 8k context
print(model_memory_gb(7, 4, 32, 8, 128))
\`\`\`

Change \`ctx\` to 32768 and watch the second number move while the first one does not. That is the whole lesson.

## Speed follows from the same numbers

Single stream token generation is memory bandwidth bound, not compute bound. To produce one token the hardware has to read essentially every weight once. So the ceiling on tokens per second is roughly memory bandwidth divided by the size of the weights in memory. A 4 GB quantized model on a device with a few hundred GB/s of bandwidth has a theoretical ceiling in the tens of tokens per second, and real systems land meaningfully below the ceiling because of cache behavior and kernel overhead.

Two consequences I rely on. First, quantizing does not just help you fit, it makes generation faster, because there are fewer bytes to stream. Second, offloading layers to system RAM is a cliff, not a slope: the moment part of the model lives behind a PCIe link that is an order of magnitude slower than local memory, that part dominates and the whole thing crawls.

## How I decide what to run

I want weights plus KV cache at my target context to fit in device memory with headroom left over. If it does not fit, I try one step more aggressive on quantization before I try offloading, because offloading trades a capacity problem for a bandwidth problem and bandwidth problems feel worse. If it still does not fit, I pick a smaller model. A smaller model that answers in two seconds beats a bigger one that answers in ninety.

## References

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [Quantization (signal processing)](https://en.wikipedia.org/wiki/Quantization_(signal_processing))
`,
  },
  {
    slug: "gpu-basics-for-infrastructure",
    title: "GPU Fundamentals For Infrastructure People",
    date: "2026-06-01",
    tags: ["ai", "hardware", "servers"],
    excerpt:
      "If you already know servers, most of what you need to know about accelerators is memory, bus, power, and drivers. Here is the mental model I use.",
    coverImage: "/images/blog/gpu-basics-for-infrastructure.jpg",
    coverCredit: {
      author: "viagallery.com",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/15932083@N05/3594287535",
    },
    content: `
## A wide, hungry coprocessor

If you are comfortable with servers but accelerators feel like a different planet, the mental model is simpler than the marketing suggests. A GPU is a coprocessor with its own memory, its own scheduler, and thousands of small execution units that are good at doing the same arithmetic to a lot of data at once. It cannot do anything on its own. The CPU stages data, hands off work, and collects results.

Everything that goes wrong in practice comes from four places: memory, the bus, power and cooling, and drivers. Not from the math.

## Memory is the spec that matters

Two numbers describe accelerator memory: capacity and bandwidth.

Capacity is a hard wall. Either your working set fits or the job fails to allocate. There is no swapping to system RAM that keeps performance intact, and the "unified memory" designs that share one pool with the CPU trade the wall for a bandwidth question instead.

Bandwidth is what actually sets throughput for most inference work. A device with plenty of capacity but modest bandwidth will feel sluggish on anything that has to stream large tensors, and no amount of compute headroom fixes that. When I compare two options I look at bandwidth before I look at claimed peak arithmetic throughput, because peak numbers assume a workload that keeps every unit fed and almost nothing does.

## The bus, and when it matters

The accelerator talks to the host over PCIe. What matters is the negotiated link width and generation, not what the slot is physically shaped like. A card in a slot that is mechanically x16 but electrically x4 will work and will quietly be slow at anything transfer heavy.

Check what you actually got:

\`\`\`bash
# what the device is capable of vs what it negotiated
sudo lspci -vv -s 01:00.0 | grep -E 'LnkCap|LnkSta'

# quick view of every device and its link
sudo lspci -PP -vv 2>/dev/null | grep -E '^[0-9a-f]|LnkSta:' | head -40
\`\`\`

\`LnkCap\` is the capability, \`LnkSta\` is reality. If they disagree, look at slot wiring, bifurcation settings in firmware, riser cables, or a link that dropped to a lower generation because of signal integrity.

The bus matters a lot for training and for multi device work where tensors move between cards. It matters much less for single card inference, where you load the weights once and then mostly leave them there. Do not spend money solving a bus problem you do not have.

## Power and cooling are the real constraints at home

Accelerators are dense loads. Three things bite people:

Connector and supply headroom. High draw cards want dedicated supply rails and the right connectors, not adapters chained off one cable. Transient spikes above the steady state rating are normal, and a supply sized exactly to the average will trip.

Airflow direction. Server chassis are designed around front to back airflow with high static pressure. Consumer cards that dump heat sideways into the case behave badly inside that design, and passively cooled server cards do nothing at all without the chassis fans they expect.

Thermal throttling looks like a software problem. If throughput degrades after a few minutes of load, check clocks and temperature before you rewrite anything.

\`\`\`bash
# steady state view while a job runs
nvidia-smi --query-gpu=timestamp,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.sm \\
  --format=csv -l 5
\`\`\`

## Drivers and containers, where the boring failures live

The stack is kernel driver, user space runtime libraries, and framework. All three have to agree. Most "it worked yesterday" incidents are a kernel update that rebuilt without the out of tree driver module, or a framework built against a runtime version that is not installed.

Two habits save me time. Pin the driver and hold it across unattended upgrades, so kernel updates never surprise the module. And run the workload in a container with the vendor container runtime so the framework and runtime libraries travel together while the kernel driver stays on the host.

\`\`\`bash
# smoke test that the container runtime can see the device
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
\`\`\`

If that prints the device table, your plumbing is correct and any remaining failure is in your code. If it does not, stop debugging Python.

## What I check before recommending a card

In order: does the working set fit in device memory, what is the memory bandwidth, will the slot give it a full electrical link, can the chassis actually cool it in its intended airflow direction, does the supply have real headroom for transients, and is the driver supported on the distribution I am running. Compute throughput is last on that list, which sounds wrong and is not. The arithmetic is rarely the bottleneck. Feeding it is.

## References

- [PCI Express](https://en.wikipedia.org/wiki/PCI_Express)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [NVIDIA System Management Interface](https://developer.nvidia.com/nvidia-system-management-interface)
- [NVIDIA Container Toolkit documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
`,
  },
  {
    slug: "numa-and-cpu-pinning",
    title: "NUMA, CPU Pinning, And Why Your VM Feels Slow",
    date: "2026-06-02",
    tags: ["virtualization", "servers", "hardware"],
    excerpt:
      "A guest with plenty of allocated cores and RAM can still crawl if it straddles memory nodes. How NUMA works and when pinning is worth the loss of flexibility.",
    coverImage: "/images/blog/numa-and-cpu-pinning.jpg",
    coverCredit: {
      author: "shokai",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/51753258@N00/7222512264",
    },
    content: `
## Memory is not equidistant

On a multi socket server, and on plenty of modern single socket parts, memory is not one flat pool. Each socket or die has memory controllers attached directly to some of the DIMM slots. Access to that local memory is fast. Access to memory attached to another socket has to cross the interconnect, which costs latency and has less bandwidth than the local path.

That is NUMA: non uniform memory access. The hardware presents it as one address space and the operating system quietly hides it, which is exactly why it bites you. A guest can have plenty of vCPUs and plenty of RAM and still feel slow because half its memory is on the far side of a link.

## Look at your topology first

Never guess. Two commands tell you everything.

\`\`\`bash
lscpu | grep -i numa
numactl --hardware
\`\`\`

\`numactl --hardware\` gives you nodes, which CPUs belong to each node, free memory per node, and a distance matrix. The matrix is relative: 10 means local, and higher numbers mean more expensive. A two node box typically shows something like local 10 and remote 21, which is your rough penalty factor for getting it wrong.

Also check where a device lives, because a network card or accelerator is attached to a specific node too:

\`\`\`bash
cat /sys/class/net/eth0/device/numa_node
\`\`\`

An interface on node 0 being serviced by an interrupt handler on node 1 is a real and very common performance bug.

## The three ways a guest lands wrong

Split memory. The guest is bigger than one node, so the hypervisor allocates pages from both. Roughly half of memory accesses now cross the interconnect.

Split vCPUs. The guest fits in one node's worth of RAM, but the scheduler places its vCPU threads on both sockets. Threads on the far socket pay the remote penalty for every access.

Wandering threads. Nothing is pinned, so the host scheduler migrates vCPU threads between nodes under load. Memory does not follow, so the penalty appears and disappears and your benchmark looks like noise.

The tell for all three is the same: performance that varies run to run for no visible reason, with system time higher than you expect.

## Sizing beats pinning

Before you pin anything, size the guest so it fits. If a node has a given amount of memory and a given core count, a guest that stays inside both will usually be placed well by the host on its own. Most of the NUMA problems I have seen were created by someone allocating a guest slightly larger than a node because the round number looked nice.

If the workload genuinely needs more than one node, do not pretend otherwise. Expose the topology to the guest so its own scheduler can make good decisions, rather than lying to it about a flat memory space.

## Pinning in practice

With libvirt, pin vCPUs to physical CPUs and bind memory to the matching node:

\`\`\`xml
<vcpu placement='static' cpuset='0-7'>8</vcpu>
<cputune>
  <vcpupin vcpu='0' cpuset='0'/>
  <vcpupin vcpu='1' cpuset='1'/>
  <vcpupin vcpu='2' cpuset='2'/>
  <vcpupin vcpu='3' cpuset='3'/>
</cputune>
<numatune>
  <memory mode='strict' nodeset='0'/>
</numatune>
\`\`\`

\`mode='strict'\` is the important part. Preferred will silently fall back to remote memory under pressure, which gets you the slow behavior you were trying to avoid, without the error message that would have told you.

For a plain process rather than a VM, \`numactl\` does the same job in one line:

\`\`\`bash
numactl --cpunodebind=0 --membind=0 ./my-service
\`\`\`

And to check what a running process actually got:

\`\`\`bash
numastat -p $(pgrep -f my-service)
\`\`\`

Non zero counts in the remote columns are your answer.

## When not to pin

Pinning trades flexibility for predictability, and the trade is not always good.

On a consolidation host running many small, bursty guests, pinning wastes capacity: pinned cores sit idle while other guests queue. Let the scheduler work. On a host you live migrate frequently, pinning to specific physical CPU numbers assumes a topology that the destination may not share. And if you overcommit CPU heavily, pinning concentrates contention onto exactly the cores you chose.

I pin when a guest is latency sensitive, has a stable footprint, and owns its host. I do not pin general purpose guests, and I never pin as a first response to a performance complaint. Measure, look at the topology, size correctly, and only then reach for \`numatune\`.

## References

- [Non-uniform memory access](https://en.wikipedia.org/wiki/Non-uniform_memory_access)
- [numactl(8) manual page](https://man7.org/linux/man-pages/man8/numactl.8.html)
- [Linux NUMA memory policy documentation](https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html)
- [libvirt domain XML format](https://libvirt.org/formatdomain.html)
- [taskset(1) manual page](https://man7.org/linux/man-pages/man1/taskset.1.html)
`,
  },
  {
    slug: "inference-vs-training-workloads",
    title: "Inference And Training Are Not The Same Workload",
    date: "2026-06-03",
    tags: ["ai", "ml", "servers"],
    excerpt:
      "Training and inference stress completely different parts of a machine. Confusing the two is how people buy the wrong hardware and size the wrong network.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Same model, opposite resource profile

People talk about "AI infrastructure" as if it were one thing. It is at least two, and they want opposite things from a machine. If you are planning capacity, the single most useful question is which side of this line you are on.

Training consumes a fixed dataset over a long run to produce weights. Inference takes finished weights and serves requests. That difference in shape changes memory, network, storage, and failure behavior.

## Memory: weights versus weights plus baggage

Inference needs the weights, a working buffer, and a cache for the tokens it has generated so far. That is roughly it.

Training needs the weights, plus gradients the same size as the weights, plus optimizer state that is commonly two additional values per parameter, plus activations saved from the forward pass so the backward pass can use them. The classic rule of thumb for a mixed precision run with a momentum based optimizer is that model state alone lands somewhere near four to six times the size of the weights before you count activations, and activations scale with batch size and sequence length.

That is why a model you can serve comfortably on a single device can be untrainable on the same device. It is not a compute limit. It is bookkeeping.

## Compute: two different bottlenecks, even within inference

Training is throughput work. You want every unit busy, you can pick your batch size freely, and nobody is waiting on an individual example. It is compute bound almost by construction.

Inference splits in two. Prefill, where the model processes the prompt, is compute bound: lots of tokens, all available at once, big efficient matrix multiplications. Decode, where it emits one token at a time, is memory bandwidth bound: the arithmetic per token is small but the whole weight set has to be read to produce it.

This is why a long prompt and a long answer stress different parts of the same box, and why "tokens per second" without saying which phase you measured is a meaningless number.

## Networking: a fabric versus a load balancer

Distributed training synchronizes gradients between workers on every step. That is a lot of traffic in a tight pattern with everyone waiting on the slowest participant, which is why serious training clusters spend real money on low latency, high bandwidth, non blocking fabrics. Latency spikes there do not slow one job, they stall all of it.

Inference has no such pattern. Requests are independent. What you need is ordinary front end networking, a load balancer, and enough bandwidth to move prompts and responses, which are small. If a vendor is selling you a training fabric for an inference deployment, that is a signal.

## Storage and the data path

Training is a streaming read problem. You read a large dataset repeatedly, shuffled, and if the pipeline cannot keep the accelerators fed you burn expensive hardware waiting on disk. Sequential throughput and enough parallel readers matter; you also want checkpoint writes to be fast, because a checkpoint is a large synchronous write that pauses everything.

Inference is a load once problem. You read the weights at startup and then storage goes nearly idle. The one thing worth optimizing is cold start: if your service restarts and takes minutes to read weights off slow storage, that is your outage length during a rolling deploy.

## What this means for planning

\`\`\`text
                 Training                      Inference
Memory           weights x4-6 + activations    weights + KV cache
Compute          throughput bound              prefill compute, decode bandwidth
Network          synchronized, latency critic  independent requests
Storage          sustained streaming reads     one big read at startup
Scaling unit     the whole job                 one replica
Failure          restart from checkpoint       drop one replica, retry
Utilization      near 100% by design           bursty, follows users
\`\`\`

The failure row is the one people miss. A training job is a single long lived unit of work: lose a node and you restart from the last checkpoint, so checkpoint frequency is a real design decision. An inference deployment is a fleet of interchangeable replicas: lose one, health checks pull it out, requests retry. Those need completely different operational treatment, and treating a training run like a web service is how you lose a week of compute to a node reboot.

So the practical advice splits the same way. If you are building to serve models, buy memory capacity and bandwidth, keep the network boring, and put your effort into batching, queueing, and cold start time.

If you are building to train, the accelerator interconnect and the data pipeline will decide whether you get value out of the hardware, and checkpointing discipline will decide whether you keep it.

If you are learning, do inference first. It is cheaper, it fits on hardware you can actually get, and every concept you learn about memory and bandwidth transfers directly to the training side later.

## References

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
`,
  },
  {
    slug: "mtu-jumbo-frames-pmtud",
    title: "MTU, Jumbo Frames, And The Black Hole In The Middle",
    date: "2026-06-04",
    tags: ["networking", "switching", "operations"],
    excerpt:
      "Small packets work, large ones vanish, and ping says everything is fine. That is an MTU problem, and here is how to find and fix it.",
    coverImage: "/images/blog/mtu-jumbo-frames-pmtud.jpg",
    coverCredit: {
      author: "@felixtriller",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/21480682@N03/2226679393",
    },
    content: `
## What MTU actually is

The maximum transmission unit is the largest payload a link will carry in one frame. On classic Ethernet that is 1500 bytes of IP packet, which becomes 1518 bytes on the wire once you add the Ethernet header and frame check sequence.

Two things about MTU cause most of the confusion. It is a property of a link, not of a network, so every hop can have a different one. And it is enforced by dropping, not by asking: a device that receives a frame too large for the next link either fragments it or discards it.

## Jumbo frames, and the condition attached

Jumbo frames raise the IP MTU to something like 9000 bytes. The benefit is fewer packets for the same data, which means fewer interrupts, less per packet header overhead, and lower CPU cost per gigabit. For storage traffic, backups, and replication on a dedicated segment it is a genuine win.

The condition is that every device in the path has to agree. Every host, every switch, every router interface. One access port left at 1500 in the middle of a jumbo enabled VLAN produces the worst possible symptom: small packets pass, large ones disappear, and nothing logs an error you will find.

Because of that, I only enable jumbo frames on segments I fully control end to end, typically a dedicated storage or backup VLAN. I leave general purpose and internet facing paths at 1500. The performance difference on mixed traffic is not worth the debugging.

Note also that switch vendors count differently. Some MTU settings refer to the IP payload, others to the whole frame including headers. Always set the switch value higher than the host value if you are unsure.

## Path MTU discovery, and how it breaks

IPv4 hosts set the Don't Fragment bit and rely on routers to report a problem. When a router cannot forward a packet because it is too big for the next link, it drops it and sends back an ICMP "fragmentation needed" message carrying the correct MTU. The sender caches that and shrinks. IPv6 removed router fragmentation entirely, so this mechanism is not optional there.

The break is that some networks block all ICMP. Now the oversized packet is dropped and the message that would have explained it never arrives. The connection completes its handshake, because SYN packets are small, and then hangs the moment real data flows. That is a PMTU black hole, and it is why "ping works but the transfer stalls" is a classic.

If you administer a firewall, do not block ICMP wholesale. Permit type 3 code 4 on IPv4 and packet too big on IPv6. Blocking them breaks the protocol on purpose.

## Finding the real MTU

Send progressively larger packets with fragmentation disabled and find where they stop getting through:

\`\`\`bash
# 1472 payload + 8 ICMP header + 20 IP header = 1500
ping -M do -s 1472 -c 2 10.20.0.10

# too big for a 1500 path, should fail cleanly
ping -M do -s 1473 -c 2 10.20.0.10

# jumbo check on a segment you configured for 9000
ping -M do -s 8972 -c 2 10.20.0.10
\`\`\`

Add 28 to the \`-s\` value to get the IP MTU. If 1472 succeeds and 1473 gives you "message too long" locally, your own interface is the limit. If 1473 just times out with no error, something upstream is dropping silently and you are in black hole territory.

\`tracepath\` walks the path and reports where the MTU changes, which is faster than bisecting by hand.

Set an interface MTU on Linux with:

\`\`\`bash
sudo ip link set dev eth1 mtu 9000
ip link show eth1 | head -1
\`\`\`

## Clamping MSS for tunnels

Any tunnel adds encapsulation overhead, so the usable MTU inside it is smaller than the underlying link. If PMTU discovery is unreliable across that path, and it usually is, clamp the TCP maximum segment size on the router so endpoints negotiate a size that fits:

\`\`\`bash
sudo iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \\
  -j TCPMSS --clamp-mss-to-pmtu
\`\`\`

This rewrites the MSS option in the handshake so both sides agree on segments that will fit. It only helps TCP, but TCP is where the visible pain usually is.

## A short checklist

When something works small and fails big: confirm the interface MTU on both endpoints, walk the path with \`tracepath\`, check every switch port in the VLAN rather than assuming the VLAN has one value, verify ICMP unreachables are permitted through every firewall in the path, and clamp MSS if a tunnel is involved. In my experience it is almost always one forgotten port or one overly enthusiastic ICMP deny rule.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [tracepath(8) manual page](https://man7.org/linux/man-pages/man8/tracepath.8.html)
- [iptables-extensions(8) manual page](https://man7.org/linux/man-pages/man8/iptables-extensions.8.html)
- [Jumbo frame](https://en.wikipedia.org/wiki/Jumbo_frame)
`,
  },
  {
    slug: "vector-databases-explained",
    title: "How Vector Databases Actually Work",
    date: "2026-06-05",
    tags: ["ai", "ml", "storage"],
    excerpt:
      "Embeddings, distance metrics, and approximate nearest neighbour indexes, explained without the hand waving. Plus the honest answer to whether you need a dedicated database.",
    coverImage: "/images/blog/vector-databases-explained.jpg",
    coverCredit: {
      author: "Eric Fischer",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/24431382@N03/6276642489",
    },
    content: `
## Embeddings are coordinates

An embedding model turns a piece of text into a fixed length list of numbers. A few hundred to a few thousand floats, always the same length for a given model. That list is a point in a high dimensional space, and the model is trained so that things with similar meaning land near each other.

That is the whole trick. Once text is coordinates, "find related documents" becomes "find nearby points," which is a geometry problem with decades of prior work behind it. A vector database is a system for storing those points and answering nearest neighbour queries quickly.

Two things worth internalizing early. The coordinates are only meaningful within one model: vectors from two different embedding models are not comparable, ever. And re embedding your corpus is the cost you pay whenever you change models, so pick deliberately.

## Distance metrics

Three metrics cover almost everything.

Cosine similarity measures the angle between two vectors and ignores their length. Euclidean distance measures straight line distance and does care about length. Dot product measures both at once.

For text embeddings, cosine is the usual choice, because the direction carries the meaning and the magnitude often carries something incidental like document length. There is a useful shortcut: if you normalize every vector to unit length when you store it, cosine similarity and dot product become the same computation, and Euclidean distance becomes a monotonic function of both. Normalize on write, use dot product on read, and stop thinking about it.

\`\`\`python
import numpy as np

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

docs = normalize(np.random.randn(10000, 768).astype("float32"))
query = normalize(np.random.randn(768).astype("float32"))

scores = docs @ query          # cosine, because everything is unit length
top = np.argpartition(-scores, 5)[:5]
print(sorted(top, key=lambda i: -scores[i]))
\`\`\`

That is a complete exact search engine in six lines. Keep it in mind before you deploy anything.

## Exact search is fine until it is not

Brute force compares the query to every stored vector. It is exact, trivially correct, and its cost is linear in the number of vectors times the dimension count. Ten thousand documents at 768 dimensions is a few million floating point operations, which is nothing.

At a million vectors it is still workable if you batch it. Somewhere past that, latency and memory push you toward an index. The threshold is much higher than most people assume, and I have watched people stand up a whole database service for a corpus that would fit in a numpy array.

## Approximate indexes in plain terms

Approximate nearest neighbour indexes trade a small amount of recall for a large amount of speed. Two families dominate.

HNSW builds a layered graph. Every vector is a node connected to its near neighbours, with sparse long range links in upper layers. A search starts at the top, greedily walks toward the query, drops a layer, and repeats. It is fast, gives high recall, and supports incremental inserts. The costs are memory, because you store the graph as well as the vectors, and build time.

IVF partitions the space into clusters, usually with k means, and stores which vectors belong to which cluster. A query finds the nearest few cluster centroids and only searches inside those. It is cheaper on memory and faster to build, but recall depends on how many clusters you probe, and vectors near a cluster boundary can be missed.

Both expose a knob that trades recall for latency: \`ef_search\` for HNSW, \`nprobe\` for IVF. Tune it against a real query set and measure recall, because the default is a guess about someone else's data. Product quantization compresses the stored vectors on top of either, saving a lot of memory at some further accuracy cost.

## The filtering trap

Real queries are rarely pure similarity. You want the nearest documents that also belong to a tenant, or are not archived, or are newer than a date.

The naive implementation retrieves the top k by similarity and then filters. If the filter is selective, you can easily get zero results back from a query that had thousands of valid matches, because all your top k belonged to the wrong tenant. This is the single most common bug I see in retrieval systems, and it presents as "the search is bad" rather than as an error.

You want filtering pushed into the search, either by applying the predicate during graph traversal or by partitioning the index so each tenant has its own. Any serious vector store supports one of these. Check which one yours does before you rely on it.

## Do you actually need one?

Honest answer: often not, at first.

Under a few hundred thousand vectors, a Postgres table with \`pgvector\` is usually the right call. You get similarity search plus real transactions, joins to your existing metadata, backups you already run, and one system to operate instead of two. Add an HNSW index when sequential scans get slow.

If everything fits in memory in one process and the corpus is static, a library index in memory is even simpler.

Reach for a dedicated vector database when you have tens of millions of vectors, need horizontal scaling, or need index features your existing database does not have. Those are real reasons. "It is what people use for this" is not.

## References

- [Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
- [Hierarchical navigable small world](https://en.wikipedia.org/wiki/Hierarchical_navigable_small_world)
- [Efficient and robust approximate nearest neighbor search using HNSW graphs](https://arxiv.org/abs/1603.09320)
- [Cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
`,
  },
  {
    slug: "storage-benchmarking-fio",
    title: "Benchmarking Storage With fio Without Fooling Yourself",
    date: "2026-06-06",
    tags: ["storage", "linux", "operations"],
    excerpt:
      "Most storage benchmarks measure the page cache, a drive's write buffer, or nothing useful at all. Here is how I set up fio so the numbers mean something.",
    coverImage: "/images/blog/storage-benchmarking-fio.jpg",
    coverCredit: {
      author: "Dmitry Nosachev",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=46899252",
    },
    content: `
## Four numbers, not one

"How fast is this disk" is not a question with one answer. There are four, and a device can be excellent at one and terrible at another.

Sequential throughput in MB/s, which matters for backups, media, and bulk copies. Random IOPS at small block sizes, which matters for databases, VM images, and anything with a lot of small files. Latency, usually at a stated percentile, which is what users actually feel. And consistency, meaning what happens to all three after the device has been busy for a while.

Vendor sheets quote the first two under ideal conditions. Your workload cares more about the last two.

## Why your first benchmark was wrong

There are four classic ways to measure nothing.

The page cache. Linux caches file data in RAM. A read test on a file that fits in memory measures RAM, and you get numbers that no storage device could produce. The fix is direct IO, or a working set several times larger than system memory, or both.

Short runs. Consumer SSDs write incoming data to a fast buffer region and flush it later. A thirty second write test may never leave that buffer. Run long enough to exhaust it and you see the real sustained rate, which can be dramatically lower.

Wrong queue depth. A single threaded, queue depth one test measures latency, not throughput. Flash devices need many outstanding requests to reach their rated IOPS. Testing a database workload at queue depth 64 is equally wrong in the other direction.

Fresh drive. A never used device performs better than one that has been filled and rewritten, because garbage collection has nothing to do yet. Precondition it if you care about steady state.

## A job file I trust

I keep this and edit the top section per run:

\`\`\`ini
[global]
ioengine=libaio
direct=1
filename=/mnt/test/fio.dat
size=16G
runtime=300
time_based=1
ramp_time=30
group_reporting=1
percentile_list=50:95:99:99.9

[seq-read]
rw=read
bs=1M
iodepth=32
numjobs=1
stonewall

[seq-write]
rw=write
bs=1M
iodepth=32
numjobs=1
stonewall

[rand-read-4k]
rw=randread
bs=4k
iodepth=32
numjobs=4
stonewall

[rand-write-4k]
rw=randwrite
bs=4k
iodepth=32
numjobs=4
stonewall

[latency-qd1]
rw=randread
bs=4k
iodepth=1
numjobs=1
stonewall
\`\`\`

The parts that matter: \`direct=1\` bypasses the page cache, \`ramp_time\` discards the warm up, \`time_based\` with a long \`runtime\` gets past write buffers, \`stonewall\` runs the sections in sequence rather than all at once, and \`percentile_list\` gives you tail latency rather than just an average.

Run it and keep the output:

\`\`\`bash
sudo fio storage.fio --output-format=json --output=results-$(date +%F).json
\`\`\`

## Reading the output

For the sequential jobs, read bandwidth. For the random jobs, read IOPS. For the queue depth one job, read the completion latency percentiles and ignore bandwidth entirely.

The number I look at hardest is \`clat\` at the 99.9th percentile. Averages hide the behavior that causes complaints. A device with a good average and a 99.9th percentile in the hundreds of milliseconds will produce a system that feels randomly broken, and nobody will be able to reproduce it on demand.

Also watch for a bandwidth number that starts high and collapses partway through the run. \`fio\` prints periodic status; if throughput drops off a cliff at minute two, you found the write buffer boundary and everything before it was fiction.

## Comparing fairly

If you are comparing two devices or two configurations, change exactly one thing. Same block sizes, same queue depths, same runtime, same filesystem, same fill level, same test file size. Write the parameters down next to the results, because in a month you will not remember whether the good number came from a queue depth of 32 or 1.

Two more habits. Benchmark through the layer you will actually use: if the workload runs on a VM on a filesystem on a RAID set, testing the raw device tells you about the device, not about your stack. And never point a write test at a filename on a device that holds data, because \`fio\` will happily create and overwrite exactly what you told it to.

## The honest limitation

Synthetic benchmarks tell you the shape of a device's performance. They do not tell you how your application will behave, because real workloads mix reads and writes, have locality, and come in bursts. Use \`fio\` to compare hardware and to sanity check a configuration change. Use production metrics to decide whether the storage is actually your problem. I have replaced a drive that benchmarked poorly and changed nothing about the symptom, because the bottleneck was somewhere else entirely.

## References

- [fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html)
- [Linux kernel administration guide](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
`,
  },
  {
    slug: "rag-chunking-and-evaluation",
    title: "Chunking And Evaluation Decide Your RAG Quality",
    date: "2026-06-07",
    tags: ["ai", "ml", "tools"],
    excerpt:
      "Retrieval augmented generation is mostly parsing, chunking, and evaluation. The model is the easy part, and it is not where your quality problems come from.",
    coverImage: "/images/blog-cover-default.png",
    content: `
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

\`\`\`python
def chunk(text, title, heading, max_chars=1200, overlap=150):
    paras = [p.strip() for p in text.split("\\n\\n") if p.strip()]
    out, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 2 > max_chars and buf:
            out.append(buf)
            buf = buf[-overlap:] + "\\n\\n" + p
        else:
            buf = (buf + "\\n\\n" + p).strip()
    if buf:
        out.append(buf)
    prefix = f"{title} > {heading}\\n\\n"
    return [prefix + c for c in out]
\`\`\`

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
`,
  },
  {
    slug: "cgroups-v2-resource-limits",
    title: "Cgroups v2: Actually Limiting What A Service Can Take",
    date: "2026-06-08",
    tags: ["linux", "virtualization", "operations"],
    excerpt:
      "One runaway process should not take down a host. Cgroups v2 gives you CPU, memory, and IO limits, and systemd exposes all of it in three lines.",
    coverImage: "/images/blog/cgroups-v2-resource-limits.jpg",
    coverCredit: {
      author: "barnoid",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/50359335@N00/151529520",
    },
    content: `
## The problem

A host runs a dozen services. One of them has a memory leak, or spawns a build that eats every core, or starts a backup that saturates the disk. Everything else on the box gets slow or dies, and the thing that actually gets killed by the out of memory handler is frequently not the guilty process.

Control groups fix this by putting resource accounting and limits on groups of processes rather than trusting them to behave. Version 2 replaced the older split hierarchy with a single unified tree, and it is what current distributions use by default.

## The unified hierarchy

Everything lives under one mount, normally \`/sys/fs/cgroup\`. Each directory is a cgroup, nesting is real containment, and processes are members of exactly one group.

\`\`\`bash
# where is this process?
cat /proc/$(pgrep -f my-service)/cgroup

# what controllers are available here?
cat /sys/fs/cgroup/cgroup.controllers

# live view by group
systemd-cgls
systemd-cgtop
\`\`\`

There is one rule that confuses everyone the first time: the no internal process constraint. A cgroup that has child cgroups cannot itself hold processes when controllers are enabled. Processes live in leaves. If you try to structure things otherwise the kernel will refuse and the error is not obvious.

## CPU: weight versus max

Two different knobs, for two different intentions.

\`cpu.weight\` is proportional share. Default 100, range 1 to 10000. It only matters under contention: a group with weight 200 gets twice the CPU time of one with weight 100 when both want more than is available. When the machine is idle, a low weight group can still use everything. This is what you want for prioritization.

\`cpu.max\` is a hard ceiling, written as quota and period in microseconds. \`200000 100000\` means at most two cores worth of time per 100 ms period, even on an idle machine. This is what you want for predictability and for stopping a runaway.

Use weight by default. Use max when you genuinely need a cap, and know that a hard cap causes throttling that can look like latency spikes in a request serving process.

## Memory: high, max, and who dies

\`memory.max\` is the hard limit. Exceed it and the kernel invokes the out of memory killer inside that group, so the process that overran is the one that dies, not some unrelated victim elsewhere on the host. That alone is worth configuring.

\`memory.high\` is the throttle. Above it the kernel puts heavy reclaim pressure on the group and slows its allocations, but does not kill anything. It is a much kinder first line of defense.

\`memory.min\` and \`memory.low\` protect memory from reclaim, which is how you keep an important service's working set resident while something else is churning.

I set \`high\` somewhat below \`max\` on anything I do not fully trust. The service degrades before it dies, and the degradation is visible in metrics, which gives you time to react.

## IO, the one people forget

CPU and memory limits are useless if a single backup job makes the disk unusable. \`io.weight\` does proportional sharing, and \`io.max\` sets hard limits per device in bytes and operations per second:

\`\`\`bash
# 8:0 is the device major:minor from lsblk
echo "8:0 rbps=52428800 wbps=52428800 riops=2000 wiops=2000" \\
  | sudo tee /sys/fs/cgroup/system.slice/backup.service/io.max
\`\`\`

Note that IO limits interact badly with buffered writes, because the writeback happens later and in a different context. \`io.latency\` and the writeback integration handle a lot of this, but if you need strict guarantees, direct IO in the application is more reliable than any cgroup setting.

## Do it through systemd

Writing to \`/sys/fs/cgroup\` by hand does not survive a reboot and is not how you should manage this. Every knob above has a unit file directive, and systemd creates the cgroup for you.

\`\`\`bash
sudo systemctl edit backup.service
\`\`\`

\`\`\`ini
[Service]
CPUWeight=20
CPUQuota=150%
MemoryHigh=2G
MemoryMax=3G
MemorySwapMax=0
IOWeight=20
TasksMax=512
\`\`\`

Then check what actually applied, which is the step people skip:

\`\`\`bash
systemctl show backup.service -p CPUQuotaPerSecUSec -p MemoryMax -p IOWeight
systemctl status backup.service | grep -i memory
\`\`\`

\`systemctl show\` reads the effective value. If it says \`infinity\` where you expected a number, the controller is not enabled on the parent slice or your drop in is not where you think it is.

The way I apply all of this is deliberately unambitious. Every service I write a unit for gets \`MemoryMax\` at roughly double its observed steady state, and \`TasksMax\` to bound fork bombs. Anything batch flavored, backups, indexing, media processing, gets a low \`CPUWeight\` and a low \`IOWeight\` so interactive services win under contention. I only add \`CPUQuota\` when a hard ceiling is genuinely required, because throttling has its own costs.

The goal is not to squeeze the machine. It is that a single bad process degrades itself first and the host last.

## References

- [Control Group v2 kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [systemd.service manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.exec manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [Linux kernel documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
`,
  },
  {
    slug: "llm-app-attack-surface",
    title: "The Attack Surface Of An LLM Application",
    date: "2026-06-09",
    tags: ["security", "ai", "cybersecurity"],
    excerpt:
      "A model that reads untrusted text and can call tools is a confused deputy waiting to happen. Where the real trust boundaries are and how I would defend them.",
    coverImage: "/images/blog/llm-app-attack-surface.jpg",
    coverCredit: {
      author: "Visual Content",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/143601516@N03/29723649810",
    },
    content: `
## Draw the boundaries first

Before anything else, draw the system and mark where trust changes. In a typical assistant that is: the user's input, whatever documents get retrieved, the model itself, any tools the model can invoke, and wherever the output ends up rendered.

Once it is drawn, one fact dominates everything else. The model receives instructions and data in the same channel, as text, with no reliable way to distinguish them. Every other problem on this list is a consequence of that.

## Prompt injection is not a filtering problem

Prompt injection is when text the model reads causes it to do something the operator did not intend. Direct injection is a user typing "ignore your instructions." That one is mostly a nuisance, because the user is only attacking their own session.

Indirect injection is the serious one. The model reads a web page, a support ticket, a code comment, a PDF, or a calendar invite that contains instructions, and it follows them. The attacker never touches your application. They just leave text where your system will pick it up.

People try to solve this with a blocklist of phrases. It does not work, and it is worth understanding why: there are unlimited paraphrases, the content can be in another language, encoded, or split across documents, and you are trying to filter natural language with pattern matching. Treat mitigation as reducing blast radius, not as prevention.

The system prompt is not a security control either. It is a suggestion with good odds, and odds are not a boundary.

## Tool calling turns text into actions

A model that only produces text has limited consequences. A model that can call functions is now an authenticated actor in your system, and the classic confused deputy problem applies directly: it holds privileges the person or document influencing it should not have.

The rules I would hold to:

The model's tools run with the requesting user's permissions, never with a service account that can see everything. If the user cannot read that record, neither can the model on their behalf.

Anything destructive or externally visible requires human confirmation, and the confirmation must show what will actually happen, not a model generated summary of it. Sending, deleting, paying, merging, and posting all qualify.

Tool inputs are validated like any other untrusted input, because that is what they are. The model is a very fluent user of your API and it will produce arguments no human would.

\`\`\`python
ALLOWED = {"search_docs", "get_ticket", "list_files"}   # read only by default
CONFIRM = {"send_email", "delete_file", "create_pr"}

def dispatch(call, ctx):
    if call.name not in ALLOWED | CONFIRM:
        raise PermissionError(f"tool not permitted: {call.name}")
    args = SCHEMAS[call.name].validate(call.args)      # reject, do not coerce
    if not ctx.user.can(call.name, args):              # user's rights, not the app's
        raise PermissionError("caller lacks permission")
    if call.name in CONFIRM:
        return ctx.request_human_approval(call.name, args)
    return TOOLS[call.name](**args, as_user=ctx.user)
\`\`\`

The important detail is \`as_user\`. If your tools run as the application, an injected instruction has the application's full reach.

## Output is an untrusted string

Model output is attacker influenceable text, so handle it the way you handle any attacker influenceable text.

Rendering it as HTML without sanitizing gives you cross site scripting. Passing it to a shell gives you command injection. Concatenating it into SQL gives you SQL injection. Emitting a markdown image whose URL contains conversation content exfiltrates data the moment the client fetches it, with no click required.

None of these are new vulnerability classes. They are the old ones with a new source, which is good news, because the existing defenses work: escape on output, parameterize queries, never build shell strings, and restrict which hosts rendered content may load from.

## The retrieval layer leaks

If your assistant retrieves from a shared corpus, access control has to be enforced in the retrieval query, not by asking the model to be discreet. Filter by the caller's permissions in the search itself, and re check on the way out.

Two subtler leaks. Documents get indexed once with the permissions they had at the time, so revocations need to propagate into the index. And an attacker who can add content to the corpus can plant injected instructions for other users to retrieve later, which makes "who can write to the knowledge base" a security question.

## What I would actually build

Least privilege on every tool, scoped to the requesting user. Read only by default, with an explicit allowlist for anything else. Human confirmation on irreversible actions, showing real parameters. Output treated as untrusted at every sink. Access control enforced in retrieval. Rate limits and spend caps, because an injected loop is also a billing incident. And full logging of prompts, retrieved sources, tool calls, and arguments, because without that you cannot investigate anything.

None of that stops injection. It means a successful injection reads a document it should not have rather than emptying an account, and that is the realistic goal today.

## References

- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
`,
  },
  {
    slug: "systemd-units-homelab",
    title: "Writing systemd Units That Behave",
    date: "2026-06-10",
    tags: ["linux", "operations", "homelab"],
    excerpt:
      "Stop running services in a terminal multiplexer. A good unit file gives you restarts, logging, dependency ordering, and sandboxing for about fifteen lines of config.",
    coverImage: "/images/blog/systemd-units-homelab.jpg",
    coverCredit: {
      author: "barnoid",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/50359335@N00/151529520",
    },
    content: `
## Why I stopped using screen and cron

For a long time my self written services ran inside a terminal multiplexer, started by hand, with output going to a log file I redirected myself. It works right up until the machine reboots at 4 in the morning and nothing comes back, or until the process dies and nobody notices for a week.

systemd solves all of that, and the cost is one text file. You get automatic start at boot, restart on failure, dependency ordering, structured logging, resource limits, and a sandbox, without writing any of it yourself.

## The minimum viable unit

Put this at \`/etc/systemd/system/metrics-collector.service\`:

\`\`\`ini
[Unit]
Description=Metrics collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=metrics
Group=metrics
WorkingDirectory=/opt/metrics
ExecStart=/opt/metrics/venv/bin/python -u collector.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
\`\`\`

\`\`\`bash
sudo systemctl daemon-reload
sudo systemctl enable --now metrics-collector
journalctl -u metrics-collector -f
\`\`\`

Two details worth calling out. \`After=network-online.target\` with the matching \`Wants=\` is what you need when the service must reach the network at startup; plain \`network.target\` only means the networking stack has been configured, not that an address exists. And \`-u\` on Python, or the equivalent for your runtime, disables output buffering so logs appear in the journal immediately instead of in 4 KB bursts.

Never run a service as root because it was easier. Create a system user with no shell and no home directory.

## Restart policy, and not making things worse

\`Restart=on-failure\` restarts on a non zero exit or a signal, but not on a clean exit. \`Restart=always\` restarts even on success, which is right for a daemon that should never exit and wrong for anything that legitimately finishes.

The failure mode people hit is a service that crashes instantly because a dependency is down, restarts, crashes, and hammers that dependency hundreds of times a minute. Rate limiting is built in:

\`\`\`ini
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
\`\`\`

Five failures in five minutes and systemd stops trying and leaves the unit in a failed state, which is exactly what you want, because a unit sitting in \`failed\` is visible and a unit in a crash loop looks like it is running.

## Sandboxing you get for free

This is the part I wish I had used sooner. A handful of directives dramatically reduce what a compromised service can reach:

\`\`\`ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/metrics
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
\`\`\`

\`ProtectSystem=strict\` makes the entire filesystem read only except \`/dev\`, \`/proc\`, \`/sys\`, and whatever you list in \`ReadWritePaths\`. That single line stops a lot of bad outcomes.

Grade your work:

\`\`\`bash
systemd-analyze security metrics-collector.service
\`\`\`

It scores each unit and lists what you left open. Do not chase a perfect score, but going from wide open to reasonably locked down is usually ten minutes of work. Add directives one at a time and restart between each, because \`SystemCallFilter\` in particular will break runtimes that need something you did not anticipate.

## Timers instead of cron

For periodic work, timers beat cron: the same logging, the same dependency handling, the same sandboxing, plus the ability to catch up on missed runs after downtime.

A oneshot service:

\`\`\`ini
[Unit]
Description=Nightly config backup

[Service]
Type=oneshot
User=backup
ExecStart=/usr/local/bin/backup-configs.sh
\`\`\`

And its timer, at \`backup-configs.timer\`:

\`\`\`ini
[Unit]
Description=Run config backup nightly

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
\`\`\`

\`Persistent=true\` runs a missed job after the machine comes back up. \`RandomizedDelaySec\` staggers things so twelve hosts do not all hit the same target at once. Enable the timer, not the service.

\`\`\`bash
systemctl list-timers --all
\`\`\`

## Debugging

\`systemctl status\` for the current state and the last few log lines. \`journalctl -u name -b\` for this boot, \`-p err\` to filter by priority, \`--since "10 min ago"\` to narrow. \`systemd-analyze verify unit.service\` catches syntax and dependency mistakes before you deploy them, which is worth running in CI if you keep unit files in a repository.

Two failure patterns cover most of what I hit. When a unit refuses to start and the logs say nothing useful, comment out the sandboxing directives and add them back one by one; that is the answer perhaps four times out of five. And when a unit starts fine by hand but fails at boot, it is an ordering problem: something it needs, usually the network or a mounted filesystem, was not ready yet, and the fix is a correct \`After=\` and \`Requires=\` rather than a sleep in the start script.

## References

- [systemd.service manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.timer manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- [systemd.exec manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [systemd-analyze manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html)
- [Control Group v2 kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
`,
  },
  {
    slug: "serving-models-batching-kv-cache",
    title: "Serving A Model: Batching, KV Cache, And Concurrency",
    date: "2026-06-11",
    tags: ["ai", "servers", "operations"],
    excerpt:
      "One request at a time is not a benchmark. What actually determines how many people a single inference host can serve, and which metrics tell you the truth.",
    coverImage: "/images/blog/serving-models-batching-kv-cache.jpg",
    coverCredit: {
      author: "letavua",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/42845968@N06/5171684817",
    },
    content: `
## One request is a bad benchmark

Almost every "how fast is this model" number you see was measured with a single request and no other load. That tells you the best case latency for one lucky user and nothing about capacity.

Serving is a queueing problem. What you actually need to know is how many concurrent users a host can carry before latency crosses the line where the product feels broken. Getting there means understanding three things: the two phases of generation, how batching exploits them, and why the key/value cache is your real capacity limit.

## Two phases, two bottlenecks

Prefill processes the whole prompt at once. Every token is available, so the work is large dense matrix multiplication and the hardware runs near its compute limit. Prefill cost grows with prompt length and it determines time to first token.

Decode produces one token at a time, each depending on the last. The arithmetic per token is small, but producing it requires reading essentially all of the model weights out of memory. So decode is bandwidth bound, and it determines the inter token latency that a user perceives as typing speed.

Those two facts drive everything else. A long prompt with a short answer is a prefill problem. A short prompt with a long answer is a bandwidth problem. Tuning for one does not help the other.

## Why batching works

Here is the key insight: during decode, the weights get read from memory regardless of how many sequences you are processing. Serving one user reads the whole model to produce one token. Serving sixteen users reads the whole model once to produce sixteen tokens.

So aggregate throughput rises almost linearly with batch size until you run out of memory or hit the compute limit, while per user speed barely changes. Batching is close to free throughput, which is why nobody serious serves requests one at a time.

Naive static batching wastes most of that, because it collects a fixed group, runs it to completion, and makes short requests wait for the longest one. Continuous batching, which every modern serving stack implements, keeps a running set of sequences and swaps a finished one out for a queued one at each decode step. Utilization goes way up and queue time goes way down.

## The KV cache is your capacity limit

Every active sequence holds a key/value cache proportional to its length. Total KV memory is what is left after the weights, and it is a fixed budget:

\`\`\`python
def concurrency(total_gb, weight_gb, layers, kv_heads, head_dim,
                avg_tokens=2048, kv_bits=16, reserve_gb=2.0):
    gib = 1024 ** 3
    budget = (total_gb - weight_gb - reserve_gb) * gib
    per_token = 2 * layers * kv_heads * head_dim * (kv_bits / 8)
    per_seq = per_token * avg_tokens
    return int(budget // per_seq)

print(concurrency(24, 4.2, 32, 8, 128, avg_tokens=2048))
\`\`\`

Change \`avg_tokens\` from 2048 to 8192 and watch capacity divide by four. That is the single most important operational fact about serving: allowing longer contexts reduces how many users you can serve, proportionally, and it does it silently until you hit the wall.

Two mitigations worth knowing. Paged attention stores the cache in fixed size blocks instead of contiguous per sequence reservations, which removes most of the fragmentation waste and is why modern servers fit far more concurrent sequences than naive math predicts. And prefix caching reuses the cache for a shared prompt prefix across requests, which is a large win when every request starts with the same long system prompt.

## Queueing, timeouts, backpressure

When the batch is full, new requests queue. If arrivals exceed capacity, the queue grows without bound and everyone gets a terrible experience instead of some people getting a good one.

Set a maximum queue depth and reject beyond it with a clear retry signal. Set a request timeout and a maximum generation length so one pathological request cannot hold a slot forever. Cap the output tokens per request, because an unbounded generation is an unbounded resource commitment.

Rejecting load is not failure. It is the behavior that keeps the accepted load fast.

## What I measure

Four metrics, always at percentiles, never as averages: time to first token, which is prefill plus queue wait; inter token latency, which is decode speed; end to end request latency; and total output tokens per second across the host.

Then a small load generator that ramps concurrency and records all four, so I get a curve instead of a point. The curve has a knee. Below it, throughput rises and latency is flat. Above it, throughput plateaus and latency climbs while requests sit in queue. Your operating limit is just below the knee, and no amount of reading spec sheets will tell you where it is on your hardware with your prompts.

## References

- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Prometheus documentation](https://prometheus.io/docs/introduction/overview/)
`,
  },
  {
    slug: "object-storage-on-prem",
    title: "Running S3 Compatible Object Storage On Your Own Hardware",
    date: "2026-06-12",
    tags: ["storage", "servers", "homelab"],
    excerpt:
      "Object storage is not a file share with a different name. What the API buys you, how durability really works, and where it is the wrong tool.",
    coverImage: "/images/blog/object-storage-on-prem.jpg",
    coverCredit: {
      author: "blakespot",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/35448539@N00/2378337709",
    },
    content: `
## Why not just use a file share

A file share gives you a hierarchy, partial writes, locking, and POSIX semantics. That is a lot of machinery, and it is the reason file shares are hard to scale and unpleasant to use across a network you do not control.

Object storage throws most of it away. An object has a key, some bytes, and metadata. You put the whole thing or you get the whole thing. There is no directory tree, only keys that contain slashes and a listing API that pretends. There is no partial update, no locking, no rename.

Losing those features is the point. Without them a system can spread objects across many machines, replicate them, and serve them over plain HTTP without coordination. If your workload is "write a file once, read it many times, never modify it in place," object storage fits it exactly. Backups, artifacts, media, logs, dataset snapshots, and model weights are all that shape.

## The API is the product

The reason to run something S3 compatible rather than inventing your own is that the S3 API is effectively the interface every tool already speaks. Backup software, container registries, log shippers, database dump tools, CI systems, and every cloud SDK can point at an endpoint and a set of credentials.

That is real leverage. You configure a backup tool to write to your own hardware today, and the same configuration points at a cloud provider tomorrow with a URL change.

\`\`\`bash
aws --endpoint-url https://s3.lab.example.net s3 mb s3://backups
aws --endpoint-url https://s3.lab.example.net s3 cp ./dump.sql.zst s3://backups/db/
aws --endpoint-url https://s3.lab.example.net s3api put-bucket-versioning \\
  --bucket backups --versioning-configuration Status=Enabled
\`\`\`

Note the moving parts: an endpoint, a bucket, a key, and a credential pair. That is the whole model.

## Durability: replication versus erasure coding

Two ways to survive a failed disk.

Replication stores N full copies. Simple, fast to read, fast to repair, and it costs N times the raw capacity. Three copies means you use three terabytes to store one.

Erasure coding splits an object into K data fragments plus M parity fragments and spreads all of them across devices. Any K of the K+M fragments reconstruct the object, so you survive M failures. The overhead is (K+M)/K, so an 8+4 scheme survives four failures at 1.5x the raw capacity instead of the 5x that five replicas would cost.

Erasure coding is the better deal on space and the worse deal on CPU, small object efficiency, and repair time. Reconstructing an object requires reading fragments from many devices, so rebuilds are IO heavy. Small objects fragment poorly, since fragment count is fixed regardless of size.

The thing to understand clearly: neither is a backup. Both protect against device failure inside one system. Neither protects against a mistaken delete, a bad script, ransomware, or the building. Cross site replication and versioning do that.

## Buckets, policies, and keys

Access is a bucket policy plus an access key and secret. The mistakes are always the same two: one credential pair used everywhere, and a policy that grants more than the client needs.

Give every consumer its own credential, scoped to its own bucket or key prefix, with only the actions it uses. A backup agent needs to put objects and probably list them. It does not need to delete them, and denying delete is a meaningful defense against a compromised host wiping its own backups.

\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::backups",
        "arn:aws:s3:::backups/host-a/*"
      ]
    }
  ]
}
\`\`\`

Note that \`ListBucket\` applies to the bucket resource while object actions apply to the key pattern. Getting that split wrong is the most common reason a policy silently does not work.

## Versioning, object lock, and lifecycle

Versioning keeps old copies when an object is overwritten or deleted, which turns "someone deleted the backups" from an incident into an inconvenience. Object lock goes further and makes objects immutable for a retention period, so even an administrator credential cannot remove them until it expires. For backups exposed to any machine that could be compromised, that is the control worth having.

The obvious catch is that versions and locked objects consume space forever unless you manage them. Lifecycle rules expire noncurrent versions after a set number of days, and they are not optional at any real scale. Set them at the same time you turn versioning on, not later, because later is after the disks fill.

## Where it does not fit

Object storage is a bad database, a bad home directory, and a bad place for anything that needs in place modification, byte range writes, or file locking. Do not put a VM disk image on it and expect it to behave. Do not use it for a working directory where files change constantly, because every change writes a whole new object.

It is also not automatically fast for small objects. Each operation is an HTTP request with its own round trip and authentication, so a workload that writes ten thousand tiny files will be dominated by per request overhead. Batch small things into archives before uploading.

Used for what it is good at, it is one of the most useful services you can run on your own hardware, mostly because of how much software already knows how to talk to it.

## References

- [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [MinIO documentation](https://min.io/docs/minio/linux/index.html)
- [Object storage](https://en.wikipedia.org/wiki/Object_storage)
- [Erasure code](https://en.wikipedia.org/wiki/Erasure_code)
`,
  },
  {
    slug: "ai-in-security-operations",
    title: "How I Would Evaluate AI In Security Operations",
    date: "2026-06-13",
    tags: ["ai", "security", "monitoring"],
    excerpt:
      "My own take on where language models plausibly help a security team, where I would not let them near, and the questions I would ask any vendor making claims.",
    coverImage: "/images/blog/ai-in-security-operations.jpg",
    coverCredit: {
      author: "ResoluteSupportMedia",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/29456680@N06/4902364107",
    },
    content: `
## An opinion piece, clearly labelled

Everything below is my analysis, not reporting. I am not describing any specific product or claiming what any vendor has shipped. I am writing down the framework I would use to judge a claim, because the marketing in this space runs well ahead of the evidence and I would rather have a checklist than a vibe.

## Start with what the work actually is

Before evaluating a tool, be honest about where the hours go. In most security operations the time sinks are: triaging a large volume of alerts that are mostly not incidents, gathering context that lives in five different systems, writing up what happened, keeping detection content current, and chasing the same misconfiguration across many hosts.

Notice that very little of that is "detect the attack nobody has seen." Most of it is retrieval, correlation, and writing. That matters, because retrieval, correlation, and writing are exactly what language models are good at, and detection of novel attacks is exactly what they are not obviously good at.

It is also worth remembering that machine learning has been in security tooling for a long time and the successes are unglamorous: spam classification, malware family clustering, anomaly detection on numeric telemetry, user behaviour baselines. Those work because they operate on large volumes of labelled or structured data with a clear signal.

If a problem can be solved with a threshold, a rule, or a well understood classifier, use that. It is cheaper, faster, deterministic, explainable, and testable. Reaching for a language model when a \`WHERE\` clause would do is a common and expensive mistake.

## Three jobs I would plausibly hand a model

Context assembly. Given an alert, pull the asset owner, recent changes, the user's normal behaviour, related tickets, and relevant threat intel into one summary. This is retrieval and formatting, the output is checkable against sources, and being wrong is annoying rather than dangerous.

Translation between representations. Turning a plain description into a query in your SIEM's language, converting a detection rule between formats, explaining a piece of obfuscated script, summarizing what a config change does. The analyst still reads and runs the result, so there is a human check built in.

First draft writing. Incident timelines, post incident reports, ticket summaries, customer notifications. The facts come from the analyst, the model handles the structure and the prose. This is where I think the honest time savings are, and it is boring, which is why nobody advertises it.

## Three jobs I would not hand a model

Autonomous response. Isolating a host, disabling an account, or blocking a range based on a model's judgement with nobody in the loop. The failure mode is a self inflicted outage, and prompt injection through attacker controlled log content makes it worse: an attacker who can write text into your logs can potentially influence a system that reads them.

Being the detection itself. If the model decides what is malicious, you cannot explain a decision to an auditor, you cannot unit test it, its behaviour changes when the model changes, and you cannot reason about what it will miss. Deterministic detections with a model assisting the analyst is a much better division of labour.

Anything where a confident wrong answer is expensive and unverifiable. If a human cannot cheaply check the output, the output has no business being trusted.

## The questions I would ask

What is the baseline, measured how? "Reduces triage time" against what starting point, on whose alerts?

What is the false negative rate, not just the false positive rate? Anything that suppresses alerts is a filter, and a filter's dangerous error is the one it hides.

Can I see the evidence for each conclusion, linked to the source records? If it cannot cite, an analyst has to redo the work anyway.

What happens when the model is wrong, and who notices? Is there a review path, or does the output flow straight into a ticket nobody re reads?

Where does my data go, what is retained, and for how long? Security telemetry is among the most sensitive data an organization has.

Can I evaluate it on my own data before buying? A demo on curated examples proves nothing.

I keep those as a literal scorecard, one file per tool under evaluation, so the comparison is written down rather than remembered:

\`\`\`yaml
tool: alert-triage-assistant
evaluated_on: our own alert sample, 200 alerts, 2 weeks
baseline: median analyst triage time, measured before rollout
questions:
  false_negative_rate: unknown           # blocker, must be measured
  cites_evidence: yes, links to source events
  human_in_loop_for_actions: yes, read only integration
  data_retention: 30 days, vendor side   # needs review
  offline_eval_possible: yes
decision: pilot on low severity queue only, re-evaluate in 60 days
\`\`\`

If the important rows come back as "unknown" and the vendor cannot fill them in, that is the answer.

## The part nobody markets

Whatever you deploy becomes infrastructure you have to run. It needs monitoring, an on call story, version pinning, a rollback plan, and a way to tell whether its output quality has drifted. It becomes a dependency during an incident, which means it needs to work when other things are broken.

And it is a new attack surface: a system that ingests attacker influenced text and has access to your security data is a target worth attacking. I would threat model it exactly as carefully as I would threat model the SIEM itself.

My overall position, held loosely: this is a genuine productivity tool for the writing and retrieval parts of the job, an obvious risk in the decision making parts, and the deciding factor for any specific claim is whether the vendor can show you evidence on your own data rather than on theirs.

## References

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST SP 800-61 Rev. 2: Computer Security Incident Handling Guide](https://csrc.nist.gov/pubs/sp/800/61/r2/final)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
`,
  },
  {
    slug: "internal-pki-private-ca",
    title: "Running An Internal CA Without Regretting It",
    date: "2026-06-14",
    tags: ["security", "tools", "operations"],
    excerpt:
      "Self signed certificates everywhere is not a plan. A two tier internal CA, short lifetimes, and automated issuance, with the design decisions that matter most.",
    coverImage: "/images/blog/internal-pki-private-ca.jpg",
    coverCredit: {
      author: "Ashley Basil",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/28438417@N08/31172894922",
    },
    content: `
## The self signed trap

Everyone starts the same way. A service needs TLS, you generate a self signed certificate, you click through the browser warning, and you move on. Then you have twenty services, twenty warnings, and you have trained yourself to ignore certificate errors, which is the exact instinct that gets people compromised.

An internal certificate authority fixes this properly. You install one root certificate on your machines, every internal service gets a certificate that chains to it, and warnings mean something again.

The catch is that a CA is a long lived piece of infrastructure with a key that can impersonate every service you own. Set it up carelessly and you will either rebuild it in a year or hand an attacker something very useful.

## Two tiers, and why

Do not issue certificates directly from your root.

The root's job is to sign one thing: an intermediate CA certificate. Then the root key goes offline, encrypted, on media that is not attached to a running machine, ideally with a copy somewhere physically separate. The intermediate does the day to day issuing.

The reason is recovery. If the issuing key is compromised, you revoke the intermediate, bring the root out, sign a new intermediate, and reissue. Painful but survivable, and the root certificate distributed to every client stays valid. If the root key itself is compromised, you have to reinstall trust on every device you own, which in practice means the CA is finished.

Give the root a long life, ten to twenty years, since replacing it means touching every client. Give the intermediate something much shorter, a few years, since rotating it is comparatively cheap.

\`\`\`bash
# root, kept offline afterwards
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \\
  -keyout root.key -out root.crt -days 7300 -subj "/CN=Lab Root CA"

# intermediate CSR, signed by the root
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 \\
  -keyout inter.key -out inter.csr -subj "/CN=Lab Issuing CA 1"
\`\`\`

## Naming and SANs, decided up front

Get this right before you issue anything, because changing it means reissuing everything.

Modern clients ignore the common name entirely and validate against the subject alternative name extension. A certificate without a SAN will be rejected no matter how correct the CN looks. Every certificate needs SAN entries for every name and address clients will actually use.

Use real DNS names from a domain you control, including internally. Reserve a subdomain for internal use. Do not invent a fake top level domain, because the collision risk is real and some resolvers and browsers treat unknown suffixes strangely.

Include IP addresses in the SAN only when something genuinely connects by address, and prefer fixing the client to use a name.

\`\`\`ini
# csr.cnf
[req]
distinguished_name = dn
req_extensions     = ext
prompt             = no

[dn]
CN = metrics.lab.example.net

[ext]
subjectAltName = @alt
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt]
DNS.1 = metrics.lab.example.net
DNS.2 = metrics
IP.1  = 10.20.5.14
\`\`\`

\`\`\`bash
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 \\
  -nodes -keyout metrics.key -out metrics.csr -config csr.cnf
\`\`\`

## Short lifetimes beat revocation

Revocation on internal networks barely works. Certificate revocation lists need to be published, fetched, and honoured, and clients are inconsistent about all three. OCSP needs a responder that is reachable and available, which is another service to run and another thing to break.

The practical alternative is short lived certificates issued automatically. If a leaf certificate lives for weeks rather than years, a compromised key expires on its own before revocation would have propagated anyway.

That only works if issuance is automated, which is the real argument for running ACME internally instead of signing CSRs by hand. Set up an ACME capable CA, point your services at it, and renewal becomes something that happens without you. Manual issuance always ends in an expired certificate on a Sunday.

## Distributing trust

The root certificate has to land in every trust store that matters, and there are more of them than you expect: the OS store, the browser store on some platforms, Java's own store, Python's certifi bundle, Node's bundle, and every container image you build.

\`\`\`bash
sudo cp root.crt /usr/local/share/ca-certificates/lab-root.crt
sudo update-ca-certificates
\`\`\`

Push it with configuration management rather than by hand, and add it to your base container images. Distribute the root only, never the intermediate alone, and never the private key of either.

## Rules I hold to

The root key stays offline and encrypted, with a tested recovery copy. Leaf certificates are short lived and issued automatically. Every certificate has correct SANs. Keys are generated on the machine that will use them and never emailed or copied around. Certificate expiry is monitored and alerts before it matters, because monitoring is what turns a certificate outage into a ticket.

That last one is the difference between a CA that helps and a CA that becomes the thing that breaks everything twice a year.

## References

- [RFC 5280: X.509 Public Key Infrastructure Certificate and CRL Profile](https://www.rfc-editor.org/rfc/rfc5280.html)
- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555.html)
- [RFC 6960: Online Certificate Status Protocol](https://www.rfc-editor.org/rfc/rfc6960.html)
- [NIST SP 800-52 Rev. 2: Guidelines for TLS Implementations](https://csrc.nist.gov/pubs/sp/800/52/r2/final)
- [OpenSSL documentation](https://docs.openssl.org/master/man1/openssl-req/)
- [step-ca documentation](https://smallstep.com/docs/step-ca/)
`,
  },
  {
    slug: "reading-rfcs-practically",
    title: "How To Actually Read An RFC",
    date: "2026-06-15",
    tags: ["learning", "networking", "career"],
    excerpt:
      "Specifications are the primary source for everything on the network. They are also long and dry. Here is the reading order and the vocabulary that make them usable.",
    coverImage: "/images/blog/reading-rfcs-practically.jpg",
    coverCredit: {
      author: "Jordanhill School D&T Dept",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/42042252@N02/5039920492",
    },
    content: `
## Why bother

Almost every tutorial you find about a protocol is someone's summary of a specification, filtered through what they happened to need that day. The specification is the actual answer, and it is free, permanent, and usually more readable than its reputation suggests.

I started reading them because vendor documentation kept disagreeing with what I saw on the wire. The specification settles those arguments. It also teaches you something more durable than any product: how the protocol is supposed to behave, which is what lets you recognize when an implementation is wrong.

## What an RFC is, and is not

An RFC is a numbered document published by the RFC Editor. The number is permanent and the content never changes after publication. If something needs fixing, a new RFC is published that updates or obsoletes the old one.

That last point is the single most important thing to check, and the thing beginners get wrong most often. You can easily land on a document from decades ago that has been fully replaced. The header block at the top of the page tells you: it will say "Obsoletes: 1234" or, on the old document, "Obsoleted by: 9999." Always look before you invest an hour.

Also check the category. Standards Track documents are the ones defining what implementations should do. Informational documents describe something without standardizing it. Experimental means what it says. Best Current Practice describes recommended operational behaviour rather than protocol format. And not every RFC is serious, since the ones published on the first of April are jokes, some of them very good ones.

## The reading order I use

I do not read them front to back. That is how you bounce off.

First, the abstract and the status header. Thirty seconds to learn what it covers and whether it is still current.

Second, the table of contents. Specifications are structured predictably: terminology, overview, message formats, procedures, security considerations, IANA considerations. Knowing the shape means you can jump.

Third, the terminology section. Never skip this. Specifications define words precisely and often differently from casual usage, and misreading one defined term will make the whole document seem contradictory.

Fourth, whatever specific section I came for.

Fifth, the security considerations section, which is genuinely the most interesting part of most documents and the part most people never open. It is where the authors write down what they know can go wrong.

I read the introduction last, if at all. It is usually history and motivation, which is worth reading once you already know the protocol and useless before.

## RFC 2119 keywords are the whole game

When a document says it uses the keywords from RFC 2119, those words in capitals have exact meanings and the entire specification hangs on them.

MUST is an absolute requirement. MUST NOT is an absolute prohibition. SHOULD means there may be valid reasons to do otherwise, but understand them fully first. MAY is genuinely optional.

The practical consequence is interoperability. If your implementation depends on the other side doing something the specification only marks SHOULD, you have a bug waiting for a peer that made the other choice. When I read a specification looking for why two things do not interoperate, I search for the capitalized keywords first, because the answer is almost always at a SHOULD or a MAY where two implementers chose differently.

## Reading a packet format diagram

Older documents draw headers in ASCII, in rows of 32 bits, numbered left to right starting at zero. Once you can read one you can read them all, and you can turn it directly into parsing code.

\`\`\`python
import struct

# IPv4 header, first 20 bytes: version/IHL, DSCP/ECN, total length,
# identification, flags/fragment offset, TTL, protocol, checksum, src, dst
def parse_ipv4(buf):
    (vihl, tos, total_len, ident, flags_frag,
     ttl, proto, csum, src, dst) = struct.unpack("!BBHHHBBH4s4s", buf[:20])
    return {
        "version": vihl >> 4,
        "ihl_bytes": (vihl & 0x0F) * 4,
        "total_length": total_len,
        "ttl": ttl,
        "protocol": proto,
        "flags": flags_frag >> 13,
        "frag_offset": (flags_frag & 0x1FFF) * 8,
    }
\`\`\`

Writing that from the diagram, then checking it against a real capture, is the fastest way I know to make a specification stop being abstract. The bit manipulation for fields smaller than a byte is where the diagram earns its keep.

## Turn it into a lab

Reading alone does not stick. Pick something small, read the relevant section, then go verify it.

Capture the traffic and find the fields you just read about. Deliberately violate a MUST and observe what the other end does. Write a minimal parser or a minimal client. Compare two implementations and find where they differ at a SHOULD.

That loop, read a section then prove it on the wire, has taught me more than any course. And the habit generalizes: once you are comfortable reading a protocol specification, kernel documentation, hardware datasheets, and API references all stop looking intimidating, because they are the same kind of document.

## References

- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174: Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174.html)
- [RFC 2026: The Internet Standards Process](https://www.rfc-editor.org/rfc/rfc2026.html)
- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791.html)
- [Official Internet Protocol Standards](https://www.rfc-editor.org/standards)
- [Python struct module documentation](https://docs.python.org/3/library/struct.html)
`,
  },
  {
    slug: "threat-modeling-your-own-builds",
    title: "Threat Modeling Something You Built Yourself",
    date: "2026-06-16",
    tags: ["security", "homelab", "learning"],
    excerpt:
      "Four questions, one honest diagram, and a written record. Threat modeling your own projects is the highest value security work you can do for free.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Four questions

Threat modeling has a reputation as a heavyweight enterprise process with special software and a two day workshop. It is not. It is four questions, and you can answer them for a personal project in an afternoon.

What are we building? What can go wrong? What are we going to do about it? Did we do a good job?

That is the whole method. Everything else, every framework and diagram notation, is scaffolding to help you answer question two without missing something obvious.

## Draw the thing, honestly

Start with a diagram. Not an architecture diagram for a presentation, a working sketch that shows what actually exists.

Put on it: every process, every place data is stored, every flow between them, and every external entity that touches the system. Then draw trust boundaries as lines wherever the level of trust changes. Across the internet edge. Between an authenticated user and an anonymous one. Between a VLAN with your workstations and one with untrusted devices. Between a container and its host.

The boundaries are where the interesting problems live, because a boundary is a place where something is checked or, more usefully, a place where you forgot to check.

Two rules for the diagram. It must reflect reality, including the temporary thing you set up six months ago and never removed. And it must include the management and monitoring paths, because those are frequently the least protected and the most powerful.

## Finding threats without a framework fetish

For each element and each flow, ask what an attacker could do. STRIDE is a useful prompt list, not a religion:

Spoofing, meaning pretending to be someone else. Tampering, meaning modifying data in transit or at rest. Repudiation, meaning doing something without a trace. Information disclosure, meaning reading what you should not. Denial of service. Elevation of privilege.

Walk each flow and each store, and for each one ask the six. Most will not apply. The value is in the ones that make you pause.

For personal infrastructure I add a seventh that no framework lists: what happens when I am the threat. Fat fingered command, forgotten firewall rule left open during testing, a credential in a repository, a backup that has never been restored. Realistically, self inflicted incidents outnumber attacks for anything not exposed to the internet, and the mitigations are cheap.

## Rank by what you would actually do

Do not build a risk matrix with numeric scores you invented. Sort into three buckets instead.

Fix now: the threat is realistic, the impact is serious, and the fix is something you can do this week. Management interface reachable from an untrusted network. Default credential still in place. Backups that have never been test restored.

Fix later, written down: real but lower impact, or expensive to address. This bucket exists so the item is a decision rather than an oversight.

Accept, with a reason: you thought about it and chose not to act. Write the reason. "Physical access to the building is out of scope for my home network" is a legitimate position; forgetting to consider it is not.

## Write it down so it survives

The output is not the diagram, it is a short document you will actually reread. I keep it in the repository next to the thing it describes.

\`\`\`yaml
system: internal metrics stack
reviewed: 2026-06-16
assets:
  - name: metrics database
    why_it_matters: contains host inventory and traffic patterns
  - name: dashboard credentials
    why_it_matters: reused elsewhere if leaked, so rotate on any suspicion
trust_boundaries:
  - untrusted VLAN to management VLAN
  - browser to dashboard (authentication)
  - collector to database (service credential)
threats:
  - id: T1
    description: collector credential grants write access to all metrics
    boundary: collector to database
    stride: elevation of privilege
    decision: fix now
    mitigation: per collector credentials scoped to their own tables
  - id: T2
    description: dashboard reachable from untrusted VLAN
    boundary: untrusted VLAN to management VLAN
    stride: information disclosure
    decision: fix now
    mitigation: firewall rule, deny by default, allow management VLAN only
  - id: T3
    description: no audit log of dashboard queries
    stride: repudiation
    decision: accept
    reason: single operator, low value, revisit if others get access
\`\`\`

Structured text beats a diagram in a screenshot, because you can diff it. When the design changes, the change shows up in review.

## Redo it when the design changes

A threat model is only accurate at the moment you wrote it. Adding a new service, opening a port, granting someone access, or connecting a new network invalidates parts of it.

I re read mine whenever I add something that crosses a boundary, and completely whenever I change the network layout. It takes twenty minutes when the document already exists. Compare that to the time cost of discovering, months later, that a service you exposed for one afternoon of testing has been reachable ever since.

## References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [Microsoft Threat Modeling Tool threat categories (STRIDE)](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [NIST SP 800-30 Rev. 1: Guide for Conducting Risk Assessments](https://csrc.nist.gov/pubs/sp/800/30/r1/final)
- [Threat model](https://en.wikipedia.org/wiki/Threat_model)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
`,
  },
  {
    slug: "building-hyperscale",
    title: "Building Hyperscale: A 3D Datacenter Simulator",
    date: "2026-02-20",
    tags: ["three.js", "react", "simulation", "servers"],
    excerpt:
      "How I built an immersive 3D datacenter simulation with procedural generation, real-time thermal modeling, and React Three Fiber.",
    coverImage: "/images/blog/building-hyperscale.jpg",
    coverCredit: {
      author: "DOE / National Renewable Energy Laboratory (NREL)",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Data_center_infrastructure_in_the_United_States.jpg",
    },
    content: `
## Why I Built This

I wanted to build something that felt like walking through a real datacenter, not a simplified dashboard or an abstract visualization. The idea was straightforward: what if you could design, build, and operate a server room entirely from your browser?

The project started because I was spending a lot of time working with real rack hardware, cabling, and airflow planning. I wanted a way to prototype datacenter layouts and test ideas visually before committing to physical changes.

## Tech Stack

The foundation is **React Three Fiber**, which gives you the rendering power of Three.js with the component model of React. Every rack, server, and cable is a React component with its own state and lifecycle.

\`\`\`typescript
function Rack3D({ rack, position, isSelected, onSelect }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = hovered || isSelected ? 0.05 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.15
      );
    }
  });

  return <group ref={groupRef} position={position}>
    {/* Rack contents */}
  </group>;
}
\`\`\`

## Procedural Generation

The most interesting challenge was procedural generation. Each rack needs realistic equipment (servers, switches, storage arrays) placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. The scene is deterministic but still feels organic and varied.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes accordingly: racks shift from green (cool) through yellow and orange to red (critical).

This ties directly into real datacenter concepts like hot aisle/cold aisle containment and cooling capacity planning.

## What I Learned

Building this project taught me a lot about the relationship between software and physical infrastructure. Datacenter design is not just about putting servers in a room. It is about airflow, power distribution, redundancy, and monitoring. Translating those real constraints into a simulation forced me to understand them deeply.
`,
  },
  {
    slug: "why-homelabs-matter",
    title: "Why Homelabs Matter for Learning Networking",
    date: "2026-02-10",
    tags: ["networking", "homelab", "servers"],
    excerpt:
      "How running real enterprise hardware at home changed the way I learn about networking, systems, and troubleshooting.",
    coverImage: "/images/blog/why-homelabs-matter.jpg",
    coverCredit: {
      author: "Alan Levine",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Home_server_equipment.jpg",
    },
    content: `
## Beyond the Textbook

Reading about VLANs and subnetting is one thing. Configuring them on real hardware, breaking something, and spending two hours figuring out why your trunk port is dropping tagged traffic is a completely different experience. That is why I run a homelab.

My homelab runs multiple Dell enterprise servers with serious compute and storage capacity. It is not a Raspberry Pi cluster or a single tower PC. It is enterprise hardware running enterprise workloads, and that is the point.

## What I Actually Run

The core of the lab is built around Dell servers. I use them for:

- **Virtualization workloads** to simulate multi-site environments
- **Network segmentation testing** with real VLANs, trunking, and inter-VLAN routing
- **Storage experiments** to understand capacity planning, redundancy, and performance
- **Security testing** with isolated segments for controlled lab exercises

## Why Scale Matters

A lot of people ask why I need that much hardware at home. The answer is that real environments are messy. When you only have one server and one switch, everything is simple. When you have multiple systems, multiple network segments, and real data moving between them, you start hitting the problems that professionals deal with every day.

That is where the real learning happens: debugging a routing issue across segments, figuring out why a firewall rule is blocking traffic you expected to pass, or tracing a performance problem through layers of infrastructure.

## Building Good Habits

The homelab also taught me documentation habits. When you have complex infrastructure, you cannot rely on memory. I keep diagrams, runbooks, and change logs. Every time I make a change, I document what I did, why I did it, and how to reverse it if something goes wrong.

These habits carry directly into professional environments. The difference between a good administrator and a great one is often just documentation and discipline.
`,
  },
  {
    slug: "ncl-competition-lessons",
    title: "Lessons from Competing in the National Cyber League",
    date: "2026-01-28",
    tags: ["cybersecurity", "competition", "networking"],
    excerpt:
      "What I learned from reaching the top 1 percent in competitive cybersecurity, and why the process matters more than the ranking.",
    coverImage: "/images/blog/ncl-competition-lessons.jpg",
    coverCredit: {
      author: "U.S. Air Force photo by Tech. Sgt. Robert Biermann",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Units_compete_in_NAF-wide_cyber_competition_(5470557).jpg",
    },
    content: `
## What NCL Actually Tests

The National Cyber League is not about memorizing textbook definitions. It tests practical skills across categories like network traffic analysis, log investigation, scanning and reconnaissance, password cracking, web application security, and cryptography. Every challenge requires you to actually do the work, not just know the theory.

## How I Approach Challenges

My process for each challenge follows a consistent pattern:

1. **Read the problem carefully.** Most mistakes come from rushing past the details.
2. **Identify what tools and techniques apply.** Is this a packet capture? A log file? A web vulnerability?
3. **Work methodically.** Try the most likely explanation first, verify it, and move on.
4. **Document what you find.** Even during a timed competition, noting your process helps you avoid repeating dead ends.

## Tools I Use Most

- **Wireshark** for packet analysis challenges. Understanding TCP flows, DNS queries, and HTTP headers at the packet level is essential.
- **Nmap** for scanning and reconnaissance. Knowing how to interpret scan results tells you a lot about a target's configuration.
- **Python** for quick scripting when a challenge requires processing data or automating repetitive tasks.
- **Linux command line** for log analysis, file manipulation, and general problem solving.

## What Competitions Teach You

The ranking is nice, but the real value is in the habits you build. Competitions force you to stay calm under pressure, verify your work, and think logically when nothing is working the way you expect.

Those habits translate directly to real-world troubleshooting. When a network goes down at 2 AM, the person who stays methodical and follows evidence is the one who finds the problem.
`,
  },
  {
    slug: "mac-pro-rack-mount-homelab",
    title: "Running a Rack-Mount Mac Pro in a Homelab",
    date: "2026-02-18",
    tags: ["apple", "mac-pro", "servers", "homelab"],
    excerpt:
      "Why I added a rack-mount Mac Pro to my server infrastructure and what it actually brings to the table alongside Dell PowerEdge systems.",
    coverImage: "/images/blog/mac-pro-rack-mount-homelab.jpg",
    coverCredit: {
      author: "Gavin Lckg",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mac_Pro_2019_on_wheels.jpg",
    },
    content: `
## Why a Mac Pro in a Server Rack

Most people do not think of Apple hardware when they think of server rooms. But the 2019 Mac Pro in rack-mount configuration is a legitimate piece of enterprise hardware. It is designed to be mounted in a standard 19-inch rack, it supports ECC memory, and it was built for sustained heavy workloads.

I picked one up because I wanted to see how it holds up in a real lab environment next to my Dell PowerEdge systems. The short answer: it is excellent at certain things and completely wrong for others.

## The Hardware

The rack-mount Mac Pro I run has a 28-core Intel Xeon W, 384 GB of ECC DDR4, and dual AMD Radeon Pro Vega II GPUs. Apple designed the internal layout around airflow, with three massive fans pulling air across the entire system. It is quiet for what it is, and thermals stay very manageable even under sustained loads.

The build quality is on another level compared to typical server hardware. Everything about the chassis feels overengineered. The handles, the mounting rails, the internal PCIe card cages. It is clearly built for a different audience than a PowerEdge, but the precision is impressive.

## Where It Fits

The Mac Pro handles media-heavy workloads that my Dell servers would struggle with. Video transcoding, Xcode builds, and GPU-accelerated compute tasks all benefit from the hardware. If you are running Final Cut Pro pipelines or Compressor jobs in a production environment, the rack-mount Mac Pro makes a lot of sense.

For general server workloads like virtualization, storage, and networking, Dell wins every time. The PowerEdge line is designed for exactly that, and the price-to-performance ratio is not even close. But the Mac Pro fills a gap that Dell cannot, and having both in the same rack gives me flexibility.

## The Reality

Running macOS Server alongside Linux VMs is not as smooth as you might hope. Apple has been slowly pulling back from the server space for years. There is no iDRAC equivalent, no IPMI, and remote management is limited compared to what Dell offers. You are also locked into Apple's hardware ecosystem for upgrades.

But for specific use cases, the rack-mount Mac Pro is hard to beat. It is the best way to run macOS workloads in a rack, and if you need that, nothing else really competes.
`,
  },
  {
    slug: "dell-poweredge-r740-deep-dive",
    title: "Dell PowerEdge R740: The Backbone of My Homelab",
    date: "2026-02-15",
    tags: ["dell", "servers", "homelab", "hardware"],
    excerpt:
      "A deep dive into the PowerEdge R740 and why it is still one of the best platforms for a serious home lab environment.",
    coverImage: "/images/blog/dell-poweredge-r740-deep-dive.jpg",
    coverCredit: {
      author: "Dell Inc.",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R720xd_(1).jpg",
    },
    content: `
## Why the R740

The Dell PowerEdge R740 is a 2U rack server that hits a sweet spot between performance, expandability, and availability on the used market. I have multiple R740s in my lab, and they handle the bulk of my virtualization and storage workloads.

The R740 supports dual Intel Xeon Scalable processors, up to 3 TB of DDR4 ECC memory across 24 DIMM slots, and has room for up to 16 2.5-inch drives or 8 3.5-inch drives depending on the chassis configuration. For a homelab, that kind of flexibility is exactly what you want.

## iDRAC: The Killer Feature

One of the things that separates enterprise servers from consumer hardware is out-of-band management. Dell's iDRAC (Integrated Dell Remote Access Controller) gives you full remote control over the server, even when the OS is not running. You can monitor hardware health, view real-time power consumption, access the console remotely, and even mount virtual media for OS installations.

I cannot overstate how much this matters in a lab environment. When you are testing things and inevitably break an OS installation, being able to remotely access the console and reinstall without physically touching the machine saves hours.

## Storage Configuration

I run my R740s with a mix of SSDs and spinning drives. The front bays hold NVMe and SATA SSDs for VM storage, while a separate chassis extension handles bulk storage on larger drives. The PERC H740P RAID controller handles the hardware RAID, though I have been experimenting with passing drives through to ZFS for more flexibility.

## Noise and Power

The honest truth about running enterprise servers at home is that they are loud and power-hungry. An R740 under load pulls around 400 to 600 watts, and the fans are not subtle. I have spent time tuning fan profiles through iDRAC and making sure the ambient temperature stays reasonable, but it is never going to be silent.

If you are considering one for a homelab, plan for the power bill and the noise. It is worth it for the capabilities, but go in with realistic expectations.

## Getting One

Used R740s are available from resellers and auction sites. Prices vary a lot based on configuration, but you can get a solid base system for a reasonable price and add memory and drives over time. Buy from reputable sellers, check the service tag for warranty status, and inspect the drive backplane before committing.
`,
  },
  {
    slug: "apple-silicon-server-future",
    title: "Could Apple Silicon Replace x86 in the Server Room?",
    date: "2026-02-12",
    tags: ["apple", "servers", "hardware", "mac-pro"],
    excerpt:
      "Apple Silicon changed the laptop game. Here is why it probably will not replace x86 in datacenters any time soon, and what would need to change.",
    coverImage: "/images/blog/apple-silicon-server-future.jpg",
    coverCredit: {
      author: "Sonic8400",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apple_M1_-_APL1102_-_IHS_removed.jpg",
    },
    content: `
## The Performance Argument

Apple Silicon delivers incredible performance per watt. The M-series chips consistently outperform Intel and AMD in single-threaded workloads while sipping power. If you have used an M-series Mac, you know the difference is real. Fans rarely spin up, battery life is outstanding, and sustained performance is genuinely impressive.

So why not put that efficiency into a server?

## What Servers Actually Need

Server workloads are different from desktop workloads. Servers need massive memory capacity, ECC support at scale, high-bandwidth I/O, and standardized management interfaces. The current Apple Silicon lineup maxes out at 192 GB of unified memory on the M2 Ultra, which sounds like a lot until you realize that a single PowerEdge R740 can hold 3 TB.

Servers also need PCIe lanes for network cards, storage controllers, and accelerators. Apple's approach of integrating everything into the SoC is brilliant for laptops but limiting for servers that need to be configured for specific workloads.

## The Software Problem

Even if Apple built the perfect server chip, the software ecosystem is not ready. The vast majority of server software is built and tested for x86 Linux. Yes, ARM servers exist (AWS Graviton is a great example), but Apple's ARM implementation runs macOS, not Linux. Running Linux on Apple Silicon is possible through projects like Asahi Linux, but it is not production-ready for server workloads.

## What I Think Will Happen

Apple will probably never make a traditional rack-mount server again. But Apple Silicon will continue to find its way into edge computing, media processing pipelines, and development infrastructure. The Mac Pro with Apple Silicon (if and when it arrives) will likely be positioned as a workstation, not a server.

For general-purpose server workloads, x86 (and increasingly ARM via Graviton and Ampere) will remain dominant. The economics and ecosystem are just too established for Apple to disrupt without a fundamentally different approach.

## The Takeaway

Apple Silicon is incredible technology. It just solves a different problem than what most servers need. Understanding that distinction is important for anyone evaluating infrastructure decisions.
`,
  },
  {
    slug: "zfs-on-enterprise-hardware",
    title: "Running ZFS on Dell Enterprise Hardware",
    date: "2026-02-08",
    tags: ["storage", "zfs", "servers", "homelab"],
    excerpt:
      "How I set up ZFS on my Dell PowerEdge servers and why it changed my approach to storage management.",
    coverImage: "/images/blog/zfs-on-enterprise-hardware.jpg",
    coverCredit: {
      author: "Markus Then",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ZFS_hardware_storage_29.jpg",
    },
    content: `
## Why ZFS

ZFS is a filesystem and volume manager that handles things most filesystems leave to external tools. It does its own RAID (called RAIDZ), snapshots, compression, deduplication, checksumming, and self-healing. Once you use ZFS, going back to traditional RAID controllers and ext4 feels primitive.

The killer feature is data integrity. ZFS checksums every block of data and can detect and correct silent corruption automatically. In a homelab where you are storing data you care about, that matters.

## Setting It Up on a PowerEdge

Running ZFS on Dell hardware requires some decisions. The PERC RAID controller that comes standard with most PowerEdge servers wants to manage the drives itself. For ZFS, you want the OS to see the raw drives. That means either flashing the PERC to IT mode (so it acts as a simple HBA) or using a separate HBA card.

I went with flashing the PERC H330 to IT mode on one of my R740s. The process involves downloading the firmware from Broadcom, booting into the UEFI shell, and running the flash utility. It is straightforward if you follow the steps carefully, but it is permanent (or at least annoying to reverse), so make sure you want ZFS before committing.

## Pool Layout

My main ZFS pool is a RAIDZ2 configuration across 8 drives. RAIDZ2 gives me double parity, meaning I can lose any two drives simultaneously without data loss. For a homelab, that is a good balance between capacity and safety.

I also run a separate pool of mirrored SSDs for VM storage. Mirrors give the best random I/O performance, which is what VMs need most.

\`\`\`bash
zpool create tank raidz2 /dev/sda /dev/sdb /dev/sdc /dev/sdd /dev/sde /dev/sdf /dev/sdg /dev/sdh
zpool create fast mirror /dev/nvme0n1 /dev/nvme1n1
\`\`\`

## Compression and Snapshots

I enable LZ4 compression on all datasets by default. LZ4 is fast enough that it actually improves performance in many cases because you are writing less data to disk. The compression ratios vary by workload, but I typically see 1.3x to 1.8x on general data.

Snapshots are the other game changer. I take automated snapshots every hour and keep daily snapshots for 30 days. Rolling back a VM or recovering a deleted file takes seconds instead of hours.

## Lessons Learned

ZFS rewards careful planning. Choose your pool layout thoughtfully because changing it later means destroying and recreating the pool. Buy drives from different batches to avoid correlated failures. And always have more RAM than you think you need, because ZFS uses memory aggressively for caching.
`,
  },
  {
    slug: "10gbe-networking-homelab",
    title: "Upgrading to 10GbE Networking in a Homelab",
    date: "2026-02-05",
    tags: ["networking", "homelab", "hardware"],
    excerpt:
      "How I moved from gigabit to 10 gigabit Ethernet across my lab and what actually changed in practice.",
    coverImage: "/images/blog/10gbe-networking-homelab.jpg",
    coverCredit: {
      author: "Dmitry Nosachev",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Intel_X540-T2.jpg",
    },
    content: `
## Why 10GbE

Gigabit Ethernet was fine for a while. But once you start moving large VM images, running iSCSI or NFS storage, or doing bulk data transfers between servers, 1 Gbps becomes a real bottleneck. I was regularly saturating my gigabit links during backup windows and VM migrations.

10GbE gives you ten times the bandwidth, obviously, but the practical improvement is even bigger than that sounds. Operations that used to take minutes now take seconds. VM live migrations that were unreliable over gigabit become smooth and fast.

## The Hardware

For the network side, I picked up a used Mellanox ConnectX-3 SFP+ card for each server. These are dual-port 10GbE cards that you can find for very little money on the used market. They are well-supported in Linux with the mlx4 driver and work out of the box on most distributions.

For switching, I am using a Mikrotik CRS309-1G-8S+IN. It has eight SFP+ ports and one gigabit copper port for management. It is not a full L3 switch, but for a homelab it handles 10GbE switching at wire speed and costs a fraction of what Cisco or Arista would charge.

I am using DAC (Direct Attach Copper) cables between the switch and servers. DACs are cheaper than optical transceivers for short runs and work perfectly in a single-rack setup.

## Configuration

The nice thing about 10GbE with SFP+ is that it works exactly like gigabit Ethernet at the OS level. Assign an IP, set up your routes, and go. There is no special configuration needed beyond installing the NIC and connecting the cables.

I did set up jumbo frames (MTU 9000) across the 10GbE network to reduce overhead for large transfers. This requires consistent MTU settings on every device in the path, including the switch, or you will get fragmentation issues that are painful to debug.

## What Changed

The biggest quality-of-life improvement is VM storage. I run NFS datastores for some of my virtualization hosts, and going from gigabit to 10GbE made NFS feel local. Boot times dropped, snapshot operations got faster, and I stopped worrying about storage I/O being a bottleneck.

Backup windows also shrank significantly. A full backup that took 45 minutes over gigabit now finishes in about 5 minutes. That means I can take more frequent backups without impacting other workloads.
`,
  },
  {
    slug: "ipmi-remote-management",
    title: "IPMI and Out-of-Band Management Explained",
    date: "2026-02-02",
    tags: ["servers", "hardware", "networking"],
    excerpt:
      "Why out-of-band management is essential for running servers, and how IPMI and iDRAC actually work under the hood.",
    coverImage: "/images/blog/ipmi-remote-management.jpg",
    coverCredit: {
      author: "Phiarc",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ASPEED_AST2400_BMC_Baseboard_management_controller.jpg",
    },
    content: `
## What Is Out-of-Band Management

Out-of-band (OOB) management means you can control and monitor a server independently of the main operating system. Even if the OS is crashed, the disk is failed, or the machine is powered off, you can still access the hardware remotely. This is accomplished through a dedicated management controller that has its own network interface, its own processor, and its own firmware.

On Dell servers, this is called iDRAC. On HP servers, it is iLO. On Supermicro, it is IPMI/BMC. The underlying protocol for all of them is IPMI (Intelligent Platform Management Interface), though each vendor adds their own web interface and features on top.

## Why It Matters

In a production environment, walking up to a server to plug in a monitor and keyboard is not always possible. The server might be in a different building, a different city, or a colocation facility where physical access takes time.

In a homelab, it still matters. My servers are in a closet, and I manage them entirely from my desk. If an OS hangs during a kernel update, I can remote into iDRAC, access the virtual console, and fix it without getting up. That might sound like a convenience, but multiply it by dozens of incidents over time and it becomes essential.

## How It Works

The management controller sits on a dedicated ARM processor on the server motherboard. It has its own ethernet port (or shares one with the host via a feature called shared LOM). It runs its own lightweight OS and web server.

When you connect to the iDRAC web interface, you can:

- View hardware health (temperatures, fan speeds, power draw)
- Access a virtual console (like plugging in a monitor remotely)
- Mount virtual media (boot from an ISO stored on your workstation)
- Power cycle the server
- Update firmware
- View system event logs

## Setting It Up

The most important thing is to put your management interfaces on a separate, isolated network. Never put iDRAC or IPMI on the same network as your production traffic. These management interfaces have had security vulnerabilities in the past, and exposing them to the internet is asking for trouble.

I have a dedicated management VLAN that only my administration workstation can reach. The iDRAC interfaces get static IPs on this VLAN, and the firewall blocks all traffic to them from any other segment.

## Practical Tips

Change the default password immediately. Enable HTTPS and disable HTTP. Keep the firmware updated. Set up email alerts for hardware failures so you know about a failed drive before it becomes a failed array. And document the IP addresses and credentials somewhere secure.
`,
  },
  {
    slug: "server-rack-cable-management",
    title: "Cable Management in a Server Rack",
    date: "2026-01-30",
    tags: ["servers", "homelab", "hardware"],
    excerpt:
      "Good cable management is not about aesthetics. It is about airflow, troubleshooting speed, and not hating yourself six months from now.",
    coverImage: "/images/blog/server-rack-cable-management.jpg",
    coverCredit: {
      author: "ShakataGaNai",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cable_Management_Dell_1950.jpg",
    },
    content: `
## Why It Matters

Cable management in a server rack is one of those things that seems optional until you need to trace a cable at 2 AM during an outage. Or until your servers start overheating because a rats nest of cables is blocking half the airflow through the rack.

I have seen racks where every cable was a mystery. Nobody knew what connected where, and pulling one cable meant risking disconnecting something important. That is what bad cable management looks like in practice.

## My Approach

Every cable in my rack serves a documented purpose. I label both ends of every cable with a label maker, using a consistent naming scheme. The label includes the source device, port, destination device, and port. It takes a few extra minutes during installation, and it saves hours during troubleshooting.

I route power cables on one side of the rack and data cables on the other. This keeps things organized and reduces electromagnetic interference, though at these distances EMI is rarely a real problem.

## Velcro Over Zip Ties

I use velcro straps exclusively, never zip ties. Zip ties seem convenient until you need to add or remove a cable. Then you are cutting zip ties, potentially nicking other cables in the process, and replacing them all. Velcro straps can be opened, adjusted, and resealed in seconds.

## Patch Panels

For Ethernet, I run all connections through a patch panel at the top of the rack. The servers connect to the rear of the patch panel with short cables, and the front of the patch panel connects to the switch with color-coded patch cables. This means I never need to reach behind a server to change a network connection.

## Service Loops

I leave a small service loop of excess cable at each connection point. This gives me enough slack to pull a server forward on its rails for maintenance without disconnecting anything. It also means I can reroute cables if I rearrange equipment.

## Power

Power cables get their own vertical cable manager on the right side of the rack. Each PDU (Power Distribution Unit) is mounted vertically, and power cables run straight from the PDU to the server's power supply. I use C13/C14 cables cut to the right length rather than coiling excess cable.
`,
  },
  {
    slug: "proxmox-vs-esxi",
    title: "Proxmox vs ESXi: Which Hypervisor for a Homelab",
    date: "2026-01-25",
    tags: ["virtualization", "servers", "homelab"],
    excerpt:
      "I have run both Proxmox and VMware ESXi in my lab. Here is how they compare for real workloads.",
    coverImage: "/images/blog/proxmox-vs-esxi.jpg",
    coverCredit: {
      author: "Proxmox Server Solutions GmbH",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Proxmox-VE-8-0-Cluster-Summary.png",
    },
    content: `
## The Two Contenders

VMware ESXi has been the gold standard for enterprise virtualization for years. Proxmox VE is the open-source alternative that has been gaining traction, especially in the homelab community. I have run both extensively, and the choice between them depends on what you are optimizing for.

## ESXi: The Enterprise Standard

ESXi is polished. The vSphere client is fast and well-organized. vMotion (live migration) works flawlessly. The ecosystem of third-party tools and integrations is massive. If you are studying for VMware certifications or want to match what most enterprises run, ESXi is the obvious choice.

The downside is licensing. VMware's free tier has become increasingly limited, and the paid licenses are expensive for a homelab. The acquisition by Broadcom has added uncertainty about future pricing and availability. For a lab where you are experimenting freely, licensing friction is a real concern.

## Proxmox: The Open-Source Powerhouse

Proxmox VE is built on Debian Linux with KVM for virtual machines and LXC for containers. It is completely free to use with no feature limitations. The web interface is functional, and you get full command-line access to the underlying Linux system, which means you can do anything the OS can do.

Proxmox also has native ZFS support, which is a big deal if you care about data integrity and storage flexibility. You can create ZFS pools directly from the Proxmox interface and use them for VM storage.

## My Experience

I ran ESXi for a year before switching most of my lab to Proxmox. The switch was driven by three things: licensing costs, ZFS support, and the flexibility of having a full Linux system underneath.

Proxmox handles my workloads just as well as ESXi did. VM performance is effectively identical (both use hardware virtualization). Live migration works, though it requires a shared storage backend. Backups are straightforward with Proxmox Backup Server, which is another free tool from the same team.

## What I Miss from ESXi

The vSphere client is genuinely better than the Proxmox web UI. It is more responsive, more polished, and handles large environments more gracefully. VMware's snapshot management is also more intuitive, and vMotion is slightly more reliable than Proxmox's live migration in my experience.

## Bottom Line

For a homelab, Proxmox wins on value. You get enterprise-class virtualization with no licensing restrictions, native ZFS, and full Linux flexibility. For enterprise environments or certification study, ESXi remains the standard. There is no wrong choice. Pick the one that matches your goals.
`,
  },
  {
    slug: "ecc-ram-explained",
    title: "ECC RAM: What It Is and Why Servers Use It",
    date: "2026-01-22",
    tags: ["hardware", "servers", "storage"],
    excerpt:
      "A practical explanation of ECC memory, why it matters for servers, and when you actually need it.",
    coverImage: "/images/blog/ecc-ram-explained.jpg",
    coverCredit: {
      author: "Mister rf",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:MT36JSF1G72PZ-1G9K1HE.jpg",
    },
    content: `
## What ECC Does

ECC stands for Error-Correcting Code. Standard desktop RAM (non-ECC) can detect some memory errors but cannot fix them. ECC RAM adds an extra bit per byte that allows the memory controller to detect and correct single-bit errors automatically, and detect (but not correct) double-bit errors.

Single-bit errors happen more often than you might think. Cosmic rays, electrical noise, and manufacturing imperfections can all flip a bit in memory. On a desktop, this might cause a crash or a corrupted file once in a while. On a server running 24/7 with terabytes of RAM, the probability of a bit flip becomes a near certainty over time.

## Why Servers Need It

Servers store critical data in memory. Database pages, file system caches, VM memory, and application state all live in RAM. A single flipped bit in a database page could corrupt a record. A flipped bit in a file system write could silently damage data on disk.

ECC memory prevents this by catching and fixing errors before they can cause damage. The correction happens transparently, with no performance penalty and no software involvement. The server logs the correction so administrators can monitor memory health, and if a DIMM starts throwing too many errors, it can be replaced before it fails completely.

## The Performance Question

ECC RAM is often slightly slower than non-ECC RAM because of the additional error-checking overhead. In practice, the difference is negligible for server workloads. We are talking about single-digit percentage differences in memory bandwidth, which almost never matters for real applications.

The bigger factor is that server-class ECC DIMMs (RDIMMs and LRDIMMs) run at specific speeds that are often lower than what consumer DDR4 or DDR5 achieves. But servers compensate with more memory channels and more DIMMs, so total bandwidth is usually higher than a consumer system despite the lower per-DIMM speed.

## When You Need It

If you are running workloads where data integrity matters (databases, file servers, ZFS, virtualization), use ECC. ZFS in particular strongly recommends ECC RAM because it relies on the integrity of its in-memory data structures to maintain data consistency.

For a homelab, ECC is a strong recommendation but not an absolute requirement. If you are running ZFS or storing data you care about, get ECC. If you are just experimenting with VMs and do not mind the occasional crash, non-ECC will work, but you are accepting a risk that grows with the amount of RAM in the system.
`,
  },
  {
    slug: "mac-pro-vs-poweredge-comparison",
    title: "Mac Pro vs Dell PowerEdge: An Honest Comparison",
    date: "2026-01-20",
    tags: ["apple", "mac-pro", "dell", "servers"],
    excerpt:
      "Two very different approaches to rack-mount hardware. Here is how the Mac Pro and PowerEdge compare for real workloads.",
    coverImage: "/images/blog/mac-pro-vs-poweredge-comparison.jpg",
    coverCredit: {
      author: "Dell Inc.",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_servers.jpg",
    },
    content: `
## Different Tools for Different Jobs

Comparing a Mac Pro to a Dell PowerEdge is a bit like comparing a sports car to a truck. They are both vehicles, but they are designed for fundamentally different purposes. That said, they both live in my rack, so I have direct experience with each.

## Build Quality

The Mac Pro wins here, and it is not close. The aluminum chassis, the precision machining, the slide-in handles, everything about the physical hardware feels premium. Dell servers are built to be functional and cost-effective. They get the job done, but nobody is going to admire the craftsmanship of a PowerEdge chassis.

That said, the Mac Pro costs five to ten times more than an equivalent PowerEdge, so the build quality better be exceptional.

## Expandability

The PowerEdge R740 supports up to 3 TB of RAM across 24 DIMM slots. The Mac Pro tops out at 1.5 TB across 12 slots. For virtualization workloads where memory is the primary constraint, Dell wins decisively.

Storage is similar. The R740 supports up to 16 drives in a 2U chassis. The Mac Pro has limited internal storage, and expanding it means using PCIe NVMe cards or external storage.

## Management

iDRAC versus nothing. Dell gives you full out-of-band management with remote console, hardware monitoring, firmware updates, and alerting. The Mac Pro has none of this. You manage it through macOS, and if macOS crashes, you need physical access.

This is probably the biggest practical difference for server use. iDRAC means I can manage my Dell servers from anywhere. The Mac Pro requires me to be in front of it (or use VNC when macOS is running, which is not the same thing).

## Performance

For CPU-heavy server workloads, the PowerEdge with dual Xeon Platinum processors outperforms the Mac Pro's single Xeon W. For GPU-accelerated workloads, the Mac Pro's Radeon Pro Vega II cards are better suited for Apple's Metal framework and media processing pipelines.

## Cost

A used PowerEdge R740 with 512 GB of RAM costs a fraction of what a similarly-equipped Mac Pro costs. If you are building a lab on a budget, Dell is the only sensible choice. If you specifically need macOS in a rack, the Mac Pro is the only option.

## My Recommendation

Buy a PowerEdge for server workloads. Buy a Mac Pro only if you have a specific macOS requirement that justifies the cost. In my lab, the PowerEdges do 90% of the work. The Mac Pro handles the 10% that requires macOS or Apple's GPU ecosystem.
`,
  },
  {
    slug: "ups-sizing-homelab",
    title: "How to Size a UPS for a Home Server Rack",
    date: "2026-01-18",
    tags: ["hardware", "servers", "homelab", "power"],
    excerpt:
      "A practical guide to choosing the right UPS for your servers, including how to calculate your actual power needs.",
    coverImage: "/images/blog/ups-sizing-homelab.jpg",
    coverCredit: {
      author: "MiNe",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:APC_BR700G-TW_20140114.jpg",
    },
    content: `
## Why You Need a UPS

A UPS (Uninterruptible Power Supply) sits between your servers and the wall outlet. When power drops, the UPS battery kicks in immediately, keeping your servers running long enough to shut down gracefully. Without one, a power outage means your servers lose power instantly, which can corrupt filesystems, damage databases, and kill drives mid-write.

I learned this the hard way early on. A brief power flicker corrupted a ZFS pool that took hours to repair. After that, I invested in proper UPS protection for every piece of equipment in the rack.

## Calculating Your Needs

Step one is measuring your actual power consumption. I use a Kill-A-Watt meter on each server to measure draw under normal load and under peak load. Here is what my rack pulls:

- 2x Dell R740: ~450W each under typical load
- 1x Mac Pro: ~300W under typical load
- 1x Mikrotik switch: ~30W
- Miscellaneous (patch panel lighting, cooling fan): ~50W
- Total typical load: ~1,280W
- Total peak load: ~1,800W

## VA vs Watts

UPS capacity is rated in VA (Volt-Amps) and Watts. They are not the same thing. VA is apparent power, and Watts is real power. For server loads (which are mostly resistive), the power factor is typically around 0.8 to 0.9. That means a 2000VA UPS delivers about 1600 to 1800 watts of real power.

Always size based on watts, not VA. And always leave headroom. I target 70% utilization, so for my 1,800W peak load, I need a UPS rated for at least 2,600W (or about 3,000VA).

## Runtime

Runtime is how long the UPS can keep your servers running on battery. For a homelab, you probably do not need hours of runtime. You need enough time for your servers to detect the outage and shut down gracefully. Five to ten minutes is usually sufficient.

I have my servers configured to start a clean shutdown when the UPS signals a power loss. The UPS communicates via USB using NUT (Network UPS Tools) on Linux. The shutdown process takes about two minutes, so my UPS needs to provide at least three to four minutes of runtime at full load.

## My Setup

I run an APC Smart-UPS 3000VA rack-mount unit. It provides about 8 minutes of runtime at my typical load, which is plenty for graceful shutdowns. The rack-mount form factor keeps everything neat, and the network management card lets me monitor it remotely.

The total cost was significant, but it has already saved my data at least three times during power outages. That makes it one of the best investments in the entire lab.
`,
  },
  {
    slug: "vlan-segmentation-guide",
    title: "Network Segmentation with VLANs: A Practical Guide",
    date: "2026-01-15",
    tags: ["networking", "security", "homelab"],
    excerpt:
      "How I use VLANs to segment my home network into isolated zones for security, performance, and sanity.",
    coverImage: "/images/blog/vlan-segmentation-guide.jpg",
    coverCredit: {
      author: "X-Javier",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_Catalyst_4506-E_Switch_001.jpg",
    },
    content: `
## What VLANs Actually Do

A VLAN (Virtual Local Area Network) lets you split a single physical switch into multiple logical networks. Devices on different VLANs cannot communicate directly, even if they are plugged into the same switch. Traffic between VLANs has to go through a router or layer-3 switch, where you can apply firewall rules and access controls.

This is the foundation of network segmentation, and it is how every serious network separates different types of traffic.

## My VLAN Layout

I run six VLANs in my homelab:

- **VLAN 10: Management.** iDRAC interfaces, switch management, UPS monitoring. Only accessible from my admin workstation.
- **VLAN 20: Servers.** Production server traffic. VMs, storage, and inter-server communication.
- **VLAN 30: User devices.** My workstations, laptops, and phones.
- **VLAN 40: IoT.** Smart home devices that have no business talking to my servers.
- **VLAN 50: Lab/Testing.** Isolated segment for experiments. Deliberately separated so a broken lab config cannot affect the rest of the network.
- **VLAN 99: Guest.** Internet-only access for visitors. No access to any internal resources.

## Trunk Ports and Access Ports

The key to VLANs working is the difference between trunk ports and access ports. An access port belongs to a single VLAN and sends untagged traffic. A trunk port carries traffic from multiple VLANs, with each frame tagged with its VLAN ID.

Between my switches and router, I use trunk ports that carry all VLANs. Server ports are access ports assigned to VLAN 20. User device ports are access ports on VLAN 30. This keeps the configuration clean and predictable.

## Inter-VLAN Routing

Traffic between VLANs goes through my FortiGate firewall. This lets me control exactly what crosses VLAN boundaries. My management VLAN can reach everything. My server VLAN can reach the internet. My IoT VLAN can reach the internet but nothing internal. My guest VLAN is completely isolated except for internet access.

## Why This Matters

Without VLANs, every device on your network can potentially reach every other device. A compromised IoT camera could scan your servers. A guest's infected laptop could reach your NAS. VLANs prevent this by creating boundaries that require explicit permission to cross.

It takes some effort to set up, but once it is running, you have a network that is structured, secure, and much easier to troubleshoot because traffic flows are predictable.
`,
  },
  {
    slug: "fortigate-firewall-homelab",
    title: "Running a FortiGate Firewall in a Homelab",
    date: "2026-01-12",
    tags: ["networking", "security", "homelab", "fortinet"],
    excerpt:
      "Why I chose Fortinet for my home network firewall and how I configured it for a segmented lab environment.",
    coverImage: "/images/blog/fortigate-firewall-homelab.jpg",
    coverCredit: {
      author: "Premeditated",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Fortinet_FortiGate_6501F.png",
    },
    content: `
## Why Fortinet

I chose a FortiGate firewall for my homelab because Fortinet is widely used in enterprise environments, and learning it on real hardware translates directly to professional skills. The FortiOS interface is intuitive once you learn it, and the documentation is thorough.

I picked up a FortiGate 60F, which is designed for small office deployments but has more than enough throughput for a homelab. It supports hardware-accelerated firewall inspection, VPN, IPS (Intrusion Prevention System), and web filtering.

## Initial Setup

The first thing I did was configure the interfaces. The WAN port connects to my ISP modem. The internal ports are configured as a switch group that connects to my core switch. I also created sub-interfaces for each VLAN, so the FortiGate handles inter-VLAN routing and firewall policy enforcement.

\`\`\`
config system interface
  edit "VLAN10-Mgmt"
    set vdom "root"
    set ip 10.0.10.1 255.255.255.0
    set allowaccess ping https ssh
    set interface "internal"
    set vlanid 10
  next
end
\`\`\`

## Firewall Policies

FortiGate firewall policies are evaluated top-to-bottom. Each policy specifies source interface, destination interface, source address, destination address, service, and action (accept or deny). I created explicit policies for every allowed traffic flow and have an implicit deny-all at the bottom.

The key policies in my setup allow management traffic to reach all VLANs, server-to-internet traffic for updates and external services, and user-to-server traffic for specific services. Everything else is denied by default.

## Logging and Monitoring

FortiGate logs every session that matches a firewall policy. I review these logs regularly to understand traffic patterns and catch anything unexpected. The FortiView dashboard gives real-time visibility into what is happening on the network, including top talkers, most-used applications, and threat detections.

## What I Have Learned

Working with a FortiGate taught me how enterprise firewall management actually works. Writing policies forces you to think about traffic flows explicitly. You cannot just allow everything and hope for the best. You have to understand what should be allowed, what should be denied, and why.

The IPS features have also caught real threats. Even in a homelab, there is scanning and probing from the internet, and having a device that detects and blocks it gives you visibility into what is actually happening on your perimeter.
`,
  },
  {
    slug: "server-cpu-selection-guide",
    title: "Choosing the Right Server CPU: Xeon, EPYC, and Apple",
    date: "2026-01-10",
    tags: ["hardware", "servers", "apple"],
    excerpt:
      "A guide to picking the right processor for your server workload, covering Intel Xeon, AMD EPYC, and Apple's approach.",
    coverImage: "/images/blog/server-cpu-selection-guide.jpg",
    coverCredit: {
      author: "Sonic84alpha",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Xeon_Beckton_with_and_without_heat_spreader.jpg",
    },
    content: `
## Intel Xeon

Xeon has been the default server CPU for decades. The current Xeon Scalable lineup (Sapphire Rapids and beyond) offers high core counts, massive memory support, and a mature ecosystem. Every server vendor, every hypervisor, and every enterprise application is tested and certified on Xeon.

For a homelab, used Xeon processors from the previous generation (Cascade Lake, Skylake-SP) offer incredible value. A 24-core Xeon Gold that cost thousands new can be found for a fraction of that on the used market.

The Xeon ecosystem also means broad compatibility. BIOS updates, driver support, and firmware tools are all well-maintained by Intel and the server vendors.

## AMD EPYC

EPYC has disrupted the server market significantly. The current generation offers more cores per socket, more PCIe lanes, and better performance per watt than Xeon in many workloads. AMD's chiplet architecture lets them scale core counts without the yields problems that monolithic designs face.

The downside is that EPYC is newer in the server space, and some enterprise software vendors are still catching up with certification and optimization. That gap is closing fast, but it is worth checking if your specific workloads are validated on EPYC.

For homelabs, EPYC is harder to find used and the platforms (motherboards, etc.) are less common on the secondary market. But if you are buying new, EPYC offers better value than Xeon at most price points.

## Apple Xeon W

The Mac Pro uses Intel's Xeon W processors, which are essentially workstation-class Xeons. They offer high single-threaded performance and large cache sizes, making them good for workloads that do not scale perfectly across many cores.

The limitation is that the Mac Pro only supports a single socket. For workloads that benefit from dual-socket configurations (massive memory capacity, high core counts), Dell and HP platforms with dual Xeon or EPYC chips are the better choice.

## What I Run

My main workloads are virtualization and storage, which benefit from high core counts and memory capacity. I run dual Xeon Gold 6248R processors in my primary R740, giving me 48 cores and 96 threads total. For my workloads, this is more than enough.

If I were building from scratch today, I would seriously consider EPYC for the core count and memory bandwidth advantages. But the used Xeon market is hard to beat on price, and the Dell PowerEdge ecosystem makes it easy to get started.

## The Decision Framework

Pick your CPU based on your actual workload:
- **Virtualization with many VMs:** High core counts matter. EPYC or dual Xeon.
- **Database workloads:** Single-threaded performance matters. Xeon with high boost clocks.
- **Media processing on macOS:** Xeon W in a Mac Pro (or wait for Apple Silicon Mac Pro).
- **Budget homelab:** Used Xeon Gold on a Dell platform. Best value per dollar.
`,
  },
  {
    slug: "hot-cold-aisle-containment",
    title: "Hot and Cold Aisle Containment: Why Airflow Matters",
    date: "2026-01-08",
    tags: ["servers", "datacenter", "hardware"],
    excerpt:
      "The principles behind datacenter cooling and how I apply hot/cold aisle concepts even in a homelab environment.",
    coverImage: "/images/blog/hot-cold-aisle-containment.jpg",
    coverCredit: {
      author: "Hugovanmeijeren",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cern_datacenter.jpg",
    },
    content: `
## The Problem

Servers generate a lot of heat. A single fully loaded PowerEdge R740 can produce over 1,500 BTU per hour. In a datacenter with thousands of servers, managing that heat is the difference between reliable operation and cascading thermal shutdowns.

The fundamental challenge is that you need to deliver cool air to server intakes and remove hot air from server exhausts without the two mixing. If hot exhaust air recirculates back to the intakes, cooling efficiency drops and servers run hotter than they should.

## Hot Aisle / Cold Aisle

The standard approach is to arrange racks in alternating rows so that server intakes face one aisle (cold aisle) and server exhausts face the opposite aisle (hot aisle). Cool air is delivered to the cold aisle through raised floor vents or overhead ducting, and hot air is collected from the hot aisle and returned to the cooling units.

This simple arrangement dramatically improves cooling efficiency because it prevents mixing. Every server gets cool air, and the cooling system only has to deal with concentrated hot air instead of a warm mixture.

## Containment

Taking it further, you can physically enclose either the hot aisle or the cold aisle with doors, curtains, or rigid panels. This is called containment. Cold aisle containment seals the cold aisle so cool air can only go into server intakes. Hot aisle containment seals the hot aisle so hot exhaust is captured and returned to the cooling system directly.

In practice, hot aisle containment is more common because it lets the rest of the room stay cool, which is more comfortable for people working in the space.

## In a Homelab

I only have one rack, so traditional aisle containment does not apply. But the principle still matters. I make sure all my servers face the same direction, with intakes pulling air from the front of the rack and exhausting out the back. The back of the rack faces a wall with adequate clearance for hot air to dissipate.

I also added a small exhaust fan at the top rear of the rack to pull hot air up and out. Combined with blanking panels to fill empty rack space (preventing hot air from recirculating through gaps), this keeps my equipment running at comfortable temperatures even in a closet.

## Key Takeaways

Airflow management is not optional for servers. Hot air recirculation causes thermal throttling, shorter component life, and ultimately failures. Even in a single-rack homelab, filling blank spaces with panels and ensuring consistent airflow direction makes a measurable difference in temperatures.
`,
  },
  {
    slug: "pdu-selection-guide",
    title: "Choosing a PDU for Your Server Rack",
    date: "2026-01-05",
    tags: ["hardware", "servers", "power", "homelab"],
    excerpt:
      "A guide to power distribution units for server racks, from basic power strips to intelligent metered PDUs.",
    coverImage: "/images/blog/pdu-selection-guide.jpg",
    coverCredit: {
      author: "Tobias Maier",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:1U_19inch_rack_switching_panel_8_C13_plugs_8_Switches_1_Fuse.jpg",
    },
    content: `
## What Is a PDU

A PDU (Power Distribution Unit) is essentially a rack-mountable power strip, but they range from simple to very sophisticated. At the basic level, a PDU takes input power and distributes it across multiple outlets for your servers. At the high end, a smart PDU monitors per-outlet power consumption, supports remote power cycling of individual outlets, and provides environmental monitoring.

## Types of PDUs

**Basic PDU:** A rack-mount power strip. Takes one input, provides multiple outputs. No monitoring, no management. Cheap and reliable.

**Metered PDU:** Adds a display showing total power draw. Useful for knowing how much power your rack is consuming, but no per-outlet visibility.

**Monitored PDU:** Shows per-outlet power consumption via a web interface or SNMP. This is where it gets useful for a serious lab because you can see exactly how much power each server draws.

**Switched PDU:** Everything a monitored PDU does, plus you can remotely power-cycle individual outlets. This is incredibly useful when a server hangs and iDRAC is not responding.

## What I Use

I run two APC metered PDUs in my rack, mounted vertically on opposite sides. Having two PDUs provides redundancy. Each server has dual power supplies, one connected to each PDU. If one PDU fails or needs to be serviced, every server continues running on the other power supply.

The metered display tells me total rack power consumption at a glance, which is useful for tracking power costs and ensuring I am not overloading the circuit.

## Outlet Types

In the US, most server PDUs use C13/C14 connectors for standard equipment and C19/C20 connectors for high-draw devices. Make sure you have enough of each type for your equipment. My R740s use C13 connections, while the UPS input uses a C19/C20.

## Voltage

Running servers on 208V or 240V instead of 120V improves power supply efficiency and reduces current draw per device. Many enterprise PDUs are designed for higher voltage inputs. If your electrical setup supports it, 208V or 240V is the better choice for a rack with multiple servers.

I currently run on 120V because that is what my circuit supports, but if I expand further, rewiring for 240V would be the smart move.
`,
  },
  {
    slug: "wireshark-packet-analysis",
    title: "Practical Packet Analysis with Wireshark",
    date: "2026-01-02",
    tags: ["networking", "cybersecurity", "tools"],
    excerpt:
      "How I use Wireshark for real troubleshooting and competitive cybersecurity, not just looking at pretty packets.",
    coverImage: "/images/blog/wireshark-packet-analysis.jpg",
    coverCredit: {
      author: "Laurachappell",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wireshark_Network_Analyzer_Screen.png",
    },
    content: `
## More Than a Packet Viewer

Wireshark is the most powerful network analysis tool available, and it is free. But most people only scratch the surface. They open a capture, scroll through packets, and get overwhelmed by the volume of data. The real power of Wireshark comes from knowing how to filter, follow streams, and extract the information you actually need.

## Capture Filters vs Display Filters

Capture filters limit what Wireshark records. Display filters limit what you see after capture. For troubleshooting, I usually capture everything and use display filters to narrow down. For long-running captures, I use capture filters to avoid filling the disk.

Common display filters I use constantly:

\`\`\`
ip.addr == 10.0.20.5
tcp.port == 443
dns
http.request
tcp.analysis.retransmission
\`\`\`

## Following Streams

When I am troubleshooting a specific connection, I right-click a packet and select "Follow TCP Stream." This reconstructs the entire conversation between two endpoints in order, which is invaluable for understanding what happened in an HTTP request, an SMTP exchange, or any other protocol.

## Competition Use

In NCL competitions, Wireshark challenges typically give you a capture file and ask you to extract specific information. Common tasks include identifying what credentials were transmitted in plaintext, finding DNS queries to suspicious domains, and reconstructing file transfers.

The key to speed in competitions is knowing your filters cold. If you have to look up filter syntax during a timed challenge, you are losing minutes. I practice by generating my own captures in the lab and querying them until the syntax is automatic.

## Coloring Rules

I customize Wireshark's coloring rules to highlight problems immediately. TCP retransmissions get a red background. DNS errors get yellow. RST packets (connection resets) get orange. This means I can open a capture and immediately spot problem areas without reading every packet.

## Export and Scripting

For large-scale analysis, I use tshark (Wireshark's command-line counterpart) to extract specific fields into CSV format, then process the data with Python. This is much faster than scrolling through millions of packets in the GUI.

\`\`\`bash
tshark -r capture.pcap -T fields -e frame.time -e ip.src -e ip.dst -e tcp.dstport -Y "tcp.flags.syn==1" > connections.csv
\`\`\`

## Building Intuition

The best way to get good at packet analysis is to capture your own traffic and study it. Set up a span port on your switch, capture for an hour, and explore what you see. You will learn more about how protocols actually work than any textbook can teach.
`,
  },
  {
    slug: "nmap-scanning-techniques",
    title: "Nmap Scanning Techniques for Network Discovery",
    date: "2025-12-28",
    tags: ["cybersecurity", "networking", "tools"],
    excerpt:
      "How I use Nmap for network discovery and security assessment, with practical examples from my lab environment.",
    coverImage: "/images/blog/nmap-scanning-techniques.jpg",
    coverCredit: {
      author: "Barnacl437",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Kali-screenshot-20221021.png",
    },
    content: `
## What Nmap Does

Nmap (Network Mapper) is a network scanning tool that discovers hosts, services, and vulnerabilities on a network. It is the standard tool for network reconnaissance in both legitimate security assessment and competitive cybersecurity.

## Basic Scans

The simplest scan discovers which hosts are up on a network:

\`\`\`bash
nmap -sn 10.0.20.0/24
\`\`\`

This sends ICMP echo requests and ARP requests to every address in the subnet and reports which ones respond. It is fast and non-intrusive. I use it regularly to audit what devices are on each VLAN.

## Port Scanning

A port scan checks which TCP or UDP ports are open on a target:

\`\`\`bash
nmap -sS -p- 10.0.20.5
\`\`\`

The \`-sS\` flag does a SYN scan (half-open scan), which is faster and less likely to be logged than a full TCP connection. The \`-p-\` flag scans all 65,535 ports. Without it, Nmap only scans the top 1,000 ports by default.

## Service Detection

Once you know which ports are open, service detection tells you what is actually running:

\`\`\`bash
nmap -sV -p 22,80,443,3306 10.0.20.5
\`\`\`

This connects to each open port and analyzes the response to determine the service name and version. It is incredibly useful for inventory and for finding outdated software versions.

## OS Detection

Nmap can identify the operating system of a target by analyzing how it responds to specific network probes:

\`\`\`bash
nmap -O 10.0.20.5
\`\`\`

This is based on TCP/IP stack fingerprinting. Different operating systems implement TCP slightly differently, and Nmap maintains a database of these fingerprints.

## In Competition

NCL and similar competitions often present scenarios where you need to discover services, identify versions, and find vulnerabilities. Knowing Nmap well means you can complete the reconnaissance phase quickly and move on to the actual challenge.

The most important habit is to always scan methodically. Do a host discovery first, then port scan the live hosts, then do service detection on open ports. Jumping straight to a full scan of everything wastes time and generates noise.

## Lab Practice

I regularly scan my own lab environment to practice and to verify my security posture. If a port is open that should not be, I want to know about it. Nmap is the fastest way to validate that my firewall rules are working as intended.
`,
  },
  {
    slug: "mac-pro-2019-teardown-analysis",
    title: "Inside the 2019 Mac Pro: Engineering Analysis",
    date: "2025-12-25",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "A look at what makes the 2019 Mac Pro's internal design unique compared to traditional server hardware.",
    coverImage: "/images/blog-mac-pro-2019-teardown-analysis.png",
    content: `
## The Design Philosophy

The 2019 Mac Pro is the most repairable and upgradeable Mac ever made, which is ironic given Apple's reputation for sealed devices. Every component is user-accessible. RAM, storage, PCIe cards, and even the processor can be replaced or upgraded. The internal layout is clean, logical, and clearly designed by engineers who care about serviceability.

## Airflow System

The cooling system uses three large fans at the front of the chassis that pull air across the entire system. Air flows front-to-back, passing over the RAM, CPU, and PCIe cards in sequence. The fan speed is dynamically controlled based on thermal sensors throughout the system.

What makes it interesting is the scale of the fans. Instead of many small fans (like you see in a Dell PowerEdge), Apple uses fewer but larger fans. Larger fans move more air at lower RPMs, which means the Mac Pro is remarkably quiet for a system of its power class.

## The MPX Module System

Apple's MPX (Mac Pro Expansion) module system provides both PCIe and auxiliary power through a single connector. Standard PCIe cards work in the Mac Pro, but Apple's MPX modules (like the Radeon Pro Vega II) get additional power and Thunderbolt connectivity through the custom connector.

This is clever engineering. It means GPU cards can draw much more power than the standard PCIe specification allows, which enables Apple to use high-power professional GPUs without external power cables.

## Memory Architecture

The Mac Pro supports up to 1.5 TB of DDR4 ECC memory across 12 DIMM slots. The memory is arranged in a six-channel configuration, which provides massive bandwidth. Apple uses industry-standard R-DIMMs, so you can buy memory from any server memory supplier.

## Compared to Traditional Servers

The biggest difference is density. A PowerEdge R740 packs dual processors, 24 DIMM slots, and 16 drive bays into a 2U chassis. The Mac Pro is a full tower (or 5U in rack-mount form) with a single processor and fewer DIMM slots. You give up density for noise, thermal management, and build quality.

For datacenter use where density matters, the Mac Pro loses. For a lab or studio environment where noise and quality of life matter, the Mac Pro is in a league of its own.
`,
  },
  {
    slug: "linux-server-hardening",
    title: "Linux Server Hardening: The Basics That Matter",
    date: "2025-12-22",
    tags: ["cybersecurity", "linux", "servers"],
    excerpt:
      "The fundamental security configurations I apply to every Linux server in my lab, and why each one matters.",
    coverImage: "/images/blog/linux-server-hardening.jpg",
    coverCredit: {
      author: "jaydeep_",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cybersecurity.png",
    },
    content: `
## Start with Updates

The single most important thing you can do for server security is keep it updated. Unpatched vulnerabilities are how most systems get compromised. I run unattended-upgrades on all my Debian/Ubuntu servers for security patches, and I schedule a maintenance window monthly for larger updates that require reboots.

\`\`\`bash
apt update && apt upgrade -y
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
\`\`\`

## SSH Configuration

SSH is usually the primary way you access a server, which makes it the primary target for attackers. My SSH hardening configuration:

- Disable root login: \`PermitRootLogin no\`
- Use key-based authentication only: \`PasswordAuthentication no\`
- Change the default port (not security, but reduces noise)
- Limit which users can SSH in: \`AllowUsers maxdoubin\`
- Use fail2ban to block brute force attempts

## Firewall

I use ufw (Uncomplicated Firewall) or iptables depending on the distribution. The principle is simple: deny everything by default, then explicitly allow only the traffic you need.

\`\`\`bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.0.10.0/24 to any port 22
ufw enable
\`\`\`

This allows SSH only from my management VLAN and blocks everything else inbound.

## User Management

Every person gets their own account. No shared accounts, no sharing passwords. Sudo is configured so users can elevate privileges when needed, and all sudo usage is logged.

I also disable any accounts that are not actively needed. Default service accounts that ship with the OS or installed packages get locked.

## Logging

I send all system logs to a central syslog server using rsyslog. This means that even if a server is compromised and the attacker clears local logs, the copies on the syslog server are intact.

Log everything. Disk space is cheap. Missing logs during an incident investigation is expensive.

## File Permissions

Review file permissions on sensitive files. \`/etc/shadow\` should only be readable by root. SSH keys should be 600. Configuration files should not be world-readable if they contain credentials.

These are basics, but basics done consistently are more valuable than advanced techniques done sporadically.
`,
  },
  {
    slug: "active-directory-homelab",
    title: "Setting Up Active Directory in a Homelab",
    date: "2025-12-18",
    tags: ["servers", "networking", "windows"],
    excerpt:
      "How I set up a full Active Directory domain in my lab to practice enterprise identity management.",
    coverImage: "/images/blog/active-directory-homelab.jpg",
    coverCredit: {
      author: "Alan Levine",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Home_server_equipment.jpg",
    },
    content: `
## Why Active Directory

Active Directory (AD) is Microsoft's directory service, and it is the backbone of identity management in most enterprise environments. Understanding how AD works, how to configure it, and how to troubleshoot it is essential for anyone working in enterprise networking or cybersecurity.

I set up a full AD domain in my homelab to practice in an environment where mistakes are safe and learning is the priority.

## The Setup

My AD lab runs on two Windows Server 2022 VMs. One is the primary domain controller, and the other is a secondary domain controller for redundancy. Both are running DNS, which is required for AD to function.

The domain is a standard .local domain (not best practice for production, but fine for a lab). I created organizational units (OUs) for servers, workstations, and users, and applied different Group Policy Objects (GPOs) to each.

## Group Policy

Group Policy is where AD gets powerful. GPOs let you enforce configuration across every machine and user in the domain. I have policies for:

- Password complexity and rotation requirements
- Disabling USB storage on workstations
- Configuring Windows Firewall settings
- Deploying software packages automatically
- Restricting which users can log into specific machines

The GPO inheritance model takes some time to understand, but once you get it, you can manage hundreds of machines from a single console.

## DNS Integration

AD depends heavily on DNS. Every domain controller registers SRV records that clients use to find the DC. If DNS is broken, AD is broken. I learned this the hard way when a misconfigured DNS forwarder caused domain joins to fail. The error messages were unhelpful, and it took significant time to trace the problem back to DNS.

Always check DNS first. If AD is not working, DNS is the most likely culprit.

## Security Considerations

AD is a prime target in real-world attacks. Compromising a domain controller means owning the entire domain. In my lab, I practice common attack techniques (in an isolated environment) to understand how they work and how to defend against them. Kerberoasting, pass-the-hash, and DCSync are all things that work if AD is not configured carefully.

Understanding the attacks makes me better at configuring the defenses.
`,
  },
  {
    slug: "sfp-transceivers-explained",
    title: "SFP, SFP+, and QSFP: Transceivers Explained",
    date: "2025-12-15",
    tags: ["networking", "hardware"],
    excerpt:
      "A practical guide to network transceivers, DAC cables, and fiber optics for server networking.",
    coverImage: "/images/blog/sfp-transceivers-explained.jpg",
    coverCredit: {
      author: "Aur\u00e9lien Rinaldi",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Modules_SFP_officiels_et_compatibles.jpg",
    },
    content: `
## What Transceivers Do

Network transceivers convert electrical signals from your switch or NIC into optical signals for fiber cables (or into electrical signals for copper cables). They plug into SFP (Small Form-factor Pluggable) slots on your networking equipment and provide the physical layer connection.

## SFP vs SFP+ vs QSFP28

**SFP** supports speeds up to 1 Gbps. This is the original standard, still used for 1 gigabit fiber connections and some legacy equipment.

**SFP+** supports speeds up to 10 Gbps. This is what most 10GbE networking uses. SFP+ slots are backward-compatible with SFP modules, but not the other way around.

**QSFP28** supports 100 Gbps. This is used for spine/leaf datacenter fabrics and high-performance computing. A single QSFP28 port can also be broken out into 4x25 Gbps connections.

## Fiber vs Copper

For distances under 5 meters, DAC (Direct Attach Copper) cables are the cheapest and simplest option. A DAC cable has transceivers permanently attached to both ends. They are passive, require no configuration, and work in any SFP+ slot.

For distances between 5 and 300 meters, multimode fiber with SR (Short Range) transceivers is the standard. You need separate transceivers for each end and a fiber patch cable between them.

For distances over 300 meters, single-mode fiber with LR (Long Range) transceivers is required. These are more expensive but can reach up to 10 kilometers.

## Third-Party vs OEM

Cisco, Juniper, and other vendors sell their own branded transceivers at premium prices. Third-party transceivers from companies like Finisar (now II-VI) or generic options from Amazon work identically in most cases at a fraction of the cost.

Some switches check for OEM transceivers and will display warnings or refuse to use third-party modules. Cisco is notorious for this. The workaround is usually a CLI command to accept non-certified transceivers:

\`\`\`
service unsupported-transceiver
\`\`\`

## My Setup

In my homelab, I use Mellanox ConnectX-3 NICs with generic DAC cables. Everything is within a single rack, so DAC is perfect. The total cost for 10GbE connectivity was a fraction of what it would cost with fiber and OEM transceivers. For a homelab, there is no reason to pay more.
`,
  },
  {
    slug: "backup-strategy-321-rule",
    title: "The 3-2-1 Backup Rule and How I Implement It",
    date: "2025-12-12",
    tags: ["storage", "servers", "homelab"],
    excerpt:
      "A practical guide to implementing a real backup strategy using the 3-2-1 rule with enterprise hardware.",
    coverImage: "/images/blog/backup-strategy-321-rule.jpg",
    coverCredit: {
      author: "Armchair",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Typical_External_Hard_Drive.JPG",
    },
    content: `
## The Rule

The 3-2-1 rule is simple: keep at least 3 copies of your data, on at least 2 different types of media, with at least 1 copy offsite. It has been the gold standard for backup strategy for decades, and it works.

In practice, this means your data exists on your primary storage, a local backup, and a remote backup. If any single thing fails (a drive, a server, a fire), you still have copies.

## My Implementation

**Copy 1: Primary storage.** My data lives on ZFS pools across my Dell servers. ZFS provides checksumming and RAIDZ2 redundancy, so it handles drive failures gracefully. But RAID is not a backup. If I accidentally delete a file, RAID will happily delete it from every drive.

**Copy 2: Local backup.** I use Proxmox Backup Server to take daily backups of all VMs and LXC containers. These backups are stored on a separate server with its own ZFS pool. The backups are deduplicated and compressed, so storage efficiency is excellent.

**Copy 3: Offsite backup.** Critical data is replicated to an offsite location using ZFS send/receive over an encrypted SSH tunnel. This handles the scenario where my entire lab is physically destroyed (fire, theft, natural disaster).

## Testing Backups

A backup you have never tested is not a backup. I schedule quarterly restore tests where I pick a random VM backup and restore it to a test environment. If the restore works and the VM boots cleanly, the backup is valid. If it does not, I fix the backup process immediately.

## Retention

I keep daily backups for 30 days, weekly backups for 12 weeks, and monthly backups for 12 months. This gives me flexibility to recover from problems that are discovered long after they occurred. A ransomware infection that encrypted files two weeks ago would need a backup from before the infection.

## Automation

All of this is automated. Backups run on schedules, retention policies are enforced automatically, and I get email alerts if a backup fails. The only manual part is the quarterly restore test, and even that could be automated if I wanted to invest the time.
`,
  },
  {
    slug: "network-monitoring-tools",
    title: "Network Monitoring Tools I Actually Use",
    date: "2025-12-08",
    tags: ["networking", "tools", "homelab"],
    excerpt:
      "A practical look at the monitoring tools running in my homelab and what each one tells me about my network.",
    coverImage: "/images/blog/network-monitoring-tools.jpg",
    coverCredit: {
      author: "Masdestructive",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Batelco_Network_Operations_Centre_(NOC).JPG",
    },
    content: `
## Why Monitor

You cannot fix what you cannot see. Without monitoring, you find out about problems when something breaks. With monitoring, you find out about problems before they break anything, and you have data to diagnose the root cause quickly.

## Grafana + Prometheus

This combination is the backbone of my monitoring stack. Prometheus scrapes metrics from exporters running on each server (CPU, memory, disk, network) and stores them in a time-series database. Grafana visualizes those metrics on dashboards.

I have dashboards for per-server resource usage, ZFS pool health, network interface traffic, and UPS status. Each dashboard has alerts configured so I get notified if a metric crosses a threshold (like disk usage exceeding 85% or UPS battery dropping below 50%).

## SNMP Monitoring

My switches and FortiGate export metrics via SNMP (Simple Network Management Protocol). I use the Prometheus SNMP exporter to pull these into the same monitoring stack. This gives me visibility into switch port utilization, error counters, and CPU usage on network devices.

SNMP is not the most modern protocol, but it is universally supported by network equipment and provides consistent access to device metrics.

## Uptime Monitoring

I use a simple tool that pings every critical device every 60 seconds and alerts if anything goes down. It is basic, but knowing that your DNS server is unreachable before your users tell you is valuable.

## Log Aggregation

All syslog data flows to a central log server running rsyslog. I can search across all servers from a single interface, which is essential for troubleshooting issues that span multiple systems.

## The Dashboard

My main Grafana dashboard shows a high-level view of the entire lab: all servers, all network devices, storage capacity, and any active alerts. I check it once a day, and if anything is yellow or red, I investigate. This proactive approach has caught failing drives, memory errors, and network issues before they caused outages.
`,
  },
  {
    slug: "thunderbolt-networking",
    title: "Thunderbolt Networking: Apple's Approach to High-Speed Connectivity",
    date: "2025-12-05",
    tags: ["apple", "networking", "hardware"],
    excerpt:
      "How Thunderbolt networking works, where it fits, and why it is both brilliant and frustrating for mixed environments.",
    coverImage: "/images/blog/thunderbolt-networking.jpg",
    coverCredit: {
      author: "Macfan97",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ThunderboltIO.jpg",
    },
    content: `
## What Thunderbolt Networking Is

Thunderbolt supports native IP networking when you connect two Macs with a Thunderbolt cable. The connection appears as a standard network interface, and you get speeds up to 10 Gbps (Thunderbolt 3/4) with extremely low latency. No switches, no transceivers, no configuration beyond plugging in a cable.

For direct Mac-to-Mac file transfers, it is the fastest option available. Thunderbolt Bridge in macOS makes it completely transparent to applications.

## Where It Works

Thunderbolt networking is fantastic for specific scenarios: editing teams working with shared storage, direct transfers between workstations, and high-speed connections between a Mac Pro and a NAS. In a creative studio environment, it solves a real problem elegantly.

In my lab, I have used Thunderbolt networking between my Mac Pro and a Mac Mini for fast data transfers during media processing workflows. The speed is impressive and the latency is nearly zero.

## Where It Falls Short

Thunderbolt networking is point-to-point. You cannot build a network fabric with Thunderbolt. There are no Thunderbolt switches. If you need to connect more than two devices, you need to use standard Ethernet.

It is also Apple-only in practice. While Thunderbolt is technically an Intel/Apple standard that is now part of USB4, the native networking feature is a macOS thing. You cannot use Thunderbolt networking between a Mac and a Linux server.

## My Take

Thunderbolt networking is a great tool for specific problems, and a terrible general-purpose networking solution. I use it when I need fast direct connections between Apple devices, and I use 10GbE for everything else.

The ideal setup, which is what I have, is both. My Mac Pro has a Mellanox 10GbE card for connecting to the general network and a Thunderbolt port for direct connections when I need the extra speed.
`,
  },
  {
    slug: "cisco-switching-fundamentals",
    title: "Cisco Switching Fundamentals Every Network Engineer Needs",
    date: "2025-12-01",
    tags: ["networking", "cisco", "homelab"],
    excerpt:
      "The core switching concepts I learned on Cisco hardware and use every day in my lab environment.",
    coverImage: "/images/blog/cisco-switching-fundamentals.jpg",
    coverCredit: {
      author: "Jemimus",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_Catalyst_2950_network_switches_in_situ_-_IMG_1076.jpg",
    },
    content: `
## Why Cisco

Cisco is still the most widely deployed networking vendor in enterprise environments. Learning Cisco CLI, IOS configuration, and Cisco-specific features is directly transferable to real-world jobs. I run Cisco switches in my lab for exactly this reason.

## The CLI

Cisco IOS uses a hierarchical CLI with different privilege levels. You start in user EXEC mode, move to privileged EXEC mode with \`enable\`, and enter configuration mode with \`configure terminal\`. Every configuration change happens in this global configuration mode or a sub-mode.

\`\`\`
Switch> enable
Switch# configure terminal
Switch(config)# hostname LabSwitch
LabSwitch(config)# exit
\`\`\`

The CLI is text-based and powerful. Once you learn the command structure, configuration is fast and repeatable.

## Spanning Tree Protocol

STP prevents loops in switched networks. Without STP, a single cable plugged into two ports on the same switch would create a broadcast storm that takes down the entire network. I have seen it happen in lab environments, and it is not subtle. The network goes from working to completely dead in seconds.

Understanding STP means knowing which switch is the root bridge, how path costs determine which ports forward and which ports block, and how convergence works when the topology changes.

## Port Security

Port security limits which MAC addresses can use a switch port. In a lab, I use it to prevent unknown devices from connecting to sensitive VLANs. In production environments, it is a basic access control mechanism.

\`\`\`
LabSwitch(config-if)# switchport port-security
LabSwitch(config-if)# switchport port-security maximum 2
LabSwitch(config-if)# switchport port-security violation restrict
\`\`\`

## EtherChannel

EtherChannel bundles multiple physical links into a single logical link. This provides both increased bandwidth and redundancy. If one physical link fails, the EtherChannel continues working on the remaining links.

I use LACP (Link Aggregation Control Protocol) EtherChannels between my switches to provide 2 Gbps aggregated links with automatic failover.

## Saving Configuration

One of the most common mistakes on Cisco switches is forgetting to save the configuration. The running configuration is in memory and will be lost if the switch reboots. Always save with \`copy running-config startup-config\` or the shorthand \`write memory\`.
`,
  },
  {
    slug: "dell-idrac-tips-tricks",
    title: "Dell iDRAC Tips and Tricks for Power Users",
    date: "2025-11-28",
    tags: ["dell", "servers", "hardware"],
    excerpt:
      "Advanced iDRAC features that most people overlook, from virtual console to automated alerts and firmware management.",
    coverImage: "/images/blog/dell-idrac-tips-tricks.jpg",
    coverCredit: {
      author: "Dell Inc.",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R710_servers.jpg",
    },
    content: `
## Beyond the Basics

Most people use iDRAC for its virtual console and power controls. But iDRAC 9 has features that make server management significantly easier if you take the time to set them up.

## Virtual Media

Virtual Media lets you mount an ISO file from your workstation to the server's virtual optical drive. This means you can install an operating system remotely without burning a disc or plugging in a USB drive. I use this constantly for OS installations and recovery boot media.

To use it, open the virtual console, go to Virtual Media, and map your local ISO file. The server sees it as a physical DVD drive.

## Automated Alerts

iDRAC can send email alerts for hardware events: disk failures, memory errors, temperature warnings, power supply issues, and more. Configure SMTP settings in iDRAC and select which events trigger alerts.

I have alerts configured for anything that indicates a hardware problem. Getting an email about a predictive disk failure gives me time to order a replacement before the drive actually dies.

## Firmware Updates

iDRAC can update server firmware (BIOS, iDRAC itself, drive firmware, NIC firmware) from its web interface. Dell hosts a firmware catalog that iDRAC can check against your current versions and identify what needs updating.

I schedule firmware reviews quarterly. Keeping firmware current prevents known bugs and closes security vulnerabilities.

## Performance Monitoring

The built-in performance monitoring shows real-time and historical CPU, memory, I/O, and power usage. This data is useful for capacity planning and for correlating performance issues with specific hardware events.

## Lifecycle Controller

The Lifecycle Controller is a separate environment built into iDRAC that provides hardware diagnostics, OS deployment tools, and RAID configuration. It boots independently of the OS and does not require any installed software. It is essentially a built-in recovery environment that is always available.

## RACADM

For scripting and automation, RACADM is iDRAC's command-line interface. You can configure every iDRAC setting via RACADM commands, which means you can script the setup of multiple servers identically.

\`\`\`bash
racadm set iDRAC.NIC.DNSRacName LabServer01
racadm set iDRAC.IPMILan.AlertEnable Enabled
racadm set iDRAC.Users.2.Password NewSecurePassword
\`\`\`

This is how I configure iDRAC on new servers. Run the script, and every setting is applied consistently.
`,
  },
  {
    slug: "mac-pro-storage-expansion",
    title: "Expanding Storage on the Mac Pro",
    date: "2025-11-25",
    tags: ["apple", "mac-pro", "storage", "hardware"],
    excerpt:
      "The options for adding storage to a Mac Pro, from internal NVMe to Thunderbolt expansion and network-attached storage.",
    coverImage: "/images/blog/mac-pro-storage-expansion.jpg",
    coverCredit: {
      author: "mark sebastian",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apple_Mac_Pro_Two_2.8GHz_Quad-Core_Intel_Xeon_(59695).jpg",
    },
    content: `
## The Challenge

The Mac Pro does not have traditional drive bays like a PowerEdge. Internal storage options are limited to Apple's proprietary SSD modules and PCIe NVMe cards. If you need significant storage capacity, you need to look beyond the chassis.

## Internal Options

The Mac Pro has two proprietary SSD slots that support Apple's T2-connected SSDs up to 8 TB. These are fast (around 2.8 GB/s read) but expensive. You can also install standard M.2 NVMe drives using PCIe adapter cards in the Mac Pro's PCIe slots. I use a Sonnet M.2 4x4 adapter that holds four NVMe drives in a single PCIe slot.

This gives me fast local storage for active projects without paying Apple's premium for their proprietary modules.

## Thunderbolt Storage

For larger capacity, Thunderbolt 3 external enclosures provide high-speed connectivity. A multi-bay Thunderbolt enclosure with RAID can deliver sustained read/write speeds of 1.5 GB/s or more, which is fast enough for most production workloads.

I use a Thunderbolt RAID enclosure with four 18 TB drives in RAID 5 for media storage. It connects to the Mac Pro at full Thunderbolt 3 speed and appears as a local volume in macOS.

## Network Storage

For bulk storage that needs to be accessible from multiple machines, NFS and SMB shares from my Dell servers are the best option. The Mac Pro connects to my ZFS storage server over 10GbE, which provides close to 1 GB/s sustained throughput.

macOS works well with NFS shares if you configure the mount options correctly. I use automount with specific NFS options tuned for performance:

\`\`\`
nfs://10.0.20.10/storage/media -o rw,resvport,nfc,hard,intr
\`\`\`

## The Hierarchy

My storage hierarchy mirrors what you would see in a professional post-production environment: fast internal NVMe for active projects, Thunderbolt RAID for near-line storage, and network storage for archive and bulk data. Each tier balances speed, capacity, and cost differently.
`,
  },
  {
    slug: "subnetting-practical-guide",
    title: "Subnetting Made Practical: A Real-World Guide",
    date: "2025-11-22",
    tags: ["networking", "homelab"],
    excerpt:
      "How I think about subnetting in practice, with real examples from my network instead of textbook exercises.",
    coverImage: "/images/blog/subnetting-practical-guide.jpg",
    coverCredit: {
      author: "Michel Bakni",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Subnetting_Example_(3)_-en.png",
    },
    content: `
## Why Subnetting Matters

Subnetting divides a large network into smaller, more manageable segments. Each subnet is its own broadcast domain, which means broadcast traffic stays within the subnet instead of flooding the entire network. This improves performance, security, and manageability.

In my lab, subnetting is how I give each VLAN its own address space and control routing between them.

## CIDR Notation

CIDR (Classless Inter-Domain Routing) notation uses a slash followed by the number of bits in the network portion of the address. A /24 network has 256 addresses (254 usable). A /25 has 128 (126 usable). A /28 has 16 (14 usable).

The quick mental math: start with 32, subtract the CIDR number, raise 2 to that power. That is your total addresses. Subtract 2 for network and broadcast.

## My Network Layout

I use 10.0.0.0/8 as my overall private address space, divided into /24 subnets for each VLAN:

- 10.0.10.0/24 for management (254 usable addresses, way more than I need, but clean)
- 10.0.20.0/24 for servers
- 10.0.30.0/24 for user devices
- 10.0.40.0/24 for IoT
- 10.0.50.0/24 for lab/testing
- 10.0.99.0/24 for guests

Using the third octet to match the VLAN ID makes the addressing scheme intuitive. If I see an IP starting with 10.0.40, I immediately know it is an IoT device.

## VLSM in Practice

Variable Length Subnet Masking (VLSM) lets you use different subnet sizes within the same network. My management VLAN only has about 15 devices, so a /24 is wasteful. I could use a /28 (14 usable) and conserve address space.

In practice, I keep everything at /24 because simplicity matters more than address conservation in a private network. If I were designing a public-facing network with limited IP space, VLSM would be essential.

## Common Mistakes

The most common subnetting mistake I see is overlapping subnets. If two VLANs have overlapping address ranges, routing breaks in confusing ways. Always plan your subnet layout on paper before configuring anything, and make sure every subnet uses a non-overlapping range.

The second most common mistake is forgetting the gateway. Every subnet needs a gateway address (usually .1) configured on the router or L3 switch for inter-subnet traffic to work.
`,
  },
  {
    slug: "server-bios-configuration",
    title: "Server BIOS Settings That Actually Matter",
    date: "2025-11-18",
    tags: ["servers", "hardware", "performance"],
    excerpt:
      "The BIOS settings I configure on every server and why each one makes a difference for performance and reliability.",
    coverImage: "/images/blog/server-bios-configuration.jpg",
    coverCredit: {
      author: "Paul Schultz from Kenmore, Washington, USA",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:BIOS_Setup_First_Time.jpg",
    },
    content: `
## Why BIOS Settings Matter

Server BIOS settings control how the hardware behaves at the lowest level. A misconfigured BIOS can leave performance on the table, cause stability issues, or create security vulnerabilities. Most people never touch BIOS settings after initial setup, which means they are running with defaults that may not match their workload.

## System Profile

Dell servers offer system profiles that bundle related settings. The most important choice is between "Performance" and "Performance Per Watt (OS)." Performance mode runs CPUs at maximum frequency regardless of load. Performance Per Watt lets the OS manage frequency scaling, saving power during idle periods.

For virtualization workloads, I use "Performance Per Watt (OS)" because my servers are not constantly under full load. The power savings are real, and the performance impact is minimal because the OS scales frequency up instantly when load increases.

## Memory Settings

Memory interleaving should be enabled for maximum memory bandwidth. This spreads memory access across all channels evenly. I also enable ECC error logging so any memory errors are recorded in the system event log and trigger alerts through iDRAC.

Memory operating mode should be set to "Optimizer Mode" for best performance. "Mirror Mode" provides memory redundancy at the cost of half the usable capacity, which is only worth it for mission-critical production servers.

## Virtualization

If you are running a hypervisor, enable Intel VT-x (or AMD-V) and VT-d (or AMD-Vi). VT-x provides hardware-assisted CPU virtualization, and VT-d enables direct device passthrough to virtual machines. Both are required for modern hypervisors to work at full performance.

## Boot Configuration

Set the boot mode to UEFI rather than Legacy BIOS. UEFI is faster, supports larger disks, and provides Secure Boot capabilities. Unless you are running a very old operating system, there is no reason to use Legacy mode.

## Power Redundancy

If your server has dual power supplies, set the power redundancy policy to "Redundant." This means the server distributes load across both PSUs and can survive the failure of either one. "Non-Redundant" uses all available power capacity but offers no protection against PSU failure.

## Firmware Updates

Keep the BIOS firmware updated. Dell releases BIOS updates that fix bugs, improve stability, and patch security vulnerabilities. Use iDRAC or the Lifecycle Controller to apply updates without needing a bootable USB drive.
`,
  },
  {
    slug: "dns-fundamentals-infrastructure",
    title: "DNS: The Infrastructure Most People Ignore",
    date: "2025-11-15",
    tags: ["networking", "servers", "homelab"],
    excerpt:
      "Why DNS is the most critical piece of network infrastructure and how I run it in my lab.",
    coverImage: "/images/blog/dns-fundamentals-infrastructure.jpg",
    coverCredit: {
      author: "Bas van Schaik",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Ams-ix.k.root-servers.net.jpg",
    },
    content: `
## DNS Is Everything

If DNS is not working, nothing works. Web browsers cannot resolve domain names. Active Directory cannot find domain controllers. Email cannot route to mail servers. Monitoring systems cannot identify hosts. DNS is the foundation that everything else depends on, and it is the single most common cause of "the network is down" complaints.

## How DNS Works

DNS translates human-readable domain names into IP addresses. When you type a URL into a browser, your computer asks a DNS resolver for the IP address. The resolver checks its cache, and if it does not have the answer, it queries authoritative DNS servers in a hierarchical process that starts at the root servers and works down through the domain hierarchy.

## My DNS Setup

I run two BIND DNS servers in my lab on separate VMs for redundancy. They serve as authoritative servers for my internal domain and as recursive resolvers for external queries.

Internal DNS means I can access my servers by name instead of IP address. Instead of remembering that the Proxmox host is at 10.0.20.5, I type pve01.lab.local. When I reconfigure IP addresses, I update DNS once instead of updating every configuration file that references the old IP.

## Split DNS

I use split DNS (also called split-horizon DNS) so internal queries resolve to internal addresses and external queries resolve normally. My FortiGate handles this by directing DNS queries from internal VLANs to my internal DNS servers, while guest VLAN queries go directly to public DNS.

## Common Problems

The most common DNS issue I troubleshoot is stale records. If a server gets a new IP but the DNS record still points to the old one, connections fail in confusing ways. I handle this with short TTLs (time to live) on internal records, so changes propagate quickly.

The second most common issue is DNS forwarding misconfiguration. If your internal DNS server cannot resolve external domains because the forwarder is misconfigured, your servers cannot reach the internet for updates, NTP, or anything else.

## Testing DNS

I test DNS configurations with \`dig\` and \`nslookup\`. Both tools query DNS servers and show the response, including which server answered, the TTL, and the record type.

\`\`\`bash
dig @10.0.20.10 pve01.lab.local
nslookup pve01.lab.local 10.0.20.10
\`\`\`

Always test from the perspective of the client that is having the problem. DNS issues are often specific to which resolver a client is using.
`,
  },
  {
    slug: "xserve-apple-server-legacy",
    title: "The Apple Xserve: A Look at Apple's Server Legacy",
    date: "2025-11-12",
    tags: ["apple", "servers", "hardware", "history"],
    excerpt:
      "Apple used to make rack-mount servers. Here is why the Xserve mattered, why Apple killed it, and what it means for the Mac Pro.",
    coverImage: "/images/blog/xserve-apple-server-legacy.jpg",
    coverCredit: {
      author: "htomari",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apple_Xserve_(Early_2008)_(26396570970).jpg",
    },
    content: `
## What Was the Xserve

The Apple Xserve was a 1U rack-mount server that Apple sold from 2002 to 2011. It was a real server: rack-mountable, hot-swappable drives, dual processors, ECC memory, and server-grade management tools. Apple paired it with macOS Server and Xsan (a clustered filesystem) to provide a complete Apple-native server stack.

## Why It Mattered

The Xserve was the only Apple product designed specifically for the datacenter. It ran macOS Server, which provided file sharing, directory services (Open Directory), email, web hosting, and other server functions natively on Apple hardware. For organizations running all-Apple environments, the Xserve was the obvious server choice.

Creative studios, universities, and media companies adopted Xserve for render farms, file servers, and collaboration infrastructure. It integrated seamlessly with Mac workstations in ways that Windows or Linux servers could not.

## Why Apple Killed It

Apple discontinued the Xserve in 2011 because the server market is fundamentally different from the consumer market that Apple dominates. Server customers want long product lifecycles, extensive support contracts, standardized management tools, and competitive pricing. Apple wanted to sell premium consumer devices.

The Xserve never achieved the volume needed to justify Apple's investment in server-specific engineering. Dell, HP, and IBM were selling millions of servers. Apple was selling thousands.

## The Mac Pro as Spiritual Successor

The 2019 Mac Pro in rack-mount configuration is the closest thing to a modern Xserve. It fits in a standard rack, supports ECC memory, and can run macOS server workloads. But it is designed as a workstation, not a server. It lacks the server-specific features (hot-swap drives, redundant power supplies, IPMI) that made the Xserve a real server.

## What This Means

Apple has effectively exited the server market. If you need macOS in a rack, the Mac Pro is your only option, and it is an expensive, imperfect one. For everything else, Dell, HP, and Supermicro offer better value, better management, and better support.

The Xserve was ahead of its time in build quality and design. But it was in a market that Apple was never willing to commit to fully. That tension is the story of Apple in the enterprise.
`,
  },
  {
    slug: "raid-levels-comparison",
    title: "RAID Levels Explained: When to Use Each One",
    date: "2025-11-08",
    tags: ["storage", "servers", "hardware"],
    excerpt:
      "A practical comparison of RAID levels with real performance and reliability tradeoffs from my lab experience.",
    coverImage: "/images/blog/raid-levels-comparison.jpg",
    coverCredit: {
      author: "Mixabest",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:FSC_Primergy_TX200_S2_0012.JPG",
    },
    content: `
## What RAID Does

RAID (Redundant Array of Independent Disks) combines multiple physical drives into a logical unit for performance, redundancy, or both. The RAID level determines how data is distributed across the drives and how many drives can fail before data is lost.

## RAID 0: Speed, No Safety

RAID 0 stripes data across all drives with no redundancy. You get the combined capacity and performance of all drives, but if any single drive fails, all data is lost. I use RAID 0 for temporary scratch space where speed matters and the data is expendable.

## RAID 1: Simple Mirror

RAID 1 mirrors data across two drives. You get the capacity of one drive with the read performance of two. If either drive fails, the other has a complete copy. I use RAID 1 for boot drives on my servers because simplicity and reliability matter more than capacity.

## RAID 5: Balance

RAID 5 stripes data across three or more drives with one drive's worth of parity. Any single drive can fail without data loss. You lose one drive's worth of capacity to parity. RAID 5 is popular but has a dangerous weakness: during a rebuild after a drive failure, a second failure means total data loss. With modern large drives, rebuilds take hours or days.

## RAID 6: Better Safety

RAID 6 is like RAID 5 but with double parity. Any two drives can fail simultaneously without data loss. I prefer RAID 6 over RAID 5 for any array larger than four drives because the probability of a second failure during a rebuild is higher than most people realize.

## RAID 10: Performance and Redundancy

RAID 10 combines mirroring and striping. Pairs of drives are mirrored, and the mirrors are striped together. You get excellent read and write performance with the ability to survive at least one drive failure per mirror pair. The downside is that you lose 50% of your total capacity.

I use RAID 10 for VM storage where I/O performance is the priority. Random read and write performance on RAID 10 is significantly better than RAID 5 or 6.

## Software RAID vs Hardware RAID

Hardware RAID controllers (like Dell's PERC cards) handle RAID in dedicated hardware. Software RAID (like Linux mdadm or ZFS RAIDZ) does it in the CPU. Modern CPUs are fast enough that software RAID performs comparably to hardware RAID for most workloads, and software RAID gives you more flexibility and visibility into what the array is doing.

I use ZFS RAIDZ2 (which is conceptually similar to RAID 6) for my bulk storage and hardware RAID 1 for boot drives.
`,
  },
  {
    slug: "python-network-automation",
    title: "Automating Network Tasks with Python",
    date: "2025-11-05",
    tags: ["networking", "automation", "tools"],
    excerpt:
      "How I use Python to automate repetitive network configuration and monitoring tasks in my lab.",
    coverImage: "/images/blog/python-network-automation.jpg",
    coverCredit: {
      author: "9002Jack",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Python_sul_Terminale.jpg",
    },
    content: `
## Why Automate

Configuring network devices manually works fine when you have two switches. When you have ten, or twenty, or a hundred, manual configuration becomes error-prone and time-consuming. Automation ensures consistency, saves time, and reduces human error.

In my lab, I use Python to automate configuration backups, monitoring checks, and bulk configuration changes.

## Netmiko for Device Access

Netmiko is a Python library that simplifies SSH connections to network devices. It handles the quirks of different vendors (Cisco, Fortinet, Juniper, etc.) and provides a clean interface for sending commands and receiving output.

\`\`\`python
from netmiko import ConnectHandler

device = {
    "device_type": "cisco_ios",
    "host": "10.0.10.2",
    "username": "admin",
    "password": "securepassword",
}

connection = ConnectHandler(**device)
output = connection.send_command("show running-config")
connection.disconnect()

with open("switch_backup.txt", "w") as f:
    f.write(output)
\`\`\`

This script connects to a Cisco switch, pulls the running configuration, and saves it to a file. I run it nightly on every network device to maintain configuration backups.

## Paramiko for Custom SSH

For tasks where Netmiko's abstraction gets in the way, I use Paramiko directly. Paramiko is the SSH library that Netmiko is built on, and it gives you lower-level control over the SSH connection.

## SNMP with PySNMP

For monitoring, I use PySNMP to query SNMP data from network devices. This lets me pull interface statistics, CPU usage, and environmental data programmatically.

\`\`\`python
from pysnmp.hlapi import *

iterator = getCmd(
    SnmpEngine(),
    CommunityData("public"),
    UdpTransportTarget(("10.0.10.2", 161)),
    ContextData(),
    ObjectType(ObjectIdentity("SNMPv2-MIB", "sysUpTime", 0))
)

errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
for varBind in varBinds:
    print(f"{varBind[0]} = {varBind[1]}")
\`\`\`

## Practical Scripts

My most-used automation scripts:

1. **Config backup:** Connects to every network device and saves the running config. Runs nightly via cron.
2. **Port audit:** Checks which ports are up, which are down, and which have errors. Outputs a report.
3. **VLAN audit:** Pulls VLAN assignments from all switches and checks for inconsistencies.
4. **Uptime check:** Queries sysUpTime from all devices and flags any that have rebooted unexpectedly.

Each script is simple, focused, and reliable. They save me hours of manual checking every week.
`,
  },
  {
    slug: "server-rack-planning",
    title: "Planning a Server Rack: Layout, Power, and Cooling",
    date: "2025-11-01",
    tags: ["servers", "hardware", "homelab"],
    excerpt:
      "How I planned and organized my server rack, from choosing the right size to power distribution and cooling.",
    coverImage: "/images/blog/server-rack-planning.jpg",
    coverCredit: {
      author: "Derrick Coetzee from Berkeley, CA, USA",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:UPS_Power_Management_Module,_racks_with_network_cabling_in_NERSC_data_center.jpg",
    },
    content: `
## Choosing a Rack

Server racks are measured in "U" units, where 1U equals 1.75 inches of vertical space. Common sizes are 42U (full height), 24U (half height), and 12U (quarter height). I run a 42U rack because I knew I would grow into it, and having empty space is better than outgrowing a smaller rack.

Important specifications: make sure it is a standard 19-inch wide rack with a depth of at least 36 inches (preferably 40+) to accommodate deep servers. Weight capacity matters too. A fully loaded R740 weighs about 60 pounds, and a rack full of them needs a frame rated for the load.

## Layout Planning

I planned my rack layout on paper before installing anything. The general rules:

- **Heavy equipment goes at the bottom.** Servers and UPS units are the heaviest items and should be low for stability.
- **Networking equipment goes at the top.** Switches, patch panels, and cable management sit at the top where cable runs are shortest.
- **Leave space between sections.** 1U blanking panels between groups of equipment improve airflow and organization.
- **Power distribution on the sides.** Vertical PDUs mount on the rear rack rails and keep power cables organized.

## My Layout (Top to Bottom)

- 1U: Patch panel
- 1U: Mikrotik 10GbE switch
- 1U: Cisco switch
- 1U: Blank
- 5U: Mac Pro (rack-mount)
- 1U: Blank
- 2U: Dell R740 #1
- 2U: Dell R740 #2
- 1U: Blank
- 2U: UPS
- Remaining: Empty (future expansion)

## Power Planning

I calculated total power draw before installing anything. Each circuit in my house is rated for 15A at 120V, which is 1,800 watts. My rack draws about 1,300 watts under typical load, leaving headroom for peaks. If I add more equipment, I will need a dedicated circuit.

## Cooling

The rack is in a closet with forced-air ventilation. I added a vent fan at the top of the closet door to exhaust hot air into the room. A temperature sensor inside the rack triggers an alert if ambient temperature exceeds 85 degrees Fahrenheit.

## Lessons Learned

Buy more rack than you think you need. Label everything during installation, not after. And always test power and network before racking a server. Debugging a cabling issue with a 60-pound server on rails is miserable.
`,
  },
  {
    slug: "stp-troubleshooting",
    title: "Troubleshooting Spanning Tree Protocol Issues",
    date: "2025-10-28",
    tags: ["networking", "cisco", "troubleshooting"],
    excerpt:
      "Real STP problems I have encountered and how I diagnosed them using show commands and packet captures.",
    coverImage: "/images/blog/stp-troubleshooting.jpg",
    coverCredit: {
      author: "The original uploader was J.smith at English Wikipedia .",
      license: "CC BY-SA 2.5",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.5",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Switch-and-nest.jpg",
    },
    content: `
## STP Is Everywhere

Spanning Tree Protocol runs on every enterprise switch, usually without anyone thinking about it. It prevents Layer 2 loops by blocking redundant paths, and it is absolutely essential for network stability. But when STP goes wrong, it goes wrong fast.

## The Broadcast Storm

The worst STP failure I experienced in my lab was a broadcast storm caused by a misconfigured port. I had a port set as a trunk that should have been an access port. When I connected a second cable between two switches (creating a physical loop), STP should have blocked one path. Instead, the misconfigured port did not participate in STP correctly, and the loop formed.

The result was immediate. Every device on the VLAN became unreachable. CPU utilization on the switches spiked to 100%. The switches were spending all their resources forwarding broadcast frames in an infinite loop.

## Diagnosis

The first thing I checked was \`show spanning-tree\`:

\`\`\`
LabSwitch# show spanning-tree vlan 20
\`\`\`

This showed me the root bridge, the port roles (root, designated, alternate, blocked), and the port states. The problem was immediately visible: the misconfigured port was not in a blocking state when it should have been.

## Root Bridge Election

Every STP instance has a root bridge. The root bridge is the switch with the lowest bridge ID, which is a combination of priority and MAC address. In my lab, I set the priority on my core switch to ensure it is always the root bridge:

\`\`\`
LabSwitch(config)# spanning-tree vlan 20 priority 4096
\`\`\`

If you do not explicitly set a root bridge, the election is based on MAC addresses, which means a new switch with a lower MAC could take over as root and change your entire network topology.

## PortFast and BPDU Guard

For access ports that connect to end devices (workstations, servers), PortFast skips the STP listening and learning states and brings the port to forwarding immediately. BPDU Guard disables the port if it receives a STP BPDU (Bridge Protocol Data Unit), which would indicate that someone plugged a switch into an access port.

\`\`\`
LabSwitch(config-if)# spanning-tree portfast
LabSwitch(config-if)# spanning-tree bpduguard enable
\`\`\`

These two features together prevent most common STP issues on access ports.
`,
  },
  {
    slug: "mac-pro-afterburner-card",
    title: "The Apple Afterburner Card: Hardware Video Acceleration",
    date: "2025-10-25",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "What Apple's Afterburner accelerator card does, how it works, and why hardware-accelerated ProRes decoding matters.",
    coverImage: "/images/blog/mac-pro-afterburner-card.jpg",
    coverCredit: {
      author: "Gavin Lckg",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Mac_Pro_2019_on_wheels.jpg",
    },
    content: `
## What Afterburner Does

The Apple Afterburner card is a PCIe accelerator designed to decode ProRes and ProRes RAW video in hardware. It handles up to 6.3 billion pixels per second, which translates to 3 streams of 8K ProRes RAW or 12 streams of 4K ProRes RAW simultaneously. Without Afterburner, these decode operations happen on the CPU, which limits how many streams you can play back in real time.

## Why It Matters

In video post-production, editors need to scrub through high-resolution footage in real time. ProRes is Apple's professional codec, used widely in film and broadcast. Raw footage from professional cameras is enormous. A single stream of 8K ProRes RAW produces about 4 GB per minute.

Without hardware acceleration, playing back multiple 4K or 8K streams simultaneously would require an extremely powerful CPU. Afterburner offloads this work to a dedicated FPGA (field-programmable gate array), freeing the CPU for other tasks like effects rendering and compositing.

## The Hardware

Afterburner is built on a Xilinx FPGA. Apple programmed the FPGA with their ProRes decode logic, creating a purpose-built accelerator that is more power-efficient than doing the same work on a general-purpose CPU or GPU. The card draws about 25 watts and occupies a half-length PCIe slot.

This approach is interesting from an engineering perspective. FPGAs can be reprogrammed, which means Apple could theoretically update the card to support new codecs or improved decode algorithms through a firmware update. Whether they actually will is another question.

## In Practice

In my setup, Afterburner makes a noticeable difference when working with ProRes footage in Final Cut Pro. Timeline scrubbing is instant, even with multiple 4K streams and effects applied. Without Afterburner, the same timeline would stutter and drop frames.

For anyone doing serious video work on a Mac Pro, the Afterburner card is one of the most cost-effective upgrades available. It turns the Mac Pro from a powerful workstation into a dedicated video processing machine.

## The Bigger Picture

Afterburner is a good example of how hardware acceleration can transform specific workloads. The same principle applies to GPU-accelerated machine learning, FPGA-based network packet processing, and ASICs designed for cryptocurrency mining. When you can move a compute-intensive task from general-purpose hardware to dedicated hardware, the performance and efficiency gains are dramatic.
`,
  },
  {
    slug: "firewall-policy-design",
    title: "Designing Firewall Policies That Actually Work",
    date: "2025-10-22",
    tags: ["security", "networking", "fortinet"],
    excerpt:
      "How I approach firewall policy design, with practical examples from my FortiGate configuration.",
    coverImage: "/images/blog/firewall-policy-design.jpg",
    coverCredit: {
      author: "ShakataGaNai",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_ASA_5510.jpg",
    },
    content: `
## The Principle of Least Privilege

Every firewall policy should allow exactly what is needed and nothing more. This is the principle of least privilege applied to network traffic. The default posture should be deny-all, with explicit allow rules for each legitimate traffic flow.

In practice, this means starting with a policy that blocks everything, then adding rules one at a time as you identify what needs to be allowed. It is more work upfront, but it is dramatically more secure than starting with allow-all and trying to block bad traffic.

## My Methodology

Before writing any policies, I map out every traffic flow I need to support:

1. What source zone needs to reach what destination zone?
2. What protocol and port does the traffic use?
3. Is the traffic bidirectional or one-way?
4. Does it need deep packet inspection?

I document each flow in a table, then translate each row into a firewall policy.

## Zone-Based Design

I organize my firewall policies by zone. Each VLAN maps to a zone, and policies control traffic between zones. This is cleaner than per-interface policies because it abstracts the physical topology.

Example zones in my FortiGate:
- Management
- Servers
- Users
- IoT
- Guest
- Internet

## Policy Order

FortiGate (and most firewalls) evaluates policies top to bottom and applies the first match. This means specific rules must come before general rules. A common mistake is putting a broad allow rule above a specific deny rule, which effectively makes the deny rule useless.

I organize my policies in groups: inter-zone allow rules first, then zone-to-internet rules, then the implicit deny-all at the bottom.

## Logging

Every policy should log traffic, at minimum for session start. Logging lets you verify that policies are working as intended and provides forensic data for security investigations. I enable full logging on security policies and session-start logging on routine traffic policies.

## Regular Review

Firewall policies are not set-and-forget. I review my policies monthly to remove stale rules, tighten overly broad rules, and verify that the policy set matches the current network design. This discipline prevents policy bloat, where rules accumulate over time and nobody knows what half of them do.
`,
  },
  {
    slug: "virtualization-networking-concepts",
    title: "Networking Inside Virtual Environments",
    date: "2025-10-18",
    tags: ["networking", "virtualization", "servers"],
    excerpt:
      "How virtual switches, port groups, and VLAN tagging work inside hypervisors, and how they connect to physical networks.",
    coverImage: "/images/blog/virtualization-networking-concepts.jpg",
    coverCredit: {
      author: "Primalmotion",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Diagramme_ArchiHyperviseur.png",
    },
    content: `
## Virtual Switches

When you create a VM, it needs network access. The hypervisor provides this through virtual switches (vSwitches), which work like physical switches but exist entirely in software. VMs connect their virtual NICs to a vSwitch, and the vSwitch connects to a physical NIC on the host.

In Proxmox, the default virtual bridge is called vmbr0. In ESXi, it is a vSwitch or Distributed Switch. The concept is the same: a software-defined Layer 2 switch inside the hypervisor.

## Connecting to Physical Networks

The virtual switch connects to the physical network through one or more physical NICs (called uplinks). Traffic from VMs travels through the vSwitch, out the uplink NIC, and onto the physical network. From the physical switch's perspective, all VM traffic comes from the host's NIC.

## VLAN Tagging

To put VMs on different VLANs, you configure VLAN tagging on the virtual switch. The hypervisor adds VLAN tags to traffic leaving the vSwitch, and the physical switch must be configured with a trunk port that accepts those VLAN tags.

In Proxmox, you create VLAN-aware bridges or separate bridge interfaces for each VLAN. In ESXi, you create port groups with VLAN IDs. Either way, the result is the same: VMs can be placed on different VLANs without dedicated physical NICs for each VLAN.

## Common Problems

The most frequent issue I troubleshoot is mismatched VLAN configuration. If the hypervisor is tagging traffic with VLAN 20 but the physical switch port is configured as an access port on VLAN 10, the traffic gets dropped. Always verify that the physical switch port is configured as a trunk and allows the VLANs you need.

## Performance Considerations

Virtual networking adds a small amount of overhead compared to physical networking. For most workloads, the overhead is negligible. For high-throughput workloads (10GbE storage traffic, for example), techniques like SR-IOV (Single Root I/O Virtualization) can bypass the virtual switch entirely and give VMs near-native network performance.

I use SR-IOV for my NFS storage VMs that need maximum throughput, and standard vSwitch connectivity for everything else. The configuration complexity of SR-IOV is only worth it when you actually need the performance.
`,
  },
  {
    slug: "log-analysis-methodology",
    title: "How I Approach Log Analysis for Troubleshooting",
    date: "2025-10-15",
    tags: ["cybersecurity", "tools", "servers"],
    excerpt:
      "My methodology for analyzing logs to find problems, with examples from real troubleshooting sessions.",
    coverImage: "/images/blog/log-analysis-methodology.jpg",
    coverCredit: {
      author: "Hpott",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:OpenBSD_starting_SSH_server.jpg",
    },
    content: `
## Logs Tell the Truth

When a system is misbehaving, logs are the first place I look. Unlike user reports or symptoms, logs provide objective, timestamped records of what the system actually did. They do not lie (though they can be incomplete or misleading if you do not know what you are looking at).

## My Process

1. **Define the problem clearly.** What broke? When did it start? What changed?
2. **Identify which logs to check.** System logs, application logs, authentication logs, and network device logs each tell different parts of the story.
3. **Narrow the time window.** If the problem started at 2:30 PM, focus on logs from 2:15 PM to 2:45 PM. Looking at hours of logs wastes time.
4. **Search for errors and warnings first.** Grep for ERROR, WARN, FAIL, and DENIED. These keywords surface the most relevant entries quickly.
5. **Expand from there.** Once you find a relevant log entry, look at the entries before and after it for context.

## Tools

For quick searches, I use grep and awk on the command line:

\`\`\`bash
grep -i "error" /var/log/syslog | tail -50
journalctl --since "2026-02-10 14:00" --until "2026-02-10 15:00"
\`\`\`

For more complex analysis, I pipe log data into Python scripts that parse timestamps, extract fields, and aggregate patterns.

## Common Patterns

Some log patterns I have learned to recognize immediately:

- **Rapid repeated authentication failures:** Brute force attempt or misconfigured service.
- **Disk I/O errors:** Failing drive. Check SMART data and replace.
- **Connection refused messages:** Service is not running, port is blocked, or wrong IP.
- **Out of memory (OOM) kills:** A process consumed too much RAM and the kernel killed it. Need more memory or the application has a memory leak.

## Centralized Logging

Checking logs on individual servers is fine for a few machines. Once you have more than five, centralized logging is essential. I send all syslog data to a central server where I can search across all machines from one interface. This also means I have log copies even if the original server's logs are lost.

## The NCL Connection

Log analysis is a major category in the National Cyber League competition. The skills transfer directly: you get a set of logs and need to extract specific information, identify attacks, and answer questions about what happened. The methodology is identical to real-world troubleshooting.
`,
  },
  {
    slug: "apple-t2-security-chip",
    title: "Apple's T2 Security Chip in the Mac Pro",
    date: "2025-10-12",
    tags: ["apple", "mac-pro", "security", "hardware"],
    excerpt:
      "What the T2 chip does in the Mac Pro, how it affects server use, and the tradeoffs between security and flexibility.",
    coverImage: "/images/blog/apple-t2-security-chip.jpg",
    coverCredit: {
      author: "Henriok",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apple_T2_APL1027.jpg",
    },
    content: `
## What the T2 Does

The T2 chip in the 2019 Mac Pro is a custom Apple silicon processor that handles several security and utility functions: Secure Boot, encrypted storage, audio processing, and the system management controller. It is essentially a separate computer inside your Mac that runs its own OS (bridgeOS) and manages hardware security.

## Secure Boot

The T2 enforces Secure Boot, which means the Mac will only boot from a cryptographically signed operating system. By default, this means macOS. You can adjust the security level to "No Security" through the Startup Security Utility, which allows booting from external drives and non-Apple operating systems.

For server use, Secure Boot is a double-edged sword. It prevents rootkit-style attacks that modify the boot process, but it also makes it harder to run alternative operating systems or boot from custom recovery media.

## Encrypted Storage

The T2 encrypts all data on the internal SSD using hardware AES-256 encryption. The encryption keys are tied to the T2 chip itself, which means the SSD cannot be read if removed from the Mac Pro and placed in a different machine.

This is great for security but terrible for data recovery. If the T2 chip fails, the data on the SSD is unrecoverable. This is why backups are non-negotiable on any T2-equipped Mac.

## Impact on Linux

Running Linux on a T2-equipped Mac is possible but requires additional effort. The T2 controls the NVMe controller, the touch bar (on laptops), and the audio hardware. Linux support for T2 features has improved through community projects, but it is not seamless.

For the Mac Pro specifically, the T2's role is less intrusive because the Mac Pro does not have a touch bar. But Secure Boot configuration and SSD encryption still need to be considered.

## The Tradeoff

The T2 chip represents Apple's philosophy of security through hardware control. It makes the Mac Pro more secure by default but less flexible. For a personal workstation, the security benefits probably outweigh the flexibility costs. For a server that might need to boot different operating systems or have its storage transplanted for recovery, the T2 adds constraints that traditional server hardware does not have.

In my lab, I keep the Mac Pro on its default macOS configuration and use my Dell servers for anything that needs OS flexibility. The T2 is a non-issue when you use the Mac Pro for what it was designed to do.
`,
  },
  {
    slug: "network-documentation-best-practices",
    title: "Network Documentation That Actually Gets Used",
    date: "2025-10-08",
    tags: ["networking", "homelab", "tools"],
    excerpt:
      "How I document my network infrastructure in a way that is useful during outages, not just for show.",
    coverImage: "/images/blog/network-documentation-best-practices.jpg",
    coverCredit: {
      author: "R. Vogl, University of M\u00fcnster (Germany), Center for Information Processing",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:WWU-network-structure-v1.png",
    },
    content: `
## The Problem

Most network documentation is either nonexistent or so outdated that it is worse than useless. Outdated documentation gives you false confidence. You think you know how the network is configured, but the documentation does not match reality, and you make decisions based on wrong information.

## What I Document

My documentation covers four categories:

**1. Topology diagrams.** Visual maps showing how devices connect, including interface names, IP addresses, and VLAN assignments. I update these whenever I add or remove equipment.

**2. IP address management (IPAM).** A spreadsheet listing every IP address assignment, what device it belongs to, and which VLAN it is on. This prevents duplicate IPs and makes it easy to find available addresses.

**3. Configuration backups.** Automated nightly backups of every network device configuration. Stored in git so I can see what changed and when.

**4. Runbooks.** Step-by-step procedures for common tasks: adding a new VLAN, configuring a switch port, troubleshooting a connectivity issue, failing over to a backup. Written so someone unfamiliar with the network could follow them.

## Tools

I use draw.io for topology diagrams because it is free, exports to multiple formats, and runs in a browser. For IPAM, a simple spreadsheet works for my scale. For configuration backups, I use Python scripts that pull configs via SSH and commit them to a git repository.

The git approach for configurations is powerful. When something breaks after a change, I can diff the current configuration against the last known good configuration and see exactly what changed.

## The Test

Good documentation passes the "2 AM test": if your network goes down at 2 AM and you are half asleep, can you find the information you need to diagnose and fix the problem? If the answer is no, your documentation needs work.

## Keeping It Current

The hardest part of documentation is keeping it updated. I make it a rule: no infrastructure change is complete until the documentation is updated. The change log, the diagram, the IPAM spreadsheet, everything gets updated as part of the change process, not after.
`,
  },
  {
    slug: "power-consumption-monitoring",
    title: "Monitoring and Reducing Server Power Consumption",
    date: "2025-10-05",
    tags: ["servers", "hardware", "homelab", "power"],
    excerpt:
      "How I monitor power usage in my rack and the settings that made the biggest difference in my electricity bill.",
    coverImage: "/images/blog/power-consumption-monitoring.jpg",
    coverCredit: {
      author: "Robert.Harker",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:UPS_PDU_Open.jpg",
    },
    content: `
## Measuring Power

You cannot optimize what you do not measure. I use three levels of power monitoring:

1. **Kill-A-Watt meter** on the rack's input circuit for total rack power draw
2. **PDU displays** showing per-PDU power consumption
3. **iDRAC power monitoring** showing per-server real-time and historical power usage

Together, these give me a complete picture of where power is going.

## What I Found

When I first measured, my rack was drawing about 1,600 watts continuously. At my electricity rate, that works out to roughly $140 per month. Not trivial.

Breaking it down:
- Dell R740 #1: ~500W (heavily loaded with VMs)
- Dell R740 #2: ~450W (moderate load)
- Mac Pro: ~280W (mostly idle)
- Networking equipment: ~80W
- UPS overhead: ~60W

## Optimizations

**BIOS power profiles:** Switching from "Performance" to "Performance Per Watt (OS)" on both R740s saved about 80W total with no noticeable performance impact.

**Idle server management:** The Mac Pro was drawing 280W while barely being used. I configured it to sleep when idle and wake on network access. Average draw dropped to about 40W.

**Consolidating VMs:** By rebalancing VM placement, I was able to keep R740 #2 at lower utilization, which reduced its power draw by about 60W.

**After optimization:** Total rack draw dropped from 1,600W to about 1,100W. That is a 30% reduction and saves roughly $40 per month.

## Temperature and Power

Server power draw is closely linked to cooling. Higher ambient temperatures cause fans to spin faster, which uses more power, which generates more heat. Keeping the rack area cool (below 75F) helps keep fan speeds and power draw lower.

I added better ventilation to the closet housing my rack, which dropped ambient temperature by about 5 degrees and resulted in measurably lower fan speeds and power consumption.

## The Long-Term View

Power costs add up over years. A 500W reduction saves over $500 per year at typical electricity rates. When evaluating new equipment, I now factor in power consumption alongside purchase price, performance, and features. A server that costs less but draws more power may actually cost more over its lifetime.
`,
  },
  {
    slug: "incident-response-methodology",
    title: "Incident Response: What to Do When Things Break",
    date: "2025-10-01",
    tags: ["cybersecurity", "networking", "servers"],
    excerpt:
      "My approach to handling infrastructure incidents, from detection through resolution and documentation.",
    coverImage: "/images/blog-incident-response-methodology.png",
    content: `
## Incidents Will Happen

No matter how well you design and maintain your infrastructure, things will break. Hardware fails. Software has bugs. Configuration changes have unintended consequences. The question is not whether incidents will happen, but how effectively you respond when they do.

## My Framework

I follow a structured approach based on established incident response frameworks:

### 1. Detect and Identify

The first step is knowing that something is wrong and understanding what is affected. Monitoring and alerting handle detection. Identification means determining the scope: what service is down, who is affected, and what is the business impact.

### 2. Contain

Stop the problem from getting worse. If a server is compromised, isolate it from the network. If a configuration change broke connectivity, roll it back. If a process is consuming all system resources, kill it. Containment is about limiting damage while you figure out the root cause.

### 3. Diagnose

Find the root cause. This is where log analysis, packet captures, and systematic troubleshooting come in. Start with what changed recently. Most incidents are caused by recent changes, even if the relationship is not immediately obvious.

### 4. Resolve

Fix the problem. Apply the patch, replace the hardware, correct the configuration, or restore from backup. Verify that the fix actually works and that the service is fully restored.

### 5. Document

Write down what happened, when it happened, what caused it, how it was fixed, and what will prevent it from happening again. This is the step most people skip, and it is arguably the most important one. Good incident documentation prevents recurring problems and helps you respond faster next time.

## Communication

During an incident, clear communication matters. Even in a homelab where I am the only user, I keep a running log of what I have tried, what I have found, and what I plan to do next. This prevents going in circles and provides a record for the post-incident review.

## Practice

I occasionally create intentional incidents in my lab environment to practice response procedures. Breaking something on purpose and then fixing it under time pressure is the closest thing to real-world incident response training you can get without actual production incidents.
`,
  },
  {
    slug: "mac-pro-gpu-compute",
    title: "GPU Compute on the Mac Pro: Metal and Beyond",
    date: "2025-09-28",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "How the Mac Pro's dual Vega II GPUs handle compute workloads and where they fit in the GPU computing landscape.",
    coverImage: "/images/blog/mac-pro-gpu-compute.jpg",
    coverCredit: {
      author: "FritzchensFritz",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:AMD@14nm@GCN_5th_gen@Vega10@Radeon_RX_Vega_64@ES-Sample@_DSC01129.jpg",
    },
    content: `
## The Hardware

My Mac Pro has dual AMD Radeon Pro Vega II GPUs, each with 32 GB of HBM2 (High Bandwidth Memory). Together, that is 64 GB of GPU memory with massive bandwidth. These are workstation GPUs designed for sustained compute loads, not gaming.

The Infinity Fabric Link between the two GPUs allows them to share memory and work together on compute tasks, which is unusual for consumer/workstation hardware. This effectively gives you a single 64 GB GPU address space for workloads that support it.

## Metal for Compute

Apple's Metal API is the primary way to access GPU compute on macOS. Metal Performance Shaders (MPS) provide optimized implementations of common operations like matrix multiplication, convolution, and image processing. These are the building blocks for machine learning inference and media processing.

For video work, the GPUs accelerate ProRes encoding/decoding, color grading, and effects rendering in Final Cut Pro and DaVinci Resolve. The HBM2 memory bandwidth means large frames can be processed without bottlenecking on memory access.

## Machine Learning

The Mac Pro can run machine learning inference workloads through Core ML and Metal. For training, it is limited compared to NVIDIA GPUs because the ML ecosystem (PyTorch, TensorFlow) is built primarily around CUDA. AMD's ROCm framework provides some compatibility, but it is not at parity with CUDA.

For inference, the Mac Pro performs well. Apple has invested heavily in optimizing Core ML for their hardware, and many pre-trained models can be converted to Core ML format and run efficiently on the Vega II GPUs.

## The NVIDIA Gap

The elephant in the room is that most GPU compute workloads are optimized for NVIDIA CUDA. The Mac Pro does not support NVIDIA GPUs (Apple and NVIDIA parted ways years ago). This means the Mac Pro is excluded from the dominant GPU computing ecosystem.

For specific Apple-optimized workloads (media processing, Core ML inference, Metal compute), the Mac Pro is excellent. For general-purpose GPU computing (CUDA-based ML training, scientific computing), an NVIDIA-equipped server is the better choice.

## My Use

I use the Mac Pro's GPUs primarily for video processing and as a learning platform for Metal compute programming. For anything that needs CUDA, I run it on my Dell servers with passthrough GPUs or on cloud instances. The right tool for the right job.
`,
  },
  {
    slug: "ssl-tls-certificates-explained",
    title: "SSL/TLS Certificates: What They Are and How They Work",
    date: "2025-09-25",
    tags: ["security", "networking", "servers"],
    excerpt:
      "A practical explanation of TLS certificates, certificate authorities, and how to manage certificates on your own infrastructure.",
    coverImage: "/images/blog/ssl-tls-certificates-explained.jpg",
    coverCredit: {
      author: "Wikisosh",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Digital_certificates_chain_of_trust.png",
    },
    content: `
## What TLS Does

TLS (Transport Layer Security) encrypts communication between a client and a server. When you connect to a website over HTTPS, TLS ensures that nobody can read or modify the data in transit. It also verifies the identity of the server, so you know you are connected to the real site and not an impostor.

## How Certificates Work

A TLS certificate is a digital document that binds a public key to a domain name (or IP address). The certificate is signed by a Certificate Authority (CA) that the client trusts. When a client connects, the server presents its certificate, the client verifies the CA's signature, and if everything checks out, they establish an encrypted connection.

The trust chain goes: client trusts CA -> CA signed the certificate -> certificate proves the server's identity.

## Certificate Types

**Domain Validated (DV):** The CA verifies that you control the domain name. This is the most common type and what Let's Encrypt provides for free. Good for most use cases.

**Organization Validated (OV):** The CA also verifies that your organization exists. Adds the organization name to the certificate.

**Extended Validation (EV):** The CA performs thorough verification of the organization. Used to display the organization name in the browser's address bar (though most browsers have stopped showing this prominently).

## Self-Signed Certificates

For internal infrastructure, I use self-signed certificates generated with my own internal CA. This means I do not need to expose internal services to the internet for domain validation, and I can issue certificates for any internal hostname or IP.

I set up a simple CA using openssl:

\`\`\`bash
openssl req -x509 -newkey rsa:4096 -keyout ca-key.pem -out ca-cert.pem -days 3650 -nodes
\`\`\`

I distribute the CA certificate to all internal machines so they trust certificates signed by my internal CA.

## Let's Encrypt for Public Services

For any service exposed to the internet, I use Let's Encrypt certificates. They are free, automatically renewed, and trusted by all major browsers. Certbot handles the issuance and renewal process automatically.

## Certificate Management

The biggest challenge with certificates is tracking expiration dates. An expired certificate causes service outages and browser warnings. I monitor certificate expiration with a simple script that checks each certificate's validity date and alerts me 30 days before expiration.
`,
  },
  {
    slug: "apple-file-system-apfs",
    title: "APFS: Apple's Modern Filesystem and Its Server Implications",
    date: "2025-09-22",
    tags: ["apple", "storage", "mac-pro"],
    excerpt:
      "How APFS works, what it does well, and why it is not a replacement for ZFS in server environments.",
    coverImage: "/images/blog/apple-file-system-apfs.jpg",
    coverCredit: {
      author: "FaceMePLS from The Hague, The Netherlands",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:SSD_in_Mac_(26457298651).jpg",
    },
    content: `
## What APFS Is

Apple File System (APFS) is Apple's modern filesystem, introduced in 2017 to replace HFS+. It was designed primarily for flash storage (SSDs) and supports features like snapshots, clones, strong encryption, space sharing, and crash protection through copy-on-write metadata.

## What APFS Does Well

APFS is excellent for its intended use case: Apple devices with SSDs. Snapshots are instant and space-efficient. Encryption is hardware-accelerated and transparent. Space sharing lets multiple volumes share a single storage pool dynamically, which is perfect for devices with fixed internal storage.

File operations on APFS are fast because the filesystem was designed around the characteristics of flash storage rather than spinning disks.

## Where APFS Falls Short for Servers

APFS does not checksum file data. It checksums metadata (directory structures, file attributes) but not the actual file contents. This means APFS cannot detect or correct silent data corruption, which is a critical gap for server storage. ZFS, by contrast, checksums every block of data and can self-heal when corruption is detected.

APFS also does not support software RAID. There is no APFS equivalent of ZFS RAIDZ or Linux md RAID. For redundant storage, you need either hardware RAID (which APFS sits on top of) or Apple's now-deprecated software RAID from Disk Utility.

## APFS vs ZFS

For server storage:
- **Data integrity:** ZFS wins. Checksumming and self-healing are essential for data you care about.
- **RAID:** ZFS wins. RAIDZ provides integrated software RAID with flexible configurations.
- **Snapshots:** Both are excellent. APFS snapshots are lighter-weight for typical desktop use. ZFS snapshots are more powerful for server backup workflows (send/receive).
- **Encryption:** APFS is more tightly integrated with Apple hardware. ZFS encryption works but is a newer addition.
- **Performance on SSDs:** APFS is optimized for Apple's specific SSD controllers. ZFS performs well on SSDs but was originally designed for spinning disks.

## My Approach

On my Mac Pro, I use APFS for the boot volume and local workspace because it is the native macOS filesystem and works seamlessly with Apple's tools. For any data that needs integrity guarantees or redundancy, I store it on ZFS pools running on my Dell servers.

This hybrid approach uses each filesystem where it is strongest.
`,
  },
  {
    slug: "homelab-network-evolution",
    title: "How My Home Network Evolved Over Three Years",
    date: "2025-09-18",
    tags: ["networking", "homelab", "hardware"],
    excerpt:
      "From a consumer router to a full enterprise network. The stages, mistakes, and lessons from building my infrastructure.",
    coverImage: "/images/blog/homelab-network-evolution.jpg",
    coverCredit: {
      author: "Alan Levine",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Home_server_equipment.jpg",
    },
    content: `
## Stage 1: Consumer Router

Like most people, I started with the router my ISP provided. A single device handled routing, switching, WiFi, DHCP, DNS, and firewall. It worked fine for basic internet access, but it was a black box. I could not configure VLANs, could not see detailed traffic logs, and had no visibility into what was happening on my network.

## Stage 2: Managed Switch and Separate Router

The first upgrade was adding a managed switch and replacing the ISP router with a dedicated device. Suddenly I could create VLANs, monitor port statistics, and configure trunks. This was the moment I went from using a network to understanding how networks work.

The managed switch taught me more about networking in a month than I had learned in the previous year. Being able to see MAC address tables, VLAN assignments, and port counters in real time made abstract concepts concrete.

## Stage 3: Enterprise Hardware

Adding Dell PowerEdge servers was the next step. This required proper network infrastructure: more switch ports, 10GbE for storage traffic, and a firewall with real policy enforcement. I added a FortiGate for routing and security, a Cisco switch for my learning goals, and Mellanox NICs for 10GbE.

This is also when I started treating the network as infrastructure rather than an accessory. Documentation, change management, monitoring, and backups all became necessary.

## Stage 4: Full Lab Environment

The current state includes multiple Dell servers, a Mac Pro, enterprise networking, segmented VLANs, centralized monitoring, automated backups, and proper documentation. It is closer to a small enterprise network than a home network.

## Mistakes I Made

- **Not labeling cables early.** I had to trace and label everything retroactively. Do it from the start.
- **Skipping documentation.** Same problem. Document as you build, not after.
- **Buying consumer-grade equipment.** I replaced cheap switches and routers multiple times before investing in enterprise hardware that did what I needed. Buy right once.
- **Not planning for power.** Adding servers without considering power draw and circuit capacity caused breaker trips. Measure before you install.

## What I Would Do Differently

Start with a managed switch and a firewall from the beginning. The consumer router phase taught me nothing. As soon as you have managed infrastructure, every addition builds on a solid foundation.
`,
  },
  {
    slug: "container-orchestration-basics",
    title: "Container Orchestration: Docker and LXC in a Homelab",
    date: "2025-09-15",
    tags: ["virtualization", "servers", "homelab"],
    excerpt:
      "How I use containers alongside virtual machines in my lab, and when each approach makes sense.",
    coverImage: "/images/blog/container-orchestration-basics.jpg",
    coverCredit: {
      author: "Dereckson",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Openfire_architecture_on_Nasqueron_Docker_PaaS.png",
    },
    content: `
## Containers vs VMs

Virtual machines emulate complete hardware. Each VM runs its own kernel, its own OS, and its own set of services. This provides strong isolation but consumes more resources because every VM needs its own copy of the operating system.

Containers share the host's kernel and only package the application and its dependencies. This makes them lighter, faster to start, and more resource-efficient. The tradeoff is weaker isolation compared to VMs.

## When I Use VMs

VMs are my choice for anything that needs strong isolation, runs a different OS, or represents a "server" in my mental model. My Windows Server domain controllers, my pfSense firewall test instances, and my Linux servers all run as full VMs.

VMs are also better for long-running services that need to survive host reboots and migrations. Proxmox's VM management (snapshots, backups, live migration) is mature and reliable.

## When I Use Containers

Containers (specifically LXC containers on Proxmox) are my choice for lightweight services that run on Linux and do not need strong isolation from the host. DNS servers, monitoring agents, small web services, and development environments all run in LXC containers.

An LXC container uses a fraction of the resources of a VM. A container running Pi-hole (DNS filtering) uses about 50 MB of RAM and negligible CPU. A VM running the same service would use 512 MB minimum just for the OS overhead.

## Docker

Docker containers are different from LXC. Docker is designed for packaging and distributing applications, with a focus on immutable images and declarative configuration. I run Docker inside VMs when I need Docker-specific tooling, but for most homelab services, LXC containers are simpler and lighter.

\`\`\`yaml
version: "3"
services:
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
volumes:
  grafana-data:
\`\`\`

## The Right Tool

There is no universal answer to "containers or VMs." Both have their place. My rule of thumb: if it needs its own kernel or strong isolation, use a VM. If it is a Linux service that can share the host kernel, use a container. If it is a portable application packaged as a Docker image, use Docker.
`,
  },
  {
    slug: "bgp-for-network-engineers",
    title: "BGP for Network Engineers: A Practical Introduction",
    date: "2026-02-21",
    tags: ["networking", "bgp", "routing"],
    excerpt: "BGP is the protocol that holds the internet together. Here is what you actually need to know to start working with it in real environments.",
    coverImage: "/images/blog/bgp-for-network-engineers.jpg",
    coverCredit: {
      author: "pmsyyz",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/96671942@N00/5768497319",
    },
    content: `
## What BGP Actually Is

BGP (Border Gateway Protocol) is the routing protocol that connects autonomous systems on the internet. Unlike interior routing protocols like OSPF or EIGRP, BGP is designed for policy-based routing between organizations. It is not just about finding the shortest path. It is about controlling which paths are preferred, which ones are advertised, and which ones are filtered entirely.

If you have ever wondered how traffic flows between your ISP and the rest of the internet, the answer is BGP.

## Key Concepts

**Autonomous Systems (AS):** Every network that participates in BGP has an AS number (ASN). This is how BGP identifies routing domains. Large ISPs, cloud providers, and universities all have their own ASNs.

**eBGP vs iBGP:** External BGP (eBGP) runs between different autonomous systems. Internal BGP (iBGP) runs within the same AS, typically to distribute routes learned from eBGP peers throughout the network.

**BGP Attributes:** BGP uses path attributes to make routing decisions. The most important ones are:
- **AS Path:** The list of AS numbers a route has traversed. Shorter is generally preferred.
- **Local Preference:** Used internally to prefer one exit point over another.
- **MED:** Multi-Exit Discriminator, used to suggest preferred ingress points to external peers.
- **Next Hop:** The next-hop IP for reaching a destination.

## Basic Configuration

\`\`\`
router bgp 65001
  neighbor 192.168.1.2 remote-as 65002
  neighbor 192.168.1.2 description UPSTREAM_ISP
  network 10.0.0.0 mask 255.255.255.0
\`\`\`

## Why It Matters in the Real World

Even if you work in enterprise networking rather than ISP networking, BGP comes up constantly. Cloud providers use it for connecting on-premises networks to AWS, Azure, or GCP via Direct Connect or ExpressRoute. SD-WAN solutions often use BGP internally. Understanding BGP makes you a much more effective network engineer.

## Where to Practice

You can run BGP labs in GNS3 or EVE-NG using virtual Cisco or FRR routers. Start with a simple two-AS topology, peer them, and watch the route tables populate. Then add filters and attributes to see how routing decisions change.
`,
  },
  {
    slug: "fortigate-cli-essentials",
    title: "FortiGate CLI: Commands You Will Use Every Day",
    date: "2026-02-22",
    tags: ["fortinet", "firewall", "networking"],
    excerpt: "The FortiGate GUI is useful, but the CLI is where real control happens. Here are the commands that matter most in production environments.",
    coverImage: "/images/blog/fortigate-cli-essentials.jpg",
    coverCredit: {
      author: "Premeditated",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Fortinet_FortiGate_6501F.png",
    },
    content: `
## Why Learn the CLI

The FortiGate GUI is well designed and handles most tasks fine. But when you are troubleshooting a production issue under pressure, the CLI is faster, more precise, and more scriptable. It also gives you access to diagnostic tools and detailed output that the GUI does not expose.

## Essential Show Commands

\`\`\`bash
# Show interface status and IP assignments
get system interface

# Show routing table
get router info routing-table all

# Show firewall policies
show firewall policy

# Show active sessions
diagnose sys session list

# Show BGP neighbors and state
get router info bgp summary

# Show hardware and version info
get system status
\`\`\`

## Packet Capture

FortiGate has a built-in packet sniffer that is invaluable for troubleshooting:

\`\`\`bash
# Capture traffic on port1 matching a host
diagnose sniffer packet port1 "host 192.168.1.100" 4 0 l

# The parameters: interface, filter, verbosity (4 = full packet), count (0 = unlimited), timestamp format
\`\`\`

## Debug Flow

The debug flow tool shows you exactly what the FortiGate does with each packet through the policy engine:

\`\`\`bash
diagnose debug reset
diagnose debug flow filter addr 192.168.1.100
diagnose debug flow show console enable
diagnose debug enable
diagnose debug flow trace start 10
\`\`\`

This output tells you which policy matches the traffic, whether NAT is applied, and whether the packet is allowed or dropped. It is the fastest way to diagnose connectivity problems.

## HA Status

\`\`\`bash
# Check HA cluster status
diagnose sys ha status

# Show which unit is primary
get system ha status
\`\`\`

## Tips

Always run \`diagnose debug disable\` and \`diagnose debug reset\` when you are done debugging. Leaving debug enabled affects performance. And document any changes you make in the CLI, because the GUI does not always show CLI-only configurations clearly.
`,
  },
  {
    slug: "kvm-proxmox-esxi-comparison",
    title: "KVM vs Proxmox vs ESXi: Choosing a Hypervisor",
    date: "2026-02-23",
    tags: ["virtualization", "servers", "homelab"],
    excerpt: "Three serious hypervisors, three different trade-offs. Here is how to think about choosing between KVM, Proxmox, and VMware ESXi for your environment.",
    coverImage: "/images/blog/kvm-proxmox-esxi-comparison.jpg",
    coverCredit: {
      author: "Primalmotion",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Diagramme_ArchiHyperviseur.png",
    },
    content: `
## The Core Question

All three of these platforms run virtual machines. The differences are in management, ecosystem, licensing, and how well they fit specific use cases. Choosing the right one depends on what you are trying to do.

## Bare-Metal KVM

KVM (Kernel-based Virtual Machine) is built into the Linux kernel. If you install Ubuntu or RHEL on a server, you already have a hypervisor. Add QEMU for machine emulation and libvirt for management, and you have a complete virtualization stack.

**Best for:** Developers who want full control, cloud infrastructure builders, or situations where you need to integrate virtualization into a custom system.

**Trade-offs:** No built-in management UI. You manage everything through the command line or third-party tools like Cockpit or virt-manager. More flexible but more work to set up and operate.

## Proxmox VE

Proxmox is built on Debian Linux and KVM, with a polished web UI and built-in features for clustering, high availability, and both VM and container (LXC) management. It is free and open source, with paid support subscriptions available.

**Best for:** Homelabs, small datacenters, anyone who wants KVM's power with a proper management interface. This is what I run in my homelab.

**Trade-offs:** The community version works great but shows nag messages about subscriptions. The clustering features require some networking configuration to get right.

## VMware ESXi

ESXi is the industry standard in enterprise environments. If you work in a large organization, you almost certainly have ESXi somewhere. It runs as a bare-metal hypervisor with a very thin footprint, and the VMware ecosystem (vCenter, vSAN, NSX) is extremely mature.

**Best for:** Enterprise environments, organizations that need vendor support, situations where vCenter is already deployed.

**Trade-offs:** Licensing costs are significant. Since Broadcom's acquisition of VMware, the pricing and licensing model has become much less friendly for small organizations and homelabs. Free ESXi is now unavailable.

## My Take

For a homelab or small lab environment, Proxmox is the clear winner. You get all the power of KVM with a proper UI, no licensing costs, and excellent documentation. For enterprise, ESXi remains dominant simply because the tooling and ecosystem are unmatched, even if the cost has increased substantially.
`,
  },
  {
    slug: "nvme-vs-sata-enterprise-storage",
    title: "NVMe vs SATA in Enterprise Storage",
    date: "2026-02-24",
    tags: ["storage", "hardware", "servers"],
    excerpt: "The performance gap between NVMe and SATA is real and significant. Here is when it matters and when it does not.",
    coverImage: "/images/blog/nvme-vs-sata-enterprise-storage.jpg",
    coverCredit: {
      author: "Dmitry Nosachev",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Intel_P3608_NVMe_flash_SSD,_PCI-E_add-in_card.jpg",
    },
    content: `
## The Numbers

A typical SATA SSD tops out at around 550 MB/s sequential read. A modern NVMe SSD reaches 5,000 MB/s or more on PCIe 4.0, and enterprise NVMe drives designed for consistent random I/O push even harder. The gap is not marginal. It is an order of magnitude.

But raw speed is only part of the story. The more important metric for servers is IOPS (input/output operations per second) for random small-block reads and writes. That is where NVMe really pulls ahead.

## Where NVMe Wins Clearly

**VM storage:** Virtual machines doing lots of random I/O benefit enormously from NVMe. Boot times drop, responsiveness improves, and you can run more VMs per storage device before hitting I/O bottlenecks.

**Database workloads:** Any database doing lots of small random reads and writes sees dramatic improvements with NVMe.

**Live migrations:** Moving a running VM between hosts over NVMe-backed storage is smoother and faster than SATA.

## Where SATA Is Still Fine

**Bulk storage and archives:** If you are storing backup files, logs, or large media files that are written once and read occasionally, SATA is perfectly adequate. Sequential throughput on SATA is more than sufficient for these workloads.

**Cold data tiers:** Many storage systems implement tiering, where hot data lives on NVMe and cold data moves to SATA or spinning disk. SATA fits naturally in this architecture.

## Enterprise NVMe Specifics

Consumer NVMe drives are not designed for 24/7 server duty. Enterprise NVMe drives have features like power loss protection (capacitors that complete writes if power fails), consistent latency profiles under sustained load, and much higher endurance ratings.

In my lab, I run NVMe for VM storage pools and SATA SSDs for secondary storage. The performance difference is obvious in daily use, and the cost difference has narrowed enough that NVMe is the right choice for anything performance-sensitive.
`,
  },
  {
    slug: "network-monitoring-system-build",
    title: "Building a Network Monitoring System from Scratch",
    date: "2026-02-25",
    tags: ["networking", "monitoring", "homelab"],
    excerpt: "A step-by-step look at building a monitoring system that gives you real visibility into your network's health, traffic, and events.",
    coverImage: "/images/blog/network-monitoring-system-build.jpg",
    coverCredit: {
      author: "Masdestructive",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Batelco_Network_Operations_Centre_(NOC).JPG",
    },
    content: `
## Why Build Your Own

Commercial network monitoring tools are expensive and often overkill for a lab or small environment. Building your own gives you deep understanding of how monitoring works and exactly the visibility you need without paying for features you never use.

## The Stack

My monitoring stack uses four main components:

**SNMP polling with Prometheus SNMP Exporter:** Collects interface statistics, CPU and memory utilization, and other metrics from network devices via SNMP. Prometheus scrapes these metrics on a schedule and stores them.

**Grafana for visualization:** Grafana connects to Prometheus and renders dashboards. You can build exactly the views you need: interface utilization graphs, device health panels, and alert history.

**Alertmanager for notifications:** When metrics cross thresholds, Alertmanager routes alerts to email or other destinations. A down interface or a device with 95 percent CPU should wake you up.

**Syslog collection with Loki:** Devices send syslog messages to a central collector. Loki stores them, and Grafana lets you search and correlate logs with metrics.

## Setting Up SNMP

First, enable SNMP on your devices with a strong community string or, better, SNMPv3 with authentication and encryption. Then configure the SNMP Exporter with the appropriate module for your device type.

\`\`\`yaml
# prometheus.yml
scrape_configs:
  - job_name: 'snmp'
    static_configs:
      - targets:
        - 192.168.1.1  # FortiGate
        - 192.168.1.10  # Cisco switch
    metrics_path: /snmp
    params:
      module: [if_mib]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: localhost:9116
\`\`\`

## What to Monitor

Focus first on the things that cause outages or degraded service: interface utilization and error rates, device CPU and memory, BGP session state if applicable, and power supply status. Add more metrics over time as you understand your environment better.

The goal is not to collect everything. It is to make sure you find out about real problems before your users do.
`,
  },
  {
    slug: "redundant-power-supplies",
    title: "Redundant Power Supplies: How and Why They Work",
    date: "2026-02-26",
    tags: ["hardware", "servers", "homelab"],
    excerpt: "Redundant PSUs are a fundamental part of enterprise server design. Here is how they actually work and when they matter.",
    coverImage: "/images/blog/redundant-power-supplies.jpg",
    coverCredit: {
      author: "Thesydneyknowitall at English Wikipedia",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:DL380sREAR.jpg",
    },
    content: `
## The Problem They Solve

A server with a single power supply has a single point of failure. If that PSU fails, the server goes down. In a production environment, unplanned downtime is expensive. Redundant power supplies eliminate the PSU as a single point of failure.

## How Redundancy Works

Enterprise servers typically support 1+1 or 2+1 redundancy. In a 1+1 configuration, two PSUs share the load equally. If one fails, the other takes the full load without interruption. The server keeps running. You get an alert, you replace the failed unit during business hours, and there is no outage.

The PSUs connect to the server's power distribution board, which handles the load sharing and failover automatically. Modern enterprise PSUs support hot-swap, meaning you can remove the failed unit and install a replacement while the server is running.

## Connecting to Separate Circuits

Redundant PSUs only provide real protection if they connect to independent power sources. In a data center, each PSU connects to a separate PDU on a separate circuit, ideally fed from separate UPS units and ultimately separate utility feeds.

In a homelab, you can approximate this by running each PSU to a different outlet on a different circuit, ideally on different breakers. It is not full enterprise-grade redundancy, but it protects against a tripped breaker or a failed power strip.

## Checking PSU Health

Dell iDRAC provides real-time PSU status, including input voltage, output power, and health state. You can see whether each PSU is active and contributing to the load, which is essential for confirming that redundancy is actually working.

\`\`\`bash
# Via racadm
racadm getsensorinfo | grep -i power
\`\`\`

## In Practice

I run all my lab servers with redundant PSUs and connect them to separate circuits. I have tested failover by unplugging one PSU while the server was running, and in every case the server continued without any interruption. The investment in a second PSU is minimal compared to the cost of an unexpected shutdown.
`,
  },
  {
    slug: "spanning-tree-protocol-deep-dive",
    title: "Spanning Tree Protocol: What It Does and Why It Breaks Things",
    date: "2026-02-27",
    tags: ["networking", "switching", "homelab"],
    excerpt: "STP prevents broadcast storms but introduces its own complexity. Understanding it deeply is essential for anyone working with switched networks.",
    coverImage: "/images/blog/spanning-tree-protocol-deep-dive.jpg",
    coverCredit: {
      author: "X-Javier",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_Catalyst_4506-E_Switch_004.jpg",
    },
    content: `
## The Problem STP Solves

Ethernet switches forward frames by MAC address. If you have two switches connected by two cables (creating a physical loop), a broadcast frame will loop forever, duplicating with each pass until the network is completely saturated. This is a broadcast storm, and it will take down your entire network in seconds.

STP (Spanning Tree Protocol) prevents this by detecting loops and blocking redundant paths at the logical level. Only one active path exists between any two network nodes, but the blocked paths are available as backups if the active path fails.

## How It Works

STP elects a root bridge based on bridge priority and MAC address. Every other switch calculates the lowest-cost path to the root bridge and designates one port as the root port. Redundant ports that would create loops are put in a blocking state.

When topology changes, STP reconverges. This can take 30 to 50 seconds with classic STP (802.1D), which is why RSTP (Rapid STP, 802.1w) was developed. RSTP reconverges in seconds using negotiation between switches rather than timers.

## Common STP Problems

**Suboptimal root bridge election:** If you do not manually configure bridge priorities, the switch with the lowest MAC address becomes root. This might not be the most centrally connected or highest-capacity switch. Always set bridge priority explicitly.

\`\`\`
spanning-tree vlan 1 priority 4096
\`\`\`

**TCN (Topology Change Notifications) flooding:** Every time a port changes state, STP flushes MAC tables. In a large network with frequently changing ports (like access ports with PCs), this can cause excessive flooding. PortFast and BPDU Guard on access ports solve this.

**Inferior paths surviving:** With complex topologies, STP may choose a slower path as the root port if costs are not tuned properly.

## Best Practices

Enable Rapid PVST+ (or MSTP in larger environments). Set explicit bridge priorities so your core switches are root. Enable PortFast on all access ports and BPDU Guard to protect against unauthorized switches. Document your STP topology so you understand which paths are active and which are blocking.
`,
  },
  {
    slug: "ssh-hardening-linux-servers",
    title: "SSH Hardening: Locking Down Remote Access",
    date: "2026-02-28",
    tags: ["linux", "security", "servers"],
    excerpt: "Default SSH configuration is functional but not secure. Here is how to harden it against the most common attack vectors.",
    coverImage: "/images/blog/ssh-hardening-linux-servers.jpg",
    coverCredit: {
      author: "Hpott",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:OpenBSD_starting_SSH_server.jpg",
    },
    content: `
## Why Default SSH Is Not Enough

A server with SSH exposed on port 22 will see hundreds or thousands of brute-force login attempts per day. Most of them come from automated bots scanning the internet. Default SSH configuration allows password authentication, which means a weak password is all that separates your server from unauthorized access.

## Key-Based Authentication

The most important change is disabling password authentication and requiring key pairs. Generate a key pair on your workstation and copy the public key to the server:

\`\`\`bash
ssh-keygen -t ed25519 -C "admin@myserver"
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server
\`\`\`

Then in \`/etc/ssh/sshd_config\`:

\`\`\`
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
\`\`\`

## Other Critical Settings

\`\`\`
# Disable root login entirely
PermitRootLogin no

# Limit login attempts per connection
MaxAuthTries 3

# Use only modern algorithms
KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512
Ciphers aes256-gcm@openssh.com,chacha20-poly1305@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com

# Idle timeout
ClientAliveInterval 300
ClientAliveCountMax 2

# Limit which users can log in
AllowUsers admin deployer

# Disable X11 forwarding unless needed
X11Forwarding no
\`\`\`

## Port Change and Fail2Ban

Changing SSH to a non-standard port (e.g., 2222) reduces automated scanning noise significantly. It is security by obscurity and not a substitute for real controls, but it is a low-cost way to reduce log clutter.

Fail2ban monitors failed login attempts and automatically blocks IPs after a configurable number of failures:

\`\`\`bash
apt install fail2ban
systemctl enable fail2ban
\`\`\`

With key-based auth, a changed port, and fail2ban in place, your SSH attack surface is dramatically reduced.
`,
  },
  {
    slug: "ipv6-in-the-real-world",
    title: "IPv6 in the Real World: What Actually Changes",
    date: "2026-03-01",
    tags: ["networking", "ipv6"],
    excerpt: "IPv6 has been 'the future' for decades. Here is how it actually works in practice and what you need to know when you encounter it.",
    coverImage: "/images/blog/ipv6-in-the-real-world.jpg",
    coverCredit: {
      author: "Mikm (Wikimedia Commons uploader; file page records no separate author)",
      license: "CC BY-SA 3.0",
      licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:IPv6_header_rv1.png",
    },
    content: `
## Why IPv6 Exists

IPv4 has approximately 4.3 billion addresses. The internet has more than 4.3 billion devices connected to it. The math does not work without NAT, and NAT creates its own complexity and problems. IPv6 solves this with a 128-bit address space that provides enough addresses for every device that will ever exist, many times over.

## The Address Space

An IPv6 address looks like this: \`2001:db8:85a3::8a2e:370:7334\`. It is 128 bits expressed in eight groups of four hexadecimal digits, separated by colons. Consecutive groups of zeros can be abbreviated with \`::\`.

A typical IPv6 prefix for a network segment is /64, which gives you 18 quintillion possible addresses on that segment. The idea of running out of addresses on a single subnet is gone.

## What Changes for Network Configuration

**No more NAT (mostly):** With enough addresses for every device to have a globally routable address, NAT is no longer necessary. Devices can communicate end-to-end directly.

**Stateless Address Autoconfiguration (SLAAC):** Devices can self-configure IPv6 addresses based on the network prefix advertised by routers. DHCP is still used in many enterprise environments, but SLAAC simplifies device configuration.

**Link-local addresses:** Every IPv6 interface automatically gets a link-local address (\`fe80::/10\`) that is used for on-link communication without needing global routing.

**Neighbor Discovery Protocol (NDP):** NDP replaces ARP for address resolution on local segments.

## What Stays the Same

Routing, firewall rules, VLANs, and most other networking concepts work the same way. You apply them to IPv6 addresses instead of IPv4 addresses. Your firewall still needs rules. Your switches still handle frames the same way. The mental model transfers directly.

## Getting Started

Most enterprise environments now operate dual-stack, running both IPv4 and IPv6 simultaneously. Start by enabling IPv6 on your homelab router, get a prefix delegation from your ISP if available, and experiment with connectivity. The best way to learn IPv6 is to use it.
`,
  },
  {
    slug: "cisco-ios-fundamentals",
    title: "Cisco IOS Fundamentals Every Network Engineer Should Know",
    date: "2026-03-02",
    tags: ["cisco", "networking", "routing"],
    excerpt: "IOS is the language of enterprise networking. These are the foundational commands and concepts that every network engineer needs in their toolkit.",
    coverImage: "/images/blog/cisco-ios-fundamentals.jpg",
    coverCredit: {
      author: "Robert",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_2800_series_router_(1).jpg",
    },
    content: `
## Navigating IOS Modes

Cisco IOS has several privilege levels and configuration modes:

\`\`\`
Router>           # User EXEC mode (read-only)
Router# enable    # Privileged EXEC mode (full show commands)
Router# conf t    # Global configuration mode
Router(config)#   # Now in global config

Router(config)# interface GigabitEthernet0/0
Router(config-if)#   # Interface config submode
\`\`\`

\`\`\`end\`\` or \`Ctrl+Z\`\` returns to privileged EXEC from any config mode.

## Essential Show Commands

\`\`\`
show version           # IOS version, uptime, hardware
show running-config    # Current active configuration
show interfaces        # Interface status, statistics, errors
show ip interface brief # Quick summary of all interfaces
show ip route          # Routing table
show cdp neighbors     # Connected Cisco devices
show vlan brief        # VLAN database (on switches)
show spanning-tree     # STP state
show log               # System log
\`\`\`

## Basic Interface Configuration

\`\`\`
interface GigabitEthernet0/0
  description UPLINK_TO_CORE
  ip address 10.0.0.1 255.255.255.0
  no shutdown
\`\`\`

## VLAN Configuration on Switches

\`\`\`
vlan 100
  name SERVERS

interface GigabitEthernet1/0/1
  switchport mode access
  switchport access vlan 100

interface GigabitEthernet1/0/24
  switchport mode trunk
  switchport trunk allowed vlan 100,200,300
\`\`\`

## Saving Configuration

\`\`\`
copy running-config startup-config
\`\`\`

Or the shortcut: \`write\`. Always save after making changes. The running config is what is active; the startup config is what loads on boot. They are separate files.

## The IOS Help System

Type \`?\` at any point to see available commands. This works in all modes. \`show ip ?\` shows all sub-commands of \`show ip\`. Learning to use the help system is as important as memorizing specific commands.
`,
  },
  {
    slug: "storage-area-networks-explained",
    title: "Storage Area Networks Explained",
    date: "2026-03-03",
    tags: ["storage", "networking", "servers"],
    excerpt: "SANs power the storage backends of most enterprise datacenters. Here is how they work and why they are architected the way they are.",
    coverImage: "/images/blog/storage-area-networks-explained.jpg",
    coverCredit: {
      author: "Redline",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:HP_EVA4400-1.jpg",
    },
    content: `
## What a SAN Is

A Storage Area Network is a dedicated high-speed network that connects servers to storage arrays. Unlike a NAS (Network Attached Storage) that presents files over a network, a SAN presents raw block devices. The server sees the storage as if it were a locally attached disk.

This distinction matters. Block-level access is faster and more flexible than file-level access for most database and virtualization workloads.

## Fibre Channel vs iSCSI

Traditional SANs use Fibre Channel (FC), a dedicated network technology optimized for storage. FC requires specialized switches (FC switches or directors) and HBAs (Host Bus Adapters) in the servers. It is expensive but extremely reliable and performant.

iSCSI runs the SCSI storage protocol over standard Ethernet. It is less expensive because it reuses existing network infrastructure, and performance has improved dramatically as 10GbE and 25GbE become standard. Many organizations have moved from FC to iSCSI for new deployments.

## How Targets and Initiators Work

In iSCSI terminology:
- **Target:** The storage device (SAN array)
- **Initiator:** The server connecting to the storage

The initiator connects to targets using iSCSI Qualified Names (IQNs). Once connected and authenticated, the OS sees the target LUNs as local disks.

\`\`\`bash
# Discover iSCSI targets
iscsiadm -m discovery -t sendtargets -p 192.168.10.50

# Connect to a target
iscsiadm -m node -T iqn.2024-01.com.storage:array1 -p 192.168.10.50 --login
\`\`\`

## Multipathing

Enterprise storage connects servers via multiple independent paths to eliminate single points of failure. The OS uses multipath software (MPIO on Windows, multipathd on Linux) to manage these paths transparently. If one path fails, I/O continues over the surviving paths.

## When SANs Make Sense

SANs make sense when you need shared storage for clustered workloads, high-performance block storage, or centralized storage management at scale. For simpler environments, NFS or direct-attached NVMe may be more appropriate.
`,
  },
  {
    slug: "proxmox-clustering-high-availability",
    title: "Proxmox Clustering and High Availability Setup",
    date: "2026-03-04",
    tags: ["proxmox", "virtualization", "homelab"],
    excerpt: "Proxmox clustering lets multiple hosts share workloads and survive individual node failures. Here is how to set it up and what to watch out for.",
    coverImage: "/images/blog/proxmox-clustering-high-availability.jpg",
    coverCredit: {
      author: "Patrick Finnegan",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:HP_s6500_chassis_with_ProLiant_SL250s_servers_and_storage.jpg",
    },
    content: `
## Why Cluster

A single Proxmox node is useful, but a cluster is where the platform gets interesting. With a cluster, you can live-migrate VMs between nodes, balance workloads, and configure automatic failover so that if a node fails, its VMs restart on surviving nodes.

## Network Requirements

Before clustering, you need a plan for your networks:

- **Cluster communication network:** Used for Proxmox corosync traffic (cluster heartbeats and state sync). This should be a dedicated, low-latency link. 10GbE is ideal.
- **VM traffic network:** Regular network for VMs.
- **Storage network:** If you are using shared storage (Ceph or iSCSI), it needs its own network.

Mixing cluster traffic with VM traffic works but is not recommended for production.

## Creating a Cluster

On the first node:
\`\`\`bash
pvecm create my-cluster
\`\`\`

On subsequent nodes:
\`\`\`bash
pvecm add 192.168.1.10  # IP of the first node
\`\`\`

Verify cluster status:
\`\`\`bash
pvecm status
\`\`\`

## Quorum and Fencing

Proxmox uses quorum to decide which nodes are authoritative. In a two-node cluster, you need a quorum device (a third vote, even a small VM or a NAS) to avoid split-brain scenarios. Three-node clusters have natural quorum.

Fencing ensures that a failed node is truly offline before its VMs are restarted elsewhere. Without proper fencing, two instances of the same VM could run simultaneously, causing data corruption. Configure IPMI/iDRAC-based fencing so the cluster can power-cycle failed nodes.

## High Availability Groups

Configure HA groups to control which nodes can host specific VMs:

\`\`\`bash
ha-manager add vm:100
ha-manager set vm:100 --state started --group ha-group1
\`\`\`

## Shared Storage

HA VM migration requires shared storage so both source and destination nodes can access the VM disk. Ceph, NFS, and iSCSI are all supported. Ceph is native to Proxmox and integrates cleanly, though it has its own complexity and resource requirements.
`,
  },
  {
    slug: "fortigate-sdwan-configuration",
    title: "FortiGate SD-WAN: Intelligent WAN Link Selection",
    date: "2026-03-05",
    tags: ["fortinet", "networking", "firewall"],
    excerpt: "SD-WAN on FortiGate allows you to use multiple WAN links intelligently, routing traffic based on performance metrics rather than static routing tables.",
    coverImage: "/images/blog/fortigate-sdwan-configuration.jpg",
    coverCredit: {
      author: "Premeditated",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Fortinet_FortiGate_6501F.png",
    },
    content: `
## What SD-WAN Solves

Traditional WAN routing uses static routes or simple metrics to decide how traffic exits the network. A primary link fails, and you wait for the failover route to take over. Performance degrades silently. You have no visibility into what is actually happening across your WAN links.

SD-WAN adds active performance measurement and policy-based routing. The FortiGate constantly measures latency, jitter, and packet loss on each WAN link and makes routing decisions based on actual conditions.

## Basic SD-WAN Setup

First, create an SD-WAN zone and add your WAN interfaces:

\`\`\`
config system sdwan
  set status enable
  config zone
    edit "virtual-wan-link"
      set members wan1 wan2
    next
  end
  config members
    edit 1
      set interface wan1
      set gateway 203.0.113.1
    next
    edit 2
      set interface wan2
      set gateway 198.51.100.1
    next
  end
end
\`\`\`

## Performance SLAs

Define what acceptable performance looks like for each type of traffic:

\`\`\`
config system sdwan
  config health-check
    edit "Google_DNS"
      set server "8.8.8.8"
      set protocol ping
      set interval 500
      set failtime 3
      set recoverytime 5
      set latency-threshold 150
      set jitter-threshold 30
      set packetloss-threshold 1
    next
  end
end
\`\`\`

## Rules

SD-WAN rules define which traffic uses which links based on the performance SLAs:

\`\`\`
config system sdwan
  config service
    edit 1
      set name "Business_Apps"
      set dst "critical-servers"
      set priority-members 1 2
      set sla "Google_DNS" 1 2
    next
  end
end
\`\`\`

## The Result

Traffic automatically routes over the best-performing link. When a link degrades below your SLA thresholds, traffic shifts to the healthier link without manual intervention. You get visibility into link performance through the FortiGate dashboard and can build detailed reports on WAN utilization over time.
`,
  },
  {
    slug: "network-security-zones-dmz",
    title: "Network Security Zones and DMZ Design",
    date: "2026-03-06",
    tags: ["security", "networking", "firewall"],
    excerpt: "A well-designed zone architecture is the foundation of network security. Here is how to think about segmenting your network into security zones.",
    coverImage: "/images/blog/network-security-zones-dmz.jpg",
    coverCredit: {
      author: "Dgondim",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Traditional_Single_Layer_DMZ_with_two_flanking_firewalls.png",
    },
    content: `
## The Zone Model

A security zone is a group of systems with similar trust levels and security requirements. Traffic between zones is controlled by firewall policies. Traffic within a zone may or may not be inspected, depending on your requirements.

The classic zone model has three zones:
- **Inside (LAN):** Trusted internal network
- **Outside (WAN/Internet):** Untrusted external network
- **DMZ:** Semi-trusted zone for systems that must be accessible from outside

## Why Zones Matter

Without zones, a compromised internal host can reach any other internal system directly. Zones limit blast radius. If a web server in the DMZ is compromised, the attacker is stuck in the DMZ. They cannot reach your database servers on the internal network because the firewall blocks DMZ-to-LAN traffic.

## Designing a DMZ

The DMZ sits between the inside and outside zones. Systems in the DMZ need to be reachable from the internet (like web servers or email servers) but should not have access to internal systems.

Key firewall rules:
- **Outside to DMZ:** Allow specific inbound traffic (HTTP/443 to web servers, 25 to mail servers)
- **DMZ to Inside:** Deny by default. Allow specific exceptions only (like a web server querying a database on a dedicated database VLAN)
- **Inside to DMZ:** Allow for administration, deny for general browsing
- **Inside to Outside:** Allow with inspection

## Beyond the Basic DMZ

More mature environments add additional zones:
- **Server VLAN:** Isolated from user workstations but trusted more than the DMZ
- **Management VLAN:** For out-of-band device management (iDRAC, switch management)
- **Guest WiFi:** Fully isolated from everything internal
- **IoT:** Isolated from trusted systems

Each additional zone adds security but also adds management complexity. Start with the basics and add complexity only when you have a clear reason for it.
`,
  },
  {
    slug: "power-over-ethernet-poe",
    title: "Power over Ethernet: How PoE Works in Enterprise Networks",
    date: "2026-03-07",
    tags: ["networking", "hardware", "switching"],
    excerpt: "PoE eliminates the need for separate power supplies for IP phones, cameras, and wireless APs. Here is how the standard works and how to plan for it.",
    coverImage: "/images/blog/power-over-ethernet-poe.jpg",
    coverCredit: {
      author: "Phiarc",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:PowerDsine_3524G_24-Port_Gigabit_Ethernet_PoE_Midspan_Injector_with_top_cover_removed,_oblique_view.jpg",
    },
    content: `
## What PoE Does

Power over Ethernet delivers electrical power over standard Ethernet cabling, allowing devices like IP phones, wireless access points, and security cameras to operate without a separate power supply. A PoE switch powers the device through the same cable that carries data.

## The Standards

**PoE (IEEE 802.3af):** Original standard, up to 15.4W per port. Sufficient for basic IP phones and low-power APs.

**PoE+ (IEEE 802.3at):** Up to 30W per port. Handles most access points and PTZ cameras.

**PoE++ (IEEE 802.3bt):** Up to 60W (Type 3) or 100W (Type 4) per port. Powers high-performance APs, thin clients, and even small displays.

## Planning PoE Budgets

Every PoE switch has a total power budget shared across all ports. A 24-port switch might have a 370W budget. If you connect 24 PoE+ devices drawing 25W each, that is 600W, which exceeds the budget. Some ports will not receive full power.

Calculate your power requirements before deploying. Group high-power devices carefully and check the switch's documentation for per-port power limits and total budget.

## How It Works

The switch (PSE - Power Sourcing Equipment) applies a small voltage to the cable and checks for a signature resistor in the connected device (PD - Powered Device). If the signature matches an IEEE 802.3 profile, power is enabled. This prevents accidents with non-PoE equipment.

## Practical Considerations

- Check that the cable quality supports PoE, particularly for longer runs
- Use cable testers that can verify PoE voltage and current
- Consider inline PoE injectors for individual devices in environments without PoE switches
- Monitor per-port power consumption in the switch management interface for troubleshooting

PoE simplifies physical deployments significantly. The ability to mount an AP or camera anywhere you can run a cable, without running power separately, is a real advantage.
`,
  },
  {
    slug: "server-memory-architecture",
    title: "Server Memory Architecture: DIMM Slots, Channels, and ECC",
    date: "2026-03-08",
    tags: ["hardware", "servers", "memory"],
    excerpt: "Server memory is more complex than desktop memory. Understanding channels, DIMM placement, and ECC is essential for getting the performance and reliability you expect.",
    coverImage: "/images/blog/server-memory-architecture.jpg",
    coverCredit: {
      author: "Project Kei",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Four_SDRAM_DIMM_slots_on_a_computer_motherboard.jpg",
    },
    content: `
## Memory Channels

Modern server CPUs support multiple memory channels. Intel Xeon Scalable processors support six or eight channels per CPU. Running memory in more channels increases memory bandwidth significantly, which matters for memory-intensive workloads like virtualization and databases.

To use all available channels, you need to populate DIMMs in the correct slots. The motherboard manual (or Dell's memory compatibility matrix for PowerEdge servers) specifies exactly which slots to fill first and in what combinations to maximize channel utilization.

## DIMM Placement Rules

The rule of thumb: populate symmetrically. If you have a dual-socket server, put the same amount of memory in each socket. If a socket has eight memory channels, fill one DIMM per channel before adding a second DIMM to any channel.

For a Dell PowerEdge R740 with two CPUs and 24 DIMM slots, filling 12 DIMMs (6 per CPU) in the correct slots gives you full channel utilization. Adding more DIMMs fills the remaining slots.

## ECC Memory

ECC (Error-Correcting Code) memory detects and corrects single-bit memory errors automatically. It also detects (but cannot correct) multi-bit errors. For servers running production workloads, ECC is not optional. Silent memory corruption can corrupt data and cause crashes that are extremely difficult to diagnose.

All enterprise server platforms require ECC registered (RDIMM) or load-reduced (LRDIMM) memory. Consumer platforms typically do not support ECC at all.

## LRDIMM vs RDIMM

Registered DIMMs (RDIMMs) use a register to buffer signals between the memory controller and the DRAM chips. Load-Reduced DIMMs (LRDIMMs) buffer data signals as well, reducing electrical load and allowing higher memory capacities per server.

LRDIMMs support larger capacity configurations but add a small amount of latency. For most virtualization workloads, this is an acceptable trade-off when you need maximum memory capacity.

## Speed Considerations

Memory speed is limited by the slowest DIMM installed and by the number of DIMMs per channel. Adding a second DIMM to a channel often drops the maximum speed. Always check the specific speed rating for your configuration in the server's documentation.
`,
  },
  {
    slug: "soc-home-lab-build",
    title: "Building a SOC Home Lab for Cybersecurity Practice",
    date: "2026-03-09",
    tags: ["cybersecurity", "homelab", "security"],
    excerpt: "A SOC home lab gives you a realistic environment to practice threat detection, log analysis, and incident response without touching production systems.",
    coverImage: "/images/blog/soc-home-lab-build.jpg",
    coverCredit: {
      author: "Unknown photographer",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:NSOC-2012.jpg",
    },
    content: `
## Why a SOC Lab

Security operations work requires practice in a realistic environment. Reading about SIEM correlation rules or log analysis is useful, but actually running the tools and analyzing real (or simulated) attacks is how the skills develop. A home SOC lab gives you that environment.

## Core Components

**SIEM (Wazuh or ELK Stack):** The SIEM collects and correlates logs from across the environment. Wazuh is open source, well-documented, and integrates directly with the ELK stack for visualization.

**Log sources:** Your SIEM is only as good as what it ingests. Configure log forwarding from firewalls, switches, servers, and endpoints. Each source adds visibility.

**Threat simulation:** You need something to detect. Use tools like Atomic Red Team to simulate adversary techniques mapped to MITRE ATT&CK, generating realistic telemetry for your detection rules to catch.

**Packet capture:** A dedicated packet capture setup (like SecurityOnion or a simple tcpdump-based collector) gives you full packet data for investigation.

## Building the Environment

Start small. Set up Wazuh on a dedicated VM. Forward logs from a couple of Linux servers using the Wazuh agent. Configure your FortiGate or pfSense to send syslog to Wazuh.

Once you have basic log collection working, run some Atomic Red Team tests and see what alerts generate. Review the logs manually to understand what the attack looks like in telemetry, then write detection rules to catch it automatically next time.

## Detection Engineering

Detection engineering is the process of writing, testing, and maintaining detection rules. Start with known-bad: impossible login times, logins from multiple geographic locations, command injection patterns in web server logs. As your understanding grows, develop more sophisticated behavioral rules.

Document every detection you build: what it detects, how it works, and what the expected false positive rate is. This discipline makes you a better analyst and better engineer.
`,
  },
  {
    slug: "iscsi-storage-protocol",
    title: "iSCSI Storage: How to Configure and Use It",
    date: "2026-03-10",
    tags: ["storage", "networking", "servers"],
    excerpt: "iSCSI delivers block storage over standard Ethernet, making enterprise-grade shared storage accessible without specialized hardware.",
    coverImage: "/images/blog/iscsi-storage-protocol.jpg",
    coverCredit: {
      author: "KorP",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:NetApp_E5700.jpg",
    },
    content: `
## iSCSI Basics

iSCSI encapsulates SCSI commands in TCP/IP packets, allowing servers to access block storage devices over a standard network. From the operating system's perspective, an iSCSI volume looks and behaves like a locally attached disk. You can format it with any filesystem, use it for VMs, or run a database directly on it.

## Setting Up a Target (TrueNAS)

TrueNAS is a popular option for an iSCSI target in a homelab:

1. Create a storage pool and a block zvol
2. Enable the iSCSI service
3. Create a portal (IP/port combination to listen on)
4. Create an initiator group (which IQNs or IP ranges can connect)
5. Create a target and associate it with the portal
6. Create an extent linked to your zvol
7. Associate the extent with the target

## Connecting from Linux

\`\`\`bash
# Install the initiator
apt install open-iscsi

# Discover targets on the storage server
iscsiadm -m discovery -t st -p 192.168.10.50:3260

# Log into a target
iscsiadm -m node -T iqn.2024-01.com.truenas:data -p 192.168.10.50:3260 --login

# The disk should now appear
lsblk
\`\`\`

## Performance Considerations

iSCSI performance depends heavily on network quality. Use a dedicated storage network, enable jumbo frames (MTU 9000) consistently across the path, and consider multipath for both performance and redundancy.

\`\`\`bash
# Install multipath tools
apt install multipath-tools
systemctl enable multipathd
\`\`\`

## CHAP Authentication

CHAP (Challenge Handshake Authentication Protocol) adds authentication to iSCSI connections. Configure CHAP credentials on both the target and the initiator. Always use CHAP in any shared environment.

## Practical Uses in a Lab

I use iSCSI to provide shared storage for my Proxmox cluster. All nodes can access the same iSCSI volumes from TrueNAS, which enables live VM migration and HA failover. The setup takes about an hour to configure properly, and once it is running it is very reliable.
`,
  },
  {
    slug: "dns-security-dnssec",
    title: "DNS Security: DNSSEC, DoH, and Protecting Name Resolution",
    date: "2026-03-11",
    tags: ["security", "networking", "dns"],
    excerpt: "DNS is foundational to every network connection, which makes it a prime target for attacks. Here is how DNSSEC and encrypted DNS protect the resolution process.",
    coverImage: "/images/blog/dns-security-dnssec.jpg",
    coverCredit: {
      author: "Jan Bellon",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:DNSSEC_Trust_Anchor_Diagram.png",
    },
    content: `
## Why DNS Security Matters

DNS translates domain names to IP addresses. If an attacker can manipulate DNS responses, they can redirect traffic to malicious servers, intercept credentials, or block legitimate services entirely. DNS cache poisoning, DNS hijacking, and DNS-based data exfiltration are all real attack categories.

## DNSSEC

DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records. When a resolver queries a DNSSEC-enabled zone, it verifies that the response is signed by the correct key. This prevents an attacker from injecting fake responses.

DNSSEC creates a chain of trust from the root zone down to individual domains. Each level signs the next level's keys. If you are querying \`example.com\`, the resolver verifies the \`com\` zone's signature on the \`example.com\` key, and the root zone's signature on \`com\`.

To verify DNSSEC is working:
\`\`\`bash
dig +dnssec example.com
# Look for the AD (Authenticated Data) flag in the response
\`\`\`

## DNS over HTTPS (DoH) and DNS over TLS (DoT)

Traditional DNS queries are sent in plaintext. Anyone on the network path can see what domains you are resolving. DoH and DoT encrypt DNS queries:

- **DoT (RFC 7858):** DNS over TLS on port 853. Easy to block if an organization needs to inspect or filter DNS.
- **DoH (RFC 8484):** DNS over HTTPS on port 443. Looks like regular web traffic, harder to block.

Both improve privacy by preventing passive observation of DNS queries. In enterprise environments, DoT is often preferred because it is easier to manage at the network level.

## DNS Filtering

DNS-layer filtering blocks connections to known-malicious domains before a TCP connection is even attempted. Tools like Pi-hole block ad and tracking domains. Enterprise platforms like Cisco Umbrella provide threat intelligence and policy-based filtering.

Implementing DNS filtering is one of the highest-value, lowest-cost security controls you can deploy. Block domains associated with malware command-and-control, phishing, and known-bad infrastructure at the DNS layer and you stop a significant portion of threats before they get started.
`,
  },
  {
    slug: "high-availability-clustering",
    title: "High Availability Clustering with Pacemaker and Corosync",
    date: "2026-03-12",
    tags: ["linux", "servers", "high-availability"],
    excerpt: "Pacemaker and Corosync provide Linux HA clustering that can automatically restart services and VMs after node failures.",
    coverImage: "/images/blog/high-availability-clustering.jpg",
    coverCredit: {
      author: "Leon Brooks",
      license: "Public domain",
      licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Linux_supercomputing_cluster.jpg",
    },
    content: `
## What High Availability Clustering Does

A high availability cluster monitors services and nodes. When a service crashes or a node fails, the cluster automatically restarts the service or moves it to another node. The goal is minimizing downtime without manual intervention.

## The Stack

- **Corosync:** Handles cluster communication, membership, and quorum. Nodes use Corosync to know who is alive in the cluster.
- **Pacemaker:** The cluster resource manager. It decides what to do when failures are detected. Start this service on that node, move this IP address to another node.

## Installation (RHEL/Rocky Linux)

\`\`\`bash
dnf install pacemaker corosync pcs
systemctl enable pcsd
passwd hacluster  # Set the hacluster user password
\`\`\`

## Creating a Cluster

\`\`\`bash
# On all nodes, authenticate
pcs host auth node1 node2

# Create the cluster from node1
pcs cluster setup ha-cluster node1 node2
pcs cluster start --all
pcs cluster enable --all
\`\`\`

## Configuring Resources

\`\`\`bash
# Create a floating IP resource
pcs resource create virtual-ip IPaddr2 ip=192.168.1.100 \
  cidr_netmask=24 op monitor interval=30s

# Create a service resource
pcs resource create nginx systemd:nginx \
  op monitor interval=30s

# Create a resource group (starts in order, stops in reverse)
pcs resource group add web-group virtual-ip nginx
\`\`\`

## Fencing

Fencing (STONITH - Shoot The Other Node In The Head) ensures that a failed node is truly offline before resources are moved. Without fencing, two nodes might both believe they are authoritative, leading to data corruption. Configure IPMI-based fencing so the cluster can power-cycle a node it cannot reach.

\`\`\`bash
pcs stonith create ipmi-node1 fence_ipmilan \
  ipaddr=192.168.10.101 username=admin password=secret \
  pcmk_host_list=node1
\`\`\`
`,
  },
  {
    slug: "network-access-control-8021x",
    title: "Network Access Control with 802.1X",
    date: "2026-03-13",
    tags: ["networking", "security", "switching"],
    excerpt: "802.1X port authentication ensures that only authorized devices can connect to your network. Here is how to implement it with a RADIUS server.",
    coverImage: "/images/blog/network-access-control-8021x.jpg",
    coverCredit: {
      author: "VictorMasivi",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:IEEE_8021x_Network_Diagram_Example.png",
    },
    content: `
## The Problem 802.1X Solves

Without port authentication, anyone who can physically plug into a network jack can access the network. Visitors, contractors, attackers with physical access, or unauthorized personal devices all become part of the network the moment they connect a cable or join WiFi.

802.1X requires every device to authenticate before it receives network access. Until authenticated, the port only allows RADIUS traffic. After authentication, the port is placed in the appropriate VLAN for that device.

## The Three Components

**Supplicant:** The device trying to connect. Must have an 802.1X client (built into Windows, macOS, and Linux).

**Authenticator:** The network switch or wireless AP. It enforces the authentication requirement and relays credentials to the RADIUS server.

**Authentication Server (RADIUS):** Validates credentials and tells the switch what access to grant. FreeRADIUS is the standard open-source option.

## Basic FreeRADIUS Setup

\`\`\`bash
# Install
apt install freeradius

# Add clients (the switches that will query RADIUS)
# In /etc/freeradius/3.0/clients.conf:
client switch1 {
  ipaddr = 192.168.1.10
  secret = radius-secret-here
}

# Add users (or integrate with Active Directory)
# In /etc/freeradius/3.0/users:
jsmith  Cleartext-Password := "password123"
\`\`\`

## Cisco Switch Configuration

\`\`\`
aaa new-model
aaa authentication dot1x default group radius
dot1x system-auth-control

radius server RADIUS-SRV
  address ipv4 192.168.1.50 auth-port 1812
  key radius-secret-here

interface GigabitEthernet1/0/1
  authentication port-control auto
  dot1x pae authenticator
\`\`\`

## Dynamic VLAN Assignment

The real power of 802.1X is RADIUS-based VLAN assignment. Employees get the corporate VLAN; contractors get the guest VLAN. This happens automatically based on credentials, without manual VLAN configuration per port.

Configure RADIUS to return VLAN attributes in the Access-Accept response, and the switch automatically places the port in the correct VLAN.
`,
  },
  {
    slug: "vxlan-network-virtualization",
    title: "VXLAN and Network Virtualization Explained",
    date: "2026-03-14",
    tags: ["networking", "virtualization", "datacenter"],
    excerpt: "VXLAN extends Layer 2 networks over Layer 3 infrastructure, enabling flexible network virtualization in modern datacenters and cloud environments.",
    coverImage: "/images/blog/vxlan-network-virtualization.jpg",
    coverCredit: {
      author: "Jupeterson",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Network_Virtualization_Platform_Architecture_Example.png",
    },
    content: `
## The Problem with VLANs at Scale

Traditional VLANs are limited to 4096 IDs. In a cloud or large multi-tenant datacenter environment, you need isolation for thousands or millions of tenants. You also need to stretch Layer 2 networks across physical boundaries, which traditional VLANs cannot do without complex MPLS configurations.

## What VXLAN Does

VXLAN (Virtual Extensible LAN) encapsulates Layer 2 Ethernet frames inside UDP packets. This allows you to carry a virtual Layer 2 network over a standard Layer 3 (IP) infrastructure. The VXLAN Network Identifier (VNI) supports 16 million unique segments, which eliminates the VLAN scalability problem.

A VXLAN Tunnel Endpoint (VTEP) handles encapsulation and decapsulation. When a VM sends a frame, the VTEP wraps it in a VXLAN UDP packet and sends it to the destination VTEP, which unwraps it and delivers it to the destination VM.

## How VTEPs Work

VTEPs can be physical switches (hardware VTEPs) or software-based (like Open vSwitch). Each hypervisor running VXLAN acts as a VTEP.

\`\`\`bash
# Create a VXLAN interface on Linux
ip link add vxlan100 type vxlan id 100 dstport 4789 remote 192.168.1.2 local 192.168.1.1 dev eth0
ip link set vxlan100 up
ip addr add 10.100.0.1/24 dev vxlan100
\`\`\`

## BGP EVPN Control Plane

Early VXLAN implementations used multicast or flood-and-learn for MAC address discovery, which does not scale well. BGP EVPN (Ethernet VPN) provides a control plane for VXLAN, distributing MAC and IP address information via BGP rather than flooding.

BGP EVPN is the standard in modern datacenter fabrics (Cisco ACI, Arista, Juniper). It enables scalable, efficient VXLAN deployments with millisecond failover.

## Where You See VXLAN

AWS VPCs, Azure virtual networks, and most cloud networking platforms are built on VXLAN or similar overlay technologies. Kubernetes networking (Flannel, Calico, Cilium) frequently uses VXLAN for pod-to-pod communication. Understanding VXLAN is increasingly essential for anyone working in modern infrastructure.
`,
  },
  {
    slug: "troubleshooting-packet-captures",
    title: "Troubleshooting Network Issues with Packet Captures",
    date: "2026-03-15",
    tags: ["networking", "troubleshooting", "wireshark"],
    excerpt: "Packet captures are the most powerful diagnostic tool in networking. Here is a systematic approach to using them effectively for real troubleshooting.",
    coverImage: "/images/blog/troubleshooting-packet-captures.jpg",
    coverCredit: {
      author: "Laurachappell",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wireshark_Network_Analyzer_Screen.png",
    },
    content: `
## When to Reach for Packet Captures

Use packet captures when layer 2-4 problems are not obvious from interface statistics and logs. Common scenarios: unexplained TCP retransmissions, connection resets, intermittent connectivity, suspected firewall misconfigurations, and application performance issues where the application team blames the network.

## Capturing in the Right Place

The most common mistake is capturing in the wrong place. To diagnose a problem, you need captures on both sides of the suspected failure point:

- Client-side capture shows what the client sent and received
- Server-side capture shows what the server sent and received
- A mismatch between them tells you where packets are being dropped or modified

For a firewall issue, capture on both the inside and outside interfaces simultaneously.

## Filtering Effectively

Capturing everything is usually too much data. Use display filters in Wireshark to focus on what matters:

\`\`\`
# Filter to a specific host
ip.addr == 192.168.1.100

# Show only TCP problems
tcp.analysis.flags && !tcp.analysis.ack

# Show DNS traffic
dns

# Show TLS handshakes
ssl.handshake

# Show HTTP requests
http.request
\`\`\`

## What to Look For

**TCP retransmissions:** The sender is not receiving acknowledgments. Usually indicates packet loss.

**TCP resets (RST):** An abrupt connection termination. Could be a firewall blocking mid-session, a crashed service, or a NAT timeout.

**ICMP unreachable messages:** The return path might be failing while the forward path works.

**Time deltas:** In the time column, large deltas before a packet indicate delay at the sending side. Large deltas before an ACK indicate delay at the receiving side.

**Window size zero:** The receiver's buffer is full. Application is not reading data fast enough.

## Capturing on Linux

\`\`\`bash
# Capture on eth0 to a file
tcpdump -i eth0 -w capture.pcap host 192.168.1.100

# Rotate files every 100MB, keep 10 files
tcpdump -i eth0 -w capture.pcap -C 100 -W 10
\`\`\`
`,
  },
  {
    slug: "runbooks-infrastructure-teams",
    title: "Writing Runbooks That Actually Get Used",
    date: "2026-03-16",
    tags: ["operations", "documentation", "servers"],
    excerpt: "A runbook that no one reads is just a box-checking exercise. Here is how to write documentation that engineers actually reach for during incidents.",
    coverImage: "/images/blog/runbooks-infrastructure-teams.jpg",
    coverCredit: {
      author: "Steve Jurvetson from Los Altos, USA",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Apollo_17_Lunar_Surface_Checklist_(4705455692).jpg",
    },
    content: `
## Why Runbooks Fail

Most runbooks fail for the same reasons. They are written once and never updated. They assume too much context. They describe what the system does rather than what the operator should do. They live in a wiki no one can find during an incident.

Good runbooks are written for an engineer who is stressed at 2 AM and needs to solve a specific problem without having to think about things they should not need to think about.

## The Structure That Works

**Title and purpose:** One sentence. "Restart the payment processing service when it becomes unresponsive." Not "Payment Service Runbook."

**When to use this:** What symptoms trigger this runbook? High latency on checkout? A specific alert firing? Be specific.

**Prerequisites:** What access does the engineer need? What tools? Is there a maintenance window required?

**Steps:** Numbered, specific, and actionable. Not "check the service health" but "run \`systemctl status payment-service\` and verify it shows Active: active (running)."

**Validation:** How does the engineer know it worked? What output or metric confirms success?

**Escalation:** If the runbook does not resolve the issue, who do you contact? What information do you gather before escalating?

## Example Step Format

\`\`\`
Step 3: Restart the service

ssh admin@payment-server-01.prod
sudo systemctl restart payment-service

Expected output:
[output of systemctl status payment-service]
Active: active (running) since ...

If the service fails to start, see Step 6 (Escalation).
\`\`\`

## Keeping Runbooks Current

A runbook is only useful if it matches reality. Assign ownership. When the system changes, the runbook changes. After every incident where a runbook was used, update it to reflect what actually worked. Run through runbooks in tabletop exercises before you need them in production.

Runbooks are living documentation. Treat them that way.
`,
  },
  {
    slug: "ospf-routing-protocol",
    title: "OSPF: The Interior Routing Protocol That Powers Enterprise Networks",
    date: "2026-03-17",
    tags: ["networking", "routing", "ospf"],
    excerpt: "OSPF is the most common interior gateway protocol in enterprise environments. Here is how it works and how to configure it correctly.",
    coverImage: "/images/blog/ospf-routing-protocol.jpg",
    coverCredit: {
      author: "EidenNor",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:OSPF-NSSA_figur.drawio.png",
    },
    content: `
## What OSPF Does

OSPF (Open Shortest Path First) is a link-state routing protocol. Every router running OSPF builds a complete map of the network topology (the Link State Database) and uses Dijkstra's algorithm to calculate the shortest path to every destination. This is different from distance-vector protocols like RIP, where routers only know what their neighbors tell them.

## Key Concepts

**Areas:** OSPF divides networks into areas to limit the scope of topology information. Area 0 is the backbone. All other areas must connect to Area 0. This design keeps routing databases from growing too large in big networks.

**DR and BDR:** On multi-access networks like Ethernet, OSPF elects a Designated Router (DR) and Backup DR (BDR). These routers reduce OSPF traffic by acting as a hub for LSA flooding. Routers form adjacencies with the DR/BDR rather than with every other router.

**Metric (Cost):** OSPF uses cost as its metric, calculated as a reference bandwidth divided by interface bandwidth. By default, the reference bandwidth is 100 Mbps, which means gigabit and faster interfaces all get cost 1. Always configure the reference bandwidth to match your fastest links.

## Basic Configuration (Cisco)

\`\`\`
router ospf 1
  router-id 1.1.1.1
  auto-cost reference-bandwidth 10000  ! Reference 10Gbps
  network 10.0.0.0 0.255.255.255 area 0
  passive-interface GigabitEthernet0/1  ! Don't send hellos on this interface
\`\`\`

## Tuning Hello and Dead Intervals

OSPF uses hello packets to detect neighbor failures. The default hello interval is 10 seconds, dead interval 40 seconds. In a lab or point-to-point environment, you can reduce these for faster convergence:

\`\`\`
interface GigabitEthernet0/0
  ip ospf hello-interval 5
  ip ospf dead-interval 15
\`\`\`

## OSPF Authentication

Always configure OSPF authentication in production to prevent unauthorized routers from injecting routes:

\`\`\`
interface GigabitEthernet0/0
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 secretpassword
\`\`\`
`,
  },
  {
    slug: "idrac-advanced-features",
    title: "Dell iDRAC Advanced Features You Should Be Using",
    date: "2026-03-18",
    tags: ["dell", "servers", "hardware"],
    excerpt: "Most people use iDRAC for basic console access and power control. Here are the features that make it genuinely powerful for server management.",
    coverImage: "/images/blog/idrac-advanced-features.jpg",
    coverCredit: {
      author: "Dell Inc.",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R710_servers.jpg",
    },
    content: `
## Beyond Basic Remote Access

iDRAC (Integrated Dell Remote Access Controller) ships with every current Dell PowerEdge server and provides a level of remote management that goes far beyond a simple console. If you are only using it for KVM and power control, you are missing most of what it can do.

## Lifecycle Controller

The Lifecycle Controller is a firmware-based management environment that runs independently of the OS. You can:

- Update firmware for all components (BIOS, iDRAC, PERC, NICs) without an OS
- Perform OS deployments via Dell OpenManage integration
- Configure RAID arrays before installing an OS
- Run hardware diagnostics

Access it by pressing F10 during POST or from the iDRAC web interface under Maintenance.

## SupportAssist and Proactive Monitoring

SupportAssist monitors hardware health and can automatically open support cases with Dell when hardware failures are detected. For a homelab this is not useful, but in a production environment it means you can get a replacement drive or PSU on the way before you even look at your monitoring dashboard.

## iDRAC REST API

iDRAC supports the Redfish API standard, which allows programmatic management:

\`\`\`bash
# Get system information
curl -k -u admin:password \
  https://idrac-ip/redfish/v1/Systems/System.Embedded.1

# Power on the server
curl -k -u admin:password -X POST \
  -H "Content-Type: application/json" \
  -d '{"ResetType":"On"}' \
  https://idrac-ip/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset
\`\`\`

This enables automation: deploy scripts that configure servers, update firmware, and verify health checks without human interaction.

## Group Manager

In environments with multiple Dell servers, iDRAC Group Manager provides a unified view of all servers from a single interface. Monitor health, deploy firmware updates, and export inventory data across your entire fleet from one pane.

## Alert Configuration

Configure iDRAC alerts to notify you immediately when hardware events occur. Options include email, SNMP traps, and syslog. Set up alerts for: drive failures, PSU failures, temperature warnings, memory errors, and POST errors. Do not wait to find out about hardware failures through a monitoring system with a five-minute polling interval.
`,
  },
  {
    slug: "syslog-centralized-logging",
    title: "Centralized Logging with Syslog: A Practical Guide",
    date: "2026-03-19",
    tags: ["operations", "monitoring", "servers"],
    excerpt: "Centralized logging gives you visibility across your infrastructure and is foundational to both operations and security. Here is how to set it up properly.",
    coverImage: "/images/blog/syslog-centralized-logging.jpg",
    coverCredit: {
      author: "Klapi",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Kibana_demo_screenshot.jpg",
    },
    content: `
## Why Centralize Logs

Logs on individual devices are hard to search across, get lost when devices fail, and can be tampered with by an attacker who compromises the device. Centralizing logs to a dedicated server solves all three problems.

A central log server lets you search across all your infrastructure from one place, retain logs longer than individual devices can store, and preserve logs even if a device is compromised or fails.

## Setting Up rsyslog as a Central Server

On the log server (Ubuntu):

\`\`\`bash
# /etc/rsyslog.conf - uncomment these lines to enable UDP and TCP reception
module(load="imudp")
input(type="imudp" port="514")

module(load="imtcp")
input(type="imtcp" port="514")

# Store logs per hostname
template(name="RemoteLogs" type="string" string="/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log")
*.* ?RemoteLogs
\`\`\`

## Configuring Clients

On each server you want to log centrally:

\`\`\`bash
# /etc/rsyslog.conf
*.* @@192.168.1.50:514  # TCP
# or
*.* @192.168.1.50:514   # UDP
\`\`\`

Network devices (switches, firewalls) send syslog natively. Configure the syslog server IP and severity level in the device's management interface.

## Loki and Grafana for Search

rsyslog handles collection and storage. Grafana Loki provides a log aggregation and query system that integrates natively with Grafana dashboards. The combination gives you:

- A unified interface for metrics and logs
- Full-text log search across all sources
- Log alerts that trigger when specific patterns appear
- Correlation between metrics spikes and log events

## Log Retention and Security

Define a log retention policy. Security logs often need to be kept for 90 days or longer for compliance. Protect the log server: logs are forensic evidence, and they must be trustworthy. Use a dedicated network path for syslog traffic, restrict write access to log files, and consider sending logs offsite or to an immutable storage destination for high-security environments.
`,
  },
  {
    slug: "container-networking-fundamentals",
    title: "Container Networking Fundamentals: How Pods and Containers Communicate",
    date: "2026-03-20",
    tags: ["networking", "containers", "kubernetes"],
    excerpt: "Container networking is built on familiar IP routing concepts, but with layers of abstraction that can make it hard to understand. Here is the foundation.",
    coverImage: "/images/blog/container-networking-fundamentals.jpg",
    coverCredit: {
      author: "Dereckson",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Openfire_architecture_on_Nasqueron_Docker_PaaS.png",
    },
    content: `
## Network Namespaces

The foundation of container networking is Linux network namespaces. Each namespace has its own isolated network stack: its own interfaces, routing table, and firewall rules. A container runs inside a network namespace, giving it the appearance of a dedicated network.

When Docker starts a container, it creates a new network namespace and connects it to the host via a virtual Ethernet pair (veth). One end lives in the container namespace; the other lives in the host namespace and connects to a bridge.

## The Docker Bridge

By default, Docker creates a bridge called \`docker0\`. Every container on the default network connects to this bridge. The bridge performs NAT, translating between container IPs on the \`172.17.0.0/16\` range and the host's real IP address.

\`\`\`bash
# See container networking
docker inspect container-name | grep -A 20 '"Networks"'

# View the host-side veth interfaces
ip link show type veth
\`\`\`

## Kubernetes Networking Model

Kubernetes has three networking requirements:
1. All pods on a node can communicate with all other pods without NAT
2. All nodes can communicate with all pods without NAT
3. The IP a pod sees for itself is the same IP other pods see for it

This means no NAT between pods. Every pod gets a real routable IP. The Container Network Interface (CNI) plugins (Calico, Flannel, Cilium) implement this model.

## How Calico Works

Calico uses BGP to distribute pod routes across nodes. Each node peers with a route reflector (or directly with other nodes) and advertises the pod CIDR it is responsible for. Packets between pods on different nodes follow the BGP-learned routes, flowing directly without encapsulation.

This makes Calico extremely performant and easy to troubleshoot because the routing is standard IP routing.

## Service Networking

Kubernetes Services provide stable IP addresses for groups of pods. Service IPs are virtual. When a pod sends to a service IP, kube-proxy (or eBPF with Cilium) intercepts the packet using iptables or BPF rules and rewrites the destination to one of the backing pod IPs.

Understanding this rewrite is key to debugging connectivity problems in Kubernetes.
`,
  },
  {
    slug: "ssh-key-based-authentication",
    title: "SSH Key-Based Authentication: Setup and Best Practices",
    date: "2026-03-21",
    tags: ["linux", "security", "servers"],
    excerpt: "Key-based SSH authentication is more secure than passwords and more convenient with proper setup. Here is how to do it right.",
    coverImage: "/images/blog/ssh-key-based-authentication.jpg",
    coverCredit: {
      author: "Hpott",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:OpenBSD_starting_SSH_server.jpg",
    },
    content: `
## Why Keys Are Better Than Passwords

A password is a shared secret. It can be guessed, phished, or leaked. An SSH key pair is asymmetric. The private key never leaves your machine. The server only holds your public key. Even if the server is compromised, your private key is not exposed.

Keys are also more convenient at scale. You can authorize a key on hundreds of servers, and logging in to any of them requires no passwords or prompts.

## Generating a Key Pair

\`\`\`bash
# Generate an Ed25519 key (modern, fast, secure)
ssh-keygen -t ed25519 -C "admin@workstation" -f ~/.ssh/id_ed25519

# Or RSA if you need compatibility with older systems
ssh-keygen -t rsa -b 4096 -C "admin@workstation" -f ~/.ssh/id_rsa
\`\`\`

Always set a passphrase. The passphrase encrypts the private key on disk, so even if someone steals your laptop, they cannot use the key without the passphrase.

## Distributing the Public Key

\`\`\`bash
# Copy to a server (simplest method)
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server

# Or manually append to authorized_keys
cat ~/.ssh/id_ed25519.pub | ssh user@server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
\`\`\`

## Using ssh-agent

The SSH agent stores your decrypted private key in memory so you only need to enter the passphrase once per session:

\`\`\`bash
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519
\`\`\`

## SSH Config for Multiple Keys and Hosts

\`\`\`
# ~/.ssh/config
Host prod-*
  User deploy
  IdentityFile ~/.ssh/id_ed25519_prod
  ForwardAgent no

Host lab-server
  Hostname 192.168.1.50
  User admin
  IdentityFile ~/.ssh/id_ed25519_lab
  Port 2222
\`\`\`

## Key Rotation

Rotate SSH keys periodically. When an employee leaves, remove their public key from authorized_keys on every server. This is why centralized key management (via LDAP, Teleport, or HashiCorp Vault SSH) makes sense at scale. Manual key management across hundreds of servers is error-prone.
`,
  },
  {
    slug: "nfs-vs-smb-network-storage",
    title: "NFS vs SMB: Choosing the Right Network Filesystem",
    date: "2026-03-22",
    tags: ["storage", "networking", "servers"],
    excerpt: "NFS and SMB both share files over a network, but they are designed for different environments. Here is how to choose between them.",
    coverImage: "/images/blog/nfs-vs-smb-network-storage.jpg",
    coverCredit: {
      author: "DYVER",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Synology_Disk_Station_DS223J_-_NAS-Server.jpg",
    },
    content: `
## The Basic Difference

NFS (Network File System) is a Unix/Linux protocol. SMB (Server Message Block, also called CIFS) is a Windows protocol. Both allow clients to mount remote filesystems as if they were local, but they have different strengths and trade-offs.

## When to Use NFS

NFS is the right choice for Linux-to-Linux file sharing. It is the standard for NAS shares in Linux environments, VM storage, and shared filesystems in HPC (high-performance computing) clusters.

**Advantages:**
- Very low overhead, efficient for large file I/O
- Native integration with Linux permissions and UID/GID mapping
- Excellent performance for sequential workloads
- NFSv4 adds strong security, locking, and delegation

**Limitations:**
- Not natively supported on Windows (requires additional software)
- User ID mapping can be complex in mixed environments

\`\`\`bash
# Mount an NFS share on Linux
mount -t nfs 192.168.1.50:/data /mnt/data

# Permanent mount in /etc/fstab
192.168.1.50:/data  /mnt/data  nfs  defaults,_netdev  0  0
\`\`\`

## When to Use SMB

SMB is the right choice when Windows clients are involved. It is the native protocol for Windows file sharing and is well-supported on macOS as well. Samba implements SMB on Linux, allowing Linux servers to serve files to Windows clients.

**Advantages:**
- Native on Windows and macOS
- Supports Windows ACLs and Active Directory integration
- Works well across mixed environments

**Limitations:**
- Higher overhead than NFS for Linux-only environments
- Active Directory integration requires additional configuration

## Performance Comparison

For pure Linux workloads, NFS consistently outperforms SMB for large sequential reads and writes. For random I/O with many small files, the difference narrows. For mixed environments with Windows clients, SMB is the practical choice regardless of the performance difference.

## My Setup

I use NFS for VM storage and Linux data shares in my lab. Windows VMs that need shared storage use SMB served from TrueNAS, which supports both protocols from the same storage pool.
`,
  },
  {
    slug: "ntp-enterprise-networks",
    title: "NTP: Why Time Synchronization Matters in Enterprise Networks",
    date: "2026-03-23",
    tags: ["networking", "servers", "operations"],
    excerpt: "Accurate time is foundational to authentication, logging, and troubleshooting. Here is how NTP works and how to deploy it properly.",
    coverImage: "/images/blog/ntp-enterprise-networks.jpg",
    coverCredit: {
      author: "US Air Force",
      license: "Public domain",
      licenseUrl: "https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Usno-amc.jpg",
    },
    content: `
## Why Time Matters

Time synchronization is invisible when it works and catastrophic when it does not. Kerberos authentication (the backbone of Active Directory) fails if clocks are more than five minutes apart. TLS certificate validation uses timestamps. Log correlation across multiple systems is impossible if logs have different timestamps. DNSSEC and many security protocols depend on accurate time.

## How NTP Works

NTP (Network Time Protocol) synchronizes clocks using a hierarchy called stratum. Stratum 0 devices are atomic clocks or GPS receivers. Stratum 1 servers connect directly to Stratum 0 sources. Stratum 2 servers sync from Stratum 1, and so on.

NTP measures the round-trip delay to the time server and uses statistical algorithms to estimate clock offset and drift. It then adjusts the local clock gradually rather than jumping, which prevents the kind of time discontinuities that break applications.

## Deploying NTP in an Enterprise Network

The recommended pattern:
1. Two or three internal NTP servers sync from external Stratum 1/2 sources
2. All internal devices sync from the internal servers, not directly from the internet
3. The firewall only allows the internal NTP servers to reach external NTP

\`\`\`bash
# /etc/chrony.conf on the internal NTP server
server pool.ntp.org iburst prefer
allow 192.168.0.0/16  # Allow clients in this range
\`\`\`

## Configuring Clients

\`\`\`bash
# /etc/chrony.conf on a client
server 192.168.1.10 iburst prefer  # Internal NTP server 1
server 192.168.1.11 iburst          # Internal NTP server 2

# Check synchronization status
chronyc tracking
chronyc sources -v
\`\`\`

## Network Devices

Configure network switches and firewalls to use your internal NTP servers:

\`\`\`
ntp server 192.168.1.10 prefer
ntp server 192.168.1.11
\`\`\`

## Monitoring Time

Monitor your NTP infrastructure. A drifted clock that goes unnoticed can cause subtle, hard-to-diagnose failures. Track the offset and jitter of your internal NTP servers and alert if they fall out of acceptable ranges.
`,
  },
  {
    slug: "nginx-reverse-proxy-setup",
    title: "Setting Up Nginx as a Reverse Proxy for Lab Services",
    date: "2026-03-24",
    tags: ["linux", "networking", "servers"],
    excerpt: "Nginx as a reverse proxy centralizes access to multiple backend services, handles TLS termination, and simplifies the architecture of a homelab or small production environment.",
    coverImage: "/images/blog/nginx-reverse-proxy-setup.jpg",
    coverCredit: {
      author: "PauleMiranda",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Home_Server_Debian.jpg",
    },
    content: `
## Why a Reverse Proxy

Without a reverse proxy, every service in your lab needs its own port. Accessing Grafana is port 3000, Proxmox is 8006, your web apps are on random ports. A reverse proxy sits in front of all these services and routes traffic based on the hostname in the request. You access everything on port 443 with a proper domain name.

It also centralizes TLS. Instead of managing certificates on each service, you terminate TLS at the proxy and forward unencrypted traffic internally.

## Basic Nginx Configuration

\`\`\`nginx
# /etc/nginx/sites-available/grafana
server {
    listen 443 ssl;
    server_name grafana.lab.internal;

    ssl_certificate /etc/nginx/ssl/lab.crt;
    ssl_certificate_key /etc/nginx/ssl/lab.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
\`\`\`

## WebSocket Support

Some services (Proxmox console, Grafana live updates) use WebSockets. Add these lines to the location block:

\`\`\`nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
\`\`\`

## Internal PKI

For a homelab, create your own Certificate Authority. Add its certificate to your browser's trusted CAs, and all your internal services get valid HTTPS without certificate warnings.

\`\`\`bash
# Create a CA key and certificate
openssl req -x509 -nodes -newkey rsa:4096 -keyout ca.key \
  -out ca.crt -days 3650 -subj "/CN=Lab CA"
\`\`\`

## Rate Limiting

Add basic rate limiting to prevent abuse:

\`\`\`nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}

location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://backend;
}
\`\`\`
`,
  },
  {
    slug: "lacp-link-aggregation",
    title: "LACP and Link Aggregation: Combining Links for More Bandwidth",
    date: "2026-03-25",
    tags: ["networking", "switching", "hardware"],
    excerpt: "Link aggregation combines multiple physical links into a single logical link. Here is how LACP works and how to configure it correctly.",
    coverImage: "/images/blog/lacp-link-aggregation.jpg",
    coverCredit: {
      author: "JITHIN",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Network-bonding-2.png",
    },
    content: `
## What Link Aggregation Does

Link Aggregation (also called bonding on Linux, or an EtherChannel on Cisco) combines multiple physical Ethernet links into a single logical interface. The benefits are increased bandwidth and redundancy. If one physical link fails, traffic automatically flows through the remaining links.

LACP (Link Aggregation Control Protocol, IEEE 802.3ad) is the standard protocol for negotiating link aggregation between two devices. Both ends send LACP PDUs to establish and maintain the aggregate.

## How Hashing Works

Link aggregation does not actually bond the links into a single higher-speed pipe for individual flows. Instead, traffic is distributed across links using a hashing algorithm. Common hash inputs:

- **Layer 2 (src/dst MAC):** Distributes based on source and destination MAC
- **Layer 3 (src/dst IP):** Better distribution for multi-host environments
- **Layer 4 (src/dst IP + port):** Best distribution for high-traffic flows between few hosts

A single TCP connection always flows over a single physical link. You cannot exceed the speed of one link for a single stream. The benefit is total throughput across many flows.

## Cisco Configuration

\`\`\`
interface Port-channel1
  description TRUNK_TO_SERVER
  switchport mode trunk

interface GigabitEthernet1/0/1
  channel-group 1 mode active
  
interface GigabitEthernet1/0/2
  channel-group 1 mode active
\`\`\`

## Linux Configuration (systemd-networkd)

\`\`\`ini
# /etc/systemd/network/bond0.netdev
[NetDev]
Name=bond0
Kind=bond

[Bond]
Mode=802.3ad
LACPTransmitRate=fast
TransmitHashPolicy=layer3+4

# /etc/systemd/network/bond0.network
[Match]
Name=bond0

[Network]
Address=192.168.1.100/24
Gateway=192.168.1.1
\`\`\`

## Troubleshooting

Check that both sides are in the same LACP mode (active/active or active/passive, not passive/passive which will not negotiate). Verify speed and duplex match on all member links. Check that the switch port channel is up and members are showing as bundled.
`,
  },
  {
    slug: "enterprise-wifi-vs-consumer",
    title: "Enterprise WiFi vs Consumer Grade: What Actually Differs",
    date: "2026-03-26",
    tags: ["networking", "wireless", "hardware"],
    excerpt: "Enterprise access points cost significantly more than consumer routers. Here is what you actually get for that investment.",
    coverImage: "/images/blog/enterprise-wifi-vs-consumer.jpg",
    coverCredit: {
      author: "Xosema",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Cisco_Aironet_1131AG_-_Close.jpg",
    },
    content: `
## The Core Difference

Consumer WiFi routers are designed for home use: a small number of devices, low density, non-technical users. Enterprise APs are designed for high-density environments with many concurrent users, centralized management, and predictable performance.

## What Enterprise APs Do Better

**Centralized management:** Enterprise systems (Cisco Meraki, Ubiquiti UniFi, Aruba Instant) provide a single pane of glass for all APs. Push a configuration change and it deploys to every AP in seconds. See per-client statistics, channel utilization, and interference maps from one interface.

**Band steering and load balancing:** Enterprise APs actively steer clients to the optimal band (5GHz preferred over 2.4GHz) and distribute clients across APs based on signal strength and load.

**High-density design:** The antenna arrays, radio configurations, and firmware optimizations in enterprise APs are designed for many simultaneous clients. A $200 consumer router starts degrading noticeably at 30+ active clients. A good enterprise AP handles 200+ without issues.

**PoE integration:** Enterprise APs run on PoE, eliminating the need for power outlets at every mounting location.

**Seamless roaming (802.11r/k/v):** Clients can move between APs without dropping connections, which matters for voice and video applications.

## The UniFi Middle Ground

Ubiquiti UniFi occupies an interesting position: professional hardware and management at prices between consumer and full enterprise. For a homelab or small office, UniFi provides most of the enterprise capabilities without the enterprise price tag.

I run UniFi in my lab. The controller software manages all APs from a single interface, provides detailed statistics, and handles automatic firmware updates.

## When Consumer Is Fine

For a home with a handful of devices and no performance-sensitive applications, a good consumer router is perfectly adequate. The investment in enterprise hardware only makes sense when you need the density, management, or reliability features.
`,
  },
  {
    slug: "dhcp-snooping-arp-inspection",
    title: "DHCP Snooping and Dynamic ARP Inspection: Layer 2 Security",
    date: "2026-03-27",
    tags: ["networking", "security", "switching"],
    excerpt: "DHCP snooping and DAI are essential Layer 2 security features that prevent common attacks on switched networks. Here is how to configure them.",
    coverImage: "/images/blog/dhcp-snooping-arp-inspection.jpg",
    coverCredit: {
      author: "Dsimic",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:19-inch_rackmount_Ethernet_switches_and_patch_panels.jpg",
    },
    content: `
## The Attacks These Prevent

**DHCP Spoofing:** A rogue device on the network runs a DHCP server and responds to DHCP requests faster than the legitimate server. Clients receive IP addresses from the rogue server, with a gateway pointing to the attacker. All traffic flows through the attacker's device.

**ARP Poisoning:** ARP has no authentication. An attacker can send gratuitous ARP replies claiming to own any IP address, including the default gateway. Other hosts update their ARP tables and send traffic through the attacker.

Both attacks enable man-in-the-middle interception of traffic without detection.

## DHCP Snooping

DHCP snooping builds a binding table: which MAC address received which IP address on which port. It marks ports as trusted or untrusted. DHCP server responses from untrusted ports are dropped.

\`\`\`
ip dhcp snooping
ip dhcp snooping vlan 10,20,30

! Mark the uplink to the real DHCP server as trusted
interface GigabitEthernet1/0/48
  ip dhcp snooping trust

! Access ports are untrusted by default
interface range GigabitEthernet1/0/1-47
  ip dhcp snooping limit rate 15
\`\`\`

## Dynamic ARP Inspection

DAI uses the DHCP snooping binding table to validate ARP packets. If a host claims to be an IP address that DHCP snooping assigned to a different MAC, the ARP is dropped.

\`\`\`
ip arp inspection vlan 10,20,30

! Uplinks and router ports must be trusted
interface GigabitEthernet1/0/48
  ip arp inspection trust

! Access ports are untrusted by default
interface range GigabitEthernet1/0/1-47
  ip arp inspection limit rate 100
\`\`\`

## What to Watch

Both features generate logs for violations. Review these periodically. A device frequently triggering DHCP snooping violations might be misconfigured, but it could also be a malicious device. Unexpected ARP inspection violations could indicate an active attack.

These features are lightweight and should be standard configuration on access layer switches in any environment where you do not fully trust every connected device.
`,
  },
  {
    slug: "prometheus-server-monitoring",
    title: "Monitoring Infrastructure with Prometheus and Grafana",
    date: "2026-03-28",
    tags: ["monitoring", "servers", "operations"],
    excerpt: "Prometheus and Grafana together provide powerful, flexible infrastructure monitoring. Here is how to get a production-quality monitoring setup running.",
    coverImage: "/images/blog/prometheus-server-monitoring.jpg",
    coverCredit: {
      author: "Joel Kennedy",
      license: "Public domain",
      licenseUrl: "https://commons.wikimedia.org/wiki/Commons:Licensing#Public_domain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Grafana_screenshot_(2018).png",
    },
    content: `
## Why Prometheus

Prometheus is a time-series database and monitoring system designed for dynamic environments. Unlike traditional monitoring tools that push metrics to a central server, Prometheus pulls (scrapes) metrics from target endpoints. This pull model makes it easy to add and remove targets without reconfiguring the monitoring server.

The query language (PromQL) is powerful and expressive. You can aggregate, transform, and calculate derived metrics that reveal system behavior not visible in raw numbers.

## Setting Up Prometheus

\`\`\`yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['server1:9100', 'server2:9100', 'server3:9100']

  - job_name: 'proxmox'
    static_configs:
      - targets: ['proxmox:9090']
\`\`\`

## Node Exporter

Install the Prometheus Node Exporter on every Linux server you want to monitor. It exposes hundreds of system metrics including CPU, memory, disk I/O, network, and filesystem usage.

\`\`\`bash
# Install and start
apt install prometheus-node-exporter
systemctl enable prometheus-node-exporter

# Verify it is running
curl http://localhost:9100/metrics
\`\`\`

## Useful PromQL Queries

\`\`\`
# CPU usage percentage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100

# Disk I/O utilization
rate(node_disk_io_time_seconds_total[5m]) * 100

# Network traffic
rate(node_network_receive_bytes_total[5m])
\`\`\`

## Alerting with Alertmanager

\`\`\`yaml
# alert_rules.yml
groups:
  - name: servers
    rules:
      - alert: HighCPU
        expr: cpu_usage > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
\`\`\`

Pair Alertmanager with routing rules to send alerts to email, Slack, or PagerDuty based on severity and team ownership.
`,
  },
  {
    slug: "bgp-route-filtering-security",
    title: "BGP Route Filtering and Security Best Practices",
    date: "2026-03-29",
    tags: ["networking", "bgp", "security"],
    excerpt: "BGP without proper filtering is dangerous. Here is how to implement route filtering to protect your network and the internet.",
    coverImage: "/images/blog/bgp-route-filtering-security.jpg",
    coverCredit: {
      author: "Stefan Funke from Frankfurt, Germany",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:DE-CIX_GERMANY_-_Switch_Rack_(6218137120).jpg",
    },
    content: `
## Why BGP Filtering Matters

BGP route leaks and hijacks happen because many networks do not filter what they accept or advertise. A misconfigured router at one AS can accidentally advertise another AS's prefixes, causing traffic to route through unexpected paths. In some cases, this is accidental. In others, it is intentional hijacking.

The internet is more stable when every AS filters aggressively. And your network is more secure when you only accept routes you expect from each peer.

## Prefix Lists

Prefix lists filter routes based on the network prefix and prefix length. Use them to whitelist specific prefixes from peers and to control what you advertise:

\`\`\`
ip prefix-list PEER-IN permit 192.0.2.0/24
ip prefix-list PEER-IN permit 198.51.100.0/24
ip prefix-list PEER-IN deny 0.0.0.0/0 le 32  ! Deny everything else

ip prefix-list MY-PREFIXES permit 203.0.113.0/24

router bgp 65001
  neighbor 10.0.0.2 prefix-list PEER-IN in
  neighbor 10.0.0.2 prefix-list MY-PREFIXES out
\`\`\`

## Bogon Filtering

Never accept or advertise bogon prefixes: RFC 1918 private addresses, loopback addresses, documentation ranges, or prefixes shorter than /8 or longer than /24.

\`\`\`
ip prefix-list BOGONS deny 10.0.0.0/8 le 32
ip prefix-list BOGONS deny 172.16.0.0/12 le 32
ip prefix-list BOGONS deny 192.168.0.0/16 le 32
ip prefix-list BOGONS deny 127.0.0.0/8 le 32
ip prefix-list BOGONS deny 0.0.0.0/8 le 32
ip prefix-list BOGONS permit 0.0.0.0/0 le 32
\`\`\`

## RPKI

RPKI (Resource Public Key Infrastructure) provides cryptographic validation that a prefix is authorized to be advertised by a specific AS. Route Origin Authorizations (ROAs) are published by IP address holders and validated by routers. Invalid prefixes (where the announcing AS does not match the ROA) can be dropped.

RPKI is one of the most effective tools for preventing BGP hijacking. Major ISPs and cloud providers now validate RPKI. If you run BGP, enable RPKI validation.

## AS Path Filtering

Limit the AS path length you accept. An AS path longer than a reasonable maximum (like 10 or 20 hops) is likely bogus or part of a route leak.
`,
  },
  {
    slug: "secure-network-design-principles",
    title: "Secure Network Design: Principles That Actually Matter",
    date: "2026-03-30",
    tags: ["security", "networking", "architecture"],
    excerpt: "Security is most effective when it is built into network architecture from the start, not added on top afterward. Here are the foundational principles.",
    coverImage: "/images/blog/secure-network-design-principles.jpg",
    coverCredit: {
      author: "istolethetv",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/44124401641@N01/8746385789",
    },
    content: `
## Defense in Depth

No single control is sufficient. A network designed for security has multiple independent layers. If an attacker bypasses the perimeter firewall, they still face internal segmentation. If they compromise a server, they cannot reach other segments without traversing another control point.

Defense in depth means assuming any individual control will fail and designing so that failure does not cascade.

## Least Privilege Network Access

Every device and every user should only have network access to what they need. A printer should not be able to reach your domain controllers. A guest WiFi network should not be able to reach anything internal. A database server should only accept connections from the application servers that query it.

Enforce this with firewall rules, ACLs, and VLAN segmentation. Document what should be allowed and deny everything else by default.

## Separate Management Plane

Network device management (SSH, HTTPS, SNMP) should never ride on the same network as production traffic. Create a dedicated management VLAN or network. Only devices with a specific need to manage infrastructure can reach the management plane.

This means that even if an attacker compromises a server, they cannot reach your router's management interface because it is on a physically or logically separate network.

## Assume Breach

Design the network assuming an attacker will eventually get in. The question is not whether the perimeter will be breached, but what they can do once inside. Micro-segmentation, zero-trust access controls, and comprehensive logging all limit the damage from a successful intrusion.

## Visibility by Default

You cannot defend what you cannot see. Every network should have:
- Centralized logging from all devices
- Flow data (NetFlow, sFlow, or IPFIX) for traffic analysis
- DNS query logging
- Authentication event logging

Security without visibility is guesswork. Build observability into the network from day one.
`,
  },
  {
    slug: "scaling-homelab-lessons",
    title: "Scaling a Homelab: Lessons from Growing a Lab Environment",
    date: "2026-03-31",
    tags: ["homelab", "servers", "networking"],
    excerpt: "A homelab that grows without a plan becomes chaos. Here are the lessons I learned growing from one server to a multi-rack lab environment.",
    coverImage: "/images/blog/scaling-homelab-lessons.jpg",
    coverCredit: {
      author: "Tecnalia",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/34843636@N02/5808435079",
    },
    content: `
## Start with the Network

The biggest mistake in homelab growth is treating the network as an afterthought. When you add your fifth server and third VLAN, suddenly the flat network you started with is a mess. Traffic that should stay local hops through random paths. Troubleshooting is painful.

Plan for segmentation from the beginning, even if you only have one server. A managed switch, a few VLANs, and a firewall cost relatively little and provide the structure you need to grow cleanly.

## Document Before You Forget

Documentation is easiest when you are setting something up the first time. A week later, you will not remember which port on which switch connects to which server, or which IP address you assigned to which management interface.

I keep a simple network diagram (updated whenever something changes) and a spreadsheet with IP assignments. It takes ten minutes to update and saves hours of confusion later.

## Power Planning

Power is often the binding constraint in a homelab. A single R740 under load pulls 400-600W. Add another server, a UPS, and a few switches, and you are approaching the capacity of a typical residential circuit.

Calculate your power draw before buying hardware. Know which circuits you have available, what their capacity is, and how you will distribute load across them. A UPS gives you clean power and runtime for graceful shutdowns.

## Cables and Cable Management

Cable management that seems like excessive effort when you have three devices becomes essential when you have thirty. Spend time on it early. Label everything: patch cables, power cables, fiber. A label maker is one of the best investments in a growing lab.

## Test Everything

Each time you add something to the lab, test it thoroughly before relying on it. A new switch, a new server, a new cable: verify it works under load before you depend on it for anything important.

The lab is a place to practice and learn. Let it teach you through failures in controlled conditions, not through production outages.
`,
  },
  {
    slug: "firewall-log-analysis",
    title: "Firewall Log Analysis: Finding What Matters",
    date: "2026-04-01",
    tags: ["security", "firewall", "operations"],
    excerpt: "Firewall logs contain enormous volumes of data. Here is how to analyze them effectively to find real security events without drowning in noise.",
    coverImage: "/images/blog/firewall-log-analysis.jpg",
    coverCredit: {
      author: "ChrisDag",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/8558461@N08/5212583486",
    },
    content: `
## The Volume Problem

A firewall in a medium-sized network generates millions of log entries per day. Looking at raw logs is not practical. Effective log analysis means knowing what to look for, reducing noise, and using tools to surface anomalies automatically.

## Start with Denies

Allowed traffic is mostly expected. Denied traffic is interesting. Start your analysis there. What is being blocked, and why? Is something trying to reach a destination it should not? Is internal traffic trying to reach an external IP that looks suspicious?

\`\`\`bash
# Extract denied connections from FortiGate syslog
grep "action=deny" /var/log/fortigate/traffic.log | \
  awk '{print $6, $7, $8}' | sort | uniq -c | sort -rn | head -50
\`\`\`

## Identify Traffic Patterns

Look for traffic patterns that do not match business activity:

- **After-hours traffic:** A server initiating many connections to external IPs at 3 AM is suspicious
- **Port scanning:** A source hitting many different destination ports in a short time
- **Repeated authentication failures:** Brute force attempts against exposed services
- **DNS tunneling indicators:** Unusually long DNS queries or high query volumes to a single domain

## Baseline Normal

You cannot identify anomalies without knowing what normal looks like. Spend time understanding your baseline: which servers connect to the internet, on which ports, at what volumes. When something deviates from baseline, investigate.

## Automation with SIEM

Manual log analysis does not scale. Feed firewall logs into a SIEM (Wazuh, Splunk, or Elastic). Write correlation rules that alert when patterns suggesting attacks occur:

- Same source hitting 20+ different internal IPs in five minutes
- Any traffic from an internal server to a known-malicious IP
- Multiple failed authentications followed by a successful one

## The Follow-Through

An alert is only valuable if someone acts on it. Build a workflow: alerts generate tickets, tickets get investigated, findings get documented. Close the loop on every alert, even if the finding is "false positive, tuned rule."
`,
  },
  {
    slug: "qos-enterprise-networks",
    title: "Quality of Service in Enterprise Networks",
    date: "2026-04-02",
    tags: ["networking", "qos", "switching"],
    excerpt: "QoS ensures that critical traffic gets priority when bandwidth is constrained. Here is how to design and implement a QoS policy that actually works.",
    coverImage: "/images/blog/qos-enterprise-networks.jpg",
    coverCredit: {
      author: "tawalker",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/30139045@N00/458064906",
    },
    content: `
## When QoS Matters

QoS is about managing contention. On an uncongested link, every packet gets through immediately regardless of its type. When a link is congested (more traffic than bandwidth), some packets get delayed or dropped. QoS controls which packets get priority in that situation.

The main use cases: ensuring voice (VoIP) stays clear even when the network is busy, prioritizing business-critical applications over bulk transfers, and limiting the impact of backup traffic on interactive workloads.

## The QoS Model

**Classification:** Mark traffic with a DSCP (Differentiated Services Code Point) value that indicates its priority. This is done as close to the source as possible.

**Queuing:** Network devices place packets into queues based on DSCP values. High-priority queues are served first.

**Policing and shaping:** Limit the bandwidth available to specific traffic classes. Shaping buffers excess traffic and sends it later; policing drops it.

## DSCP Values

The standard markings used in most enterprise environments:

| Traffic Type | DSCP Value | Per-Hop Behavior |
|---|---|---|
| VoIP | 46 | Expedited Forwarding |
| Video conferencing | 34 | Assured Forwarding 4 |
| Business critical | 26 | Assured Forwarding 3 |
| Best effort | 0 | Default |
| Scavenger (backups) | 8 | CS1 |

## Cisco Configuration

\`\`\`
! Mark VoIP traffic from IP phones
class-map match-all VOIP
  match ip dscp ef

policy-map QOS-POLICY
  class VOIP
    priority 20  ! Guaranteed 20% bandwidth with strict priority
  class BUSINESS-APPS
    bandwidth percent 40
  class class-default
    fair-queue

interface GigabitEthernet0/1
  service-policy output QOS-POLICY
\`\`\`

## Testing Your QoS Policy

Use iPerf to generate test traffic and verify that QoS is working as expected. Generate competing flows of different traffic types and measure whether the priority traffic maintains its performance while lower-priority traffic degrades.
`,
  },
  {
    slug: "ansible-network-automation",
    title: "Automating Network Configuration with Ansible",
    date: "2026-04-03",
    tags: ["networking", "automation", "operations"],
    excerpt: "Ansible's network modules allow you to configure routers, switches, and firewalls programmatically. Here is how to get started with network automation.",
    coverImage: "/images/blog-ansible-network-automation.png",
    content: `
## Why Automate Network Configuration

Manual configuration is slow, error-prone, and does not scale. When you have ten switches and need to add a new VLAN, logging into each one individually and repeating the same commands ten times is tedious and introduces inconsistency. Automation makes configuration changes fast, consistent, and repeatable.

## How Ansible Connects to Network Devices

Unlike servers where Ansible pushes changes via SSH and runs commands on the remote host, network devices are typically managed by connecting from the Ansible control node and issuing CLI commands over SSH. Ansible uses connection plugins like \`network_cli\` for this.

## Basic Inventory

\`\`\`yaml
# inventory.yml
all:
  children:
    switches:
      hosts:
        core-sw-01:
          ansible_host: 192.168.1.10
          ansible_network_os: ios
          ansible_user: ansible
          ansible_password: "{{ vault_switch_password }}"
          ansible_connection: network_cli
        core-sw-02:
          ansible_host: 192.168.1.11
          ansible_network_os: ios
\`\`\`

## Simple VLAN Playbook

\`\`\`yaml
# add_vlan.yml
- name: Add VLAN to all access switches
  hosts: switches
  gather_facts: no
  
  tasks:
    - name: Create VLAN
      cisco.ios.ios_vlans:
        config:
          - vlan_id: 200
            name: NEW_SEGMENT
            state: active
        state: merged
    
    - name: Save configuration
      cisco.ios.ios_command:
        commands:
          - write memory
\`\`\`

## Idempotency

Ansible is designed to be idempotent: running a playbook multiple times produces the same result. If the VLAN already exists, the playbook skips creating it. This makes automation safe to run repeatedly and makes it practical to run on a schedule as a configuration compliance check.

## Ansible Vault

Store credentials securely using Ansible Vault:

\`\`\`bash
# Encrypt a password
ansible-vault encrypt_string 'mypassword' --name vault_switch_password

# Run playbook with vault password
ansible-playbook add_vlan.yml --ask-vault-pass
\`\`\`
`,
  },
  {
    slug: "network-engineer-role-2026",
    title: "The Network Engineer Role in 2026: What Has Changed",
    date: "2026-04-04",
    tags: ["networking", "career", "technology"],
    excerpt: "Networking has changed significantly in the last few years. Here is what the role looks like now and what skills matter most going forward.",
    coverImage: "/images/blog/network-engineer-role-2026.jpg",
    coverCredit: {
      author: "cogdogblog",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: "https://www.flickr.com/photos/37996646802@N01/537486932",
    },
    content: `
## What Has Changed

The network engineer of five years ago spent most of their time on physical infrastructure: racking switches, running cables, configuring VLANs, and troubleshooting Layer 2 problems. While all of that still exists, the center of gravity has shifted.

Today, a significant portion of enterprise networking happens in software. Cloud networking, overlay fabrics, SD-WAN, and software-defined controllers mean that network configuration is increasingly declarative, API-driven, and version-controlled.

## What Has Not Changed

The fundamentals remain completely relevant. If you do not understand IP routing, BGP, spanning tree, and firewall policy design, you cannot be effective regardless of what tools are in use. The abstractions built on top of these fundamentals require understanding what is underneath to troubleshoot effectively.

## Skills That Are Growing in Importance

**Automation:** Network engineers who can write Python and Ansible, use APIs, and work with version control systems are significantly more valuable than those who cannot. Config-as-code is becoming standard practice.

**Cloud networking:** AWS VPCs, Azure VNets, and GCP networking are now core skills for most enterprise network teams. Hybrid connectivity (Direct Connect, ExpressRoute, VPN) between on-premises and cloud is ubiquitous.

**Security integration:** The boundary between network engineering and network security has blurred. Network engineers are expected to understand and implement security controls, not just hand off to a separate security team.

## What I Am Focusing On

The combination of deep fundamentals with automation and cloud skills is the most valuable place to be. A network engineer who can troubleshoot a BGP route leak AND write an Ansible playbook to fix it AND understand how that routing decision propagates in a cloud environment is solving genuinely hard problems.

That combination is not common, which makes it worth investing in.
`,
  },
  {
    slug: "penetration-testing-basics",
    title: "Penetration Testing Basics: A Defensive Perspective",
    date: "2026-04-05",
    tags: ["cybersecurity", "security", "networking"],
    excerpt: "Understanding how penetration testing works helps defenders build better controls. Here is what pen testers actually do and what it means for defense.",
    coverImage: "/images/blog/penetration-testing-basics.jpg",
    coverCredit: {
      author: "gaudiramone",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/31112252@N00/14096358745",
    },
    content: `
## Why Defenders Should Understand Offense

Defense is most effective when you understand what you are defending against. A network engineer who has never run an Nmap scan does not understand what information their open ports reveal. A sysadmin who has never used Mimikatz does not understand why credential hygiene matters.

Understanding attacker methodology helps you prioritize controls, identify gaps, and detect attacks by recognizing their telltale patterns.

## The Penetration Testing Phases

**Reconnaissance:** Gathering information without active exploitation. OSINT, DNS enumeration, certificate transparency logs, LinkedIn scraping. The goal is understanding the target's attack surface before touching it.

**Scanning:** Active discovery of systems, ports, and services. Nmap is the standard tool.

\`\`\`bash
# Service version detection, OS detection, default scripts
nmap -sV -sC -O 192.168.1.0/24

# Scan specific ports quickly
nmap -p 22,80,443,3389,5985 192.168.1.0/24
\`\`\`

**Exploitation:** Attempting to exploit discovered vulnerabilities. Metasploit is the standard framework for public exploits. Custom exploits require significantly more skill.

**Post-exploitation:** What can you do once you have a foothold? Enumerate local system, dump credentials, escalate privileges, move laterally to other systems.

**Reporting:** A penetration test without a clear report is useless. The report must describe what was found, how it was found, what the impact is, and how to fix it.

## What This Means for Defense

Every pen test phase has a defensive countermeasure. Limit public information exposure. Minimize exposed ports and services. Patch known vulnerabilities. Monitor for scanning patterns and post-exploitation techniques.

The MITRE ATT&CK framework maps attacker techniques to defensive detections. If you know what techniques pen testers use, you can build detection rules for exactly those techniques.
`,
  },
  {
    slug: "tls-modern-encryption",
    title: "TLS 1.3 and Modern Encryption: What Changed and Why It Matters",
    date: "2026-04-06",
    tags: ["security", "encryption", "networking"],
    excerpt: "TLS 1.3 significantly improved on TLS 1.2 in both security and performance. Here is what changed and what you need to do about it.",
    coverImage: "/images/blog/tls-modern-encryption.jpg",
    coverCredit: {
      author: "Halub3",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://commons.wikimedia.org/w/index.php?curid=113054252",
    },
    content: `
## Why TLS 1.3 Is Important

TLS 1.2 is secure when configured correctly, but "when configured correctly" is the problem. TLS 1.2 supported a wide range of cipher suites, many of which are now considered weak. Misconfigured servers using RC4, 3DES, or export-grade ciphers were common attack targets for years.

TLS 1.3 removed all the dangerous cipher suites, mandated forward secrecy, simplified the protocol, and reduced handshake latency. It is strictly better than TLS 1.2 and should be preferred wherever possible.

## What Changed in TLS 1.3

**Removed cipher suites:** RC4, 3DES, AES-CBC mode, and many others are simply gone. TLS 1.3 only supports AEAD ciphers: AES-GCM and ChaCha20-Poly1305.

**Mandatory forward secrecy:** TLS 1.3 only allows ephemeral key exchange (ECDHE). If the server's private key is ever compromised, past sessions cannot be decrypted. TLS 1.2 allowed RSA key exchange, which did not provide forward secrecy.

**Faster handshake:** TLS 1.3 requires only one round trip for the handshake (compared to two for TLS 1.2). 0-RTT resumption allows reconnecting clients to send data in the first packet.

**Encrypted certificates:** In TLS 1.2, the server's certificate was sent in plaintext. TLS 1.3 encrypts it, improving privacy.

## Enabling TLS 1.3

\`\`\`nginx
# nginx.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDH+AESGCM:ECDH+CHACHA20:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
\`\`\`

## What You Should Disable

Disable TLS 1.0 and 1.1 everywhere. These versions have known vulnerabilities (POODLE, BEAST) and no modern client requires them. Check your servers and load balancers for these settings.

Monitor your cipher suite usage and set a timeline for deprecating TLS 1.2 once you have confirmed all clients support 1.3.
`,
  },
  {
    slug: "server-consolidation-virtualization",
    title: "Server Consolidation with Virtualization: A Practical Guide",
    date: "2026-04-07",
    tags: ["virtualization", "servers", "operations"],
    excerpt: "Server consolidation using virtualization reduces hardware costs, power consumption, and management complexity. Here is how to plan and execute it.",
    coverImage: "/images/blog/server-consolidation-virtualization.jpg",
    coverCredit: {
      author: "e53",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
      sourceUrl: "https://www.flickr.com/photos/12149418@N00/2367945536",
    },
    content: `
## The Case for Consolidation

Physical servers are expensive to buy, expensive to power, and expensive to manage. A rack of physical servers, each running at 15 percent CPU utilization, is wasting most of its capacity while still consuming full power and requiring full maintenance.

Virtualization consolidates many workloads onto fewer physical hosts. The same compute, done on fewer machines, with lower cost, lower power, and less physical complexity.

## Planning the Consolidation

Start with an inventory of what you are consolidating. For each physical server:
- CPU utilization over time (average and peak)
- Memory utilization
- Storage I/O requirements
- Network throughput
- Any special hardware requirements (GPU, USB passthrough, NUMA sensitivity)

A server running at 20 percent CPU average with 30 percent peak can share a physical host with several other similar workloads. A server running at 80 percent CPU peak needs a dedicated host or careful co-placement planning.

## Sizing the New Infrastructure

Rule of thumb: plan for 4:1 to 8:1 VM-to-physical-core ratios for typical workloads, 2:1 for compute-intensive, and 1:1 or even less for databases.

For memory, there is no overcommitment that is safe for production. VM memory should sum to less than physical host memory, with headroom for the hypervisor.

## Migration Strategy

**Lift and shift:** Convert the existing OS to a VM without changes. Fastest approach, minimal risk, but you carry over any technical debt.

**Rebuild:** Deploy a fresh OS in a VM and reinstall applications. More work but produces a cleaner result.

P2V (physical-to-virtual) tools can automate the lift and shift conversion. VMware vCenter Converter and the open-source Clonezilla are common options.

## Post-Consolidation Monitoring

After consolidation, monitor CPU ready time (VMs waiting to be scheduled), memory balloon and swap activity, and storage latency. These metrics reveal whether your sizing was correct and where you need to rebalance workloads.
`,
  },
  {
    slug: "personal-brand-in-tech",
    title: "Building a Personal Brand in Tech: What Actually Works",
    date: "2026-04-08",
    tags: ["career", "community", "technology"],
    excerpt: "A genuine personal brand opens doors that credentials alone do not. Here is how to build one that reflects real expertise rather than manufactured content.",
    coverImage: "/images/blog/personal-brand-in-tech.jpg",
    coverCredit: {
      author: "jurvetson",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/44124348109@N01/18279271865",
    },
    content: `
## What a Personal Brand Actually Is

A personal brand is your reputation, made visible. It is what people think of when they see your name in a professional context. It is built on consistent, genuine output over time, not on clever marketing or posting a lot.

The foundation is expertise. You cannot fake technical depth to an audience of technical people. Every post, project, and contribution either builds or undermines that foundation.

## Building Through Output

The most durable personal brands in tech are built by people who share what they learn. Writing blog posts, creating tools, contributing to open source, answering questions in forums, and teaching others all create a record of thinking and problem-solving that is hard to fake and hard to misrepresent.

This site is part of that for me. Writing about what I actually do in the lab, what competitions have taught me, and what I think about infrastructure and security creates a record that is honest and specific. That specificity is what makes it valuable.

## The Long Game

The mistake most people make is expecting fast results. Personal brands compound slowly. A blog post written today might be discovered by someone a year from now. A project that gets 50 GitHub stars this year might get 500 next year. The timeline is long and the feedback loop is delayed.

This means consistency matters more than any individual piece of output. Write regularly, build regularly, contribute regularly. Over months and years, the accumulation becomes significant.

## Being Specific

Generic content does not build reputation. "Networking is important" is not valuable. "Here is exactly how I debugged a spanning tree loop that was causing packet loss on a specific VLAN" is valuable. Specificity demonstrates that you have actually done the thing.

## Teaching Youth as a Brand Builder

Teaching coding camps in the Las Vegas Valley has been one of the most meaningful ways I have built reputation in the local tech community. It is genuinely valuable work that directly demonstrates technical knowledge, communication skills, and commitment to the community. Those things travel.
`,
  },
  {
    slug: "teaching-youth-to-code",
    title: "What I've Learned Teaching Youth to Code",
    date: "2026-04-09",
    tags: ["community", "education", "coding"],
    excerpt: "Running coding camps for youth in the Las Vegas Valley has taught me as much as it has taught the students. Here is what actually works when introducing young people to technology.",
    coverImage: "/images/blog/teaching-youth-to-code.jpg",
    coverCredit: {
      author: "expertinfantry",
      license: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourceUrl: "https://www.flickr.com/photos/58297778@N04/5431970803",
    },
    content: `
## Why It Matters

Technical education changes life trajectories. A student who discovers they are good at programming at 13 has years of compounding learning ahead of them before they ever start a career. Someone who finds out at 22 has to move faster with less time. Getting the exposure early makes a real difference.

The Las Vegas Valley has a lot of students who would thrive in technical careers but who have not yet encountered the right context or the right encouragement. The coding camps try to close that gap.

## What I Have Learned About Teaching

**The first hour is everything.** If a student does not have a successful experience in the first hour, they disengage. The first project has to work, has to be interesting, and has to feel achievable. I design every camp to put something working in front of students within the first 30 minutes.

**Projects over lectures.** I have tried pure instruction and I have tried project-based learning. There is no comparison. Students who are building something retain concepts dramatically better than students who are being told about those concepts.

**The right level of difficulty.** Too easy and it is boring. Too hard and it is discouraging. The sweet spot is something that requires real thinking but is achievable in the session. Finding that balance for a room with varied experience levels is the hardest part of teaching.

## What Students Teach Me

Teaching forces you to understand things more deeply. When a student asks why we use a for loop instead of copying code three times, you have to explain clearly and completely. If your explanation is confusing, it usually means your own understanding has a gap.

I have refined my understanding of basic programming, logic, and systems concepts by having to explain them simply to people who have no context at all. That kind of clarity is useful far beyond the classroom.

## Looking Forward

I want to expand what we cover in the camps beyond basic coding. Networking fundamentals, cybersecurity basics, and systems thinking are all approachable at a high school level and are genuinely valuable career skills. The foundation we build early shapes what people pursue later.
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug && !post.draft);
}

export function getAllPosts(): BlogPost[] {
  return blogPosts
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostsByTag(tag: string): BlogPost[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  getAllPosts().forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}
