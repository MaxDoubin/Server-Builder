/**
 * PKCS#10 certificate signing request decoding, review and OpenSSL command
 * templates for the CSR decoder.
 *
 * RFC 2986 section 4:
 *
 *   CertificationRequest ::= SEQUENCE {
 *     certificationRequestInfo, signatureAlgorithm AlgorithmIdentifier, signature BIT STRING }
 *   CertificationRequestInfo ::= SEQUENCE {
 *     version INTEGER { v1(0) }, subject Name, subjectPKInfo SubjectPublicKeyInfo,
 *     attributes [0] IMPLICIT SET OF Attribute }
 *   Attribute ::= SEQUENCE { type OBJECT IDENTIFIER, values SET OF ANY }
 *
 * Requested extensions travel in the PKCS#9 extensionRequest attribute
 * (RFC 2985 5.4.2), whose single value is an X.509 Extensions sequence, so
 * the shared extension decoder in ./asn1 reads them unchanged.
 */

import {
  type AlgorithmInfo,
  type DistinguishedName,
  type ExtensionSet,
  type GeneralName,
  type InputNotice,
  type PublicKeyInfo,
  type ReadResult,
  DerError,
  bytesOf,
  errorText,
  expectTag,
  isContext,
  isStringNode,
  oidName,
  parseAlgorithm,
  parseExactly,
  parseExtensions,
  parseName,
  parsePublicKey,
  previewHex,
  readBitString,
  readOid,
  readSmallInt,
  readString,
  sniffDer,
  visible,
  TAG,
  MAX_OBJECTS,
  PKCS12_MESSAGE,
} from "./asn1";
import { type Finding, keyFindings } from "./certificate-decoder";

/* ------------------------------------------------------------------ types */

export interface CsrAttribute {
  oid: string;
  name: string;
  values: string[];
}

export interface CsrInfo {
  der: Uint8Array;
  label: string;
  /** The encoded version number; v1 is 0. */
  version: number;
  subject: DistinguishedName;
  publicKey: PublicKeyInfo;
  attributes: CsrAttribute[];
  /** Extensions from the extensionRequest attribute, or null when none were requested. */
  extensions: ExtensionSet | null;
  challengePassword: string | null;
  signatureAlgorithm: AlgorithmInfo;
  /** The signed bytes: CertificationRequestInfo exactly as encoded. */
  signed: Uint8Array;
  signature: Uint8Array;
}

export type CsrEntry = { ok: true; csr: CsrInfo } | { ok: false; label: string; error: string };

export interface CsrDecodeOutcome {
  entries: CsrEntry[];
  notices: InputNotice[];
  error: string | null;
  /** True when the input held a certificate rather than a request. */
  sawCertificate: boolean;
}

/* ---------------------------------------------------------------- parsing */

const EXTENSION_REQUEST = "1.2.840.113549.1.9.14";
const CHALLENGE_PASSWORD = "1.2.840.113549.1.9.7";
/** Microsoft's pre-standard extension request attribute, still emitted by some Windows tools. */
const MS_EXTENSION_REQUEST = "1.3.6.1.4.1.311.2.1.14";

export function parseCsr(der: Uint8Array, label = "CERTIFICATE REQUEST"): CsrEntry {
  try {
    const root = parseExactly(der, 0, der.length, "certificate request");
    expectTag(root, TAG.SEQUENCE, "certificate request", 0);
    if (root.children.length !== 3) {
      throw new DerError(`A certificate request is a SEQUENCE of three parts; this one has ${root.children.length}`, root.start);
    }
    const [infoNode, algNode, sigNode] = root.children;
    const info = expectTag(infoNode, TAG.SEQUENCE, "CertificationRequestInfo", root.contentStart);
    const [versionNode, subjectNode, spkiNode, attrsNode] = info.children;
    const version = readSmallInt(der, versionNode, "version", info.start);
    const subject = parseName(der, subjectNode, "subject", info.start);
    const publicKey = parsePublicKey(der, spkiNode, info.start);

    const attributes: CsrAttribute[] = [];
    let extensions: ExtensionSet | null = null;
    let challengePassword: string | null = null;
    if (attrsNode) {
      if (!isContext(attrsNode, 0)) throw new DerError("The attributes field should be tagged [0]", attrsNode.start);
      for (const attr of attrsNode.children) {
        expectTag(attr, TAG.SEQUENCE, "attribute", attr.start);
        const oid = readOid(der, attr.children[0], "attribute type", attr.start);
        const set = expectTag(attr.children[1], TAG.SET, "attribute values", attr.start);
        if ((oid === EXTENSION_REQUEST || oid === MS_EXTENSION_REQUEST) && set.children[0]) {
          extensions = parseExtensions(der, set.children[0]);
          attributes.push({ oid, name: oidName(oid), values: [`${extensions.list.length} extension${extensions.list.length === 1 ? "" : "s"}`] });
          continue;
        }
        const values = set.children.map((v) => (isStringNode(v) ? visible(readString(der, v).text).text : previewHex(bytesOf(der, v))));
        if (oid === CHALLENGE_PASSWORD) challengePassword = values[0] ?? "";
        attributes.push({ oid, name: oidName(oid), values });
      }
    }
    if (info.children.length > 4) throw new DerError("Unexpected fields follow the attributes", info.children[4].start);

    const signatureAlgorithm = parseAlgorithm(der, algNode, "signature algorithm", info.end);
    const signature = readBitString(der, sigNode, "signature", algNode.end).bytes;
    return {
      ok: true,
      csr: {
        der,
        label,
        version,
        subject,
        publicKey,
        attributes,
        extensions,
        challengePassword,
        signatureAlgorithm,
        signed: bytesOf(der, info),
        signature,
      },
    };
  } catch (err) {
    return { ok: false, label, error: errorText(err) };
  }
}

const CSR_LABELS = new Set(["CERTIFICATE REQUEST", "NEW CERTIFICATE REQUEST", "DER", "BASE64", "HEX"]);

export function decodeCsrs(read: ReadResult): CsrDecodeOutcome {
  const notices: InputNotice[] = [...read.notices];
  const entries: CsrEntry[] = [];
  let sawCertificate = false;
  for (const obj of read.objects) {
    if (entries.length >= MAX_OBJECTS) break;
    if (["CERTIFICATE", "X509 CERTIFICATE", "TRUSTED CERTIFICATE", "PKCS7", "PKCS #7 SIGNED DATA"].includes(obj.label)) {
      sawCertificate = true;
      continue;
    }
    if (!CSR_LABELS.has(obj.label)) {
      notices.push({ tone: "info", text: `Skipped a "${obj.label}" block; it is not a certificate request.` });
      continue;
    }
    const kind = sniffDer(obj.der);
    if (kind === "certificate" || kind === "pkcs7") {
      sawCertificate = true;
      continue;
    }
    if (kind === "pkcs12") {
      entries.push({ ok: false, label: obj.label, error: PKCS12_MESSAGE });
      continue;
    }
    entries.push(parseCsr(obj.der, obj.label));
  }
  if (sawCertificate) {
    notices.push({ tone: "info", text: "A certificate was found. It is not a signing request, so it was skipped here; the certificate decoder reads it." });
  }
  return { entries, notices, error: read.error, sawCertificate };
}

/* ------------------------------------------------------------- host names */

/** TLDs that are reserved (RFC 2606, RFC 6761, RFC 6762, ICANN's .internal) or widely used internally and not delegated. */
const INTERNAL_TLDS = new Set(["local", "localhost", "internal", "lan", "corp", "home", "localdomain", "test", "example", "invalid"]);

export function isInternalName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".")) return true;
  return INTERNAL_TLDS.has(h.slice(h.lastIndexOf(".") + 1));
}

/** Parses dotted IPv4 text into four bytes, or null. */
export function parseIpv4(text: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p, i) => p > 255 || (m[i + 1].length > 1 && m[i + 1].startsWith("0")))) return null;
  return parts;
}

/** Parses IPv6 text (RFC 4291 2.2, including :: and an embedded IPv4 tail) into 16 bytes, or null. */
export function parseIpv6(text: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(text) || text.length > 45) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  // RFC 4291 2.2 form 3: a dotted IPv4 tail may appear only at the very end.
  const toGroups = (part: string, last: boolean): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const pieces = part.split(":");
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (last && i === pieces.length - 1 && p.includes(".")) {
        const v4 = parseIpv4(p);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(p)) out.push(parseInt(p, 16));
      else return null;
    }
    return out;
  };
  const head = toGroups(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? toGroups(halves[1], true) : [];
  if (!head || !tail) return null;
  const total = head.length + tail.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;
  const groups = [...head, ...new Array(8 - total).fill(0), ...tail];
  const bytes: number[] = [];
  for (const g of groups) bytes.push(g >> 8, g & 0xff);
  return bytes;
}

/**
 * Addresses no public CA may certify: private (RFC 1918, RFC 4193), loopback,
 * link local, shared (RFC 6598), documentation (RFC 5737, RFC 3849), the
 * IETF protocol block 192.0.0.0/24, benchmarking, multicast and reserved.
 */
export function isReservedIp(text: string): boolean {
  const v4 = parseIpv4(text);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (v4[2] === 0 || v4[2] === 2)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && v4[2] === 100) ||
      (a === 203 && b === 0 && v4[2] === 113)
    );
  }
  const v6 = parseIpv6(text);
  if (!v6) return false;
  // ::ffff:a.b.c.d (RFC 4291 2.5.5.2) carries an IPv4 address; judge that address.
  if (v6.slice(0, 10).every((x) => x === 0) && v6[10] === 0xff && v6[11] === 0xff) return isReservedIp(v6.slice(12).join("."));
  const allZeroButLast = v6.slice(0, 15).every((x) => x === 0);
  return (
    (allZeroButLast && (v6[15] === 0 || v6[15] === 1)) ||
    (v6[0] & 0xfe) === 0xfc ||
    (v6[0] === 0xfe && (v6[1] & 0xc0) === 0x80) ||
    v6[0] === 0xff ||
    (v6[0] === 0x20 && v6[1] === 0x01 && v6[2] === 0x0d && v6[3] === 0xb8)
  );
}

/**
 * RFC 9525 6.3: a wildcard that is the whole leftmost label matches exactly
 * one non-empty label in that position, compared without regard to case.
 */
export function wildcardCovers(wildcard: string, host: string): boolean {
  if (wildcardVerdict(wildcard) !== "ok") return false;
  const suffix = wildcard.slice(1).replace(/\.$/, "").toLowerCase();
  const h = host.replace(/\.$/, "").toLowerCase();
  if (!h.endsWith(suffix)) return false;
  const label = h.slice(0, h.length - suffix.length);
  return label.length > 0 && !label.includes(".") && !label.includes("*");
}

export type WildcardVerdict = "none" | "ok" | "partial" | "not-leftmost" | "multiple" | "too-broad";

/** Classifies wildcard use against the Baseline Requirements' Wildcard Domain Name and RFC 9525 6.3. */
export function wildcardVerdict(name: string): WildcardVerdict {
  const count = (name.match(/\*/g) ?? []).length;
  if (count === 0) return "none";
  if (count > 1) return "multiple";
  const labels = name.replace(/\.$/, "").split(".");
  const at = labels.findIndex((l) => l.includes("*"));
  if (at !== 0) return "not-leftmost";
  if (labels[0] !== "*") return "partial";
  if (labels.length < 3) return "too-broad";
  return "ok";
}

/* ----------------------------------------------------------------- review */

/** SAN entries of a request, or an empty list. */
export function csrSans(csr: CsrInfo): GeneralName[] {
  return csr.extensions?.san ?? [];
}

/** The checks a CA, or a careful operator, runs before signing. */
export function reviewCsr(csr: CsrInfo): Finding[] {
  const out: Finding[] = [];
  const sans = csrSans(csr);
  const dnsSans = sans.filter((n) => n.type === "DNS");
  const ipSans = sans.filter((n) => n.type === "IP");
  const sanValues = sans.filter((n) => n.type === "DNS" || n.type === "IP").map((n) => n.raw.toLowerCase());
  const cns = csr.subject.commonNames;

  if (csr.version !== 0) out.push({ tone: "warn", text: `The version field is ${csr.version}. PKCS#10 defines only v1, encoded as 0.` });

  // Key.
  out.push(...keyFindings(csr.publicKey));

  // Signature.
  const alg = csr.signatureAlgorithm;
  if (alg.weak) {
    out.push({
      tone: "warn",
      text: `The request is signed with ${alg.name}. The CA signs the certificate with its own algorithm, so this does not weaken the result, but some CAs reject ${alg.hash} requests outright and it points to an old toolchain. Regenerate with SHA-256.`,
    });
  } else if (alg.family !== "unknown") out.push({ tone: "ok", text: `Signed with ${alg.name}.` });

  // Names.
  if (cns.length === 0 && sans.length === 0) {
    out.push({ tone: "danger", text: "There is no common name and no subjectAltName, so the request names nothing to certify." });
  }
  if (sans.length === 0 && cns.length > 0) {
    out.push({
      tone: "warn",
      text: "No subjectAltName is requested. Browsers match only the SAN. Public CAs usually copy the common name into a SAN for you, but a private CA (openssl ca, Active Directory Certificate Services) often issues exactly what was asked.",
    });
  } else if (sans.length > 0) {
    out.push({ tone: "ok", text: `${sans.length} subjectAltName entr${sans.length === 1 ? "y" : "ies"} requested.` });
  }
  for (const cn of cns) {
    const shownCn = visible(cn).text;
    // ub-common-name counts characters, not UTF-16 code units.
    const cnChars = Array.from(cn).length;
    if (cnChars > 64) out.push({ tone: "danger", text: `The common name is ${cnChars} characters. X.520 caps it at 64 (ub-common-name in RFC 5280), so CAs reject it. Leave the long name in the SAN only.` });
    // A common name that is not shaped like a host name or an address (a person, a device, a product) is
    // outside the Baseline Requirements rule that a TLS server CN repeat one of the SAN values.
    const hostLike = !/[\s,;=@]/.test(cn);
    if (sans.length > 0 && !hostLike) {
      out.push({
        tone: "info",
        text: `The common name ${shownCn} is not a host name, so it is not compared with the SAN list. That is normal for a person or device certificate. For a TLS server, the host names belong in the SAN list.`,
      });
    } else if (sans.length > 0 && !sanValues.includes(cn.toLowerCase())) {
      const covering = dnsSans.find((n) => wildcardVerdict(n.raw) === "ok" && wildcardCovers(n.raw, cn));
      out.push({
        tone: "warn",
        text: covering
          ? `The common name ${shownCn} is not in the SAN list. ${covering.value} would match it in a browser, but the Baseline Requirements say the CN must be one of the SAN values exactly, so a public CA will drop or reject it.`
          : `The common name ${shownCn} is not in the SAN list. The Baseline Requirements require the CN to repeat one of the SAN values, and clients ignore the CN anyway, so add it to the SANs.`,
      });
    }
  }

  // Wildcards, hidden characters, internal names.
  const hostNames = [...new Set([...cns.filter((c) => /^[a-z0-9*][a-z0-9.*_-]*$/i.test(c)), ...dnsSans.map((n) => n.raw)])];
  for (const host of hostNames) {
    const verdict = wildcardVerdict(host);
    const shown = visible(host).text;
    if (verdict === "ok") {
      const apex = visible(host.slice(2).toLowerCase()).text;
      out.push({
        tone: "info",
        text: `${shown} covers exactly one label: it matches a.${apex} but not ${apex} and not a.b.${apex}.${sanValues.includes(host.slice(2).toLowerCase()) ? "" : ` Add ${apex} as its own SAN if the bare domain needs to work.`}`,
      });
    } else if (verdict === "partial") {
      out.push({ tone: "danger", text: `${shown} is a partial wildcard. The Baseline Requirements allow * only as the entire leftmost label, and RFC 9525 dropped partial matching.` });
    } else if (verdict === "not-leftmost") {
      out.push({ tone: "danger", text: `${shown} puts the wildcard below the leftmost label, which no CA issues and no client matches.` });
    } else if (verdict === "multiple") {
      out.push({ tone: "danger", text: `${shown} has more than one wildcard. Only one is allowed, as the whole leftmost label.` });
    } else if (verdict === "too-broad") {
      out.push({ tone: "danger", text: `${shown} is a wildcard directly under a top-level domain. Public CAs do not issue it, and the same applies under a public suffix such as co.uk.` });
    }
    if (/_/.test(host)) out.push({ tone: "danger", text: `${shown} contains an underscore, which is not allowed in a host name label, and the Baseline Requirements no longer permit it in publicly trusted certificates.` });
    if (/[^\x21-\x7e]/.test(host)) out.push({ tone: "danger", text: `${shown} contains characters outside printable ASCII. An internationalized name must be written in its xn-- (A-label) form.` });
    if (verdict === "none" && parseIpv4(host)) {
      // An address written in the CN. A SAN copy of it is judged below.
      if (isReservedIp(host) && !ipSans.some((n) => n.raw === host)) {
        out.push({ tone: "info", text: `${host} is a private or reserved address. A public CA cannot certify it; a private CA can.` });
      }
    } else if (verdict === "none" || verdict === "ok") {
      const bare = host.replace(/^\*\./, "");
      if (isInternalName(bare)) out.push({ tone: "info", text: `${shown} is not a public domain name. The Baseline Requirements phased out publicly trusted certificates for internal names by October 2016, so this needs a private CA.` });
    }
  }
  for (const ip of ipSans) {
    if (isReservedIp(ip.raw)) out.push({ tone: "info", text: `${ip.raw} is a private or reserved address. A public CA cannot certify it; a private CA can.` });
  }
  for (const n of sans) if (n.hidden) out.push({ tone: "danger", text: `The SAN entry ${n.type}: ${n.value} contains hidden characters, shown escaped.` });
  for (const attr of csr.subject.rdns.flat()) {
    for (const issue of attr.issues) out.push({ tone: issue.includes("known way") ? "danger" : "warn", text: `Subject ${attr.short}: ${issue}` });
    if (attr.oid === "1.2.840.113549.1.9.1") {
      out.push({ tone: "info", text: "The subject holds an emailAddress attribute. RFC 5280 4.1.2.6 deprecates it in favor of an rfc822Name SAN, and public TLS CAs remove it." });
    }
  }

  // Extensions and attributes.
  const ext = csr.extensions;
  if (ext) {
    for (const e of ext.list) if (e.error) out.push({ tone: "warn", text: `The requested ${e.name} extension did not decode: ${e.error}` });
    for (const name of ext.duplicates) out.push({ tone: "warn", text: `The ${name} extension is requested more than once.` });
    if (ext.basicConstraints?.ca) out.push({ tone: "warn", text: "The request asks for basicConstraints CA:TRUE, a certificate that can issue other certificates. A CA will refuse unless this is an intentional subordinate CA request." });
    if (ext.keyUsage?.includes("keyCertSign")) out.push({ tone: "warn", text: "The request asks for keyCertSign, the right to sign certificates." });
  }
  if (csr.challengePassword !== null) {
    out.push({
      tone: "info",
      text: "A challengePassword attribute is present. It sits in the request as plain text, so anyone who sees the CSR can read it. SCEP servers use it as a shared enrollment secret; most other CAs ignore it.",
    });
  }
  return out;
}

/* ---------------------------------------------------------------- OpenSSL */

export const KEY_OPTIONS = [
  { id: "p256", label: "ECDSA P-256", newkey: "ec -pkeyopt ec_paramgen_curve:P-256" },
  { id: "p384", label: "ECDSA P-384", newkey: "ec -pkeyopt ec_paramgen_curve:P-384" },
  { id: "rsa2048", label: "RSA 2048", newkey: "rsa:2048" },
  { id: "rsa3072", label: "RSA 3072", newkey: "rsa:3072" },
  { id: "rsa4096", label: "RSA 4096", newkey: "rsa:4096" },
] as const;

export type KeyOptionId = (typeof KEY_OPTIONS)[number]["id"];

export interface SanEntry {
  type: "DNS" | "IP" | "email" | "URI";
  value: string;
}

/** Most SAN entries the template accepts. */
export const MAX_TEMPLATE_SANS = 100;

const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * A name fit for a dNSName: letters, digits and hyphens in labels of 1 to 63
 * characters (RFC 1035 2.3.1, RFC 1123 2.1), at most 253 characters in all, no
 * trailing dot, and a last label that is not all digits (RFC 1123 2.1, RFC 3696
 * section 2), which is what keeps 300.1.1.1 from passing as a name. A leading
 * "*." is accepted, and judged separately by wildcardVerdict.
 */
export function isHostName(name: string): boolean {
  const body = name.replace(/^\*\./, "");
  if (body.length === 0 || body.length > 253) return false;
  const labels = body.split(".");
  if (!labels.every((l) => HOST_LABEL.test(l))) return false;
  return !/^[0-9]+$/.test(labels[labels.length - 1]);
}

/** RFC 5322 atext plus the dot: the characters of an email local part this tool writes into a rfc822Name. */
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/** An ASCII address of the form local@domain, with a host name after the @ (RFC 5280 4.2.1.6 rfc822Name is an IA5String). */
function isEmailAddress(text: string): boolean {
  const at = text.lastIndexOf("@");
  if (at < 1) return false;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  return EMAIL_LOCAL.test(local) && !domain.startsWith("*") && domain.includes(".") && isHostName(domain);
}

/** Reads a free-form SAN list (commas, spaces or new lines) and types each entry. */
export function parseSanList(text: string): { entries: SanEntry[]; errors: string[]; truncated: boolean } {
  const entries: SanEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  let truncated = false;
  for (const raw of tokens) {
    if (entries.length >= MAX_TEMPLATE_SANS) {
      truncated = true;
      break;
    }
    if (errors.length >= 20) {
      errors.push("More entries were not checked; fix the ones above first.");
      break;
    }
    const token = raw.replace(/^(DNS|IP|email|URI):/i, "");
    const prefix = /^(DNS|IP|email|URI):/i.exec(raw)?.[1]?.toLowerCase();
    let entry: SanEntry | null = null;
    // RFC 5280 4.2.1.6: rfc822Name and uniformResourceIdentifier are IA5String,
    // so both are limited to printable ASCII here (an IRI must be written as a URI).
    if (prefix === "uri" || (!prefix && /^[a-z][a-z0-9+.-]*:\/\//i.test(token))) {
      if (/^[a-z][a-z0-9+.-]*:[\x21-\x7e]+$/i.test(token)) entry = { type: "URI", value: token };
    } else if (prefix === "email" || (!prefix && token.includes("@"))) {
      if (isEmailAddress(token)) entry = { type: "email", value: token };
    } else if (prefix === "ip" || (!prefix && (parseIpv4(token) || token.includes(":")))) {
      const bare = token.replace(/^\[|\]$/g, "");
      if (parseIpv4(bare) || parseIpv6(bare)) entry = { type: "IP", value: bare };
    } else if (isHostName(token) && wildcardVerdict(token) !== "partial") {
      entry = { type: "DNS", value: token.toLowerCase() };
    }
    if (!entry) {
      const shown = visible(raw).text;
      let hint = "";
      if ((!prefix || prefix === "ip") && /^[0-9]+(?:\.[0-9]+){3}$/.test(token)) {
        hint = " It is written like an IPv4 address, but each of the four parts must be 0 to 255, with no leading zeros.";
      } else if (!prefix && token.length > 1 && token.endsWith(".") && isHostName(token.slice(0, -1))) {
        hint = " Certificates list host names without the trailing dot.";
      }
      errors.push(`"${shown}" is not a valid host name, IP address, email address or URI.${hint}`);
      continue;
    }
    const key = `${entry.type}:${entry.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push(entry);
    }
  }
  return { entries, errors, truncated };
}

/** POSIX shell single quoting: the only character that needs care inside '...' is ' itself. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** OpenSSL -subj escaping: a backslash before / and \, and before +, which OpenSSL 3 reads as a multi-valued RDN separator. */
function subjEscape(value: string): string {
  return value.replace(/[\\/+]/g, (ch) => `\\${ch}`);
}

/** OpenSSL config values: backslash before the characters config(5) treats specially, both quote marks included. */
function configEscape(value: string): string {
  return value.replace(/[\\#$"']/g, (ch) => `\\${ch}`);
}

/** A file name stem derived from the common name: www.example.com, wildcard.example.com. */
export function fileStem(commonName: string): string {
  const stem = commonName.trim().replace(/^\*\./, "wildcard.").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "");
  return stem.slice(0, 64) || "request";
}

export interface TemplateInput {
  commonName: string;
  organization: string;
  country: string;
  sans: string;
  key: KeyOptionId;
}

export interface TemplateOutput {
  errors: string[];
  warnings: string[];
  sans: SanEntry[];
  oneLiner: string;
  config: string;
  configCommand: string;
  inspect: string;
}

/**
 * Builds a one-line `openssl req` command using -addext (OpenSSL 1.1.1 and
 * later) and an equivalent config file for older versions or long SAN
 * lists. Both write a new unencrypted key, which is what a server needs to
 * start unattended; keep the .key file at mode 600.
 */
export function buildTemplate(input: TemplateInput): TemplateOutput {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cn = input.commonName.trim();
  const org = input.organization.trim();
  const country = input.country.trim().toUpperCase();
  const { entries, errors: sanErrors, truncated } = parseSanList(input.sans);
  errors.push(...sanErrors);
  if (truncated) warnings.push(`Only the first ${MAX_TEMPLATE_SANS} names are used.`);
  for (const e of entries) {
    if (e.type === "DNS" && wildcardVerdict(e.value) === "too-broad") {
      warnings.push(`${e.value} is a wildcard directly under a top-level domain. No public CA issues one, and most clients refuse to match it.`);
    }
  }

  // ub-common-name and ub-organization-name (RFC 5280 Appendix A) count characters, not UTF-16 code units.
  const cnChars = Array.from(cn).length;
  if (cnChars > 64) errors.push(`The common name is ${cnChars} characters; the limit is 64. Leave it out or shorten it, and keep the long name in the SANs.`);
  if (visible(cn + org).hidden) errors.push("The subject fields contain control, zero width or bidirectional characters, which would hide what the command really asks for.");
  if (country && !/^[A-Z]{2}$/.test(country)) errors.push("The country must be a two-letter ISO 3166 code, such as US.");
  if (Array.from(org).length > 64) errors.push("The organization is longer than the 64 character limit.");
  if (!cn && entries.length === 0) errors.push("Enter a common name or at least one SAN.");
  if (cn && entries.length > 0 && !entries.some((e) => e.value === cn.toLowerCase())) {
    warnings.push(`The common name ${cn} is not in the SAN list. Add it there; most CAs require it.`);
  }
  if (entries.length === 0 && cn) warnings.push("No SANs are listed. Browsers match only SANs, so add at least the common name.");

  const key = KEY_OPTIONS.find((k) => k.id === input.key) ?? KEY_OPTIONS[0];
  const stem = fileStem(cn || entries[0]?.value || "request");
  const subjParts: string[] = [];
  if (country) subjParts.push(`/C=${country}`);
  if (org) subjParts.push(`/O=${subjEscape(org)}`);
  if (cn) subjParts.push(`/CN=${subjEscape(cn)}`);
  const subj = subjParts.join("") || "/";
  // OpenSSL reads every -addext argument as a line of configuration text, so
  // a # (comment), $ (variable), quote or backslash in a value needs the same
  // escaping as in csr.cnf. Without it a URI such as https://a.example/x#top
  // is cut at the # and every name after it is silently dropped.
  const sanText = entries.map((e) => `${e.type}:${configEscape(e.value)}`).join(",");
  // Without -utf8 (or utf8 = yes in a config file) OpenSSL reads each byte of
  // a field as one Latin-1 character, so every non-ASCII letter would be
  // stored as two wrong characters.
  const utf8 = /[^\x00-\x7f]/.test(cn + org);

  const lines = [
    `openssl req -new -newkey ${key.newkey} -nodes${utf8 ? " -utf8" : ""} \\`,
    `  -keyout ${shellQuote(`${stem}.key`)} -out ${shellQuote(`${stem}.csr`)} \\`,
    `  -subj ${shellQuote(subj)}${sanText ? " \\" : ""}`,
  ];
  if (sanText) lines.push(`  -addext ${shellQuote(`subjectAltName=${sanText}`)}`);

  const counters: Record<SanEntry["type"], number> = { DNS: 0, IP: 0, email: 0, URI: 0 };
  const altLines = entries.map((e) => `${e.type}.${++counters[e.type]} = ${configEscape(e.value)}`);
  const dnLines: string[] = [];
  if (country) dnLines.push(`C = ${country}`);
  if (org) dnLines.push(`O = ${configEscape(org)}`);
  if (cn) dnLines.push(`CN = ${configEscape(cn)}`);
  const config = [
    "[req]",
    "prompt = no",
    ...(utf8 ? ["utf8 = yes"] : []),
    "distinguished_name = dn",
    ...(entries.length ? ["req_extensions = req_ext"] : []),
    "",
    "[dn]",
    ...dnLines,
    ...(entries.length ? ["", "[req_ext]", "subjectAltName = @alt_names", "", "[alt_names]", ...altLines] : []),
    "",
  ].join("\n");
  // OpenSSL refuses an empty [dn] section ("No objects specified in config
  // file"), so an empty subject is given on the command line instead.
  const configCommand = `openssl req -new -newkey ${key.newkey} -nodes -keyout ${shellQuote(`${stem}.key`)} -out ${shellQuote(`${stem}.csr`)} -config csr.cnf${dnLines.length === 0 ? " -subj '/'" : ""}`;
  const inspect = `openssl req -in ${shellQuote(`${stem}.csr`)} -noout -text -verify`;
  return { errors, warnings, sans: entries, oneLiner: lines.join("\n"), config, configCommand, inspect };
}

/** Template fields filled from a decoded request, so it can be regenerated with a stronger key. */
export function templateFromCsr(csr: CsrInfo): Omit<TemplateInput, "key"> & { key: KeyOptionId } {
  const first = (oid: string) => csr.subject.rdns.flat().find((a) => a.oid === oid)?.value ?? "";
  const sans = csrSans(csr)
    .filter((n) => n.type === "DNS" || n.type === "IP" || n.type === "email" || n.type === "URI")
    .map((n) => (n.type === "DNS" ? n.raw : `${n.type}:${n.raw}`));
  const k = csr.publicKey;
  let key: KeyOptionId = "p256";
  if (k.keyType === "RSA" || k.keyType === "RSA-PSS") key = (k.bits ?? 0) >= 4096 ? "rsa4096" : (k.bits ?? 0) >= 3072 ? "rsa3072" : "rsa2048";
  // P-521 maps to P-384, the largest curve the generator offers.
  else if (k.keyType === "EC" && (k.curve?.webCrypto === "P-384" || k.curve?.webCrypto === "P-521")) key = "p384";
  return { commonName: first("2.5.4.3"), organization: first("2.5.4.10"), country: first("2.5.4.6"), sans: sans.join("\n"), key };
}
