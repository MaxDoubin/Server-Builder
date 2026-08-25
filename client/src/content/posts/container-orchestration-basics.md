
## Containers vs VMs

Virtual machines emulate complete hardware. Each VM runs its own kernel, its own OS, and its own set of services. This provides strong isolation but consumes more resources because every VM needs its own copy of the operating system.

Containers share the host's kernel and only package the application and its dependencies. This makes them lighter, faster to start, and more resource-efficient. The tradeoff is weaker isolation compared to VMs.

The mechanism underneath is worth knowing, because every limit you will hit follows from it. A container is not a thing the kernel has a data structure for. It is a normal process that has been placed into a set of namespaces (mount, PID, network, UTS, IPC, user, cgroup) and constrained by a cgroup. Namespaces control what the process can *see*; cgroups control how much it can *use*. That is the whole trick. Because there is no second kernel, startup is a fork and an exec, which is why an LXC container is usable in about a second while a VM spends 20 to 60 seconds on firmware, bootloader, and init.

## When I Use VMs

VMs are my choice for anything that needs strong isolation, runs a different OS, or represents a "server" in my mental model. My Windows Server domain controllers, my pfSense firewall test instances, and my Linux servers all run as full VMs.

VMs are also better for long-running services that need to survive host reboots and migrations. Proxmox's VM management (snapshots, backups, live migration) is mature and reliable.

There is one hard capability difference that settles a lot of arguments: **Proxmox can live-migrate a VM, but it cannot live-migrate an LXC container.** Moving a container between cluster nodes is a restart migration: Proxmox stops it, transfers the rootfs, and starts it on the other node. If a service must survive a host going into maintenance without dropping a single connection, it has to be a VM. This is not a Proxmox shortcoming, it is a consequence of the container's processes being bound to a running kernel that cannot be checkpointed and resumed elsewhere.

The security boundary is the other reason. A container escape is a kernel exploit away from being a host compromise, because the container and the host are the same kernel. A VM adds a second boundary at the hypervisor. VM escapes exist, but they are dramatically rarer. Anything that runs code I did not write, or that is exposed to the internet, goes in a VM.

## When I Use Containers

Containers (specifically LXC containers on Proxmox) are my choice for lightweight services that run on Linux and do not need strong isolation from the host. DNS servers, monitoring agents, small web services, and development environments all run in LXC containers.

An LXC container uses a fraction of the resources of a VM. A container running Pi-hole (DNS filtering) uses about 50 MB of RAM and negligible CPU. A VM running the same service would use 512 MB minimum just for the OS overhead.

Run them unprivileged. Proxmox defaults to unprivileged containers, which map container UID 0 to host UID 100000 and give the container a 65,536-ID range from 100000 to 165535. Container root is therefore an unprivileged user on the host, and a breakout lands on a nobody account rather than on root.

That UID shift is the number one thing beginners get wrong, and it always shows up the same way. You bind-mount `/tank/media` from the host into the container, `chown -R root:root` it inside, and the host now shows those files owned by UID 100000. Or you mount an existing host directory owned by root and the container cannot write to it at all, with no useful error beyond permission denied. The fix is either to `chown 100000:100000` the directory on the host, or to add an explicit `lxc.idmap` block to the container config so a specific host UID maps straight through. Pick one convention and stick to it across the whole lab.

A short list of what an unprivileged LXC container simply cannot do, so you stop fighting it:

- Load kernel modules. There is one kernel and it belongs to the host.
- Mount NFS or CIFS from inside. Mount it on the host and bind-mount it in, or set the `mount=nfs` feature flag on a privileged container and accept the weaker isolation.
- Run a different kernel version. If your app needs a kernel feature the Proxmox host does not have, that is a VM.
- Run a non-Linux OS. No Windows, no BSD, ever.

Two failure modes to recognize on sight. First, a container that starts and immediately stops with nothing useful in the log is usually an old template on a cgroup v2 host: Proxmox 7 and later default to the unified cgroup hierarchy, and distributions shipping systemd older than version 232 (CentOS 7, Ubuntu 16.04) cannot boot under it. Second, a container that "crashes" while the container itself stays running is the cgroup OOM killer. Exceeding the memory limit does not stop the container, it kills the largest process inside it, so you see your application vanish while `pct status` still says running. Check `dmesg` on the **host**, not inside the container, because that is where the OOM message lands.

Note also that a container sees host values for some things unless lxcfs is intercepting them. Proxmox ships lxcfs, so `free` and `nproc` reflect the container's limits, but load average and much of `/proc` still reflect the whole host. Monitoring agents that read `/proc` directly will report the host's numbers from inside a container and quietly lie to your dashboards.

## Docker

Docker containers are different from LXC. Docker is designed for packaging and distributing applications, with a focus on immutable images and declarative configuration. I run Docker inside VMs when I need Docker-specific tooling, but for most homelab services, LXC containers are simpler and lighter.

```yaml
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
```

One note on that file: the `version` key is a leftover from Compose V1 and the current Compose Specification ignores it. Docker Compose V2 will print "the attribute `version` is obsolete" and carry on. New files can drop the line entirely.

The mental model difference is that an LXC container is a machine you maintain and a Docker container is a process you replace. LXC containers have an init system, get patched with `apt upgrade`, and accumulate state. Docker images are immutable layers on an overlay filesystem; you do not patch a running container, you build a new image and recreate it. Anything you write inside a Docker container that is not on a named volume or bind mount is gone the moment the container is recreated, and losing a database that way is a rite of passage.

Running Docker *inside* an unprivileged LXC container is the most popular bad idea in the Proxmox community. It can be made to work with the `nesting=1` and `keyctl=1` features, but Docker's overlay2 storage driver does not work on a ZFS-backed unprivileged container, so it silently falls back to the `vfs` driver. `vfs` makes a full copy of every layer instead of stacking them, so a 400 MB image becomes several gigabytes on disk and image pulls crawl. If you want Docker on Proxmox, put it in a VM.

## When You Actually Need an Orchestrator

Docker Compose on a single host handles restart policies, dependency ordering, healthchecks, and a private network between services. That covers a homelab completely. You need a real orchestrator (Kubernetes, Nomad, Docker Swarm) when you need something Compose structurally cannot do: reschedule a workload onto a different host when one dies, roll out a new version without downtime, or scale a service horizontally based on load. Those three things are the entire value proposition.

The cost is honest and large. A single-node Kubernetes cluster running the same Grafana adds an API server, etcd, a scheduler, a controller manager, a CNI plugin, and a kubelet, which is on the order of a gigabyte of RAM and a permanent maintenance obligation before your workload starts. If you cannot name which of the three capabilities above you need, you do not need it yet. Learning Kubernetes is a perfectly good reason to run it, but call that what it is rather than pretending it is the right architecture for four containers on one box.

## The Right Tool

There is no universal answer to "containers or VMs." Both have their place. My rule of thumb: if it needs its own kernel or strong isolation, use a VM. If it is a Linux service that can share the host kernel, use a container. If it is a portable application packaged as a Docker image, use Docker.

Written as a decision sequence: does it need a non-Linux OS, a different kernel, or live migration? VM. Is it hostile, untrusted, or internet-facing? VM. Is it a stateful Linux service you will maintain over years, like a DNS server or a monitoring collector? Unprivileged LXC. Is it something upstream already publishes as an image and you intend to replace rather than patch? Docker, inside a VM.

## References

- https://linuxcontainers.org/lxc/introduction/
- https://pve.proxmox.com/pve-docs/chapter-pct.html
- https://man7.org/linux/man-pages/man7/namespaces.7.html
- https://man7.org/linux/man-pages/man7/cgroups.7.html
- https://man7.org/linux/man-pages/man7/user_namespaces.7.html
- https://docs.docker.com/reference/compose-file/
