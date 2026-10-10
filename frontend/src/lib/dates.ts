/** Application dates are ISO strings (YYYY-MM-DD) in the user's local time zone. */
const z = (n: number) => String(n).padStart(2, "0");

export const D = {
  iso(d: Date): string { return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; },
  parse(s: string): Date { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); },
  today(): string { return D.iso(new Date()); },
  add(s: string, n: number): string { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
  fmt(s: string | null | undefined, locale: string, opts?: Intl.DateTimeFormatOptions): string {
    if (!s) return "";
    return D.parse(s).toLocaleDateString(locale, opts ?? { day: "2-digit", month: "2-digit", year: "numeric" });
  },
  long(s: string, locale: string): string {
    return D.parse(s).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  },
  dt(s: string | null | undefined, locale: string): string {
    return s ? new Date(s).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "";
  },
};

export function fmtNum(v: number | null | undefined, locale: string, digits = 1): string {
  return v === null || v === undefined ? "–" : v.toLocaleString(locale, { maximumFractionDigits: digits });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Quantity text like the server's qty_display (e.g. "120 g", "2 + 10 g di grana"). */
export function qtyText(qty: number | null | undefined, unit: string, text = "", locale = "it-IT"): string {
  const parts: string[] = [];
  if (qty !== null && qty !== undefined) parts.push(`${fmtNum(qty, locale, 1)} ${unit}`.trim());
  if (text) parts.push(text);
  return parts.join(" ");
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

/** Resizes an image (longest side `max` px) and converts it to JPEG before upload. */
export function resizeImage(file: File, max = 640): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
