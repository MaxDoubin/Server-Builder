/**
 * Nine certificates presented by nine servers, and what a client makes of them.
 *
 * The faults are picked so that the browser's error is the same or nearly the
 * same across several of them, because that is the situation people are
 * actually in. The question worth answering is never "is it broken", it is
 * "which of us fixes it", and each case names an owner.
 *
 * Every name is under a reserved suffix. Dates are relative to a fixed "now"
 * per case, so nothing here starts failing when the calendar moves.
 */

import type { Certificate, ChainFault, TrustStore, Validation } from "../types";

export const MODERN_STORE: TrustStore = {
  name: "a current browser",
  roots: ["Northbay Root CA X1", "Public Root G2"],
};

export const OLD_STORE: TrustStore = {
  name: "a device last updated in 2019",
  roots: ["Public Root G1", "Northbay Root CA X1"],
  note: "Has never seen the roots added since, and still trusts one that has expired.",
};

const cert = (c: Certificate): Certificate => c;

/* The roots. A root's own signature is never checked, which is why the weak
   algorithm on the old one is harmless and the expired dates are not. */
const ROOT_G2 = cert({
  id: "root-g2",
  subject: "Public Root G2",
  issuer: "Public Root G2",
  sans: [],
  notBefore: "2015-01-01",
  notAfter: "2040-01-01",
  sigAlg: "sha384WithECDSA",
  isCa: true,
});

const ROOT_G1 = cert({
  id: "root-g1",
  subject: "Public Root G1",
  issuer: "Public Root G1",
  sans: [],
  notBefore: "2000-09-30",
  notAfter: "2021-09-30",
  sigAlg: "sha1WithRSA",
  isCa: true,
});

const NORTHBAY_ROOT = cert({
  id: "nb-root",
  subject: "Northbay Root CA X1",
  issuer: "Northbay Root CA X1",
  sans: [],
  notBefore: "2020-01-01",
  notAfter: "2035-01-01",
  sigAlg: "sha256WithRSA",
  isCa: true,
});

const INT_CURRENT = cert({
  id: "int-current",
  subject: "Public Issuing CA 7",
  issuer: "Public Root G2",
  sans: [],
  notBefore: "2024-01-01",
  notAfter: "2029-01-01",
  sigAlg: "sha256WithRSA",
  isCa: true,
  pathLen: 0,
});

const INT_EXPIRED = cert({
  id: "int-expired",
  subject: "Public Issuing CA 4",
  issuer: "Public Root G2",
  sans: [],
  notBefore: "2019-01-01",
  notAfter: "2026-03-01",
  sigAlg: "sha256WithRSA",
  isCa: true,
  pathLen: 0,
});

const INT_NORTHBAY = cert({
  id: "int-nb",
  subject: "Northbay Issuing CA 1",
  issuer: "Northbay Root CA X1",
  sans: [],
  notBefore: "2020-06-01",
  notAfter: "2030-06-01",
  sigAlg: "sha256WithRSA",
  isCa: true,
  pathLen: 0,
});

const leaf = (
  id: string,
  subject: string,
  issuer: string,
  sans: string[],
  notBefore: string,
  notAfter: string,
  over: Partial<Certificate> = {},
): Certificate => ({
  id,
  subject,
  issuer,
  sans,
  notBefore,
  notAfter,
  sigAlg: "sha256WithRSA",
  isCa: false,
  ...over,
});

/**
 * One thing somebody might conclude from the symptom.
 *
 * `names` is the fault this claim asserts and `blames` the party it says has
 * to act, and between them they are how the page knows which option is
 * right: the validator runs, and the option asserting what it found is the
 * answer. Nothing in the data says which one that is.
 *
 * This replaced an `answer` index typed in by hand and checked only for
 * being inside the array. Repointing it at "The certificate is too
 * short-lived" passed CI and the page marked that right.
 *
 * `blames` is load-bearing rather than decoration, and two cases need it.
 * A certificate whose validity starts tomorrow is not-yet-valid whether the
 * client's clock is behind or the CA issued it with the wrong start date, and
 * those are different options: the validator tells them apart by who has to
 * fix it, and so does the reader. Where the fault alone is enough, `blames`
 * still has to agree, which is a free second assertion.
 *
 * `null` names nothing. "Chrome is ignoring an error" and "the wildcard is in
 * the CN rather than a SAN" are things people say that this validator does
 * not model at all: it reads subject alternative names and ignores the common
 * name, exactly as a browser has since 2017. A claim about the common name
 * can therefore never match, which is what a distractor should do.
 */
export interface Option {
  claim: string;
  names: ChainFault | null;
  blames: Validation["owner"] | null;
}

export interface ChainCase {
  id: string;
  symptom: string;
  hostname: string;
  now: string;
  store: TrustStore;
  presented: Certificate[];
  /** What the client already holds, which is how a missing intermediate hides. */
  extra?: Certificate[];
  fault: string;
  owner: string;
  options: Option[];
  explain: string[];
}

export const CHAIN_CASES: ChainCase[] = [
  {
    id: "everything-in-order",
    symptom: "Nothing is wrong with this one. Read it first so the others have something to differ from.",
    hostname: "www.northbay.example",
    now: "2026-09-08",
    store: MODERN_STORE,
    presented: [
      leaf("ok-leaf", "www.northbay.example", "Public Issuing CA 7", ["www.northbay.example", "northbay.example"], "2026-07-01", "2026-10-01"),
      INT_CURRENT,
    ],
    extra: [ROOT_G2],
    fault: "ok",
    owner: "nobody",
    options: [
      { claim: "Valid", names: "ok", blames: "nobody" },
      { claim: "The root was not presented, so it cannot be trusted", names: "untrusted-root", blames: "client" },
      { claim: "The certificate is too short-lived", names: null, blames: null },
      { claim: "The intermediate should have been first", names: "out-of-order", blames: "server" },
    ],
    explain: [
      "Two certificates presented, leaf then intermediate, and the root comes from the client's own store. That is the correct arrangement: a server that also sends the root is wasting a kilobyte on every handshake, because a client that does not already have the root would not trust it for being sent one.",
      "The ninety-day lifetime is not a problem either. It is now the normal case, and it exists because a certificate you have to renew constantly is a certificate you have automated.",
    ],
  },
  {
    id: "works-in-the-browser",
    symptom: "The site loads fine in Chrome. curl says self signed certificate in certificate chain, and so does the payment provider's webhook.",
    hostname: "shop.northbay.example",
    now: "2026-09-08",
    store: MODERN_STORE,
    presented: [
      leaf("mi-leaf", "shop.northbay.example", "Public Issuing CA 7", ["shop.northbay.example"], "2026-08-01", "2026-11-01"),
    ],
    extra: [ROOT_G2],
    fault: "missing-intermediate",
    owner: "server",
    options: [
      { claim: "The certificate has expired", names: "expired", blames: "server" },
      { claim: "The server is not sending the intermediate", names: "missing-intermediate", blames: "server" },
      { claim: "The hostname does not match", names: "name-mismatch", blames: "requester" },
      { claim: "Chrome is ignoring an error", names: null, blames: null },
    ],
    explain: [
      "The server sends only the leaf. The client has the root and does not have Public Issuing CA 7, so the path cannot be built.",
      "It works in a browser because browsers cache intermediates they have seen elsewhere and several will fetch a missing one from the URL in the certificate. curl does neither. Neither does most server-to-server tooling, which is why the first thing to break is a webhook and not a person.",
      "The most misleading part is how it presents. Because the chain stops at a certificate the client cannot verify, several tools report it as a self-signed certificate, and the operator goes looking for a self-signed certificate that does not exist.",
      "This is the server's to fix: send the full chain. It is one file concatenation and it is the single most common TLS misconfiguration there is.",
    ],
  },
  {
    id: "the-intermediate-expired",
    symptom: "The certificate was renewed last week and the error did not go away.",
    hostname: "portal.northbay.example",
    now: "2026-09-08",
    store: MODERN_STORE,
    presented: [
      leaf("ie-leaf", "portal.northbay.example", "Public Issuing CA 4", ["portal.northbay.example"], "2026-09-01", "2026-12-01"),
      INT_EXPIRED,
    ],
    extra: [ROOT_G2],
    fault: "expired-in-chain",
    owner: "ca",
    options: [
      { claim: "The leaf is still the old one", names: "expired", blames: "server" },
      { claim: "An expired intermediate is being sent above a leaf that is in date", names: "expired-in-chain", blames: "ca" },
      { claim: "The clock on the server is wrong", names: null, blames: null },
      { claim: "The root has expired", names: "expired-in-chain", blames: "client" },
    ],
    explain: [
      "The leaf was issued a week ago and expires in December. It is not the problem. Public Issuing CA 4 expired in March, and the server is still sending it.",
      "This is why renewing did not help. Most renewal tooling writes a new leaf into the same chain file and leaves whatever was above it, so an intermediate that quietly expired stays there through renewal after renewal.",
      "The error a browser shows is the same one it shows for an expired leaf, which sends people to look at the date on the certificate they just replaced and conclude the renewal did not take.",
      "The fix is to fetch the CA's current intermediate and rebuild the chain file. Nothing about the leaf changes.",
    ],
  },
  {
    id: "the-wildcard-that-does-not",
    symptom: "The wildcard certificate covers everything except the one address people actually type.",
    hostname: "northbay.example",
    now: "2026-09-08",
    store: MODERN_STORE,
    presented: [
      leaf("wc-leaf", "*.northbay.example", "Public Issuing CA 7", ["*.northbay.example"], "2026-06-01", "2026-12-01"),
      INT_CURRENT,
    ],
    extra: [ROOT_G2],
    fault: "name-mismatch",
    owner: "requester",
    options: [
      { claim: "The wildcard does not cover the bare domain", names: "name-mismatch", blames: "requester" },
      { claim: "The certificate has expired", names: "expired", blames: "server" },
      { claim: "The intermediate is missing", names: "missing-intermediate", blames: "server" },
      { claim: "The wildcard is in the CN rather than a SAN", names: null, blames: null },
    ],
    explain: [
      "A wildcard covers exactly one label. *.northbay.example matches www.northbay.example and does not match northbay.example, and it does not match a.b.northbay.example either.",
      "Both of those surprise people and both are deliberate. The bare domain is not a subdomain of itself, and allowing a wildcard to span dots would make a single certificate for *.example cover the whole namespace under it.",
      "The fix is on the certificate request, not the server: the bare name has to be listed as its own SAN alongside the wildcard, which is why nearly every real wildcard certificate has exactly two names on it.",
    ],
  },
  {
    id: "the-root-that-aged-out",
    symptom: "One elderly kiosk cannot reach the site. Every other device on the same network is fine.",
    hostname: "www.northbay.example",
    now: "2026-09-08",
    store: OLD_STORE,
    presented: [
      leaf("rt-leaf", "www.northbay.example", "Public Issuing CA 7", ["www.northbay.example"], "2026-07-01", "2026-10-01"),
      INT_CURRENT,
    ],
    extra: [ROOT_G2],
    fault: "untrusted-root",
    owner: "client",
    options: [
      { claim: "The server needs a different certificate", names: null, blames: null },
      { claim: "The client's trust store does not contain the root", names: "untrusted-root", blames: "client" },
      { claim: "The kiosk's clock is wrong", names: null, blames: null },
      { claim: "The intermediate is missing", names: "missing-intermediate", blames: "server" },
    ],
    explain: [
      "The chain is correct and complete and terminates at Public Root G2, which this device has never heard of because it has not had an update since 2019.",
      "Nothing the server does fixes this, and that is the part worth internalising. Reissuing the certificate produces another one under the same root. Adding intermediates changes nothing. The missing piece is in the client and only the client can supply it.",
      "In the real world this arrives all at once, when a root reaches its own expiry and a long tail of devices that trusted it stop working on the same day. It looks like a server outage and it is a fleet problem.",
      "The options are: update the device's trust store, replace the device, or serve it a certificate under a root it does have, which usually means an internal CA and a certificate that only that fleet trusts.",
    ],
  },
  {
    id: "the-clock",
    symptom: "A laptop that has been in a drawer for six months says the certificate is not valid yet.",
    hostname: "www.northbay.example",
    now: "2026-05-15",
    store: MODERN_STORE,
    presented: [
      leaf("ck-leaf", "www.northbay.example", "Public Issuing CA 7", ["www.northbay.example"], "2026-07-01", "2026-10-01"),
      INT_CURRENT,
    ],
    extra: [ROOT_G2],
    fault: "not-yet-valid",
    owner: "client",
    options: [
      { claim: "The certificate was issued with the wrong start date", names: "not-yet-valid", blames: "ca" },
      { claim: "The client's clock is behind", names: "not-yet-valid", blames: "client" },
      { claim: "The CA has not published the certificate yet", names: null, blames: null },
      { claim: "The intermediate is not valid yet", names: "not-yet-valid", blames: "ca" },
    ],
    explain: [
      "A certificate that is not valid yet is almost never a certificate problem. Somebody's clock is wrong, and it is nearly always the client's, because a server with a wrong clock breaks in far louder ways first.",
      "A flat CMOS battery, a device restored from an image, a virtual machine resumed from a snapshot: all of them come up in the past, and all of them produce this exact error against every site at once.",
      "That last detail is the diagnosis. One site failing is a certificate. Every site failing is a clock.",
    ],
  },
  {
    id: "the-chain-backwards",
    symptom: "Works in every browser. The load balancer health check fails and so does a Java client.",
    hostname: "api.northbay.example",
    now: "2026-09-08",
    store: MODERN_STORE,
    presented: [
      INT_CURRENT,
      leaf("bw-leaf", "api.northbay.example", "Public Issuing CA 7", ["api.northbay.example"], "2026-08-01", "2026-11-01"),
    ],
    extra: [ROOT_G2],
    fault: "out-of-order",
    owner: "server",
    options: [
      { claim: "The intermediate is presented before the leaf", names: "out-of-order", blames: "server" },
      { claim: "The leaf has expired", names: "expired", blames: "server" },
      { claim: "The Java client has an old trust store", names: "untrusted-root", blames: "client" },
      { claim: "The health check is using the wrong hostname", names: "name-mismatch", blames: "requester" },
    ],
    explain: [
      "The server sends the intermediate first. TLS says the leaf comes first and each subsequent certificate certifies the one before it, and this chain is the other way round.",
      "Browsers repair it, because browsers repair almost everything, and strict clients do not. That split is the signature of the fault: if a thing is broken only in the tooling and never in a browser, suspect the chain rather than the certificate.",
      "It usually comes from a deploy script that concatenated two PEM files in whichever order the shell glob returned them.",
    ],
  },
  {
    id: "the-private-ca",
    symptom: "An internal service works on managed laptops and fails on a contractor's machine.",
    hostname: "hr.northbay.example",
    now: "2026-09-08",
    store: { name: "an unmanaged laptop", roots: ["Public Root G2"] },
    presented: [
      leaf("pc-leaf", "hr.northbay.example", "Northbay Issuing CA 1", ["hr.northbay.example"], "2026-04-01", "2027-04-01"),
      INT_NORTHBAY,
    ],
    extra: [NORTHBAY_ROOT],
    fault: "untrusted-root",
    owner: "client",
    options: [
      { claim: "The internal CA root is not installed on that machine", names: "untrusted-root", blames: "client" },
      { claim: "The certificate is self-signed", names: "self-signed", blames: "server" },
      { claim: "The certificate has expired", names: "expired", blames: "server" },
      { claim: "The hostname does not match", names: "name-mismatch", blames: "requester" },
    ],
    explain: [
      "The chain is complete and correct and ends at Northbay Root CA X1, which is a private CA. Managed laptops have it because a management tool put it there; a contractor's machine has no reason to.",
      "It is not a self-signed certificate, and the distinction matters when someone asks. A self-signed certificate is its own issuer and vouches for nothing. This is a properly issued certificate under a root that this particular client does not happen to trust, which is a fact about the audience, not about the certificate.",
      "The right answer depends on who the service is for. Internal-only means distributing the root to whoever needs it. Anyone outside the organization means a publicly trusted certificate, because you cannot ask a contractor to install your CA and you should not want them to.",
    ],
  },
  {
    id: "the-signature-nobody-checks",
    symptom: "A scanner flags SHA-1 in the chain. Is this exploitable?",
    hostname: "www.northbay.example",
    now: "2026-09-08",
    store: OLD_STORE,
    presented: [
      leaf("s1-leaf", "www.northbay.example", "Public Root G1", ["www.northbay.example"], "2026-07-01", "2026-10-01"),
    ],
    extra: [ROOT_G1],
    fault: "expired-in-chain",
    owner: "ca",
    options: [
      { claim: "Yes, the leaf's own signature is SHA-1", names: "weak-signature", blames: "ca" },
      { claim: "No, it is the root's self-signature, which nothing verifies", names: null, blames: null },
      { claim: "The chain has a bigger problem than the algorithm", names: "expired-in-chain", blames: "ca" },
      { claim: "No, SHA-1 is still acceptable for certificates", names: null, blames: null },
    ],
    explain: [
      "The SHA-1 in the scanner output is Public Root G1's signature on itself, and a root's self-signature is never verified by anything: a root is trusted because it is in the store, not because of its maths. On that narrow question the scanner is wrong.",
      "But read the whole trace before agreeing with the reassuring answer. Public Root G1 expired on 30 September 2021, and this device still trusts it, which is the thing worth acting on.",
      "It is included because reasoning about one finding in isolation is how the actual problem gets closed as a false positive. The scanner raised the wrong flag and it was looking at something real.",
    ],
  },
];
