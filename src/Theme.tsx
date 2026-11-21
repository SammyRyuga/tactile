import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext({ dark: false, toggle: () => {} });

function initialTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tactile-theme", next);
    } catch {
      // The setting remains active for this page when storage is disabled.
    }
    setTheme(next);
  }
  return (
    <ThemeContext.Provider value={{ dark: theme === "dark", toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { dark, toggle } = useContext(ThemeContext);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      onClick={toggle}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={
            dark
              ? "M12 3v2m0 14v2M3 12h2m14 0h2M6 6l1.5 1.5m9 9L18 18m0-12-1.5 1.5m-9 9L6 18m10-6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
              : "M20 15.1A8.2 8.2 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z"
          }
        />
      </svg>
      {showLabel && <span>Dark mode</span>}
    </button>
  );
}
