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
    /*
      role="status" + aria-busy. This is the Suspense fallback for every lazy
      route, so it swaps in with no user action behind it. Without a live
      region a screen reader user got silence between activating a link and
      the next page mounting, with no way to tell a slow chunk from a dead one.
    */
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 text-[hsl(var(--brand-bone))]"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 16% 18%, hsl(var(--brand-cyan) / 0.14), transparent 28%), radial-gradient(circle at 82% 16%, hsl(var(--brand-signal) / 0.12), transparent 24%), radial-gradient(circle at 50% 78%, hsl(var(--brand-cyan) / 0.06), transparent 34%), linear-gradient(180deg, rgba(2, 6, 23, 0.18) 0%, rgba(2, 6, 23, 0.86) 100%)",
        }}
      />
      <div className="pointer-events-none absolute left-[10vw] top-[10vh] h-[18rem] w-[18rem] rounded-full bg-[hsl(var(--brand-cyan)/0.14)] blur-3xl animate-aurora-drift" />
      <div className="pointer-events-none absolute right-[12vw] top-[18vh] h-[22rem] w-[22rem] rounded-full bg-[hsl(var(--brand-signal)/0.12)] blur-3xl animate-panel-float" />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [mask-image:radial-gradient(circle_at_center,black_20%,transparent_82%)] animate-telemetry-drift [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.1)_1px,transparent_1px)] [background-size:72px_72px]" />
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

      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[30px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.9),hsl(var(--brand-obsidian)/0.82))] px-6 py-7 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl md:px-8 md:py-8">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-80" />
        <div className="absolute inset-y-0 right-0 w-[26%] bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.08),transparent)] blur-2xl" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 -left-1/3 w-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.12),transparent)] blur-2xl animate-loader-sweep" />
        </div>

        <div className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-signal))]">
          <span
            className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))] animate-rack-led"
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
          {[
            "Establishing route shell",
            "Preparing motion and graphics",
            "Bringing profile systems online",
          ].map((line, index) => (
            <div
              key={line}
              className="relative overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.46)] px-3 py-3"
            >
              <div
                className="absolute inset-y-0 -left-1/3 w-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--brand-cyan)/0.16),transparent)] animate-loader-sweep"
                style={{ animationDelay: `${index * 0.22}s` }}
              />
              <div className="relative flex items-center gap-3">
                <span
                  className="inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-cyan))]"
                  style={{ boxShadow: "0 0 10px hsl(var(--brand-cyan))" }}
                />
                <div className="flex-1">
                  <div className="mb-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))]">
                    {line}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--brand-carbon))]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--brand-cyan)),hsl(var(--brand-signal)),hsl(var(--brand-cyan)))] animate-loader-sheen"
                      style={{ width: `${68 + index * 12}%` }}
                    />
                  </div>
                </div>
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
