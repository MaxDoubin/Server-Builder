import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/routes";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
};

export function AppShell({ children, fullBleed = false }: AppShellProps) {
  const [location] = useLocation();

  return (
    <div className={cn("app-shell", fullBleed && "app-shell--full")}>
      <header className="app-shell__header">
        <div className="app-shell__brand" aria-label="Hyperscale">
          <span className="app-shell__logo" aria-hidden="true" />
          <span className="app-shell__title">Hyperscale</span>
        </div>
        <nav className="app-shell__nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn("app-shell__link", isActive && "app-shell__link--active")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className={cn(fullBleed ? "app-shell__main--full" : "app-shell__main")}>{children}</main>
    </div>
  );
}
