/** Security and operations terms. */
import type { Term } from "../types";

export const SECURITY: Term[] = [
  {
    term: "certificate",
    field: "security",
    definition:
      "A public key plus a set of names, signed by a certificate authority. A client trusts it if it can build a path from it to a root in its own trust store, every certificate on that path is in date, and one of the names matches what it asked for.",
    confusion:
      "It proves custody of a domain, never the honesty of whoever holds it. Registering a lookalike domain and getting a valid certificate for it takes about ten minutes and costs nothing.",
    see: ["TLS", "CA", "chain of trust"],
  },
  {
    term: "CA",
    expansion: "Certificate Authority",
    field: "security",
    definition:
      "An organisation that signs certificates, and whose root is in clients' trust stores. Roots sign intermediates, intermediates sign leaves, and the root itself is trusted because it is in the store rather than because anything verified it.",
    confusion:
      "That last part matters: a root's own signature is never checked by anyone, so a scanner flagging SHA-1 on a self-signed root has found nothing. The same algorithm on an intermediate would be a real finding.",
    see: ["certificate", "chain of trust"],
  },
  {
    term: "chain of trust",
    field: "security",
    definition:
      "The path from a server's certificate up through intermediates to a root the client already has. The server is expected to send the leaf and the intermediates and not the root.",
    confusion:
      "A server sending only the leaf works in browsers, which cache intermediates from other sites and sometimes fetch missing ones, and fails in curl and most server-to-server tooling. Several tools report it as a self-signed certificate, so the operator goes looking for one that does not exist.",
    see: ["certificate", "CA", "TLS"],
  },
  {
    term: "wildcard certificate",
    field: "security",
    definition:
      "A certificate whose name is *.example.com, valid for any single label in that position.",
    confusion:
      "Exactly one label. It matches www.example.com, and matches neither example.com nor a.b.example.com. That is why nearly every real wildcard certificate lists the bare domain as a second name.",
    see: ["certificate", "SNI"],
  },
  {
    term: "NIST",
    expansion: "National Institute of Standards and Technology",
    field: "security",
    definition:
      "The US standards body whose publications, particularly the SP 800 series, are the reference for a great deal of security practice.",
    confusion:
      "Its password guidance changed years ago and the old version is still what most organisations enforce. SP 800-63B stopped recommending composition rules and mandatory rotation; length and a breached-password check replaced them.",
    see: ["MFA"],
  },
  {
    term: "MFA",
    expansion: "Multi-factor authentication",
    field: "security",
    definition:
      "Requiring more than one kind of evidence: something known, something held, something inherent.",
    confusion:
      "Not all factors resist the same attacks. A code read off a screen and typed into a page can be relayed by a proxy in real time; a hardware key bound to the origin cannot, because the browser will not sign for the wrong domain.",
    see: ["TOTP", "phishing"],
  },
  {
    term: "TOTP",
    expansion: "Time-based One-Time Password",
    field: "security",
    definition:
      "A six-digit code derived from a shared secret and the current thirty-second window, which is why it needs both parties' clocks to agree.",
    confusion:
      "It is phishable. A site that collects the code and replays it within the window is inside, which is the reason origin-bound credentials exist.",
    see: ["MFA", "NTP"],
  },
  {
    term: "phishing",
    field: "security",
    definition:
      "Mail designed to get a credential, a payment or a click. Modern examples authenticate correctly, because the sender owns the domain they are sending from.",
    confusion:
      "The tells people are taught, urgency and poor spelling, are the ones that no longer discriminate. The reliable signals are structural: a registrable domain that is not the brand's, a display name asserting a sender the address does not support, a link whose text names one host and whose target is another.",
    see: ["SPF", "DMARC", "BEC"],
  },
  {
    term: "BEC",
    expansion: "Business Email Compromise",
    field: "security",
    definition:
      "Fraud conducted through legitimate-looking correspondence rather than malware: an invoice with changed bank details, a request to move a payroll deposit, a supplier whose domain is one character different.",
    confusion:
      "There is often no malicious attachment and no link, so it passes every technical control. The defence is procedural: a change of payment destination is confirmed on a number held before the request arrived.",
    see: ["phishing", "SPF"],
  },
  {
    term: "least privilege",
    field: "security",
    definition:
      "Granting the minimum access needed for a task, and for no longer than the task takes.",
    confusion:
      "It is usually described as a permissions exercise and it is mostly a lifecycle one. Access granted for a project and never removed is how an account ends up with everything, and nobody notices because each grant was reasonable when it was made.",
    see: ["RBAC"],
  },
  {
    term: "RBAC",
    expansion: "Role-Based Access Control",
    field: "security",
    definition:
      "Assigning permissions to roles and roles to people, so access follows a job rather than an individual.",
    confusion:
      "Roles accumulate. Without a review that removes them, RBAC becomes a slower way of granting everything to everyone, and the audit trail makes it look deliberate.",
    see: ["least privilege"],
  },
  {
    term: "defence in depth",
    field: "security",
    definition:
      "Arranging controls so that no single failure is decisive, and so that a compromise of one layer meets another.",
    confusion:
      "It is not the same as many controls. Five products all inspecting the same traffic at the same point is one layer bought five times.",
    see: ["DMZ", "least privilege"],
  },
  {
    term: "CVE",
    expansion: "Common Vulnerabilities and Exposures",
    field: "security",
    definition:
      "The identifier scheme for publicly known vulnerabilities, so everyone can refer to the same issue by the same name.",
    confusion:
      "The identifier is not a severity and the attached score is not a priority. A high-scoring flaw in a component you do not expose matters less than a moderate one on your edge, and the score does not know which you have.",
    see: ["CVSS"],
  },
  {
    term: "CVSS",
    expansion: "Common Vulnerability Scoring System",
    field: "security",
    definition:
      "A formula producing a severity score from characteristics of a vulnerability: how it is reached, how hard it is to exploit, what it costs if exploited.",
    confusion:
      "The base score deliberately excludes your environment, and it is the number nearly everyone uses on its own. The temporal and environmental metrics exist to fix that and are almost never filled in.",
    see: ["CVE"],
  },
  {
    term: "SIEM",
    expansion: "Security Information and Event Management",
    field: "operations",
    definition:
      "The system that collects logs from everywhere, correlates them, and raises alerts.",
    confusion:
      "Its value is bounded by what is being sent to it and by whether anyone reads what comes out. A SIEM with every source connected and no tuned alerts is an expensive way to store logs you will read after the incident.",
    see: ["log retention"],
  },
  {
    term: "log retention",
    field: "operations",
    definition:
      "How long logs are kept. The number that matters is how long they are kept relative to how long an intrusion typically goes unnoticed.",
    confusion:
      "Thirty days is a common default and is shorter than the median dwell time in most published figures, which means the evidence is routinely gone before anyone knows to look for it.",
    see: ["SIEM"],
  },
  {
    term: "zero trust",
    field: "security",
    definition:
      "Designing so that being on the network grants nothing: every request is authenticated and authorised on its own merits regardless of where it came from.",
    confusion:
      "It is an architecture, not a product, and the hard part is not the gateway. It is having an inventory good enough to say what each identity should be allowed to reach.",
    see: ["least privilege", "802.1X"],
  },
  {
    term: "air gap",
    field: "security",
    definition:
      "A system with no network path to anything else, so that reaching it requires physical access.",
    confusion:
      "Almost nothing described as air-gapped is. A machine with a USB workflow for updates has a path with a human in it, and that path is the one that gets used.",
    see: ["defence in depth"],
  },
  {
    term: "hash",
    field: "security",
    definition:
      "A one-way function from any input to a fixed-length output. Used for integrity, and, with a slow algorithm and a per-user salt, for storing passwords.",
    confusion:
      "A general-purpose hash is the wrong tool for a password precisely because it is fast. SHA-256 over a password list runs at billions per second on a GPU; bcrypt, scrypt and Argon2 are slow on purpose.",
    see: ["salt", "NTLM"],
  },
  {
    term: "salt",
    field: "security",
    definition:
      "A unique random value stored alongside each password hash and mixed into it, so identical passwords produce different hashes and a precomputed table is useless.",
    confusion:
      "It is not a secret and does not need to be. Its job is to make each hash unique, not to be hidden.",
    see: ["hash"],
  },
  {
    term: "NTLM",
    field: "security",
    definition:
      "The older Windows authentication scheme, and the format its password hashes are stored in: unsalted MD4 over the password.",
    confusion:
      "Unsalted and fast means a modern GPU rig covers the entire eight-character keyspace in hours. An NTLM hash is close to a plaintext password for anyone who obtains it.",
    see: ["hash", "salt"],
  },
];
