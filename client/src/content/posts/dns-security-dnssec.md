
## Why DNS Security Matters

DNS translates domain names to IP addresses. If an attacker can manipulate DNS responses, they can redirect traffic to malicious servers, intercept credentials, or block legitimate services entirely. DNS cache poisoning, DNS hijacking, and DNS-based data exfiltration are all real attack categories.

## DNSSEC

DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records. When a resolver queries a DNSSEC-enabled zone, it verifies that the response is signed by the correct key. This prevents an attacker from injecting fake responses.

DNSSEC creates a chain of trust from the root zone down to individual domains. Each level signs the next level's keys. If you are querying `example.com`, the resolver verifies the `com` zone's signature on the `example.com` key, and the root zone's signature on `com`.

To verify DNSSEC is working:
```bash
dig +dnssec example.com
# Look for the AD (Authenticated Data) flag in the response
```

## DNS over HTTPS (DoH) and DNS over TLS (DoT)

Traditional DNS queries are sent in plaintext. Anyone on the network path can see what domains you are resolving. DoH and DoT encrypt DNS queries:

- **DoT (RFC 7858):** DNS over TLS on port 853. Easy to block if an organization needs to inspect or filter DNS.
- **DoH (RFC 8484):** DNS over HTTPS on port 443. Looks like regular web traffic, harder to block.

Both improve privacy by preventing passive observation of DNS queries. In enterprise environments, DoT is often preferred because it is easier to manage at the network level.

## DNS Filtering

DNS-layer filtering blocks connections to known-malicious domains before a TCP connection is even attempted. Tools like Pi-hole block ad and tracking domains. Enterprise platforms like Cisco Umbrella provide threat intelligence and policy-based filtering.

Implementing DNS filtering is one of the highest-value, lowest-cost security controls you can deploy. Block domains associated with malware command-and-control, phishing, and known-bad infrastructure at the DNS layer and you stop a significant portion of threats before they get started.
