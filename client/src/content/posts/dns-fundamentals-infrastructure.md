
## DNS is everything

Something on your network stopped working and you cannot tell why. SSH to the IP address works, SSH to the hostname hangs for five seconds and then fails. Or half your machines can reach the internet and the other half cannot, and the only difference is which resolver DHCP handed them. That is a DNS problem, and it is the single most common cause of "the network is down" complaints.

If DNS is not working, nothing works. Web browsers cannot resolve domain names. Active Directory cannot find domain controllers. Email cannot route to mail servers. Monitoring systems cannot identify hosts. DNS is the foundation that everything else depends on, and because it fails by hanging rather than by returning a clean error, it looks like a hundred other problems before it looks like itself.

## How a query actually resolves

DNS translates human-readable domain names into IP addresses. When you type a URL into a browser, your computer asks a DNS resolver for the IP address. The resolver checks its cache, and if it does not have the answer, it queries authoritative DNS servers in a hierarchical process that starts at the root servers and works down through the domain hierarchy.

It helps to be precise about the pieces, because the terminology is where most confusion starts.

The **stub resolver** is the small piece of code inside your operating system. It does not walk the hierarchy. It sends one question to whatever resolver is configured in `/etc/resolv.conf` or handed down by DHCP, and waits for a final answer.

The **recursive resolver** does the actual work. Given a name it has never seen, it asks a root server, gets back a referral to the TLD servers, asks those, gets a referral to the zone's authoritative servers, asks those, and finally gets an answer. It caches everything it learns along the way.

The **authoritative server** holds the real zone data. It never asks anyone else. It either has the answer or it tells you the name does not exist.

The hierarchy is walked from the right of the name to the left. For `pve01.lab.example.com`, a resolver starts at the root, then `com`, then `example.com`. Each step is a referral, not a redirect: the resolver keeps control and makes every query itself.

DNS runs on port 53, over both UDP and TCP. A classic DNS message over UDP is limited to 512 bytes of payload, and a larger response comes back with the truncation bit set so the client retries over TCP. EDNS(0) lets the client advertise a bigger UDP buffer, which is why most modern responses still fit in one packet. Blocking TCP port 53 because "DNS is UDP" breaks large responses in a way that only shows up occasionally.

## The records you will actually touch

- **A** maps a name to an IPv4 address. **AAAA** maps a name to an IPv6 address.
- **CNAME** is an alias to another name. A CNAME cannot coexist with other record types at the same name, which is why you cannot put a CNAME at the apex of a zone.
- **PTR** maps an address back to a name, in the `in-addr.arpa` tree. Reverse DNS is what makes your logs readable and what a lot of mail infrastructure checks.
- **MX** points at mail servers, with a preference number where lower wins.
- **NS** delegates a subtree to another set of authoritative servers.
- **SOA** carries the zone's serial number and timing parameters. The last field of the SOA is the negative caching TTL, which controls how long a resolver remembers that a name does not exist. That field is why a newly created record can appear to be missing for longer than its own TTL suggests.
- **SRV** advertises a service, port, and target host. Active Directory depends on it heavily.
- **TXT** holds arbitrary text, and in practice holds SPF, DKIM, and domain ownership proofs.

## My DNS setup

I run two BIND DNS servers in my lab on separate VMs for redundancy. They serve as authoritative servers for my internal domain and as recursive resolvers for external queries.

Internal DNS means I can access my servers by name instead of IP address. Instead of remembering that the Proxmox host is at 10.0.20.5, I type pve01.lab.local. When I reconfigure IP addresses, I update DNS once instead of updating every configuration file that references the old IP.

Two servers is the minimum worth having. One resolver is not redundancy, it is a single point of failure under every other service you run. The rule I follow is that the two must not share a failure domain: not the same hypervisor host, not the same storage pool, ideally not the same power circuit. A pair of resolvers that both live on the host you are rebooting is a pair of resolvers that are both down.

## Split DNS

I use split DNS (also called split-horizon DNS) so internal queries resolve to internal addresses and external queries resolve normally. My FortiGate handles this by directing DNS queries from internal VLANs to my internal DNS servers, while guest VLAN queries go directly to public DNS.

The reason to do this is hairpinning. Without split DNS, an internal client resolving your public hostname gets your public IP, sends traffic out to the firewall, and needs the firewall to turn it around and send it back inside. That works, sometimes, and it costs you the real client IP in your server logs. With split DNS the internal client gets the internal address and the traffic never leaves the LAN.

## Watching a resolution happen

I test DNS configurations with `dig` and `nslookup`. Both tools query DNS servers and show the response, including which server answered, the TTL, and the record type.

```bash
dig @10.0.20.10 pve01.lab.local
nslookup pve01.lab.local 10.0.20.10
```

The part of the output that matters is the header and the answer section:

```
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 42311
;; flags: qr aa rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; QUESTION SECTION:
;pve01.lab.local.               IN      A

;; ANSWER SECTION:
pve01.lab.local.        300     IN      A       10.0.20.5

;; Query time: 1 msec
;; SERVER: 10.0.20.10#53(10.0.20.10)
```

Read it in this order. `status: NOERROR` means the query succeeded. `NXDOMAIN` means the name does not exist, which is a different problem from `SERVFAIL`, which means the resolver tried and failed. The `aa` flag means the answering server is authoritative for this zone, so you are looking at real zone data and not a cached copy. The `300` before `IN A` is the remaining TTL in seconds, and on a cached answer it counts down every time you repeat the query, which is the quickest way to tell a cached answer from a fresh one.

To watch the full hierarchy walk instead of just the answer, use `dig +trace example.com`. It queries the root itself and prints every referral, which tells you exactly which level of the delegation is broken.

Always test from the perspective of the client that is having the problem. DNS issues are often specific to which resolver a client is using, and a query you run from your own workstation proves nothing about the machine that is actually failing.

## Common mistakes

**Using `.local` for an internal zone.** This is the one that bites hardest, because it half works. `.local` is reserved for Multicast DNS, and on macOS and on any Linux box running Avahi, names ending in `.local` are resolved by multicast on the local link rather than by your DNS server. Some clients will resolve a `.local` name correctly and some will not, on the same network, at the same time. Use a subdomain of a domain you actually own, such as `lab.example.com`. Renaming a zone later is far more work than picking correctly on day one, which is exactly why my own lab is still carrying a name I would not choose again.

**Running your resolvers on infrastructure that needs DNS to boot.** If both resolvers are VMs on a hypervisor cluster whose storage is mounted by hostname, a cold start deadlocks: storage waits for DNS, DNS waits for storage. Keep at least one resolver reachable by IP address in every config that runs early, and pin the hypervisor's own resolver settings to IP addresses.

**Forwarder loops.** Configure server A to forward to server B, and server B to forward to server A, and every external query bounces between them until it times out. Internal names still work, so the symptom looks like "the internet is broken" rather than "DNS is broken". Each recursive resolver should either forward upstream to something outside your network or perform full recursion itself, never to a peer that forwards back.

**Assuming a short TTL means fast propagation.** Lowering a TTL only takes effect after the old, longer TTL has expired everywhere. If a record has been sitting at 86400 seconds and you drop it to 300 the day of a migration, resolvers that cached the old value are still holding it for up to a day. Lower the TTL well before the change, then make the change, then raise it again. Long-lived processes make this worse: plenty of applications resolve a name once at startup and never look again, so no TTL will move them without a restart.

**Forgetting reverse DNS.** PTR records feel optional right up until you are reading a firewall log full of bare IP addresses during an incident, or a mail server rejects your outbound mail. Build the reverse zone at the same time as the forward zone.

**Editing a zone file and not bumping the serial.** BIND will load the file, but a secondary comparing serial numbers concludes nothing changed and never transfers the new data. The primary and the secondary then disagree, and which answer you get depends on which server the client happened to ask. Bump the serial on every edit, and confirm both servers agree by querying the SOA on each of them directly.

## References

- https://www.rfc-editor.org/rfc/rfc1034
- https://www.rfc-editor.org/rfc/rfc1035
- https://www.rfc-editor.org/rfc/rfc2181
- https://www.rfc-editor.org/rfc/rfc6762
- https://www.rfc-editor.org/rfc/rfc8499
- https://bind9.readthedocs.io/en/latest/manpages.html
