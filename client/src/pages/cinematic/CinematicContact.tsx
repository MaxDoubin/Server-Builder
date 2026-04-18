import { useRef, useState } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

interface FormShape {
  name: string;
  email: string;
  message: string;
}

export function CinematicContact() {
  useSEO({
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin — cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: "https://maxdoubin.com/contact",
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<FormShape>({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required.";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address.";
    }
    if (!formData.message.trim()) {
      newErrors.message = "Message is required.";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters.";
    }
    return newErrors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors = validate();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const subject = encodeURIComponent(`Message from ${formData.name}`);
    const body = encodeURIComponent(
      `From: ${formData.name} (${formData.email})\n\n${formData.message}`,
    );
    window.location.href = `mailto:${siteConfig.email}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headerRef.current?.children ?? [], {
        opacity: 0,
        y: 24,
        stagger: 0.08,
        duration: 0.8,
        ease: "power3.out",
      });
      gsap.from(channelsRef.current?.children ?? [], {
        opacity: 0,
        y: 20,
        stagger: 0.08,
        duration: 0.7,
        delay: 0.2,
        ease: "power3.out",
      });
      gsap.from(formRef.current, {
        opacity: 0,
        y: 30,
        duration: 0.8,
        delay: 0.3,
        ease: "power3.out",
      });
    },
    [],
  );

  return (
    <CinematicLayout>
      <div ref={rootRef} className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10">
        {/* Background grid + signal line */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-iron) / 0.22) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.22) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            opacity: 0.5,
          }}
        />

        <div className="relative mx-auto max-w-[1100px]">
          <div ref={headerRef} className="max-w-[56ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Channel · Contact
            </div>
            <h1
              data-testid="text-contact-title"
              className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
            >
              Open a <span className="signal-text">channel.</span>
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
              Pick a route. Direct email opens a mail client with the message pre-filled.
              All three handles are live and I check them regularly.
            </p>
          </div>

          {/* Channel cards */}
          <div ref={channelsRef} className="mt-14 grid gap-4 md:grid-cols-3">
            <ChannelCard
              testId="link-contact-instagram"
              href={siteConfig.social.instagram.url}
              external
              kind="Instagram"
              handle={siteConfig.social.instagram.handle}
              caption="DMs · open"
            />
            <ChannelCard
              testId="link-contact-github"
              href={siteConfig.social.github.url}
              external
              kind="GitHub"
              handle={siteConfig.social.github.handle}
              caption="PRs · welcome"
            />
            <ChannelCard
              testId="link-contact-email"
              href={`mailto:${siteConfig.email}`}
              kind="Email"
              handle={siteConfig.email}
              caption="SLA · 24h"
            />
          </div>

          {/* Form */}
          <div
            ref={formRef}
            className="mt-14 overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.5)] backdrop-blur-sm"
          >
            <div className="relative border-b border-[hsl(var(--brand-iron))] p-6">
              <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                    · Form · Transmit
                  </div>
                  <h2 className="mt-2 font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-2xl">
                    Send a signal
                  </h2>
                </div>
                <div className="flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                  <span
                    className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                  />
                  channel · live
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
              {submitted ? (
                <div
                  data-testid="contact-success"
                  className="flex items-start gap-4 rounded-md border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.06)] p-5"
                >
                  <span
                    className="mt-1 inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 10px hsl(var(--brand-signal))" }}
                  />
                  <div>
                    <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                      transmission · sent
                    </div>
                    <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      Your email client should have opened with the message. If it didn't,
                      reach me directly at{" "}
                      <a
                        href={`mailto:${siteConfig.email}`}
                        className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                      >
                        {siteConfig.email}
                      </a>
                      .
                    </p>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-5"
                  noValidate
                  data-testid="contact-form"
                >
                  <Field
                    id="name"
                    label="Handle"
                    placeholder="Your name"
                    testId="input-name"
                    value={formData.name}
                    error={errors.name}
                    onChange={(v) => {
                      setFormData({ ...formData, name: v });
                      if (errors.name) setErrors({ ...errors, name: "" });
                    }}
                  />
                  <Field
                    id="email"
                    label="Return address"
                    placeholder="your@email.com"
                    testId="input-email"
                    type="email"
                    value={formData.email}
                    error={errors.email}
                    onChange={(v) => {
                      setFormData({ ...formData, email: v });
                      if (errors.email) setErrors({ ...errors, email: "" });
                    }}
                  />
                  <Field
                    id="message"
                    label="Payload"
                    placeholder="What would you like to say?"
                    testId="input-message"
                    multiline
                    value={formData.message}
                    error={errors.message}
                    onChange={(v) => {
                      setFormData({ ...formData, message: v });
                      if (errors.message) setErrors({ ...errors, message: "" });
                    }}
                  />

                  <div className="flex items-center justify-between pt-2">
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      packet · unencrypted · mailto
                    </div>
                    <button
                      type="submit"
                      data-testid="button-send-message"
                      className="group inline-flex h-11 items-center gap-3 rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-obsidian))] transition-transform hover:scale-[1.02]"
                      style={{ boxShadow: "0 0 24px hsl(var(--brand-signal) / 0.35)" }}
                    >
                      <span
                        className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-obsidian))]"
                      />
                      Transmit
                      <span className="translate-x-0 transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}

function ChannelCard({
  testId,
  href,
  external,
  kind,
  handle,
  caption,
}: {
  testId: string;
  href: string;
  external?: boolean;
  kind: string;
  handle: string;
  caption: string;
}) {
  const linkProps = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};
  return (
    <a
      href={href}
      data-testid={testId}
      {...linkProps}
      className="group relative block overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.5)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.4)]"
    >
      <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
            · {kind}
          </div>
          <div className="mt-3 font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
            {handle}
          </div>
          <div className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
            {caption}
          </div>
        </div>
        <span className="text-[hsl(var(--brand-ash))] transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--brand-signal))]">
          ↗
        </span>
      </div>
    </a>
  );
}

function Field({
  id,
  label,
  placeholder,
  testId,
  value,
  error,
  onChange,
  type = "text",
  multiline = false,
}: {
  id: string;
  label: string;
  placeholder: string;
  testId: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  const baseClasses = `mt-2 w-full rounded-md border bg-[hsl(var(--brand-obsidian)/.55)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-signal))] transition-colors ${
    error ? "border-[hsl(var(--brand-danger))]" : "border-[hsl(var(--brand-iron))]"
  }`;

  return (
    <div>
      <label
        htmlFor={id}
        className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className={baseClasses}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className={baseClasses}
        />
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-danger))]"
        >
          <span
            className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-danger))]"
            style={{ boxShadow: "0 0 6px hsl(var(--brand-danger))" }}
          />
          {error}
        </p>
      )}
    </div>
  );
}
