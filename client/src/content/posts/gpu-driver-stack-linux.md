
## Four layers, all of which must agree

When a framework fails to see an accelerator, people debug it as an AI problem. It is almost never an AI problem. It is a stack problem, and the stack has four layers:

1. **The kernel driver.** A module loaded into the running kernel that owns the PCIe device, maps its registers, and exposes device nodes under `/dev`.
2. **The userspace driver library.** The shared object your process links against, which turns API calls into ioctls on those device nodes. It must match the kernel module closely, often exactly.
3. **The compute runtime and math libraries.** The toolkit layer that provides kernels for linear algebra, convolution, and collective operations.
4. **The framework.** PyTorch, or whatever is above it, compiled against a specific runtime version.

Every one of those can be installed by a different mechanism: the kernel module by DKMS or a distro package, the userspace library by the same vendor package, the runtime by a toolkit installer or a container image, and the framework by pip. Four package managers, four upgrade cadences, one requirement that they all line up. That is the entire failure mode.

## Read the stack from the bottom

When something is broken, I check in order, because a failure at any layer makes everything above it lie.

```bash
# 1. Is the device on the bus at all?
lspci -nn | grep -Ei '3d|vga|accel'

# 2. Is a kernel module bound to it?
lspci -k -s 01:00.0
lsmod | grep -E 'nvidia|amdgpu|nouveau'

# 3. Do the device nodes exist, and can this user open them?
ls -l /dev/nvidia* /dev/dri/ 2>/dev/null

# 4. Does the userspace library agree with the module?
cat /proc/driver/nvidia/version 2>/dev/null
nvidia-smi

# 5. Does the framework see it?
python3 -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"
```

The classic signature is step 4 failing with a message about the driver and library being mismatched. That means the kernel module in memory is from a different release than the `.so` your process just loaded, which happens constantly: you upgrade the driver package, the new module is on disk, but the old one is still running because nothing reloaded it. A reboot fixes it, and so does unloading and reloading the module if nothing has the device open.

Step 2 failing with a different module bound is the other classic. The open source `nouveau` driver claiming the card means the vendor module did not load, usually because Secure Boot rejected an unsigned out of tree module. `dmesg | grep -i taint` and a look at `mokutil --sb-state` will tell you. Either sign the module against a machine owner key or turn Secure Boot off, and be deliberate about which tradeoff you are making.

## Containers make it worse and then better

A container has its own userspace but shares the host kernel. So the kernel module is always the host's, and the userspace library inside the image must match that host module. Build an image with one driver library, run it on a host with an older kernel module, and it breaks in exactly the mismatch above.

The container runtime integrations exist to solve this by injecting the host's driver libraries and device nodes into the container at start time, rather than baking them into the image. That is why the image ships the toolkit and framework but not the driver.

```bash
# Device nodes and host driver libraries injected by the runtime
docker run --rm --gpus all my-inference-image nvidia-smi

# The equivalent shape in a compose file
services:
  inference:
    image: my-inference-image
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

The rule that falls out: pin the toolkit and framework in your image, do not pin the driver, and treat the host driver version as a floor that the image requires rather than something the image controls. Write that floor down in the image documentation. Otherwise the first host that has not been updated becomes a mystery.

## What to record so the next failure is boring

I keep a tiny script that dumps the whole stack into one text blob and stores it with the deployment record. When a node misbehaves, comparing that blob against a working node finds the difference in seconds.

```bash
#!/usr/bin/env bash
set -u
{
  echo "== host =="; uname -r; cat /etc/os-release | head -2
  echo "== pci =="; lspci -nnk | grep -A3 -Ei '3d|vga|accel'
  echo "== modules =="; lsmod | grep -E 'nvidia|amdgpu|drm'
  echo "== driver =="; nvidia-smi --query-gpu=name,driver_version,memory.total \
      --format=csv,noheader 2>/dev/null || echo "no vendor tool"
  echo "== python =="; python3 - <<'PY'
import importlib
for mod in ("torch", "transformers"):
    try:
        m = importlib.import_module(mod)
        print(mod, getattr(m, "__version__", "?"))
    except Exception as e:
        print(mod, "MISSING", e)
PY
} > "/var/log/accel-stack-$(hostname)-$(date +%F).txt"
```

Two habits go with it. Upgrade the driver and reboot as one operation, never as two separate maintenance windows, because a loaded old module with new libraries on disk is a landmine waiting for the next process start. And keep the framework version in the same lockfile as the rest of the application, so the layer you change most often is the layer under version control.

None of this is glamorous. It is the same discipline as any other dependency management, applied to a dependency chain that happens to cross the kernel boundary. But knowing the four layers and the order to check them turns a whole category of confusing failures into a two minute diagnosis.

## References

- https://docs.kernel.org/gpu/index.html
- https://www.kernel.org/doc/html/latest/gpu/drm-uapi.html
- https://dri.freedesktop.org/wiki/
- https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html
- https://pytorch.org/docs/stable/notes/cuda.html
- https://en.wikipedia.org/wiki/Direct_Rendering_Manager
