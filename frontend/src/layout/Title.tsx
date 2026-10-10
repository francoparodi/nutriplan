import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const Ctx = createContext<{ title: string; setTitle: (t: string) => void }>({ title: "", setTitle: () => undefined });

export function TitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState("");
  return <Ctx.Provider value={{ title, setTitle }}>{children}</Ctx.Provider>;
}

export const useTitleValue = () => useContext(Ctx).title;

/** Sets the page title (topbar + document title) for the lifetime of the calling page. */
export function usePageTitle(title: string) {
  const { setTitle } = useContext(Ctx);
  useEffect(() => {
    setTitle(title);
    document.title = title ? `${title} – Nutriplan` : "Nutriplan";
  }, [title, setTitle]);
}
