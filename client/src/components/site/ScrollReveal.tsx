import { useInView } from "@/lib/useInView";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  direction?: "up" | "left";
}

export function ScrollReveal({
  children,
  className = "",
  stagger,
  direction = "up",
}: ScrollRevealProps) {
  const { ref, isVisible } = useInView(0.1);
  const baseClass = direction === "left" ? "scroll-reveal-left" : "scroll-reveal";
  const staggerClass = stagger ? `stagger-${stagger}` : "";

  return (
    <div
      ref={ref}
      className={`${baseClass} ${isVisible ? "visible" : ""} ${staggerClass} ${className}`}
    >
      {children}
    </div>
  );
}
