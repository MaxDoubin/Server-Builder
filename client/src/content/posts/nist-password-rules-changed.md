
## Fifteen characters, and no complexity rules at all

The password advice most organisations run on is a fossil. Eight characters,
one uppercase, one number, one symbol, changed every ninety days. It has been
wrong for years, and as of the fourth revision of NIST SP 800-63B it is not
merely discouraged, most of it is forbidden in normative language.

The revision is final. It was published in August 2025 and it supersedes the
document nearly every security policy in the country still quotes.

Here is what it actually requires, in its own words.

## The length floor moved, and it moved a long way

> Verifiers and CSPs **SHALL** require passwords that are used as a single
> factor authentication mechanism to be a minimum of 15 characters in length.
>
> SP 800-63B, section 3.1.1.2

Fifteen. Not eight. Eight survives only behind a second factor:

> Verifiers and CSPs **MAY** allow passwords that are only used as part of
> multi-factor authentication processes to be shorter but **SHALL** require
> them to be a minimum of eight characters.

And there is a ceiling requirement in the other direction, which exists
because systems that silently truncate are a real and common failure:

> Verifiers and CSPs **SHOULD** permit a maximum password length of at least
> 64 characters.

If your login form rejects a 40 character passphrase, that is now
specifically the thing the standard is telling you not to do.

## Four things you are now told not to do

Each of these is a SHALL NOT, which in this vocabulary is a prohibition, not
a suggestion.

**Composition rules are out.**

> Verifiers and CSPs **SHALL NOT** impose other composition rules (e.g.,
> requiring mixtures of different character types) for passwords.

The reasoning is behavioural rather than mathematical. Demanding an uppercase
and a digit and a symbol does not produce high entropy passwords, it produces
`Password1!`, because people satisfy the rule in the cheapest way available.
The rule shrinks the search space an attacker has to cover rather than
expanding it.

**Periodic rotation is out.**

> Verifiers and CSPs **SHALL NOT** require subscribers to change passwords
> periodically. However, verifiers **SHALL** force a change if there is
> evidence that the authenticator has been compromised.

Same reasoning. Ninety day rotation produces `Summer2026!` followed by
`Autumn2026!`, and it means the password in use is one a person picked in a
hurry while irritated. Change on evidence of compromise, which is when
changing it actually accomplishes something.

**Hints are out.**

> Verifiers and CSPs **SHALL NOT** permit the subscriber to store a hint
> (e.g., a reminder of how the password was created) that is accessible to an
> unauthenticated claimant.

A hint readable before authentication is a clue handed to whoever asks.

**Knowledge-based authentication is out.**

> Verifiers and CSPs **SHALL NOT** prompt subscribers to use knowledge-based
> authentication (KBA).

Mother's maiden name, first school, first pet. These are not secrets. They are
facts, most of them are public, and the ones that are not are guessable from a
social media profile. Every one of them is also a permanent credential,
because you cannot change where you went to school.

## The one thing you are told to add

> [Verifiers] **SHALL** compare the prospective secret against a blocklist
> that contains known commonly used, expected, or compromised passwords.

This is the part that replaces composition rules, and it is a strictly better
mechanism, because it targets the actual failure. A complexity rule is a
guess about what makes a password hard to crack. A blocklist is a measurement
of what attackers actually try.

The practical version is a list of the passwords that have appeared in
breaches, checked at the moment a password is set. If it is in the list, it
is already in a wordlist somewhere, and it does not matter how many character
classes it contains.

Note what the requirement does *not* say: it does not say check it on every
login, and it does not say check it against an unbounded list. Checking at
the point of setting is where the user can do something about it.

## SMS is restricted rather than banned

The previous revision's treatment of SMS was famously equivocal. This one is
clearer about the actual threat:

> Verifiers **SHOULD** consider risk indicators (e.g., device swap, SIM
> change, number porting, other abnormal behavior) before using the PSTN to
> deliver an out-of-band authentication secret.
>
> section 3.1.3.3

Read the list. Device swap, SIM change, number porting. Those are the steps
of a SIM swap attack, described in order. The standard is not saying SMS is
weak in the abstract, it is naming the specific sequence that defeats it and
telling you to watch for it.

The honest summary is that SMS is better than a password alone and worse than
anything that binds to the origin. If it is what you have, keep it, and put
the risk indicators above in front of it.

## What this means for a policy you actually own

If you run authentication for anything, the changes are concrete:

1. **Raise the minimum to 15** where a password stands alone, and allow 8
   only where a genuine second factor is present.
2. **Accept at least 64 characters**, and check that nothing in your stack
   truncates. Test it with a 64 character passphrase, not by reading the code.
3. **Delete the composition rules.** All of them.
4. **Delete the expiry policy**, and replace it with a forced reset on
   evidence of compromise, which means you need to be able to detect that.
5. **Add a breach blocklist check** at the point a password is set.
6. **Remove security questions** wherever they are still a recovery path,
   which is usually where nobody has looked in five years.

Points 3 and 4 are the ones that meet resistance, because removing a control
feels like weakening security. It is worth having the argument with the
document open: these are not relaxations, they are corrections, and the
standard's own reasoning is that the old rules made passwords worse.

## And the thing none of this fixes

A perfect password, 64 characters of high entropy, unique, never reused, in a
manager, is still typed into whatever page asked for it. If that page is a
proxy in front of the real one, the password is gone and so is the six digit
code that followed it.

Length requirements are a defence against guessing, and guessing is not how
accounts are taken any more. Phishing is. The only authenticator that
survives a live phishing proxy is one that binds to the origin, and that means
WebAuthn: the browser will not release a credential registered for your bank
to a site that is not your bank, and it does not matter how convincing the
page is, because the check is on the domain rather than on the human.

So: fifteen characters and a blocklist for everything, and hardware backed
WebAuthn for anything that matters. The first is the standard catching up
with what we already knew. The second is the part the standard cannot make
you do.

## References

- [NIST SP 800-63B revision 4: Digital Identity Guidelines, Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [NIST SP 800-63 revision 4, the full suite](https://pages.nist.gov/800-63-4/)
- [NIST SP 800-63B-4, the PDF of record](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63b-4.pdf)
- [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
- [RFC 2119: Key words for use in RFCs to Indicate Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 6238: TOTP, Time-Based One-Time Password Algorithm](https://www.rfc-editor.org/rfc/rfc6238.html)
