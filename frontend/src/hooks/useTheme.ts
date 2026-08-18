import { useCallback, useEffect, useState } from "react";

/**
 * Supported theme identifiers.
 *
 * - `"light"` — warm off-white background, dark text.
 * - `"dark"`  — near-black background, light text.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "sport-coaching-theme";

/**
 * Reads the visitor's previously chosen theme from `localStorage`, falling back
 * to the operating-system preference via `prefers-color-scheme`.
 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * React hook that manages the active light / dark theme.
 *
 * Adds or removes the `.dark` class on `<html>` so that every Tailwind
 * `dark:` variant responds automatically.  The chosen theme is persisted in
 * `localStorage` so it survives page reloads.
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme } = useTheme();
 *
 * return (
 *   <button onClick={toggleTheme}>
 *     Currently {theme}
 *   </button>
 * );
 * ```
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  /** Apply the `.dark` class to `<html>` whenever the theme changes. */
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  /** Flip between light and dark. */
  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme } as const;
}
