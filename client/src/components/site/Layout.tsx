import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
}

export function Layout({ children, fullWidth }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main id="main-content" className={fullWidth ? "flex-1" : "mx-auto w-full max-w-5xl flex-1 px-6 pt-4 pb-0"}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
