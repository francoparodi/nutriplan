import { useRef, useState } from "react";
import { api } from "../api";
import { useDialogs } from "./Dialogs";
import { Icon } from "./Icon";
import { useI18n } from "../i18n";

/** Downloads the example PDF (Franco.pdf) that can be uploaded with the import button. */
export function SamplePdfButton() {
  const { t } = useI18n();
  const { run } = useDialogs();
  return (
    <button className="btn" title={t("sample_pdf_help")} onClick={() => void run(() => api.download("/api/diets/sample-pdf", "Franco.pdf"))}>
      <Icon name="download" />{t("sample_pdf")}
    </button>
  );
}

/** Uploads a PDF meal plan (Franco.pdf / Giorgia.pdf) and creates the diet as a template. */
export function ImportPdfButton({ onImported }: { onImported: (dietId: string) => void }) {
  const { t } = useI18n();
  const { run } = useDialogs();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => ref.current?.click()} title={t("import_pdf_help")}>
        <Icon name="upload" />{t("import_pdf")}
      </button>
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        const fd = new FormData();
        fd.append("file", f);
        const r = await run(() => api.upload<{ id: string }>("/api/diets/import-pdf", fd), t("import_pdf_done"));
        setBusy(false);
        if (r) onImported(r.id);
      }} />
    </>
  );
}
