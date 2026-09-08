/** Networking and protocol terms. */
import type { Term } from "../types";

export const NETWORKING: Term[] = [
  {
    term: "VLAN",
    expansion: "Virtual LAN",
    field: "networking",
    definition:
      "A broadcast domain that exists in a switch's configuration rather than in its cabling. Ports assigned to the same VLAN behave as though they were on their own switch, and a tag on a trunk port is how several of them share one wire between switches.",
    confusion:
      "A VLAN is not a security boundary on its own. It separates broadcast traffic; it does not stop anything from routing between VLANs, and on most networks a router or firewall is doing exactly that by default. The isolation people think they bought comes from the access control list, not from the VLAN.",
    see: ["trunk", "broadcast domain", "802.1Q"],
  },
  {
    term: "802.1Q",
    field: "networking",
    definition:
      "The standard that defines the VLAN tag: four bytes inserted into an Ethernet frame carrying a twelve-bit VLAN ID and a three-bit priority field.",
    confusion:
      "Twelve bits means 4094 usable VLANs, and that ceiling is the reason VXLAN exists. It is also why the tag adds four bytes to a frame, which is where a great many MTU problems come from on trunks that were never adjusted.",
    see: ["VLAN", "MTU", "VXLAN"],
  },
  {
    term: "trunk",
    field: "networking",
    definition:
      "A switch port that carries traffic for several VLANs at once, tagging each frame so the far end knows which VLAN it belongs to. An access port, by contrast, carries one VLAN and sends frames untagged.",
    confusion:
      "The native VLAN on a trunk is sent untagged, which is a compatibility feature and a hazard: if the two ends disagree about which VLAN is native, traffic silently lands in the wrong one.",
    see: ["VLAN", "802.1Q"],
  },
  {
    term: "broadcast domain",
    field: "networking",
    definition:
      "The set of devices that will receive a frame addressed to the broadcast address. A switch forwards broadcasts to every port in the same VLAN; a router does not forward them at all.",
    confusion:
      "That last part is why DHCP needs a relay when the server is on another subnet, and why a host with no address ends up self-assigning a 169.254 one.",
    see: ["VLAN", "DHCP", "ARP"],
  },
  {
    term: "MTU",
    expansion: "Maximum Transmission Unit",
    field: "networking",
    definition:
      "The largest payload a link will carry in one frame, 1500 bytes on ordinary Ethernet. Anything larger has to be fragmented or refused.",
    confusion:
      "The failure mode is not an error, it is a hang. A path with a smaller MTU somewhere in the middle, plus a firewall dropping the ICMP that would have said so, gives you a connection that establishes, serves small requests, and stops dead on anything large. Every symptom points at the application.",
    see: ["ICMP", "path MTU discovery", "jumbo frame"],
  },
  {
    term: "path MTU discovery",
    field: "networking",
    definition:
      "The mechanism by which a sender learns the smallest MTU along a path: it sends packets marked do-not-fragment, and any router that cannot forward one replies with an ICMP fragmentation-needed message naming the size it can take.",
    confusion:
      "It depends entirely on that ICMP arriving. Blocking ICMP wholesale, which is still common advice, breaks it silently and produces the classic hang-on-large-transfers fault.",
    see: ["MTU", "ICMP"],
  },
  {
    term: "jumbo frame",
    field: "networking",
    definition:
      "An Ethernet frame with a payload larger than 1500 bytes, usually 9000. Fewer, larger frames means less per-packet overhead, which matters on storage networks moving continuous data.",
    confusion:
      "Every device on the segment has to agree. One switch port left at 1500 in a path otherwise set to 9000 does not negotiate down, it drops, and the result is a link that passes pings and fails transfers.",
    see: ["MTU", "path MTU discovery"],
  },
  {
    term: "ARP",
    expansion: "Address Resolution Protocol",
    field: "protocols",
    definition:
      "How a host finds the MAC address for an IP address on its own segment: it broadcasts a request asking who has that address, and the owner answers.",
    confusion:
      "There is no authentication in it at all. Anything on the segment can answer for any address, which is the whole of ARP spoofing, and the defence is at the switch rather than in the protocol.",
    see: ["MAC address", "broadcast domain"],
  },
  {
    term: "MAC address",
    expansion: "Media Access Control address",
    field: "networking",
    definition:
      "The 48-bit address burned into a network interface and used to deliver frames within a single segment. A switch learns which port each one is behind by watching source addresses go past, and forwards on what it has learned.",
    confusion:
      "It does not survive a router. A frame leaving your segment gets a new destination MAC at every hop, so the address you see in a capture on the far side belongs to the last router, not the sender. That is also why a MAC address is a weak identity: it identifies an interface on one segment, it is trivially changed in software, and nothing about it is authenticated.",
    see: ["ARP", "broadcast domain", "802.1X"],
  },
  {
    term: "NAT",
    expansion: "Network Address Translation",
    field: "networking",
    definition:
      "Rewriting addresses in packets as they cross a boundary, most often many private addresses sharing one public one, with a table tracking which internal conversation each translated port belongs to.",
    confusion:
      "NAT is not a firewall, though it accidentally behaves like one for inbound connections: there is no mapping for traffic nobody asked for, so it has nowhere to go. That is a side effect of the table, not a policy, and it disappears the moment a port forward or UPnP creates a mapping.",
    see: ["firewall", "conntrack"],
  },
  {
    term: "BGP",
    expansion: "Border Gateway Protocol",
    field: "protocols",
    definition:
      "The routing protocol that connects autonomous systems to each other, and therefore the one that decides how traffic moves between networks on the internet. Routers announce which prefixes they can reach and choose paths by policy rather than by distance.",
    confusion:
      "It runs on trust between operators. A network that announces a prefix belonging to someone else is usually believed, which is what a BGP hijack is, and RPKI exists to make those announcements checkable.",
    see: ["prefix", "RPKI"],
  },
  {
    term: "prefix",
    field: "networking",
    definition:
      "A block of addresses written as an address and a length, like 10.40.0.0/16. The length says how many leading bits are the network part; everything after them addresses hosts inside it.",
    confusion:
      "A bare address with no prefix length is a /32, one host. Writing 10.20.0.0 where you meant 10.20.0.0/16 gives you a rule that matches exactly one machine, and it is the machine that happens to hold the network address, so it appears to work.",
    see: ["CIDR", "subnet mask"],
  },
  {
    term: "CIDR",
    expansion: "Classless Inter-Domain Routing",
    field: "networking",
    definition:
      "The scheme that replaced fixed address classes with an explicit prefix length, so a block can be any power of two rather than a /8, /16 or /24.",
    confusion:
      "A block has to start on a boundary of its own size. 10.40.3.0/23 is not a network: a /23 begins on an even third octet, so that address sits inside 10.40.2.0/23 as a host.",
    see: ["prefix", "subnet mask"],
  },
  {
    term: "subnet mask",
    field: "networking",
    definition:
      "The same information as a prefix length written as four octets: 255.255.0.0 is /16. The one bits cover the network part.",
    see: ["CIDR", "prefix"],
  },
  {
    term: "VXLAN",
    expansion: "Virtual Extensible LAN",
    field: "networking",
    definition:
      "Ethernet frames encapsulated inside UDP so a layer 2 segment can span routed infrastructure. The identifier is 24 bits rather than the VLAN tag's 12, giving about sixteen million segments.",
    confusion:
      "The encapsulation costs 50 bytes, so a network running VXLAN over a 1500 byte underlay hands its tenants an effective 1450 and produces MTU faults that look like application bugs.",
    see: ["VLAN", "MTU", "802.1Q"],
  },
  {
    term: "STP",
    expansion: "Spanning Tree Protocol",
    field: "protocols",
    definition:
      "The protocol that stops a switched network with redundant links from looping, by blocking ports until the topology is a tree. Switches elect a root and each one blocks whichever path is not its best route to it.",
    confusion:
      "A layer 2 loop without it does not degrade, it collapses: broadcasts multiply with nothing to decrement, and the segment saturates in seconds. There is no TTL in an Ethernet frame to save you.",
    see: ["BPDU", "broadcast domain"],
  },
  {
    term: "BPDU",
    expansion: "Bridge Protocol Data Unit",
    field: "protocols",
    definition:
      "The frames switches exchange to build and maintain the spanning tree. BPDU guard shuts a port down if one arrives where no switch should be.",
    confusion:
      "That guard is what catches somebody plugging a desk switch or a home router into a wall port, and it is the single most useful access port setting most networks are not using.",
    see: ["STP"],
  },
  {
    term: "DMZ",
    expansion: "Demilitarised zone",
    field: "security",
    definition:
      "A network segment holding services that must be reachable from outside, arranged so that a compromise there does not reach the internal network.",
    confusion:
      "The value is entirely in the rules between the DMZ and everything else. A DMZ with a permit-any back into the LAN is a normal subnet with an alarming name.",
    see: ["VLAN", "firewall"],
  },
  {
    term: "LAN",
    expansion: "Local Area Network",
    field: "networking",
    definition:
      "The network inside one site, on addresses the internet does not route to, behind whatever box does the translation on the way out.",
    confusion:
      "Being on the LAN changes how you reach a service on the LAN, which is not obvious until it bites. A machine that asks for the site's public address is asking a box on its own network to translate a packet and send it back out of the interface it came in on, and the reply from the server goes straight across the switch instead of back through that box, so it arrives from an address the client never contacted and is discarded. The port forward is correct and the connection hangs.",
    see: ["WAN", "NAT", "VLAN"],
  },
  {
    term: "WAN",
    expansion: "Wide Area Network",
    field: "networking",
    definition:
      "The network beyond one site, whether that is a leased circuit between offices or the internet connection itself.",
    see: ["BGP", "NAT"],
  },
  {
    term: "conntrack",
    expansion: "Connection tracking",
    field: "networking",
    definition:
      "The kernel's table of connections in flight, which lets a firewall recognise a packet as part of a conversation already permitted rather than judging it on its headers alone.",
    confusion:
      "It is what makes a default-drop inbound policy usable at all. Without a rule accepting ESTABLISHED and RELATED, replies to connections the host opened itself arrive as inbound packets and are dropped, and the host appears to have no internet.",
    see: ["firewall", "NAT"],
  },
  {
    term: "firewall",
    field: "security",
    definition:
      "A set of ordered rules deciding what a host or network will accept. Evaluation stops at the first rule that matches, and a chain that matches nothing takes its default policy.",
    confusion:
      "First match wins is the whole of it, and it is invisible in every interface: a rule that looks correct does nothing because a broader rule above it already decided. Counters tell you a rule fired, never which rule stole the packet you cared about.",
    see: ["conntrack", "DMZ"],
  },
  {
    term: "IP address",
    expansion: "Internet Protocol address",
    field: "networking",
    definition:
      "The number a host answers to at layer 3, and the only thing routing decisions are made against. IPv4 writes it as four octets, IPv6 as eight groups of four hex digits, and in both cases it belongs to an interface rather than to a machine.",
    confusion:
      "It belongs to the interface, not the host. A server with four NICs has four of them and can be reachable on one while being unreachable on the others, which is why \"the server is down\" and \"the address does not answer\" are different reports. An address also moves: it is configuration, and DHCP can hand the same one to something else once the lease expires.",
    see: ["prefix", "subnet mask", "ARP", "DHCP"],
  },
  {
    term: "RPKI",
    expansion: "Resource Public Key Infrastructure",
    field: "networking",
    definition:
      "A set of signed records saying which autonomous system is allowed to announce which prefix, so a router can check a BGP announcement against something other than the announcer's word. Networks that validate drop announcements the records contradict.",
    confusion:
      "It only proves the origin is authorised, not that the path is real. An announcement can be RPKI-valid and still be a hijack if the attacker prepends the legitimate origin, so validation raises the cost of a hijack rather than ending it.",
    see: ["BGP", "prefix", "certificate"],
  },
];
