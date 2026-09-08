import type { Scenario } from "../types";

/**
 * A certificate expiry, which is the most predictable outage in computing and
 * still one of the most common.
 *
 * The interesting decisions are not about TLS. They are about what people do
 * when a deadline meets a change freeze: the temptation to tell customers to
 * click through the warning, to disable verification on the internal caller,
 * to reuse the private key, and to fix the one certificate rather than the
 * process that let it expire unwatched.
 */
export const certificateSunday: Scenario = {
  slug: "certificate-sunday",
  title: "The Certificate Expired on a Sunday",
  tagline: "Checkout starts failing at 00:00 UTC. The renewal was somebody's calendar reminder.",
  difficulty: "medium",
  category: "TLS and identity",
  role: "You are the platform engineer on call for a mid-sized retailer. Sunday is 14 percent of the week's revenue and the change freeze for the autumn campaign started on Friday.",
  clockStart: "Sunday 00:07",
  brief: [
    "Payments started failing seven minutes after midnight. The web front end is up, the basket works, and the call to the payment gateway fails with a TLS error.",
    "The gateway is a third party. The certificate that expired is yours.",
  ],
  start: "the-error",
  reading: [
    { label: "Certificates, explained without hand-waving", href: "/blog/ssl-tls-certificates-explained" },
    { label: "Certificate lifetimes are 200 days now, and heading down", href: "/blog/certificate-lifetimes-are-200-days-now" },
    { label: "Automating rotation so this cannot happen", href: "/blog/certificate-rotation-automation" },
  ],
  scenes: [
    {
      id: "the-error",
      mood: "critical",
      where: "The application logs",
      body: [
        "The error is unambiguous, which is a mercy at ten past midnight.",
      ],
      evidence: [
        {
          kind: "log",
          title: "checkout-service, repeating since 00:00:04Z",
          lines: [
            "ERROR  gateway.client  post https://pay.acme-retail.com/v2/charge",
            "       x509: certificate has expired or is not yet valid:",
            "       current time 2026-09-13T00:00:04Z is after 2026-09-12T23:59:59Z",
            "",
            "$ echo | openssl s_client -connect pay.acme-retail.com:443 2>/dev/null \\",
            "    | openssl x509 -noout -subject -dates -issuer",
            "subject=CN=pay.acme-retail.com",
            "notBefore=Jun 14 00:00:00 2026 GMT",
            "notAfter=Sep 12 23:59:59 2026 GMT",
            "issuer=C=US, O=Let's Encrypt, CN=R11",
          ],
        },
      ],
      choices: [
        {
          label: "Issue a new certificate now and reload",
          detail: "It is Let's Encrypt. This should take four minutes.",
          to: "try-renew",
          cost: 4,
        },
        {
          label: "Turn off certificate verification on the checkout service",
          detail: "One config flag and payments work again.",
          to: "disabled-verify",
          cost: 3,
        },
        {
          label: "Find out why the renewal did not happen before you renew by hand",
          to: "why-not-renewed",
          cost: 8,
        },
        {
          label: "Put the site into maintenance mode while you sort it out",
          to: "maintenance",
          cost: 5,
        },
      ],
    },

    {
      id: "try-renew",
      mood: "critical",
      where: "certbot on the gateway host",
      body: [
        "The renewal fails. The HTTP-01 challenge cannot complete because the load balancer in front of this host was reconfigured in August to redirect everything on port 80 straight to HTTPS, including /.well-known/acme-challenge.",
        "That is also, you now realise, why the automatic renewal has been failing silently since 14 August.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "certbot renew --dry-run",
          lines: [
            "Simulating renewal of an existing certificate for pay.acme-retail.com",
            "Challenge failed for domain pay.acme-retail.com",
            "http-01 challenge for pay.acme-retail.com",
            "Detail: 172.19.4.11: Invalid response from",
            "http://pay.acme-retail.com/.well-known/acme-challenge/9Kx2: 301",
            "",
            "$ journalctl -u certbot.timer --since '2026-08-01' | grep -c 'Challenge failed'",
            "30",
          ],
        },
      ],
      choices: [
        {
          label: "Add an exception on the load balancer for the ACME path, then renew",
          to: "acme-exception",
          cost: 12,
        },
        {
          label: "Switch to a DNS-01 challenge, which does not need port 80 at all",
          to: "dns-challenge",
          cost: 25,
        },
        {
          label: "Buy a one-year certificate from a commercial CA to get through tonight",
          to: "bought-one",
          cost: 45,
        },
        {
          label: "Turn off verification on the caller instead",
          to: "disabled-verify",
          cost: 3,
        },
      ],
    },

    {
      id: "acme-exception",
      mood: "recovering",
      where: "The load balancer config",
      body: [
        "You add a path exception so /.well-known/acme-challenge is served over HTTP rather than redirected. The renewal completes on the next attempt and nginx reloads with the new certificate.",
        "Payments resume at 00:31. Twenty-four minutes of a Sunday, which is expensive but survivable.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "After the reload",
          lines: [
            "notBefore=Sep 13 00:24:11 2026 GMT",
            "notAfter=Dec 12 00:24:10 2026 GMT",
            "",
            "$ systemctl list-timers certbot.timer",
            "NEXT                        LEFT       UNIT",
            "Sun 2026-09-13 03:47:00 UTC 3h 16min   certbot.timer",
          ],
        },
      ],
      choices: [
        {
          label: "Make a failed renewal page somebody, since thirty of them did not",
          to: "alerting",
          cost: 20,
        },
        {
          label: "Check every other certificate in the estate before Monday",
          to: "estate-sweep",
          cost: 40,
        },
        {
          label: "It is 00:35 on a Sunday. Write it up in the morning",
          to: "end-renewed-only",
          cost: 0,
        },
      ],
    },

    {
      id: "dns-challenge",
      mood: "tense",
      where: "Reworking the challenge type",
      body: [
        "DNS-01 needs an API credential for the DNS provider and a propagation wait, so it takes twenty-five minutes at one in the morning rather than four.",
        "It is also the right answer: it does not depend on port 80, it works for hosts that are not reachable from the internet, and it is the only option that supports the wildcard the other six services want.",
      ],
      choices: [
        {
          label: "Roll DNS-01 out to every certificate in the estate",
          to: "estate-sweep",
          cost: 60,
        },
        {
          label: "Make a failed renewal page somebody",
          to: "alerting",
          cost: 20,
        },
        {
          label: "Payments are back. Enough for tonight",
          to: "end-renewed-only",
          cost: 0,
        },
      ],
    },

    {
      id: "why-not-renewed",
      mood: "tense",
      where: "The renewal timer's journal",
      body: [
        "Thirty consecutive failures since 14 August, every one of them logged, none of them alerted on. The timer's unit has no OnFailure, and nothing scrapes the certbot state.",
        "The August change that broke it was a load balancer rule redirecting all of port 80 to HTTPS. Sensible change. It also took out the ACME challenge path, and the only symptom was a line in a journal nobody reads.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The whole story, in one command",
          lines: [
            "$ journalctl -u certbot.service --since '2026-08-01' \\",
            "    | grep -E 'Congratulations|Challenge failed' | awk '{print $1, $2, $NF}' | uniq -c",
            "     13 Aug 01 succeeded",
            "     30 Aug 14 failed",
            "",
            "$ git log --oneline -1 --since=2026-08-13 --until=2026-08-15 -- lb/",
            "e4419aa force HTTPS on all paths (SEO, mixed content)",
          ],
        },
      ],
      choices: [
        {
          label: "Fix the challenge path and renew, then fix the alerting",
          to: "acme-exception",
          cost: 12,
        },
        {
          label: "Move to DNS-01 so a port 80 rule can never break it again",
          to: "dns-challenge",
          cost: 25,
        },
        {
          label: "Buy a commercial certificate and stop relying on automation",
          to: "bought-one",
          cost: 45,
        },
      ],
    },

    {
      id: "bought-one",
      mood: "tense",
      where: "A commercial CA's checkout, at one in the morning",
      body: [
        "Domain validation, a card payment, and a wait for issuance. Forty-five minutes and 210 pounds later you have a certificate valid until next September, and payments are back at 01:04.",
        "You also have a certificate that will expire in a year, with no automation behind it, renewed by whoever is here next September.",
      ],
      choices: [
        {
          label: "Set up automation anyway, before the next one",
          to: "dns-challenge",
          cost: 30,
        },
        {
          label: "Put a calendar reminder in for August",
          to: "end-calendar-reminder",
          cost: 5,
        },
      ],
    },

    {
      id: "disabled-verify",
      mood: "critical",
      where: "checkout-service config",
      body: [
        "You set the client to skip certificate verification. Payments resume in three minutes, which is the fastest recovery available tonight.",
        "The checkout service now accepts any certificate from anything that answers on that address, which for a service that carries card data is a control you have removed rather than a workaround you have applied. It is 00:11 and nobody else is awake to disagree with you.",
      ],
      choices: [
        {
          label: "Renew properly now, then turn verification back on before anyone wakes up",
          detail: "Start by finding out why the automatic renewal did not run.",
          to: "why-not-renewed",
          cost: 10,
        },
        {
          label: "Leave it until Monday when the team can do it in change control",
          to: "end-verify-off",
          cost: 0,
        },
      ],
    },

    {
      id: "maintenance",
      mood: "tense",
      where: "The maintenance page",
      body: [
        "The site goes to a holding page. No failed payments, no half-completed orders, no customers seeing a card error and trying three times.",
        "It costs the whole of the night's revenue rather than the failing part of it, and it is honest. Now you still have to fix the certificate.",
      ],
      choices: [
        { label: "Renew the certificate", to: "try-renew", cost: 4 },
        {
          label: "Find out why the renewal did not happen first",
          to: "why-not-renewed",
          cost: 8,
        },
        {
          label: "Hand over to the morning shift and go back to bed",
          detail: "The bleeding has stopped and the change freeze is on.",
          to: "end-maintenance-only",
          cost: 450,
        },
      ],
    },

    {
      id: "alerting",
      mood: "recovering",
      where: "Prometheus and the timer unit",
      body: [
        "Two things go in. An OnFailure on the certbot unit that pages, and a blackbox probe that alerts when any certificate the estate serves is inside twenty-one days of expiry.",
        "The second one is the useful one, because it does not care why the renewal failed or whether it was even attempted. It measures the thing that matters, which is what a client would see.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The rule",
          lines: [
            "- alert: CertificateExpiringSoon",
            "  expr: probe_ssl_earliest_cert_expiry - time() < 21 * 86400",
            "  for: 1h",
            "  labels:   { severity: page }",
            "  annotations:",
            "    summary: '{{ $labels.instance }} certificate expires in",
            "              {{ $value | humanizeDuration }}'",
          ],
        },
      ],
      choices: [
        {
          label: "Point it at every certificate in the estate, not just this one",
          to: "estate-sweep",
          cost: 40,
        },
        { label: "That covers the payment gateway. Enough", to: "end-alerted-one", cost: 0 },
      ],
    },

    {
      id: "estate-sweep",
      mood: "tense",
      where: "Scanning everything you serve",
      body: [
        "Forty-one certificates across the estate. Two more are inside their last month, one of which is the internal service mesh CA that expires in nineteen days and would take out everything at once rather than just checkout.",
        "Nobody knew that one existed. It was issued for ten years in 2016 by somebody who has left.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Expiry sweep",
          lines: [
            "HOST                              DAYS LEFT   AUTO-RENEW",
            "pay.acme-retail.com                      90   yes",
            "www.acme-retail.com                      74   yes",
            "api.acme-retail.com                      12   NO",
            "mesh-ca.internal                         19   NO   (10y cert, issued 2016)",
            "vpn.acme-retail.com                     201   yes",
            "... 36 more, all > 60 days",
          ],
        },
      ],
      choices: [
        {
          label: "Renew the two, automate all forty-one, and alert on every one",
          to: "end-fixed-the-estate",
          cost: 300,
        },
        {
          label: "Renew the two by hand and put reminders in",
          to: "end-renewed-two",
          cost: 60,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-fixed-the-estate",
      title: "Twenty-four minutes, then the whole estate",
      grade: "best",
      body: [
        "Payments back at 00:31. By Wednesday every one of the forty-one certificates renews automatically over DNS-01, and a blackbox probe pages at twenty-one days regardless of why.",
        "The mesh CA, which nobody knew about and which would have taken out every internal service at once nineteen days later, is renewed and in the same automation.",
      ],
      lesson: [
        "Certificate expiry is the most predictable outage there is: the date is printed on the certificate. The failure is never the cryptography, it is that nothing was watching a date everybody could see.",
        "Alert on what a client would observe (days until the served certificate expires), not on whether the renewal job succeeded. The probe catches the certificate nobody knew was there, and the job monitor does not.",
      ],
    },
    {
      id: "end-renewed-two",
      title: "Three certificates, forty-one problems",
      grade: "good",
      body: [
        "The gateway, the API and the mesh CA are all renewed, which means the three that were going to break are fixed.",
        "The other thirty-eight renew by whatever mechanism they were already using, including the ones using the mechanism that silently failed thirty times in a row.",
      ],
      lesson: [
        "Finding the sweep is most of the value: you now know the mesh CA exists, which is worth more than tonight's outage.",
        "Renewing by hand and adding a reminder recreates the control that just failed, which was a calendar entry belonging to a person.",
      ],
    },
    {
      id: "end-alerted-one",
      title: "This one will not surprise you again",
      grade: "good",
      body: [
        "The payment gateway is renewed, automated and alerted. That is a proper fix for the thing that broke.",
        "The API certificate expires in twelve days and nothing is watching it.",
      ],
      lesson: [
        "Fixing the instance is a complete answer to tonight and a partial answer to the class. The question worth asking after any expiry is not 'is this one fixed' but 'what else has a date on it'.",
        "The sweep takes one loop over your own hostnames.",
      ],
    },
    {
      id: "end-renewed-only",
      title: "Back up, nothing watching",
      grade: "mixed",
      body: [
        "Twenty-four minutes of failed payments, then a valid certificate for ninety days.",
        "The renewal timer is fixed, so it will probably renew on its own. If it does not, the next signal will be exactly the one you got tonight, at exactly the same hour, because certificates expire at midnight UTC.",
      ],
      lesson: [
        "The renewal worked tonight because you were awake to make it work. Nothing has changed about the detection: thirty failures produced zero alerts, and the thirty-first will too.",
        "An automated job with no failure alerting is a manual job that nobody has been assigned.",
      ],
    },
    {
      id: "end-calendar-reminder",
      title: "A reminder in August",
      grade: "mixed",
      body: [
        "A one-year commercial certificate and a calendar entry for 15 August 2027.",
        "The person who owns that calendar changes role in March. Certificate lifetimes are also on their way down: the industry is heading for 47 days by 2029, and a process built on an annual reminder does not survive that at all.",
      ],
      lesson: [
        "Manual renewal was viable when certificates lasted three years. It is already marginal at one year and it does not work at all at the lifetimes now being phased in.",
        "The only durable answer is automation plus an alert on the observed expiry date.",
      ],
    },
    {
      id: "end-verify-off",
      title: "Verification off, in production, on the payment path",
      grade: "catastrophic",
      body: [
        "Payments worked from 00:11, and the flag was still set eleven weeks later when an external assessment found it.",
        "For eleven weeks the checkout service accepted any certificate presented by anything that answered on that address. The finding is a control failure on a cardholder data path, and the remediation report has to state how long it was in place.",
      ],
      lesson: [
        "Turning off verification does not work around an expired certificate, it removes the reason certificates exist. On a payment path it is a reportable control failure, not a workaround.",
        "Temporary changes made at midnight by one person under pressure are the ones that survive longest, because nobody else knows they were made.",
      ],
    },
    {
      id: "end-maintenance-only",
      title: "Honest, and still down",
      grade: "bad",
      body: [
        "The maintenance page is the right call for a payment path that cannot complete: it stops customers retrying failed cards and stops half-written orders.",
        "It is not a fix, and the site stayed on it until 07:40 when the team's morning shift renewed the certificate, which is seven and a half hours of a Sunday.",
      ],
      lesson: [
        "Stopping the damage and fixing the fault are separate jobs, and the second one does not do itself.",
        "The renewal here was four minutes of work once the challenge path was understood. The expensive part was not attempting it.",
      ],
    },
  ],
};
