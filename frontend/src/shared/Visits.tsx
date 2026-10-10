import { useState } from "react";
import { api } from "../api";
import { useDialogs } from "../components/Dialogs";
import { Icon } from "../components/Icon";
import { Empty, Field, FileButton, Spinner } from "../components/Common";
import { useI18n } from "../i18n";
import { D, fmtNum, resizeImage } from "../lib/dates";
import { useAsync } from "../lib/useAsync";
import type { Doc, Visit } from "../types";
import { Attachment } from "./Documents";

const MEASURES: [keyof Visit, string, string][] = [
  ["weight_kg", "weight_kg", "kg"], ["waist_cm", "waist_cm", "cm"], ["leg_length_cm", "leg_length_cm", "cm"],
  ["calf_cm", "calf_cm", "cm"], ["biceps_cm", "biceps_cm", "cm"],
];

type Extra = { label: string; value: number | null; unit: string };

function VisitForm({ patientId, visit, close }: { patientId: string; visit: Visit | null; close: (v?: boolean) => void }) {
  const { t } = useI18n();
  const { toast, errText } = useDialogs();
  const [date, setDate] = useState(visit?.date ?? D.today());
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(MEASURES.map(([k]) => [k, visit && visit[k] !== null ? String(visit[k]) : ""])));
  const [extra, setExtra] = useState<Extra[]>(visit?.extra.map((e) => ({ ...e })) ?? []);
  const [notes, setNotes] = useState(visit?.notes ?? "");
  const [removed, setRemoved] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const atts: Doc[] = (visit?.attachments ?? []).filter((a) => !removed.includes(a.id));

  const save = async () => {
    if (!date) return;
    setBusy(true);
    const payload = {
      date, notes,
      extra: extra.filter((m) => m.label.trim() && m.value !== null && Number.isFinite(m.value)),
      ...Object.fromEntries(MEASURES.map(([k]) => [k, vals[k] === "" ? null : parseFloat(vals[k])])),
    };
    try {
      const saved = visit ? await api.put<Visit>(`/api/patients/${patientId}/visits/${visit.id}`, payload)
        : await api.post<Visit>(`/api/patients/${patientId}/visits`, payload);
      for (const id of removed) await api.del(`/api/patients/${patientId}/documents/${id}`);
      for (const f of files) {
        const isImg = f.type.startsWith("image/");
        const blob: Blob = isImg ? await resizeImage(f, 1600).catch(() => f) : f;
        const fd = new FormData();
        fd.append("file", blob, isImg ? f.name.replace(/\.[^.]+$/, "") + ".jpg" : f.name);
        fd.append("kind", isImg ? "photo" : "document"); fd.append("title", f.name); fd.append("visit_id", saved.id);
        await api.upload(`/api/patients/${patientId}/documents`, fd);
      }
      toast(t("saved"));
      close(true);
    } catch (e) { toast(errText(e), true); setBusy(false); }
  };

  return (
    <>
      <div className="col">
        <div className="form-grid">
          <Field label={t("visit_date")}><input type="date" value={date} max={D.add(D.today(), 1)} onChange={(e) => setDate(e.target.value)} /></Field>
          {MEASURES.map(([k, l, u]) => (
            <Field key={k} label={`${t(l)} (${u})`}>
              <input type="number" step="0.1" min="0" inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div>
          <h3>{t("custom_measurements")}</h3>
          {extra.map((m, i) => (
            <div className="row" key={i} style={{ marginBottom: ".4rem", flexWrap: "nowrap" }}>
              <input type="text" value={m.label} placeholder={t("field_label")} style={{ flex: "2 1 120px" }}
                onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input type="number" step="0.1" value={m.value ?? ""} placeholder={t("field_value")} style={{ flex: "1 1 80px" }}
                onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, value: e.target.value === "" ? null : parseFloat(e.target.value) } : x)))} />
              <input type="text" value={m.unit} style={{ flex: "0 1 70px" }}
                onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
              <button className="iconbtn" type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
          ))}
          <button className="btn sm" type="button" onClick={() => setExtra([...extra, { label: "", value: null, unit: "cm" }])}>
            <Icon name="plus" />{t("add_measurement")}
          </button>
        </div>
        <Field label={t("note")}><textarea rows={4} value={notes} placeholder={t("visit_notes_ph")} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div>
          <h3>{t("attachments")}</h3>
          <div className="row">
            {atts.map((a) => <Attachment key={a.id} patientId={patientId} doc={a} onRemove={(d) => setRemoved([...removed, d.id])} />)}
          </div>
          <div className="mt">
            <div className="f"><span>{t("add_attachments")}</span><FileButton multiple files={files} onChange={setFiles} /></div>
          </div>
        </div>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => close(false)}>{t("cancel")}</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{t("save")}</button>
      </div>
    </>
  );
}

/** Visits list. Doctors can create/edit/delete; patients see them read-only. */
export function VisitsView({ patientId, canEdit, withTitle = true }: { patientId: string; canEdit: boolean; withTitle?: boolean }) {
  const { t, locale } = useI18n();
  const { open, confirm, run } = useDialogs();
  const visits = useAsync(() => api.get<Visit[]>(`/api/patients/${patientId}/visits`), [patientId]);
  const edit = async (v: Visit | null) => {
    const ok = await open<boolean>(v ? t("edit_visit") : t("new_visit"),
      (close) => <VisitForm patientId={patientId} visit={v} close={close} />, { wide: true, sticky: true });
    if (ok) await visits.reload();
  };
  if (!visits.data) return <Spinner />;
  return (
    <div>
      {canEdit && (
        <div className="row spread mb">
          {withTitle && <h2 style={{ margin: 0 }}>{t("visits")}</h2>}
          <button className="btn primary" onClick={() => void edit(null)}><Icon name="plus" />{t("new_visit")}</button>
        </div>
      )}
      {visits.data.length === 0 && <div className="card"><Empty>{t("no_visits")}</Empty></div>}
      {visits.data.map((v) => (
        <div className="card" key={v.id}>
          <div className="row spread">
            <h3 style={{ margin: 0, textTransform: "capitalize" }}>{D.long(v.date, locale)}</h3>
            {canEdit && (
              <div className="row">
                <button className="btn sm" onClick={() => void edit(v)}><Icon name="edit" />{t("edit")}</button>
                <button className="btn sm danger" onClick={async () => {
                  if (!(await confirm(t("confirm_delete_visit"), { danger: true }))) return;
                  await run(() => api.del(`/api/patients/${patientId}/visits/${v.id}`), t("deleted"));
                  await visits.reload();
                }}><Icon name="trash" /></button>
              </div>
            )}
          </div>
          <div className="row mt">
            {MEASURES.filter(([k]) => v[k] !== null && v[k] !== undefined).map(([k, l, u]) => (
              <div className="stat" key={k} style={{ padding: ".4rem .7rem" }}>
                <div className="v" style={{ fontSize: "1.15rem" }}>{`${fmtNum(v[k] as number, locale)} ${u}`}</div><div className="k">{t(l)}</div>
              </div>
            ))}
            {v.extra.map((m, i) => (
              <div className="stat" key={i} style={{ padding: ".4rem .7rem" }}>
                <div className="v" style={{ fontSize: "1.15rem" }}>{`${fmtNum(m.value, locale)} ${m.unit || ""}`}</div><div className="k">{m.label}</div>
              </div>
            ))}
          </div>
          {v.notes && <p style={{ whiteSpace: "pre-wrap" }}>{v.notes}</p>}
          {v.attachments.length > 0 && (
            <div className="row mt">{v.attachments.map((a) => <Attachment key={a.id} patientId={patientId} doc={a} />)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
