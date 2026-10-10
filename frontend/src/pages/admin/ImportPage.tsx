import { useState } from "react";
import { api } from "../../api";
import { Field, FileButton, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { SamplePdfButton } from "../../components/ImportPdf";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { useAsync } from "../../lib/useAsync";
import type { AdminUser } from "../../types";

/** Admin: load Franco.pdf / Giorgia.pdf as ready-made diets into a chosen doctor's account. */
export function ImportDietsPage() {
  const { t } = useI18n();
  usePageTitle(t("nav_import"));
  const { run, toast } = useDialogs();
  const doctors = useAsync(() => api.get<AdminUser[]>("/api/admin/users?role=doctor"), []);
  const [doctor, setDoctor] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<string[]>([]);
  if (!doctors.data) return <Spinner />;
  const active = doctors.data.filter((d) => d.active);
  const target = doctor || active[0]?.id || "";

  const submit = async () => {
    if (!target) return toast(t("import_need_doctor"), true);
    if (!files.length) return toast(t("choose_file"), true);
    const out: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("doctor_id", target);
      const r = await run(() => api.upload<{ name: string; doctor: string }>("/api/admin/import-diet-pdf", fd));
      out.push(r ? `✓ ${f.name} → ${r.name} (${r.doctor})` : `✗ ${f.name}`);
    }
    setResults(out);
    setFiles([]);
  };

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h2>{t("nav_import")}</h2>
      <p className="muted">{t("import_admin_help")}</p>
      {active.length === 0 ? <div className="alert warn">{t("import_need_doctor")}</div> : (
        <div className="col">
          <Field label={t("import_target_doctor")}>
            <select value={target} onChange={(e) => setDoctor(e.target.value)}>
              {active.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.username} (@{d.username})</option>)}
            </select>
          </Field>
          <div className="f"><span>{t("import_pdf_files")}</span>
            <FileButton multiple accept="application/pdf,.pdf" files={files} onChange={setFiles} />
          </div>
          <div className="row"><button className="btn primary" onClick={() => void submit()}><Icon name="upload" />{t("import_pdf")}</button><SamplePdfButton /></div>
        </div>
      )}
      {results.length > 0 && <ul className="mt">{results.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  );
}
