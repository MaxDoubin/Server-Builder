/** Protocol and service terms. */
import type { Term } from "../types";

export const PROTOCOLS: Term[] = [
  {
    term: "TCP",
    expansion: "Transmission Control Protocol",
    field: "protocols",
    definition:
      "A connection-oriented transport that guarantees ordered, complete delivery by numbering bytes, acknowledging them, and retransmitting what goes missing. Three packets establish a connection before any data moves.",
    confusion:
      "A connection that hangs and one that is refused mean opposite things. Refused is a RST, which means you reached the host and nothing was listening. A hang means nothing came back at all, which points at the network rather than the service.",
    see: ["UDP", "SYN", "conntrack"],
  },
  {
    term: "UDP",
    expansion: "User Datagram Protocol",
    field: "protocols",
    definition:
      "A transport that sends datagrams with no connection, no ordering and no retransmission. Applications that need any of those implement them themselves.",
    confusion:
      "Unreliable does not mean unsuitable. DNS, DHCP, NTP and most real-time media use it precisely because a retransmission that arrives late is worse than a loss, and because a query and a reply do not need a handshake first.",
    see: ["TCP", "QUIC"],
  },
  {
    term: "SYN",
    field: "protocols",
    definition:
      "The flag on the first packet of a TCP connection, proposing a starting sequence number. The reply carries SYN and ACK together, and the third packet acknowledges it.",
    confusion:
      "The third packet is what makes the handshake three-way. Without it the server has proof the client can receive and none that it can send, and a connection left in that state is the half-open one a SYN flood exploits.",
    see: ["TCP"],
  },
  {
    term: "QUIC",
    field: "protocols",
    definition:
      "A transport over UDP that provides ordered reliable streams with TLS built in, establishing a connection in one round trip and avoiding the head-of-line blocking that a single TCP connection imposes on multiplexed streams.",
    confusion:
      "It is UDP on the wire, so a network blocking UDP on 443 does not break it visibly: browsers fall back to TCP and the only symptom is that everything is slightly slower.",
    see: ["UDP", "TLS"],
  },
  {
    term: "DNS",
    expansion: "Domain Name System",
    field: "protocols",
    definition:
      "The distributed database that turns names into addresses, resolved by walking down from the root: the root refers you to the TLD, the TLD to the domain's own servers, and those answer.",
    confusion:
      "Nearly every DNS fault reports as the same sentence. A lame delegation, a missing glue record, a nameserver with no address and an alias pointing at a zone that was never created are four different problems, four different people to talk to, and one symptom.",
    see: ["glue record", "NXDOMAIN", "TTL", "DNSSEC"],
  },
  {
    term: "glue record",
    field: "protocols",
    definition:
      "An address record for a nameserver, held at the parent zone and handed out with a referral. It is needed when the nameserver's own name is inside the zone it serves, because finding its address any other way would require the servers you are trying to find.",
    confusion:
      "It is the parent's copy of the child's data, which is exactly why it goes stale: the child renumbers, nobody tells the registrar, and a zone whose own file is entirely correct becomes unreachable.",
    see: ["DNS"],
  },
  {
    term: "NXDOMAIN",
    field: "protocols",
    definition:
      "The answer meaning the name does not exist. It is a fact about every record type at once, and resolvers cache it as such.",
    confusion:
      "It is not the same as NOERROR with no answers, which means the name exists and has no record of the type you asked for. A dual-stack client logging AAAA failures for a host without IPv6 is seeing the second and is behaving correctly.",
    see: ["DNS", "TTL"],
  },
  {
    term: "TTL",
    expansion: "Time To Live",
    field: "protocols",
    definition:
      "In DNS, how long an answer may be cached. In IP, a hop counter decremented by each router, which discards the packet at zero, and which is what traceroute manipulates to map a path.",
    confusion:
      "Lowering a DNS TTL before a migration only helps if you do it longer than the old TTL in advance. Changing a 24 hour TTL to 300 seconds an hour before the cutover changes nothing for anyone who cached it yesterday.",
    see: ["DNS"],
  },
  {
    term: "DNSSEC",
    field: "security",
    definition:
      "Signatures over DNS records, validated up a chain from the root, so a resolver can tell that an answer came from the zone's owner and was not altered on the way.",
    confusion:
      "It authenticates answers; it does not encrypt them. Anyone on the path still sees every query. DNS over TLS and DNS over HTTPS address the confidentiality, and they are a different mechanism solving a different problem.",
    see: ["DNS", "TLS"],
  },
  {
    term: "DHCP",
    expansion: "Dynamic Host Configuration Protocol",
    field: "protocols",
    definition:
      "Four broadcast messages, Discover, Offer, Request and Acknowledge, by which a host with no address gets one along with a gateway, DNS servers and a lease time.",
    confusion:
      "It is unauthenticated by design, so any server on the segment may answer and the client takes whichever offer arrives first. A home router in a wall port is a DHCP server that is nearer than yours, and the control is DHCP snooping on the switch rather than anything in the protocol.",
    see: ["broadcast domain", "DHCP snooping"],
  },
  {
    term: "DHCP snooping",
    field: "security",
    definition:
      "A switch feature that drops server-side DHCP messages arriving on ports not configured to hold a server, so only the real DHCP server can answer.",
    see: ["DHCP"],
  },
  {
    term: "ICMP",
    expansion: "Internet Control Message Protocol",
    field: "protocols",
    definition:
      "The control and error channel for IP: unreachable messages, time exceeded, echo request and reply, and the fragmentation-needed message that path MTU discovery depends on.",
    confusion:
      "Blocking it wholesale, still common advice, breaks more than ping. It breaks path MTU discovery silently, and the result is connections that establish and then hang on anything large.",
    see: ["path MTU discovery", "MTU"],
  },
  {
    term: "NTP",
    expansion: "Network Time Protocol",
    field: "protocols",
    definition:
      "How hosts agree on the time, correcting for the round trip so a machine can be within milliseconds of its source.",
    confusion:
      "Time is a security dependency, not a convenience. Certificate validity, Kerberos tickets, TOTP codes and log correlation all fail when a clock drifts, and the first symptom is usually every TLS connection failing at once.",
    see: ["TLS", "certificate"],
  },
  {
    term: "SNMP",
    expansion: "Simple Network Management Protocol",
    field: "operations",
    definition:
      "The long-standing way to poll devices for counters and receive traps from them. Versions 1 and 2c authenticate with a community string sent in the clear; version 3 adds real authentication and encryption.",
    confusion:
      "A great deal of infrastructure is still running v2c with the community string set to public, which is a read-only credential shared with anyone who can reach the port.",
    see: ["IPMI"],
  },
  {
    term: "SSH",
    expansion: "Secure Shell",
    field: "security",
    definition:
      "An encrypted remote shell and tunnel, authenticating the server by a host key and the client by a key or password.",
    confusion:
      "The host key warning on first connection is the whole security model asking you a question, and answering yes without checking is trust-on-first-use with the checking left out.",
    see: ["TLS", "certificate"],
  },
  {
    term: "TFTP",
    expansion: "Trivial File Transfer Protocol",
    field: "protocols",
    definition:
      "A minimal UDP file transfer with no authentication, used for network booting and switch configuration because it is small enough to fit in firmware.",
    confusion:
      "No authentication means exactly that. It belongs on a provisioning network and nowhere else.",
    see: ["UDP"],
  },
  {
    term: "802.1X",
    field: "security",
    definition:
      "Port-based access control with three parties: the supplicant is the device, the authenticator is the switch, and the authentication server is RADIUS. The switch forwards nothing but EAP until RADIUS says otherwise.",
    confusion:
      "The switch never validates a credential; it relays and enforces. Most 802.1X trouble is somebody expecting the switch to know something it has no way of knowing, and the second most common is a supplicant configured not to check the RADIUS server's certificate, which is the whole basis of the evil twin attack.",
    see: ["RADIUS", "MAC address", "certificate"],
  },
  {
    term: "RADIUS",
    field: "security",
    definition:
      "The protocol network devices use to ask a central server whether to admit a user or device, and what to apply if so: a VLAN, a filter, a session timeout.",
    confusion:
      "An Access-Accept with no attributes is a success that lands the device on the switch's default VLAN. It logs as authorized at both ends and the user cannot reach anything, which is a failure that looks like a success everywhere you would look.",
    see: ["802.1X", "VLAN"],
  },
  {
    term: "SPF",
    expansion: "Sender Policy Framework",
    field: "security",
    definition:
      "A DNS record listing the hosts allowed to send mail for a domain, checked against the envelope sender rather than the From address a reader sees.",
    confusion:
      "It passes for anyone who owns the domain they are sending from, which includes whoever registered a lookalike this morning. It says the sender controls that domain; it says nothing about whether the domain is who you think.",
    see: ["DKIM", "DMARC"],
  },
  {
    term: "DKIM",
    expansion: "DomainKeys Identified Mail",
    field: "security",
    definition:
      "A signature over selected headers and the body, verifiable against a key the signing domain publishes in DNS.",
    confusion:
      "It breaks routinely on mailing lists, which rewrite subjects and append footers after signing. A DKIM failure on its own is weak evidence; a DKIM failure with DMARC also failing is a finding.",
    see: ["SPF", "DMARC"],
  },
  {
    term: "DMARC",
    field: "security",
    definition:
      "The domain owner's published instruction about mail that fails authentication, plus the alignment requirement that ties SPF or DKIM to the From address a reader actually sees.",
    confusion:
      "It is the only one of the three that tells you what the domain owner wants done. SPF and DKIM each answer a narrow technical question; DMARC is the policy, and a message failing it is the one authentication result worth acting on alone.",
    see: ["SPF", "DKIM"],
  },
  {
    term: "TLS",
    expansion: "Transport Layer Security",
    field: "security",
    definition:
      "The protocol that authenticates a server and encrypts a connection to it. Version 1.3 completes in one round trip and encrypts everything after the ServerHello.",
    confusion:
      "It proves you are talking to whoever holds the key for that certificate. It does not prove they are honest, and a phishing site with a valid certificate is the normal case rather than the exception.",
    see: ["certificate", "SNI", "QUIC"],
  },
  {
    term: "SNI",
    expansion: "Server Name Indication",
    field: "security",
    definition:
      "The field in a TLS ClientHello naming the host being requested, so one address can serve certificates for many names.",
    confusion:
      "It is sent before anything is encrypted, so the name of the site you are visiting is visible to the network even though the traffic is not. Encrypted Client Hello closes that, and needs both server support and a DNS record.",
    see: ["TLS", "certificate"],
  },
  {
    term: "HTTP",
    expansion: "Hypertext Transfer Protocol",
    field: "protocols",
    definition:
      "The request and response protocol the web runs on. Version 2 multiplexes streams over one connection; version 3 moves that onto QUIC.",
    see: ["QUIC", "TLS"],
  },
];
