import { motionTokens } from "@/lib/motion";
import { cn } from "@/lib/utils";

type InstantShellProps = {
  className?: string;
  title?: string;
  description?: string;
};

export function InstantShell({
  className,
  title = "Hyperscale Command",
  description = "Live orchestration across power, thermals, and network topology.",
}: InstantShellProps) {
  return (
    <div className={cn("app-shell relative isolate w-full", className)}>
      <div className="app-shell__glow pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="motion-enter flex flex-col gap-3">
          <div className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-cyan-200/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
            Hyperscale
          </div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
          <p className="max-w-xl text-sm text-white/70">{description}</p>
        </header>

        <section
          className="motion-rise grid gap-4 sm:grid-cols-[1.2fr_1fr]"
          style={{ animationDelay: `${motionTokens.stagger.quick}ms` }}
        >
          <div className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-[0_0_24px_rgba(34,211,238,0.15)] motion-surface">
            <div className="mb-4 text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
              System status
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-cyan-300/80 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                  <div className="h-2.5 w-full rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-5 motion-surface">
            <div className="mb-4 text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
              Live modules
            </div>
            <div className="space-y-3">
              {["Thermal balance", "Network flow", "Power envelope"].map((label) => (
                <div key={label} className="flex items-center justify-between text-sm text-white/70">
                  <span>{label}</span>
                  <span className="text-cyan-200/80">Ready</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="app-shell__line h-px w-full opacity-60" />
        <div
          className="motion-enter grid gap-4 sm:grid-cols-3"
          style={{ animationDelay: `${motionTokens.stagger.moderate * 2}ms` }}
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-4 motion-surface">
              <div className="mb-3 h-2 w-24 rounded-full bg-white/15" />
              <div className="h-2 w-full rounded-full bg-white/10" />
              <div className="mt-2 h-2 w-5/6 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
