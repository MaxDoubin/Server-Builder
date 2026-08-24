
## The gap between a metric and an answer

A dashboard tells me disk latency went up. It does not tell me which process, which file, or which syscall path. The classic way to close that gap is to add logging to the application, which means a code change, a deploy, and a guess about where to put the log line. eBPF closes it from the other direction: attach a probe to the kernel function that already knows the answer, and read it out on a running system with nothing recompiled.

The mental model I use: eBPF is a small virtual machine inside the kernel. You load a program written against a restricted instruction set, the kernel verifies it, attaches it to a hook, and runs it every time that hook fires. The program can read arguments, do arithmetic, and write results into a map. It cannot loop forever, cannot dereference a pointer without a bounds check, and cannot call arbitrary kernel functions. The verifier rejects anything it cannot prove terminates and stays in bounds. That is the whole reason this is allowed in production at all.

## What you can attach to

The hook types matter more than the language:

- **kprobes and kretprobes**: any exported kernel function, on entry or return. Powerful and unstable, because kernel function names change between versions.
- **tracepoints**: static instrumentation points the kernel maintainers commit to keeping. Fewer of them, but stable across upgrades. Prefer these.
- **uprobes**: user space functions in a binary or library. Useful for tracing a runtime you do not control.
- **USDT probes**: statically defined tracepoints compiled into user programs.
- **perf events**: sampling on a timer or a hardware counter, which is how profiling works.
- **XDP and tc**: packet processing at the driver and queueing layers.

For observability work, tracepoints plus perf events cover most of what I need.

## Starting with bpftrace one liners

Writing raw eBPF is C plus a verifier argument. bpftrace gives you an awk shaped language over the same machinery, and for ad hoc investigation it is what I reach for.

```bash
# Which processes are opening files, and what files
bpftrace -e 'tracepoint:syscalls:sys_enter_openat {
  printf("%-16s %s\n", comm, str(args->filename));
}'

# Histogram of block IO latency, in microseconds
bpftrace -e 'tracepoint:block:block_rq_issue { @start[args->dev, args->sector] = nsecs; }
  tracepoint:block:block_rq_complete /@start[args->dev, args->sector]/ {
    @usecs = hist((nsecs - @start[args->dev, args->sector]) / 1000);
    delete(@start[args->dev, args->sector]);
  }'

# Count TCP retransmits by process
bpftrace -e 'kprobe:tcp_retransmit_skb { @[comm] = count(); }'
```

The histogram one is the pattern worth internalizing. Store a timestamp in a map keyed by something that identifies the request, look it up on the completion event, subtract, and bucket the result. That shape answers "how long does X take" for almost any pair of start and end events in the kernel, and a log scale histogram tells you about the tail, which an average never will.

## A script that answers a real question

Here is one I keep around for the case where a service is slow and I do not know if it is blocking on disk or on the network. It counts time spent off CPU by reason, per process name:

```bash
#!/usr/bin/env bpftrace
// Off-CPU time per process, bucketed in microseconds
tracepoint:sched:sched_switch
{
  @off[args->prev_pid] = nsecs;
  if (@off[args->next_pid]) {
    @us[comm] = hist((nsecs - @off[args->next_pid]) / 1000);
    delete(@off[args->next_pid]);
  }
}

interval:s:30 { exit(); }
```

Run it for thirty seconds during the slowdown and you get a distribution per process. A pile of samples in the millisecond buckets is disk. A pile in the tens of milliseconds with network activity alongside is a remote call. A process that is barely off CPU at all is CPU bound, and you go profile it instead.

## The cost, and the honest limits

eBPF is cheap but not free. Every probe fire runs your program, so attaching to a high frequency function like `sys_enter_read` on a busy box adds real overhead. Aggregate in kernel with maps rather than printing per event, because pushing every event to user space through the ring buffer is what actually hurts. If you must print, filter hard in the predicate.

The limits worth knowing before you commit:

- You need root or `CAP_BPF` plus `CAP_PERFMON`. This is a privileged tool, and anyone who can load eBPF can read a lot.
- Kprobe based scripts break on kernel upgrades. CO-RE and BTF exist to fix portability for compiled programs, and your kernel needs BTF enabled for that to work.
- The verifier will reject programs for reasons that are correct but opaque. Reading the rejection log is a skill.
- Stack traces for interpreted or JIT runtimes need extra work to symbolize.

None of that changes the basic value. Before eBPF, answering "which process is causing these writes" meant either a kernel module you had to trust or a lot of inference from indirect metrics. Now it is a one liner, and the answer is the kernel's own data rather than my theory about it.

## References

- https://ebpf.io/
- https://docs.kernel.org/bpf/index.html
- https://man7.org/linux/man-pages/man2/bpf.2.html
- https://man7.org/linux/man-pages/man7/bpf-helpers.7.html
- https://docs.kernel.org/trace/tracepoints.html
