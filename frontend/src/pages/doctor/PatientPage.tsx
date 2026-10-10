import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { Avatar, Field, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { D } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { useAssign } from "../../shared/assign";
import { DayView, WarningsBanner } from "../../shared/DayView";
import { DocumentsPage } from "../../shared/Documents";
import { ProgressView } from "../../shared/Progress";
import { VisitsView } from "../../shared/Visits";
import { ContactFields, ContactLinks } from "../../components/Contacts";
import { HealthBanner, useHealthConfirm } from "../../components/Health";
import type { CustomField, DietSummary, Patient, PatientDietRow, PatientListRow } from "../../types";

const TABS: [string, string][] = [
  ["scheda", "tab_profile"], ["dieta", "tab_diet"], ["andamento", "tab_progress"], ["diario", "tab_diary"],
  ["visite", "tab_visits"], ["documenti", "tab_documents"],
];

export function PatientPage() {
  const { t } = useI18n();
  const { id = "", tab = "scheda", date } = useParams();
  const p = useAsync(() => api.get<Patient>(`/api/patients/${id}`), [id]);
  usePageTitle(p.data?.full_name ?? t("nav_patients"));
  if (p.error && !p.data) return <div className="alert danger">{t("err_not_found")}</div>;
  if (!p.data) return <Spinner />;
  const pt = p.data;
  return (
    <div>
      <div className="row spread mb">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Avatar id={pt.id} name={pt.full_name} has={pt.has_photo} size={56} />
          <div><h2 style={{ margin: 0 }}>{pt.full_name}</h2><span className="muted small">@{pt.username}</span></div>
        </div>
        <div className="row">
          {!pt.active && <span className="chip danger">{t("disabled")}</span>}
          {pt.must_change_password && <span className="chip warn">{t("pw_pending")}</span>}
          <Link className="btn" to="/patients"><Icon name="back" />{t("all_patients")}</Link>
        </div>
      </div>
      <div className="mb"><ContactLinks c={pt} /></div>
      <div className="tabs">
        {TABS.map(([k, l]) => <Link key={k} className={k === tab ? "active" : ""} to={`/patients/${id}/${k}`}>{t(l)}</Link>)}
      </div>
      {tab === "scheda" && <PatientForm key={pt.id} patient={pt} onSaved={() => void p.reload()} />}
      {tab === "dieta" && <PatientDiets patient={pt} />}
      {tab === "andamento" && <ProgressView patientId={id} />}
      {tab === "diario" && (
        <div>
          <WarningsBanner patientId={id} basePath={`/patients/${id}/diario`} who="doctor" />
          <DayView patientId={id} date={date ?? D.today()} role="doctor" basePath={`/patients/${id}/diario`} />
        </div>
      )}
      {tab === "visite" && <VisitsView patientId={id} canEdit />}
      {tab === "documenti" && <DocumentsPage patientId={id} canEdit />}
    </div>
  );
}

// ------------------------------------------------------------------ patient record form
const TEXT_FIELDS = ["tax_code", "occupation", "activity_level"] as const;
const AREA_FIELDS = ["allergies", "intolerances", "pathologies", "medications", "family_history", "notes"] as const;
const AREA_LABEL: Record<string, string> = { notes: "doctor_notes" };

function PatientForm({ patient, onSaved }: { patient: Patient; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const { run, confirm, showSecret } = useDialogs();
  const nav = useNavigate();
  const [f, setF] = useState<Patient>(patient);
  const [custom, setCustom] = useState<CustomField[]>(patient.custom.map((c) => ({ ...c })));
  const set = <K extends keyof Patient>(k: K, v: Patient[K]) => setF({ ...f, [k]: v });
  const num = (v: string) => (v === "" ? null : parseFloat(v));

  const save = async () => {
    const body = {
      full_name: f.full_name, email: f.email, phone: f.phone, whatsapp: f.whatsapp, telegram: f.telegram,
      instagram: f.instagram, facebook: f.facebook, website: f.website, birth_date: f.birth_date || null, sex: f.sex, height_cm: f.height_cm,
      goal_weight_kg: f.goal_weight_kg, address: f.address, tax_code: f.tax_code, occupation: f.occupation,
      activity_level: f.activity_level, allergies: f.allergies, intolerances: f.intolerances, pathologies: f.pathologies,
      medications: f.medications, family_history: f.family_history, notes: f.notes, custom,
    };
    if (await run(() => api.put(`/api/patients/${patient.id}`, body), t("saved"))) onSaved();
  };

  return (
    <div>
      <div className="card">
        <h2>{t("patient_record")}</h2>
        <div className="form-grid">
          <Field label={t("full_name")} req><input type="text" maxLength={160} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label={t("email")}><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label={t("birth_date")}><input type="date" value={f.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value || null)} /></Field>
          <Field label={t("sex")}>
            <select value={f.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">—</option><option value="F">{t("sex_f")}</option><option value="M">{t("sex_m")}</option><option value="O">{t("sex_o")}</option>
            </select>
          </Field>
          <Field label={t("height_cm")}><input type="number" step="0.1" min="30" max="260" value={f.height_cm ?? ""} onChange={(e) => set("height_cm", num(e.target.value))} /></Field>
          <Field label={t("goal_weight")}><input type="number" step="0.1" min="20" max="400" value={f.goal_weight_kg ?? ""} onChange={(e) => set("goal_weight_kg", num(e.target.value))} /></Field>
          {TEXT_FIELDS.map((k) => (
            <Field key={k} label={t(k)}><input type="text" value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>
          ))}
          <Field label={t("address")} wide><input type="text" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
          {AREA_FIELDS.map((k) => (
            <Field key={k} label={t(AREA_LABEL[k] ?? k)}><textarea value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>
          ))}
        </div>
        <h3 className="mt">{t("contacts")}</h3>
        <ContactFields value={f} onChange={(c) => setF({ ...f, ...c })} />
        <h3 className="mt">{t("custom_fields")}</h3>
        {custom.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: ".4rem" }}>
            <input type="text" value={c.label} placeholder={t("field_label")} style={{ flex: "1 1 160px" }}
              onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input type="text" value={c.value} placeholder={t("field_value")} style={{ flex: "2 1 220px" }}
              onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <button className="iconbtn" type="button" onClick={() => setCustom(custom.filter((_, j) => j !== i))}><Icon name="trash" /></button>
          </div>
        ))}
        <div className="row mt">
          <button className="btn sm" type="button" onClick={() => setCustom([...custom, { label: "", value: "" }])}><Icon name="plus" />{t("add_field")}</button>
          <span className="grow" />
          <button className="btn primary" onClick={() => void save()}>{t("save")}</button>
        </div>
      </div>
      <div className="card">
        <h2>{t("account")}</h2>
        <p className="muted">
          {t("username")}: <b>{patient.username}</b> · {t("created")}: {D.dt(patient.created_at, locale)} · {t("last_login")}:{" "}
          {patient.last_login_at ? D.dt(patient.last_login_at, locale) : t("never")}
        </p>
        <p className="small muted">{t("reset_help")}</p>
        <div className="row">
          <button className="btn" onClick={async () => {
            if (!(await confirm(t("confirm_reset_pw", { name: patient.full_name })))) return;
            const r = await run(() => api.post<{ temporary_password: string; username: string }>(`/api/patients/${patient.id}/reset-password`));
            if (r) { await showSecret(t("password_reset"), t("give_credentials", { user: r.username }), r.temporary_password); onSaved(); }
          }}><Icon name="key" />{t("reset_password")}</button>
          <button className="btn" onClick={async () => {
            await run(() => api.post(`/api/patients/${patient.id}/active`, { active: !patient.active }), t("saved"));
            onSaved();
          }}>{patient.active ? t("disable_account") : t("enable_account")}</button>
          <button className="btn danger" onClick={async () => {
            if (!(await confirm(t("confirm_delete_patient", { name: patient.full_name }), { danger: true }))) return;
            if (await run(() => api.del(`/api/patients/${patient.id}`), t("deleted"))) nav("/patients");
          }}><Icon name="trash" />{t("delete_patient")}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ assigned diets tab
function PatientDiets({ patient }: { patient: Patient }) {
  const { t, locale, lang } = useI18n();
  const { run, confirm } = useDialogs();
  const { conflictChoice, createDiet, assignDialog } = useAssign();
  const confirmHealth = useHealthConfirm();
  const nav = useNavigate();
  const data = useAsync(async () => {
    const [mine, all, pats] = await Promise.all([
      api.get<PatientDietRow[]>(`/api/patients/${patient.id}/diets`),
      api.get<DietSummary[]>("/api/diets"),
      api.get<PatientListRow[]>("/api/patients"),
    ]);
    return { mine, all, pats };
  }, [patient.id]);
  const [pick, setPick] = useState("");
  if (!data.data) return <Spinner />;
  const { mine, all, pats } = data.data;
  const templates = all.filter((d) => d.patient_id !== patient.id);
  const chosen = pick || templates[0]?.id || "";
  return (
    <div>
      <HealthBanner name={patient.full_name} info={patient} />
      <div className="card mb">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>{t("assigned_diets")}</h2>
          <button className="btn primary" onClick={async () => {
            if (!(await confirmHealth(patient.full_name, patient, t("new_diet_for_patient")))) return;
            const id = await createDiet(patient.id);
            if (id) nav(`/diets/${id}`);
          }}>
            <Icon name="plus" />{t("new_diet_for_patient")}
          </button>
        </div>
        {mine.length === 0 ? <div className="empty">{t("no_diet_assigned")}</div> : (
          <div className="table-wrap mt"><table>
            <thead><tr><th>{t("name")}</th><th>{t("validity")}</th><th>{t("status")}</th><th /></tr></thead>
            <tbody>
              {mine.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/diets/${d.id}`}><b>{d.name}</b></Link>{d.current && <span className="chip ok" style={{ marginLeft: ".4rem" }}>{t("current")}</span>}</td>
                  <td className="small">{d.start_date ? D.fmt(d.start_date, locale) : "–"} → {d.end_date ? D.fmt(d.end_date, locale) : "∞"}</td>
                  <td><span className={`chip${d.status === "active" ? " ok" : d.status === "paused" ? " warn" : ""}`}>{t("status_" + d.status)}</span></td>
                  <td className="right nowrap">
                    <Link className="iconbtn" title={t("edit")} to={`/diets/${d.id}`}><Icon name="edit" /></Link>
                    <button className="iconbtn" title="PDF" onClick={() => void run(() => api.download(`/api/diets/${d.id}/pdf?lang=${lang}`, "piano.pdf"))}><Icon name="download" /></button>
                    {d.status === "paused" && (
                      <button className="btn sm" onClick={async () => {
                        const c = await conflictChoice(patient.id, d.id, d.start_date, d.end_date);
                        if (c === null) return;
                        if (await run(() => api.post(`/api/diets/${d.id}/assign`, { patient_id: patient.id, start_date: d.start_date,
                          end_date: d.end_date, status: "active", resolve: c === "none" ? "replace" : c }), t("saved"))) await data.reload();
                      }}><Icon name="check" />{t("activate")}</button>
                    )}
                    <button className="iconbtn" title={t("unassign")} onClick={async () => {
                      if (!(await confirm(t("confirm_unassign")))) return;
                      await run(() => api.post(`/api/diets/${d.id}/assign`, { patient_id: null }), t("saved"));
                      await data.reload();
                    }}><Icon name="x" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {templates.length > 0 && (
        <div className="card">
          <h3>{t("assign_existing")}</h3>
          <div className="row">
            <select value={chosen} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 420 }}>
              {templates.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.patient_name || t("template")})</option>)}
            </select>
            <button className="btn" onClick={async () => {
              const d = all.find((x) => x.id === chosen);
              if (d && (await assignDialog(d, pats, patient.id))) await data.reload();
            }}><Icon name="copy" />{t("assign")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
