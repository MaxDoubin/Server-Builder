/**
 * Four exchanges, and the ways each one goes wrong.
 *
 * The breaks are chosen so that several produce the same user-visible
 * sentence. "It just hangs" covers a lost SYN-ACK, a blocked DHCP offer and a
 * silent MTU problem, and the step where the sequence stops is what tells them
 * apart.
 */

import type { Handshake } from "../types";

export const HANDSHAKES: Handshake[] = [
  {
    slug: "tcp",
    title: "The TCP three-way handshake",
    tagline: "Three packets to agree that both directions work, and the several ways they do not.",
    client: "Client",
    server: "Server",
    brief: [
      "Before any data moves, both ends have to agree on a starting sequence number and confirm that traffic flows in both directions. Three packets do it, and the third is the one people forget.",
      "The interesting part is not the success case. It is that a connection which never establishes has at least four distinct causes, and each one leaves a different fingerprint.",
    ],
    steps: [
      {
        n: 1,
        from: "client",
        to: "server",
        label: "SYN",
        detail: "The client proposes a starting sequence number and its options.",
        carries: ["seq=x", "SYN flag", "MSS", "window scale", "SACK permitted"],
      },
      {
        n: 2,
        from: "server",
        to: "client",
        label: "SYN, ACK",
        detail: "The server accepts, proposes its own sequence number, and acknowledges the client's.",
        carries: ["seq=y", "ack=x+1", "SYN and ACK flags", "the server's own MSS"],
      },
      {
        n: 3,
        from: "client",
        to: "server",
        label: "ACK",
        detail:
          "The client acknowledges the server's sequence number. Both directions are now proven and the connection is established.",
        carries: ["seq=x+1", "ack=y+1", "ACK flag"],
      },
    ],
    breaks: [
      {
        id: "syn-dropped",
        label: "A firewall silently drops the SYN",
        stopsAt: 1,
        symptom: "The connection hangs and eventually times out after tens of seconds.",
        owner: "network",
        explain: [
          "The SYN leaves and nothing comes back at all. The client retransmits on an exponential backoff and gives up after a minute or so, which is why this presents as a long hang rather than an error.",
          "A silent drop is a deliberate configuration. DROP gives you this; REJECT gives you the next case. Anyone who has waited out a two-minute timeout has met a DROP rule.",
        ],
      },
      {
        id: "rst",
        label: "Nothing is listening, so the host sends a RST",
        stopsAt: 1,
        symptom: "Connection refused, immediately.",
        owner: "server",
        explain: [
          "The packet reached the host and the host answered. There is no service on that port, so the kernel replies with a reset and the client fails at once.",
          "Immediate is the diagnosis. A refused connection means you reached the machine, which rules out routing and most firewalls and points at the service. A hang means you did not.",
        ],
      },
      {
        id: "asymmetric",
        label: "The SYN arrives, the SYN-ACK does not come back",
        stopsAt: 2,
        symptom: "The connection hangs, and the server's logs show the attempt.",
        owner: "network",
        explain: [
          "This is the one that wastes an afternoon, because both sides think they are right. The server saw the connection and says so; the client saw nothing and says so.",
          "It is a return path problem: asymmetric routing, a missing route back, a stateful firewall that saw only one direction, or a NAT that did not keep the mapping.",
          "The tell is that the two ends disagree about whether anything happened. Whenever a server's logs and a client's experience contradict each other, suspect the return path.",
        ],
      },
      {
        id: "mss-blackhole",
        label: "The handshake completes and then large transfers hang",
        stopsAt: 3,
        symptom: "It connects. Small requests work. Anything large stops dead.",
        owner: "network",
        explain: [
          "The handshake is fine, which is the whole problem: the MSS agreed in it applies to the path, and something on the path has a smaller MTU and is dropping the ICMP that would have said so.",
          "Every packet small enough to fit gets through, so the connection establishes, the TLS handshake completes, and the first full-size data packet vanishes. A login page loads and the file download hangs.",
          "This is path MTU discovery failing, and it is almost always a firewall dropping ICMP fragmentation-needed messages on the theory that ICMP is dangerous.",
        ],
      },
    ],
    notes: [
      "The third packet is the one that makes it three-way rather than two. Without it the server has proof the client can receive but no proof it can send, and the whole point of the exchange is proving both directions before committing any state.",
      "A half-open connection is one the server has allocated state for and never seen the third packet on, which is the mechanism behind a SYN flood and the reason SYN cookies exist.",
    ],
  },
  {
    slug: "tls13",
    title: "The TLS 1.3 handshake",
    tagline: "One round trip to a working key, and four places it can end instead.",
    client: "Client",
    server: "Server",
    brief: [
      "TLS 1.3 does in one round trip what 1.2 took two to do. The client guesses which key exchange the server will pick and sends its share immediately, so by the second flight there is already a working key and everything after the ServerHello is encrypted.",
      "Because it is encrypted so early, a failure after that point tells a passive observer very little, which is good for privacy and inconvenient for whoever is debugging it.",
    ],
    steps: [
      {
        n: 1,
        from: "client",
        to: "server",
        label: "ClientHello",
        detail: "Offers versions, cipher suites, and a key share for the group it expects to be chosen.",
        carries: ["supported_versions", "cipher suites", "key_share", "SNI, in the clear", "ALPN"],
      },
      {
        n: 2,
        from: "server",
        to: "client",
        label: "ServerHello",
        detail:
          "Picks a suite and returns its own key share. From the next message onward everything is encrypted.",
        carries: ["chosen suite", "key_share", "the handshake key is now derivable"],
      },
      {
        n: 3,
        from: "server",
        to: "client",
        label: "EncryptedExtensions, Certificate, CertificateVerify, Finished",
        detail:
          "The server proves it holds the key for the certificate and that the transcript has not been tampered with. All encrypted, and sent without waiting: this is the same flight as the ServerHello.",
        carries: ["the certificate chain", "a signature over the transcript", "a MAC over everything so far"],
        sameFlight: true,
      },
      {
        n: 4,
        from: "client",
        to: "server",
        label: "Finished",
        detail: "The client confirms it agrees about the transcript. Application data can follow immediately.",
        carries: ["a MAC over the transcript", "and then the first HTTP request"],
      },
    ],
    breaks: [
      {
        id: "no-overlap",
        label: "No cipher suite or version in common",
        stopsAt: 2,
        symptom: "The connection closes with a handshake failure alert almost immediately.",
        owner: "whoever owns the other device",
        explain: [
          "The server had nothing in the client's list it was willing to use, so it gives up at the ServerHello rather than proceeding.",
          "This is what a very old client meeting a modern server looks like, and what a modern client meeting an unpatched appliance looks like. It fails fast, which at least distinguishes it from the network problems.",
        ],
      },
      {
        id: "cert-name",
        label: "The certificate does not cover the name asked for",
        stopsAt: 3,
        symptom: "The browser shows an interstitial naming the certificate.",
        owner: "server",
        explain: [
          "The handshake got all the way to the certificate, which means the network is fine, the versions agree and the key exchange worked. Only the name check failed.",
          "The SNI in the ClientHello is what the server used to choose which certificate to send, and it is one of the few parts of a TLS 1.3 handshake still in the clear. If the wrong certificate came back, that is usually the field to look at first.",
        ],
      },
      {
        id: "clock",
        label: "The client's clock is wrong",
        stopsAt: 3,
        symptom: "Every site fails with a certificate date error, all at once.",
        owner: "client",
        explain: [
          "Certificate validity is checked against the client's clock, so a device whose clock is months out rejects certificates that are perfectly valid.",
          "The diagnosis is in the word every. One site failing is a certificate. Every site failing at the same moment is a clock, and it is nearly always the client's.",
        ],
      },
      {
        id: "client-cert",
        label: "The server asks for a client certificate and the client has none",
        stopsAt: 4,
        symptom: "The connection is refused at the last moment, after everything else succeeded.",
        owner: "client",
        explain: [
          "The server's flight included a CertificateRequest. The client reaches its own Finished with nothing to send, and the server rejects it there.",
          "Everything up to that point worked, which is what makes it confusing: the server certificate validated, the key exchange completed, and the failure is about the client's identity rather than the server's.",
          "In TLS 1.3 the client's certificate is sent inside the encrypted flight rather than in the clear, so a passive capture will not show you which client presented what. That is a privacy improvement and a debugging inconvenience at the same time.",
        ],
      },
      {
        id: "middlebox",
        label: "A middlebox is inspecting and does not understand 1.3",
        stopsAt: 3,
        symptom: "Some sites work, some hang, and it depends on the network you are on.",
        owner: "network",
        explain: [
          "TLS 1.3 disguises itself as 1.2 in several fields specifically because middleboxes that half-understood 1.2 were breaking anything that looked new. Some still break it anyway.",
          "The tell is that the same client works on one network and not another. Nothing about the client or the server changed, so the thing in between is the variable.",
        ],
      },
    ],
    notes: [
      "The SNI is sent before anything is encrypted, so the name of the site you are visiting is visible to the network even though the traffic is not. Encrypted Client Hello is the extension that closes that, and it needs the server's support and a DNS record.",
      "1.3 removed renegotiation, compression, static RSA key exchange and every cipher without forward secrecy. The list of things it can no longer do wrong is most of the improvement.",
    ],
  },
  {
    slug: "dhcp",
    title: "DHCP, and who else answers",
    tagline: "Discover, Offer, Request, Acknowledge, and the fifth actor nobody invited.",
    client: "Client",
    server: "DHCP server",
    brief: [
      "Four messages get a host an address. The exchange is deliberately broadcast, because a client with no address cannot send anything else, and that openness is exactly what makes the failure modes interesting.",
      "The Request is broadcast rather than unicast on purpose: it tells every server that offered that this client took a different one, so the others release their reservations.",
    ],
    steps: [
      {
        n: 1,
        from: "client",
        to: "other",
        label: "DHCPDISCOVER",
        detail: "Broadcast, because the client has no address and does not know where the server is.",
        carries: ["the client's MAC", "a transaction id", "broadcast to 255.255.255.255"],
      },
      {
        n: 2,
        from: "other",
        to: "client",
        label: "DHCPOFFER",
        detail: "Any server on the segment that has a free lease offers one. There may be more than one.",
        carries: ["an offered address", "subnet mask", "gateway", "DNS servers", "lease time"],
      },
      {
        n: 3,
        from: "client",
        to: "other",
        label: "DHCPREQUEST",
        detail:
          "Broadcast again, naming which server's offer was accepted, so the others can take their offers back.",
        carries: ["the accepted address", "the chosen server's identifier"],
      },
      {
        n: 4,
        from: "other",
        to: "client",
        label: "DHCPACK",
        detail: "The chosen server confirms the lease and the client may use the address.",
        carries: ["the lease", "and every option the client asked for"],
      },
    ],
    breaks: [
      {
        id: "no-relay",
        label: "The server is on another subnet and there is no relay",
        stopsAt: 1,
        symptom: "The client ends up on a 169.254 address and nothing works.",
        owner: "network",
        explain: [
          "The Discover is a broadcast, and routers do not forward broadcasts. On any network where the DHCP server is not on the same segment, something has to relay it: an ip helper-address on the router, or a relay agent.",
          "A 169.254 address is the client giving up and assigning itself one. It is a symptom rather than a configuration, and seeing one always means the client asked and nobody answered.",
        ],
      },
      {
        id: "rogue",
        label: "Someone plugs in a home router",
        stopsAt: 2,
        symptom: "Some machines get the wrong gateway and lose the internet. Others are fine.",
        owner: "network",
        explain: [
          "Every server that hears the Discover may offer, and the client takes whichever arrives first. A home router plugged into a wall port is a DHCP server that is nearer than yours.",
          "It affects some machines and not others because it depends on who renewed while it was plugged in, which is why this gets reported as an intermittent problem in one part of the building.",
          "DHCP snooping on the switch is the fix: it drops server-side DHCP messages arriving on ports that are not configured to hold a server.",
        ],
      },
      {
        id: "pool-empty",
        label: "The pool is exhausted",
        stopsAt: 2,
        symptom: "New devices cannot get an address. Existing ones are unaffected.",
        owner: "server",
        explain: [
          "The server has no free leases so it does not offer. Devices already holding a lease renew it happily, which is why the problem looks like it only affects new arrivals and visitors.",
          "The usual cause is not too many devices but a lease time far longer than the dwell time: an eight day lease on a guest network with three hour visitors holds each address sixty times longer than it is used.",
        ],
      },
      {
        id: "decline",
        label: "The offered address is already in use by something static",
        stopsAt: 4,
        symptom: "A device gets an address, loses it a second later, and cycles.",
        owner: "server",
        explain: [
          "The client takes the lease and then ARPs for its own new address before using it. Something answers, which means the address is already taken, so the client sends a DHCPDECLINE and starts again from Discover.",
          "The cause is almost always a statically configured device sitting inside the DHCP pool, and the fix is to shrink the pool rather than to renumber the device.",
          "It presents as a device that flaps rather than one that fails, because every cycle it gets a different address and eventually finds a free one. The intermittency is why it survives so long.",
        ],
      },
      {
        id: "nak",
        label: "The client asks for an address it held on another network",
        stopsAt: 3,
        symptom: "A laptop takes noticeably longer to get on the network after moving buildings.",
        owner: "client",
        explain: [
          "A client that still holds a lease skips Discover and requests its old address directly. On a different subnet no server owns that address, so it gets a DHCPNAK and starts again from Discover.",
          "That extra round trip is the pause. It is the protocol working correctly, and the alternative would be a client insisting on an address that belongs to a different network.",
        ],
      },
    ],
    notes: [
      "The whole exchange is unauthenticated, which is why the rogue server case works at all. There is no version of DHCP in common use where a client can tell a legitimate server from an impostor, so the control has to be in the switch.",
      "A client renews at half the lease time by unicasting a Request straight to its server, which is why a server being down for an hour usually goes unnoticed.",
    ],
  },
  {
    slug: "dot1x",
    title: "802.1X, and the three parties",
    tagline: "The switch will not forward anything until somebody else says you may.",
    client: "Supplicant",
    server: "Authenticator and RADIUS",
    brief: [
      "Port-based access control has three parties, and confusing them is the source of most of the trouble. The supplicant is the device. The authenticator is the switch, which forwards nothing but EAP until it is told to. The authentication server is RADIUS, which makes the actual decision.",
      "The switch never validates a credential. It relays, and it enforces the answer it gets back.",
    ],
    steps: [
      {
        n: 1,
        from: "server",
        to: "client",
        label: "EAP-Request Identity",
        detail: "The switch asks the newly connected device who it is. Nothing else is forwarded yet.",
        carries: ["EAPOL frame", "the port is otherwise blocked"],
      },
      {
        n: 2,
        from: "client",
        to: "server",
        label: "EAP-Response Identity",
        detail: "The device answers with an identity, which the switch wraps in RADIUS and forwards.",
        carries: ["an outer identity, often anonymous", "the switch adds its own NAS identifiers"],
      },
      {
        n: 3,
        from: "server",
        to: "client",
        label: "The server's half of the method",
        detail:
          "RADIUS sends its certificate and builds a TLS tunnel, relayed by a switch that understands none of it.",
        carries: ["the RADIUS server's certificate", "the tunnel", "PEAP, EAP-TLS or EAP-TTLS"],
      },
      {
        n: 4,
        from: "client",
        to: "server",
        label: "The credential, inside the tunnel",
        detail:
          "Having decided whether to trust that certificate, the supplicant sends the inner credential.",
        carries: ["the inner identity", "a password or a client certificate"],
      },
      {
        n: 5,
        from: "server",
        to: "client",
        label: "EAP-Success and RADIUS Access-Accept",
        detail:
          "RADIUS accepts and may return attributes. The switch opens the port and applies whatever VLAN it was told to.",
        carries: ["Tunnel-Private-Group-ID, the VLAN", "Filter-Id", "session timeout"],
      },
    ],
    breaks: [
      {
        id: "no-supplicant",
        label: "The device has no 802.1X supplicant at all",
        stopsAt: 1,
        symptom: "A printer or a camera gets no network, silently, and nothing is logged against it.",
        owner: "client",
        explain: [
          "The switch asks and nothing answers, because the device has no idea what EAPOL is. It sits on a blocked port indefinitely.",
          "This is why MAC Authentication Bypass exists, and why it is the weakest part of most deployments: it authenticates a number printed on a sticker.",
          "The switch can also be configured to drop such a device into a guest VLAN after a timeout, which is a better answer than MAB when the device does not need to be trusted.",
        ],
      },
      {
        id: "cert-untrusted",
        label: "The supplicant does not trust the RADIUS server's certificate",
        stopsAt: 3,
        symptom: "A prompt asking whether to trust a certificate, and a failure if the user says no.",
        owner: "client",
        explain: [
          "The tunnel is mutual in the direction that matters: the device is meant to verify the RADIUS server before sending a credential into it.",
          "Devices are very often configured to skip that check, and that is the entire basis of the evil twin attack. A fake access point with a fake RADIUS server collects the inner credential from every supplicant that did not check.",
          "The fix is unglamorous and it is the whole control: distribute the CA certificate and pin the expected server name in the supplicant profile.",
        ],
      },
      {
        id: "radius-down",
        label: "RADIUS is unreachable",
        stopsAt: 3,
        symptom: "Everything that reconnects stops working. Anything already connected is fine.",
        owner: "server",
        explain: [
          "The switch relays and gets no answer, so it cannot authorise anyone new. Existing sessions are already authorised and stay up until they reauthenticate.",
          "That gap is why this is reported hours after it starts, usually as a rush of failures the next morning when everyone plugs in at once.",
          "Critical VLAN or critical auth is the configuration that decides what happens here, and it is worth setting deliberately rather than discovering.",
        ],
      },
      {
        id: "wrong-vlan",
        label: "RADIUS accepts but returns no VLAN attribute",
        stopsAt: 5,
        symptom: "The device authenticates successfully and lands on the wrong network.",
        owner: "server",
        explain: [
          "The port opens because the answer was Accept, and the switch applies its configured default VLAN because it was told nothing else.",
          "This is the failure that looks like a success everywhere you would look. The switch logs an authorised session, RADIUS logs an accept, and the user cannot reach anything.",
          "Check the attributes on the accept, not the accept itself. Tunnel-Private-Group-ID is the one that carries the VLAN, and it has to arrive with two companion attributes to be honoured at all.",
        ],
      },
    ],
    notes: [
      "The switch is a relay with an enforcement action, and that is worth holding onto: nearly every 802.1X problem is somebody expecting the switch to know something it has no way of knowing.",
      "EAPOL frames go to a reserved multicast address that switches do not forward, which is what keeps the conversation between the device and the switch it is plugged into.",
    ],
  },
];

export const getHandshake = (slug: string): Handshake | undefined =>
  HANDSHAKES.find((handshake) => handshake.slug === slug);
