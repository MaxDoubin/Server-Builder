/**
 * Framer Motion Animation Library
 * ================================
 * Mega-comprehensive animation system with dozens of reusable components
 * and animation variants for the cinematic experience.
 */

import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useInView,
  useScroll,
  AnimatePresence,
  type Variants,
  type Transition,
  type MotionValue,
} from "framer-motion";
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────
// TRANSITION PRESETS
// ─────────────────────────────────────────────────────────

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 15,
  mass: 1,
};

export const springHeavy: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 40,
  mass: 1.5,
};

export const springElastic: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 12,
  mass: 0.4,
};

export const easeOutExpo: Transition = {
  duration: 0.8,
  ease: [0.16, 1, 0.3, 1],
};

export const easeOutQuint: Transition = {
  duration: 0.6,
  ease: [0.22, 1, 0.36, 1],
};

export const easeInOutCubic: Transition = {
  duration: 0.5,
  ease: [0.65, 0, 0.35, 1],
};

// ─────────────────────────────────────────────────────────
// VARIANT LIBRARIES
// ─────────────────────────────────────────────────────────

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -40 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 40 },
};

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

export const scaleUp: Variants = {
  hidden: { opacity: 0, scale: 0.5, y: 30 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: -10 },
};

export const rotateIn: Variants = {
  hidden: { opacity: 0, rotate: -8, scale: 0.95 },
  visible: { opacity: 1, rotate: 0, scale: 1 },
  exit: { opacity: 0, rotate: 4, scale: 0.98 },
};

export const flipX: Variants = {
  hidden: { opacity: 0, rotateX: 90 },
  visible: { opacity: 1, rotateX: 0 },
  exit: { opacity: 0, rotateX: -90 },
};

export const flipY: Variants = {
  hidden: { opacity: 0, rotateY: 90 },
  visible: { opacity: 1, rotateY: 0 },
  exit: { opacity: 0, rotateY: -90 },
};

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(8px)" },
};

export const slideInFromBottom: Variants = {
  hidden: { y: "100%" },
  visible: { y: "0%" },
  exit: { y: "-100%" },
};

export const clipReveal: Variants = {
  hidden: { clipPath: "inset(100% 0% 0% 0%)" },
  visible: { clipPath: "inset(0% 0% 0% 0%)" },
  exit: { clipPath: "inset(0% 0% 100% 0%)" },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

export const staggerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

// ─────────────────────────────────────────────────────────
// PAGE TRANSITION VARIANTS
// ─────────────────────────────────────────────────────────

export const pageSlide: Variants = {
  initial: { opacity: 0, y: 20, filter: "blur(4px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -10,
    filter: "blur(2px)",
    transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] },
  },
};

export const pageFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

// ─────────────────────────────────────────────────────────
// ANIMATED PAGE WRAPPER
// ─────────────────────────────────────────────────────────

export function AnimatedPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageSlide}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// SCROLL-TRIGGERED REVEAL
// ─────────────────────────────────────────────────────────

interface ScrollRevealProps {
  children: ReactNode;
  variants?: Variants;
  transition?: Transition;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  threshold?: number;
  once?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * `useInView`'s `amount` is a fraction OF THE OBSERVED ELEMENT, not of the
 * viewport. That makes any threshold above `viewportHeight / elementHeight`
 * physically unreachable: the observer never fires, the element keeps its
 * hidden variant, and the content is invisible forever while still taking up
 * scroll height.
 *
 * That is not hypothetical. The blog index wraps all 24 post cards in one
 * StaggerGroup. On a 390x844 phone that container is 11,940px tall, so the
 * ratio tops out at 844 / 11940 = 0.07 against a 0.15 threshold. The list
 * stayed at opacity 0 through the entire scroll. Desktop only escaped because
 * its shorter cards put the ceiling at 0.168, a hair over the threshold.
 *
 * So measure the element and clamp the threshold to half of what is actually
 * achievable. When the element is short enough for the requested threshold,
 * `Math.min` leaves it untouched and behaviour is identical to before.
 */
export function useClampedInView(
  ref: RefObject<Element>,
  threshold: number,
  once: boolean,
) {
  const [amount, setAmount] = useState(threshold);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const h = el.getBoundingClientRect().height;
      const vh = window.innerHeight;
      if (!h || !vh) return;
      const reachable = (vh / h) * 0.5;
      setAmount((prev) => {
        const next = Math.min(threshold, Math.max(0.01, reachable));
        // Hysteresis, so ResizeObserver churn cannot loop on re-render.
        return Math.abs(next - prev) < 0.005 ? prev : next;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, threshold]);

  return useInView(ref, { amount, once });
}

export function ScrollReveal({
  children,
  variants = fadeUp,
  transition = easeOutExpo,
  className,
  style,
  delay = 0,
  threshold = 0.2,
  once = true,
  as = "div",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, threshold, once);
  const Component = motion[as as "div"];

  return (
    <Component
      ref={ref}
      variants={variants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      exit="exit"
      transition={{ ...transition, delay }}
      className={className}
      style={style}
    >
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────
// STAGGER CONTAINER + ITEMS
// ─────────────────────────────────────────────────────────

interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  delayChildren?: number;
  threshold?: number;
  once?: boolean;
}

/**
 * Forwards its ref, for the same reason StaggerItem does.
 *
 * This one already needed a ref of its own to know when it enters the
 * viewport, so the forwarded one cannot simply replace it: both have to
 * land on the same node, which is what the callback below is for.
 */
export const StaggerGroup = forwardRef<HTMLDivElement, StaggerGroupProps>(function StaggerGroup(
  {
    children,
    className,
    staggerDelay = 0.08,
    delayChildren = 0.1,
    threshold = 0.15,
    once = true,
  },
  forwarded,
) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, threshold, once);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      (ref as MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) (forwarded as MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [forwarded],
  );

  return (
    <motion.div
      ref={setRef}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay, delayChildren },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

interface StaggerItemProps {
  children: ReactNode;
  variants?: Variants;
  transition?: Transition;
  className?: string;
  style?: CSSProperties;
}

/**
 * Forwards its ref, because framer-motion needs to measure it.
 *
 * An AnimatePresence in popLayout mode wraps each child in PopChild, which
 * takes the child's size before removing it so the surrounding layout does
 * not jump. It does that through a ref, and a plain function component
 * cannot be given one: React warns, the ref is silently null, and the
 * measurement it was for never happens. That is why the blog and projects
 * lists warned on every render.
 */
export const StaggerItem = forwardRef<HTMLDivElement, StaggerItemProps>(function StaggerItem(
  { children, variants = fadeUp, transition = easeOutExpo, className, style },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      variants={variants}
      transition={transition}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────
// TEXT REVEAL (Character-by-character)
// ─────────────────────────────────────────────────────────

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  staggerDelay?: number;
  once?: boolean;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
}

export function TextReveal({
  text,
  className,
  delay = 0,
  staggerDelay = 0.02,
  once = true,
  as: Tag = "div",
}: TextRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, 0.3, once);
  const MotionTag = motion[Tag];

  const words = text.split(" ");

  return (
    <MotionTag ref={ref} className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} className="inline-block">
          {word.split("").map((char, ci) => {
            const idx = words.slice(0, wi).join(" ").length + (wi > 0 ? 1 : 0) + ci;
            return (
              <motion.span
                key={`${wi}-${ci}`}
                className="inline-block"
                initial={{ opacity: 0, y: 20, rotateX: 40 }}
                animate={
                  isInView
                    ? { opacity: 1, y: 0, rotateX: 0 }
                    : { opacity: 0, y: 20, rotateX: 40 }
                }
                transition={{
                  duration: 0.4,
                  delay: delay + idx * staggerDelay,
                  ease: [0.22, 1, 0.36, 1],
                }}
                aria-hidden
              >
                {char}
              </motion.span>
            );
          })}
          {wi < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </MotionTag>
  );
}

// ─────────────────────────────────────────────────────────
// WORD REVEAL (Word-by-word)
// ─────────────────────────────────────────────────────────

interface WordRevealProps {
  text: string;
  className?: string;
  delay?: number;
  staggerDelay?: number;
  once?: boolean;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
}

export function WordReveal({
  text,
  className,
  delay = 0,
  staggerDelay = 0.06,
  once = true,
  as: Tag = "div",
}: WordRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, 0.3, once);
  const MotionTag = motion[Tag];

  return (
    <MotionTag ref={ref} className={className}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="inline-block overflow-hidden">
          <motion.span
            className="inline-block"
            initial={{ y: "100%", opacity: 0 }}
            animate={isInView ? { y: "0%", opacity: 1 } : { y: "100%", opacity: 0 }}
            transition={{
              duration: 0.6,
              delay: delay + i * staggerDelay,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
          {i < text.split(" ").length - 1 && <span>&nbsp;</span>}
        </span>
      ))}
    </MotionTag>
  );
}

// ─────────────────────────────────────────────────────────
// LINE REVEAL (Clip-mask line reveal)
// ─────────────────────────────────────────────────────────

interface LineRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  once?: boolean;
}

export function LineReveal({ children, className, delay = 0, once = true }: LineRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, 0.4, once);

  return (
    <div ref={ref} className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        initial={{ y: "110%", opacity: 0, skewY: 3 }}
        animate={isInView ? { y: "0%", opacity: 1, skewY: 0 } : { y: "110%", opacity: 0, skewY: 3 }}
        transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAGNETIC ELEMENT (Follows cursor magnetically)
// ─────────────────────────────────────────────────────────

interface MagneticProps {
  children: ReactNode;
  className?: string;
  strength?: number;
  radius?: number;
}

export function Magnetic({
  children,
  className,
  strength = 0.3,
  radius = 200,
}: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouse = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * strength;
        x.set(dx * power);
        y.set(dy * power);
      } else {
        x.set(0);
        y.set(0);
      }
    },
    [radius, strength, x, y],
  );

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// TILT CARD (3D perspective tilt on hover)
// ─────────────────────────────────────────────────────────

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  scale?: number;
  perspective?: number;
  glare?: boolean;
}

export function TiltCard({
  children,
  className,
  maxTilt = 12,
  scale = 1.02,
  perspective = 800,
  glare = true,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const scaleVal = useMotionValue(1);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useMotionValue(0);

  const springRotateX = useSpring(rotateX, { stiffness: 250, damping: 25 });
  const springRotateY = useSpring(rotateY, { stiffness: 250, damping: 25 });
  const springScale = useSpring(scaleVal, { stiffness: 350, damping: 30 });

  const handleMouse = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      rotateX.set((py - 0.5) * -maxTilt * 2);
      rotateY.set((px - 0.5) * maxTilt * 2);
      scaleVal.set(scale);
      glareX.set(px * 100);
      glareY.set(py * 100);
      glareOpacity.set(0.15);
    },
    [maxTilt, scale, rotateX, rotateY, scaleVal, glareX, glareY, glareOpacity],
  );

  const handleLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    scaleVal.set(1);
    glareOpacity.set(0);
  }, [rotateX, rotateY, scaleVal, glareOpacity]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{
        perspective,
        rotateX: springRotateX,
        rotateY: springRotateY,
        scale: springScale,
        transformStyle: "preserve-3d",
      }}
      className={className}
    >
      {children}
      {glare && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            opacity: glareOpacity,
            background: useTransform(
              [glareX, glareY],
              ([gx, gy]) =>
                `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.25), transparent 60%)`,
            ),
          }}
        />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// GLITCH TEXT
// ─────────────────────────────────────────────────────────

interface GlitchTextProps {
  text: string;
  className?: string;
  intensity?: number;
}

export function GlitchText({ text, className, intensity = 1 }: GlitchTextProps) {
  const [glitching, setGlitching] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 150 * intensity);
    }, 3000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [intensity]);

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <span className="relative z-10">{text}</span>
      <AnimatePresence>
        {glitching && (
          <>
            <motion.span
              className="absolute inset-0 text-[hsl(var(--brand-signal))]"
              initial={{ x: 0, opacity: 0 }}
              animate={{
                x: [-2, 3, -1, 2, 0],
                opacity: [0, 0.8, 0.4, 0.7, 0],
                clipPath: [
                  "inset(0 0 80% 0)",
                  "inset(20% 0 40% 0)",
                  "inset(60% 0 10% 0)",
                  "inset(10% 0 70% 0)",
                  "inset(0 0 100% 0)",
                ],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 * intensity }}
              aria-hidden
            >
              {text}
            </motion.span>
            <motion.span
              className="absolute inset-0 text-[hsl(var(--brand-cyan))]"
              initial={{ x: 0, opacity: 0 }}
              animate={{
                x: [2, -3, 1, -2, 0],
                opacity: [0, 0.6, 0.3, 0.5, 0],
                clipPath: [
                  "inset(80% 0 0 0)",
                  "inset(40% 0 20% 0)",
                  "inset(10% 0 60% 0)",
                  "inset(70% 0 10% 0)",
                  "inset(100% 0 0 0)",
                ],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 * intensity }}
              aria-hidden
            >
              {text}
            </motion.span>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// WAVE TEXT (Characters animate in a wave pattern)
// ─────────────────────────────────────────────────────────

interface WaveTextProps {
  text: string;
  className?: string;
  amplitude?: number;
  frequency?: number;
}

export function WaveText({ text, className, amplitude = 8, frequency = 0.15 }: WaveTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useClampedInView(ref, 0.5, true);

  return (
    <span ref={ref} className={className}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ y: 0 }}
          animate={
            isInView
              ? {
                  y: [0, -amplitude, 0, amplitude * 0.5, 0],
                }
              : {}
          }
          transition={{
            duration: 0.6,
            delay: i * frequency * 0.3,
            ease: "easeInOut",
            repeat: 0,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// PARALLAX FLOAT (Scroll-driven parallax)
// ─────────────────────────────────────────────────────────

interface ParallaxFloatProps {
  children: ReactNode;
  className?: string;
  speed?: number;
  direction?: "up" | "down" | "left" | "right";
}

export function ParallaxFloat({
  children,
  className,
  speed = 0.3,
  direction = "up",
}: ParallaxFloatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const range = 100 * speed;
  const axis = direction === "up" || direction === "down" ? "y" : "x";
  const sign = direction === "up" || direction === "left" ? 1 : -1;

  const val = useTransform(scrollYProgress, [0, 1], [range * sign, -range * sign]);
  const springVal = useSpring(val, { stiffness: 100, damping: 30 });

  /**
   * `useScroll` with a `target` measures against the offset parent, and
   * warns (and mismeasures) when the element is statically positioned.
   * Callers that already position this wrapper keep their own value, and
   * an inline `position` would beat their Tailwind class and move them.
   */
  const isPositioned = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/.test(
    className ?? "",
  );

  const styleObj = {
    ...(axis === "y" ? { y: springVal } : { x: springVal }),
    ...(isPositioned ? null : { position: "relative" as const }),
  };

  return (
    <motion.div ref={ref} style={styleObj} className={className}>
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// MORPHING BLOB (Animated background blob)
// ─────────────────────────────────────────────────────────

interface MorphingBlobProps {
  className?: string;
  color?: string;
  size?: number;
  duration?: number;
}

export function MorphingBlob({
  className,
  color = "hsl(var(--brand-signal) / 0.1)",
  size = 400,
  duration = 8,
}: MorphingBlobProps) {
  return (
    <motion.div
      className={`pointer-events-none absolute rounded-full blur-3xl ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: color,
      }}
      animate={{
        borderRadius: [
          "30% 70% 70% 30% / 30% 30% 70% 70%",
          "50% 50% 30% 70% / 60% 40% 60% 40%",
          "70% 30% 50% 50% / 40% 60% 40% 60%",
          "40% 60% 60% 40% / 70% 30% 70% 30%",
          "30% 70% 70% 30% / 30% 30% 70% 70%",
        ],
        scale: [1, 1.1, 0.95, 1.05, 1],
        rotate: [0, 90, 180, 270, 360],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// ORBITING PARTICLES
// ─────────────────────────────────────────────────────────

interface OrbitingParticlesProps {
  count?: number;
  radius?: number;
  className?: string;
  color?: string;
  particleSize?: number;
  duration?: number;
}

export function OrbitingParticles({
  count = 8,
  radius = 120,
  className,
  color = "hsl(var(--brand-signal))",
  particleSize = 3,
  duration = 12,
}: OrbitingParticlesProps) {
  return (
    <div className={`pointer-events-none absolute ${className ?? ""}`}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360;
        const delay = (i / count) * duration;
        const orbitRadius = radius + Math.sin(i * 1.7) * 20;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: particleSize,
              height: particleSize,
              background: color,
              boxShadow: `0 0 ${particleSize * 2}px ${color}`,
              left: "50%",
              top: "50%",
            }}
            animate={{
              rotate: [angle, angle + 360],
              x: [
                Math.cos((angle * Math.PI) / 180) * orbitRadius,
                Math.cos(((angle + 360) * Math.PI) / 180) * orbitRadius,
              ],
              y: [
                Math.sin((angle * Math.PI) / 180) * orbitRadius,
                Math.sin(((angle + 360) * Math.PI) / 180) * orbitRadius,
              ],
              opacity: [0.3, 1, 0.5, 0.8, 0.3],
              scale: [0.8, 1.2, 0.9, 1.1, 0.8],
            }}
            transition={{
              duration,
              delay: -delay,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// FLOATING PARTICLES (Random floating particles)
// ─────────────────────────────────────────────────────────

interface FloatingParticlesProps {
  count?: number;
  className?: string;
  color?: string;
  maxSize?: number;
}

export function FloatingParticles({
  count = 20,
  className,
  color = "hsl(var(--brand-signal))",
  maxSize = 4,
}: FloatingParticlesProps) {
  const particles = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * (maxSize - 1),
      duration: 6 + Math.random() * 10,
      delay: Math.random() * -10,
    })),
  ).current;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: color,
            boxShadow: `0 0 ${p.size * 3}px ${color}`,
          }}
          animate={{
            y: [-20, -60, -20],
            x: [-10, 15, -10],
            opacity: [0, 0.7, 0.3, 0.8, 0],
            scale: [0.5, 1, 0.7, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SCROLL PROGRESS INDICATOR
// ─────────────────────────────────────────────────────────

export function ScrollProgressBar({
  className,
  color = "hsl(var(--brand-signal))",
}: {
  className?: string;
  color?: string;
}) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <motion.div
      data-print-hide
      className={`fixed left-0 right-0 top-0 z-[100] h-[2px] origin-left ${className ?? ""}`}
      style={{
        scaleX,
        background: color,
        boxShadow: `0 0 10px ${color}, 0 0 20px ${color}`,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// CURSOR GLOW (Custom cursor glow effect)
// ─────────────────────────────────────────────────────────

export function CursorGlow({
  color = "hsl(var(--brand-signal) / 0.15)",
  size = 300,
}: {
  color?: string;
  size?: number;
}) {
  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);
  const springX = useSpring(mouseX, { stiffness: 200, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 200, damping: 30 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      mouseX.set(e.clientX - size / 2);
      mouseY.set(e.clientY - size / 2);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [mouseX, mouseY, size]);

  return (
    <motion.div
      data-print-hide
      className="pointer-events-none fixed z-[90] rounded-full blur-3xl"
      style={{
        left: springX,
        top: springY,
        width: size,
        height: size,
        background: color,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// ELASTIC BUTTON
// ─────────────────────────────────────────────────────────

interface ElasticButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  as?: "button" | "a";
  /**
   * Button behaviour, when this is a button.
   *
   * Worth having rather than nesting a real button inside this one, which
   * is what the contact form did: a button inside a button is invalid HTML,
   * and browsers recover from it differently. Keyboard users get one focus
   * stop where there appear to be two controls, and a screen reader reads
   * the pair as a single confused element.
   */
  type?: "button" | "submit" | "reset";
  /** Passed through so a test can find the control that actually submits. */
  "data-testid"?: string;
}

export function ElasticButton({
  children,
  className,
  onClick,
  href,
  as: Tag = "button",
  type,
  "data-testid": testId,
}: ElasticButtonProps) {
  const MotionTag = Tag === "a" ? motion.a : motion.button;

  return (
    <Magnetic strength={0.15} radius={150}>
      <MotionTag
        href={href}
        onClick={onClick}
        type={Tag === "button" ? type : undefined}
        data-testid={testId}
        className={className}
        whileHover={{
          scale: 1.05,
          transition: springElastic,
        }}
        whileTap={{
          scale: 0.95,
          transition: { type: "spring", stiffness: 400, damping: 15 },
        }}
      >
        {children}
      </MotionTag>
    </Magnetic>
  );
}

// ─────────────────────────────────────────────────────────
// ANIMATED COUNTER
// ─────────────────────────────────────────────────────────

interface AnimatedCounterProps {
  value: number;
  className?: string;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export function AnimatedCounter({
  value,
  className,
  duration = 2,
  decimals = 0,
  prefix = "",
  suffix = "",
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useClampedInView(ref, 0.5, true);
  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { duration: duration * 1000 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isInView) {
      motionVal.set(value);
    }
  }, [isInView, motionVal, value]);

  useEffect(() => {
    const unsubscribe = springVal.on("change", (latest) => {
      setDisplay(latest.toFixed(decimals));
    });
    return unsubscribe;
  }, [springVal, decimals]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// HOVER CARD SHINE
// ─────────────────────────────────────────────────────────

interface HoverShineProps {
  children: ReactNode;
  className?: string;
}

export function HoverShine({ children, className }: HoverShineProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouse = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      className={`relative overflow-hidden ${className ?? ""}`}
    >
      {children}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) =>
              `radial-gradient(250px circle at ${x}px ${y}px, rgba(255,255,255,0.06), transparent 80%)`,
          ),
        }}
      />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// ANIMATED BORDER GRADIENT
// ─────────────────────────────────────────────────────────

export function AnimatedBorder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <motion.div
        className="absolute -inset-[1px] rounded-[inherit] opacity-60"
        style={{
          background:
            "conic-gradient(from var(--angle, 0deg), hsl(var(--brand-signal)), hsl(var(--brand-cyan)), hsl(var(--brand-signal)))",
        }}
        animate={{ "--angle": ["0deg", "360deg"] } as any}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative rounded-[inherit] bg-[hsl(var(--brand-obsidian))]">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// REVEAL ON SCROLL WITH CLIP PATH
// ─────────────────────────────────────────────────────────

export function ClipReveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, 0.3, true);

  const clipPaths = {
    up: { hidden: "inset(100% 0% 0% 0%)", visible: "inset(0% 0% 0% 0%)" },
    down: { hidden: "inset(0% 0% 100% 0%)", visible: "inset(0% 0% 0% 0%)" },
    left: { hidden: "inset(0% 100% 0% 0%)", visible: "inset(0% 0% 0% 0%)" },
    right: { hidden: "inset(0% 0% 0% 100%)", visible: "inset(0% 0% 0% 0%)" },
  };

  return (
    <div ref={ref} className={className}>
      <motion.div
        initial={{ clipPath: clipPaths[direction].hidden }}
        animate={
          isInView
            ? { clipPath: clipPaths[direction].visible }
            : { clipPath: clipPaths[direction].hidden }
        }
        transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SCRAMBLE TEXT (Matrix-style text scramble)
// ─────────────────────────────────────────────────────────

interface ScrambleTextProps {
  text: string;
  className?: string;
  scrambleDuration?: number;
  characters?: string;
}

export function ScrambleText({
  text,
  className,
  scrambleDuration = 1.5,
  characters = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`01",
}: ScrambleTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useClampedInView(ref, 0.5, true);
  const [display, setDisplay] = useState(text.replace(/./g, " "));

  useEffect(() => {
    if (!isInView) return;
    const chars = characters;
    let frame = 0;
    const totalFrames = Math.ceil(scrambleDuration * 60);
    const interval = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const revealed = Math.floor(progress * text.length);
      let result = "";
      for (let i = 0; i < text.length; i++) {
        if (i < revealed) {
          result += text[i];
        } else if (text[i] === " ") {
          result += " ";
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      setDisplay(result);
      if (frame >= totalFrames) {
        clearInterval(interval);
        setDisplay(text);
      }
    }, 1000 / 60);
    return () => clearInterval(interval);
  }, [isInView, text, scrambleDuration, characters]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// PULSE GLOW (Pulsing glow effect around element)
// ─────────────────────────────────────────────────────────

export function PulseGlow({
  children,
  className,
  color = "hsl(var(--brand-signal))",
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      animate={{
        boxShadow: [
          `0 0 0px ${color}00`,
          `0 0 20px ${color}66`,
          `0 0 40px ${color}33`,
          `0 0 20px ${color}66`,
          `0 0 0px ${color}00`,
        ],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// TYPEWRITER (Framer Motion typewriter)
// ─────────────────────────────────────────────────────────

interface TypewriterProps {
  words: string[];
  className?: string;
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

export function Typewriter({
  words,
  className,
  typingSpeed = 50,
  deletingSpeed = 30,
  pauseDuration = 1500,
}: TypewriterProps) {
  const [currentWord, setCurrentWord] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const word = words[currentWord];
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          setCurrentText(word.slice(0, currentText.length + 1));
          if (currentText.length + 1 === word.length) {
            setTimeout(() => setIsDeleting(true), pauseDuration);
          }
        } else {
          setCurrentText(word.slice(0, currentText.length - 1));
          if (currentText.length === 0) {
            setIsDeleting(false);
            setCurrentWord((prev) => (prev + 1) % words.length);
          }
        }
      },
      isDeleting ? deletingSpeed : typingSpeed,
    );
    return () => clearTimeout(timeout);
  }, [currentText, isDeleting, currentWord, words, typingSpeed, deletingSpeed, pauseDuration]);

  return (
    <span className={className}>
      {currentText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
        className="inline-block w-[2px] h-[1em] bg-current align-middle ml-[2px]"
      />
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// DRAW SVG LINE
// ─────────────────────────────────────────────────────────

export function DrawLine({
  className,
  color = "hsl(var(--brand-signal))",
  width = "100%",
  delay = 0,
}: {
  className?: string;
  color?: string;
  width?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useClampedInView(ref, 0.5, true);

  return (
    <div ref={ref} className={className} style={{ width }}>
      <motion.div
        className="h-px origin-left"
        style={{
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
        initial={{ scaleX: 0 }}
        animate={isInView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MARQUEE (Infinite horizontal scroll)
// ─────────────────────────────────────────────────────────

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  speed?: number;
  direction?: "left" | "right";
}

export function Marquee({
  children,
  className,
  speed = 30,
  direction = "left",
}: MarqueeProps) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        className="flex w-max gap-8"
        animate={{ x: direction === "left" ? [0, "-50%"] : ["-50%", 0] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// HOVER SCALE (Simple hover scale wrapper)
// ─────────────────────────────────────────────────────────

export function HoverScale({
  children,
  className,
  scale = 1.05,
}: {
  children: ReactNode;
  className?: string;
  scale?: number;
}) {
  return (
    <motion.div
      whileHover={{ scale }}
      whileTap={{ scale: scale * 0.97 }}
      transition={springSnappy}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────
// ANIMATED GRADIENT TEXT
// ─────────────────────────────────────────────────────────

/**
 * Sweeping gradient fill for a short run of text.
 *
 * Children must be PLAIN TEXT. This paints a gradient on its own background
 * box and clips it to glyphs with `background-clip: text`, so any child that
 * establishes its own box (an inline-block, anything from WordReveal) draws
 * its glyphs outside that box, inherits `color: transparent`, and renders as
 * a washed-out ghost. Wrap the gradient in the reveal if you need both, never
 * the reveal in the gradient.
 */
export function AnimatedGradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      className={`bg-clip-text text-transparent bg-[length:200%_auto] ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg, hsl(var(--brand-signal)), hsl(var(--brand-cyan)), hsl(var(--brand-signal)))",
      }}
      animate={{ backgroundPosition: ["0% center", "200% center"] }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

// ─────────────────────────────────────────────────────────
// BREATHING ELEMENT
// ─────────────────────────────────────────────────────────

export function Breathing({
  children,
  className,
  intensity = 1,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  return (
    <motion.div
      className={className}
      animate={{
        scale: [1, 1 + 0.02 * intensity, 1],
        opacity: [1, 0.85, 1],
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

// Re-export motion and AnimatePresence for convenience
export { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useInView, useScroll };
