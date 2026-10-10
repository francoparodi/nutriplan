import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { ApiError } from "../api";
import { copyText } from "../lib/clipboard";

interface ToastItem { id: number; msg: string; err: boolean }
interface ModalItem { id: number; title: string; wide: boolean; sticky: boolean; render: (close: (v?: unknown) => void) => ReactNode; resolve: (v: unknown) => void }
interface Opts { wide?: boolean; sticky?: boolean }

interface DialogApi {
  toast: (msg: string, err?: boolean) => void;
  /** Opens a modal; resolves with the value passed to close(), or undefined if dismissed. */
  open: <T = unknown>(title: string, render: (close: (v?: T) => void) => ReactNode, opts?: Opts) => Promise<T | undefined>;
  confirm: (text: string, o?: { danger?: boolean; ok?: string; title?: string }) => Promise<boolean>;
  showSecret: (title: string, intro: string, secret: string) => Promise<void>;
  /** Runs an API call; on failure shows a translated error toast and returns undefined. */
  run: <T>(fn: () => Promise<T>, okMsg?: string) => Promise<T | undefined>;
  errText: (e: unknown) => string;
}

const Ctx = createContext<DialogApi | null>(null);
let seq = 1;

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t, has } = useI18n();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modals, setModals] = useState<ModalItem[]>([]);
  const tRef = useRef(t);
  tRef.current = t;

  const toast = useCallback((msg: string, err = false) => {
    const id = seq++;
    setToasts((l) => [...l, { id, msg, err }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), err ? 6000 : 3000);
  }, []);

  const closeModal = useCallback((id: number, v?: unknown) => {
    setModals((l) => {
      const m = l.find((x) => x.id === id);
      if (m) queueMicrotask(() => m.resolve(v));
      return l.filter((x) => x.id !== id);
    });
  }, []);

  const open = useCallback(<T,>(title: string, render: (close: (v?: T) => void) => ReactNode, opts: Opts = {}) =>
    new Promise<T | undefined>((resolve) => {
      const id = seq++;
      setModals((l) => [...l, { id, title, wide: !!opts.wide, sticky: !!opts.sticky,
        render: render as ModalItem["render"], resolve: resolve as (v: unknown) => void }]);
    }), []);

  const errText = useCallback((e: unknown): string => {
    if (e instanceof ApiError) {
      const k = "err_" + e.code.split(":")[0];
      if (has(k)) return tRef.current(k);
    }
    return tRef.current("err_generic");
  }, [has]);

  const api = useMemo<DialogApi>(() => ({
    toast,
    open,
    errText,
    confirm: (text, o = {}) => open<boolean>(o.title ?? tRef.current("confirm"), (close) => (
      <>
        <p>{text}</p>
        <div className="actions">
          <button className="btn" onClick={() => close(false)}>{tRef.current("cancel")}</button>
          <button className={`btn ${o.danger ? "danger" : "primary"}`} onClick={() => close(true)}>{o.ok ?? tRef.current("confirm")}</button>
        </div>
      </>
    ), { sticky: true }).then((v) => !!v),
    showSecret: async (title, intro, secret) => {
      await open<boolean>(title, (close) => (
        <>
          <p>{intro}</p>
          <div className="secret">{secret}</div>
          <p className="small muted">{tRef.current("secret_once")}</p>
          <div className="actions">
            <button className="btn" onClick={async () => {
              if (await copyText(secret)) toast(tRef.current("copied"));
              else toast(tRef.current("copy_failed"), true);
            }}>{tRef.current("copy")}</button>
            <button className="btn primary" onClick={() => close(true)}>{tRef.current("close")}</button>
          </div>
        </>
      ), { sticky: true });
    },
    run: async <T,>(fn: () => Promise<T>, okMsg?: string) => {
      try {
        const r = await fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) toast(errText(e), true);
        return undefined;
      }
    },
  }), [toast, open, errText]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {modals.map((m) => <ModalView key={m.id} m={m} onClose={(v) => closeModal(m.id, v)} />)}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((x) => <div key={x.id} className={`toast${x.err ? " err" : ""}`}>{x.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}

function ModalView({ m, onClose }: { m: ModalItem; onClose: (v?: unknown) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(undefined); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !m.sticky) onClose(undefined); }}>
      <div className={`modal${m.wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <h2>{m.title}</h2>
        {m.render(onClose)}
      </div>
    </div>
  );
}

export function useDialogs(): DialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("DialogProvider missing");
  return v;
}
