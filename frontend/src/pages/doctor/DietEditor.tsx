import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Field, Spinner } from "../../components/Common";
import { useDialogs } from "../../components/Dialogs";
import { Icon } from "../../components/Icon";
import { HealthBanner, useHealthConfirm } from "../../components/Health";
import { useI18n } from "../../i18n";
import { usePageTitle } from "../../layout/Title";
import { uid } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { PlanView } from "../../shared/Plan";
import type { DItem, DMeal, DOption, Diet, Group, Member, PatientListRow } from "../../types";

const UNITS = ["g", "ml", "pz", "cl", "cucchiaio", "cucchiaino", "fetta", "piatto", "porzione", "tazza"];
type Tab = "meals" | "groups" | "notes" | "preview";

const newItem = (): DItem => ({ id: uid(), name: "", qty: null, unit: "g", qty_text: "", group_id: null, note: "", max_per_week: null });
const numOrNull = (v: string) => (v === "" ? null : parseFloat(v));

function Move({ onUp, onDown, onDel }: { onUp: () => void; onDown: () => void; onDel: () => void }) {
  const { t } = useI18n();
  return (
    <span className="nowrap">
      <button className="iconbtn" type="button" title={t("move_up")} onClick={onUp}><Icon name="up" size={18} /></button>
      <button className="iconbtn" type="button" title={t("move_down")} onClick={onDown}><Icon name="down" size={18} /></button>
      <button className="iconbtn" type="button" title={t("delete")} onClick={onDel}><Icon name="trash" size={18} /></button>
    </span>
  );
}

function moveIn<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const c = arr.slice();
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

export function DietEditorPage() {
  const { t, lang } = useI18n();
  const { id = "" } = useParams();
  const { run, confirm, toast } = useDialogs();
  const confirmHealth = useHealthConfirm();
  const loaded = useAsync(async () => {
    const [d, pats] = await Promise.all([api.get<Diet>(`/api/diets/${id}`), api.get<PatientListRow[]>("/api/patients")]);
    return { d, pats };
  }, [id]);
  const [doc, setDoc] = useState<Diet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("meals");
  usePageTitle(doc?.name ?? t("nav_diets"));

  useEffect(() => { if (loaded.data) { setDoc(loaded.data.d); setDirty(false); } }, [loaded.data]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (loaded.error && !loaded.data) return <div className="alert danger">{t("err_not_found")}</div>;
  if (!doc || !loaded.data) return <Spinner />;
  const pats = loaded.data.pats;
  const patient = pats.find((p) => p.id === doc.patient_id);

  /** Applies a mutation to a deep copy of the document. */
  const edit = (fn: (d: Diet) => void) => {
    setDoc((cur) => { const n = structuredClone(cur!); fn(n); return n; });
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    if (doc.meals.some((m) => !m.name.trim())) { toast(t("err_meal_name"), true); return false; }
    // allergies / intolerances / conditions: the doctor must acknowledge them on every save
    if (patient && !(await confirmHealth(patient.full_name, patient, t("save")))) return false;
    const clean = structuredClone(doc);
    for (const m of clean.meals) {
      m.required = m.kind === "meal" ? m.required : false;
      for (const o of m.options) o.items = o.items.filter((i) => i.name.trim());
    }
    clean.groups = clean.groups.filter((g) => g.name.trim()).map((g) => ({ ...g, members: g.members.filter((x) => x.name.trim()) }));
    clean.conversion = clean.conversion.filter((c) => c.name.trim());
    const r = await run(() => api.put<Diet>(`/api/diets/${doc.id}`, clean), t("saved"));
    if (r) { setDoc(r); setDirty(false); return true; }
    return false;
  };

  const groupOptions = doc.groups.map((g) => ({ id: g.id, label: g.name + (g.ref_qty ? ` ${g.ref_qty} ${g.ref_unit}` : "") }));

  // ---------------------------------------------------------------- meals tab
  const mealsTab = (
    <div>
      {doc.meals.map((m, mi) => (
        <details key={m.id} className="editor-box meal-box" open>
          <summary>
            <b>{m.name || t("meal")}</b>
            {m.same_as_meal_id && <span className="muted small"> ({t("same_as_short")})</span>}
            {m.kind === "extras" && <span className="chip info" style={{ marginLeft: ".4rem" }}>{t("optional")}</span>}
          </summary>
          <div className="row mt">
            <div className="grow" style={{ minWidth: 180 }}>
              <Field label={t("f_name")}><input type="text" value={m.name} placeholder={t("meal_name_ph")}
                onChange={(e) => edit((d) => { d.meals[mi].name = e.target.value; })} /></Field>
            </div>
            <Field label={t("f_time")}><input type="time" value={m.time || ""} onChange={(e) => edit((d) => { d.meals[mi].time = e.target.value; })} /></Field>
            <Field label={t("f_meal_kind")}>
              <select value={m.kind} onChange={(e) => edit((d) => { d.meals[mi].kind = e.target.value as DMeal["kind"]; })}>
                <option value="meal">{t("kind_meal")}</option><option value="extras">{t("kind_extras")}</option>
              </select>
            </Field>
            <Field label={t("f_same_as")}>
              <select value={m.same_as_meal_id ?? ""} onChange={(e) => edit((d) => { d.meals[mi].same_as_meal_id = e.target.value || null; })}>
                <option value="">—</option>
                {doc.meals.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.name || "?"}</option>)}
              </select>
            </Field>
            <label className="row" style={{ alignSelf: "flex-end", minHeight: 38 }}>
              <input type="checkbox" checked={m.required && m.kind === "meal"} disabled={m.kind === "extras"}
                onChange={(e) => edit((d) => { d.meals[mi].required = e.target.checked; })} />{t("f_required")}
            </label>
            <div style={{ alignSelf: "flex-end" }}>
              <Move onUp={() => edit((d) => { d.meals = moveIn(d.meals, mi, -1); })} onDown={() => edit((d) => { d.meals = moveIn(d.meals, mi, 1); })}
                onDel={() => edit((d) => { d.meals.splice(mi, 1); })} />
            </div>
          </div>
          <Field label={t("f_note")}><input type="text" value={m.note} placeholder={t("meal_note_ph")}
            onChange={(e) => edit((d) => { d.meals[mi].note = e.target.value; })} /></Field>
          {m.options.map((o, oi) => (
            <OptionBox key={o.id} o={o} groups={groupOptions}
              change={(fn) => edit((d) => fn(d.meals[mi].options[oi]))}
              up={() => edit((d) => { d.meals[mi].options = moveIn(d.meals[mi].options, oi, -1); })}
              down={() => edit((d) => { d.meals[mi].options = moveIn(d.meals[mi].options, oi, 1); })}
              del={() => edit((d) => { d.meals[mi].options.splice(oi, 1); })} />
          ))}
          <div className="mt">
            <button className="btn sm" type="button" onClick={() => edit((d) => {
              const label = String.fromCharCode(65 + d.meals[mi].options.filter((o) => o.kind === "choice").length);
              d.meals[mi].options.push({ id: uid(), label: m.kind === "extras" ? "" : label, course: "", kind: "choice",
                max_per_week: null, note: "", items: [newItem()] });
            })}><Icon name="plus" />{t("add_option")}</button>
          </div>
        </details>
      ))}
      <div className="mt">
        <button className="btn" type="button" onClick={() => edit((d) => {
          d.meals.push({ id: uid(), name: "", time: "", kind: "meal", required: true, same_as_meal_id: null, note: "", options: [] });
        })}><Icon name="plus" />{t("add_meal")}</button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- groups tab
  const groupsTab = (
    <div>
      <p className="muted">{t("groups_help")}</p>
      {doc.groups.map((g, gi) => (
        <details key={g.id} className="editor-box" open>
          <summary>
            <b>{g.name || t("group")}</b>{g.ref_qty ? <span className="muted"> {g.ref_qty} {g.ref_unit}</span> : null}
            <span className="muted small"> · {t("n_members", { n: g.members.length })}</span>
          </summary>
          <div className="row mt">
            <div className="grow" style={{ minWidth: 200 }}>
              <Field label={t("f_name")}><input type="text" value={g.name} placeholder={t("group_name_ph")}
                onChange={(e) => edit((d) => { d.groups[gi].name = e.target.value; })} /></Field>
            </div>
            <Field label={t("ref_qty")}><input type="number" step="any" min="0" style={{ width: 100 }} value={g.ref_qty ?? ""}
              onChange={(e) => edit((d) => { d.groups[gi].ref_qty = numOrNull(e.target.value); })} /></Field>
            <Field label={t("unit")}><UnitInput value={g.ref_unit} onChange={(v) => edit((d) => { d.groups[gi].ref_unit = v; })} /></Field>
            <div style={{ alignSelf: "flex-end" }}>
              <Move onUp={() => edit((d) => { d.groups = moveIn(d.groups, gi, -1); })} onDown={() => edit((d) => { d.groups = moveIn(d.groups, gi, 1); })}
                onDel={() => edit((d) => { d.groups.splice(gi, 1); })} />
            </div>
          </div>
          <Field label={t("f_note")}><input type="text" value={g.note} placeholder={t("group_note_ph")}
            onChange={(e) => edit((d) => { d.groups[gi].note = e.target.value; })} /></Field>
          <div className="mt">
            <div className="erow members erow-head">
              {["name", "qty", "unit", "qty_text", "note", "max_week"].map((k) => <span key={k}>{t("f_" + k)}</span>)}<span />
            </div>
            {g.members.map((m, mi) => (
              <MemberRow key={m.id} m={m}
                change={(fn) => edit((d) => fn(d.groups[gi].members[mi]))}
                up={() => edit((d) => { d.groups[gi].members = moveIn(d.groups[gi].members, mi, -1); })}
                down={() => edit((d) => { d.groups[gi].members = moveIn(d.groups[gi].members, mi, 1); })}
                del={() => edit((d) => { d.groups[gi].members.splice(mi, 1); })} />
            ))}
          </div>
          <button className="btn sm" type="button" onClick={() => edit((d) => {
            d.groups[gi].members.push({ id: uid(), name: "", qty: null, unit: g.ref_unit || "g", qty_text: "", note: "", max_per_week: null });
          })}><Icon name="plus" />{t("add_member")}</button>
        </details>
      ))}
      <div className="mt">
        <button className="btn" type="button" onClick={() => edit((d) => {
          d.groups.push({ id: uid(), name: "", ref_qty: null, ref_unit: "g", note: "", members: [] } as Group);
        })}><Icon name="plus" />{t("add_group")}</button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------- notes tab
  const notesTab = (
    <div>
      <div className="card">
        <h3>{t("general_notes")}</h3>
        <p className="small muted">{t("notes_help")}</p>
        <textarea rows={7} value={doc.notes} onChange={(e) => edit((d) => { d.notes = e.target.value; })} />
      </div>
      <div className="card">
        <h3>{t("conversion")}</h3>
        <p className="small muted">{t("conversion_help")}</p>
        {doc.conversion.length > 0 && (
          <div className="row small muted" style={{ marginBottom: ".2rem" }}>
            <span style={{ flex: "2 1 160px" }}>{t("type")}</span>
            <span style={{ flex: "1 1 100px" }}>{t("raw")}</span>
            <span style={{ flex: "1 1 100px" }}>{t("cooked")}</span>
            <span style={{ width: 38 }} />
          </div>
        )}
        {doc.conversion.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: ".4rem", flexWrap: "nowrap" }}>
            <input type="text" placeholder={t("f_name")} aria-label={t("type")} style={{ flex: "2 1 160px" }} value={c.name}
              onChange={(e) => edit((d) => { d.conversion[i].name = e.target.value; })} />
            <input type="text" placeholder="120 g" aria-label={t("raw")} style={{ flex: "1 1 100px" }} value={c.raw}
              onChange={(e) => edit((d) => { d.conversion[i].raw = e.target.value; })} />
            <input type="text" placeholder="300 g" aria-label={t("cooked")} style={{ flex: "1 1 100px" }} value={c.cooked ?? ""}
              onChange={(e) => edit((d) => { d.conversion[i].cooked = e.target.value; })} />
            <button className="iconbtn" type="button" onClick={() => edit((d) => { d.conversion.splice(i, 1); })}><Icon name="trash" /></button>
          </div>
        ))}
        <button className="btn sm" type="button" onClick={() => edit((d) => { d.conversion.push({ name: "", raw: "", cooked: "" }); })}><Icon name="plus" />{t("add_row")}</button>
      </div>
    </div>
  );

  const tabs: [Tab, string][] = [["meals", "tab_meals"], ["groups", "tab_groups"], ["notes", "tab_notes"], ["preview", "tab_preview"]];
  return (
    <div>
      <div className="row mb"><Link className="btn sm" to="/diets"><Icon name="back" />{t("diets")}</Link></div>
      {patient && <HealthBanner name={patient.full_name} info={patient} />}
      <div className="card mb">
        <div className="form-grid">
          <Field label={t("diet_name")} req><input type="text" maxLength={200} value={doc.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} /></Field>
          <Field label={t("patient")}>
            <select value={doc.patient_id ?? ""} onChange={(e) => edit((d) => { d.patient_id = e.target.value || null; })}>
              <option value="">{t("template_unassigned")}</option>
              {pats.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
          <Field label={t("valid_from")}><input type="date" value={doc.start_date ?? ""} onChange={(e) => edit((d) => { d.start_date = e.target.value || null; })} /></Field>
          <Field label={t("valid_to_opt")}><input type="date" value={doc.end_date ?? ""} onChange={(e) => edit((d) => { d.end_date = e.target.value || null; })} /></Field>
          <Field label={t("status")}>
            <select value={doc.status} onChange={(e) => edit((d) => { d.status = e.target.value as Diet["status"]; })}>
              <option value="active">{t("status_active")}</option><option value="paused">{t("status_paused")}</option><option value="archived">{t("status_archived")}</option>
            </select>
          </Field>
          <Field label={t("description")} wide><input type="text" value={doc.description} onChange={(e) => edit((d) => { d.description = e.target.value; })} /></Field>
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={k === tab ? "active" : ""} type="button" onClick={() => setTab(k)}>{t(l)}</button>)}
      </div>
      {tab === "meals" ? mealsTab : tab === "groups" ? groupsTab : tab === "notes" ? notesTab : <PlanView doc={doc} />}
      <div className="editor-bar">
        <button className="btn primary" onClick={() => void save()}><Icon name="check" />{t("save")}</button>
        {dirty && <span className="chip warn">{t("unsaved")}</span>}
        <span className="grow" />
        <button className="btn" onClick={async () => {
          if (dirty) {
            if (!(await confirm(t("save_before_pdf")))) return;
            if (!(await save())) return;
          }
          await run(() => api.download(`/api/diets/${doc.id}/pdf?lang=${lang}`, "piano.pdf"));
        }}><Icon name="download" />{t("download_pdf")}</button>
        <Link className="btn" to={doc.patient_id ? `/patients/${doc.patient_id}/dieta` : "/diets"}>{t("close")}</Link>
      </div>
    </div>
  );
}

function UnitInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input type="text" list="np-units" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="np-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </>
  );
}

function OptionBox({ o, groups, change, up, down, del }: {
  o: DOption; groups: { id: string; label: string }[]; change: (fn: (o: DOption) => void) => void;
  up: () => void; down: () => void; del: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="editor-box opt-box">
      <div className="row">
        <Field label={t("f_label")}><input type="text" placeholder="A" style={{ width: 80 }} value={o.label} onChange={(e) => change((x) => { x.label = e.target.value; })} /></Field>
        <Field label={t("f_course")}><input type="text" placeholder="I / II" style={{ width: 90 }} value={o.course} onChange={(e) => change((x) => { x.course = e.target.value; })} /></Field>
        <Field label={t("f_kind")}>
          <select value={o.kind} onChange={(e) => change((x) => { x.kind = e.target.value as DOption["kind"]; })}>
            <option value="choice">{t("opt_choice")}</option><option value="addon">{t("opt_addon")}</option>
          </select>
        </Field>
        <Field label={t("f_max_week")}><input type="number" step="1" min="0" style={{ width: 80 }} placeholder="–" value={o.max_per_week ?? ""}
          onChange={(e) => change((x) => { x.max_per_week = numOrNull(e.target.value); })} /></Field>
        <div className="grow" style={{ minWidth: 160 }}>
          <Field label={t("f_note")}><input type="text" value={o.note} onChange={(e) => change((x) => { x.note = e.target.value; })} /></Field>
        </div>
        <div style={{ alignSelf: "flex-end" }}><Move onUp={up} onDown={down} onDel={del} /></div>
      </div>
      <div className="mt">
        <div className="erow erow-head">
          {["name", "qty", "unit", "qty_text", "substitutable_with", "note", "max_week"].map((k) => <span key={k}>{t("f_" + k)}</span>)}<span />
        </div>
        {o.items.map((it, i) => (
          <div className="erow" key={it.id}>
            <input type="text" aria-label={t("f_name")} placeholder={t("f_name")} value={it.name} onChange={(e) => change((x) => { x.items[i].name = e.target.value; })} />
            <input type="number" step="any" min="0" aria-label={t("f_qty")} placeholder={t("f_qty")} value={it.qty ?? ""} onChange={(e) => change((x) => { x.items[i].qty = numOrNull(e.target.value); })} />
            <UnitInput value={it.unit} onChange={(v) => change((x) => { x.items[i].unit = v; })} />
            <input type="text" aria-label={t("f_qty_text")} placeholder={t("f_qty_text")} value={it.qty_text} onChange={(e) => change((x) => { x.items[i].qty_text = e.target.value; })} />
            <select value={it.group_id ?? ""} onChange={(e) => change((x) => { x.items[i].group_id = e.target.value || null; })}>
              <option value="">{t("not_substitutable")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <input type="text" aria-label={t("f_note")} placeholder={t("f_note")} value={it.note} onChange={(e) => change((x) => { x.items[i].note = e.target.value; })} />
            <input type="number" step="1" min="0" aria-label={t("f_max_week")} placeholder="–" value={it.max_per_week ?? ""} onChange={(e) => change((x) => { x.items[i].max_per_week = numOrNull(e.target.value); })} />
            <Move onUp={() => change((x) => { x.items = moveIn(x.items, i, -1); })} onDown={() => change((x) => { x.items = moveIn(x.items, i, 1); })}
              onDel={() => change((x) => { x.items.splice(i, 1); })} />
          </div>
        ))}
      </div>
      <button className="btn sm" type="button" onClick={() => change((x) => { x.items.push(newItem()); })}><Icon name="plus" />{t("add_item")}</button>
    </div>
  );
}

function MemberRow({ m, change, up, down, del }: {
  m: Member; change: (fn: (m: Member) => void) => void; up: () => void; down: () => void; del: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="erow members">
      <input type="text" placeholder={t("f_name")} value={m.name} onChange={(e) => change((x) => { x.name = e.target.value; })} />
      <input type="number" step="any" min="0" placeholder={t("f_qty")} value={m.qty ?? ""} onChange={(e) => change((x) => { x.qty = numOrNull(e.target.value); })} />
      <UnitInput value={m.unit} onChange={(v) => change((x) => { x.unit = v; })} />
      <input type="text" placeholder={t("f_qty_text")} value={m.qty_text} onChange={(e) => change((x) => { x.qty_text = e.target.value; })} />
      <input type="text" placeholder={t("f_note")} value={m.note} onChange={(e) => change((x) => { x.note = e.target.value; })} />
      <input type="number" step="1" min="0" placeholder="–" value={m.max_per_week ?? ""} onChange={(e) => change((x) => { x.max_per_week = numOrNull(e.target.value); })} />
      <Move onUp={up} onDown={down} onDel={del} />
    </div>
  );
}
