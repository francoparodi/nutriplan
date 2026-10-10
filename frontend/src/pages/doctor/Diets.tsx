import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Field, FileButton, Spinner } from "../../components/Common";
import { ImportPdfButton } from "../../components/ImportPdf";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { D } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { useAssign } from "../../shared/assign";
import type { DietSummary, PatientListRow } from "../../types";

function CopyForm({ initial, close }: { initial: string; close: (v?: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  return (
    <>
      <Field label={t("name")}><input type="text" maxLength={200} autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="actions">
        <button className="btn" onClick={() => close()}>{t("cancel")}</button>
        <button className="btn primary" onClick={() => close(name.trim() || undefined)}>{t("ok")}</button>
      </div>
    </>
  );
}

export function DietsPage() {
  const { t, locale, lang } = useI18n();
  usePageTitle(t("nav_diets"));
  const nav = useNavigate();
  const { open, run, confirm } = useDialogs();
  const { createDiet, assignDialog } = useAssign();
  const data = useAsync(async () => {
    const [diets, pats] = await Promise.all([api.get<DietSummary[]>("/api/diets"), api.get<PatientListRow[]>("/api/patients")]);
    return { diets, pats };
  }, []);
  if (!data.data) return <Spinner />;
  const { diets, pats } = data.data;
  return (
    <div>
      <div className="row spread mb">
        <h2 style={{ margin: 0 }}>{t("diets")}</h2>
        <div className="row">
          <ImportPdfButton onImported={(id) => nav(`/diets/${id}`)} />
          <button className="btn primary" onClick={async () => { const id = await createDiet(null); if (id) nav(`/diets/${id}`); }}>
            <Icon name="plus" />{t("new_diet")}
          </button>
        </div>
      </div>
      {diets.length === 0 ? <div className="card"><div className="empty">{t("no_diets")}</div></div> : (
        <div className="table-wrap"><table>
          <thead><tr>{["name", "patient", "validity", "status", "updated", ""].map((k) => <th key={k}>{k ? t("col_" + k) : ""}</th>)}</tr></thead>
          <tbody>
            {diets.map((d) => (
              <tr key={d.id}>
                <td><Link to={`/diets/${d.id}`}><b>{d.name}</b></Link>{d.description && <div className="small muted">{d.description}</div>}</td>
                <td>{d.patient_name ? <Link to={`/patients/${d.patient_id}/dieta`}>{d.patient_name}</Link> : <span className="chip">{t("template")}</span>}</td>
                <td className="small">{d.start_date ? D.fmt(d.start_date, locale) : "–"} → {d.end_date ? D.fmt(d.end_date, locale) : "∞"}</td>
                <td><span className={`chip${d.status === "active" ? " ok" : d.status === "paused" ? " warn" : ""}`}>{t("status_" + d.status)}</span></td>
                <td className="small muted">{D.dt(d.updated_at, locale)}</td>
                <td className="right nowrap">
                  <button className="iconbtn" title={t("edit")} onClick={() => nav(`/diets/${d.id}`)}><Icon name="edit" /></button>
                  <button className="iconbtn" title={t("copy_diet")} onClick={async () => {
                    const name = await open<string>(t("copy_diet"), (close) => <CopyForm initial={`${d.name} (${t("copy_suffix")})`} close={close} />);
                    if (name && (await run(() => api.post(`/api/diets/${d.id}/copy`, { name }), t("saved")))) await data.reload();
                  }}><Icon name="copy" /></button>
                  <button className="iconbtn" title={t("assign")} onClick={async () => { if (await assignDialog(d, pats)) await data.reload(); }}><Icon name="users" /></button>
                  <button className="iconbtn" title="PDF" onClick={() => void run(() => api.download(`/api/diets/${d.id}/pdf?lang=${lang}`, "piano.pdf"))}><Icon name="download" /></button>
                  <button className="iconbtn" title={t("delete")} onClick={async () => {
                    if (!(await confirm(t("confirm_delete_diet", { name: d.name }), { danger: true }))) return;
                    await run(() => api.del(`/api/diets/${d.id}`), t("deleted"));
                    await data.reload();
                  }}><Icon name="trash" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

/** Backup / restore of the doctor's own data. */
export function BackupPage({ admin = false }: { admin?: boolean }) {
  const { t } = useI18n();
  usePageTitle(t("nav_backup"));
  const { run, confirm, toast } = useDialogs();
  const [file, setFile] = useState<File | null>(null);
  const base = admin ? "/api/admin" : "/api/doctor";
  return (
    <div className="grid c2">
      <div className="card">
        <h2>{t("backup_export")}</h2>
        <p>{t(admin ? "admin_backup_help" : "doctor_backup_help")}</p>
        <button className="btn primary" onClick={() => void run(() => api.download(`${base}/backup`, "backup.zip"))}>
          <Icon name="download" />{t("backup_download")}
        </button>
      </div>
      <div className="card">
        <h2>{t("backup_restore")}</h2>
        <div className={`alert ${admin ? "danger" : "warn"}`}>{t(admin ? "admin_restore_warning" : "doctor_restore_warning")}</div>
        <FileButton accept=".zip,application/zip" files={file ? [file] : []} onChange={(f) => setFile(f[0] ?? null)} />
        <div className="mt">
          <button className="btn danger" onClick={async () => {
            if (!file) return toast(t("choose_file"), true);
            if (!(await confirm(t(admin ? "admin_restore_confirm" : "restore_confirm"), { danger: true, ok: t("backup_restore") }))) return;
            const fd = new FormData();
            fd.append("file", file);
            const r = await run(() => api.upload(`${base}/restore`, fd));
            if (r) {
              toast(t("restore_done"));
              setFile(null);
              if (admin) setTimeout(() => location.assign("/"), 1200);
            }
          }}><Icon name="upload" />{t("backup_restore")}</button>
        </div>
      </div>
    </div>
  );
}
