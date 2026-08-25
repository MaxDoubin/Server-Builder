
## The problem

You have serious GPU hardware sitting in a Mac and you want to run compute on it, not just draw pixels. Then you find out that every tutorial assumes CUDA, half the frameworks you know silently expect NVIDIA, and the APIs you were told to use got deprecated. Here is what actually works on this hardware, how to drive it, and where the honest limits are.

## The hardware

My Mac Pro has dual AMD Radeon Pro Vega II GPUs, each with 32 GB of HBM2 (High Bandwidth Memory). Together, that is 64 GB of GPU memory with massive bandwidth. These are workstation GPUs designed for sustained compute loads, not gaming.

The Vega II is built on AMD's Vega 20 die, which is GCN generation 5 with 64 compute units and 4096 shader cores, rated at roughly 14 teraflops of FP32. The memory is the interesting part. HBM2 stacks DRAM dies vertically next to the GPU on the same interposer and talks to them over an extremely wide bus, which is how you get about a terabyte per second of bandwidth from a part that draws less power than a GDDR-based card of the same class. For compute kernels that stream large arrays, bandwidth matters more than flops, and this is where these cards are strong.

The Infinity Fabric Link between the two GPUs allows them to share memory and work together on compute tasks, which is unusual for consumer/workstation hardware. This effectively gives you a single 64 GB GPU address space for workloads that support it.

That last clause is doing real work, so be clear about it. Infinity Fabric Link is a direct peer-to-peer path between the two dies that is several times faster than going out over PCIe 3.0 x16 and back. It means GPU A can read GPU B's memory without a round trip through host RAM. It does not mean the operating system presents one 64 GB device. Metal still enumerates two devices with 32 GB each, and your code has to explicitly split work across them. Nothing pools automatically.

## Metal for compute

Apple's Metal API is the primary way to access GPU compute on macOS. Metal Performance Shaders (MPS) provide optimized implementations of common operations like matrix multiplication, convolution, and image processing. These are the building blocks for machine learning inference and media processing.

Metal is also now the only supported way. OpenCL and OpenGL were both deprecated in macOS 10.14 Mojave. They still run, but they are frozen, and anything new should target Metal.

For video work, the GPUs accelerate ProRes encoding/decoding, color grading, and effects rendering in Final Cut Pro and DaVinci Resolve. The HBM2 memory bandwidth means large frames can be processed without bottlenecking on memory access.

## Writing an actual Metal kernel

Metal compute is less intimidating than it looks. The kernel is written in Metal Shading Language, which is C++14 with some restrictions and some GPU-specific attributes. Put this in `add.metal`:

```metal
#include <metal_stdlib>
using namespace metal;

kernel void vector_add(device const float* a [[buffer(0)]],
                       device const float* b [[buffer(1)]],
                       device float* out     [[buffer(2)]],
                       uint i [[thread_position_in_grid]])
{
    out[i] = a[i] + b[i];
}
```

Compile it ahead of time with the Metal toolchain that ships with the Xcode command line tools:

```bash
xcrun -sdk macosx metal -c add.metal -o add.air
xcrun -sdk macosx metallib add.air -o add.metallib
```

Then the host side in `gpu.swift`:

```swift
import Metal

let n = 1 << 20
for d in MTLCopyAllDevices() {
    print(d.name, d.recommendedMaxWorkingSetSize / (1 << 30), "GB")
}

let device = MTLCreateSystemDefaultDevice()!
let lib = try device.makeLibrary(URL: URL(fileURLWithPath: "add.metallib"))
let pipeline = try device.makeComputePipelineState(
    function: lib.makeFunction(name: "vector_add")!)

let bytes = n * MemoryLayout<Float>.stride
let a = device.makeBuffer(length: bytes, options: .storageModeShared)!
let b = device.makeBuffer(length: bytes, options: .storageModeShared)!
let out = device.makeBuffer(length: bytes, options: .storageModeShared)!
let ap = a.contents().bindMemory(to: Float.self, capacity: n)
let bp = b.contents().bindMemory(to: Float.self, capacity: n)
for i in 0..<n { ap[i] = Float(i); bp[i] = Float(2 * i) }

let queue = device.makeCommandQueue()!
let cmd = queue.makeCommandBuffer()!
let enc = cmd.makeComputeCommandEncoder()!
enc.setComputePipelineState(pipeline)
enc.setBuffer(a, offset: 0, index: 0)
enc.setBuffer(b, offset: 0, index: 1)
enc.setBuffer(out, offset: 0, index: 2)
let w = pipeline.maxTotalThreadsPerThreadgroup
enc.dispatchThreads(MTLSize(width: n, height: 1, depth: 1),
                    threadsPerThreadgroup: MTLSize(width: w, height: 1, depth: 1))
enc.endEncoding()
cmd.commit()
cmd.waitUntilCompleted()

let op = out.contents().bindMemory(to: Float.self, capacity: n)
print("running on:", device.name)
print(op[0], op[1], op[n - 1])
```

Build and run:

```bash
swiftc -O gpu.swift -o gpu && ./gpu
```

Correct output on a dual Vega II machine:

```
AMD Radeon Pro Vega II 32 GB
AMD Radeon Pro Vega II 32 GB
running on: AMD Radeon Pro Vega II
0.0 3.0 3145725.0
```

Two things to read out of that. First, both cards enumerate separately with 32 GB each, which is the point made above about pooling. Second, `MTLCreateSystemDefaultDevice()` picked one of them for you. If you want both, you iterate `MTLCopyAllDevices()` and build a pipeline per device.

One tuning note specific to this hardware: GCN executes in wavefronts of 64 threads, so threadgroup sizes on Vega should be multiples of 64. Apple's own GPUs use SIMD groups of 32. Code tuned for one is not automatically tuned for the other, and `pipeline.threadExecutionWidth` will tell you which you are on.

## Watching the GPU actually work

Activity Monitor has a GPU History window under the Window menu, which is fine for a glance. For a number you can log, this reads the driver's own counters:

```bash
sudo powermetrics --samplers gpu_power -i 1000 -n 3
```

Correct output includes a `GPU Power` line in milliwatts and per-GPU frequency residency. If you fire the kernel above in a loop and that power figure does not move, your work is not reaching the GPU.

## Machine learning

The Mac Pro can run machine learning inference workloads through Core ML and Metal. For training, it is limited compared to NVIDIA GPUs because the ML ecosystem (PyTorch, TensorFlow) is built primarily around CUDA.

Be precise about the AMD side, because this is where people waste a weekend. ROCm is AMD's compute stack and it is Linux only. It does not run on macOS at all, so on a Mac Pro it is not a fallback, it is a non-option. Similarly, PyTorch's MPS backend is shipped in the arm64 macOS builds for Apple silicon; on an Intel Mac Pro with AMD cards it is not the path. The route that does exist on this hardware is Apple's `tensorflow-metal` plugin, which registers the GPU as a TensorFlow PluggableDevice, and Core ML for inference.

For inference, the Mac Pro performs well. Apple has invested heavily in optimizing Core ML for their hardware, and many pre-trained models can be converted to Core ML format with `coremltools` and run efficiently on the Vega II GPUs. Under the hood, Core ML is dispatching to Metal Performance Shaders and MPSGraph, which are the same primitives you would call yourself.

## The NVIDIA gap

The elephant in the room is that most GPU compute workloads are optimized for NVIDIA CUDA. The Mac Pro does not support NVIDIA GPUs (Apple and NVIDIA parted ways years ago). This means the Mac Pro is excluded from the dominant GPU computing ecosystem.

The specifics: NVIDIA's last macOS web drivers targeted macOS 10.13 High Sierra, and CUDA 10.2 was the final release with any macOS support at all. There is no version of macOS on the 2019 Mac Pro that can load an NVIDIA driver. This is not a configuration problem with a workaround.

For specific Apple-optimized workloads (media processing, Core ML inference, Metal compute), the Mac Pro is excellent. For general-purpose GPU computing (CUDA-based ML training, scientific computing), an NVIDIA-equipped server is the better choice.

## What breaks

**Assuming 64 GB is one pool.** Two devices, 32 GB each. A model that needs 40 GB does not fit, Infinity Fabric Link or not. You have to shard it yourself, and most framework code will not do that for you.

**Building a pipeline for the wrong device.** Buffers, pipeline states, and command queues all belong to a specific `MTLDevice`. Pass a buffer from GPU A into a command encoder on GPU B and you get a crash, not a helpful message. If you enumerate devices, keep every object grouped by the device that created it.

**Reaching for OpenCL.** It is deprecated, it is unmaintained, and performance on modern macOS is not representative of what the hardware can do. Old OpenCL benchmarks of this machine are measuring a dead code path, not the GPU.

**Using `storageModePrivate` buffers and then trying to read them from the CPU.** Private buffers live only in GPU memory. `contents()` on one returns nothing useful. Use `.storageModeShared` while you are developing, then move hot buffers to private and blit results out with a `MTLBlitCommandEncoder` once it works.

**Forgetting `waitUntilCompleted()`.** Command buffers are asynchronous. Read the output buffer before the GPU has finished and you get whatever was there before, usually zeros, with no error at all. This is the single most common reason a correct kernel appears to do nothing.

## My use

I use the Mac Pro's GPUs primarily for video processing and as a learning platform for Metal compute programming. Writing kernels by hand has taught me more about how GPUs actually schedule work than any amount of calling into a framework did. For anything that needs CUDA, I run it on my Dell servers with passthrough GPUs or on cloud instances. The right tool for the right job.

## References

- https://developer.apple.com/documentation/metal
- https://developer.apple.com/documentation/metalperformanceshaders
- https://en.wikipedia.org/wiki/Metal_(API)
- https://en.wikipedia.org/wiki/High_Bandwidth_Memory
- https://en.wikipedia.org/wiki/Graphics_Core_Next
- https://en.wikipedia.org/wiki/CUDA
