
## What High Availability Clustering Does

A high availability cluster monitors services and nodes. When a service crashes or a node fails, the cluster automatically restarts the service or moves it to another node. The goal is minimizing downtime without manual intervention.

Be clear about what that buys you. A cluster reduces the time a service is down after a failure; it does not reduce how often failures happen, and it adds a new class of failure of its own. A two node Pacemaker cluster configured badly is genuinely less available than one well-monitored server, because now a Corosync hiccup can take down a service that was working fine. Build the cluster because you have measured that a few minutes of manual failover is unacceptable, not because clustering sounds more professional.

## The Stack

- **Corosync:** Handles cluster communication, membership, and quorum. Nodes use Corosync to know who is alive in the cluster.
- **Pacemaker:** The cluster resource manager. It decides what to do when failures are detected. Start this service on that node, move this IP address to another node.

Corosync passes a token around the ring on UDP port 5405 by default. The `token` timeout defaults to 3000 milliseconds, and `consensus`, the time allowed to reach agreement on a new membership, defaults to 3600 milliseconds. Those two numbers set your floor for failure detection: a node that stops answering is not declared dead for at least three seconds, and the resource move happens after that.

This is why Corosync is latency sensitive and why you do not run it across a WAN. A link with 200 ms of jitter will produce spurious token losses, spurious membership changes, and resources bouncing between nodes for no reason. If your cluster "randomly" fails over at night, look at the switch, the NIC, and anything doing bulk backup traffic on the same link before you look at the application. Corosync with knet supports multiple links, so give it a dedicated interface or at least a second one for redundancy.

## Installation (RHEL/Rocky Linux)

```bash
dnf install pacemaker corosync pcs
systemctl enable pcsd
passwd hacluster  # Set the hacluster user password
```

`pcsd` listens on TCP 2224 and is how `pcs` on one node talks to the others. The `hacluster` password must be identical on every node, and it is not the same thing as the cluster password prompt you will see later. On RHEL family systems, `firewall-cmd --permanent --add-service=high-availability` opens the whole set at once: 2224/tcp for pcsd, 3121/tcp for Pacemaker Remote, 5403/tcp for the quorum device, 5404 and 5405/udp for Corosync, and 21064/tcp for DLM. Forgetting the firewall produces a cluster where `pcs host auth` succeeds and `pcs cluster start` hangs.

## Creating a Cluster

```bash
# On all nodes, authenticate
pcs host auth node1 node2

# Create the cluster from node1
pcs cluster setup ha-cluster node1 node2
pcs cluster start --all
pcs cluster enable --all
```

`pcs host auth` is the pcs 0.10 syntax used on RHEL 8 and later. Older guides written for RHEL 7 use `pcs cluster auth` and `pcs cluster setup --name ha-cluster node1 node2`. Copying a RHEL 7 tutorial onto a RHEL 9 box gives you `Error: Unknown command` and nothing more helpful, so check which pcs you have with `pcs --version` before you follow anything.

Two nodes is the case that needs special handling. Quorum in Corosync's votequorum is a simple majority: 50 percent of the votes plus one. With two nodes and one vote each, quorum is two, so losing either node means the survivor is inquorate and stops all resources. That is the opposite of what you wanted. `pcs cluster setup` writes `two_node: 1` into `corosync.conf` for you, which artificially sets quorum to 1 and automatically enables `wait_for_all` so a cold-booted cluster waits until it has seen both nodes at least once before starting anything.

`two_node: 1` makes fencing mandatory rather than optional. Both nodes can now be quorate alone, so a network partition leaves two nodes each convinced they own the floating IP and the shared filesystem. The clean alternative is a third vote: either a real third node, or `corosync-qdevice` talking to a `corosync-qnetd` arbiter running on any small always-on machine. Odd node counts (3, 5) avoid the whole problem.

## Configuring Resources

```bash
# Create a floating IP resource
pcs resource create virtual-ip IPaddr2 ip=192.168.1.100   cidr_netmask=24 op monitor interval=30s

# Create a service resource
pcs resource create nginx systemd:nginx   op monitor interval=30s

# Create a resource group (starts in order, stops in reverse)
pcs resource group add web-group virtual-ip nginx
```

`IPaddr2` does more than assign an address. After it brings the IP up on the new node it sends gratuitous ARP so switches and neighbours update their ARP caches to the new MAC. RFC 5227 covers the address conflict detection and announcement mechanics this relies on. When a failover "works" according to `pcs status` but clients keep hitting the dead node, you are almost always looking at a stale ARP entry or a switch that filtered the gratuitous ARP.

Three defaults cause most of the confusing behaviour after a first cluster is running:

- The default operation timeout is 20 seconds. An `op monitor interval=30s` on a service whose status check occasionally takes 25 seconds will be recorded as a monitor failure, and Pacemaker will restart a perfectly healthy service. Set the timeout explicitly: `op monitor interval=30s timeout=60s`.
- `resource-stickiness` defaults to 0, so when a failed node comes back the cluster may move resources back to it immediately, causing a second outage you did not ask for. Set `pcs resource defaults update resource-stickiness=100` unless you have a reason to want automatic failback.
- `start-failure-is-fatal` defaults to `true`. One failed start pins the failcount to infinity and the resource will not be tried on that node again until you run `pcs resource cleanup <resource>`. This is why a resource sometimes refuses to start on a node that is obviously healthy now.

Groups are a shortcut for two constraints at once: colocation (everything in the group runs on the same node) and ordering (start in listed order, stop in reverse). If you only want ordering without colocation, write the constraints directly with `pcs constraint order` and `pcs constraint colocation`, because a group gives you both whether you wanted them or not.

## Fencing

Fencing (STONITH, Shoot The Other Node In The Head) ensures that a failed node is truly offline before resources are moved. Without fencing, two nodes might both believe they are authoritative, leading to data corruption. Configure IPMI-based fencing so the cluster can power-cycle a node it cannot reach.

```bash
pcs stonith create ipmi-node1 fence_ipmilan   ipaddr=192.168.10.101 username=admin password=secret   pcmk_host_list=node1
```

`stonith-enabled` defaults to `true`, and Pacemaker will refuse to start resources on a cluster with no working fence device. The standard bad advice on forums is `pcs property set stonith-enabled=false`. That does silence the error, and it converts your data corruption risk from theoretical to scheduled. On shared storage, two nodes mounting the same non-cluster filesystem at once destroys it, and there is no fsck that puts it back.

Two fencing mistakes are specific to small setups. First, the fence race: in a two node cluster a network partition makes each node try to fence the other, and depending on timing you can lose both. Add `pcmk_delay_base=5` to one node's fence device so there is a deterministic winner. Second, a fence device that shares a failure domain with the thing it fences is not a fence device. An [IPMI](/blog/ipmi-remote-management) BMC on the same power supply as the node cannot power-cycle it after a PSU failure, and a network-controlled PDU on the same switch as the cluster ring is unreachable in exactly the partition you needed it for. Put the BMC network and the PDU somewhere independent.

Test fencing before you need it. `pcs stonith fence node2` should power-cycle node2 within a few seconds. If you have never run that command, you do not have fencing, you have a fence configuration.

## What a Cluster Will Not Do

Pacemaker moves services. It does not move data. If node1 dies with the only copy of your database on its local disk, Pacemaker will start the database on node2 against an empty volume. You need shared storage, DRBD replication, or application-level replication underneath, and getting that right is usually harder than the cluster itself.

It is also not a load balancer. A floating IP is active on exactly one node at a time; the other node is idle. If you want both nodes serving traffic, that is HAProxy, keepalived with multiple VIPs, or DNS round robin, not Pacemaker.

And it cannot fix an application that crashes on bad input. Pacemaker will dutifully restart it, hit `migration-threshold`, move it to the other node, watch it crash there too, and end up with the resource stopped everywhere. When `pcs status` shows a resource stopped after bouncing between nodes, read the application log, not the cluster log.

For a homelab or a single service where a few minutes of downtime is tolerable, a systemd unit with `Restart=always` plus a monitoring alert solves 90 percent of what a cluster solves, with about 2 percent of the operational surface. Reach for Pacemaker when you have genuinely outgrown that.

## References

- https://clusterlabs.org/projects/pacemaker/doc/2.1/Pacemaker_Explained/html/fencing.html
- https://clusterlabs.org/projects/pacemaker/doc/2.1/Clusters_from_Scratch/html/
- https://www.mankier.com/5/corosync.conf
- https://www.mankier.com/5/votequorum
- https://www.mankier.com/8/pcs
- https://www.rfc-editor.org/rfc/rfc5227
