
## The model everyone starts with

Every monitoring system I have built started the same way: a collector, a list of devices, a community string, and a loop. SNMP is a request and response protocol. The collector sends a GET or a GETBULK for an object identifier, the agent on the device walks its MIB, and a value comes back. Repeat every thirty seconds, forever.

That model has real virtues. It is on every switch, router, printer, PDU, and UPS you will ever plug in. The data model is standardized enough that an interface counter is in the same place on gear from three vendors. You can debug it from a shell in one line.

```bash
# Walk the interface table on a switch, SNMPv3, no shortcuts
snmpwalk -v3 -l authPriv -u monitor \
  -a SHA -A "$SNMP_AUTH_PASS" \
  -x AES -X "$SNMP_PRIV_PASS" \
  10.20.0.2 IF-MIB::ifHCInOctets
```

Note the HC in that object name. The 32 bit counters in the original IF-MIB wrap in under four seconds on a saturated 10G link, which is the first thing that surprises people building a graph. The 64 bit versions exist because polling could not keep up with the hardware.

## What polling actually costs

The cost is not bandwidth. It is resolution and CPU on the device.

Resolution first. If you poll every 30 seconds, you cannot see anything shorter than 30 seconds. A microburst that fills a buffer and drops frames for 200 milliseconds shows up as nothing at all, because the counter difference across the interval averages it into invisibility. I have chased packet loss that never appeared on a single graph, because the graph had no way to hold it.

CPU second. A GETBULK across a big interface table is not free on a control plane processor that was sized for routing, not for answering questions. Poll a chassis with hundreds of logical interfaces hard enough and the management plane starts to matter. That is why the standard advice is to poll less often, which makes the resolution problem worse. The two costs pull against each other.

There is also the walk problem. SNMP indexes tables by row, and rows move. Interface index numbers can renumber across a reboot on some platforms, which quietly re-points your graphs at the wrong port.

## What streaming telemetry changes

Streaming telemetry inverts the direction. Instead of the collector asking, the device pushes. You subscribe once to a set of data paths, and the device sends updates on a timer or on change. gNMI is the interface most vendors converged on: gRPC transport, protocol buffers on the wire, and YANG models describing the data.

```bash
# Subscribe to interface counters, sampled once per second
gnmic -a 10.20.0.2:57400 -u monitor --password "$GNMI_PASS" \
  --skip-verify subscribe \
  --path "/interfaces/interface[name=*]/state/counters" \
  --stream-mode sample --sample-interval 1s
```

Three things follow from the inversion. Sub second sampling becomes practical because the device is serializing state it already has instead of servicing a query. On-change subscriptions become possible, so an interface going down is an event that arrives immediately rather than a difference you notice on the next poll. And the data is structured and self describing, so you get a path like `/interfaces/interface[name=Ethernet1]/state/oper-status` instead of a numeric OID you have to translate through a MIB file.

The YANG modelling is the part people underestimate. OpenConfig models aim for vendor neutrality, but every vendor also ships native models, and the native ones usually carry the fields you actually want. You end up writing per platform path lists anyway. It is better than per platform MIB hunting, but it is not free.

## Where SNMP still wins

I am not ripping SNMP out of anything, and neither should you.

It wins on coverage. The UPS, the environmental sensor, the older access switch in a closet, the appliance whose vendor never shipped a gRPC daemon: these speak SNMP and nothing else. Traps also remain the lowest common denominator for asynchronous notification, even if trap delivery over UDP is best effort and you should never build alerting that depends only on receiving one.

It wins on operational simplicity. There is no certificate to expire, no gRPC channel to keep open through a firewall that closes idle flows, no collector that has to be up when the event happens. A polling collector that misses a cycle recovers on the next one. A streaming collector that is down misses the window entirely, unless the device buffers, and most do not buffer much.

## How I run both

The split I use is by question type, not by device class.

Slow moving inventory and environmental data stays on SNMP: chassis serial, power supply state, temperature, PDU outlet draw. Poll it every minute or five. Nobody needs sub second fan speed.

Fast moving or event shaped data goes to streaming where the platform supports it: interface counters, queue depth and drops, [BGP](/blog/bgp-for-network-engineers) neighbor state, optic light levels. That is where resolution changes conclusions.

Then normalize both into the same time series store with the same label scheme, so a dashboard does not care which transport delivered the sample. If a device name and interface name mean the same thing in both pipelines, you can migrate one platform at a time without rewriting a single panel. That normalization layer is the actual project. The protocol choice is easy by comparison.

One security note that applies to both. SNMPv1 and v2c send a community string in cleartext and are a read primitive for anyone on the management network, which is a good argument for v3 with authPriv and a better argument for keeping management traffic on its own segment. gNMI over TLS is better by default, but only if you actually verify the certificate instead of passing the skip flag I used above for a lab example.

## References

- https://www.rfc-editor.org/rfc/rfc1157
- https://www.rfc-editor.org/rfc/rfc3411
- https://www.rfc-editor.org/rfc/rfc7950
- https://www.rfc-editor.org/rfc/rfc6241
- https://www.openconfig.net/
- https://en.wikipedia.org/wiki/Simple_Network_Management_Protocol
