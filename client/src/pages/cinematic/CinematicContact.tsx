import { useRef, useState } from "react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import {
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
  fadeUp,
  fadeLeft,
  fadeRight,
  blurIn,
  scaleIn,
  TiltCard,
  Magnetic,
  ElasticButton,
  ScrambleText,
  DrawLine,
  FloatingParticles,
  MorphingBlob,
  OrbitingParticles,
  WordReveal,
  ClipReveal,
  AnimatedGradientText,
  PulseGlow,
  AnimatedBorder,
  HoverShine,
  motion,
  AnimatePresence,
} from "@/lib/framer-animations";

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

  // Keep existing GSAP scroll reveal for coexistence
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

  const formFields: {
    id: string;
    label: string;
    placeholder: string;
    testId: string;
    type?: string;
    multiline?: boolean;
    key: keyof FormShape;
  }[] = [
    { id: "name", label: "Handle", placeholder: "Your name", testId: "input-name", key: "name" },
    { id: "email", label: "Return address", placeholder: "your@email.com", testId: "input-email", type: "email", key: "email" },
    { id: "message", label: "Payload", placeholder: "What would you like to say?", testId: "input-message", multiline: true, key: "message" },
  ];

  return (
    <CinematicLayout>
      <div ref={rootRef} className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10">
        {/* Floating particles background (signal color) */}
        <FloatingParticles
          count={20}
          color="hsl(var(--brand-signal))"
          maxSize={4}
        />

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
          {/* MorphingBlob behind header */}
          <div className="absolute -left-32 -top-24 z-0">
            <MorphingBlob
              color="hsl(var(--brand-signal) / 0.08)"
              size={500}
              duration={10}
            />
          </div>

          <div ref={headerRef} className="relative z-10 max-w-[56ch]">
            {/* ScrambleText eyebrow */}
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              <ScrambleText
                text="· Channel · Contact"
                scrambleDuration={1.5}
              />
            </div>

            {/* WordReveal h1 */}
            <WordReveal
              text="Open a channel."
              as="h1"
              className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
              data-testid="text-contact-title"
              delay={0.2}
              staggerDelay={0.08}
            />

            <ScrollReveal variants={fadeUp} delay={0.4}>
              <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
                Pick a route. Direct email opens a mail client with the message pre-filled.
                All three handles are live and I check them regularly.
              </p>
            </ScrollReveal>
          </div>

          {/* DrawLine divider */}
          <DrawLine className="mt-10" delay={0.5} />

          {/* Channel cards with StaggerGroup + TiltCard */}
          <StaggerGroup
            className="mt-14 grid gap-4 md:grid-cols-3"
            staggerDelay={0.12}
            delayChildren={0.2}
          >
            <div ref={channelsRef} className="contents">
              <StaggerItem variants={fadeUp}>
                <TiltCard maxTilt={12} glare className="h-full">
                  <ChannelCard
                    testId="link-contact-instagram"
                    href={siteConfig.social.instagram.url}
                    external
                    kind="Instagram"
                    handle={siteConfig.social.instagram.handle}
                    caption="DMs · open"
                  />
                </TiltCard>
              </StaggerItem>
              <StaggerItem variants={fadeUp}>
                <TiltCard maxTilt={12} glare className="h-full">
                  <ChannelCard
                    testId="link-contact-github"
                    href={siteConfig.social.github.url}
                    external
                    kind="GitHub"
                    handle={siteConfig.social.github.handle}
                    caption="PRs · welcome"
                  />
                </TiltCard>
              </StaggerItem>
              <StaggerItem variants={fadeUp}>
                <TiltCard maxTilt={12} glare className="h-full">
                  <ChannelCard
                    testId="link-contact-email"
                    href={`mailto:${siteConfig.email}`}
                    kind="Email"
                    handle={siteConfig.email}
                    caption="SLA · 24h"
                  />
                </TiltCard>
              </StaggerItem>
            </div>
          </StaggerGroup>

          {/* DrawLine divider */}
          <DrawLine className="mt-14" delay={0.3} />

          {/* Form section with OrbitingParticles and AnimatedBorder */}
          <div className="relative mt-14">
            {/* OrbitingParticles around the form section */}
            <OrbitingParticles
              count={10}
              radius={280}
              color="hsl(var(--brand-signal))"
              particleSize={2}
              duration={16}
              className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
            />

            <ScrollReveal variants={blurIn} delay={0.3}>
              <AnimatedBorder className="rounded-lg">
                <div
                  ref={formRef}
                  className="overflow-hidden rounded-lg bg-[hsl(var(--brand-graphite)/.5)] backdrop-blur-sm"
                >
                  <div className="relative border-b border-[hsl(var(--brand-iron))] p-6">
                    <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
                    <div className="relative flex items-center justify-between">
                      <div>
                        <ClipReveal delay={0.1} direction="left">
                          <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                            · Form · Transmit
                          </div>
                        </ClipReveal>
                        <ScrollReveal variants={fadeLeft} delay={0.2}>
                          <h2 className="mt-2 font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-2xl">
                            Send a <AnimatedGradientText>signal</AnimatedGradientText>
                          </h2>
                        </ScrollReveal>
                      </div>
                      <ScrollReveal variants={fadeRight} delay={0.3}>
                        <div className="flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                          <motion.span
                            className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                            style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                            animate={{
                              scale: [1, 1.4, 1],
                              opacity: [1, 0.7, 1],
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          />
                          channel · live
                        </div>
                      </ScrollReveal>
                    </div>
                  </div>

                  {/* DrawLine inside form */}
                  <DrawLine delay={0.4} color="hsl(var(--brand-iron))" />

                  <div className="p-6 md:p-8">
                    <AnimatePresence mode="wait">
                      {submitted ? (
                        <motion.div
                          key="success"
                          variants={scaleIn}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          data-testid="contact-success"
                          className="flex items-start gap-4 rounded-md border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.06)] p-5"
                        >
                          <motion.span
                            className="mt-1 inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-[hsl(var(--brand-signal))]"
                            style={{ boxShadow: "0 0 10px hsl(var(--brand-signal))" }}
                            animate={{
                              scale: [1, 1.5, 1],
                              boxShadow: [
                                "0 0 10px hsl(var(--brand-signal))",
                                "0 0 25px hsl(var(--brand-signal))",
                                "0 0 10px hsl(var(--brand-signal))",
                              ],
                            }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                          />
                          <div>
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.2, duration: 0.5 }}
                              className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
                            >
                              transmission · sent
                            </motion.div>
                            <motion.p
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.4, duration: 0.5 }}
                              className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                            >
                              Your email client should have opened with the message. If it didn't,
                              reach me directly at{" "}
                              <a
                                href={`mailto:${siteConfig.email}`}
                                className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                              >
                                {siteConfig.email}
                              </a>
                              .
                            </motion.p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.form
                          key="form"
                          onSubmit={handleSubmit}
                          className="space-y-5"
                          noValidate
                          data-testid="contact-form"
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3 } }}
                        >
                          {/* Form fields with stagger fadeUp */}
                          {formFields.map((field, index) => (
                            <motion.div
                              key={field.id}
                              variants={fadeUp}
                              initial="hidden"
                              animate="visible"
                              transition={{
                                duration: 0.6,
                                delay: 0.1 * index,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                            >
                              <Field
                                id={field.id}
                                label={field.label}
                                placeholder={field.placeholder}
                                testId={field.testId}
                                type={field.type}
                                multiline={field.multiline}
                                value={formData[field.key]}
                                error={errors[field.key]}
                                onChange={(v) => {
                                  setFormData({ ...formData, [field.key]: v });
                                  if (errors[field.key]) setErrors({ ...errors, [field.key]: "" });
                                }}
                              />
                            </motion.div>
                          ))}

                          {/* DrawLine before submit */}
                          <DrawLine delay={0.4} color="hsl(var(--brand-iron) / 0.4)" />

                          <motion.div
                            className="flex items-center justify-between pt-2"
                            variants={fadeUp}
                            initial="hidden"
                            animate="visible"
                            transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                              packet · unencrypted · mailto
                            </div>

                            {/* Submit button: ElasticButton + PulseGlow */}
                            <PulseGlow className="rounded-full">
                              <ElasticButton
                                className="group inline-flex h-11 items-center gap-3 rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-obsidian))]"
                              >
                                <button
                                  type="submit"
                                  data-testid="button-send-message"
                                  className="inline-flex h-full w-full items-center gap-3"
                                >
                                  <span className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-obsidian))]" />
                                  Transmit
                                  <motion.span
                                    className="inline-block"
                                    whileHover={{ x: 4 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 15 }}
                                  >
                                    →
                                  </motion.span>
                                </button>
                              </ElasticButton>
                            </PulseGlow>
                          </motion.div>
                        </motion.form>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </AnimatedBorder>
            </ScrollReveal>
          </div>

          {/* Final DrawLine at bottom */}
          <DrawLine className="mt-14" delay={0.6} />
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
    <HoverShine>
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
          {/* Arrow with spring bounce on hover */}
          <motion.span
            className="text-[hsl(var(--brand-ash))]"
            whileHover={{
              x: 3,
              y: -3,
              color: "hsl(var(--brand-signal))",
              transition: { type: "spring", stiffness: 500, damping: 12 },
            }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            ↗
          </motion.span>
        </div>
      </a>
    </HoverShine>
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
  const [isFocused, setIsFocused] = useState(false);

  const baseClasses = `mt-2 w-full rounded-md border bg-[hsl(var(--brand-obsidian)/.55)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-signal))] transition-colors ${
    error ? "border-[hsl(var(--brand-danger))]" : "border-[hsl(var(--brand-iron))]"
  }`;

  return (
    <motion.div layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
      <motion.label
        htmlFor={id}
        className="font-mono-tight text-[10px] uppercase tracking-[0.32em]"
        animate={{
          color: isFocused
            ? "hsl(var(--brand-signal))"
            : "hsl(var(--brand-ash))",
        }}
        transition={{ duration: 0.3 }}
      >
        {label}
      </motion.label>
      <motion.div
        animate={{
          scale: isFocused ? 1.01 : 1,
          boxShadow: isFocused
            ? "0 0 16px hsl(var(--brand-signal) / 0.15)"
            : "0 0 0px transparent",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-md"
      >
        {multiline ? (
          <textarea
            id={id}
            rows={5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            data-testid={testId}
            className={baseClasses}
          />
        )}
      </motion.div>
      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="mt-2 flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-danger))]"
          >
            <motion.span
              className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-danger))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-danger))" }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
