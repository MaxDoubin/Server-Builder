## A program that watches from outside

Most observability starts inside the application. A developer adds a log line, a counter, or a tracing library, and the service starts reporting on itself. That works for code a team owns. It does not work for a third-party binary or a service that was never instrumented.

Extended Berkeley Packet Filter (eBPF) approaches the problem from the other side. Instead of asking the application to describe itself, a small program is loaded into the Linux kernel and attached to a point that applications have to pass through: a system call, a network function, a scheduler event. The application is not modified and not restarted.

The ebpf.io project describes eBPF as a technology that can run sandboxed programs in a privileged context such as the operating system kernel, extending the kernel without changing kernel source code or loading kernel modules. The name is historical. BPF originally stood for Berkeley Packet Filter, and ebpf.io notes that the acronym no longer describes what the technology does, so eBPF is now treated as a standalone term.

This article is a companion to [the earlier introduction to eBPF tracing](/blog/ebpf-observability-basics), which covers bpftrace one-liners. This one stays with concepts: what the pieces are, what outside-in observation can see, and where it runs out.

## The four pieces: program, verifier, JIT, maps

### Programs and the bpf() system call

An eBPF program is a short piece of bytecode, typically produced by compiling source code with the clang/LLVM compiler. User space hands it to the kernel through the `bpf()` system call, which according to the bpf(2) manual page was added in Linux 3.18 and performs operations on eBPF maps and programs. Once loaded, the program is attached to a hook. Every time the hook fires, the kernel runs the program.

An eBPF program cannot call arbitrary kernel functions. It calls helper functions, a set of kernel-provided routines for tasks such as reading the current time, accessing a map, or fetching the current process identifier and command name.

### The verifier

Running outside code inside the kernel is normally a good way to crash a machine. The verifier is the reason eBPF is allowed to do it. The bpf(2) manual page puts it in one sentence: "An in-kernel verifier statically determines that the eBPF program terminates and is safe to execute."

The kernel's verifier documentation describes two steps: a structural check of the program's control flow, then a simulation that starts from the first instruction and descends all possible paths, tracking the state of registers and the stack.

ebpf.io lists the practical rules. The program must always run to completion, so a loop is accepted only if the verifier can confirm it will exit. The program must not use uninitialized variables or access memory out of bounds. It must fit within size limits and have finite complexity.

One limit matters for the security discussion later. ebpf.io states that the verifier is a safety tool and not a security tool that inspects what a program does. It does not judge whether a program's purpose is benign.

### Just-in-time compilation

After verification, a just-in-time (JIT) compiler translates the generic bytecode into native machine instructions. ebpf.io says this lets eBPF programs run as efficiently as natively compiled kernel code or code loaded as a kernel module.

The bpf(2) manual page documents the control, `/proc/sys/net/core/bpf_jit_enable`. It says the JIT was disabled by default before Linux 4.15, and that since 4.15 a kernel can be built with `CONFIG_BPF_JIT_ALWAYS_ON`, which keeps it permanently on.

### Maps

Maps are how data gets out of the kernel. The bpf(2) manual page describes maps as a generic data structure whose keys and values are binary blobs with sizes fixed when the map is created. eBPF programs and user space programs can both access a map, and several programs can share one.

ebpf.io lists hash tables, arrays, ring buffers, stack trace maps, and longest prefix match tables among the map types. In an observability agent, the in-kernel program counts or records events into a map, and a user space process reads the map and exports the result.

## Where programs attach

The attachment point decides what a program can see.

### Kprobes and kretprobes

A kernel probe, or kprobe, is a dynamic hook. The kernel's kprobes documentation says a kprobe can be inserted on virtually any instruction in the kernel, and a return probe (kretprobe) fires when a specified function returns. Together they give entry and exit for kernel functions.

The same document lists exceptions: some parts of the kernel cannot be probed, and a probe on a function the compiler inlined may not fire for every copy. The larger practical issue is portability: a kprobe names an internal kernel function, and the libbpf documentation lists lack of portability across kernel versions and configurations as a known limitation of eBPF programs.

### Tracepoints

A tracepoint is a static hook that kernel developers placed in the code on purpose. The kernel's tracepoint documentation describes it as a hook that calls a function (a probe) provided at runtime, and notes that a tracepoint that is off has no effect apart from a tiny time penalty and a small space cost. System call entry and exit are exposed this way, under names such as `sys_enter_openat` and `sys_exit_read`, which is how a tool can record file opens on a host without knowing anything about the processes making them.

### Uprobes

A user probe, or uprobe, is the user space counterpart of a kprobe. The kernel's uprobe tracer documentation specifies a probe as a path to an executable or library plus an offset inside it, with a return variant for function exit. A uprobe lets an eBPF program fire when a specific function in a specific binary or shared library is called.

### XDP and tc

Two attachment points sit on the network path. eXpress Data Path (XDP) runs, in the words of the Cilium BPF reference, at the earliest possible point in software, when the network driver has just received the packet and before the kernel has allocated its usual packet buffer structure. An XDP program returns a verdict such as `XDP_DROP`, `XDP_PASS`, `XDP_TX`, or `XDP_REDIRECT`. XDP attaches on ingress only.

The traffic control (tc) hook runs later, after that structure exists, and is available on both ingress and egress. On ingress it sits before the netfilter hooks described in [the netfilter hook order post](/blog/netfilter-hook-order). The Cilium reference presents the two as complementary: XDP is faster and sees a rawer packet, while tc sees both directions and works on any network device without driver changes.

The kernel's libbpf documentation lists further attachment types, including Linux Security Module (LSM) hooks, which return in the security section.

## What this makes visible without changing code

Put the pieces together and one privileged agent on a host can observe the processes on that host. The OpenTelemetry project calls this zero-code instrumentation. Its eBPF instrumentation documentation says the tool uses eBPF to inspect application executables and the operating system networking layer, and that all data capture occurs without any modifications to application code or configuration.

- **System calls.** File opens, reads, and writes cross the system call boundary, and tracepoints exist for entry and exit.
- **Network activity.** Kprobes on the kernel's networking functions, plus XDP and tc programs, see connections and packets.
- **Function entry and exit.** Kprobes cover kernel functions. Uprobes cover functions in user space binaries and libraries. Recording a timestamp at entry and subtracting it at exit gives a duration.
- **Who did it.** Helpers return the current process identifier and command name, and ebpf.io lists process and cgroup context among the helper categories, so an event can be tied to a process or a control group.

None of this requires the observed service to cooperate.

## What it cannot see

Outside-in observation has a hard boundary. It sees what crosses an interface it can hook, in the form the data has at that interface.

### Encrypted payloads

Transport Layer Security (TLS) encryption normally happens inside the application process, in a library. By the time data reaches a `write` system call or a network hook, it is ciphertext. A kernel-side program can still see that a connection exists, where it goes, and how many bytes moved. It cannot read the request inside. The background on the protocol is in [the post on modern TLS](/blog/tls-modern-encryption).

The workaround is a uprobe on the TLS library itself. The `sslsniff` tool in the BPF Compiler Collection (BCC) project is a well-known example. Its documentation says it traces the write/send and read/recv functions of OpenSSL, GnuTLS, and NSS, three TLS libraries, and that data passed to these functions is printed as plain text. The probe sits where the application hands plaintext to the library before encryption, or receives it back after decryption.

Two consequences follow. First, the trick depends on the application using a library the tool knows how to probe. A program that carries its own TLS implementation is not covered by probes placed on a different library. Second, anyone with enough privilege to attach uprobes on a host can read the plaintext of TLS sessions that pass through those libraries on that host. Encryption in transit protects data on the network, not from the kernel of the machine doing the encrypting.

### Business context and custom attributes

An eBPF program sees bytes, function arguments, and kernel data structures. It does not know what they mean to the business. It can report that a request took 400 milliseconds. It cannot report that the request belonged to a particular customer tier or was part of a checkout flow, unless that information happens to be readable at something it can hook.

Custom attributes are the clearest case. When a developer attaches an order number to a span (one timed unit of work in a trace), that is knowledge only the application has. The same applies to events that never cross a hookable boundary, such as a decision made in memory.

The OpenTelemetry documentation is direct about this. It says its eBPF instrumentation does not replace language-level instrumentation in every case, and recommends language agents or manual instrumentation for custom spans, application-specific attributes, business events, and in-process telemetry. The two approaches answer different questions: eBPF gives broad coverage of system-level behavior, and application instrumentation supplies meaning.

## Kernel version and portability

eBPF did not arrive in one release. The dates in the manual pages show the spread: the `bpf()` call in Linux 3.18, limited unprivileged use in 4.4, the always-on JIT option in 4.15, and dedicated capabilities in 5.8. What a tool can do depends on the kernel it runs on. As one real example, the OpenTelemetry eBPF instrumentation requires Linux kernel 5.8 or later, with an exception for some enterprise kernels that carry backports.

Portability is the second problem. The libbpf documentation explains that eBPF programs read kernel data structures, and the layout of those structures changes between kernel versions. The older answer, used by BCC, was to compile on the target machine, which the libbpf documentation says brings runtime overhead and a large binary because the compiler is embedded with the application.

The current answer is Compile Once, Run Everywhere (CO-RE). It relies on BPF Type Format (BTF), which the kernel documentation describes as the metadata format that encodes debug information for eBPF programs and maps. A kernel built with BTF exposes a description of its own types at `/sys/kernel/btf/vmlinux`, and libbpf uses it to adjust field offsets when a program is loaded. A read-only check:

```bash
uname -r
ls -l /sys/kernel/btf/vmlinux
```

If that file is missing, tools that depend on CO-RE do not have the kernel type information they expect.

## Overhead

eBPF has a reputation for being cheap, and ebpf.io describes it as low overhead. Low is not zero, and the cost scales with how often the hook fires.

The kernel's kprobes documentation gives reference figures: on a typical processor from 2005, a kprobe hit takes about 0.5 to 1.0 microseconds, a return probe hit typically takes 50 to 75 percent longer, and an optimized kprobe typically takes 0.07 to 0.1 microseconds. Those numbers are old and hardware specific, but the reasoning holds. A fraction of a microsecond on a function called a hundred times a second is negligible. The same cost on a function called a million times a second adds up to a measurable share of a processor core.

The useful habit is to think of cost as per-event cost multiplied by event rate.

## The security angle

### Who is allowed to load programs

Loading eBPF programs is a privileged operation, and the model has changed over time. The bpf(2) manual page says that before Linux 4.4, every `bpf()` command required the `CAP_SYS_ADMIN` capability. Since 4.4, an unprivileged user may create limited programs of the socket filter type and associated maps, with a restricted set of helpers.

Linux 5.8 split the privilege. The capabilities(7) manual page says `CAP_BPF` was added "to separate out BPF functionality from the overloaded CAP_SYS_ADMIN capability", and `CAP_PERFMON` was added in the same release for performance monitoring. The comments in the kernel's capability header describe how they combine: loading tracing programs requires `CAP_PERFMON` and `CAP_BPF`, and loading networking programs requires `CAP_NET_ADMIN` and `CAP_BPF`. `CAP_SYS_ADMIN` is still required for some operations, including the `bpf_probe_write_user` helper and listing every program loaded on the system.

So a tracing agent can run with `CAP_BPF` plus `CAP_PERFMON` instead of full root. That is still a great deal of access. The same header notes that `CAP_PERFMON` lets a program read arbitrary kernel memory through the probe read helper.

### The unprivileged eBPF switch

The kernel documents a sysctl (a kernel setting adjustable at runtime), `kernel.unprivileged_bpf_disabled`, that controls whether a process without `CAP_SYS_ADMIN` or `CAP_BPF` may call `bpf()` at all.

| Value | Meaning in the kernel documentation |
| --- | --- |
| 0 | Unprivileged calls to `bpf()` are enabled |
| 1 | Unprivileged calls are disabled, and this cannot be cleared on the running kernel |
| 2 | Unprivileged calls are disabled, but an administrator can change the setting later |

The documentation adds that if the kernel was built with `BPF_UNPRIV_DEFAULT_OFF`, the entry defaults to 2 instead of 0. Reading the current value changes nothing:

```bash
sysctl kernel.unprivileged_bpf_disabled
```

### The same tool for both sides

The properties that make eBPF good for observability make it useful to an attacker who already has root. A uprobe on a TLS library exposes plaintext. The bpf-helpers(7) manual page documents `bpf_probe_write_user`, which writes into the memory of a user space process, with a warning that it is meant for experiments and risks crashing the system and running programs. The verifier does not stop this, because it checks safety and not intent.

That helper leaves a trace. The manual page says that when a program using it is attached, a warning including the process identifier and process name is printed to the kernel logs. Elastic publishes a detection rule built on exactly that log message, and its description says unauthorized use of the helper can be indicative of an eBPF rootkit (malware that hides its own presence on a system) or other malicious activity, while noting that legitimate tools can trigger it too.

Defenders use the same hooks for more than detection. ebpf.io lists security observability and runtime security enforcement among the main uses of eBPF. The kernel documentation describes LSM eBPF programs as a way for privileged users to instrument the kernel's security hooks at runtime and implement system-wide Mandatory Access Control (MAC) and audit policies.

The defensive takeaways are short. Treat `CAP_BPF`, `CAP_PERFMON`, and `CAP_SYS_ADMIN` as high-value privileges and know which workloads hold them. Keep unprivileged eBPF off unless there is a specific reason. And know what is loaded. The `bpftool` documentation says this command lists all programs currently loaded on the system:

```bash
sudo bpftool prog show
```

## Summary

eBPF gives visibility into system calls, network activity, and function timing with no change to the observed processes. The boundary is meaning. Encrypted payloads are opaque unless a uprobe is placed on the TLS library, and business context, custom attributes, and in-process decisions are invisible because they never cross a hook. The approach also needs a recent enough kernel, BTF for portable tools, and capabilities powerful enough to deserve the same care as root.

## Sources

- https://ebpf.io/what-is-ebpf/
- https://man7.org/linux/man-pages/man2/bpf.2.html
- https://man7.org/linux/man-pages/man7/capabilities.7.html
- https://man7.org/linux/man-pages/man7/bpf-helpers.7.html
- https://docs.kernel.org/admin-guide/sysctl/kernel.html
- https://docs.kernel.org/bpf/verifier.html
- https://docs.kernel.org/trace/kprobes.html
- https://docs.kernel.org/trace/tracepoints.html
- https://docs.kernel.org/trace/events.html
- https://docs.kernel.org/trace/uprobetracer.html
- https://docs.kernel.org/bpf/libbpf/program_types.html
- https://docs.kernel.org/bpf/libbpf/libbpf_overview.html
- https://docs.kernel.org/bpf/btf.html
- https://docs.kernel.org/bpf/prog_lsm.html
- https://github.com/torvalds/linux/blob/master/include/uapi/linux/capability.h
- https://github.com/torvalds/linux/blob/master/tools/bpf/bpftool/Documentation/bpftool-prog.rst
- https://docs.cilium.io/en/stable/reference-guides/bpf/progtypes/
- https://github.com/iovisor/bcc/blob/master/tools/sslsniff_example.txt
- https://opentelemetry.io/docs/zero-code/obi/
- https://www.elastic.co/docs/reference/security/prebuilt-rules/rules/linux/persistence_bpf_probe_write_user