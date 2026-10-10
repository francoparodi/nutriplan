import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import type { Contacts } from "../types";
import { Field } from "./Common";

export const CONTACT_KEYS = ["phone", "whatsapp", "telegram", "instagram", "facebook", "website"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export const emptyContacts = (): Contacts => ({ phone: "", whatsapp: "", telegram: "", instagram: "", facebook: "", website: "" });

const HTTP = /^https?:\/\//i;

/** Builds a safe link for a contact value (only http(s)/tel links are ever produced). */
export function contactHref(key: ContactKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const digits = v.replace(/[^\d]/g, "");
  switch (key) {
    case "phone": return digits ? `tel:${v.replace(/[^\d+]/g, "")}` : null;
    case "whatsapp": return digits ? `https://wa.me/${digits}` : null;
    case "telegram":
      if (HTTP.test(v)) return v;
      if (/^\+?[\d\s-]{6,}$/.test(v)) return `https://t.me/+${digits}`;
      return `https://t.me/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "instagram":
      return HTTP.test(v) ? v : `https://instagram.com/${encodeURIComponent(v.replace(/^@/, ""))}`;
    case "facebook":
      return HTTP.test(v) ? v : `https://facebook.com/${encodeURIComponent(v)}`;
    case "website": return HTTP.test(v) ? v : null;
  }
}

const PLACEHOLDER: Record<ContactKey, string> = {
  phone: "+39 333 1234567", whatsapp: "+39 333 1234567", telegram: "@username",
  instagram: "@username / https://instagram.com/…", facebook: "https://facebook.com/…", website: "https://…",
};

/** Optional contact fields (phone, WhatsApp, Telegram, Instagram, Facebook, website). */
export function ContactFields({ value, onChange }: { value: Contacts; onChange: (c: Contacts) => void }) {
  const { t } = useI18n();
  return (
    <div className="form-grid">
      {CONTACT_KEYS.map((k) => (
        <Field key={k} label={t("contact_" + k)}>
          <input type={k === "website" ? "url" : "text"} maxLength={k === "phone" || k === "whatsapp" || k === "telegram" ? 120 : 200}
            inputMode={k === "phone" || k === "whatsapp" ? "tel" : undefined} autoCapitalize="none"
            placeholder={PLACEHOLDER[k]} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

/** Read-only list of the contacts that are filled in, as links. */
export function ContactLinks({ c }: { c: Partial<Contacts> | undefined }): ReactNode {
  const { t } = useI18n();
  const items = CONTACT_KEYS.filter((k) => c?.[k]?.trim());
  if (!items.length) return null;
  return (
    <div className="row" style={{ gap: ".4rem" }}>
      {items.map((k) => {
        const href = contactHref(k, c![k]!);
        const label = <><b>{t("contact_" + k)}</b>: {c![k]}</>;
        return href
          ? <a key={k} className="chip info" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
          : <span key={k} className="chip">{label}</span>;
      })}
    </div>
  );
}
