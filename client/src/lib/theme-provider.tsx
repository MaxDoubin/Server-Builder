import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The text sizes the display menu offers.
 *
 * Here rather than in the menu so the two cannot drift, and so a stored
 * scale can be snapped to one of them.
 */
export const FONT_SCALES = [1, 1.15, 1.3] as const;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  fontScaleKey?: string;
  highContrastKey?: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/*
  Storage is reached through these two rather than directly.

  A browser set to block site data does not hand back null, it throws
  SecurityError on the property access itself. This provider wraps the whole
  app and reads three keys during its first render, so one unguarded throw
  took the entire site to a blank page: React had already replaced the
  prerendered HTML by the time the error reached the root, and there is no
  boundary above this to catch it. The content was legible until the moment
  the app booted, and then it was gone.

  Every other store here already wraps its access, five of them with a
  comment saying why. This one did not.
*/
function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* The preference holds for this page view and is not remembered. */
  }
}

/*
  What comes out of storage is validated, not just parsed.

  Each preference is read into the DOM and then written straight back, so a
  value that should not be there survives every reload. `as Theme` put
  whatever string it found onto <html>: "banana" is neither .dark nor
  .light, so the tokens fell through to :root and the site rendered light
  while claiming to default to dark, and kept doing it.

  A scale is worse, because a number is valid CSS whatever it says.
  --font-scale moves the rem basis, so a stored 0 or -3 computes to
  font-size: 0 and the whole page renders at no size at all, with no way
  back through the UI, because the menu that would fix it has no height
  either. Measured: 0 and -3 both gave a 0px root and a 0px tall h1, 50 gave
  an 800px root. Only a non-numeric value was handled, because parseFloat
  returns NaN for it and NaN was the one case checked.

  Snapped to an offered size rather than clamped to a range, because the menu
  marks its active row by exact match and a value between two steps would
  leave nothing selected.

  Nothing writes a bad value today: the display menu is the only writer and
  it offers three. This is here so that reading does not depend on that
  staying true.
*/
function nearestScale(n: number): number {
  if (!Number.isFinite(n)) return FONT_SCALES[0];
  return FONT_SCALES.reduce((best, s) =>
    Math.abs(s - n) < Math.abs(best - n) ? s : best,
  );
}

function readTheme(key: string, fallback: Theme): Theme {
  const stored = readStored(key);
  return (THEMES as readonly string[]).includes(stored ?? "")
    ? (stored as Theme)
    : fallback;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "hyperscale-theme",
  fontScaleKey = "hyperscale-font-scale",
  highContrastKey = "hyperscale-high-contrast",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => readTheme(storageKey, defaultTheme));
  const [fontScale, setFontScaleState] = useState<number>(() =>
    nearestScale(Number.parseFloat(readStored(fontScaleKey) ?? "")),
  );
  const [highContrast, setHighContrast] = useState<boolean>(
    () => readStored(highContrastKey) === "true",
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.classList.toggle("high-contrast", highContrast);
    root.style.setProperty("--font-scale", `${fontScale}`);
    writeStored(storageKey, theme);
    writeStored(fontScaleKey, `${fontScale}`);
    writeStored(highContrastKey, String(highContrast));
  }, [theme, storageKey, fontScaleKey, highContrastKey, fontScale, highContrast]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  /* Snapped here too, so the invariant does not rest on every caller. */
  const setFontScale = (scale: number) => {
    setFontScaleState(nearestScale(scale));
  };

  const contextValue = useMemo(
    () => ({
      theme,
      toggleTheme,
      // The legacy navbar picks a theme directly rather than toggling. It
      // was destructuring setTheme from here, which was undefined, so every
      // click threw and the theme never changed.
      setTheme,
      fontScale,
      setFontScale,
      highContrast,
      toggleHighContrast: () => setHighContrast((prev) => !prev),
    }),
    [theme, fontScale, highContrast]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
