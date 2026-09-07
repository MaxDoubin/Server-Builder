
## The first message got thirty eight times bigger

For most of [TLS 1.3](/blog/tls-modern-encryption)'s life the client's key share was thirty two bytes. That is
an X25519 public key, and thirty two bytes is small enough that you never had
to think about it: the ClientHello fitted in one packet, it had always fitted
in one packet, and a great deal of network equipment quietly came to depend on
that.

It is 1,216 bytes now, on any connection your browser negotiates with
X25519MLKEM768. That is the number RFC 10024 gives, published in August 2026
on the standards track, and it is worth sitting with for a second, because
almost nothing else about the handshake changed and this one field grew by a
factor of thirty eight.

## Where the bytes go

RFC 10024 defines two hybrid groups. The one that matters in practice is
X25519MLKEM768, code point 4588 in the IANA TLS Supported Groups registry.
The client sends:

```text
client key_share  =  ML-KEM-768 encapsulation key  ‖  X25519 share
                     1184 bytes                       32 bytes
                  =  1216 bytes
```

and the server answers with:

```text
server key_share  =  ML-KEM-768 ciphertext  ‖  X25519 share
                     1088 bytes                32 bytes
                  =  1120 bytes
```

The 1184 and 1088 are FIPS 203's numbers for ML-KEM-768, not choices anyone
made here. The shared secret is the concatenation of the two secrets, thirty
two bytes each, sixty four bytes total, fed into the key schedule in place of
the ECDHE output.

One detail catches people out, and the RFC is candid about it: the ML-KEM part
comes **first**, before the X25519 part, which is the opposite of what the name
X25519MLKEM768 suggests. The specification says outright that this "does not
adhere to the naming convention" and keeps it for historical reasons. If you
are parsing these by hand, that ordering is the bug you are about to write.

## Why both, and not just the new one

The obvious question is why a connection carries an elliptic curve share at
all if the point is to survive a quantum computer. The answer is that ML-KEM is
young. It was standardised in 2024 and the cryptanalysis that would find a
flaw in it, if there is one, has had about two years to run. X25519 has had
twenty.

So a hybrid derives its secret from both, and an attacker has to break both to
recover it. RFC 9954, published a month earlier as Informational, is the
document that lays out that reasoning and the security properties a hybrid has
to preserve. Reading them in the other order, 9954 then 10024, is the right
way round: one is why, the other is exactly what.

There is a second reason, less discussed and just as real. Harvest now, decrypt
later is not a hypothetical for anything with a long confidentiality life. A
session recorded today and broken in fifteen years is still a breach if what
crossed the wire was a medical record. The hybrid costs a kilobyte now against
a risk that only compounds.

## The part that breaks

Here is where a kilobyte in a handshake stops being a rounding error.

Cloudflare wrote up what happened when Chrome first ran this as an experiment,
and the failure mode was not slowness, it was connections that did not
complete at all. Middleboxes, load balancers and TLS-terminating proxies had
been written on the assumption that a ClientHello arrives in one packet,
because for twenty years it always had. Feed them one that spans two and some
of them simply stop. Their measurements found breakage clustering around 10kB
and 30kB, thresholds that correspond to nothing in the protocol and everything
in somebody's buffer.

This is protocol ossification, and it is the most useful thing to take away
from the whole exercise. Nothing in TLS ever said the ClientHello fitted in a
packet. It just did, for long enough that the assumption calcified into
equipment, and the standard could not be extended until that equipment was
either fixed or routed around.

## What to actually check

If you run anything that terminates or inspects TLS, three things are worth
your time.

**Does your ClientHello still fit?** With a 1,216 byte key share plus SNI, ALPN,
the extension block and the record header, you are comfortably over a 1500 byte
Ethernet MTU once a second key share is offered alongside the hybrid, which
clients do while they are hedging. Over TCP that means two segments before the
server has said anything, and if your path MTU is smaller than you think, more
than two.

**Does your library actually have it?** OpenSSL 3.5 shipped ML-KEM and ML-DSA
natively, with no provider plug-in. That is the line in the sand: before it,
post-quantum meant oqs-provider and a build; after it, it is a group name in a
config file.

**Are you inspecting traffic you can no longer inspect?** A middlebox with a
hardcoded list of supported groups will negotiate a downgrade to a classical
group, and it will do it silently. The handshake succeeds, the connection
works, and the post-quantum protection you think you deployed is not there.
The only way to know is to look at what was actually negotiated, not at what
was offered.

## The version that is not solved

Key agreement is the easy half, and it is the half that is done. The other
half is authentication, and it is not.

A key exchange only has to resist an attacker who is recording today and
computing later, so a hybrid key agreement fixes it today. A signature has to
resist an attacker at the moment it is verified, which means certificates do
not have the same urgency, and that is fortunate, because ML-DSA signatures
and public keys are far larger than ECDSA's and a certificate chain contains
several of each. Nobody has yet made a chain of those fit gracefully into a
handshake that is already spilling out of one packet.

So the honest summary of where this stands: your browser's key agreement is
already post-quantum on most of the internet's large properties, your
certificates are not, and the reason is arithmetic about bytes rather than
anything about cryptography.

## References

- [RFC 10024: Post-Quantum Traditional (PQ/T) Hybrid Key Agreement Mechanisms for TLS 1.3](https://www.rfc-editor.org/rfc/rfc10024.html)
- [RFC 9954: Terminology and Design Considerations for Hybrid Key Exchange](https://www.rfc-editor.org/rfc/rfc9954.html)
- [NIST FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf)
- [IANA TLS Supported Groups registry](https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml)
- [Cloudflare: The state of the post-quantum Internet](https://blog.cloudflare.com/pq-2024/)
- [OpenSSL 3.5 release notes](https://openssl-library.org/news/openssl-3.5-notes/)
- [RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)
