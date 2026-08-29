/**
 * Well-known and commonly-encountered TCP and UDP ports.
 *
 * Curated rather than scraped: every entry is a port worth recognising on
 * sight during a scan, a packet capture, or a firewall review. Ports whose
 * assignment is by convention rather than by IANA registration say so in the
 * description, because "9000 is PHP-FPM" is a habit, not a standard.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolShell } from "./ToolShell";

type Proto = "TCP" | "UDP" | "TCP/UDP";

interface PortEntry {
  port: number;
  /** Shown instead of the bare number when the service occupies a range. */
  display?: string;
  proto: Proto;
  service: string;
  description: string;
  note?: string;
}

const PORTS: PortEntry[] = [
  {
    port: 7,
    proto: "TCP/UDP",
    service: "Echo",
    description: "Returns whatever it receives. A diagnostic from the earliest internet.",
    note: "UDP echo reflects traffic, so it is an amplification vector. Disable it.",
  },
  {
    port: 19,
    proto: "TCP/UDP",
    service: "CHARGEN",
    description: "Character generator: answers any packet with a stream of characters.",
    note: "The classic UDP amplifier. Should never be reachable from anywhere.",
  },
  {
    port: 20,
    proto: "TCP",
    service: "FTP data",
    description: "The data channel opened by active-mode FTP, from the server back to the client.",
    note: "Inbound connections from the server are why active FTP breaks through NAT.",
  },
  {
    port: 21,
    proto: "TCP",
    service: "FTP control",
    description: "FTP commands and responses, including the login exchange.",
    note: "Usernames, passwords, and file names all travel in cleartext. Use SFTP or FTPS.",
  },
  {
    port: 22,
    proto: "TCP",
    service: "SSH",
    description: "Secure shell, and the transport under SCP, SFTP, and port forwarding.",
    note: "The most brute-forced port on the internet. Key authentication and rate limiting.",
  },
  {
    port: 23,
    proto: "TCP",
    service: "Telnet",
    description: "Remote terminal sessions, superseded by SSH decades ago.",
    note: "Everything including the password is cleartext. Still common on switches and IoT.",
  },
  {
    port: 25,
    proto: "TCP",
    service: "SMTP",
    description: "Mail transfer between servers.",
    note: "An open relay will be found and abused within hours. Many ISPs block outbound 25.",
  },
  {
    port: 37,
    proto: "TCP/UDP",
    service: "Time",
    description: "The RFC 868 time protocol, returning seconds since 1900. Superseded by NTP.",
  },
  {
    port: 43,
    proto: "TCP",
    service: "WHOIS",
    description: "Domain and IP registration lookups, in plain text.",
  },
  {
    port: 49,
    proto: "TCP",
    service: "TACACS+",
    description: "Cisco AAA for device administration, with per-command authorisation.",
    note: "Encrypts the whole payload, unlike RADIUS which only protects the password.",
  },
  {
    port: 53,
    proto: "TCP/UDP",
    service: "DNS",
    description: "Name resolution. UDP for ordinary queries, TCP for zone transfers and large answers.",
    note: "An open recursive resolver is an amplification weapon. Restrict recursion to your clients.",
  },
  {
    port: 67,
    proto: "UDP",
    service: "DHCP server",
    description: "The server side of DHCP, historically BOOTP.",
    note: "A rogue DHCP server can hand out its own gateway and DNS. Use DHCP snooping.",
  },
  {
    port: 68,
    proto: "UDP",
    service: "DHCP client",
    description: "The client side of DHCP, where offers and acknowledgements are received.",
  },
  {
    port: 69,
    proto: "UDP",
    service: "TFTP",
    description: "Trivial FTP, used for switch configs, firmware, and PXE boot images.",
    note: "No authentication of any kind. Anything readable is readable by anyone.",
  },
  {
    port: 79,
    proto: "TCP",
    service: "Finger",
    description: "Reports who is logged in and their contact details.",
    note: "Pure user enumeration. There is no reason to run it today.",
  },
  {
    port: 80,
    proto: "TCP",
    service: "HTTP",
    description: "Unencrypted web traffic.",
    note: "Cleartext. Normally only kept open to redirect to HTTPS.",
  },
  {
    port: 88,
    proto: "TCP/UDP",
    service: "Kerberos",
    description: "Ticket requests to the KDC, the authentication core of Active Directory.",
    note: "AS-REP roasting and Kerberoasting both start with ordinary-looking traffic here.",
  },
  {
    port: 102,
    proto: "TCP",
    service: "ISO-TSAP / S7comm",
    description: "ISO transport over TCP, the carrier for Siemens S7 PLC communication.",
    note: "Industrial control traffic with no authentication in its base form.",
  },
  {
    port: 110,
    proto: "TCP",
    service: "POP3",
    description: "Mailbox retrieval, usually downloading and deleting.",
    note: "Cleartext unless STARTTLS is negotiated. Prefer 995.",
  },
  {
    port: 111,
    proto: "TCP/UDP",
    service: "rpcbind / portmapper",
    description: "Maps ONC RPC program numbers to the ports they are listening on, including NFS.",
    note: "Enumerable with rpcinfo, and a UDP amplification vector. Do not expose it.",
  },
  {
    port: 113,
    proto: "TCP",
    service: "ident",
    description: "Identifies the user behind a TCP connection. Still used by some IRC networks.",
  },
  {
    port: 119,
    proto: "TCP",
    service: "NNTP",
    description: "Usenet news article transfer.",
  },
  {
    port: 123,
    proto: "UDP",
    service: "NTP",
    description: "Clock synchronisation. Accurate time is a prerequisite for Kerberos and for log correlation.",
    note: "Older daemons answering monlist were a major amplification source. Restrict queries.",
  },
  {
    port: 135,
    proto: "TCP",
    service: "MS RPC endpoint mapper",
    description: "Tells a Windows client which dynamic port a given RPC service is on.",
    note: "Never expose to the internet. It is the front door to most Windows remote services.",
  },
  {
    port: 137,
    proto: "UDP",
    service: "NetBIOS name service",
    description: "Legacy Windows name registration and resolution.",
    note: "Poisonable with Responder to capture NTLM hashes. Disable NetBIOS over TCP/IP.",
  },
  {
    port: 138,
    proto: "UDP",
    service: "NetBIOS datagram",
    description: "Connectionless NetBIOS traffic, including browser service announcements.",
  },
  {
    port: 139,
    proto: "TCP",
    service: "NetBIOS session",
    description: "SMB carried over NetBIOS, the pre-2000 file sharing path.",
    note: "Legacy SMB. Prefer 445 and disable SMBv1 entirely.",
  },
  {
    port: 143,
    proto: "TCP",
    service: "IMAP",
    description: "Server-side mailbox access, keeping mail on the server.",
    note: "Cleartext unless STARTTLS is negotiated. Prefer 993.",
  },
  {
    port: 161,
    proto: "UDP",
    service: "SNMP",
    description: "Device monitoring: interface counters, uptime, temperature, and configuration.",
    note: "v1 and v2c send the community string in cleartext, and 'public' is still everywhere. Use v3.",
  },
  {
    port: 162,
    proto: "UDP",
    service: "SNMP trap",
    description: "Unsolicited alerts pushed from a device to a monitoring station.",
  },
  {
    port: 179,
    proto: "TCP",
    service: "BGP",
    description: "The routing protocol that holds the internet together.",
    note: "Peer with explicit neighbours only, authenticate the session, and filter prefixes both ways.",
  },
  {
    port: 194,
    proto: "TCP",
    service: "IRC",
    description: "Internet Relay Chat, the registered port.",
  },
  {
    port: 389,
    proto: "TCP/UDP",
    service: "LDAP",
    description: "Directory queries and binds, the read path into Active Directory.",
    note: "A simple bind over plain LDAP sends the password in cleartext. UDP LDAP amplifies.",
  },
  {
    port: 427,
    proto: "TCP/UDP",
    service: "SLP",
    description: "Service Location Protocol, used by some storage and virtualisation appliances.",
    note: "A high-factor amplification vector; several vendors shipped it enabled by default.",
  },
  {
    port: 443,
    proto: "TCP/UDP",
    service: "HTTPS",
    description: "TLS-protected web traffic over TCP, and HTTP/3 over QUIC on UDP.",
    note: "Encrypted does not mean inspected. SNI and certificate details are still visible.",
  },
  {
    port: 445,
    proto: "TCP",
    service: "SMB",
    description: "Windows file and printer sharing, directly over TCP.",
    note: "The EternalBlue and ransomware highway. Block at the perimeter without exception.",
  },
  {
    port: 464,
    proto: "TCP/UDP",
    service: "Kerberos kpasswd",
    description: "Password change and set operations against the KDC.",
  },
  {
    port: 465,
    proto: "TCP",
    service: "SMTPS (submissions)",
    description: "Mail submission wrapped in TLS from the first byte, per RFC 8314.",
  },
  {
    port: 500,
    proto: "UDP",
    service: "ISAKMP / IKE",
    description: "Key negotiation for IPsec tunnels.",
    note: "Aggressive mode with a pre-shared key leaks a crackable hash to any peer that asks.",
  },
  {
    port: 502,
    proto: "TCP",
    service: "Modbus TCP",
    description: "Industrial control: reads and writes registers and coils on PLCs.",
    note: "No authentication and no encryption by design. Anyone who can reach it can command it.",
  },
  {
    port: 512,
    proto: "TCP",
    service: "rexec",
    description: "Remote command execution from the Berkeley r-services family.",
    note: "Cleartext credentials. Removed from modern distributions for good reason.",
  },
  {
    port: 513,
    proto: "TCP",
    service: "rlogin",
    description: "Remote login trusting .rhosts entries rather than a password.",
    note: "Host-based trust with no cryptography. Trivially spoofed.",
  },
  {
    port: 514,
    proto: "TCP",
    service: "rsh",
    description: "Remote shell, the third of the Berkeley r-services.",
    note: "Same trust model as rlogin, same problems.",
  },
  {
    port: 514,
    proto: "UDP",
    service: "syslog",
    description: "The classic log transport. Fire and forget, with no delivery guarantee.",
    note: "Unauthenticated and cleartext, so log entries can be forged. Use 6514 for TLS.",
  },
  {
    port: 515,
    proto: "TCP",
    service: "LPD",
    description: "Line Printer Daemon, the Berkeley printing protocol.",
  },
  {
    port: 520,
    proto: "UDP",
    service: "RIP",
    description: "Routing Information Protocol versions 1 and 2.",
    note: "RIPv1 has no authentication at all, so routes can be injected by anyone on the segment.",
  },
  {
    port: 521,
    proto: "UDP",
    service: "RIPng",
    description: "The IPv6 version of RIP.",
  },
  {
    port: 546,
    proto: "UDP",
    service: "DHCPv6 client",
    description: "The client side of stateful IPv6 address assignment.",
  },
  {
    port: 547,
    proto: "UDP",
    service: "DHCPv6 server",
    description: "The server side of stateful IPv6 address assignment.",
  },
  {
    port: 548,
    proto: "TCP",
    service: "AFP",
    description: "Apple Filing Protocol, the older macOS file sharing transport.",
  },
  {
    port: 554,
    proto: "TCP/UDP",
    service: "RTSP",
    description: "Stream control for IP cameras and media servers.",
    note: "Enormous numbers of cameras sit on this port with default or absent credentials.",
  },
  {
    port: 587,
    proto: "TCP",
    service: "SMTP submission",
    description: "Where a mail client hands outbound mail to its own server, with STARTTLS.",
    note: "Should always require authentication. This is the port clients use, not 25.",
  },
  {
    port: 593,
    proto: "TCP",
    service: "RPC over HTTP",
    description: "Windows RPC tunnelled inside HTTP, used by Exchange and DCOM.",
  },
  {
    port: 601,
    proto: "TCP",
    service: "Syslog over TCP",
    description: "Reliable syslog delivery, with acknowledgement.",
  },
  {
    port: 623,
    proto: "UDP",
    service: "IPMI / RMCP",
    description: "Out-of-band server management: power, console, and firmware, independent of the OS.",
    note: "Cipher zero and hash-disclosure flaws are unfixed in many BMCs. Keep it on a management VLAN.",
  },
  {
    port: 631,
    proto: "TCP/UDP",
    service: "IPP / CUPS",
    description: "Internet Printing Protocol and the CUPS administration interface.",
  },
  {
    port: 636,
    proto: "TCP",
    service: "LDAPS",
    description: "LDAP wrapped in TLS from the first byte.",
  },
  {
    port: 749,
    proto: "TCP",
    service: "Kerberos kadmin",
    description: "Administrative access to the Kerberos database.",
  },
  {
    port: 853,
    proto: "TCP/UDP",
    service: "DNS over TLS / QUIC",
    description: "Encrypted DNS transport, TCP for DoT and UDP for DoQ.",
    note: "Hides query contents from the local network, which also hides them from your own monitoring.",
  },
  {
    port: 873,
    proto: "TCP",
    service: "rsync",
    description: "The rsync daemon, distinct from rsync tunnelled over SSH.",
    note: "Daemon-mode modules are frequently left world-readable and world-writable.",
  },
  {
    port: 989,
    proto: "TCP",
    service: "FTPS data",
    description: "Implicit TLS FTP data channel.",
  },
  {
    port: 990,
    proto: "TCP",
    service: "FTPS control",
    description: "Implicit TLS FTP control channel.",
  },
  {
    port: 992,
    proto: "TCP",
    service: "Telnet over TLS",
    description: "Telnet wrapped in TLS. Rare, but it exists.",
  },
  {
    port: 993,
    proto: "TCP",
    service: "IMAPS",
    description: "IMAP wrapped in TLS from the first byte.",
  },
  {
    port: 995,
    proto: "TCP",
    service: "POP3S",
    description: "POP3 wrapped in TLS from the first byte.",
  },
  {
    port: 1080,
    proto: "TCP",
    service: "SOCKS",
    description: "A generic proxy protocol, also the transport for SSH dynamic forwarding.",
    note: "Open SOCKS proxies get conscripted for spam and scanning within days.",
  },
  {
    port: 1099,
    proto: "TCP",
    service: "Java RMI registry",
    description: "The naming service Java remote objects register with.",
    note: "A long history of remote code execution through unsafe deserialisation.",
  },
  {
    port: 1194,
    proto: "UDP",
    service: "OpenVPN",
    description: "The OpenVPN default port. It also runs over TCP when UDP is blocked.",
  },
  {
    port: 1433,
    proto: "TCP",
    service: "Microsoft SQL Server",
    description: "The default instance listener.",
    note: "Brute forcing sa and abusing xp_cmdshell is a standard path from database to shell.",
  },
  {
    port: 1434,
    proto: "UDP",
    service: "SQL Server Browser",
    description: "Tells clients which port a named instance is listening on.",
    note: "An amplification vector, and the vector the 2003 Slammer worm used.",
  },
  {
    port: 1521,
    proto: "TCP",
    service: "Oracle TNS listener",
    description: "The listener that hands client connections to Oracle database instances.",
    note: "Unauthenticated listeners have historically leaked SIDs and accepted remote configuration.",
  },
  {
    port: 1701,
    proto: "UDP",
    service: "L2TP",
    description: "Layer 2 tunnelling, almost always paired with IPsec for confidentiality.",
    note: "L2TP alone provides no encryption whatsoever.",
  },
  {
    port: 1723,
    proto: "TCP",
    service: "PPTP",
    description: "Microsoft's legacy VPN protocol.",
    note: "MS-CHAPv2 is broken and PPTP should be considered plaintext. Migrate off it.",
  },
  {
    port: 1812,
    proto: "UDP",
    service: "RADIUS authentication",
    description: "Network access authentication for 802.1X, VPNs, and Wi-Fi.",
    note: "Only the password field is obscured, and it uses MD5. Tunnel RADIUS or use RadSec.",
  },
  {
    port: 1813,
    proto: "UDP",
    service: "RADIUS accounting",
    description: "Session start, stop, and usage records.",
  },
  {
    port: 1883,
    proto: "TCP",
    service: "MQTT",
    description: "Lightweight publish and subscribe messaging for IoT.",
    note: "Frequently deployed with anonymous access and wildcard subscriptions enabled.",
  },
  {
    port: 1900,
    proto: "UDP",
    service: "SSDP / UPnP",
    description: "Device discovery for UPnP: printers, media servers, and consumer routers.",
    note: "A major reflection and amplification source, and a way to punch holes through NAT.",
  },
  {
    port: 1935,
    proto: "TCP",
    service: "RTMP",
    description: "Real-Time Messaging Protocol, still used for live video ingest.",
  },
  {
    port: 2049,
    proto: "TCP/UDP",
    service: "NFS",
    description: "Unix network file system.",
    note: "Classic NFS trusts client-supplied UIDs. Export narrowly and prefer Kerberos-backed NFSv4.",
  },
  {
    port: 2082,
    proto: "TCP",
    service: "cPanel",
    description: "The cPanel hosting control panel over HTTP.",
  },
  {
    port: 2083,
    proto: "TCP",
    service: "cPanel over TLS",
    description: "The cPanel hosting control panel over HTTPS.",
  },
  {
    port: 2375,
    proto: "TCP",
    service: "Docker API",
    description: "The Docker daemon's remote API, unencrypted and unauthenticated.",
    note: "Reaching this is equivalent to root on the host. It should never listen on a public address.",
  },
  {
    port: 2376,
    proto: "TCP",
    service: "Docker API over TLS",
    description: "The Docker remote API with mutual TLS client certificates.",
  },
  {
    port: 2379,
    proto: "TCP",
    service: "etcd client",
    description: "The key-value store holding all Kubernetes cluster state.",
    note: "Read access to etcd is read access to every secret in the cluster.",
  },
  {
    port: 2380,
    proto: "TCP",
    service: "etcd peer",
    description: "Replication traffic between etcd cluster members.",
  },
  {
    port: 3128,
    proto: "TCP",
    service: "Squid proxy",
    description: "The Squid caching HTTP proxy default port.",
    note: "An unrestricted proxy lets outsiders reach anything your network can reach.",
  },
  {
    port: 3260,
    proto: "TCP",
    service: "iSCSI target",
    description: "Block storage over TCP, presenting remote disks as local ones.",
    note: "Without CHAP, any host that can reach the target can mount the volume.",
  },
  {
    port: 3268,
    proto: "TCP",
    service: "AD Global Catalog",
    description: "Forest-wide LDAP searches against a partial replica of every domain.",
  },
  {
    port: 3269,
    proto: "TCP",
    service: "AD Global Catalog over TLS",
    description: "The Global Catalog wrapped in TLS.",
  },
  {
    port: 3306,
    proto: "TCP",
    service: "MySQL / MariaDB",
    description: "The default database listener.",
    note: "Should bind to localhost or a private interface. It is a permanent scan target.",
  },
  {
    port: 3389,
    proto: "TCP/UDP",
    service: "RDP",
    description: "Windows Remote Desktop, with a UDP transport for better performance.",
    note: "Exposed RDP is the single most common ransomware entry point. Put it behind a VPN.",
  },
  {
    port: 3478,
    proto: "UDP",
    service: "STUN / TURN",
    description: "NAT traversal for WebRTC and VoIP, discovering and relaying through public addresses.",
    note: "An open TURN relay can be used to proxy traffic into your internal network.",
  },
  {
    port: 3690,
    proto: "TCP",
    service: "Subversion",
    description: "The svn:// native protocol.",
  },
  {
    port: 4369,
    proto: "TCP",
    service: "Erlang port mapper",
    description: "epmd, which tells Erlang and Elixir nodes how to find each other. Used by RabbitMQ.",
    note: "A shared Erlang cookie is the only authentication. Exposure means remote code execution.",
  },
  {
    port: 4444,
    proto: "TCP",
    service: "Metasploit handler",
    description: "Not an IANA assignment, but the default listener for Metasploit reverse shells.",
    note: "Outbound connections to 4444 in a capture are worth investigating immediately.",
  },
  {
    port: 4500,
    proto: "UDP",
    service: "IPsec NAT-T",
    description: "IPsec encapsulated in UDP so it can survive NAT.",
  },
  {
    port: 5044,
    proto: "TCP",
    service: "Elastic Beats",
    description: "Where Filebeat and friends ship events to Logstash.",
  },
  {
    port: 5060,
    proto: "TCP/UDP",
    service: "SIP",
    description: "Session setup for VoIP calls.",
    note: "Scanned constantly for toll fraud. Weak extension passwords turn into a phone bill.",
  },
  {
    port: 5061,
    proto: "TCP",
    service: "SIP over TLS",
    description: "SIP signalling protected by TLS. Media still needs SRTP separately.",
  },
  {
    port: 5222,
    proto: "TCP",
    service: "XMPP client",
    description: "Client connections to an XMPP/Jabber server.",
  },
  {
    port: 5269,
    proto: "TCP",
    service: "XMPP server",
    description: "Server-to-server federation between XMPP domains.",
  },
  {
    port: 5353,
    proto: "UDP",
    service: "mDNS",
    description: "Multicast DNS, the .local name resolution behind Bonjour and Avahi.",
    note: "Broadcasts hostnames, services, and often device models to the whole segment.",
  },
  {
    port: 5355,
    proto: "TCP/UDP",
    service: "LLMNR",
    description: "Windows link-local name resolution, tried when DNS fails.",
    note: "Trivially poisoned to harvest NTLM hashes. Disable it by policy alongside NetBIOS.",
  },
  {
    port: 5432,
    proto: "TCP",
    service: "PostgreSQL",
    description: "The default PostgreSQL listener.",
    note: "Check pg_hba.conf: a 'trust' line on a routable interface is an open database.",
  },
  {
    port: 5555,
    proto: "TCP",
    service: "Android Debug Bridge",
    description: "ADB over TCP, when a device has been switched out of USB debugging.",
    note: "Unauthenticated shell access to the device. Worms have spread over exactly this.",
  },
  {
    port: 5601,
    proto: "TCP",
    service: "Kibana",
    description: "The Elastic Stack web interface.",
  },
  {
    port: 5672,
    proto: "TCP",
    service: "AMQP",
    description: "Advanced Message Queuing Protocol, the RabbitMQ default.",
    note: "The guest/guest account is disabled remotely by default, but only by default.",
  },
  {
    port: 5800,
    proto: "TCP",
    service: "VNC over HTTP",
    description: "The Java applet front end some VNC servers publish alongside the RFB port.",
  },
  {
    port: 5900,
    proto: "TCP",
    service: "VNC / RFB",
    description: "Remote framebuffer. Additional displays run on 5901, 5902, and upward.",
    note: "Classic VNC authentication is capped at eight characters and is often absent entirely.",
  },
  {
    port: 5938,
    proto: "TCP",
    service: "TeamViewer",
    description: "The TeamViewer remote access client's preferred port.",
  },
  {
    port: 5985,
    proto: "TCP",
    service: "WinRM over HTTP",
    description: "Windows Remote Management, the transport under PowerShell Remoting.",
    note: "A primary lateral movement path once one set of domain credentials is known.",
  },
  {
    port: 5986,
    proto: "TCP",
    service: "WinRM over HTTPS",
    description: "WinRM with TLS. Still credential-based, just not in cleartext.",
  },
  {
    port: 6000,
    display: "6000-6063",
    proto: "TCP",
    service: "X11",
    description: "The X Window System display server. Display :0 is 6000, :1 is 6001, and so on.",
    note: "An 'xhost +' server lets anyone read the screen and inject keystrokes.",
  },
  {
    port: 6379,
    proto: "TCP",
    service: "Redis",
    description: "In-memory data store, often used as a cache or a queue.",
    note: "Older builds had no authentication at all, and CONFIG SET can write files as the Redis user.",
  },
  {
    port: 6443,
    proto: "TCP",
    service: "Kubernetes API server",
    description: "The control plane endpoint every kubectl command talks to.",
    note: "Anonymous or over-permissive RBAC here is cluster-wide compromise.",
  },
  {
    port: 6514,
    proto: "TCP",
    service: "Syslog over TLS",
    description: "Syslog with transport encryption and server authentication, per RFC 5425.",
  },
  {
    port: 6667,
    proto: "TCP",
    service: "IRC",
    description: "The conventional IRC port, more common in practice than 194.",
    note: "A long-standing botnet command and control channel. Unusual on a corporate network.",
  },
  {
    port: 7001,
    proto: "TCP",
    service: "Oracle WebLogic",
    description: "The WebLogic administration and application server default listener.",
    note: "Repeated critical deserialisation vulnerabilities. Patch promptly and keep it internal.",
  },
  {
    port: 8000,
    proto: "TCP",
    service: "HTTP alternate",
    description: "By convention rather than assignment: development servers and appliance interfaces.",
  },
  {
    port: 8009,
    proto: "TCP",
    service: "AJP13",
    description: "Apache JServ Protocol, the binary connector between a web server and Tomcat.",
    note: "Ghostcat (CVE-2020-1938) turned an exposed AJP port into arbitrary file read.",
  },
  {
    port: 8080,
    proto: "TCP",
    service: "HTTP proxy / alternate",
    description: "The most common alternate web port: proxies, Tomcat, and container-mapped services.",
    note: "Often an application server that was never meant to face the internet directly.",
  },
  {
    port: 8291,
    proto: "TCP",
    service: "MikroTik Winbox",
    description: "The management protocol for MikroTik RouterOS.",
    note: "CVE-2018-14847 leaked credentials from this port and was exploited at scale.",
  },
  {
    port: 8443,
    proto: "TCP",
    service: "HTTPS alternate",
    description: "The usual second HTTPS port: appliance consoles, Tomcat, and management interfaces.",
  },
  {
    port: 8888,
    proto: "TCP",
    service: "HTTP alternate / Jupyter",
    description: "Another conventional web port, and the Jupyter Notebook default.",
    note: "A Jupyter server with no token is arbitrary code execution as its user.",
  },
  {
    port: 9000,
    proto: "TCP",
    service: "PHP-FPM",
    description: "The FastCGI process manager, normally spoken to only by the local web server.",
    note: "Reachable FastCGI accepts arbitrary script paths and environment, which means code execution.",
  },
  {
    port: 9090,
    proto: "TCP",
    service: "Prometheus / Cockpit",
    description: "The Prometheus web interface, and the Cockpit Linux admin console on the same number.",
    note: "Metrics endpoints leak hostnames, versions, and internal topology.",
  },
  {
    port: 9092,
    proto: "TCP",
    service: "Apache Kafka",
    description: "The Kafka broker listener.",
    note: "Plaintext listeners with no ACLs let any client read every topic.",
  },
  {
    port: 9200,
    proto: "TCP",
    service: "Elasticsearch HTTP",
    description: "The REST and JSON query interface.",
    note: "Unauthenticated clusters on this port are behind a long list of public data leaks.",
  },
  {
    port: 9300,
    proto: "TCP",
    service: "Elasticsearch transport",
    description: "Node-to-node clustering traffic.",
  },
  {
    port: 9418,
    proto: "TCP",
    service: "Git protocol",
    description: "The git:// daemon transport.",
    note: "No authentication and no encryption. Anonymous read only, and even then prefer HTTPS or SSH.",
  },
  {
    port: 10000,
    proto: "TCP",
    service: "Webmin",
    description: "A web-based Unix system administration panel.",
    note: "Full root-level administration over HTTP. Historically vulnerable and heavily scanned.",
  },
  {
    port: 11211,
    proto: "TCP/UDP",
    service: "Memcached",
    description: "A distributed memory cache with no authentication in its default configuration.",
    note: "UDP memcached produced the largest amplification attacks on record. Disable UDP and bind locally.",
  },
  {
    port: 15672,
    proto: "TCP",
    service: "RabbitMQ management",
    description: "The RabbitMQ web management plugin and its HTTP API.",
  },
  {
    port: 20000,
    proto: "TCP/UDP",
    service: "DNP3",
    description: "Distributed Network Protocol, common in electric and water utility SCADA.",
    note: "Authentication is an optional extension that is rarely deployed.",
  },
  {
    port: 27017,
    proto: "TCP",
    service: "MongoDB",
    description: "The default mongod listener.",
    note: "Old defaults bound to every interface with no authentication, and the ransom notes followed.",
  },
  {
    port: 33060,
    proto: "TCP",
    service: "MySQL X Protocol",
    description: "The document-store protocol MySQL exposes alongside 3306.",
  },
  {
    port: 44818,
    proto: "TCP",
    service: "EtherNet/IP",
    description: "Explicit messaging for CIP, used by Allen-Bradley and Rockwell controllers.",
    note: "Industrial protocol with no built-in authentication. Segment it.",
  },
  {
    port: 47808,
    proto: "UDP",
    service: "BACnet",
    description: "Building automation: HVAC, lighting, access control. The port is 0xBAC0.",
    note: "Internet-exposed BACnet devices let strangers change setpoints in real buildings.",
  },
];

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "TCP", label: "TCP" },
  { id: "UDP", label: "UDP" },
];

export function PortReference() {
  const [query, setQuery] = useState("");
  const [proto, setProto] = useState("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PORTS.filter((entry) => {
      if (proto !== "all" && !entry.proto.includes(proto)) return false;
      if (!needle) return true;
      const haystack = [
        String(entry.port),
        entry.display ?? "",
        entry.proto,
        entry.service,
        entry.description,
        entry.note ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, proto]);

  return (
    <ToolShell
      slug="port-reference"
    >
      <div className="space-y-6">
        <ToolPanel title="Filter">
          <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
            <div>
              <label
                htmlFor="port-search"
                className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
              >
                Search port, service, or description
              </label>
              <input
                id="port-search"
                type="search"
                value={query}
                spellCheck={false}
                autoComplete="off"
                data-testid="input-port-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="kerberos, 445, amplification"
                className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
            </div>
            <fieldset>
              <legend className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Protocol
              </legend>
              <div className="mt-3 flex gap-2">
                {FILTERS.map((filter) => {
                  const active = filter.id === proto;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`button-proto-${filter.id}`}
                      onClick={() => setProto(filter.id)}
                      className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-4 font-mono-tight text-[11px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                        active
                          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
                          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <p role="status" className="mt-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            {rows.length} of {PORTS.length} entries
          </p>
        </ToolPanel>

        <ToolPanel title="Ports">
          {rows.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              No entries match that filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <caption className="sr-only">
                  Well-known TCP and UDP ports with descriptions and security notes
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Port", "Proto", "Service", "Description", "Security note"].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="py-2 pr-4 align-bottom font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr
                      key={`${entry.port}-${entry.proto}-${entry.service}`}
                      className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top"
                    >
                      <th
                        scope="row"
                        className="whitespace-nowrap py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-signal))]"
                      >
                        {entry.display ?? entry.port}
                      </th>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        {entry.proto}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {entry.service}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {entry.description}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                        {entry.note ? (
                          <>
                            <span aria-hidden="true">! </span>
                            {entry.note}
                          </>
                        ) : (
                          <span className="text-[hsl(var(--brand-iron))]">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
