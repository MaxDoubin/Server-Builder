
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

```bash
# Via racadm
racadm getsensorinfo | grep -i power
```

## In Practice

I run all my lab servers with redundant PSUs and connect them to separate circuits. I have tested failover by unplugging one PSU while the server was running, and in every case the server continued without any interruption. The investment in a second PSU is minimal compared to the cost of an unexpected shutdown.
