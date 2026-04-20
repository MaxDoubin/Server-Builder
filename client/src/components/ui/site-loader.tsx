type SiteLoaderProps = {
  eyebrow?: string;
  title?: string;
  detail?: string;
  status?: string;
};

export function SiteLoader({
  eyebrow = "Max Doubin Profile",
  title = "Loading section",
  detail = "Preparing the next section of the site.",
  status = "Initializing",
}: SiteLoaderProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 text-[hsl(var(--brand-bone))]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 16% 18%, hsl(var(--brand-cyan) / 0.14), transparent 28%), radial-gradient(circle at 82% 16%, hsl(var(--brand-signal) / 0.12), transparent 24%), radial-gradient(circle at 50% 78%, hsl(var(--brand-cyan) / 0.06), transparent 34%), linear-gradient(180deg, rgba(2, 6, 23, 0.18) 0%, rgba(2, 6, 23, 0.86) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute inset-0 scanline opacity-15" />
      <div
        aria-hidden
        className="absolute left-[12vw] top-[16vh] h-[44vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.5) 28%, transparent 100%)",
          boxShadow: "0 0 28px hsl(var(--brand-cyan) / 0.3)",
        }}
      />
      <div
        aria-hidden
        className="absolute right-[12vw] top-[20vh] h-[40vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-signal) / 0.42) 32%, transparent 100%)",
          boxShadow: "0 0 28px hsl(var(--brand-signal) / 0.28)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-[18vw] top-[34vh] h-[18vh] bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.08),hsl(var(--brand-signal)/0.08),transparent)] blur-3xl" />

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.9),hsl(var(--brand-obsidian)/0.82))] px-6 py-7 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl md:px-8 md:py-8">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-80" />
        <div className="absolute inset-y-0 right-0 w-[26%] bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.08),transparent)] blur-2xl" />

        <div className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-signal))]">
          <span
            className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]"
            style={{ boxShadow: "0 0 12px hsl(var(--brand-signal))" }}
          />
          {eyebrow}
        </div>

        <h1 className="mt-5 font-display text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
          {title}
        </h1>
        <p className="mt-4 max-w-[42ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {detail}
        </p>

        <div className="mt-7 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.46)] px-3 py-3"
            >
              <span
                className="inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-cyan))]"
                style={{ boxShadow: "0 0 10px hsl(var(--brand-cyan))" }}
              />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--brand-carbon))]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--brand-cyan)),hsl(var(--brand-signal)))] animate-pulse"
                  style={{ width: `${70 + index * 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
          <span>{status}</span>
          <span className="signal-text">Live</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-techno text-[9px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]">
          <span>Cybersecurity</span>
          <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
          <span>Networking</span>
          <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
          <span>Systems</span>
        </div>
      </div>
    </div>
  );
}
