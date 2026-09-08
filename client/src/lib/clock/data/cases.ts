/**
 * Eight clocks, diagnosed from what broke rather than from what they say.
 *
 * Every tolerance is a real default. Kerberos allows five minutes, which is
 * the clockskew default in MIT krb5 and in Active Directory. A one-time code
 * is a thirty second step and validators accept a step either side, so thirty
 * seconds is the figure that always works and ninety is the figure that
 * sometimes does; thirty is used here and the page says why. A certificate
 * and an RRSIG have hard edges and no tolerance at all, which is why they are
 * the checks that pin the answer down.
 *
 * No case declares its answer. Each states what was observed, the model
 * intersects the intervals, and the correct option is the one whose range
 * matches. CI recomputes the same range by walking every second in the
 * fortnight either side of correct, because interval arithmetic is the sort
 * of thing that is nearly right.
 */

import type { Case } from "../types";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

export const CASES: Case[] = [
  {
    slug: "the-certificate-is-fine",
    name: "The certificate is not the problem",
    brief:
      "A new internal API went live two minutes ago with a freshly issued certificate. One application server cannot reach it and reports the certificate as not yet valid. That server signed into the domain this morning without complaint and its Kerberos tickets are renewing fine.",
    host: "app-04",
    checks: [
      {
        label: "TLS to the new internal API",
        rule: { kind: "window", from: -2 * MINUTE, to: 90 * DAY },
        observed: "fails",
        message: "x509: certificate has expired or is not yet valid: current time is before 2026-09-08T18:04:00Z",
      },
      {
        label: "Kerberos ticket renewal against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "works",
        message: "renewed, no complaint",
      },
    ],
    question: "How wrong is app-04's clock?",
    options: [
      { id: "a", claim: "Between 5 minutes slow and 2 minutes slow. Slow enough that a certificate issued two minutes ago is still in its future, and not slow enough for Kerberos to notice.", from: -300, to: -121 },
      { id: "b", claim: "Between 2 minutes slow and correct. Enough to miss a brand new certificate and nothing more.", from: -120, to: 0 },
      { id: "c", claim: "Between 5 minutes fast and 2 minutes fast. Fast clocks are what make certificates look wrong.", from: 121, to: 300 },
      { id: "d", claim: "More than 5 minutes slow. Anything less would not break a certificate at all.", from: -1209600, to: -301 },
    ],
    why:
      "Two observations and they bound it from both sides. Kerberos working puts the clock inside five minutes of the domain controller, because five minutes is the default tolerance and it is the widest one in the stack. The certificate failing puts it more than two minutes behind, because notBefore has no tolerance at all: a clock two minutes and one second slow is reading a moment before the certificate existed, and there is no grace period on that edge. So the answer is a window, not a number, and the window is what the evidence supports. Nothing here required looking at the certificate, which is the thing everybody looks at, because the message named it.",
    breaks: "that a message naming the certificate is about the certificate",
  },
  {
    slug: "both-wrong-together",
    name: "Two hosts that agree with each other",
    brief:
      "A pair of application servers behind the same load balancer. They talk to each other over mutual TLS with certificates they issued from a private CA a fortnight ago, and that works. Neither can validate anything from the internet, and neither can get a Kerberos ticket. Somebody has already checked that they agree with each other to the second.",
    host: "app-07",
    checks: [
      {
        label: "mutual TLS to its pair, on a certificate issued a fortnight ago",
        rule: { kind: "window", from: -13 * DAY, to: 365 * DAY },
        observed: "works",
        message: "handshake complete",
      },
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "fails",
        message: "krb5: KRB_AP_ERR_SKEW: clock skew too great",
      },
      {
        label: "TLS to a public endpoint, certificate issued twelve days ago",
        rule: { kind: "window", from: -12 * DAY, to: 78 * DAY },
        observed: "fails",
        message: "certificate is not yet valid",
      },
    ],
    question: "How wrong is app-07's clock?",
    options: [
      { id: "a", claim: "Correct. The pair agree to the second, so the clock is right and the problem is elsewhere.", from: 0, to: 0 },
      { id: "b", claim: "Between 13 days slow and 12 days slow. Old enough to miss a twelve day old certificate and not a thirteen day old one.", from: -1123200, to: -1036801 },
      { id: "c", claim: "Between 5 minutes slow and correct. Enough for Kerberos and not enough to matter to a certificate.", from: -300, to: 0 },
      { id: "d", claim: "Between 12 days fast and 13 days fast. A clock that far ahead is past every notAfter it meets.", from: 1036800, to: 1123200 },
    ],
    why:
      "The pair agreeing is the least informative fact available and it is the one that was checked first. Skew is relative, so two hosts wrong by the same amount agree with each other exactly, and everything between them works: the mutual TLS, the load balancer health checks, the replication. Everything against a third party fails. The private certificate issued a fortnight ago still validates because the clock has not fallen behind its notBefore; the public one issued twelve days ago does not, because it has. That pair of observations is the measurement, and it says the clock is about twelve and a half days behind.",
    breaks: "that two hosts agreeing with each other says anything about whether either is right",
  },
  {
    slug: "the-code-is-invalid",
    name: "The authenticator app that is not wrong",
    brief:
      "A jump host where one-time codes stopped being accepted overnight. The user has re-enrolled twice and tried a second device. Kerberos works, so domain logins are fine, and every certificate on the box validates.",
    host: "jump-02",
    checks: [
      {
        label: "one-time code, thirty second step with a step either side allowed",
        rule: { kind: "mutual", peer: "the code's own window", peerOffset: 0, tolerance: 30 },
        observed: "fails",
        message: "Invalid authentication code, please try again",
      },
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "works",
        message: "ticket granted",
      },
      {
        label: "TLS to a certificate issued forty seconds ago",
        rule: { kind: "window", from: -40, to: 90 * DAY },
        observed: "fails",
        message: "certificate is not yet valid",
      },
    ],
    question: "How wrong is jump-02's clock?",
    options: [
      { id: "a", claim: "Between 30 seconds slow and correct. Just enough to fall out of the code window.", from: -30, to: 0 },
      { id: "b", claim: "Between 5 minutes fast and 41 seconds fast. Either direction breaks a code equally.", from: 41, to: 300 },
      { id: "c", claim: "More than 5 minutes slow, which is why nothing time-based works.", from: -1209600, to: -301 },
      { id: "d", claim: "Between 5 minutes slow and 41 seconds slow. Past the code window and past a forty second old certificate, and inside what Kerberos allows.", from: -300, to: -41 },
    ],
    why:
      "This is the ordering that makes clock skew diagnosable. The tolerances in a normal stack differ by two orders of magnitude, so they break in a fixed sequence: one-time codes go at about thirty seconds, a certificate issued moments ago goes as soon as the clock is behind its notBefore, and Kerberos holds out to five minutes. Codes failing while Kerberos works therefore reads as somewhere between half a minute and five minutes, and the forty second old certificate failing narrows the near edge. Re-enrolling was never going to help: the seed was fine and the arithmetic on both ends was fine.",
    breaks: "that a code being rejected is about the code, when the tightest tolerance in the stack is the first thing to break",
  },
  {
    slug: "fast-not-slow",
    name: "The certificate that expired early",
    brief:
      "A monitoring box reporting that a certificate expired, three days before it does. The certificate is real and its notAfter is three days away. Kerberos works from this host and its one-time codes are accepted.",
    host: "mon-01",
    checks: [
      {
        label: "TLS to a service whose certificate expires in three days",
        rule: { kind: "window", from: -60 * DAY, to: 3 * DAY },
        observed: "fails",
        message: "certificate has expired",
      },
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "fails",
        message: "krb5: KRB_AP_ERR_SKEW: clock skew too great",
      },
      {
        label: "DNSSEC validation, signatures expiring in nine days",
        rule: { kind: "window", from: -1 * HOUR, to: 9 * DAY },
        observed: "works",
        message: "AD flag set, answers validate",
      },
    ],
    question: "How wrong is mon-01's clock?",
    options: [
      { id: "a", claim: "Between 3 days slow and 9 days slow. Behind enough that the certificate is not yet valid.", from: -777600, to: -259200 },
      { id: "b", claim: "More than 9 days fast, which is why the certificate reads as expired.", from: 777601, to: 1209600 },
      { id: "c", claim: "Between 5 minutes fast and 3 days fast. Enough to upset Kerberos and the certificate both.", from: 300, to: 259200 },
      { id: "d", claim: "Between 3 days fast and 9 days fast. Past the certificate notAfter and not yet past the DNSSEC expiry.", from: 259201, to: 777600 },
    ],
    why:
      "Expired and not yet valid are the same fault seen from opposite sides, and the message does not tell you which side you are on. Here the clock is ahead, so it has walked past a notAfter that is still three days away, and the certificate reports itself expired to a host living in its future. The DNSSEC signatures still validate, which is the upper bound: they expire in nine days, so the clock cannot be further ahead than that. Kerberos failing adds nothing beyond confirming the skew is over five minutes, which three days comfortably is.",
    breaks: "that an expiry message means the thing expired, rather than that the reader is in its future",
  },
  {
    slug: "a-tolerant-peer-that-is-wrong",
    name: "The domain controller is the one that is wrong",
    brief:
      "A new host cannot get a Kerberos ticket and reports skew. Its own clock is right: it has been checked against three internet sources and it validates every certificate and signature it is given. The domain controller has been up for two years.",
    host: "new-01",
    checks: [
      {
        label: "Kerberos against the domain controller, which is itself eight minutes fast",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 8 * MINUTE, tolerance: 5 * MINUTE },
        observed: "fails",
        message: "krb5: KRB_AP_ERR_SKEW: clock skew too great",
      },
      {
        label: "TLS to a certificate issued ninety seconds ago",
        rule: { kind: "window", from: -90, to: 90 * DAY },
        observed: "works",
        message: "handshake complete",
      },
      {
        label: "one-time code, thirty second step, a step either side allowed",
        rule: { kind: "mutual", peer: "the code's own window", peerOffset: 0, tolerance: 30 },
        observed: "works",
        message: "accepted on the first attempt",
      },
    ],
    question: "How wrong is new-01's clock?",
    options: [
      { id: "a", claim: "Between 5 minutes slow and 5 minutes fast. Somewhere inside the Kerberos tolerance, which is why nothing else broke.", from: -300, to: 300 },
      { id: "b", claim: "Between 30 seconds slow and 30 seconds fast. Everything with a tolerance accepted it, including the tightest one.", from: -30, to: 30 },
      { id: "c", claim: "More than 3 minutes fast, which is what the skew report means.", from: 181, to: 1209600 },
      { id: "d", claim: "Between 8 minutes slow and 3 minutes slow, which is where the domain controller would accept it.", from: -480, to: -180 },
    ],
    why:
      "The clock is right, and it is the only correct clock in the exchange. A one-time code being accepted puts it within thirty seconds of true time, and a certificate issued ninety seconds ago validating confirms it is not behind. The domain controller is eight minutes fast, so the difference between them is eight minutes, and eight minutes is more than the five it tolerates. The error is raised by the host that noticed, not by the host that is wrong, and there is nothing in the message to distinguish the two. Fixing this host's clock would make it worse.",
    breaks: "that the host reporting the skew is the host with the wrong clock",
  },
  {
    slug: "bogus-not-broken",
    name: "The zone that is not misconfigured",
    brief:
      "A resolver returning SERVFAIL for a domain that everybody else can resolve. dig with +cd returns the records, so the data is there and the validation is what is failing. The zone's operator has been contacted and is politely certain nothing is wrong.",
    host: "res-02",
    checks: [
      {
        label: "DNSSEC validation, signatures inception one hour ago",
        rule: { kind: "window", from: -1 * HOUR, to: 14 * DAY },
        observed: "fails",
        message: "SERVFAIL, validation failure: signature has expired or is not yet valid",
      },
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "fails",
        message: "krb5: KRB_AP_ERR_SKEW: clock skew too great",
      },
      {
        label: "TLS to a certificate issued three days ago and valid for ninety",
        rule: { kind: "window", from: -3 * DAY, to: 87 * DAY },
        observed: "works",
        message: "handshake complete",
      },
    ],
    question: "How wrong is res-02's clock?",
    options: [
      { id: "a", claim: "Between 3 days slow and 1 hour slow. Behind the signature inception and not behind the three day old certificate notBefore.", from: -259200, to: -3601 },
      { id: "b", claim: "Between 1 hour slow and correct. Just behind the inception time and nothing more.", from: -3600, to: 0 },
      { id: "c", claim: "More than 3 days slow, which is why validation fails.", from: -1209600, to: -259201 },
      { id: "d", claim: "Between 1 hour fast and 3 days fast. Ahead of the signature expiry.", from: 3600, to: 259200 },
    ],
    why:
      "An RRSIG has an inception as well as an expiration, and a resolver whose clock is behind the inception rejects a perfectly good signature as not yet valid. The message says the signature has expired or is not yet valid, with both possibilities in one string, and everybody reads the first half. dig with +cd returning the records is the tell: checking disabled means the data is fine and the validation is the problem, which narrows it to the validator, which is this host. The certificate issued three days ago still validating is the far edge: the clock is behind by more than an hour and less than three days.",
    breaks: "that a validation failure is a statement about the data being validated",
  },
  {
    slug: "inside-every-tolerance",
    name: "The clock that is wrong and breaks nothing",
    brief:
      "A host somebody is worried about because its clock disagrees with the wall by a noticeable amount. Everything on it works: domain logins, one-time codes, certificates issued a minute ago, DNSSEC. The question is whether to do anything before the weekend.",
    host: "web-11",
    checks: [
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "works",
        message: "ticket granted",
      },
      {
        label: "one-time code, thirty second step, a step either side allowed",
        rule: { kind: "mutual", peer: "the code's own window", peerOffset: 0, tolerance: 30 },
        observed: "works",
        message: "accepted on the first attempt",
      },
      {
        label: "TLS to a certificate issued twenty seconds ago",
        rule: { kind: "window", from: -20, to: 90 * DAY },
        observed: "works",
        message: "handshake complete",
      },
    ],
    question: "How wrong is web-11's clock?",
    options: [
      { id: "a", claim: "Correct. Every check in the stack accepted it, so there is nothing wrong to measure.", from: 0, to: 0 },
      { id: "b", claim: "Between 5 minutes slow and 5 minutes fast, which is all that can be said when nothing has broken.", from: -300, to: 300 },
      { id: "c", claim: "Between 20 seconds slow and 30 seconds fast. Inside every tolerance in the stack, including the tightest.", from: -20, to: 30 },
      { id: "d", claim: "Between 30 seconds slow and 20 seconds fast.", from: -30, to: 20 },
    ],
    why:
      "The control, and the useful thing about it is how narrow the answer is. Nothing broke, and nothing breaking is not the same as no information: the one-time code being accepted puts the clock inside thirty seconds either way, and the twenty second old certificate validating puts it no more than twenty seconds behind. So a host where everything works is still pinned to a fifty second window, and it is worth doing something before the weekend, because the next certificate issued will be issued moments before it is used and twenty seconds is not much margin. A clock that breaks nothing today is a clock whose drift has not yet arrived.",
    breaks: "that a clock which breaks nothing today is a clock that can be left alone",
  },
  {
    slug: "the-logs-that-lie",
    name: "The order the events did not happen in",
    brief:
      "An investigation into how an account was compromised. The authentication log on the jump host shows the successful login at 02:14:07 and the password change on the identity server at 02:14:31, which reads as the attacker changing the password after getting in. The jump host's Kerberos works, its one-time codes are accepted, and a certificate issued forty seconds earlier validated.",
    host: "jump-05",
    checks: [
      {
        label: "Kerberos against the domain controller",
        rule: { kind: "mutual", peer: "dc-01", peerOffset: 0, tolerance: 5 * MINUTE },
        observed: "works",
        message: "ticket granted",
      },
      {
        label: "one-time code, thirty second step, a step either side allowed",
        rule: { kind: "mutual", peer: "the code's own window", peerOffset: 0, tolerance: 30 },
        observed: "fails",
        message: "Invalid authentication code, please try again",
      },
      {
        label: "TLS to a certificate issued thirty-five seconds ago",
        rule: { kind: "window", from: -35, to: 90 * DAY },
        observed: "fails",
        message: "x509: certificate is not yet valid",
      },
    ],
    question: "How wrong is jump-05's clock?",
    options: [
      { id: "a", claim: "Between 30 seconds slow and correct. Enough to fall out of the code window.", from: -30, to: 0 },
      { id: "b", claim: "Between 5 minutes fast and 36 seconds fast, which is why the login looks early.", from: 36, to: 300 },
      { id: "c", claim: "Between 5 minutes slow and 36 seconds slow. Past the code window and behind a thirty-five second old certificate, and inside what Kerberos allows.", from: -300, to: -36 },
      { id: "d", claim: "Correct. Kerberos and the certificate both worked, so the timestamps can be trusted.", from: 0, to: 0 },
    ],
    why:
      "The clock is at least thirty-six seconds behind, so the login recorded at 02:14:07 happened at 02:14:43 or later, which is after the password change at 02:14:31 and not before it. The order in the two logs is the opposite of the order of events, and the story the investigation was about to tell is backwards: the password was changed first and the login used the new password. Nothing warned anybody, because two timestamps from two hosts sort perfectly well whether or not they mean the same thing. This is the failure with no error message at all, and the reason log correlation wants one clock rather than agreement between clocks.",
    breaks: "that two log lines from two hosts can be put in order by their timestamps",
  },
];
