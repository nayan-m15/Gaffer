import { useCallback, useEffect, useState } from "react";

/**
 * Supported theme identifiers.
 *
 * - `"light"` — warm off-white background, dark text.
 * - `"dark"`  — near-black background, light text.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "sport-coaching-theme";
const THEME_CHANGE_EVENT = "gaffer-theme-change";

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
  const [theme, setActiveTheme] = useState<Theme>(getInitialTheme);

  /** Apply the `.dark` class to `<html>` whenever the theme changes. */
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    window.localStorage.setItem(STORAGE_KEY, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#090A0B" : "#F5F3F0");
  }, [theme]);

  // Keep every mounted theme control in sync, including controls rendered in
  // separate layouts or tabs. System preference changes remain live until the
  // visitor makes an explicit choice.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setActiveTheme(getInitialTheme());
    };
    const syncFromApp = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setActiveTheme(next);
    };
    const syncFromSystem = () => {
      if (!window.localStorage.getItem(STORAGE_KEY)) setActiveTheme(getInitialTheme());
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(THEME_CHANGE_EVENT, syncFromApp);
    media.addEventListener("change", syncFromSystem);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromApp);
      media.removeEventListener("change", syncFromSystem);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setActiveTheme(next);
    window.dispatchEvent(
      new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: next }),
    );
  }, []);

  /** Flip between light and dark. */
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme } as const;
}
