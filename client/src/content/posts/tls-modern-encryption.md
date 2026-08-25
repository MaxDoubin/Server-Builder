## The problem

A scanner flagged your site for supporting old TLS versions, or you turned on TLS 1.3 in a config file and cannot tell whether it is actually being used. Both questions have the same shape: you need to know what the protocol is really doing on the wire, not what the config file claims. This post covers what changed in TLS 1.3, how to turn it on, and how to prove it is working.

## Why TLS 1.3 is important

TLS 1.2 is secure when configured correctly, but "when configured correctly" is the problem. TLS 1.2 supported a wide range of cipher suites, many of which are now considered weak. Misconfigured servers using RC4, 3DES, or export-grade ciphers were common attack targets for years.

TLS 1.3 removed all the dangerous cipher suites, mandated forward secrecy, simplified the protocol, and reduced handshake latency. It is strictly better than TLS 1.2 and should be preferred wherever possible.

TLS 1.3 is specified in RFC 8446, published in August 2018. TLS 1.2 is RFC 5246. TLS 1.0 and 1.1 were formally deprecated by RFC 8996 in 2021, so "you should not be running these" is not an opinion any more, it is the standards position.

## What changed in TLS 1.3

**Removed cipher suites:** RC4, 3DES, AES-CBC mode, and many others are simply gone. TLS 1.3 only supports AEAD ciphers: AES-GCM and ChaCha20-Poly1305.

**Mandatory forward secrecy:** TLS 1.3 only allows ephemeral key exchange (ECDHE). If the server's private key is ever compromised, past sessions cannot be decrypted. TLS 1.2 allowed RSA key exchange, which did not provide forward secrecy.

**Faster handshake:** TLS 1.3 requires only one round trip for the handshake (compared to two for TLS 1.2). 0-RTT resumption allows reconnecting clients to send data in the first packet.

**Encrypted certificates:** In TLS 1.2, the server's certificate was sent in plaintext. TLS 1.3 encrypts it, improving privacy.

A few more removals matter in practice. Renegotiation is gone, replaced by a `KeyUpdate` message that rekeys without restarting the handshake. TLS-level compression is gone, which closes the CRIME class of attacks. Custom Diffie-Hellman groups are gone, so a server can no longer negotiate a weak group by accident, and only named groups from the registry are allowed. RSA signatures in the handshake must be RSA-PSS rather than the older PKCS #1 v1.5 scheme.

The cipher suite list shrank from hundreds of combinations to five. In practice you will only ever see three of them: `TLS_AES_128_GCM_SHA256`, `TLS_AES_256_GCM_SHA384`, and `TLS_CHACHA20_POLY1305_SHA256`. The first is mandatory to implement. Note the naming changed too. A TLS 1.3 suite names only the AEAD algorithm and the hash, because the key exchange and the signature algorithm are negotiated separately now.

## How the handshake actually works

The client sends a `ClientHello` that already contains its key share, so it is guessing which group the server will pick. The server replies with `ServerHello` carrying its own key share, and from that point everything else in the handshake is encrypted, including the server's certificate and the extensions. That is why one round trip is enough: the client did the work of proposing a key before it knew whether the server would accept it.

Two details of that design surprise people reading captures.

First, the version number on the record layer still says TLS 1.2. TLS 1.3 negotiates its version through the `supported_versions` extension, leaving the legacy version field at 0x0303, because middleboxes on the internet would drop anything that claimed a version they did not recognise. If you filter a capture for the literal version field you will conclude TLS 1.3 is not in use when it is.

Second, TLS 1.3 has a downgrade protection mechanism built into the server random. If a TLS 1.3 capable server ends up negotiating a lower version, it writes a fixed sentinel value into the last eight bytes of the random field, and a TLS 1.3 client that sees it aborts the connection. This is what stops an attacker from stripping the handshake back to 1.2.

One thing TLS 1.3 does not encrypt is the server name. SNI is still sent in the clear in the `ClientHello`, so anyone on path can see which host you asked for even though they cannot see the certificate that comes back. Encrypted Client Hello is the work aimed at that, and it is separate from TLS 1.3 itself.

## Enabling TLS 1.3

```nginx
# nginx.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDH+AESGCM:ECDH+CHACHA20:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
```

Two things about that config are easy to get wrong.

`ssl_ciphers` does not control TLS 1.3. The OpenSSL cipher string syntax applies to TLS 1.2 and below. TLS 1.3 suites are configured through a separate OpenSSL API and nginx does not expose a directive for them, so the three TLS 1.3 suites are on whether your cipher string mentions them or not. Removing `ECDH+AESGCM` from the string will not disable `TLS_AES_128_GCM_SHA256`.

`ssl_prefer_server_ciphers` also has no effect on TLS 1.3. Suite preference in 1.3 is client-driven by design, which is deliberate: it lets a phone pick ChaCha20-Poly1305 because it has no AES hardware, while a server with AES-NI gets AES-GCM.

You also need a build that can do it. TLS 1.3 support in nginx requires OpenSSL 1.1.1 or newer, and the `TLSv1.3` parameter arrived in nginx 1.13.0. Check what you actually have:

```bash
nginx -V 2>&1 | head -2
```

```
nginx version: nginx/1.24.0
built with OpenSSL 3.0.11 19 Sep 2023
```

If that says OpenSSL 1.0.2, no amount of config editing will give you TLS 1.3.

## Verifying it from the command line

Configuration is a claim. The handshake is the evidence.

```bash
openssl s_client -connect example.com:443 -tls1_3 -servername example.com </dev/null
```

The part of the output that matters:

```
---
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Secure Renegotiation IS NOT supported
Compression: NONE
Expansion: NONE
---
SSL-Session:
    Protocol  : TLSv1.3
    Cipher    : TLS_AES_256_GCM_SHA384
    Verify return code: 0 (ok)
```

`Protocol : TLSv1.3` is the confirmation. `Verify return code: 0 (ok)` means the chain validated. "Secure Renegotiation IS NOT supported" looks alarming and is correct behaviour: renegotiation does not exist in TLS 1.3, so there is nothing to secure.

Now prove the old versions are off:

```bash
openssl s_client -connect example.com:443 -tls1 </dev/null
```

A server that refuses returns a protocol version alert, which OpenSSL prints as `SSL alert number 70`. If your local OpenSSL is itself built or configured with a minimum of TLS 1.2, you will instead get `no protocols available` before a packet is sent, which tells you about your client rather than the server. Test from a machine whose OpenSSL still permits the old version, or use `nmap --script ssl-enum-ciphers -p 443 example.com`, which enumerates every version and suite the server will accept and grades them.

## 0-RTT is not free

0-RTT lets a resuming client send application data in its very first flight. The saving is real and so is the catch: 0-RTT data has no replay protection at the protocol level. An attacker who captures that first flight can send it again, and the server cannot tell the copy from the original.

That is fine for a GET of a static asset. It is not fine for anything that changes state. RFC 8446 is explicit that applications must only send data they are willing to have replayed. In nginx, `ssl_early_data` is off by default, and leaving it off is the right default unless you have gone through what your endpoints do with a replayed request.

## What you should disable

Disable TLS 1.0 and 1.1 everywhere. These versions have known vulnerabilities (POODLE, BEAST) and no modern client requires them. Check your servers and load balancers for these settings.

For context on those two names: BEAST exploited the predictable CBC initialisation vector in TLS 1.0, and POODLE was originally an SSL 3.0 padding attack that also affected TLS implementations that did not check CBC padding properly. Both are artefacts of the CBC construction that TLS 1.3 removed entirely.

Monitor your cipher suite usage and set a timeline for deprecating TLS 1.2 once you have confirmed all clients support 1.3.

## What breaks

**A middlebox that does not understand TLS 1.3.** Some inspection appliances and older load balancers drop or mangle handshakes they cannot parse. The symptom is a connection that fails only from certain networks. TLS 1.3 includes a compatibility mode that makes the handshake look more like TLS 1.2 (a dummy ChangeCipherSpec, an echoed session ID) specifically to survive these, but it does not save you from a device doing real inspection.

**Terminating TLS 1.3 at a proxy and forwarding over TLS 1.2.** Your scan of the front door passes and the internal hop is still negotiating something old. Test each hop separately, not just the public endpoint.

**Assuming the cipher string disabled something.** Covered above and worth repeating because it produces a false audit result. If you need to prove a suite is off, do not read the config, run the handshake.

**Session resumption silently disabled.** TLS 1.3 resumption uses tickets sent in `NewSessionTicket` after the handshake. Turning tickets off for forward-secrecy reasons, or terminating on several servers that do not share ticket keys, means every connection pays the full handshake. The site still works, it is just slower, so nobody notices for months.

**Certificate chain problems hidden by a browser.** Browsers repair incomplete chains by fetching intermediates; `openssl s_client` and most non-browser clients do not. If `Verify return code` is anything other than 0 while the site looks fine in Chrome, your chain is missing an intermediate and API clients will fail.

## References

- https://www.rfc-editor.org/rfc/rfc8446
- https://www.rfc-editor.org/rfc/rfc8996
- https://www.rfc-editor.org/rfc/rfc5246
- https://nginx.org/en/docs/http/ngx_http_ssl_module.html
- https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security
- https://en.wikipedia.org/wiki/Transport_Layer_Security
