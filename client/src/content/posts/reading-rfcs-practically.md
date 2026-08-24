
## Why bother

Almost every tutorial you find about a protocol is someone's summary of a specification, filtered through what they happened to need that day. The specification is the actual answer, and it is free, permanent, and usually more readable than its reputation suggests.

I started reading them because vendor documentation kept disagreeing with what I saw on the wire. The specification settles those arguments. It also teaches you something more durable than any product: how the protocol is supposed to behave, which is what lets you recognize when an implementation is wrong.

## What an RFC is, and is not

An RFC is a numbered document published by the RFC Editor. The number is permanent and the content never changes after publication. If something needs fixing, a new RFC is published that updates or obsoletes the old one.

That last point is the single most important thing to check, and the thing beginners get wrong most often. You can easily land on a document from decades ago that has been fully replaced. The header block at the top of the page tells you: it will say "Obsoletes: 1234" or, on the old document, "Obsoleted by: 9999." Always look before you invest an hour.

Also check the category. Standards Track documents are the ones defining what implementations should do. Informational documents describe something without standardizing it. Experimental means what it says. Best Current Practice describes recommended operational behaviour rather than protocol format. And not every RFC is serious, since the ones published on the first of April are jokes, some of them very good ones.

## The reading order I use

I do not read them front to back. That is how you bounce off.

First, the abstract and the status header. Thirty seconds to learn what it covers and whether it is still current.

Second, the table of contents. Specifications are structured predictably: terminology, overview, message formats, procedures, security considerations, IANA considerations. Knowing the shape means you can jump.

Third, the terminology section. Never skip this. Specifications define words precisely and often differently from casual usage, and misreading one defined term will make the whole document seem contradictory.

Fourth, whatever specific section I came for.

Fifth, the security considerations section, which is genuinely the most interesting part of most documents and the part most people never open. It is where the authors write down what they know can go wrong.

I read the introduction last, if at all. It is usually history and motivation, which is worth reading once you already know the protocol and useless before.

## RFC 2119 keywords are the whole game

When a document says it uses the keywords from RFC 2119, those words in capitals have exact meanings and the entire specification hangs on them.

MUST is an absolute requirement. MUST NOT is an absolute prohibition. SHOULD means there may be valid reasons to do otherwise, but understand them fully first. MAY is genuinely optional.

The practical consequence is interoperability. If your implementation depends on the other side doing something the specification only marks SHOULD, you have a bug waiting for a peer that made the other choice. When I read a specification looking for why two things do not interoperate, I search for the capitalized keywords first, because the answer is almost always at a SHOULD or a MAY where two implementers chose differently.

## Reading a packet format diagram

Older documents draw headers in ASCII, in rows of 32 bits, numbered left to right starting at zero. Once you can read one you can read them all, and you can turn it directly into parsing code.

```python
import struct

# IPv4 header, first 20 bytes: version/IHL, DSCP/ECN, total length,
# identification, flags/fragment offset, TTL, protocol, checksum, src, dst
def parse_ipv4(buf):
    (vihl, tos, total_len, ident, flags_frag,
     ttl, proto, csum, src, dst) = struct.unpack("!BBHHHBBH4s4s", buf[:20])
    return {
        "version": vihl >> 4,
        "ihl_bytes": (vihl & 0x0F) * 4,
        "total_length": total_len,
        "ttl": ttl,
        "protocol": proto,
        "flags": flags_frag >> 13,
        "frag_offset": (flags_frag & 0x1FFF) * 8,
    }
```

Writing that from the diagram, then checking it against a real capture, is the fastest way I know to make a specification stop being abstract. The bit manipulation for fields smaller than a byte is where the diagram earns its keep.

## Turn it into a lab

Reading alone does not stick. Pick something small, read the relevant section, then go verify it.

Capture the traffic and find the fields you just read about. Deliberately violate a MUST and observe what the other end does. Write a minimal parser or a minimal client. Compare two implementations and find where they differ at a SHOULD.

That loop, read a section then prove it on the wire, has taught me more than any course. And the habit generalizes: once you are comfortable reading a protocol specification, kernel documentation, hardware datasheets, and API references all stop looking intimidating, because they are the same kind of document.

## References

- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174: Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174.html)
- [RFC 2026: The Internet Standards Process](https://www.rfc-editor.org/rfc/rfc2026.html)
- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791.html)
- [Official Internet Protocol Standards](https://www.rfc-editor.org/standards)
- [Python struct module documentation](https://docs.python.org/3/library/struct.html)
