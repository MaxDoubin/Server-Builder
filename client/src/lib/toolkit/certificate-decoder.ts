/**
 * X.509 certificate decoding, review and chain checks for the certificate
 * decoder.
 *
 * The structure follows RFC 5280 section 4.1:
 *
 *   Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING }
 *   TBSCertificate ::= SEQUENCE {
 *     version [0] EXPLICIT Version DEFAULT v1, serialNumber INTEGER,
 *     signature AlgorithmIdentifier, issuer Name, validity Validity,
 *     subject Name, subjectPublicKeyInfo,
 *     issuerUniqueID [1] IMPLICIT OPTIONAL, subjectUniqueID [2] IMPLICIT OPTIONAL,
 *     extensions [3] EXPLICIT Extensions OPTIONAL }
 *
 * The DER parser, names, keys and extensions come from ./asn1, which the CSR
 * decoder shares. Nothing here throws to the caller: every parse failure is
 * returned as a message.
 */

import {
  type AlgorithmInfo,
  type DecodedTime,
  type DistinguishedName,
  type ExtensionSet,
  type InputNotice,
  type NameMatch,
  type PublicKeyInfo,
  type ReadResult,
  DerError,
  bytesEqual,
  bytesOf,
  colonHex,
  compareNames,
  contentOf,
  daysBetween,
  emptyExtensionSet,
  errorText,
  expectTag,
  isContext,
  isUniversal,
  parseAlgorithm,
  parseDer,
  parseExactly,
  parseExtensions,
  parseName,
  parsePublicKey,
  pkcs7Certificates,
  readBitString,
  readSmallInt,
  readTime,
  sha1,
  sha256,
  sniffDer,
  TAG,
  MAX_OBJECTS,
} from "./asn1";

/* ------------------------------------------------------------------ types */

export interface SerialInfo {
  /** Colon separated hex of the magnitude, as OpenSSL prints it. */
  hex: string;
  decimal: string;
  negative: boolean;
  /** Encoded length in octets, which RFC 5280 caps at 20. */
  octets: number;
}

export interface CertificateInfo {
  der: Uint8Array;
  label: string;
  /** 1, 2 or 3. */
  version: number;
  serial: SerialInfo;
  signatureAlgorithm: AlgorithmInfo;
  /** RFC 5280 4.1.1.2: the copy inside the signed part must equal the outer one. */
  innerAlgorithmMatches: boolean;
  issuer: DistinguishedName;
  subject: DistinguishedName;
  notBefore: DecodedTime;
  notAfter: DecodedTime;
  publicKey: PublicKeyInfo;
  extensions: ExtensionSet;
  hasUniqueIds: boolean;
  /** The signed bytes: the TBSCertificate exactly as encoded. */
  tbs: Uint8Array;
  signature: Uint8Array;
  sha1: string;
  sha256: string;
  /** Issuer and subject are the same name. */
  selfIssued: boolean;
  isCA: boolean;
  /** Common name, first DNS name, or the whole subject. */
  displayName: string;
}

export type CertEntry =
  | { ok: true; cert: CertificateInfo }
  | { ok: false; label: string; error: string };

export interface DecodeOutcome {
  entries: CertEntry[];
  notices: InputNotice[];
  error: string | null;
  /** True when the input held a certificate request rather than a certificate. */
  sawCsr: boolean;
}

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

/* ---------------------------------------------------------------- parsing */

function serialInfo(bytes: Uint8Array): SerialInfo {
  const negative = (bytes[0] & 0x80) !== 0;
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  if (negative) value -= 1n << BigInt(bytes.length * 8);
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const magnitude = negative ? bytes : bytes.subarray(start);
  return { hex: colonHex(magnitude), decimal: value.toString(), negative, octets: bytes.length };
}

/** Parses one DER certificate. `allowTrailing` is for OpenSSL's TRUSTED CERTIFICATE, which appends trust settings. */
export function parseCertificate(der: Uint8Array, label = "CERTIFICATE", allowTrailing = false): CertEntry {
  try {
    const root = allowTrailing ? parseDer(der, 0, der.length) : parseExactly(der, 0, der.length, "certificate");
    expectTag(root, TAG.SEQUENCE, "certificate", 0);
    if (root.children.length !== 3) {
      throw new DerError(`A certificate is a SEQUENCE of three parts; this one has ${root.children.length}`, root.start);
    }
    const [tbsNode, outerAlgNode, sigNode] = root.children;
    const tbsSeq = expectTag(tbsNode, TAG.SEQUENCE, "TBSCertificate", root.contentStart);
    const fields = tbsSeq.children;
    let i = 0;

    let version = 1;
    if (isContext(fields[0], 0)) {
      version = readSmallInt(der, fields[0].children[0], "version", fields[0].start) + 1;
      if (version > 3) throw new DerError(`The version field says v${version}; only v1 to v3 exist`, fields[0].start);
      i = 1;
    }
    const serialNode = expectTag(fields[i++], TAG.INTEGER, "serial number", tbsSeq.start);
    const serialBytes = contentOf(der, serialNode);
    if (serialBytes.length === 0) throw new DerError("The serial number is empty", serialNode.start);
    const innerAlg = parseAlgorithm(der, fields[i++], "signature algorithm inside the signed part", tbsSeq.start);
    const issuer = parseName(der, fields[i++], "issuer", tbsSeq.start);
    const validity = expectTag(fields[i++], TAG.SEQUENCE, "validity", tbsSeq.start);
    const notBefore = readTime(der, validity.children[0], "notBefore", validity.start);
    const notAfter = readTime(der, validity.children[1], "notAfter", validity.start);
    const subject = parseName(der, fields[i++], "subject", tbsSeq.start);
    const publicKey = parsePublicKey(der, fields[i++], tbsSeq.start);

    let hasUniqueIds = false;
    let extensions = emptyExtensionSet();
    let sawExtensions = false;
    for (; i < fields.length; i++) {
      const f = fields[i];
      if (isContext(f, 1) || isContext(f, 2)) hasUniqueIds = true;
      else if (isContext(f, 3)) {
        if (!f.children[0]) throw new DerError("The extensions field is empty", f.start);
        extensions = parseExtensions(der, f.children[0]);
        sawExtensions = true;
      } else throw new DerError(`Unexpected ${f.cls === 2 ? `[${f.tag}]` : "element"} at the end of the signed part`, f.start);
    }
    if (sawExtensions && version !== 3) {
      throw new DerError(`The certificate carries extensions but says it is v${version}; extensions need v3`, tbsSeq.start);
    }

    const outerAlg = parseAlgorithm(der, outerAlgNode, "signature algorithm", tbsSeq.end);
    const signature = readBitString(der, sigNode, "signature", outerAlgNode.end).bytes;
    const certDer = allowTrailing ? der.subarray(0, root.end) : der;
    const isCA = extensions.basicConstraints?.ca === true;
    const dns = extensions.san?.find((n) => n.type === "DNS");
    const cert: CertificateInfo = {
      der: certDer,
      label,
      version,
      serial: serialInfo(serialBytes),
      signatureAlgorithm: outerAlg,
      innerAlgorithmMatches: bytesEqual(innerAlg.der, outerAlg.der),
      issuer,
      subject,
      notBefore,
      notAfter,
      publicKey,
      extensions,
      hasUniqueIds,
      tbs: bytesOf(der, tbsSeq),
      signature,
      sha1: colonHex(sha1(certDer)),
      sha256: colonHex(sha256(certDer)),
      selfIssued: compareNames(issuer, subject) !== "different",
      isCA,
      displayName: subject.commonNames[0] ?? dns?.value ?? (subject.rfc4514 || "(empty subject)"),
    };
    return { ok: true, cert };
  } catch (err) {
    return { ok: false, label, error: errorText(err) };
  }
}

const CERT_LABELS = new Set(["CERTIFICATE", "X509 CERTIFICATE", "TRUSTED CERTIFICATE"]);
const UNARMORED = new Set(["DER", "BASE64", "HEX"]);

/** Turns the objects read from PEM or DER input into certificates, expanding PKCS#7 bundles. */
export function decodeCertificates(read: ReadResult): DecodeOutcome {
  const notices: InputNotice[] = [...read.notices];
  const entries: CertEntry[] = [];
  let sawCsr = false;
  const skipped: Record<string, number> = {};

  const push = (entry: CertEntry) => {
    if (entries.length < MAX_OBJECTS) entries.push(entry);
  };

  for (const obj of read.objects) {
    if (CERT_LABELS.has(obj.label) || UNARMORED.has(obj.label) || obj.label === "PKCS7" || obj.label === "PKCS #7 SIGNED DATA") {
      const kind = sniffDer(obj.der);
      if (kind === "pkcs7" || obj.label === "PKCS7" || obj.label === "PKCS #7 SIGNED DATA") {
        const certs = pkcs7Certificates(obj.der);
        if (!certs) push({ ok: false, label: obj.label, error: "The PKCS#7 block could not be read." });
        else if (certs.length === 0) notices.push({ tone: "warn", text: "The PKCS#7 bundle holds no certificates." });
        else {
          notices.push({ tone: "info", text: `Read ${certs.length} certificate${certs.length === 1 ? "" : "s"} out of a PKCS#7 bundle, in the order the bundle stores them.` });
          certs.forEach((c) => push(parseCertificate(c, "PKCS7")));
        }
        continue;
      }
      if (kind === "csr") {
        sawCsr = true;
        continue;
      }
      push(parseCertificate(obj.der, obj.label, obj.label === "TRUSTED CERTIFICATE"));
    } else if (obj.label === "CERTIFICATE REQUEST" || obj.label === "NEW CERTIFICATE REQUEST") {
      sawCsr = true;
    } else {
      skipped[obj.label] = (skipped[obj.label] ?? 0) + 1;
    }
  }

  if (read.objects.length > MAX_OBJECTS || entries.length >= MAX_OBJECTS) {
    notices.push({ tone: "warn", text: `Only the first ${MAX_OBJECTS} certificates are decoded.` });
  }
  if (sawCsr) {
    notices.push({ tone: "info", text: "A certificate signing request was found. It is not a certificate, so it was skipped here; the CSR decoder reads it." });
  }
  for (const [label, count] of Object.entries(skipped)) {
    const hint = label === "PUBLIC KEY" ? " A bare public key has no names, dates or issuer to show." : label === "X509 CRL" ? " A CRL lists revoked serial numbers; it is not a certificate." : "";
    notices.push({ tone: "info", text: `Skipped ${count} "${label}" block${count === 1 ? "" : "s"}.${hint}` });
  }
  return { entries, notices, error: read.error, sawCsr };
}

/* --------------------------------------------------------------- validity */

export interface ValidityStatus {
  state: "valid" | "expired" | "not-yet-valid" | "unknown";
  text: string;
  /** Whole days until notAfter, negative once expired. */
  daysRemaining: number | null;
  /** The RFC 5280 validity period, inclusive of both ends, in days. */
  lifetimeDays: number | null;
}

export function validityStatus(cert: CertificateInfo, nowMs: number): ValidityStatus {
  const nb = cert.notBefore.ms;
  const na = cert.notAfter.ms;
  if (nb === null || na === null) return { state: "unknown", text: "The validity dates could not be read.", daysRemaining: null, lifetimeDays: null };
  // RFC 5280 4.1.2.5: the period runs from notBefore through notAfter, inclusive.
  const lifetimeDays = (na - nb + 1000) / 86_400_000;
  const daysRemaining = daysBetween(nowMs, na);
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (nowMs > na) {
    const ago = daysBetween(na, nowMs);
    return { state: "expired", text: ago === 0 ? "Expired today" : `Expired ${plural(ago)} ago`, daysRemaining, lifetimeDays };
  }
  if (nowMs < nb) {
    const until = Math.max(1, Math.ceil((nb - nowMs) / 86_400_000));
    return { state: "not-yet-valid", text: `Not valid yet: starts in ${plural(until)}`, daysRemaining, lifetimeDays };
  }
  return { state: "valid", text: daysRemaining === 0 ? "Valid, expires within a day" : `Valid, ${plural(daysRemaining)} remaining`, daysRemaining, lifetimeDays };
}

/**
 * The longest validity a publicly trusted TLS certificate may have, by
 * issuance date, from the CA/Browser Forum Baseline Requirements section
 * 6.3.2: 398 days from September 2020, then Ballot SC-081's steps.
 */
export function maxPublicLifetimeDays(notBeforeMs: number): number | null {
  if (notBeforeMs < Date.UTC(2020, 8, 1)) return null;
  if (notBeforeMs < Date.UTC(2026, 2, 15)) return 398;
  if (notBeforeMs < Date.UTC(2027, 2, 15)) return 200;
  if (notBeforeMs < Date.UTC(2029, 2, 15)) return 100;
  return 47;
}

/* ----------------------------------------------------------------- review */

const PUBLIC_CURVES = new Set(["1.2.840.10045.3.1.7", "1.3.132.0.34", "1.3.132.0.35"]);

/** Problems with the key that matter for both certificates and requests. */
export function keyFindings(key: PublicKeyInfo): Finding[] {
  const out: Finding[] = [];
  if (key.keyType === "RSA" || key.keyType === "RSA-PSS") {
    const bits = key.bits ?? 0;
    if (bits < 2048) out.push({ tone: "danger", text: `The RSA key is ${bits} bits. NIST SP 800-131A disallowed RSA keys under 2048 bits after 2013, and 1024 bit keys are within reach of a well funded attacker.` });
    else out.push({ tone: "ok", text: `RSA ${bits} bit key.` });
    if (bits % 8 !== 0) out.push({ tone: "warn", text: `The modulus is ${bits} bits, not a multiple of 8. The Baseline Requirements require that for publicly trusted certificates, and an odd size usually means a broken key generator.` });
  } else if (key.keyType === "EC") {
    if (key.curve && PUBLIC_CURVES.has(key.curve.oid)) out.push({ tone: "ok", text: `ECDSA key on ${key.curve.name}.` });
    else out.push({ tone: "warn", text: `The key uses ${key.curve?.name ?? "an unnamed curve"}. Browsers and public CAs accept only P-256, P-384 and P-521.` });
  } else if (key.keyType === "DSA") {
    out.push({ tone: "danger", text: "DSA keys are no longer accepted for TLS by browsers or public CAs, and FIPS 186-5 no longer approves DSA for generating signatures." });
  } else if (key.keyType === "Ed25519" || key.keyType === "Ed448") {
    out.push({ tone: "info", text: `${key.keyType} is a sound algorithm, but the Baseline Requirements allow only RSA and ECDSA keys, so public CAs will not certify it. Private PKI and SSH-style uses are fine.` });
  }
  for (const issue of key.issues) out.push({ tone: "warn", text: issue });
  return out;
}

function nameFindings(dn: DistinguishedName, which: string): Finding[] {
  const out: Finding[] = [];
  for (const attr of dn.rdns.flat()) {
    for (const issue of attr.issues) out.push({ tone: issue.includes("known way") ? "danger" : "warn", text: `${which} ${attr.short}: ${issue}` });
  }
  return out;
}

/** What a certificate says about itself, independent of any chain. */
export function reviewCertificate(cert: CertificateInfo, nowMs: number): Finding[] {
  const out: Finding[] = [];
  const v = validityStatus(cert, nowMs);
  const ext = cert.extensions;
  const isLeaf = !cert.isCA;

  // Time.
  if (v.state === "expired") out.push({ tone: "danger", text: `${v.text}, on ${new Date(cert.notAfter.ms ?? 0).toISOString().slice(0, 10)}.` });
  else if (v.state === "not-yet-valid") out.push({ tone: "warn", text: `${v.text}. A clock that is wrong on either side produces the same error.` });
  else if (v.state === "valid" && (v.daysRemaining ?? 0) < 30) out.push({ tone: "warn", text: `Expires in ${v.daysRemaining} day${v.daysRemaining === 1 ? "" : "s"}. Renew now.` });
  else if (v.state === "valid") out.push({ tone: "ok", text: v.text + "." });
  if (cert.notBefore.ms !== null && cert.notAfter.ms !== null && cert.notAfter.ms < cert.notBefore.ms) {
    out.push({ tone: "danger", text: "notAfter is earlier than notBefore, so this certificate is never valid." });
  }
  for (const t of [cert.notBefore, cert.notAfter]) if (t.issue) out.push({ tone: "info", text: t.issue });
  if (cert.notAfter.raw === "99991231235959Z") {
    out.push({ tone: "info", text: "notAfter is 99991231235959Z, which RFC 5280 defines as having no well-defined expiration date." });
  }
  const isTlsServer = isLeaf && (ext.extKeyUsage === null || ext.extKeyUsage.includes("1.3.6.1.5.5.7.3.1")) && (ext.san?.some((n) => n.type === "DNS" || n.type === "IP") ?? false);
  if (isTlsServer && cert.notBefore.ms !== null && v.lifetimeDays !== null) {
    const max = maxPublicLifetimeDays(cert.notBefore.ms);
    if (max !== null && v.lifetimeDays > max) {
      out.push({ tone: "info", text: `The validity period is ${Math.round(v.lifetimeDays)} days. A publicly trusted TLS certificate issued on that date may last at most ${max} days, so this one comes from a private CA or breaks the rules.` });
    }
  }

  // Signature.
  const alg = cert.signatureAlgorithm;
  if (!cert.innerAlgorithmMatches) {
    out.push({ tone: "danger", text: "The signature algorithm inside the signed part differs from the one outside it. RFC 5280 4.1.1.2 requires them to be identical; a mismatch is a sign of tampering or a broken encoder." });
  }
  if (alg.weak) {
    out.push(
      cert.selfIssued
        ? { tone: "info", text: `Self-signed with ${alg.name}. A trust anchor is trusted by its key, not its self-signature, so the weak hash matters less here than anywhere else.` }
        : { tone: "danger", text: `Signed with ${alg.name}. Collisions in ${alg.hash} are practical (SHAttered, 2017, for SHA-1; MD5 was used to forge a CA certificate in 2008), and browsers rejected SHA-1 certificates from 2017.` },
    );
  } else if (alg.family === "unknown") out.push({ tone: "info", text: `The signature algorithm ${alg.oid} is not one this decoder recognizes.` });

  // Key.
  out.push(...keyFindings(cert.publicKey));

  // Serial.
  const s = cert.serial;
  if (s.negative) out.push({ tone: "warn", text: "The serial number is negative. RFC 5280 4.1.2.2 requires a positive integer, and strict parsers reject this." });
  else if (s.decimal === "0") out.push({ tone: "warn", text: "The serial number is zero. RFC 5280 requires a positive integer." });
  if (s.octets > 20) out.push({ tone: "warn", text: `The serial number is ${s.octets} octets. RFC 5280 caps it at 20, and some software refuses longer ones.` });
  else if (s.octets < 8 && !cert.selfIssued) out.push({ tone: "info", text: `The serial number is only ${s.octets} byte${s.octets === 1 ? "" : "s"}. Publicly trusted CAs must put at least 64 bits of random output in every serial; a small private CA counting from 1 is common.` });

  // Version and structure.
  if (cert.version < 3) {
    out.push({ tone: "warn", text: `This is a version ${cert.version} certificate. It cannot carry extensions, so nothing in it says whether it is a CA or what its key may be used for.` });
  }
  if (cert.hasUniqueIds) out.push({ tone: "info", text: "Issuer or subject unique identifiers are present. RFC 5280 says CAs must not generate them." });
  for (const name of ext.duplicates) out.push({ tone: "danger", text: `The ${name} extension appears more than once, which RFC 5280 4.2 forbids.` });
  for (const name of ext.unknownCritical) out.push({ tone: "warn", text: `${name} is marked critical and is not decoded here. A validator that does not recognize a critical extension must reject the certificate.` });
  for (const e of ext.list) if (e.error) out.push({ tone: "warn", text: `The ${e.name} extension did not decode: ${e.error}` });
  if (ext.precertificate) out.push({ tone: "warn", text: "This is a Certificate Transparency precertificate, not the certificate a server presents." });

  // Names.
  out.push(...nameFindings(cert.subject, "Subject"));
  if (!cert.selfIssued) out.push(...nameFindings(cert.issuer, "Issuer"));
  for (const n of ext.san ?? []) {
    if (n.hidden) out.push({ tone: "danger", text: `The SAN entry ${n.type}: ${n.value} contains hidden characters, shown escaped.` });
  }
  if (isLeaf && cert.version === 3) {
    const san = ext.san;
    if (!san || san.length === 0) {
      if (cert.subject.commonNames.length > 0) {
        out.push({ tone: "warn", text: "No subjectAltName. Browsers match host names only against the SAN and have ignored the common name since Chrome 58 in 2017, so this certificate will fail name checks." });
      }
    } else {
      const dns = san.filter((n) => n.type === "DNS" || n.type === "IP").map((n) => n.raw.toLowerCase());
      for (const cn of cert.subject.commonNames) {
        if (/^[a-z0-9*][a-z0-9.*-]*$/i.test(cn) && !dns.includes(cn.toLowerCase())) {
          out.push({ tone: "info", text: `The common name ${cn} is not one of the SAN entries. Clients ignore the CN, so it is the SAN list that decides which names work.` });
        }
      }
      const wild = san.filter((n) => n.type === "DNS" && n.raw.startsWith("*."));
      if (wild.length) out.push({ tone: "info", text: `Wildcard ${wild.map((n) => n.value).join(", ")}. A wildcard covers exactly one label: *.example.com matches a.example.com, not example.com and not a.b.example.com.` });
    }
  }

  // Constraints and usage.
  const bc = ext.basicConstraints;
  const ku = ext.keyUsage;
  if (bc?.ca) {
    const bcExt = ext.list.find((e) => e.oid === "2.5.29.19");
    if (bcExt && !bcExt.critical) out.push({ tone: "info", text: "basicConstraints says CA:TRUE but is not marked critical, which RFC 5280 4.2.1.9 requires for CA certificates." });
    if (ku && !ku.includes("keyCertSign")) out.push({ tone: "warn", text: "A CA certificate whose keyUsage omits keyCertSign cannot sign certificates." });
    if (!ext.subjectKeyId) out.push({ tone: "info", text: "A CA certificate without a subjectKeyIdentifier. RFC 5280 4.2.1.2 requires one so that children can point back to this key." });
  } else if (ku?.includes("keyCertSign")) {
    out.push({ tone: "danger", text: "keyUsage asserts keyCertSign but basicConstraints does not say CA:TRUE. RFC 5280 4.2.1.3 requires the CA flag whenever keyCertSign is set." });
  }
  if (!cert.selfIssued && cert.version === 3 && !ext.authorityKeyId) {
    out.push({ tone: "info", text: "No authorityKeyIdentifier. RFC 5280 4.2.1.1 requires it on every certificate that is not self-signed, and it is what lets a client pick the right issuer when a CA has rolled its key." });
  }
  if (isLeaf && ext.extKeyUsage?.includes("2.5.29.37.0")) {
    out.push({ tone: "info", text: "The extended key usage includes anyExtendedKeyUsage, which permits every purpose." });
  }
  if (ext.list.some((e) => e.oid === "1.3.6.1.5.5.7.1.24" && e.rows.some((r) => r.value.startsWith("status_request ")))) {
    out.push({ tone: "info", text: "OCSP Must-Staple is set: a client that honors it rejects this certificate unless the server staples a fresh OCSP response." });
  }

  if (cert.selfIssued) {
    out.push({ tone: "info", text: "Self-issued: the issuer and subject are the same name. It is trusted only where it is installed as a trust anchor." });
  }
  return out;
}

/* ------------------------------------------------------------------ chain */

export interface ChainLink {
  /** Index of the certificate that was issued. */
  child: number;
  /** Index of the certificate expected to have issued it. */
  parent: number;
  nameMatch: NameMatch;
  keyIdMatch: "match" | "mismatch" | "absent";
  findings: Finding[];
}

export interface ChainReport {
  links: ChainLink[];
  /** What the end of the list means for a client. */
  ending: Finding[];
  notes: Finding[];
}

/** Checks each certificate against the next one, the way a server must send them. */
export function analyzeChain(certs: CertificateInfo[]): ChainReport {
  const links: ChainLink[] = [];
  const notes: Finding[] = [];
  const ending: Finding[] = [];
  if (certs.length === 0) return { links, ending, notes };

  const seen = new Map<string, number>();
  certs.forEach((c, i) => {
    const prior = seen.get(c.sha256);
    if (prior !== undefined) notes.push({ tone: "warn", text: `Certificates ${prior + 1} and ${i + 1} are identical. Servers sometimes send a duplicate; it wastes bytes and can confuse strict clients.` });
    else seen.set(c.sha256, i);
  });

  for (let i = 0; i + 1 < certs.length; i++) {
    const child = certs[i];
    const parent = certs[i + 1];
    const findings: Finding[] = [];
    const nameMatch = compareNames(child.issuer, parent.subject);
    let keyIdMatch: ChainLink["keyIdMatch"] = "absent";
    if (child.extensions.authorityKeyId && parent.extensions.subjectKeyId) {
      keyIdMatch = child.extensions.authorityKeyId === parent.extensions.subjectKeyId ? "match" : "mismatch";
    }

    if (nameMatch === "exact") findings.push({ tone: "ok", text: `The issuer of ${i + 1} is the subject of ${i + 2}, byte for byte.` });
    else if (nameMatch === "normalized") findings.push({ tone: "info", text: `The issuer of ${i + 1} matches the subject of ${i + 2} only after case and space folding (RFC 5280 7.1). Most clients accept that; some compare bytes.` });
    else {
      const k = certs.findIndex((c, j) => j !== i && compareNames(child.issuer, c.subject) !== "different");
      let text: string;
      if (compareNames(parent.issuer, child.subject) !== "different") {
        text = `Certificate ${i + 2} was issued by ${i + 1}, not the other way round, so the list is in reverse order. A server sends its own certificate first and then each issuer in turn; TLS 1.2 (RFC 5246 7.4.2) requires that order.`;
      } else if (child.selfIssued) {
        text = `Certificate ${i + 1} is self-signed, so no issuer belongs after it.`;
      } else if (k >= 0) {
        text = `The issuer of ${i + 1} is not the subject of ${i + 2}. It is certificate ${k + 1}, so the list is out of order. TLS 1.2 (RFC 5246 7.4.2) requires each certificate to certify the one before it.`;
      } else {
        text = `The issuer of ${i + 1} is not the subject of ${i + 2}, and no certificate here issued it.`;
      }
      findings.push({ tone: "danger", text });
    }
    if (keyIdMatch === "match") findings.push({ tone: "ok", text: `The authority key ID of ${i + 1} equals the subject key ID of ${i + 2}.` });
    else if (keyIdMatch === "mismatch") findings.push({ tone: "danger", text: `The authority key ID of ${i + 1} differs from the subject key ID of ${i + 2}. Same name, different key: usually an old intermediate left over after the CA rolled its key.` });

    if (nameMatch !== "different") {
      if (parent.version === 3 && !parent.extensions.basicConstraints?.ca) {
        findings.push({ tone: "danger", text: `Certificate ${i + 2} is not a CA (no basicConstraints CA:TRUE), so it cannot issue certificate ${i + 1}.` });
      } else if (parent.extensions.keyUsage && !parent.extensions.keyUsage.includes("keyCertSign")) {
        findings.push({ tone: "danger", text: `The keyUsage of ${i + 2} does not include keyCertSign, so it cannot sign certificates.` });
      }
      const pathLen = parent.extensions.basicConstraints?.pathLen;
      if (pathLen !== null && pathLen !== undefined && i > pathLen) {
        findings.push({ tone: "danger", text: `Certificate ${i + 2} allows ${pathLen} intermediate${pathLen === 1 ? "" : "s"} below it (pathLen), and there ${i === 1 ? "is" : "are"} ${i}.` });
      }
    }
    links.push({ child: i, parent: i + 1, nameMatch, keyIdMatch, findings });
  }

  const last = certs[certs.length - 1];
  if (last.selfIssued) {
    ending.push({
      tone: "info",
      text: `The list ends at a self-signed certificate, ${last.displayName}. ${certs.length > 1 ? "Servers normally leave the root out: a client must already trust it, and sending it only adds bytes to every handshake." : "It is trusted only where someone installed it as a trust anchor."}`,
    });
  } else {
    const aia = last.extensions.list.find((e) => e.oid === "1.3.6.1.5.5.7.1.1")?.rows.find((r) => r.label === "caIssuers");
    ending.push({
      tone: certs.length === 1 && !last.isCA ? "warn" : "info",
      text: `The list ends at a certificate issued by ${last.issuer.commonNames[0] ?? (last.issuer.rfc4514 || "an unnamed issuer")}, which is not included. That is normal if the issuer is a root in the client's trust store. If it is an intermediate, the server must send it: some browsers fetch a missing intermediate${aia ? ` from the caIssuers URL (${aia.value.replace(/^URI: /, "")})` : ""}, but OpenSSL, curl and most other clients do not.`,
    });
  }
  return { links, ending, notes };
}

/* -------------------------------------------------------------- utilities */

/** "SHA-256 fingerprint" style rows for copying. */
export function fingerprintRows(cert: CertificateInfo): { label: string; value: string }[] {
  return [
    { label: "SHA-256", value: cert.sha256 },
    { label: "SHA-1", value: cert.sha1 },
  ];
}

export function serialHexCompact(cert: CertificateInfo): string {
  return cert.serial.hex.replace(/:/g, "");
}
