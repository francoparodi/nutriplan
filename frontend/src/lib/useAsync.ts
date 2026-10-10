import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api";

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | Error | undefined;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (d: T) => void;
}

/** Runs `fn` on mount and whenever `deps` change; keeps the previous data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError | Error>();
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await fnRef.current();
      if (id === seq.current) { setData(r); setError(undefined); }
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: load, setData };
}
