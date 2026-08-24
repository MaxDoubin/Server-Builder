
## Start with the Network

The biggest mistake in homelab growth is treating the network as an afterthought. When you add your fifth server and third VLAN, suddenly the flat network you started with is a mess. Traffic that should stay local hops through random paths. Troubleshooting is painful.

Plan for segmentation from the beginning, even if you only have one server. A managed switch, a few VLANs, and a firewall cost relatively little and provide the structure you need to grow cleanly.

## Document Before You Forget

Documentation is easiest when you are setting something up the first time. A week later, you will not remember which port on which switch connects to which server, or which IP address you assigned to which management interface.

I keep a simple network diagram (updated whenever something changes) and a spreadsheet with IP assignments. It takes ten minutes to update and saves hours of confusion later.

## Power Planning

Power is often the binding constraint in a homelab. A single R740 under load pulls 400-600W. Add another server, a UPS, and a few switches, and you are approaching the capacity of a typical residential circuit.

Calculate your power draw before buying hardware. Know which circuits you have available, what their capacity is, and how you will distribute load across them. A UPS gives you clean power and runtime for graceful shutdowns.

## Cables and Cable Management

Cable management that seems like excessive effort when you have three devices becomes essential when you have thirty. Spend time on it early. Label everything: patch cables, power cables, fiber. A label maker is one of the best investments in a growing lab.

## Test Everything

Each time you add something to the lab, test it thoroughly before relying on it. A new switch, a new server, a new cable: verify it works under load before you depend on it for anything important.

The lab is a place to practice and learn. Let it teach you through failures in controlled conditions, not through production outages.
