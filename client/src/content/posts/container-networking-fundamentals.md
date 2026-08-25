
## Network Namespaces

The foundation of container networking is Linux network namespaces. Each namespace has its own isolated network stack: its own interfaces, routing table, and firewall rules. A container runs inside a network namespace, giving it the appearance of a dedicated network.

When Docker starts a container, it creates a new network namespace and connects it to the host via a virtual Ethernet pair (veth). One end lives in the container namespace; the other lives in the host namespace and connects to a bridge.

## The Docker Bridge

By default, Docker creates a bridge called `docker0`. Every container on the default network connects to this bridge. The bridge performs NAT, translating between container IPs on the `172.17.0.0/16` range and the host's real IP address.

```bash
# See container networking
docker inspect container-name | grep -A 20 '"Networks"'

# View the host-side veth interfaces
ip link show type veth
```

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
