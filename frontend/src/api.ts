/** Thin fetch wrapper: same-origin cookie auth + anti-CSRF header, typed errors. */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: (() => void) | null) { onUnauthorized = fn; }

async function raw(method: string, url: string, body?: unknown, isForm = false): Promise<Response> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { "X-Requested-With": "nutriplan" } };
  if (body !== undefined && body !== null) {
    if (isForm) init.body = body as FormData;
    else {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }
  let res: Response;
  try { res = await fetch(url, init); } catch { throw new ApiError(0, "network_error"); }
  if (res.ok) return res;
  let code = "error";
  try { const j = await res.json(); if (typeof j.detail === "string") code = j.detail; } catch { /* not JSON */ }
  if (res.status === 401 && !url.startsWith("/api/auth/login") && onUnauthorized) onUnauthorized();
  throw new ApiError(res.status, code);
}

async function json<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await raw(method, url, body);
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? await res.json() : (await res.text())) as T;
}

export const api = {
  get: <T,>(url: string) => json<T>("GET", url),
  post: <T,>(url: string, body: unknown = {}) => json<T>("POST", url, body),
  put: <T,>(url: string, body: unknown) => json<T>("PUT", url, body),
  patch: <T,>(url: string, body: unknown) => json<T>("PATCH", url, body),
  del: <T = { ok: boolean },>(url: string) => json<T>("DELETE", url),
  upload: async <T,>(url: string, form: FormData, method: "POST" | "PUT" = "POST") =>
    (await (await raw(method, url, form, true)).json()) as T,
  text: async (url: string) => (await raw("GET", url)).text(),
  blob: async (url: string) => (await raw("GET", url)).blob(),
  /** Downloads a file through the authenticated fetch (errors are reported, not navigated to). */
  async download(url: string, fallbackName = "download") {
    const res = await raw("GET", url);
    const blob = await res.blob();
    const m = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
};
