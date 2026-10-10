import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DICT, type Lang } from "./i18n-dict";

export type { Lang };
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: TFn;
  has: (key: string) => boolean;
}

const KEY = "np_lang";
const Ctx = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const l = localStorage.getItem(KEY);
    if (l === "it" || l === "en") return l;
  } catch { /* storage unavailable */ }
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18nValue>(() => {
    const has = (k: string) => k in DICT[lang] || k in DICT.it;
    const t: TFn = (key, vars) => {
      let s = DICT[lang][key] ?? DICT.it[key] ?? key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
      return s;
    };
    return { lang, locale: lang === "it" ? "it-IT" : "en-GB", setLang, t, has };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}

/** Language preference stored in the browser, if any (server value is only a fallback). */
export function storedLang(): Lang | null {
  try {
    const l = localStorage.getItem(KEY);
    return l === "it" || l === "en" ? l : null;
  } catch { return null; }
}
