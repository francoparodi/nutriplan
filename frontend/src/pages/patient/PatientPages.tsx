import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";
import { useUser } from "../../auth";
import { Empty, Field, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { D, fmtNum } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { DayView, WarningsBanner } from "../../shared/DayView";
import { DocumentsPage } from "../../shared/Documents";
import { PlanHeader, PlanView } from "../../shared/Plan";
import { ProgressView, WeightChart } from "../../shared/Progress";
import type { Diet, Patient, PatientDietRow, Progress } from "../../types";

export function DiaryPage() {
  const { t } = useI18n();
  usePageTitle(t("nav_diary"));
  const user = useUser();
  const { date } = useParams();
  return (
    <div>
      <WarningsBanner patientId={user.id} basePath="/diary" who="patient" />
      <DayView patientId={user.id} date={date ?? D.today()} role="patient" basePath="/diary" />
    </div>
  );
}

export function PlanPage() {
  const { t } = useI18n();
  usePageTitle(t("nav_plan"));
  const user = useUser();
  const plan = useAsync(async () => {
    const diets = await api.get<PatientDietRow[]>(`/api/patients/${user.id}/diets`);
    const cur = diets.find((d) => d.current) ?? diets.find((d) => d.status === "active");
    return cur ? await api.get<Diet>(`/api/diets/${cur.id}`) : null;
  }, [user.id]);
  if (plan.data === undefined) return <Spinner />;
  if (plan.data === null) return <div className="card"><Empty>{t("no_diet_for_day")}</Empty></div>;
  return <div><PlanHeader doc={plan.data} /><PlanView doc={plan.data} /></div>;
}

export function WeightPage() {
  const { t, locale } = useI18n();
  usePageTitle(t("nav_weight"));
  const user = useUser();
  const { run, confirm, toast } = useDialogs();
  const data = useAsync(async () => {
    const [ws, pr] = await Promise.all([
      api.get<Progress["weights"]>(`/api/patients/${user.id}/weights`),
      api.get<Patient>(`/api/patients/${user.id}`),
    ]);
    return { ws, goal: pr.goal_weight_kg };
  }, [user.id]);
  const [date, setDate] = useState(D.today());
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  if (!data.data) return <Spinner />;
  const { ws, goal } = data.data;
  const last = ws[ws.length - 1], first = ws[0];
  const save = async () => {
    const v = parseFloat(kg.replace(",", "."));
    if (!v) return toast(t("err_validation_error"), true);
    if (await run(() => api.put(`/api/patients/${user.id}/weights/${date}`, { kg: v, note }), t("saved"))) {
      setKg(""); setNote(""); await data.reload();
    }
  };
  return (
    <div>
      <div className="card mb">
        <h2>{t("add_weight")}</h2>
        <div className="form-grid">
          <Field label={t("date")}><input type="date" value={date} max={D.today()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t("weight_kg")}><input type="number" step="0.1" min="20" max="400" inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
          <Field label={t("note")}><input type="text" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="mt"><button className="btn primary" onClick={() => void save()}>{t("save")}</button></div>
      </div>
      <div className="grid c4 mb">
        <div className="stat"><div className="v">{last ? fmtNum(last.kg, locale) : "–"}</div><div className="k">{t("last_weight")} (kg)</div></div>
        <div className="stat"><div className="v">{first ? fmtNum(first.kg, locale) : "–"}</div><div className="k">{t("first_weight")} (kg)</div></div>
        <div className="stat"><div className="v">{ws.length > 1 ? `${last.kg - first.kg > 0 ? "+" : ""}${fmtNum(last.kg - first.kg, locale)}` : "–"}</div><div className="k">{t("weight_change")} (kg)</div></div>
        <div className="stat"><div className="v">{goal ? fmtNum(goal, locale) : "–"}</div><div className="k">{t("goal_weight")} (kg)</div></div>
      </div>
      <div className="card mb"><h2>{t("weight_trend")}</h2><WeightChart weights={ws} goal={goal} /></div>
      {ws.length > 0 && (
        <div className="table-wrap"><table>
          <thead><tr><th>{t("date")}</th><th>{t("weight_kg")}</th><th>{t("note")}</th><th /></tr></thead>
          <tbody>
            {ws.slice().reverse().map((w) => (
              <tr key={w.date}>
                <td>{D.fmt(w.date, locale)}</td><td>{fmtNum(w.kg, locale, 2)}</td><td>{w.note}</td>
                <td className="right"><button className="iconbtn" title={t("delete")} onClick={async () => {
                  if (!(await confirm(t("confirm_delete"), { danger: true }))) return;
                  await run(() => api.del(`/api/patients/${user.id}/weights/${w.date}`));
                  await data.reload();
                }}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

export function ProgressPage() {
  const { t } = useI18n();
  usePageTitle(t("nav_progress"));
  const user = useUser();
  return <ProgressView patientId={user.id} />;
}

export function PatientDocumentsPage() {
  const { t } = useI18n();
  usePageTitle(t("nav_documents"));
  const user = useUser();
  return <DocumentsPage patientId={user.id} canEdit={false} />;
}
