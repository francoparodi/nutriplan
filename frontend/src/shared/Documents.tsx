import { useEffect, useState } from "react";
import { api } from "../api";
import { useDialogs } from "../components/Dialogs";
import { Icon } from "../components/Icon";
import { Empty, FileButton } from "../components/Common";
import { useI18n } from "../i18n";
import { D, fmtBytes } from "../lib/dates";
import type { Doc } from "../types";

function Thumb({ url, alt, height = 120, onClick }: { url: string; alt: string; height?: number; onClick?: () => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let obj: string | undefined;
    let dead = false;
    api.blob(`${url}?inline=true`).then((b) => { if (!dead) { obj = URL.createObjectURL(b); setSrc(obj); } }).catch(() => undefined);
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [url]);
  return <img src={src} alt={alt} style={{ width: "100%", height, objectFit: "cover", borderRadius: 8, background: "var(--surface2)", cursor: onClick ? "pointer" : undefined }} onClick={onClick} />;
}

/** Small attachment card used inside visits (optionally removable). */
export function Attachment({ patientId, doc, onRemove }: { patientId: string; doc: Doc; onRemove?: (d: Doc) => void }) {
  const { t } = useI18n();
  const { run } = useDialogs();
  const url = `/api/patients/${patientId}/documents/${doc.id}/download`;
  const dl = () => void run(() => api.download(url, doc.filename));
  return (
    <div className="doc-card" style={{ width: 150 }}>
      {doc.mime.startsWith("image/") && <Thumb url={url} alt={doc.title} height={90} onClick={dl} />}
      <span className="small" style={{ wordBreak: "break-word" }}>{doc.title || doc.filename}</span>
      <div className="row">
        <button className="btn sm" title={t("download")} onClick={dl}><Icon name="download" /></button>
        {onRemove && <button className="btn sm danger" title={t("remove")} onClick={() => onRemove(doc)}><Icon name="trash" /></button>}
      </div>
    </div>
  );
}

export function DocumentsGrid({ patientId, docs, canEdit, ownDelete, onChange }: {
  patientId: string; docs: Doc[]; canEdit: boolean; ownDelete?: boolean; onChange: () => void;
}) {
  const { t, locale } = useI18n();
  const { run, confirm } = useDialogs();
  if (!docs.length) return <div className="card"><Empty>{t("no_documents")}</Empty></div>;
  return (
    <div className="mini-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
      {docs.map((d) => {
        const url = `/api/patients/${patientId}/documents/${d.id}/download`;
        const canDelete = canEdit || (ownDelete && d.uploaded_by === "patient");
        return (
          <div className="doc-card" key={d.id}>
            {d.mime.startsWith("image/") && <Thumb url={url} alt={d.title} />}
            <b style={{ wordBreak: "break-word" }}>{d.title}</b>
            <div className="row">
              <span className="chip">{t("kind_" + d.kind)}</span>
              {canEdit && <span className={`chip${d.visible_to_patient ? " ok" : ""}`}>{d.visible_to_patient ? t("visible_to_patient") : t("private")}</span>}
              {d.uploaded_by === "patient" && <span className="chip info">{t(canEdit ? "uploaded_by_patient" : "uploaded_by_me")}</span>}
            </div>
            <span className="small muted">{`${d.filename} · ${fmtBytes(d.size)} · ${D.fmt(d.created_at, locale)}`}</span>
            {d.notes && <span className="small">{d.notes}</span>}
            <div className="row">
              <button className="btn sm" onClick={() => void run(() => api.download(url, d.filename))}><Icon name="download" />{t("download")}</button>
              {canEdit && d.uploaded_by !== "patient" && (
                <button className="btn sm" onClick={async () => {
                  await run(() => api.patch(`/api/patients/${patientId}/documents/${d.id}`, { visible_to_patient: !d.visible_to_patient }));
                  onChange();
                }}><Icon name="eye" />{d.visible_to_patient ? t("hide") : t("share")}</button>
              )}
              {canDelete && (
                <button className="btn sm danger" onClick={async () => {
                  if (!(await confirm(t("confirm_delete"), { danger: true }))) return;
                  await run(() => api.del(`/api/patients/${patientId}/documents/${d.id}`));
                  onChange();
                }}><Icon name="trash" /></button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Upload form. kinds: which document types may be chosen. */
export function UploadCard({ patientId, kinds, help, withVisibility, onDone }: {
  patientId: string; kinds: Doc["kind"][]; help?: string; withVisibility?: boolean; onDone: () => void;
}) {
  const { t } = useI18n();
  const { run, toast } = useDialogs();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Doc["kind"]>(kinds[0]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [vis, setVis] = useState(false);
  const submit = async () => {
    if (!file) return toast(t("choose_file"), true);
    const fd = new FormData();
    fd.append("file", file); fd.append("kind", kind); fd.append("title", title); fd.append("notes", notes);
    if (withVisibility) fd.append("visible_to_patient", vis ? "true" : "false");
    const r = await run(() => api.upload(`/api/patients/${patientId}/documents`, fd), t("saved"));
    if (r) { setFile(null); setTitle(""); setNotes(""); onDone(); }
  };
  return (
    <div className="card mb">
      <h2>{t("upload_document")}</h2>
      {help && <p className="muted small">{help}</p>}
      <div className="form-grid">
        <div className="f"><span>{t("file")}</span><FileButton files={file ? [file] : []} onChange={(f) => setFile(f[0] ?? null)} /></div>
        <label className="f"><span>{t("type")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Doc["kind"])}>{kinds.map((k) => <option key={k} value={k}>{t("kind_" + k)}</option>)}</select>
        </label>
        <label className="f"><span>{t("title")}</span><input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="f"><span>{t("note")}</span><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <div className="row mt">
        {withVisibility && <label className="row"><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} />{t("visible_to_patient")}</label>}
        <span className="grow" />
        <button className="btn primary" onClick={() => void submit()}><Icon name="upload" />{t("upload")}</button>
      </div>
    </div>
  );
}

export function DocumentsPage({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const { t } = useI18n();
  const docs = useAsync2(patientId);
  return (
    <div>
      <UploadCard patientId={patientId} kinds={canEdit ? ["document", "photo", "recipe"] : ["document", "photo"]}
        help={canEdit ? undefined : t("patient_upload_help")} withVisibility={canEdit} onDone={() => void docs.reload()} />
      {docs.data && <DocumentsGrid patientId={patientId} docs={docs.data} canEdit={canEdit} ownDelete={!canEdit} onChange={() => void docs.reload()} />}
    </div>
  );
}

import { useAsync } from "../lib/useAsync";
function useAsync2(patientId: string) {
  return useAsync(() => api.get<Doc[]>(`/api/patients/${patientId}/documents`), [patientId]);
}
