
## Network Namespaces

The foundation of container networking is Linux network namespaces. Each namespace has its own isolated network stack: its own interfaces, routing table, and firewall rules. A container runs inside a network namespace, giving it the appearance of a dedicated network.

When Docker starts a container, it creates a new network namespace and connects it to the host via a virtual Ethernet pair (veth). One end lives in the container namespace; the other lives in the host namespace and connects to a bridge.

A veth pair is a wire, not a switch. Whatever goes in one end comes out the other, and if one end goes down the other immediately reports NO-CARRIER. That is why a container's `eth0` shows as down the instant the host-side peer is deleted, and why `ip link show type veth` on the host prints entries like `veth9f2a1c@if12`: the `@if12` suffix is the interface index of the peer inside the container.

The detail that trips up almost everyone the first time: `ip netns list` shows nothing for Docker containers. That command only lists namespaces that have a bind mount under `/var/run/netns`, and Docker does not create one. The namespace is real, it just is not named. You reach it through the container's PID instead:

```bash
# Find the PID, then enter its network namespace
pid=$(docker inspect -f '{{.State.Pid}}' container-name)
sudo nsenter -t "$pid" -n ip addr
sudo nsenter -t "$pid" -n ss -tlnp
```

That single trick solves most "the container cannot reach anything" problems, because you can now run `ip route`, `ss`, and `tcpdump` from inside the container's stack without needing those tools installed in the image.

## The Docker Bridge

By default, Docker creates a bridge called `docker0`. Every container on the default network connects to this bridge. The bridge performs NAT, translating between container IPs on the `172.17.0.0/16` range and the host's real IP address.

```bash
# See container networking
docker inspect container-name | grep -A 20 '"Networks"'

# View the host-side veth interfaces
ip link show type veth
```

The NAT is a single `MASQUERADE` rule in the `nat` table's `POSTROUTING` chain covering `172.17.0.0/16`. Published ports (`-p 8080:80`) add `DNAT` rules in `PREROUTING`. This is where the most expensive beginner mistake in container networking lives: **Docker's published ports bypass `ufw` and any rules you wrote in the `INPUT` chain.** DNAT happens in `PREROUTING`, before the routing decision, so the packet is destined for the container and traverses `FORWARD`, never `INPUT`. People bind a database to `-p 5432:5432`, confirm `ufw status` says "deny incoming", and put an unauthenticated Postgres on the public internet. The fix is either to bind to a specific address (`-p 127.0.0.1:5432:5432`) or to write rules in the `DOCKER-USER` chain, which Docker guarantees is traversed before its own generated rules and never flushed on daemon restart.

The second common surprise is address space. Docker's default address pool is `172.17.0.0/12` carved into `/16` blocks, so `docker0` gets `172.17.0.0/16` and each user-defined network takes the next free `/16`: `172.18.0.0/16`, `172.19.0.0/16`, and so on. If your corporate VPN or another lab subnet also lives in `172.16.0.0/12`, containers will silently blackhole traffic to it, because the more specific container route wins. Override it in `/etc/docker/daemon.json` with `default-address-pools` before you have twenty containers running.

Use user-defined bridges rather than the default one. Only user-defined networks get Docker's embedded DNS resolver at `127.0.0.11`, which resolves container names to IPs. On the default `docker0` bridge there is no name resolution at all, and the old `--link` flag that used to paper over this is deprecated.

## Kubernetes Networking Model

Kubernetes has three networking requirements:
1. All pods on a node can communicate with all other pods without NAT
2. All nodes can communicate with all pods without NAT
3. The IP a pod sees for itself is the same IP other pods see for it

This means no NAT between pods. Every pod gets a real routable IP. The Container Network Interface (CNI) plugins (Calico, Flannel, Cilium) implement this model.

The practical consequence is that Kubernetes needs a lot of IP addresses. `kube-controller-manager` hands each node a slice of the cluster CIDR, and the default `--node-cidr-mask-size` for IPv4 is 24, so every node gets a `/24` with 254 usable pod addresses. The kubelet's default `maxPods` is 110, which is deliberately under 254 so a node cannot exhaust its own block. A `/16` cluster CIDR therefore caps you at 256 nodes, not 65,536 pods. Plan the CIDR at install time, because changing it later means rebuilding the cluster.

CNI itself is deliberately tiny: plugins are just executables in `/opt/cni/bin` driven by JSON configs in `/etc/cni/net.d`. When you see nodes stuck `NotReady` with `network plugin is not ready: cni config uninitialized` and every pod frozen in `ContainerCreating`, that directory is empty or the plugin binary is missing. It is not a Kubernetes bug, it is a missing file.

## How Calico Works

Calico uses BGP to distribute pod routes across nodes. Each node peers with a route reflector (or directly with other nodes) and advertises the pod CIDR it is responsible for. Packets between pods on different nodes follow the BGP-learned routes, flowing directly without encapsulation.

This makes Calico extremely performant and easy to troubleshoot because the routing is standard IP routing.

BGP here is ordinary BGP-4 as specified in RFC 4271, speaking TCP on port 179, and Calico defaults to private AS number 64512. Out of the box it configures a full node-to-node mesh, which means every node peers with every other node. That is `n * (n - 1) / 2` sessions, so 50 nodes is 1,225 TCP sessions. The mesh is fine for a lab and starts to hurt somewhere around 100 nodes, which is when you disable it and point everything at a pair of route reflectors.

The honest limitation: unencapsulated BGP routing only works if the underlay will actually forward packets addressed to your pod CIDR. On a flat L2 lab network it works beautifully. Across a router that does not know about the pod CIDR, or on AWS and Azure where the fabric drops frames whose source IP is not a registered instance address, packets vanish. Calico's answer is `ipipMode` or `vxlanMode` set to `CrossSubnet`, which keeps native routing inside a subnet and encapsulates only when crossing one.

Encapsulation is also the number one source of the weirdest failure in container networking: **small requests work, large ones hang.** SSH connects and then freezes at the banner. `curl` returns headers and stalls. That is an MTU mismatch. VXLAN adds 50 bytes of overhead, IP-in-IP adds 20, and WireGuard adds 60, so on a 1500 byte underlay the pod MTU must be 1450, 1480, or 1440 respectively. If the pod MTU is left at 1500 and the intermediate ICMP "fragmentation needed" messages are filtered, Path MTU Discovery never completes and every packet over the limit is silently dropped. Test it directly with `ping -M do -s 1472` and walk the size down until it succeeds.

## Service Networking

Kubernetes Services provide stable IP addresses for groups of pods. Service IPs are virtual. When a pod sends to a service IP, kube-proxy (or eBPF with Cilium) intercepts the packet using iptables or BPF rules and rewrites the destination to one of the backing pod IPs.

Understanding this rewrite is key to debugging connectivity problems in Kubernetes.

A ClusterIP is not assigned to any interface anywhere. It exists only as a match in a DNAT rule. So `ping 10.96.0.1` fails, and that failure means nothing: ICMP has no port, there is no rule to match it, and the packet is dropped. Beginners see the failed ping and start rebuilding the CNI. Test a Service with `curl` against its actual port instead. The default Service CIDR for a kubeadm cluster is `10.96.0.0/12`, and it must not overlap the pod CIDR or the node network.

kube-proxy's default `iptables` mode writes one chain per Service plus one per endpoint, and load balancing is a chain of statistically weighted jumps. Rule evaluation and, more importantly, full-table resync are roughly linear in the number of Services, so clusters with several thousand Services see multi-second sync times and slow endpoint convergence. IPVS mode replaces the linear chain with a hash table and stays flat as the Service count grows; the newer `nftables` mode does the same with maps. If your cluster is small, iptables mode is simpler and easier to read with `iptables-save -t nat | grep <service-name>`.

The other thing that quietly breaks Services is connection tracking. Every DNAT'd flow occupies a `nf_conntrack` entry. When the table fills you get `nf_conntrack: table full, dropping packet` in `dmesg` and apparently random connection resets across the whole node. Check `/proc/sys/net/netfilter/nf_conntrack_count` against `nf_conntrack_max` before blaming the application.

Finally, know what this model does not give you. The pod network is flat and, by default, completely open: any pod can reach any other pod in any namespace. NetworkPolicy is the fix, but NetworkPolicy is enforced by the CNI plugin, not by Kubernetes. Flannel implements no policy at all, so applying a NetworkPolicy on a Flannel cluster succeeds, reports no error, and does absolutely nothing. Calico and Cilium enforce it. Confirm your plugin supports policy before you rely on it for isolation.

## References

- https://man7.org/linux/man-pages/man7/network_namespaces.7.html
- https://man7.org/linux/man-pages/man4/veth.4.html
- https://docs.docker.com/engine/network/drivers/bridge/
- https://kubernetes.io/docs/concepts/cluster-administration/networking/
- https://kubernetes.io/docs/reference/networking/virtual-ips/
- https://www.rfc-editor.org/rfc/rfc4271
