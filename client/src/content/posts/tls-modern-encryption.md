
## Why TLS 1.3 Is Important

TLS 1.2 is secure when configured correctly, but "when configured correctly" is the problem. TLS 1.2 supported a wide range of cipher suites, many of which are now considered weak. Misconfigured servers using RC4, 3DES, or export-grade ciphers were common attack targets for years.

TLS 1.3 removed all the dangerous cipher suites, mandated forward secrecy, simplified the protocol, and reduced handshake latency. It is strictly better than TLS 1.2 and should be preferred wherever possible.

## What Changed in TLS 1.3

**Removed cipher suites:** RC4, 3DES, AES-CBC mode, and many others are simply gone. TLS 1.3 only supports AEAD ciphers: AES-GCM and ChaCha20-Poly1305.

**Mandatory forward secrecy:** TLS 1.3 only allows ephemeral key exchange (ECDHE). If the server's private key is ever compromised, past sessions cannot be decrypted. TLS 1.2 allowed RSA key exchange, which did not provide forward secrecy.

**Faster handshake:** TLS 1.3 requires only one round trip for the handshake (compared to two for TLS 1.2). 0-RTT resumption allows reconnecting clients to send data in the first packet.

**Encrypted certificates:** In TLS 1.2, the server's certificate was sent in plaintext. TLS 1.3 encrypts it, improving privacy.

## Enabling TLS 1.3

```nginx
# nginx.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDH+AESGCM:ECDH+CHACHA20:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
```

## What You Should Disable

Disable TLS 1.0 and 1.1 everywhere. These versions have known vulnerabilities (POODLE, BEAST) and no modern client requires them. Check your servers and load balancers for these settings.

Monitor your cipher suite usage and set a timeline for deprecating TLS 1.2 once you have confirmed all clients support 1.3.
