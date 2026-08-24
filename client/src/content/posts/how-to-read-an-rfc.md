
## Why go to the source

Most of what people know about protocols comes from tutorials, and tutorials are lossy. They tell you what usually happens. The RFC tells you what is required, what is optional, what happens in the cases the tutorial skipped, and, critically, why the design is the way it is.

When I got serious about networking, reading the actual documents was the single biggest jump in my understanding. Nothing else was close. They are also free, permanently available, and unusually well written for technical specifications.

## What an RFC is and is not

The biggest misconception: an RFC is not automatically a standard. The series includes proposed standards, internet standards, best current practice documents, informational notes, experimental protocols, historic documents, and the occasional April Fools joke that people have unfortunately cited in earnest.

So read the metadata block before the content. At the top of every document you get:

- **Category** or status. Standards Track, Informational, Experimental, Best Current Practice.
- **Obsoletes** and **Updates**. This document replaces or amends earlier ones.
- **Obsoleted by** and **Updated by**, added later. This is the important one: it tells you that you are reading something superseded.

If a document says it has been obsoleted, stop and go read the replacement. People quote outdated RFCs constantly because they found them first in a search engine.

Also note that many protocols are not one document. They are a base specification plus a decade of extensions. Modern TCP, for example, is a consolidated core document plus separate documents for extensions and congestion control. The consolidated versions that fold years of amendments into one document are a genuine gift and worth seeking out.

## The reading order I use

I do not read front to back. I read:

1. **The abstract.** Thirty seconds, tells me if this is even the right document.
2. **The introduction.** Usually contains the motivation, which is the part tutorials never explain.
3. **The terminology section.** Non negotiable. These documents define words precisely and often not the way you use them casually.
4. **The specific section I came for.** Use the table of contents.
5. **Security considerations.** Mandatory in every RFC, and frequently the most interesting section. It is where the authors admit what the protocol does not protect against.
6. **IANA considerations.** Boring until you need to know which registry holds the code points, and then essential.
7. **Examples and appendices.** Many RFCs include worked message exchanges that make the abstract text click instantly.

## The notation: keywords and ABNF

The capitalized words are defined terms, not emphasis. MUST is an absolute requirement. MUST NOT is an absolute prohibition. SHOULD means there may be valid reasons to deviate but you had better understand them. MAY is truly optional.

This is defined in RFC 2119, later clarified so that the keywords only carry that meaning when they appear in capitals. When you are implementing something, the MUST statements are your test suite. I have literally built checklists by grepping a document for them.

Message formats themselves are usually specified in Augmented Backus-Naur Form. It looks intimidating for about ten minutes and then it is just notation:

```abnf
; A small example in the style used throughout the RFC series
message      = start-line CRLF *( header CRLF ) CRLF [ body ]
start-line   = method SP request-target SP version
header       = field-name ":" OWS field-value OWS
field-name   = 1*token-char
OWS          = *( SP / HTAB )   ; optional whitespace
CRLF         = %x0D.0A
```

The pieces: `*` means zero or more, `1*` means one or more, `[ ]` means optional, `/` is alternation, `%x` is a hex literal, and `;` starts a comment. That is nearly all of it. Learn those six things and every message format specification opens up.

## Pair it with a packet capture

This is the trick that made it stick for me. Read a section of the specification, then capture the real protocol and match the bytes to the text.

```bash
# Capture a small sample of the protocol you are studying
sudo tcpdump -i any -c 200 -w /tmp/study.pcap 'tcp port 853 or udp port 53'

# Then walk fields with tshark and compare against the spec
tshark -r /tmp/study.pcap -V -c 5

# Or pull specific fields to see how a header is actually populated
tshark -r /tmp/study.pcap -T fields \
  -e frame.number -e ip.src -e ip.dst -e dns.flags -e dns.qry.name
```

Seeing a flag you just read about set to 1 in a real packet is worth an hour of reading on its own.

## Errata, and where to start

Published RFCs are immutable. They are never edited. Corrections are filed as errata against the document, and verified errata are things the authors got wrong. Before implementing anything closely, check whether errata exist. It is a short list and it will save you from faithfully implementing a typo.

As for where to begin: pick a protocol you already use and read its specification. DNS, ARP, ICMP, and HTTP are all approachable. The ARP document is famously short and readable, and finishing an actual internet standard in one sitting is a good confidence builder.

Then read one security considerations section a week from any document that interests you. It is the highest density source of practical security thinking I have found, and it is written by the people who designed the thing.

## References

- [RFC Editor](https://www.rfc-editor.org/)
- [RFC 2119: Key words for use in RFCs](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174: Ambiguity of uppercase vs lowercase in RFC 2119 key words](https://www.rfc-editor.org/rfc/rfc8174.html)
- [RFC 5234: Augmented BNF for Syntax Specifications](https://www.rfc-editor.org/rfc/rfc5234.html)
- [RFC 826: An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826.html)
- [tshark manual page](https://www.wireshark.org/docs/man-pages/tshark.html)
