import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setOnUnauthorized } from "./api";
import { storedLang, useI18n } from "./i18n";
import { storedTheme, usePrefs } from "./prefs";
import type { User } from "./types";

interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  patchUser: (p: Partial<User>) => void;
  sessionExpired: boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setExpired] = useState(false);
  const { setLang } = useI18n();
  const { setTheme } = usePrefs();

  /** Preferences stored in this browser win; the server value is only the initial one on a new browser. */
  const adopt = useCallback((u: User) => {
    if (!storedLang()) setLang(u.lang);
    if (!storedTheme()) setTheme(u.theme);
    setUser(u);
  }, [setLang, setTheme]);

  useEffect(() => {
    setOnUnauthorized(() => { setUser((cur) => { if (cur) setExpired(true); return null; }); });
    api.get<User>("/api/auth/me").then(adopt).catch(() => undefined).finally(() => setReady(true));
    return () => setOnUnauthorized(null);
  }, [adopt]);

  const value = useMemo<AuthValue>(() => ({
    user, ready, sessionExpired,
    login: async (username, password) => {
      const u = await api.post<User>("/api/auth/login", { username, password });
      setExpired(false);
      adopt(u);
      return u;
    },
    logout: async () => { await api.post("/api/auth/logout").catch(() => undefined); setUser(null); },
    patchUser: (p) => setUser((u) => (u ? { ...u, ...p } : u)),
  }), [user, ready, sessionExpired, adopt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

/** The signed-in user (only usable under the authenticated routes). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("not authenticated");
  return user;
}
