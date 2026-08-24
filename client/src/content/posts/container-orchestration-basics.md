
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

## The Right Tool

There is no universal answer to "containers or VMs." Both have their place. My rule of thumb: if it needs its own kernel or strong isolation, use a VM. If it is a Linux service that can share the host kernel, use a container. If it is a portable application packaged as a Docker image, use Docker.
