import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Avatar, Empty, Field, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { D, fmtNum } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import type { Patient, PatientListRow } from "../../types";

export function NewPatientForm({ close }: { close: (v?: Patient & { temporary_password: string }) => void }) {
  const { t } = useI18n();
  const { run, toast } = useDialogs();
  const [f, setF] = useState({ full_name: "", username: "", email: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (f.full_name.trim().length < 2) return toast(t("err_validation_error"), true);
    const r = await run(() => api.post<Patient & { temporary_password: string }>("/api/patients", {
      full_name: f.full_name, username: f.username || null, email: f.email, password: f.password || null }));
    if (r) close(r);
  };
  return (
    <>
      <div className="col">
        <Field label={t("full_name")} req><input type="text" maxLength={160} autoFocus value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label={t("username")}><input type="text" maxLength={32} autoCapitalize="none" placeholder={t("username_auto")} value={f.username} onChange={set("username")} /></Field>
        <Field label={t("email")}><input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label={t("initial_password")}><input type="text" autoComplete="off" placeholder={t("pw_auto")} value={f.password} onChange={set("password")} /></Field>
        <p className="small muted">{t("new_patient_help")}</p>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => close()}>{t("cancel")}</button>
        <button className="btn primary" onClick={() => void submit()}>{t("create")}</button>
      </div>
    </>
  );
}

export function PatientsPage() {
  const { t, locale } = useI18n();
  usePageTitle(t("nav_patients"));
  const nav = useNavigate();
  const dialogs = useDialogs();
  const list = useAsync(() => api.get<PatientListRow[]>("/api/patients"), []);
  const [q, setQ] = useState("");
  if (!list.data) return <Spinner />;
  const f = q.trim().toLowerCase();
  const rows = list.data.filter((p) => !f || p.full_name.toLowerCase().includes(f) || p.username.includes(f));
  const incomplete = list.data.filter((p) => p.missing_days).length;

  const create = async () => {
    const r = await dialogs.open<Patient & { temporary_password: string }>(t("new_patient"), (close) => <NewPatientForm close={close} />);
    if (!r) return;
    await dialogs.showSecret(t("patient_created"), t("give_credentials", { user: r.username }), r.temporary_password);
    nav(`/patients/${r.id}`);
  };

  return (
    <div>
      <div className="row spread mb">
        <div>
          <h2 style={{ margin: 0 }}>{t("my_patients")}</h2>
          <span className="muted small">{t("patients_count", { n: list.data.length })}</span>
        </div>
        <div className="row">
          <input type="text" placeholder={t("search")} aria-label={t("search")} style={{ maxWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary" onClick={() => void create()}><Icon name="plus" />{t("new_patient")}</button>
        </div>
      </div>
      <p className="muted">{t("patients_click_hint")}</p>
      {incomplete > 0 && <div className="alert warn">{t("patients_incomplete", { n: incomplete })}</div>}
      <div className="table-wrap"><table>
        <thead><tr>{["patient", "diet", "last_weight", "adherence_7d", "off_plan_7d", "diary", "last_login"].map((k) => <th key={k}>{t("col_" + k)}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7}><Empty>{t("no_patients")}</Empty></td></tr>}
          {rows.map((p) => {
            const adh = p.adherence_7d;
            return (
              <tr key={p.id} className="click" onClick={() => nav(`/patients/${p.id}`)}>
                <td>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <Avatar id={p.id} name={p.full_name} has={p.has_photo} size={36} />
                    <div>
                      <b>{p.full_name}</b><div className="small muted">@{p.username}</div>
                      {!p.active && <span className="chip danger">{t("disabled")}</span>}
                      {p.must_change_password && <span className="chip warn" style={{ marginLeft: ".3rem" }}>{t("pw_pending")}</span>}
                    </div>
                  </div>
                </td>
                <td>{p.diet ?? <span className="muted">–</span>}</td>
                <td>{p.last_weight !== null ? <><b>{fmtNum(p.last_weight, locale)} kg</b><div className="small muted">{D.fmt(p.last_weight_date, locale)}</div></> : "–"}</td>
                <td>{adh === null ? "–" : <span className={`chip ${adh >= 80 ? "ok" : adh >= 50 ? "warn" : "danger"}`}>{fmtNum(adh, locale, 0)}%</span>}</td>
                <td>{p.off_plan_7d ? <span className="chip warn">{p.off_plan_7d}</span> : "0"}</td>
                <td>{p.missing_days ? <span className="chip danger">{t("n_days", { n: p.missing_days })}</span> : <span className="chip ok">{t("up_to_date")}</span>}</td>
                <td className="small muted">{p.last_login_at ? D.dt(p.last_login_at, locale) : t("never")}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
}
