import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const KEY = "np_theme";
const SIDE = "np_side";

interface PrefsValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

const Ctx = createContext<PrefsValue | null>(null);

export function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch { return null; }
}

function initialTheme(): Theme {
  return storedTheme() ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** Browser-side preferences: theme and sidebar state are remembered in localStorage. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDE) === "1"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0e1512" : "#2f7d5b");
  }, [theme]);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  }, []);
  const setCollapsed = useCallback((c: boolean) => {
    setCollapsedState(c);
    try { localStorage.setItem(SIDE, c ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const value = useMemo(() => ({ theme, setTheme, collapsed, setCollapsed }), [theme, setTheme, collapsed, setCollapsed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("PrefsProvider missing");
  return v;
}
