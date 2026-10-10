import { useState } from "react";
import { api } from "../api";
import { useDialogs } from "../components/Dialogs";
import { Field } from "../components/Common";
import { HealthBanner, useHealthConfirm } from "../components/Health";
import { useI18n } from "../i18n";
import { D } from "../lib/dates";
import type { Diet, PatientDietRow, PatientListRow } from "../types";

export type Resolve = "none" | "replace" | "pause";

/** Assignment helpers: conflict handling when the patient already has an active diet in the same period. */
export function useAssign() {
  const { t } = useI18n();
  const dialogs = useDialogs();

  /** Returns "none" (no conflict), "replace", "pause" or null (cancelled). */
  const conflictChoice = async (patientId: string, dietId: string | null, start: string | null, end: string | null): Promise<Resolve | null> => {
    const mine = await api.get<PatientDietRow[]>(`/api/patients/${patientId}/diets`);
    const b0 = start || "0000-01-01", b1 = end || "9999-12-31";
    const olds = mine.filter((d) => d.status === "active" && d.id !== dietId
      && (d.start_date || "0000-01-01") <= b1 && b0 <= (d.end_date || "9999-12-31"));
    if (!olds.length) return "none";
    const names = olds.map((d) => `«${d.name}»`).join(", ");
    const r = await dialogs.open<Resolve | null>(t("conflict_title"), (close) => (
      <>
        <div className="alert warn">{t("conflict_text", { names })}</div>
        <p><b>{t("conflict_replace")}</b>: {t("conflict_replace_help")}</p>
        <p><b>{t("conflict_pause")}</b>: {t("conflict_pause_help")}</p>
        <div className="actions">
          <button className="btn" onClick={() => close(null)}>{t("cancel")}</button>
          <button className="btn" onClick={() => close("pause")}>{t("conflict_pause")}</button>
          <button className="btn primary" onClick={() => close("replace")}>{t("conflict_replace")}</button>
        </div>
      </>
    ), { sticky: true });
    return r ?? null;
  };

  /** Creates an empty diet (optionally assigned to a patient) and returns its id. */
  const createDiet = async (patientId: string | null): Promise<string | null> => {
    const r = await dialogs.run(() => api.post<Diet>("/api/diets", {
      name: t("new_diet_name"), patient_id: null,
      meals: [{ id: "m1", name: t("meal_breakfast"), time: "08:00", options: [{ label: "A", items: [{ name: "", qty: null }] }] }],
    }));
    if (!r) return null;
    if (patientId) {
      const start = D.today();
      const c = await conflictChoice(patientId, r.id, start, null);
      if (c !== null) {
        await dialogs.run(() => api.post(`/api/diets/${r.id}/assign`, {
          patient_id: patientId, start_date: start, status: "active", resolve: c === "none" ? null : c }));
      }
    }
    return r.id;
  };

  /** Opens the assignment dialog for `diet`; resolves true if something was assigned. */
  const assignDialog = (diet: { id: string; name: string; patient_id: string | null }, pats: PatientListRow[], fixedPatient?: string) =>
    dialogs.open<boolean>(`${t("assign_diet")}: ${diet.name}`, (close) => (
      <AssignForm diet={diet} pats={pats} fixed={fixedPatient} close={close} conflictChoice={conflictChoice} />
    )).then((v) => !!v);

  return { conflictChoice, createDiet, assignDialog };
}

function AssignForm({ diet, pats, fixed, close, conflictChoice }: {
  diet: { id: string; patient_id: string | null }; pats: PatientListRow[]; fixed?: string; close: (v?: boolean) => void;
  conflictChoice: (p: string, d: string | null, s: string | null, e: string | null) => Promise<Resolve | null>;
}) {
  const { t } = useI18n();
  const { toast, errText } = useDialogs();
  const confirmHealth = useHealthConfirm();
  const [pid, setPid] = useState(fixed ?? diet.patient_id ?? pats[0]?.id ?? "");
  const [start, setStart] = useState(D.today());
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"copy" | "move">("copy");
  const submit = async () => {
    if (!pid) return;
    const pt = pats.find((p) => p.id === pid);
    if (pt && !(await confirmHealth(pt.full_name, pt, t("assign")))) return;
    try {
      const c = await conflictChoice(pid, mode === "move" ? diet.id : null, start || null, end || null);
      if (c === null) return;
      const payload = { patient_id: pid, start_date: start || null, end_date: end || null, resolve: c === "none" ? null : c };
      if (mode === "copy") await api.post(`/api/diets/${diet.id}/copy`, payload);
      else await api.post(`/api/diets/${diet.id}/assign`, { ...payload, status: "active" });
      toast(c === "pause" ? t("assigned_paused") : t("saved"));
      close(true);
    } catch (e) { toast(errText(e), true); }
  };
  return (
    <>
      <div className="col">
        {pats.find((p) => p.id === pid) && <HealthBanner name={pats.find((p) => p.id === pid)!.full_name} info={pats.find((p) => p.id === pid)} />}
        <Field label={t("patient")}>
          <select value={pid} disabled={!!fixed} onChange={(e) => setPid(e.target.value)}>
            {pats.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label={t("valid_from")}><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t("valid_to_opt")}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label={t("assign_mode")}>
          <select value={mode} onChange={(e) => setMode(e.target.value as "copy" | "move")}>
            <option value="copy">{t("assign_copy")}</option><option value="move">{t("assign_move")}</option>
          </select>
        </Field>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => close(false)}>{t("cancel")}</button>
        <button className="btn primary" onClick={() => void submit()}>{t("assign")}</button>
      </div>
    </>
  );
}
