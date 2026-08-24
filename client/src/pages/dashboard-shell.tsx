import { ReactNode } from "react";
import { GameHeader } from "@/components/layout/game-header";

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed top-0 left-0 right-0 z-40">
        <GameHeader />
      </div>
      <div className="px-6 pb-10 pt-36 lg:pt-24">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
