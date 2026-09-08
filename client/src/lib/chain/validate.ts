/**
 * Validate a presented chain, one check at a time.
 *
 * Order matters and is not arbitrary. A client builds the path first and then
 * checks it, so a chain that cannot be built at all reports a missing
 * intermediate rather than whatever else is also wrong with it. Reporting the
 * expiry of a certificate that was never going to be reached would send the
 * operator to renew the wrong thing.
 */

import {
  at,
  nameMatches,
  type Certificate,
  type ChainFault,
  type CheckStep,
  type TrustStore,
  type Validation,
} from "./types";

const WEAK: string[] = ["sha1WithRSA", "md5WithRSA"];

export function validate(
  presented: Certificate[],
  store: TrustStore,
  hostname: string,
  now: string,
  /** Certificates the client already holds, e.g. a cached or bundled intermediate. */
  extra: Certificate[] = [],
): Validation {
  const steps: CheckStep[] = [];
  const clock = at(now);

  const done = (
    fault: ChainFault,
    summary: string,
    owner: Validation["owner"],
  ): Validation => ({ hostname, at: now, store: store.name, steps, fault, summary, owner });

  const leaf = presented[0];
  if (!leaf) {
    return done("missing-intermediate", "The server presented no certificates at all.", "server");
  }

  /*
    The leaf is whatever the server sent first, and a server that sends its
    chain in the wrong order is a real and common misconfiguration. Clients
    differ on whether they cope: OpenSSL historically did not, browsers
    generally do, which is exactly the shape of "works in Chrome, fails in
    curl".
  */
  const looksLikeLeaf = !leaf.isCa;
  steps.push({
    label: "The first certificate is the leaf",
    pass: looksLikeLeaf,
    detail: looksLikeLeaf
      ? `${leaf.subject}, not a CA, which is what a server should present first.`
      : `${leaf.subject} is a CA certificate. The server sent its chain in the wrong order, which some clients repair and some refuse.`,
    owner: looksLikeLeaf ? undefined : "server",
  });
  if (!looksLikeLeaf) {
    return done(
      "out-of-order",
      `The server presents ${leaf.subject} first, which is a CA certificate. The chain is in the wrong order. Browsers usually reorder it and OpenSSL usually does not, which is why this reads as "works in the browser, fails in curl".`,
      "server",
    );
  }

  // Build the path: leaf, then each issuer found among what is available.
  const pool = [...presented.slice(1), ...extra];
  const path: Certificate[] = [leaf];
  let cursor = leaf;
  const guard = new Set<string>([leaf.id]);
  for (;;) {
    if (cursor.subject === cursor.issuer) break; // self-signed, we are at a root
    const issuer = pool.find((cert) => cert.subject === cursor.issuer && !guard.has(cert.id));
    if (!issuer) break;
    guard.add(issuer.id);
    path.push(issuer);
    cursor = issuer;
  }

  const top = path[path.length - 1];
  const reachedRoot = store.roots.includes(top.subject);

  steps.push({
    label: "A path to something in the trust store",
    pass: reachedRoot,
    detail: reachedRoot
      ? `${path.length} ${path.length === 1 ? "certificate" : "certificates"} from ${leaf.subject} to ${top.subject}, which ${store.name} trusts.`
      : `The path stops at ${top.subject}, issued by ${top.issuer}, and nothing available continues it.`,
    owner: reachedRoot ? undefined : top.subject === top.issuer ? "client" : "server",
  });

  if (!reachedRoot) {
    if (top.subject === top.issuer) {
      return done(
        "untrusted-root",
        `The chain ends at ${top.subject}, which is self-signed and not in ${store.name}. Either this is a private CA that the client has not been given, or it is a root this client is too old or too new to have.`,
        "client",
      );
    }
    /*
      Self-signed means the leaf is its own issuer. It is NOT "only one
      certificate was presented", which is what I checked first and which is a
      missing intermediate wearing the same error message. Several tools make
      exactly this mistake in their output, reporting "self signed certificate
      in certificate chain" for a chain that stops early, and the operator then
      goes looking for a self-signed certificate that does not exist.
    */
    if (leaf.subject === leaf.issuer) {
      return done(
        "self-signed",
        `${leaf.subject} is its own issuer. This is a self-signed certificate: it vouches for itself, which is worth exactly as much as it sounds.`,
        "server",
      );
    }
    return done(
      "missing-intermediate",
      `The server presents ${presented.length} ${presented.length === 1 ? "certificate" : "certificates"} and the path stops at ${top.subject}, whose issuer ${top.issuer} was not sent. This is a missing intermediate: it works on any client that already cached the intermediate from another site and fails on everything else, which is why it looks intermittent.`,
      "server",
    );
  }

  // Now check the built path.
  for (const cert of path) {
    const before = at(cert.notBefore);
    const after = at(cert.notAfter);
    if (clock < before) {
      steps.push({
        label: `${cert.subject} is valid yet`,
        pass: false,
        detail: `Not valid before ${cert.notBefore}, and it is ${now}.`,
        owner: cert === leaf ? "client" : "ca",
      });
      return done(
        "not-yet-valid",
        cert === leaf
          ? `${cert.subject} is not valid until ${cert.notBefore} and the client's clock says ${now}. A certificate that is not valid yet almost always means the client's clock is wrong, not the certificate.`
          : `${cert.subject} in the chain is not valid until ${cert.notBefore}.`,
        cert === leaf ? "client" : "ca",
      );
    }
    if (clock > after) {
      const isLeaf = cert === leaf;
      steps.push({
        label: `${cert.subject} is in date`,
        pass: false,
        detail: `Expired ${cert.notAfter}, and it is ${now}.`,
        owner: isLeaf ? "server" : "ca",
      });
      return done(
        isLeaf ? "expired" : "expired-in-chain",
        isLeaf
          ? `${cert.subject} expired on ${cert.notAfter}. The server has to renew it.`
          : `${cert.subject} expired on ${cert.notAfter}, and it is in the chain above a leaf that is perfectly in date. Renewing the leaf changes nothing: the server is sending an expired intermediate and needs the CA's current one.`,
        isLeaf ? "server" : "ca",
      );
    }
    steps.push({
      label: `${cert.subject} is in date`,
      pass: true,
      detail: `${cert.notBefore} to ${cert.notAfter}.`,
    });
  }

  for (const cert of path.slice(1)) {
    if (!cert.isCa) {
      steps.push({
        label: `${cert.subject} may sign certificates`,
        pass: false,
        detail: "This certificate has no CA basic constraint and cannot issue.",
        owner: "ca",
      });
      return done(
        "not-a-ca",
        `${cert.subject} is in the chain as an issuer and is not a CA certificate. A leaf cannot sign, which is the constraint that stops a valid certificate for one host being used to mint certificates for others.`,
        "ca",
      );
    }
  }

  const revoked = path.find((cert) => cert.revoked);
  if (revoked) {
    steps.push({
      label: "Nothing in the chain is revoked",
      pass: false,
      detail: `${revoked.subject} is on the CA's revocation list.`,
      owner: revoked === leaf ? "server" : "ca",
    });
    return done(
      "revoked",
      `${revoked.subject} has been revoked. The dates are fine and the signature is fine; the CA has withdrawn it, which is a statement about the key rather than about the maths.`,
      revoked === leaf ? "server" : "ca",
    );
  }

  const weak = path.find((cert) => WEAK.includes(cert.sigAlg) && cert.subject !== cert.issuer);
  if (weak) {
    steps.push({
      label: "Signatures are strong enough",
      pass: false,
      detail: `${weak.subject} is signed with ${weak.sigAlg}.`,
      owner: "ca",
    });
    return done(
      "weak-signature",
      `${weak.subject} is signed with ${weak.sigAlg}, which every current client rejects. Note that the same algorithm on a self-signed root is harmless, because a root's signature is never checked by anyone: it is trusted because it is in the store, not because of its maths.`,
      "ca",
    );
  }

  const matched = leaf.sans.find((san) => nameMatches(hostname, san));
  steps.push({
    label: `The certificate is for ${hostname}`,
    pass: Boolean(matched),
    detail: matched
      ? `Matched SAN ${matched}.`
      : `SANs are ${leaf.sans.join(", ") || "empty"}, none of which match.`,
    owner: matched ? undefined : "requester",
  });
  if (!matched) {
    const wildcardNear = leaf.sans.find((san) => san.startsWith("*.") && hostname.endsWith(san.slice(1)));
    return done(
      "name-mismatch",
      wildcardNear
        ? `${hostname} does not match ${wildcardNear}. A wildcard covers exactly one label, so it matches www.${wildcardNear.slice(2)} and not the bare name or anything deeper. This is the most common wildcard surprise there is.`
        : `${hostname} is not in this certificate. The SANs are ${leaf.sans.join(", ") || "empty"}. Nothing on the server can fix this; the certificate request was wrong before it was signed.`,
      "requester",
    );
  }

  return done(
    "ok",
    `${hostname} validates against ${store.name}: a ${path.length}-certificate path to ${top.subject}, in date, correctly named.`,
    "nobody",
  );
}
