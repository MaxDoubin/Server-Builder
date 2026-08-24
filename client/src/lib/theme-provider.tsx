import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

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

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "hyperscale-theme",
  fontScaleKey = "hyperscale-font-scale",
  highContrastKey = "hyperscale-high-contrast",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey) as Theme;
      return stored || defaultTheme;
    }
    return defaultTheme;
  });
  const [fontScale, setFontScaleState] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(fontScaleKey);
      const parsed = stored ? Number.parseFloat(stored) : NaN;
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return 1;
  });
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(highContrastKey) === "true";
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.classList.toggle("high-contrast", highContrast);
    root.style.setProperty("--font-scale", `${fontScale}`);
    localStorage.setItem(storageKey, theme);
    localStorage.setItem(fontScaleKey, `${fontScale}`);
    localStorage.setItem(highContrastKey, String(highContrast));
  }, [theme, storageKey, fontScaleKey, highContrastKey, fontScale, highContrast]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const setFontScale = (scale: number) => {
    setFontScaleState(scale);
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
