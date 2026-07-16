import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {
    // Default no-op, will be replaced by provider
  },
});

const applyTheme = (theme: Theme): void => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("kumidocs:theme", theme);
};

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem("kumidocs:theme");
  let theme: Theme = "light";
  if (stored === "light" || stored === "dark") {
    theme = stored;
  } else if (globalThis.matchMedia("(prefers-color-scheme: dark)").matches) {
    theme = "dark";
  }
  applyTheme(theme);
  return theme;
};

const ThemeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggle = (): void => {
    setTheme((prev) => {
      let next: Theme = "light";
      if (prev === "light") {
        next = "dark";
      }
      applyTheme(next);
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
};

const useTheme = (): ThemeContextValue => useContext(ThemeContext);

export { ThemeProvider, useTheme };
