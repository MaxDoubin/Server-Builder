import { useState } from "react";
import { Layout } from "@/components/site/Layout";
import { siteConfig } from "@/lib/siteConfig";
import { Instagram, Github, Mail, ArrowUpRight, Send, CheckCircle, AlertCircle } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

export function Contact() {
  useSEO({
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin, cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: "https://maxdoubin.com/contact",
  });

  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
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
      `From: ${formData.name} (${formData.email})\n\n${formData.message}`
    );
    window.location.href = `mailto:${siteConfig.email}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <Layout>
      <div className="pb-16 pt-4">
        <h1
          className="text-3xl font-bold text-foreground"
          data-testid="text-contact-title"
        >
          Contact
        </h1>
        <p className="mt-2 text-muted-foreground">
          Want to get in touch? Send me a message or find me on social media.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <a
            href={siteConfig.social.instagram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card sm:gap-4 sm:p-6"
            data-testid="link-contact-instagram"
          >
            <div className="rounded-lg bg-accent p-3">
              <Instagram className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">Instagram</div>
              <div className="[overflow-wrap:anywhere] text-sm text-muted-foreground">
                {siteConfig.social.instagram.handle}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>

          <a
            href={siteConfig.social.github.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card sm:gap-4 sm:p-6"
            data-testid="link-contact-github"
          >
            <div className="rounded-lg bg-accent p-3">
              <Github className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">GitHub</div>
              <div className="[overflow-wrap:anywhere] text-sm text-muted-foreground">
                {siteConfig.social.github.handle}
              </div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>

          <a
            href={`mailto:${siteConfig.email}`}
            className="group flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card sm:gap-4 sm:p-6"
            data-testid="link-contact-email"
          >
            <div className="rounded-lg bg-accent p-3">
              <Mail className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">Email</div>
              <div className="[overflow-wrap:anywhere] text-sm text-muted-foreground">{siteConfig.email}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <div className="mt-12 rounded-xl border border-border/50 bg-card/50 p-8">
          <h2 className="text-xl font-semibold text-foreground">Send a Message</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Fill out the form below and it will open your email client with the message ready to send.
          </p>

          {submitted ? (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4" data-testid="contact-success">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <p className="text-sm text-foreground">
                Your email client should have opened with the message. If it did not, you can email me directly at{" "}
                <a href={`mailto:${siteConfig.email}`} className="text-primary hover:underline">
                  {siteConfig.email}
                </a>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate data-testid="contact-form">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: "" });
                  }}
                  className={`mt-1 w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    errors.name ? "border-red-500" : "border-border"
                  }`}
                  placeholder="Your name"
                  data-testid="input-name"
                />
                {errors.name && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-red-500" role="alert">
                    <AlertCircle className="h-3 w-3" /> {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: "" });
                  }}
                  className={`mt-1 w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    errors.email ? "border-red-500" : "border-border"
                  }`}
                  placeholder="your@email.com"
                  data-testid="input-email"
                />
                {errors.email && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-red-500" role="alert">
                    <AlertCircle className="h-3 w-3" /> {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-foreground">
                  Message
                </label>
                <textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => {
                    setFormData({ ...formData, message: e.target.value });
                    if (errors.message) setErrors({ ...errors, message: "" });
                  }}
                  rows={5}
                  className={`mt-1 w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                    errors.message ? "border-red-500" : "border-border"
                  }`}
                  placeholder="What would you like to say?"
                  data-testid="input-message"
                />
                {errors.message && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-red-500" role="alert">
                    <AlertCircle className="h-3 w-3" /> {errors.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" /> Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}
