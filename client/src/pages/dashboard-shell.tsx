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
      {/*
        Sticky rather than fixed. Fixed meant the page had to reserve the
        header's height by hand (pt-36 lg:pt-24), and those numbers only
        matched one particular header layout: as soon as the header wrapped
        to two rows the first heading went underneath it. In flow, the
        content starts below the header whatever height it happens to be.
      */}
      <div className="sticky top-0 z-40">
        <GameHeader />
      </div>
      <main id="main-content" className="px-6 pb-10 pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
