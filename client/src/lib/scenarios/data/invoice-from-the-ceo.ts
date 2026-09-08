import type { Scenario } from "../types";

/**
 * Business email compromise, from the finance clerk's side of the desk.
 *
 * The interesting failure here is not technical. Everything the attacker
 * sends is unremarkable; what carries it is urgency, authority and a request
 * to keep it quiet, and the control that stops it is a phone call to a number
 * you already had. So the branches are about whether the reader trusts the
 * channel or verifies out of band, and the traps are the ones that feel
 * polite: replying to check, asking the sender to confirm, not wanting to
 * bother a director.
 */
export const invoiceFromTheCeo: Scenario = {
  slug: "invoice-from-the-ceo",
  title: "The Invoice From the CEO",
  tagline: "An urgent payment request, from an address that is almost right.",
  difficulty: "easy",
  category: "Social engineering",
  role: "You are the accounts payable clerk at a 60-person architecture practice. You process about forty supplier payments a week and you have never met the CEO in person, because she works from the Manchester office.",
  clockStart: "Thursday 16:40",
  brief: [
    "Twenty minutes before you were going to leave, an email arrives from the CEO. It is short, it is polite, and it is asking you to pay an invoice today because the supplier has threatened to stop work tomorrow morning.",
    "The invoice is attached as a PDF. The bank details on it are not the ones you have on file for that supplier.",
  ],
  start: "inbox",
  reading: [
    { label: "Centralised logging, for when you need to find who else got it", href: "/blog/syslog-centralized-logging" },
    { label: "SPF, DKIM and DMARC, and what each one actually proves", href: "/blog/spf-dkim-dmarc-email-auth" },
  ],
  scenes: [
    {
      id: "inbox",
      mood: "calm",
      where: "Your inbox",
      body: [
        "You read it twice. It sounds like her: short sentences, no greeting, sent from a phone.",
      ],
      evidence: [
        {
          kind: "email",
          title: "Inbox, 16:38",
          lines: [
            "From:    Sarah Whitfield <s.whitfield@bramleyarchitects.co>",
            "To:      accounts@bramleyarchitects.co.uk",
            "Subject: Re: Kestrel Steel invoice 44219 - today please",
            "",
            "Can you get this one out today. They have threatened to down tools",
            "tomorrow and we cannot afford that on the Ellesmere job.",
            "",
            "Details have changed, use the ones on the invoice.",
            "",
            "In back to backs all afternoon so email is best.",
            "",
            "Sarah",
            "Sent from my iPhone",
          ],
        },
      ],
      choices: [
        {
          label: "Look carefully at the sender address before anything else",
          to: "read-the-address",
          cost: 1,
        },
        {
          label: "Reply and ask her to confirm the new bank details",
          detail: "Get it in writing from her before you move any money.",
          to: "replied",
          cost: 3,
        },
        {
          label: "Ring the supplier on the number you have on file",
          to: "rang-supplier",
          cost: 6,
        },
        {
          label: "Open the attachment and look at the invoice itself",
          to: "the-invoice",
          cost: 2,
        },
        {
          label: "Pay it. It is the CEO, the job is at risk, and it is nearly five",
          to: "end-paid-fast",
          cost: 8,
        },
      ],
    },

    {
      id: "the-invoice",
      mood: "tense",
      where: "The PDF",
      body: [
        "It is a good forgery. Kestrel's logo, their address, their VAT number, the right project reference, and a number in their invoice series.",
        "Two things are off. The sort code belongs to a challenger bank rather than the high street one you have paid for four years, and the account name is a limited company you have never heard of.",
      ],
      evidence: [
        {
          kind: "note",
          title: "Invoice 44219, payment details block",
          lines: [
            "Payable to:   KS TRADING SOLUTIONS LTD",
            "Sort code:    40-27-15",
            "Account:      81204466",
            "Reference:    ELLESMERE/44219",
            "",
            "On file for Kestrel Steel Ltd:",
            "Payable to:   KESTREL STEEL LTD",
            "Sort code:    20-45-77",
            "Account:      30119284",
          ],
        },
      ],
      choices: [
        {
          label: "A different account name is decisive. Report it",
          to: "reported",
          cost: 3,
        },
        {
          label: "Ring Kestrel on the number you have on file",
          to: "rang-supplier",
          cost: 6,
        },
        {
          label: "Walk over and ask the finance director",
          to: "ask-the-fd",
          cost: 4,
        },
        {
          label: "Companies change banks. Pay it",
          to: "end-paid-fast",
          cost: 8,
        },
      ],
    },

    {
      id: "ask-the-fd",
      mood: "tense",
      where: "The finance director's desk",
      body: [
        "He reads it over your shoulder and says the useful thing immediately, which is that Sarah is not in Manchester today, she is in the meeting room down the corridor.",
        "Then he says the less useful thing: that Kestrel really are threatening to stop work on Ellesmere, which is true, and which is how the sender knew to use it.",
      ],
      choices: [
        {
          label: "Walk down the corridor and ask her",
          to: "rang-sarah",
          cost: 3,
        },
        {
          label: "The FD is satisfied it is genuine. Pay it",
          to: "end-paid-confirmed",
          cost: 6,
        },
        {
          label: "Report it to IT first, then confirm with her",
          to: "reported",
          cost: 5,
        },
      ],
    },

    {
      id: "read-the-address",
      mood: "tense",
      where: "The message header",
      body: [
        "The company domain is bramleyarchitects.co.uk. This came from bramleyarchitects.co, which is a different domain that somebody registered eleven days ago.",
        "Everything else about the message is real: her name, her sign-off, the project name, the supplier, even the invoice number format.",
      ],
      evidence: [
        {
          kind: "log",
          title: "Message headers, the parts that matter",
          lines: [
            "Return-Path:  <s.whitfield@bramleyarchitects.co>",
            "Received-SPF: pass (bramleyarchitects.co: domain designates",
            "              185.220.101.44 as permitted sender)",
            "Authentication-Results: dkim=pass header.d=bramleyarchitects.co",
            "                        dmarc=pass header.from=bramleyarchitects.co",
            "Reply-To:     s.whitfield@bramleyarchitects.co",
          ],
        },
      ],
      choices: [
        {
          label: "Treat it as fraud and report it, without replying",
          to: "reported",
          cost: 4,
        },
        {
          label: "SPF, DKIM and DMARC all pass, so it must be legitimate",
          detail: "Three green ticks is three green ticks.",
          to: "end-trusted-the-ticks",
          cost: 5,
        },
        {
          label: "Ring Sarah on the number in the staff directory",
          to: "rang-sarah",
          cost: 5,
        },
      ],
    },

    {
      id: "replied",
      mood: "tense",
      where: "Your sent folder",
      body: [
        "You reply asking her to confirm the account number and sort code.",
        "The answer comes back in ninety seconds, from a woman who is supposedly in back to back meetings. It confirms the details, thanks you, and adds a line asking you not to mention it to the finance director because the supplier relationship is 'delicate'.",
      ],
      evidence: [
        {
          kind: "email",
          title: "Reply, 16:44",
          lines: [
            "Confirmed, those are correct. 40-27-15 / 81204466.",
            "",
            "Please keep this between us for now, the relationship with Kestrel",
            "is delicate and I do not want it discussed in the finance meeting.",
            "",
            "Sarah",
          ],
        },
      ],
      choices: [
        {
          label: "Stop. A request not to tell the finance director is the tell",
          to: "reported",
          cost: 2,
        },
        {
          label: "Pay it, she confirmed in writing",
          to: "end-paid-confirmed",
          cost: 6,
        },
        {
          label: "Ring Sarah on the number in the staff directory",
          to: "rang-sarah",
          cost: 5,
        },
      ],
    },

    {
      id: "rang-supplier",
      mood: "tense",
      where: "On the phone to Kestrel Steel",
      body: [
        "Kestrel's accounts office is still open. They have not changed their bank details, they have not threatened to down tools, and invoice 44219 was paid three weeks ago.",
        "They also mention, since you asked, that two other customers have rung this week about the same thing.",
      ],
      choices: [
        {
          label: "Report it internally and warn the rest of the finance team",
          to: "reported",
          cost: 4,
        },
        {
          label: "Reply to the email to tell them you know",
          detail: "Let them know it did not work.",
          to: "end-tipped-them-off",
          cost: 3,
        },
      ],
    },

    {
      id: "rang-sarah",
      mood: "recovering",
      where: "On the phone to the Manchester office",
      body: [
        "Sarah picks up on the second ring, because she is not in back to back meetings, she is eating a sandwich.",
        "She has not sent you anything today. She asks you to forward it to IT and not to reply to it, and then she asks the useful question: has anyone else in the team had one?",
      ],
      choices: [
        {
          label: "Report it and check whether anyone else received it",
          to: "reported",
          cost: 5,
        },
        {
          label: "Just delete it and get on with the afternoon",
          to: "end-deleted-quietly",
          cost: 1,
        },
      ],
    },

    {
      id: "reported",
      mood: "recovering",
      where: "The IT helpdesk",
      body: [
        "IT confirm the lookalike domain, block it at the gateway, and search the mail logs.",
        "Nine other people got the same message. Two replied. One of them is in the payments team and had already set up the payee, though not yet released the payment.",
        "The last question is what to do about the domain itself.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Message trace, last 24 hours",
          lines: [
            "SENDER DOMAIN            RECIPIENTS   REPLIED   FIRST SEEN",
            "bramleyarchitects.co     10           2         Thu 16:31",
            "",
            "Registered:  2026-08-28 (11 days ago)",
            "Registrar:   privacy service",
            "MX:          mail.bramleyarchitects.co -> 185.220.101.44",
          ],
        },
      ],
      choices: [
        {
          label: "Block it, report the domain to the registrar, and brief the whole company",
          to: "end-caught-and-closed",
          cost: 40,
        },
        {
          label: "Block it at the gateway and leave it there",
          to: "end-blocked-only",
          cost: 10,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-caught-and-closed",
      title: "Nothing paid, and everyone told",
      grade: "best",
      body: [
        "No money leaves. The lookalike domain is reported and suspended within two days. The whole company gets a short, specific briefing with the actual email in it, not a generic reminder to be vigilant.",
        "Finance adds one rule: any change to a supplier's bank details is verified by ringing a number already on file, never a number in the message asking for the change.",
      ],
      lesson: [
        "The control that stops this is a phone call to a number you already had. Not a reply, not a forwarded confirmation, not a second email: a channel the sender does not control.",
        "Telling everyone with the real message attached is worth more than any amount of general awareness training, because the next one will look exactly like it.",
      ],
    },
    {
      id: "end-blocked-only",
      title: "Blocked, and nobody told",
      grade: "mixed",
      body: [
        "The domain is blocked and the payment does not go out. Nothing else changes.",
        "Six weeks later a nearly identical message arrives from bramley-architects.co.uk, which is a different domain and therefore not blocked, and this time it reaches someone who has not heard the story.",
      ],
      lesson: [
        "Blocking a domain stops that domain. Registering the next one costs about ten pounds.",
        "The durable control is the verification rule, and a rule nobody has been told about is not a control.",
      ],
    },
    {
      id: "end-trusted-the-ticks",
      title: "SPF passed, DKIM passed, DMARC passed",
      grade: "bad",
      body: [
        "All three checks pass, and all three are telling the truth: the message really was sent by the domain it claims to be from. The domain is just not yours.",
        "Fourteen thousand pounds goes to an account that is emptied within the hour. The bank recovers none of it, because you authorised the payment.",
      ],
      lesson: [
        "SPF, DKIM and DMARC prove that a message came from the domain in the From header. They say nothing whatever about whether that domain should be trusted.",
        "A lookalike domain the attacker owns will pass all three every time, because they set up the records themselves. The check that matters is whether the domain is the right one, and that is a human reading it character by character.",
      ],
    },
    {
      id: "end-paid-confirmed",
      title: "She confirmed it in writing",
      grade: "bad",
      body: [
        "The confirmation came from the same mailbox as the request, which is to say it came from the attacker.",
        "Fourteen thousand pounds is gone. The request to keep it from the finance director was the part that should have stopped it, and it is also the part that made it feel like a real confidence from a senior person.",
      ],
      lesson: [
        "Asking the sender to confirm asks the attacker to confirm. Verification has to use a channel they do not control.",
        "Secrecy is a tell, every time. A legitimate instruction from a CEO does not need to be hidden from the finance director.",
      ],
    },
    {
      id: "end-paid-fast",
      title: "It was nearly five",
      grade: "catastrophic",
      body: [
        "Fourteen thousand pounds, out of the door in eight minutes, on a Thursday afternoon, to an account in a name that does not match the supplier.",
        "You find out on Monday, when the real Kestrel Steel chase the invoice they are still owed.",
      ],
      lesson: [
        "Urgency plus authority plus a deadline is the whole attack. It is designed to be read at 16:40 on a Thursday by someone who wants to go home.",
        "A changed bank account is the single highest-risk event in accounts payable, and it is the one thing that should never be actioned from an email alone, no matter who appears to have sent it.",
      ],
    },
    {
      id: "end-tipped-them-off",
      title: "You told them it did not work",
      grade: "mixed",
      body: [
        "No money is lost, which is the main thing.",
        "Your reply also confirms that the mailbox is live, monitored by a person, and belongs to someone in accounts payable, which is worth something to whoever is running the campaign. The next attempt comes from a different domain, addressed to you by name, and references the Ellesmere job.",
      ],
      lesson: [
        "Never reply to a fraudulent message, even to tell them off. A reply confirms the address is real and staffed, which is exactly what the sender wanted from a low-effort broadcast.",
        "Report it, block it, tell your colleagues. Say nothing to the sender.",
      ],
    },
    {
      id: "end-deleted-quietly",
      title: "Deleted, and left for the next person",
      grade: "bad",
      body: [
        "You did not pay it, which is the important part. You also did not tell anyone.",
        "Nine other people received the same message. Two of them replied. One of those set up the payee before someone else in the team happened to mention it in the kitchen on Friday morning, which is a very thin margin.",
      ],
      lesson: [
        "You are almost never the only recipient. A phishing run costs nothing to send to the whole company, and the one person who spots it is the early warning for everyone who did not.",
        "Reporting it takes two minutes and is the entire value you add by having noticed.",
      ],
    },
  ],
};
