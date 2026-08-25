
## What TLS does

Your browser shows a red warning on the internal service you just stood up, the certificate you generated looks fine to you, and nothing you have read explains which of the dozen fields is the one the browser is objecting to. Certificates fail in ways that produce unhelpful errors, and the fastest way past that is to understand what the client is actually checking.

TLS (Transport Layer Security) encrypts communication between a client and a server. When you connect to a website over HTTPS, TLS ensures that nobody can read or modify the data in transit. It also verifies the identity of the server, so you know you are connected to the real site and not an impostor.

Those are three separate guarantees worth keeping apart: confidentiality, integrity, and authentication. Encryption gives you the first two. Certificates are entirely about the third, and almost every certificate error you will debug is an authentication failure, not an encryption failure.

## How certificates work

A TLS certificate is a digital document that binds a public key to a domain name (or IP address). The certificate is signed by a Certificate Authority (CA) that the client trusts. When a client connects, the server presents its certificate, the client verifies the CA's signature, and if everything checks out, they establish an encrypted connection.

The trust chain goes: client trusts CA -> CA signed the certificate -> certificate proves the server's identity.

In practice there is a middle layer. Root CAs keep their private keys offline and sign intermediate CAs, which do the day to day issuing. The real chain is root, intermediate, leaf, and the server must send the leaf plus every intermediate needed to reach a root the client already has. Only the root lives in the client's trust store. This is why a certificate that works in your browser fails from `curl`: the browser had the intermediate cached and filled the gap for you.

## What is actually inside one

A certificate is an X.509 structure, profiled for the internet by RFC 5280. The fields that matter operationally:

- **Subject** and **Issuer**: who this is for, and who signed it.
- **Validity**: notBefore and notAfter timestamps. Outside that window the certificate is invalid, full stop.
- **Subject Alternative Name (SAN)**: the list of names and IP addresses the certificate is actually valid for.
- **Basic Constraints**: whether this certificate is a CA and may sign others.
- **Key Usage** and **Extended Key Usage**: what the key is permitted to do, `serverAuth` being the one a TLS server needs.
- **Serial number** and the CA's **signature** over everything above.

The name check is the part people get wrong. Hostname verification is done against the SAN extension, not the Common Name. Common Name as an identity field was deprecated by RFC 6125 and browsers stopped honouring it years ago. A certificate with `CN=nas.lab.internal` and no SAN entry will be rejected by every modern client with an error that says nothing about SANs.

## The handshake, briefly

Over TLS 1.3, defined in RFC 8446, the client opens a connection to TCP port 443 and sends a ClientHello that already includes a key share guess. The server replies with its ServerHello, its certificate chain, a CertificateVerify signature proving it holds the matching private key, and a Finished message. One round trip, and application data flows.

Two details matter. The certificate proves nothing on its own, since anyone can copy a public certificate; CertificateVerify, a signature over the handshake transcript made with the private key, is what proves possession. And TLS 1.3 removed static RSA key exchange, so every connection uses ephemeral keys and gets forward secrecy: recording the traffic today and stealing the server key later does not decrypt it.

## Certificate types

**Domain Validated (DV):** The CA verifies that you control the domain name. This is the most common type and what Let's Encrypt provides for free. Good for most use cases.

**Organization Validated (OV):** The CA also verifies that your organization exists. Adds the organization name to the certificate.

**Extended Validation (EV):** The CA performs thorough verification of the organization. Used to display the organization name in the browser's address bar (though most browsers have stopped showing this prominently).

Cryptographically these are identical. The difference is only in what the CA checked before issuing, and since browsers removed the EV indicator the practical difference for a visitor is approximately zero. Do not pay for a validation level expecting a technical benefit.

## Self-signed certificates and running your own CA

For internal infrastructure, I use self-signed certificates generated with my own internal CA. This means I do not need to expose internal services to the internet for domain validation, and I can issue certificates for any internal hostname or IP.

I set up a simple CA using openssl:

```bash
openssl req -x509 -newkey rsa:4096 -keyout ca-key.pem -out ca-cert.pem -days 3650 -nodes
```

I distribute the CA certificate to all internal machines so they trust certificates signed by my internal CA.

Issuing a server certificate from that CA is three steps. Generate a key and a signing request:

```bash
openssl req -newkey rsa:2048 -nodes \
  -keyout server-key.pem -out server.csr \
  -subj "/CN=nas.lab.internal"
```

Write the extensions, because this is where the SAN comes from and a CSR's own SAN is not carried over by default:

```bash
cat > san.ext <<'EOF'
subjectAltName = DNS:nas.lab.internal, DNS:nas, IP:10.0.10.20
extendedKeyUsage = serverAuth
EOF
```

Sign it:

```bash
openssl x509 -req -in server.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -days 825 -sha256 -extfile san.ext
```

Then verify before you deploy it, rather than finding out from a browser:

```bash
openssl verify -CAfile ca-cert.pem server-cert.pem
openssl x509 -in server-cert.pem -noout -subject -dates -ext subjectAltName
```

Correct output looks like this:

```
server-cert.pem: OK
subject=CN = nas.lab.internal
notBefore=Aug 25 18:02:11 2026 GMT
notAfter=Nov 28 18:02:11 2028 GMT
X509v3 Subject Alternative Name:
    DNS:nas.lab.internal, DNS:nas, IP Address:10.0.10.20
```

`OK` from `openssl verify` means the chain builds and the signature checks out. The SAN block is the part to actually read: if it is missing, the certificate will fail in every browser regardless of what the subject says.

## Let's Encrypt for public services

For any service exposed to the internet, I use Let's Encrypt certificates. They are free, automatically renewed, and trusted by all major browsers. Certbot handles the issuance and renewal process automatically.

The protocol underneath is ACME, standardised as RFC 8555. The CA gives your client a challenge and the client proves control of the name by answering it. The three that matter: http-01 serves a token at a well-known path over port 80, tls-alpn-01 answers on port 443 using a special ALPN protocol, and dns-01 publishes a TXT record at `_acme-challenge.<name>`.

Only dns-01 can issue wildcards, and it is the only one that works for a host with no inbound internet access, which makes it the right choice for internal services that still want a publicly trusted certificate.

Let's Encrypt certificates are valid for 90 days and clients renew at 30 days remaining, leaving a month of runway if renewal starts failing. The short lifetime is deliberate: it forces automation, and renewal that runs every 60 days is far more reliable than a manual process performed annually. For context, the CA/Browser Forum limit for publicly trusted TLS certificates has been 398 days since 2020, and it continues to move shorter.

## Certificate management

The biggest challenge with certificates is tracking expiration dates. An expired certificate causes service outages and browser warnings. I monitor certificate expiration with a simple script that checks each certificate's validity date and alerts me 30 days before expiration.

The check is one command per host. `-checkend` takes seconds and exits non-zero if the certificate expires within that window, so 2592000 is exactly 30 days:

```bash
for host in nas.lab.internal git.lab.internal; do
  if ! echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
       | openssl x509 -noout -checkend 2592000 >/dev/null; then
    echo "EXPIRING SOON: $host"
  fi
done
```

Silence means every certificate has more than 30 days left. Use `-enddate` instead of `-checkend` when you want the actual date printed:

```
notAfter=Nov 28 18:02:11 2028 GMT
```

Note the `-servername` flag. Without it, `s_client` sends no SNI, and a server hosting several sites on one address will hand you the default certificate rather than the one you meant to check, so your monitoring quietly watches the wrong thing.

Revocation deserves a mention even though it rarely works well. CRLs are published lists of revoked serial numbers; OCSP (RFC 6960) is an online query for one certificate's status. Both have real deployment problems, and clients often fail open when the check is unavailable. The industry's answer has been short lifetimes instead: a certificate that expires in weeks limits the damage from a stolen key more reliably than a revocation check that may never happen.

## Common mistakes

**No SAN entry.** The single most common self-signed certificate failure. Modern clients verify the hostname against SAN only, so a certificate with just a Common Name is rejected. Always pass an extensions file when signing, and confirm with `openssl x509 -noout -ext subjectAltName`.

**Serving the leaf without the intermediates.** Works in the browser that already cached the intermediate, fails from `curl`, mobile apps, and anything with a strict chain builder. The server must send the full chain below the root. Check with `openssl s_client -connect host:443` and read the certificate chain it prints.

**Trusting your internal CA on servers but not in applications.** A Python script, a Java service, and the OS each consult a different trust store. Adding your root to the OS store does not make `requests` or a JVM trust it. Point each runtime at the CA bundle explicitly.

**A renewal that succeeds but never gets loaded.** Certbot writes a new certificate and the service keeps serving the old one from memory until it is reloaded. Certificates expire on a service that renewed perfectly for months. Use the renewal hook to reload the web server, and verify against the live port rather than against the file on disk.

**Clock skew.** Validity is checked against the client's clock. A device whose time is wrong by more than the certificate's notBefore margin rejects a perfectly good certificate, and a freshly imaged machine with no NTP is the classic case. If a certificate error appears on exactly one host, check its clock before you check anything else.

## References

- https://www.rfc-editor.org/rfc/rfc8446
- https://www.rfc-editor.org/rfc/rfc5280
- https://www.rfc-editor.org/rfc/rfc6125
- https://www.rfc-editor.org/rfc/rfc8555
- https://www.rfc-editor.org/rfc/rfc6960
- https://www.openssl.org/docs/
