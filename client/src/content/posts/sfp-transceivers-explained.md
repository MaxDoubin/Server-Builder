
## What Transceivers Do

Network transceivers convert electrical signals from your switch or NIC into optical signals for fiber cables (or into electrical signals for copper cables). They plug into SFP (Small Form-factor Pluggable) slots on your networking equipment and provide the physical layer connection.

## SFP vs SFP+ vs QSFP28

**SFP** supports speeds up to 1 Gbps. This is the original standard, still used for 1 gigabit fiber connections and some legacy equipment.

**SFP+** supports speeds up to 10 Gbps. This is what most 10GbE networking uses. SFP+ slots are backward-compatible with SFP modules, but not the other way around.

**QSFP28** supports 100 Gbps. This is used for spine/leaf datacenter fabrics and high-performance computing. A single QSFP28 port can also be broken out into 4x25 Gbps connections.

## Fiber vs Copper

For distances under 5 meters, DAC (Direct Attach Copper) cables are the cheapest and simplest option. A DAC cable has transceivers permanently attached to both ends. They are passive, require no configuration, and work in any SFP+ slot.

For distances between 5 and 300 meters, multimode fiber with SR (Short Range) transceivers is the standard. You need separate transceivers for each end and a fiber patch cable between them.

For distances over 300 meters, single-mode fiber with LR (Long Range) transceivers is required. These are more expensive but can reach up to 10 kilometers.

## Third-Party vs OEM

Cisco, Juniper, and other vendors sell their own branded transceivers at premium prices. Third-party transceivers from companies like Finisar (now II-VI) or generic options from Amazon work identically in most cases at a fraction of the cost.

Some switches check for OEM transceivers and will display warnings or refuse to use third-party modules. Cisco is notorious for this. The workaround is usually a CLI command to accept non-certified transceivers:

```
service unsupported-transceiver
```

## My Setup

In my homelab, I use Mellanox ConnectX-3 NICs with generic DAC cables. Everything is within a single rack, so DAC is perfect. The total cost for 10GbE connectivity was a fraction of what it would cost with fiber and OEM transceivers. For a homelab, there is no reason to pay more.
